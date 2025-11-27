# app/routes/api_routes.py

import tornado.web
from app import config
from app.handlers.metrics_handler import MetricsHandler, Metrics5mHandler, Metrics1hHandler
from app.handlers.suggest_handler import SuggestHandler
from app.handlers.main_handler import MainHandler
from app.handlers.shared_state_handler import SharedStateSaveHandler, SharedStateLoadHandler
from app.utils.vite import vite_script_tag
from app.observability.metrics import PrometheusMetricsHandler, instrument_tornado
from markupsafe import Markup

# This is a much simpler approach. We will add the function
# directly to the handler's namespace instead of creating a complex loader.
# We can remove the Jinja2Loader class entirely.

def make_app():
    """
    Creates and configures the Tornado application instance.
    """
    # Provide a minimal 'safe' helper compatible with Jinja-like pipe usage `x | safe`
    class _SafeFilter:
        # Support right-hand bitwise or: `left | safe` -> SafeFilter.__ror__(left)
        def __ror__(self, other):  # noqa: D401
            # Treat value as already safe HTML
            return Markup(other)
    safe = _SafeFilter()

    settings = {
        "debug": config.DEBUG,
        "template_path": config.TEMPLATE_PATH,
        # Disable template autoescape globally; we control HTML injection for vite tags
        "autoescape": None,
        # Enable automatic gzip compression for eligible responses
        "compress_response": True,
        # We put vite_script_tag into ui_methods.
        # This makes it available in the template.
        # This is the original, simplest way to do it in Tornado.
        "ui_methods": {
            "vite_script_tag": vite_script_tag,
            "safe": safe,
        }
    }
    
    app = tornado.web.Application([
        (r"/", MainHandler),
        (r"/api/metrics", MetricsHandler),
        (r"/api/metrics/5m", Metrics5mHandler),
        (r"/api/metrics/1h", Metrics1hHandler),
        # Suggest endpoints for typeahead (prefix filter by kind)
        (r"/api/suggest/(customer|supplier|destination)", SuggestHandler),
        # Shared state endpoints (short links)
        (r"/api/state", SharedStateSaveHandler),
        (r"/api/state/([a-zA-Z0-9]+)", SharedStateLoadHandler),
        # expose /metrics for Prometheus
        (r"/metrics", PrometheusMetricsHandler),
        (
            config.STATIC_URL_PREFIX + r"(.*)", 
            tornado.web.StaticFileHandler, 
            {"path": config.STATIC_PATH}
        ),
    
    
    ], **settings)

    # minimal prometheus instrumentation (no business logic changes)
    try:
        instrument_tornado(app)
    except Exception:
        # Safe to ignore if prometheus_client is not installed
        pass

    return app