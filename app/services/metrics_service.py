# app/services/metrics_service.py

import psycopg2.extras
from datetime import datetime, timedelta

# Import necessary components from our app structure
from app.db.db import get_connection
from app.utils.grouping import build_where_clause
from app.utils.metrics import calculate_metrics
from app.utils.grouped import calculate_grouped_metrics, calculate_hourly_metrics
from app.utils.logger import log_info

class MetricsService:
    """
    Handles all business logic related to fetching, calculating,
    and comparing metrics. It is completely decoupled from the web layer.
    """

    def get_full_metrics_report(self, customer, supplier, destination, time_from, time_to, reverse):
        """
        The main public method of the service. It orchestrates all the steps
        to generate a complete metrics report.
        """
        log_info("🚀 MetricsService: Starting full report generation.")

        # Step 1: Fetch raw data for today and yesterday from the database.
        rows_today, rows_yesterday = self._fetch_comparison_data(
            customer, supplier, destination, time_from, time_to
        )

        # Step 2: Calculate all required metric sets for today.
        today_summary = calculate_metrics(rows_today)
        today_grouped = calculate_grouped_metrics(rows_today, reverse=reverse)
        today_hourly = calculate_hourly_metrics(rows_today, reverse=reverse)

        # Step 3: Calculate all required metric sets for yesterday.
        yesterday_summary = calculate_metrics(rows_yesterday)
        yesterday_grouped = calculate_grouped_metrics(rows_yesterday, reverse=reverse)
        yesterday_hourly = calculate_hourly_metrics(rows_yesterday, reverse=reverse)

        # Step 4: Enrich the data with comparison values (yesterday's data and deltas).
        enriched_main = self._enrich_rows(
            today_rows=today_grouped["main_rows"],
            yesterday_rows=yesterday_grouped["main_rows"],
            key_fields=("main", "destination")
        )
        enriched_peer = self._enrich_rows(
            today_rows=today_grouped["peer_rows"],
            yesterday_rows=yesterday_grouped["peer_rows"],
            key_fields=("main", "peer", "destination")
        )
        enriched_hourly = self._enrich_rows(
            today_rows=today_hourly,
            yesterday_rows=yesterday_hourly,
            key_fields=("main", "peer", "destination", "time")
        )
        
        log_info(f"✅ MetricsService: Report built. Sending {len(enriched_main)} main rows.")

        # Step 5: Assemble the final response dictionary.
        return {
            "today_metrics": today_summary,
            "yesterday_metrics": yesterday_summary,
            "main_rows": enriched_main,
            "peer_rows": enriched_peer,
            "hourly_rows": enriched_hourly,
        }

    def _fetch_comparison_data(self, customer, supplier, destination, time_from_str, time_to_str):
        """
        Fetches data for the specified period and the same period offset by one day.
        """
        # Calculate yesterday's time range based on the provided 'from' and 'to' strings.
        time_from_dt = datetime.fromisoformat(time_from_str)
        time_to_dt = datetime.fromisoformat(time_to_str)
        y_time_from_str = (time_from_dt - timedelta(days=1)).isoformat()
        y_time_to_str = (time_to_dt - timedelta(days=1)).isoformat()

        # Build SQL WHERE clauses and parameters for both periods.
        where_today, params_today = build_where_clause(customer, supplier, destination, time_from_str, time_to_str)
        where_yesterday, params_yesterday = build_where_clause(customer, supplier, destination, y_time_from_str, y_time_to_str)
        
        # Execute both queries.
        rows_today = self._execute_query(where_today, params_today)
        rows_yesterday = self._execute_query(where_yesterday, params_yesterday)

        return rows_today, rows_yesterday

    def _execute_query(self, where_clause, params):
        """
        Executes a single SELECT query against the database.
        """
        query = f"""
            SELECT
                time, customer, supplier, destination, seconds,
                start_nuber, start_attempt, start_uniq_attempt,
                answer_time, pdd
            FROM public.sonus_aggregation_new
            {where_clause}
            ORDER BY time
        """
        
        # Use a 'with' statement for connection and cursor to ensure they are closed properly.
        with get_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, params)
                rows = cur.fetchall()
        
        # Format timestamps to ISO format strings for JSON serialization.
        for row in rows:
            if isinstance(row.get("time"), datetime):
                row["time"] = row["time"].isoformat()
        
        return rows
        
    def _enrich_rows(self, today_rows, yesterday_rows, key_fields):
        """
        Combines today's data with yesterday's data and calculates percentage deltas.
        This is a generic function that can enrich any list of metric rows.
        """
        # Create a lookup map from yesterday's data for efficient access.
        yesterday_map = {
            tuple(r.get(k) for k in key_fields): r for r in yesterday_rows
        }

        enriched_rows = []
        # CORRECTED: Define all the final metrics we expect from the calculation step.
        # These are the keys that should already exist in today_rows and yesterday_rows.
        metrics_to_compare = ["Min", "ACD", "ASR", "PDD", "ATime", "SCall", "TCall"]

        for today_row in today_rows:
            # Find the corresponding row from yesterday using the composite key.
            key = tuple(today_row.get(k) for k in key_fields)
            yesterday_row = yesterday_map.get(key, {})

            # Start with the key fields (e.g., main, destination).
            combined_data = {field: today_row.get(field) for field in key_fields}

            # Calculate today, yesterday, and delta values for each metric.
            for metric in metrics_to_compare:
                today_val = today_row.get(metric, 0)
                yesterday_val = yesterday_row.get(metric, 0)
                
                # Prevent division by zero and handle growth from zero
                if yesterday_val == 0:
                    delta = 100.0 if today_val > 0 else 0.0
                else:
                    delta = round(((today_val - yesterday_val) / yesterday_val) * 100, 1)

                # The column names are already correct (Min, ACD, ASR, etc.),
                # so no mapping is needed anymore.
                combined_data[metric] = today_val
                combined_data[f"Y{metric}"] = yesterday_val
                combined_data[f"{metric}_delta"] = delta

            enriched_rows.append(combined_data)
            
        return enriched_rows