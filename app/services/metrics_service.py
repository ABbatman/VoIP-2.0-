# app/services/metrics_service.py

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Tuple, List

from app.utils.metrics import calculate_metrics
from app.utils.grouped import calculate_grouped_metrics, calculate_hourly_metrics, calculate_5min_metrics
from app.services.labels_service import build_labels  # use backend labels
from app.utils.logger import log_info
from app.repositories.metrics_repository import MetricsRepository


class MetricsService:
    """Business logic for computing and comparing metrics."""

    def __init__(self, repository: MetricsRepository):
        # Store repository dependency
        self._repo = repository

    async def get_full_metrics_report(
        self,
        customer: Optional[str],
        supplier: Optional[str],
        destination: Optional[str],
        time_from: datetime,
        time_to: datetime,
        reverse: bool = False,
        granularity: str = "both",
    ) -> Dict[str, Any]:
        """Compute totals, grouped and hourly metrics with YoY (yesterday) deltas."""
        log_info(" Computing full metrics report...")

        rows_today, rows_yesterday = await self._fetch_comparison_data(
            customer, supplier, destination, time_from, time_to
        )

        # Totals for today/yesterday
        today_metrics = calculate_metrics(rows_today)
        yesterday_metrics = calculate_metrics(rows_yesterday)

        # Grouped by main/peer/destination
        grouped_today = calculate_grouped_metrics(rows_today, reverse=reverse)
        grouped_yesterday = calculate_grouped_metrics(rows_yesterday, reverse=reverse)

        # Normalize granularity
        g = (granularity or "both").lower()
        if g not in ("5m", "1h", "both"):
            g = "both"

        # Hourly per (main, peer, destination, hour) — compute only if requested
        if g in ("1h", "both"):
            hourly_today = calculate_hourly_metrics(rows_today, reverse=reverse)
            hourly_yesterday = calculate_hourly_metrics(rows_yesterday, reverse=reverse)
        else:
            hourly_today = []
            hourly_yesterday = []

        # Five-minute per (main, peer, destination, 5m slot) — compute only if requested
        if g in ("5m", "both"):
            five_today = calculate_5min_metrics(rows_today, reverse=reverse)
            five_yesterday = calculate_5min_metrics(rows_yesterday, reverse=reverse)
        else:
            five_today = []
            five_yesterday = []

        # Enrich with yesterday values and deltas
        main_rows = self._enrich_rows(
            grouped_today.get("main_rows", []),
            grouped_yesterday.get("main_rows", []),
            key_fields=["main", "destination"],
        )
        peer_rows = self._enrich_rows(
            grouped_today.get("peer_rows", []),
            grouped_yesterday.get("peer_rows", []),
            key_fields=["main", "peer", "destination"],
        )
        hourly_rows = self._enrich_rows(
            hourly_today,
            hourly_yesterday,
            key_fields=["main", "peer", "destination", "time"],
            extra_fields=("time",),  # keep full "time" for display
        )

        # Enrich 5-minute rows (key on HH:MM slot, keep full 'time')
        five_min_rows = self._enrich_rows(
            five_today,
            five_yesterday,
            key_fields=["main", "peer", "destination", "time"],
            extra_fields=("time",),
        )

        # Build labels (backend computes; JS only lays out)
        try:
            if g == "5m":
                labels = build_labels(five_today or [], granularity="5m")
            elif g == "1h":
                labels = build_labels(hourly_today or [], granularity="1h")
            else:
                # default to 1h when both requested
                labels = build_labels(hourly_today or [], granularity="1h")
        except Exception:
            labels = {}

        return {
            "today_metrics": today_metrics,
            "yesterday_metrics": yesterday_metrics,
            "main_rows": main_rows,
            "peer_rows": peer_rows,
            "hourly_rows": hourly_rows,
            "five_min_rows": five_min_rows,
            "labels": labels,  # additive field
        }

    async def _fetch_comparison_data(
        self,
        customer: Optional[str],
        supplier: Optional[str],
        destination: Optional[str],
        time_from_dt: datetime,
        time_to_dt: datetime,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Fetch rows for period and same period minus one day.
        Convert inputs to UTC-aware datetimes to match TIMESTAMP WITH TIME ZONE.
        """
        def _to_utc_aware(dt: datetime) -> datetime:
            # If None, pass through
            if dt is None:
                return dt
            # If timezone-aware, convert to UTC
            if dt.tzinfo is not None:
                return dt.astimezone(timezone.utc)
            # If naive, treat as already UTC (inputs are in GMT0)
            return dt.replace(tzinfo=timezone.utc)

        time_from_dt = _to_utc_aware(time_from_dt)
        time_to_dt = _to_utc_aware(time_to_dt)

        # Calculate yesterday's time range in UTC
        y_time_from_dt = _to_utc_aware(time_from_dt - timedelta(days=1))
        y_time_to_dt = _to_utc_aware(time_to_dt - timedelta(days=1))

        rows_today = await self._fetch_with_repository(
            customer, supplier, destination, time_from_dt, time_to_dt
        )
        rows_yesterday = await self._fetch_with_repository(
            customer, supplier, destination, y_time_from_dt, y_time_to_dt
        )
        return rows_today, rows_yesterday

    async def _fetch_with_repository(
        self,
        customer: Optional[str],
        supplier: Optional[str],
        destination: Optional[str],
        time_from: datetime,
        time_to: datetime,
        limit: int = 0,
    ) -> List[Dict[str, Any]]:
        """Thin wrapper to query repository with filters."""
        filters: Dict[str, Any] = {
            "customer": customer,
            "supplier": supplier,
            "destination": destination,
            "time_from": time_from,
            "time_to": time_to,
        }
        return await self._repo.get_metrics(filters, limit=limit)

    def _enrich_rows(
        self,
        today_rows: List[Dict[str, Any]],
        yesterday_rows: List[Dict[str, Any]],
        key_fields: List[str],
        extra_fields: Tuple[str, ...] = (),
    ) -> List[Dict[str, Any]]:
        """Attach yesterday values and percentage deltas to today's rows."""
        yesterday_map = {tuple(r.get(k) for k in key_fields): r for r in yesterday_rows}

        enriched_rows: List[Dict[str, Any]] = []
        metrics_to_compare = ["Min", "ACD", "ASR", "PDD", "ATime", "SCall", "TCall"]

        for today_row in today_rows:
            key = tuple(today_row.get(k) for k in key_fields)
            yesterday_row = yesterday_map.get(key, {})
            combined = {field: today_row.get(field) for field in key_fields}
            # Preserve extra display fields (e.g. full "time" for hourly)
            for f in extra_fields:
                combined[f] = today_row.get(f)

            for metric in metrics_to_compare:
                t_val = today_row.get(metric, 0) or 0
                y_val = yesterday_row.get(metric, 0) or 0
                if y_val == 0:
                    delta = 100.0 if t_val > 0 else 0.0
                else:
                    delta = round(((t_val - y_val) / y_val) * 100, 1)
                combined[metric] = t_val
                combined[f"Y{metric}"] = y_val
                combined[f"{metric}_delta"] = delta

            enriched_rows.append(combined)

        return enriched_rows