import os
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, ConsoleSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor


def init_otel(app=None, engine=None, service_name: str = "metrics-service"):
    """Initialize OpenTelemetry tracing with console exporter.

    Pass FastAPI app and SQLAlchemy engine to instrument automatically.
    """
    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(provider)

    provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))

    if app is not None:
        FastAPIInstrumentor.instrument_app(app)
        # Ensure ASGI middleware added for full request lifecycle spans
        app.add_middleware(OpenTelemetryMiddleware)

    if engine is not None:
        SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)

    return trace.get_tracer(service_name)
