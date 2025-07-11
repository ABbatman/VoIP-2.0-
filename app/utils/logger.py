# app/utils/logger.py

import logging
import traceback
import json
import threading
import time
import os
# Import our centralized config
from app import config

# Ensure the log directory exists, using the path from config
os.makedirs(config.LOGS_PATH, exist_ok=True)

# Log file paths are now taken from the central config
access_log_file = os.path.join(config.LOGS_PATH, "access.log")
error_log_file = os.path.join(config.LOGS_PATH, "error.log")

# Define formatter
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S")

def setup_logger(name, log_file, level):
    """A helper function to set up a logger."""
    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.propagate = False # Prevent duplicate logs in parent loggers

    # Avoid adding handlers if they already exist (e.g., during autoreload)
    if not logger.handlers:
        handler = logging.FileHandler(log_file, encoding="utf-8")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    
    return logger

# ACCESS and ERROR loggers are now set up using the helper function
access_logger = setup_logger("access", access_log_file, logging.INFO)
error_logger = setup_logger("error", error_log_file, logging.ERROR)


# === Logging functions (no changes here) ===

def log_info(message):
    # print("📥 log_info:", message) # We can comment this out for cleaner console output
    access_logger.info(message)

def log_exception(e: Exception, context: str = ""):
    # print("💥 log_exception:", context, e) # Also can be commented out
    error_logger.error(f"❌ Exception in {context}:\n{traceback.format_exc()}")

def json_response(handler, data: dict, status: int = 200):
    log_info(f"{handler.request.method} {handler.request.path} → {status}")
    handler.set_status(status)
    handler.set_header("Content-Type", "application/json")
    handler.write(json.dumps(data, default=str)) # Use default=str to handle non-serializable objects like datetime

def json_error(handler, error_message: str, status: int = 500):
    log_info(f"{handler.request.method} {handler.request.path} → {status} | {error_message}")
    handler.set_status(status)
    handler.set_header("Content-Type", "application/json")
    handler.write(json.dumps({"error": error_message}))

def monitor_loggers():
    def _monitor():
        while True:
            access_count = len(access_logger.handlers)
            error_count = len(error_logger.handlers)
            # This check is good for debugging but can be removed in production
            if access_count == 0 or error_count == 0:
                print(f"❌ Log handlers might have dropped! Access: {access_count}, Error: {error_count}")
            time.sleep(60)
    
    # Run monitoring in a daemon thread so it doesn't block app shutdown
    threading.Thread(target=_monitor, daemon=True).start()