# app/handlers/metrics_handler.py

import tornado.web

# Import our new service and the logger functions
from app.services.metrics_service import MetricsService
from app.utils.logger import log_info, log_exception, json_response, json_error

class MetricsHandler(tornado.web.RequestHandler):
    """
    A 'thin' handler that is only responsible for handling the web request.
    It extracts parameters, calls the business logic service, and returns the response.
    """
    
    # Initialize the service once per handler instance.
    def initialize(self):
        self.metrics_service = MetricsService()

    def get(self):
        """
        Handles the GET /api/metrics request.
        """
        try:
            log_info(f"📥 GET {self.request.path} - Request received, delegating to service.")

            # Step 1: Extract and validate query parameters from the web request.
            # This is the primary responsibility of the handler.
            customer = self.get_argument("customer", default=None)
            supplier = self.get_argument("supplier", default=None)
            destination = self.get_argument("destination", default=None)
            time_from = self.get_argument("from", default=None)
            time_to = self.get_argument("to", default=None)
            reverse = self.get_argument("reverse", default="false").lower() == "true"
            
            # A simple validation to ensure required parameters are present.
            if not all([time_from, time_to]):
                return json_error(self, "Missing required parameters: 'from' and 'to'", status=400)

            # Step 2: Call the service layer to perform the business logic.
            # The handler doesn't know *how* the report is generated, only that it gets one.
            report_data = self.metrics_service.get_full_metrics_report(
                customer=customer,
                supplier=supplier,
                destination=destination,
                time_from=time_from,
                time_to=time_to,
                reverse=reverse
            )

            # Step 3: Send the successful response back to the client.
            json_response(self, report_data)

        except Exception as e:
            # If any error occurs, log it and return a generic server error.
            log_exception(e, "❌ Error in MetricsHandler")
            json_error(self, "An internal server error occurred.", status=500)