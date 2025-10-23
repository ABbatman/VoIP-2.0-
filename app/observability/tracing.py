# app/observability/tracing.py
"""
Minimal OpenTelemetry tracing bootstrap for Tornado app.
- Initializes a TracerProvider with a Console exporter by default.
- Optionally uses OTLP exporter if the package is available and configured.
- Auto-instruments Tornado, Redis, and SQLAlchemy if instrumentors are installed.
- Idempotent: safe to call multiple times.

Notes:
- We intentionally do not introduce new .env keys here. If your project already
  defines OTLP-related settings elsewhere, you can extend this module to use them.
"""
from __future__ import annotations

import typing as _t

_OTEL_INITIALIZED = False

# Core SDK
try:
    from opentelemetry import trace
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import (
        BatchSpanProcessor,
        SimpleSpanProcessor,
        ConsoleSpanExporter,
    )
    HAVE_OTEL_SDK = True
except Exception:
    HAVE_OTEL_SDK = False

# Optional OTLP exporter
try:
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter  # type: ignore
    HAVE_OTLP = True
except Exception:
    HAVE_OTLP = False

# Instrumentations (optional)
try:
    from opentelemetry.instrumentation.tornado import TornadoInstrumentor  # type: ignore
    HAVE_TORNADO_INST = True
except Exception:
    HAVE_TORNADO_INST = False

try:
    from opentelemetry.instrumentation.redis import RedisInstrumentor  # type: ignore
    HAVE_REDIS_INST = True
except Exception:
    HAVE_REDIS_INST = False

try:
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor  # type: ignore
    HAVE_SA_INST = True
except Exception:
    HAVE_SA_INST = False


def init_tracing(config_module: _t.Any | None = None) -> None:
    """// initialize otel tracer (idempotent)

    - Uses Console exporter by default (visible in stdout).
    - If OTLP exporter is available and you already configure it elsewhere,
      you can adjust this function to use that configuration.
    - Auto-instrument tornado/redis/sqlalchemy when instrumentors are installed.
    """
    global _OTEL_INITIALIZED

    if _OTEL_INITIALIZED:
        return
    if not HAVE_OTEL_SDK:
        return

    # Resource: service.name is important for trace grouping
    service_name = None
    try:
        # Reuse existing config if it provides service-related name
        service_name = getattr(config_module, "SERVICE_NAME", None)
    except Exception:
        service_name = None
    if not service_name:
        service_name = "tornado-app"

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(provider)

    # Choose exporter: prefer OTLP if available/configured, else Console
    exporter = None
    if HAVE_OTLP:
        try:
            # Rely on default environment variables if already defined externally
            # (e.g. OTEL_EXPORTER_OTLP_ENDPOINT). We do not add new .env keys here.
            exporter = OTLPSpanExporter()
        except Exception:
            exporter = None

    if exporter is not None:
        provider.add_span_processor(BatchSpanProcessor(exporter))
    else:
        provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))

    # // auto-instrument tornado/redis/psql
    try:
        if HAVE_TORNADO_INST:
            TornadoInstrumentor().instrument()
    except Exception:
        pass

    try:
        if HAVE_REDIS_INST:
            RedisInstrumentor().instrument()
    except Exception:
        pass

    try:
        if HAVE_SA_INST:
            # If an Engine is already created elsewhere, SQLAlchemyInstrumentor can still
            # patch the engine class to instrument new connections. If you want to target
            # a specific engine, pass engine=... here.
            SQLAlchemyInstrumentor().instrument()
    except Exception:
        pass

    _OTEL_INITIALIZED = True
