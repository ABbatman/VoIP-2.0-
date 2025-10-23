from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
import base64
from datetime import datetime

from sqlalchemy import delete, insert, select, update
from sqlalchemy.sql import and_

from app.db.base import get_session
from app.models.metrics_table import metrics
from app.models.aggregation_table import sonus_aggregation_new
from app.utils.cache import Cache


class MetricsRepository:
    """Data access for metrics: read from aggregation, write to metrics table."""
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

    async def get_metrics_page(self, filters: Dict[str, Any], limit: int, next_cursor: Optional[str], prev_cursor: Optional[str]) -> Tuple[List[Dict[str, Any]], Optional[str], Optional[str]]:
        """Cursor pagination by time DESC; supports next and prev cursors."""
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
        return rows, next_c, prev_c


