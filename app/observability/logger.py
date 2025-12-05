# app/observability/logger.py

# structured JSON logger
import logging
import sys
from typing import Any, Dict

try:
    from pythonjsonlogger import jsonlogger  # type: ignore
    HAVE_JSON_LOGGER = True
except Exception:
    HAVE_JSON_LOGGER = False

# Optional tracing integration (only if present)
try:
    from opentelemetry import trace  # type: ignore
    HAVE_OTEL = True
except Exception:
    HAVE_OTEL = False


class MinimalJSONFormatter(logging.Formatter):
    """Minimal JSON formatter used when python-json-logger is unavailable."""

    def format(self, record: logging.LogRecord) -> str:
        data: Dict[str, Any] = {
            "time": self.formatTime(record, datefmt="%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Include file and line for errors
        if record.levelno >= logging.ERROR:
            data["pathname"] = record.pathname
            data["lineno"] = record.lineno
        # Optional trace_id if available on record
        trace_id = getattr(record, "trace_id", None)
        if not trace_id and HAVE_OTEL:
            try:
                span = trace.get_current_span()
                ctx = span.get_span_context()
                if ctx and ctx.trace_id:
                    trace_id = f"{ctx.trace_id:032x}"
            except Exception:
                trace_id = None
        if trace_id:
            data["trace_id"] = trace_id
        try:
            import json
            return json.dumps(data, ensure_ascii=False)
        except Exception:
            return f"{data}"


class TraceIdFilter(logging.Filter):
    """Inject trace_id into the record if OpenTelemetry is active."""

    def filter(self, record: logging.LogRecord) -> bool:
        if HAVE_OTEL and not hasattr(record, "trace_id"):
            try:
                span = trace.get_current_span()
                ctx = span.get_span_context()
                if ctx and ctx.trace_id:
                    record.trace_id = f"{ctx.trace_id:032x}"
            except Exception:
                pass
        return True


def _build_formatter() -> logging.Formatter:
    if HAVE_JSON_LOGGER:
        fmt = jsonlogger.JsonFormatter(
            fmt=(
                "%(asctime)s %(levelname)s %(name)s %(message)s %(pathname)s %(lineno)d %(trace_id)s"
            ),
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
        return fmt
    return MinimalJSONFormatter()


def configure_logging(config_module) -> None:
    """Configure root logging and align existing loggers to JSON formatting.

    - Keeps existing business log calls intact.
    - Reuses existing access/error file handlers if present, but switches to JSON format.
    - Adds a JSON console handler (stdout).
    - Optionally injects trace_id when tracing is enabled.
    """
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Build JSON formatter and trace filter once
    formatter = _build_formatter()
    trace_filter = TraceIdFilter()

    # Ensure log directory exists if provided by config
    try:
        import os
        os.makedirs(getattr(config_module, "LOGS_PATH", "logs"), exist_ok=True)
    except Exception:
        pass

    # Replace formatters on any existing handlers (set by legacy utils)
    for logger_name in ("access", "error"):
        lg = logging.getLogger(logger_name)
        lg.setLevel(logging.INFO if logger_name == "access" else logging.ERROR)
        lg.propagate = False  # keep file routing stable
        for h in list(lg.handlers):
            try:
                h.setFormatter(formatter)
                if trace_filter not in getattr(h, "filters", []):
                    h.addFilter(trace_filter)
            except Exception:
                pass

    # Add a JSON console handler on root (single instance)
    have_console = any(isinstance(h, logging.StreamHandler) for h in root.handlers)
    if not have_console:
        console = logging.StreamHandler(stream=sys.stdout)
        console.setLevel(logging.INFO)
        console.setFormatter(formatter)
        console.addFilter(trace_filter)
        root.addHandler(console)

    # Light startup smoke logs
    logging.getLogger("startup").info("logging configured", extra={})
