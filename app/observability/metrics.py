# app/observability/metrics.py
# minimal prometheus instrumentation

from __future__ import annotations

import os
import time
import asyncio
from typing import Optional

import tornado.web

try:
    from prometheus_client import (
        Counter,
        Histogram,
        Gauge,
        CollectorRegistry,
        CONTENT_TYPE_LATEST,
        generate_latest,
    )
    # Try to import multiprocess collector (optional)
    try:
        from prometheus_client.multiprocess import MultiProcessCollector  # type: ignore
        HAVE_MP_IMPORT = True
    except Exception:
        HAVE_MP_IMPORT = False
    HAVE_PROM = True
except Exception:
    HAVE_PROM = False
    HAVE_MP_IMPORT = False

# Detect multiprocess mode via environment.
# NOTE: PROMETHEUS_MULTIPROC_DIR must be set BEFORE importing this module in real multi-proc setups.
PROM_MP_DIR = os.environ.get("PROMETHEUS_MULTIPROC_DIR")
HAVE_MP = bool(PROM_MP_DIR and os.path.isdir(PROM_MP_DIR))

# Choose registry depending on mode
REGISTRY: Optional[CollectorRegistry] = None
if HAVE_PROM:
    if HAVE_MP and HAVE_MP_IMPORT:
        # Use a dedicated registry with multiprocess collector
        REGISTRY = CollectorRegistry()
        MultiProcessCollector(REGISTRY)  # type: ignore
    else:
        # Use default process collector/registry
        REGISTRY = None  # default global registry

# Global references to metrics (initialized on first instrumentation)
REQUEST_COUNT: Optional[Counter] = None
REQUEST_LATENCY: Optional[Histogram] = None
REQUEST_IN_PROGRESS: Optional[Gauge] = None
ERROR_COUNT: Optional[Counter] = None


class PrometheusMetricsHandler(tornado.web.RequestHandler):
    """// expose /metrics"""

    def get(self):
        if not HAVE_PROM:
            self.set_status(503)
            self.write("prometheus_client is not installed")
            return
        self.set_header("Content-Type", CONTENT_TYPE_LATEST)
        # Expose from the configured registry (multiprocess or default)
        if REGISTRY is not None:
            self.write(generate_latest(REGISTRY))
        else:
            self.write(generate_latest())


def _ensure_metrics():
    global REQUEST_COUNT, REQUEST_LATENCY, REQUEST_IN_PROGRESS, ERROR_COUNT
    if not HAVE_PROM:
        return
    if REQUEST_COUNT is not None:
        return

    # Create metrics in the chosen registry (default or multiprocess)
    # // minimal prometheus instrumentation
    REQUEST_COUNT = Counter(
        "request_count",
        "Total request count",
        labelnames=("method", "path", "status"),
        registry=REGISTRY,
    )
    REQUEST_LATENCY = Histogram(
        "request_latency_seconds",
        "Request latency in seconds",
        # Default buckets are fine; can be tuned from config if desired
        registry=REGISTRY,
    )
    # In multiprocess mode, Gauge must set a multiprocess_mode.
    gauge_kwargs = {}
    if REGISTRY is not None:
        gauge_kwargs["registry"] = REGISTRY
    if HAVE_MP and HAVE_MP_IMPORT:
        gauge_kwargs["multiprocess_mode"] = "livesum"  # sum values across workers
    REQUEST_IN_PROGRESS = Gauge(
        "request_in_progress",
        "Requests currently in progress",
        ("method", "path"),  # labelnames positional
        **gauge_kwargs,
    )
    ERROR_COUNT = Counter(
        "error_count",
        "Total error count",
        labelnames=("method", "path", "status"),
        registry=REGISTRY,
    )


def instrument_tornado(app: tornado.web.Application) -> None:
    """// register minimal prometheus instrumentation for Tornado

    Instruments all RequestHandler instances by monkey-patching prepare/on_finish/write_error.
    Business logic and log levels remain unchanged.
    """
    if not HAVE_PROM:
        return

    _ensure_metrics()

    # Avoid double-instrumentation
    if getattr(tornado.web.RequestHandler, "_prom_instrumented", False):
        return

    orig_prepare = tornado.web.RequestHandler.prepare
    orig_on_finish = tornado.web.RequestHandler.on_finish
    orig_write_error = tornado.web.RequestHandler.write_error

    async def prepare(self: tornado.web.RequestHandler):
        # Start timer and mark in-progress
        setattr(self, "_prom_start_time", time.perf_counter())  # type: ignore[attr-defined]
        try:
            if REQUEST_IN_PROGRESS is not None:
                REQUEST_IN_PROGRESS.labels(self.request.method, self.request.path).inc()
        except Exception:
            pass
        if orig_prepare:
            result = orig_prepare(self)
            # Await coroutine results from async prepare
            if asyncio.iscoroutine(result):
                return await result
            return result

    def on_finish(self: tornado.web.RequestHandler):
        # Observe latency and increment counters
        try:
            elapsed = None
            if hasattr(self, "_prom_start_time"):
                start = getattr(self, "_prom_start_time", None)
                if isinstance(start, (int, float)):
                    elapsed = time.perf_counter() - float(start)
            status = (
                getattr(self, "_status_code", None) or self.get_status()
                if hasattr(self, "get_status")
                else 200
            )
            if elapsed is not None and REQUEST_LATENCY is not None:
                REQUEST_LATENCY.observe(elapsed)
            if REQUEST_COUNT is not None:
                REQUEST_COUNT.labels(self.request.method, self.request.path, str(status)).inc()
        except Exception:
            pass
        finally:
            try:
                if REQUEST_IN_PROGRESS is not None:
                    REQUEST_IN_PROGRESS.labels(self.request.method, self.request.path).dec()
            except Exception:
                pass
        if orig_on_finish:
            return orig_on_finish(self)

    def write_error(self: tornado.web.RequestHandler, status_code: int, **kwargs):
        # Increment error counter and delegate to original
        try:
            if ERROR_COUNT is not None:
                ERROR_COUNT.labels(self.request.method, self.request.path, str(status_code)).inc()
        except Exception:
            pass
        return orig_write_error(self, status_code, **kwargs)

    tornado.web.RequestHandler.prepare = prepare  # type: ignore
    tornado.web.RequestHandler.on_finish = on_finish  # type: ignore
    tornado.web.RequestHandler.write_error = write_error  # type: ignore
    tornado.web.RequestHandler._prom_instrumented = True  # type: ignore