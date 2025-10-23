# app/main.py

import tornado.ioloop
import tornado.web
import asyncio
import signal # NEW: Import for handling shutdown signals

import app.config as config
from app.routes.api_routes import make_app
from app.utils.logger import log_info, monitor_loggers
from app.observability.logger import configure_logging
from app.observability.tracing import init_tracing  # // initialize otel tracer

from app.db.db import init_db_pool, get_db_pool

# A global list to hold shutdown tasks
shutdown_tasks = []

async def shutdown():
    """ Gracefully run all registered shutdown tasks. """
    log_info("Starting graceful shutdown...")
    # Run all shutdown tasks concurrently
    await asyncio.gather(*[task() for task in shutdown_tasks])
    log_info("Shutdown complete.")
    # Stop the IOLoop
    tornado.ioloop.IOLoop.current().stop()
    # Also stop the asyncio loop to exit run_forever
    try:
        asyncio.get_running_loop().stop()
    except RuntimeError:
        pass  # no running loop

def handle_signal(sig, frame):
    """ Signal handler to initiate graceful shutdown. """
    sig_name = getattr(sig, "name", str(sig))  # handle int signum
    log_info(f"Received exit signal {sig_name}...")
    # Add the shutdown task to the IOLoop to be run
    tornado.ioloop.IOLoop.current().add_callback_from_signal(shutdown)

async def main():
    """ Main entry point for the application startup. """
    # 0. Configure structured JSON logging as early as possible
    try:
        configure_logging(config)
    except Exception:
        # Fallbacks are handled inside configure_logging
        pass

    # 0.1 Initialize OpenTelemetry tracing (idempotent).
    #     Uses Console exporter by default. If OTLP exporter is available and
    #     configured via standard env vars, it will be used automatically.
    try:
        init_tracing(config)
    except Exception:
        # Safe no-op if OTEL SDK or instrumentations are not installed.
        pass

    # 1. Initialize the database connection pool first.
    await init_db_pool()

    # 2. Define a shutdown task for the database pool.
    async def close_db_pool():
        pool = get_db_pool()
        if pool:
            log_info("Closing database connection pool...")
            await pool.close()
            log_info("Database pool closed.")
    # Add the DB closing task to our list of shutdown tasks.
    shutdown_tasks.append(close_db_pool)

    # 3. Create and start the Tornado application.
    app = make_app()
    app.listen(config.PORT, address=config.HOST)
    log_info(f"Server started at http://{config.HOST}:{config.PORT}")
    print(f"Server started at http://{config.HOST}:{config.PORT}")

    # 4. Start other background tasks
    monitor_loggers()


if __name__ == "__main__":
    # --- MODIFIED: Setup signal handlers for graceful shutdown ---
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal) # Handles Ctrl+C

    # Get the main event loop
    loop = asyncio.new_event_loop()  # avoid deprecated get_event_loop
    asyncio.set_event_loop(loop)

    # Run our main async setup function
    loop.run_until_complete(main())

    # Start the event loop
    loop.run_forever()