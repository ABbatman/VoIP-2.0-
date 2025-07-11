# app/main.py

import tornado.ioloop
import tornado.web

# --- Refactoring Step 1 ---
# Import our new centralized config and the application factory function.
# Instead of hardcoding values here, we'll get them from the config module.
import app.config as config
from app.routes.api_routes import make_app
from app.utils.logger import log_info, monitor_loggers

# The main entry point of the application.
if __name__ == "__main__":
    # Create the Tornado application instance.
    # The make_app function will be refactored next to use the config.
    app = make_app()

    # Listen on the port and host specified in our config file.
    # No more hardcoded '7777'!
    app.listen(config.PORT, address=config.HOST)

    # Log the server start message using the configured host and port.
    log_info(f"🚀 Server started at http://{config.HOST}:{config.PORT}")

    # Start the logger monitoring thread (if needed for debugging).
    monitor_loggers()
    
    # Print the startup message to the console as well.
    print(f"🚀 Server started at http://{config.HOST}:{config.PORT}")

    # Start the Tornado I/O loop to begin handling requests.
    tornado.ioloop.IOLoop.current().start()