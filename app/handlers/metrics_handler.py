import tornado.web
from pydantic import ValidationError

from app.constants import MAIN_HEADERS, PEER_HEADERS, HOURLY_HEADERS, FIVE_MIN_HEADERS
from app.models.query_params import MetricsQueryParams
from app.repositories.metrics_repository import MetricsRepository
from app.services.metrics_service import MetricsService
from app.utils.logger import log_info, log_exception, json_response, json_error


class BaseMetricsHandler(tornado.web.RequestHandler):
    """
    Base handler with shared logic for all metrics endpoints.
    Subclasses only need to override `get_granularity()`.
    """
    
    def initialize(self, metrics_service: MetricsService | None = None):
        self.metrics_service = metrics_service or MetricsService(MetricsRepository())

    def get_granularity(self) -> str | None:
        """Override in subclass to force specific granularity, or return None for query param."""
        return None

    async def get(self):
        """Unified GET handler for all metrics endpoints."""
        try:
            log_info(f"GET {self.request.path} - Received request")

            try:
                query_args = {key: self.get_argument(key) for key in self.request.arguments}
                params = MetricsQueryParams.model_validate(query_args)
                log_info(f"Query params validated: {params.model_dump()}")
            except ValidationError as e:
                log_info(f"Validation failed: {e.errors()}")
                error_details = e.errors()[0]
                error_msg = f"Parameter '{error_details['loc'][0]}': {error_details['msg']}"
                return json_error(self, error_msg, status=400)

            # Use forced granularity from subclass or query param
            granularity = self.get_granularity() or params.granularity

            report_data = await self.metrics_service.get_full_metrics_report(
                customer=params.customer,
                supplier=params.supplier,
                destination=params.destination,
                time_from=params.time_from,
                time_to=params.time_to,
                reverse=params.reverse,
                granularity=granularity,
            )

            fmt = self.get_argument("format", default="json").lower()
            if fmt == "compact":
                compact = self._to_compact_format(report_data)
                return json_response(self, compact)

            return json_response(self, report_data)

        except Exception as e:
            log_exception(e, f"Error in {self.__class__.__name__}")
            return json_error(self, "An internal server error occurred.", status=500)

    @staticmethod
    def _to_compact_format(data: dict) -> dict:
        """
        Converts verbose dict-based rows to a compact headers+rows representation.
        Does not change business semantics.
        """
        def compact_rows(rows: list[dict], header_fields: list[str]):
            headers = header_fields
            rows_compact = [[row.get(k) for k in headers] for row in rows]
            return {"headers": headers, "rows": rows_compact}

        out = {
            "today_metrics": data.get("today_metrics", {}),
            "yesterday_metrics": data.get("yesterday_metrics", {}),
            "main": compact_rows(data.get("main_rows", []), MAIN_HEADERS),
            "peer": compact_rows(data.get("peer_rows", []), PEER_HEADERS),
            "hourly": compact_rows(data.get("hourly_rows", []), HOURLY_HEADERS),
        }
        # include five_min if present
        if isinstance(data.get("five_min_rows"), list) and data.get("five_min_rows"):
            out["five_min"] = compact_rows(data.get("five_min_rows", []), FIVE_MIN_HEADERS)
        return out

# Backward-compatible alias
MetricsHandler = BaseMetricsHandler


class Metrics5mHandler(BaseMetricsHandler):
    """Handler for /api/metrics/5m — forces 5-minute granularity."""
    
    def get_granularity(self) -> str:
        return "5m"


class Metrics1hHandler(BaseMetricsHandler):
    """Handler for /api/metrics/1h — forces 1-hour granularity."""
    
    def get_granularity(self) -> str:
        return "1h"