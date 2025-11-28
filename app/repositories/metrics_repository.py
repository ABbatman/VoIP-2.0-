from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
import base64
import asyncio
from datetime import datetime, timedelta

from sqlalchemy import delete, insert, select, update, union_all, literal
from sqlalchemy.sql import and_

from app.db.base import get_session
from app.models.metrics_table import metrics
from app.models.aggregation_table import sonus_aggregation_new
from app.utils.cache import Cache


class MetricsRepository:
    """Data access for metrics: read from aggregation, write to metrics table."""
    
    # Cursor cache for pagination: key -> (result_tuple, timestamp)
    _cursor_cache: Dict[str, Tuple[Any, float]] = {}
    _cursor_cache_ttl = 300  # 5 minutes
    
    def __init__(self):
        self._cache = Cache()
    async def get_metrics(self, filters: Dict[str, Any], limit: int) -> List[Dict[str, Any]]:
        """Return non-paginated rows for compatibility with legacy computations."""
        conditions = []
        filters = filters or {}

        # Equality / pattern filters
        for key in ("customer", "supplier", "destination"):
            value = filters.get(key)
            # Skip None and empty strings to match previous behavior
            if value is None or (isinstance(value, str) and value == ""):
                continue
            col = sonus_aggregation_new.c[key]
            if isinstance(value, str) and ("%" in value or "_" in value):
                conditions.append(col.ilike(value))
            else:
                conditions.append(col == value)

        # Time range
        time_from = filters.get("time_from")
        time_to = filters.get("time_to")
        if time_from is not None and time_to is not None:
            conditions.append(sonus_aggregation_new.c.time.between(time_from, time_to))

        # Read from the existing aggregation source table for metrics data
        source = sonus_aggregation_new
        stmt = select(
            source.c.time,
            source.c.customer,
            source.c.supplier,
            source.c.destination,
            source.c.seconds,
            source.c.start_nuber,
            source.c.start_attempt,
            source.c.start_uniq_attempt,
            source.c.answer_time,
            source.c.pdd,
        ).order_by(source.c.time.asc())
        if conditions:
            stmt = stmt.where(and_(*conditions))
        if limit:
            stmt = stmt.limit(limit)

        async with get_session() as session:
            result = await session.execute(stmt)
            rows = result.mappings().all()
            return [dict(r) for r in rows]

    async def get_metrics_with_comparison(
        self,
        filters: Dict[str, Any],
        time_from: datetime,
        time_to: datetime,
        y_time_from: datetime,
        y_time_to: datetime,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Fetch metrics for today and yesterday in a single query using UNION.
        Returns (today_rows, yesterday_rows) tuple.
        
        Optimization: Single DB round-trip instead of two separate queries.
        """
        source = sonus_aggregation_new
        filters = filters or {}
        
        # Build base conditions (excluding time)
        base_conditions = []
        for key in ("customer", "supplier", "destination"):
            value = filters.get(key)
            if value is None or (isinstance(value, str) and value == ""):
                continue
            col = source.c[key]
            if isinstance(value, str) and ("%" in value or "_" in value):
                base_conditions.append(col.ilike(value))
            else:
                base_conditions.append(col == value)
        
        # Today query with period marker
        today_conditions = base_conditions + [source.c.time.between(time_from, time_to)]
        today_stmt = select(
            source.c.time,
            source.c.customer,
            source.c.supplier,
            source.c.destination,
            source.c.seconds,
            source.c.start_nuber,
            source.c.start_attempt,
            source.c.start_uniq_attempt,
            source.c.answer_time,
            source.c.pdd,
            literal('today').label('_period')
        ).where(and_(*today_conditions)) if today_conditions else select(
            source.c.time,
            source.c.customer,
            source.c.supplier,
            source.c.destination,
            source.c.seconds,
            source.c.start_nuber,
            source.c.start_attempt,
            source.c.start_uniq_attempt,
            source.c.answer_time,
            source.c.pdd,
            literal('today').label('_period')
        ).where(source.c.time.between(time_from, time_to))
        
        # Yesterday query with period marker
        yesterday_conditions = base_conditions + [source.c.time.between(y_time_from, y_time_to)]
        yesterday_stmt = select(
            source.c.time,
            source.c.customer,
            source.c.supplier,
            source.c.destination,
            source.c.seconds,
            source.c.start_nuber,
            source.c.start_attempt,
            source.c.start_uniq_attempt,
            source.c.answer_time,
            source.c.pdd,
            literal('yesterday').label('_period')
        ).where(and_(*yesterday_conditions)) if yesterday_conditions else select(
            source.c.time,
            source.c.customer,
            source.c.supplier,
            source.c.destination,
            source.c.seconds,
            source.c.start_nuber,
            source.c.start_attempt,
            source.c.start_uniq_attempt,
            source.c.answer_time,
            source.c.pdd,
            literal('yesterday').label('_period')
        ).where(source.c.time.between(y_time_from, y_time_to))
        
        # Combine with UNION ALL
        combined_stmt = union_all(today_stmt, yesterday_stmt).order_by('time')
        
        async with get_session() as session:
            result = await session.execute(combined_stmt)
            rows = [dict(r) for r in result.mappings().all()]
        
        # Split by period
        today_rows = []
        yesterday_rows = []
        for row in rows:
            period = row.pop('_period', 'today')
            if period == 'today':
                today_rows.append(row)
            else:
                yesterday_rows.append(row)
        
        return today_rows, yesterday_rows

    async def get_metrics_parallel(
        self,
        filters: Dict[str, Any],
        time_from: datetime,
        time_to: datetime,
        y_time_from: datetime,
        y_time_to: datetime,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Alternative: Fetch today and yesterday in parallel.
        Useful when UNION is slower than parallel queries.
        """
        today_filters = {**filters, "time_from": time_from, "time_to": time_to}
        yesterday_filters = {**filters, "time_from": y_time_from, "time_to": y_time_to}
        
        # Execute both queries in parallel
        today_task = asyncio.create_task(self.get_metrics(today_filters, limit=0))
        yesterday_task = asyncio.create_task(self.get_metrics(yesterday_filters, limit=0))
        
        today_rows, yesterday_rows = await asyncio.gather(today_task, yesterday_task)
        return today_rows, yesterday_rows

    async def insert_metric(self, data: Dict[str, Any]) -> int:
        """Insert into writable metrics table and invalidate API caches."""
        stmt = insert(metrics).returning(metrics.c.id)
        async with get_session() as session:
            result = await session.execute(stmt, [data])
            new_id = result.scalar_one()
            await session.commit()
        # Invalidate API caches after mutation
        self._cache.invalidate_prefix("api:metrics")
        return int(new_id)

    async def update_metric(self, id: int, data: Dict[str, Any]) -> None:
        """Update metric by id and invalidate API caches."""
        stmt = (
            update(metrics)
            .where(metrics.c.id == id)
            .values(**data)
        )
        async with get_session() as session:
            await session.execute(stmt)
            await session.commit()
        self._cache.invalidate_prefix("api:metrics")

    async def delete_metric(self, id: int) -> None:
        """Delete metric by id and invalidate API caches."""
        stmt = delete(metrics).where(metrics.c.id == id)
        async with get_session() as session:
            await session.execute(stmt)
            await session.commit()
        self._cache.invalidate_prefix("api:metrics")

    # Cursor pagination helpers
    @staticmethod
    def _encode_cursor(dt: datetime) -> str:
        return base64.urlsafe_b64encode(dt.isoformat().encode()).decode()

    @staticmethod
    def _decode_cursor(cursor: str) -> datetime:
        return datetime.fromisoformat(base64.urlsafe_b64decode(cursor.encode()).decode())

    def _build_cache_key(self, prefix: str, filters: Dict[str, Any], limit: int, cursor: Optional[str]) -> str:
        """Build cache key for pagination."""
        import json
        import hashlib
        key_data = {
            "filters": {k: str(v) for k, v in (filters or {}).items() if v is not None},
            "limit": limit,
            "cursor": cursor or ""
        }
        raw = json.dumps(key_data, sort_keys=True)
        digest = hashlib.md5(raw.encode()).hexdigest()[:16]
        return f"{prefix}:{digest}"
    
    def _get_cursor_cache(self, key: str) -> Optional[Tuple[List[Dict[str, Any]], Optional[str], Optional[str]]]:
        """Get cached cursor result if not expired."""
        import time
        if key in self._cursor_cache:
            data, timestamp = self._cursor_cache[key]
            if time.time() - timestamp < self._cursor_cache_ttl:
                return data
            else:
                del self._cursor_cache[key]
        return None
    
    def _set_cursor_cache(self, key: str, data: Tuple[List[Dict[str, Any]], Optional[str], Optional[str]]) -> None:
        """Store cursor result in cache."""
        import time
        # Cleanup old entries periodically
        if len(self._cursor_cache) > 1000:
            now = time.time()
            expired = [k for k, (_, ts) in self._cursor_cache.items() if now - ts > self._cursor_cache_ttl]
            for k in expired:
                del self._cursor_cache[k]
        self._cursor_cache[key] = (data, time.time())

    async def get_metrics_page(self, filters: Dict[str, Any], limit: int, next_cursor: Optional[str], prev_cursor: Optional[str]) -> Tuple[List[Dict[str, Any]], Optional[str], Optional[str]]:
        """Cursor pagination by time DESC; supports next and prev cursors with caching."""
        
        # Try cache first
        cache_key = self._build_cache_key("cursor", filters, limit, next_cursor or prev_cursor)
        cached = self._get_cursor_cache(cache_key)
        if cached is not None:
            return cached
        
        source = sonus_aggregation_new

        conditions = []
        filters = filters or {}

        for key in ("customer", "supplier", "destination"):
            value = filters.get(key)
            if value is None or (isinstance(value, str) and value == ""):
                continue
            col = source.c[key]
            if isinstance(value, str) and ("%" in value or "_" in value):
                conditions.append(col.ilike(value))
            else:
                conditions.append(col == value)

        time_from = filters.get("time_from")
        time_to = filters.get("time_to")
        if time_from is not None and time_to is not None:
            conditions.append(source.c.time.between(time_from, time_to))

        stmt = select(
            source.c.time,
            source.c.customer,
            source.c.supplier,
            source.c.destination,
            source.c.seconds,
            source.c.start_nuber,
            source.c.start_attempt,
            source.c.start_uniq_attempt,
            source.c.answer_time,
            source.c.pdd,
        )

        # Apply cursor by time
        going_backwards = False
        if next_cursor:
            dt = self._decode_cursor(next_cursor)
            conditions.append(source.c.time < dt)
        elif prev_cursor:
            dt = self._decode_cursor(prev_cursor)
            conditions.append(source.c.time > dt)
            going_backwards = True

        if conditions:
            stmt = stmt.where(and_(*conditions))

        # Order by time DESC for forward pages; ASC when going backwards, then reverse client-side
        if going_backwards:
            stmt = stmt.order_by(source.c.time.asc()).limit(limit)
        else:
            stmt = stmt.order_by(source.c.time.desc()).limit(limit)

        async with get_session() as session:
            result = await session.execute(stmt)
            rows = [dict(r) for r in result.mappings().all()]

        # If we fetched backwards, reverse to return DESC order
        if going_backwards:
            rows.reverse()

        next_c = self._encode_cursor(rows[-1]["time"]) if rows else None
        prev_c = self._encode_cursor(rows[0]["time"]) if rows else None
        
        # Cache result
        result_tuple = (rows, next_c, prev_c)
        self._set_cursor_cache(cache_key, result_tuple)
        
        return result_tuple


