import tornado.web
from pydantic import ValidationError

from app.services.metrics_service import MetricsService
from app.models.query_params import MetricsQueryParams
from app.utils.logger import log_info, log_exception, json_response, json_error
from app.repositories.metrics_repository import MetricsRepository

class MetricsHandler(tornado.web.RequestHandler):
    """
    Thin Tornado request handler: validates incoming query parameters using
    Pydantic and delegates business logic to `MetricsService`.
    """

    def initialize(self, metrics_service: MetricsService | None = None):
        # Allows injecting a mock in tests; builds a real service by default
        self.metrics_service = metrics_service or MetricsService(MetricsRepository())

    async def get(self):
        """
        Handles GET /api/metrics asynchronously.
        Supports response format `format=compact`.
        """
        try:
            log_info(f" GET {self.request.path} - Received request.")

            try:
                query_args = {key: self.get_argument(key) for key in self.request.arguments}
                params = MetricsQueryParams.model_validate(query_args)
                log_info(f" Query parameters validated successfully: {params.model_dump()}")
            except ValidationError as e:
                log_info(f" Validation failed: {e.errors()}")
                error_details = e.errors()[0]
                error_msg = f"Parameter '{error_details['loc'][0]}': {error_details['msg']}"
                return json_error(self, error_msg, status=400)

            report_data = await self.metrics_service.get_full_metrics_report(
                customer=params.customer,
                supplier=params.supplier,
                destination=params.destination,
                time_from=params.time_from,
                time_to=params.time_to,
                reverse=params.reverse,
                granularity=params.granularity,
            )

            # Optional compact format to reduce payload size: headers + rows
            fmt = self.get_argument("format", default="json").lower()
            if fmt == "compact":
                compact = MetricsHandler._to_compact_format(report_data)
                return json_response(self, compact)

            # Default verbose JSON
            return json_response(self, report_data)

        except Exception as e:
            log_exception(e, " Error in MetricsHandler")
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

        # Define headers for each section based on service schema
        main_headers = [
            "main", "destination",
            "Min", "YMin", "Min_delta",
            "ACD", "YACD", "ACD_delta",
            "ASR", "YASR", "ASR_delta",
            "SCall", "YSCall", "SCall_delta",
            "TCall", "YTCall", "TCall_delta",
        ]
        peer_headers = [
            "main", "peer", "destination",
            "Min", "YMin", "Min_delta",
            "ACD", "YACD", "ACD_delta",
            "ASR", "YASR", "ASR_delta",
            "SCall", "YSCall", "SCall_delta",
            "TCall", "YTCall", "TCall_delta",
        ]
        hourly_headers = [
            "main", "peer", "destination", "time",
            "Min", "YMin", "Min_delta",
            "ACD", "YACD", "ACD_delta",
            "ASR", "YASR", "ASR_delta",
            "SCall", "YSCall", "SCall_delta",
            "TCall", "YTCall", "TCall_delta",
        ]
        five_min_headers = [
            "main", "peer", "destination", "time", "slot",
            "Min", "YMin", "Min_delta",
            "ACD", "YACD", "ACD_delta",
            "ASR", "YASR", "ASR_delta",
            "SCall", "YSCall", "SCall_delta",
            "TCall", "YTCall", "TCall_delta",
        ]

        out = {
            "today_metrics": data.get("today_metrics", {}),
            "yesterday_metrics": data.get("yesterday_metrics", {}),
            "main": compact_rows(data.get("main_rows", []), main_headers),
            "peer": compact_rows(data.get("peer_rows", []), peer_headers),
            "hourly": compact_rows(data.get("hourly_rows", []), hourly_headers),
        }
        # Include five_min if present to support 5m compact payloads
        if isinstance(data.get("five_min_rows"), list) and data.get("five_min_rows"):
            out["five_min"] = compact_rows(data.get("five_min_rows", []), five_min_headers)
        return out

class Metrics5mHandler(tornado.web.RequestHandler):
    def initialize(self, metrics_service: MetricsService | None = None):
        self.metrics_service = metrics_service or MetricsService(MetricsRepository())

    async def get(self):
        try:
            log_info(f" GET {self.request.path} - Received request.")
            try:
                query_args = {key: self.get_argument(key) for key in self.request.arguments}
                params = MetricsQueryParams.model_validate(query_args)
                log_info(f" Query parameters validated successfully: {params.model_dump()}")
            except ValidationError as e:
                log_info(f" Validation failed: {e.errors()}")
                error_details = e.errors()[0]
                error_msg = f"Parameter '{error_details['loc'][0]}': {error_details['msg']}"
                return json_error(self, error_msg, status=400)

            report_data = await self.metrics_service.get_full_metrics_report(
                customer=params.customer,
                supplier=params.supplier,
                destination=params.destination,
                time_from=params.time_from,
                time_to=params.time_to,
                reverse=params.reverse,
                granularity='5m',
            )

            fmt = self.get_argument("format", default="json").lower()
            if fmt == "compact":
                compact = MetricsHandler._to_compact_format(report_data)
                return json_response(self, compact)
            return json_response(self, report_data)
        except Exception as e:
            log_exception(e, " Error in Metrics5mHandler")
            return json_error(self, "An internal server error occurred.", status=500)

class Metrics1hHandler(tornado.web.RequestHandler):
    def initialize(self, metrics_service: MetricsService | None = None):
        self.metrics_service = metrics_service or MetricsService(MetricsRepository())

    async def get(self):
        try:
            log_info(f" GET {self.request.path} - Received request.")
            try:
                query_args = {key: self.get_argument(key) for key in self.request.arguments}
                params = MetricsQueryParams.model_validate(query_args)
                log_info(f" Query parameters validated successfully: {params.model_dump()}")
            except ValidationError as e:
                log_info(f" Validation failed: {e.errors()}")
                error_details = e.errors()[0]
                error_msg = f"Parameter '{error_details['loc'][0]}': {error_details['msg']}"
                return json_error(self, error_msg, status=400)

            report_data = await self.metrics_service.get_full_metrics_report(
                customer=params.customer,
                supplier=params.supplier,
                destination=params.destination,
                time_from=params.time_from,
                time_to=params.time_to,
                reverse=params.reverse,
                granularity='1h',
            )

            fmt = self.get_argument("format", default="json").lower()
            if fmt == "compact":
                compact = MetricsHandler._to_compact_format(report_data)
                return json_response(self, compact)
            return json_response(self, report_data)
        except Exception as e:
            log_exception(e, " Error in Metrics1hHandler")
            return json_error(self, "An internal server error occurred.", status=500)