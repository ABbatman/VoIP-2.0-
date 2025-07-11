from app.utils.logger import (
    log_info,
    log_exception,
    access_logger,
    error_logger
)

print("👀 Testing logger...")

# Write logs
log_info("🧪 Manual test log to access.log")
try:
    raise ValueError("🧨 test exception")
except Exception as e:
    log_exception(e, "Manual Test")

# Force flush and close handlers to write to file system
for handler in access_logger.handlers:
    handler.flush()
    handler.close()

for handler in error_logger.handlers:
    handler.flush()
    handler.close()

print("✅ Logger test finished. Now check logs/access.log and logs/error.log")