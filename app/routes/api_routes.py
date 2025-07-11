# app/routes/api_routes.py

import tornado.web
# Import our centralized config
from app import config
from app.handlers.metrics_handler import MetricsHandler
from app.handlers.main_handler import MainHandler

def make_app():
    """
    Creates and configures the Tornado application instance.
    All settings are now taken from the central config module.
    """
    # Define settings using variables from our config file.
    settings = {
        "debug": config.DEBUG,  # Use DEBUG from config
        "template_path": config.TEMPLATE_PATH,  # Use TEMPLATE_PATH from config
    }
    
    return tornado.web.Application([
        (r"/", MainHandler),
        (r"/api/metrics", MetricsHandler),
        # Static file handler also uses the path from the config.
        (
            r"/static/(.*)", 
            tornado.web.StaticFileHandler, 
            {"path": config.STATIC_PATH}
        ),
    ], **settings)