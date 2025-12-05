import os
from dotenv import load_dotenv
from arq import cron
from arq.connections import RedisSettings
from opentelemetry import trace
from app.utils.telemetry import init_otel


# Load environment (.env) so REDIS_URL is available when running via CLI
load_dotenv()


async def generate_report(ctx, customer: str, supplier: str, hours: int) -> dict:
    """Example long-running report generation with simple counters."""
    r = ctx["redis"]
    tracer = trace.get_tracer("worker")
    await r.incr("jobs:started")
    try:
        with tracer.start_as_current_span("generate_report"):
            # Placeholder work
            result = {
                "customer": customer,
                "supplier": supplier,
                "hours": hours,
                "status": "completed",
            }
            await r.incr("jobs:finished")
            return result
    except Exception:
        await r.incr("jobs:failed")
        raise


generate_report.job_keep_result = 3600  # keep result for 1 hour


async def cleanup_jobs(ctx) -> dict:
    """Periodic cleanup: remove non-expiring ARQ job keys to prevent growth."""
    r = ctx["redis"]
    removed = 0
    cursor = 0
    pattern = "arq:job:*"
    while True:
        cursor, keys = await r.scan(cursor=cursor, match=pattern, count=500)
        if keys:
            # delete keys that have no TTL (ttl == -1)
            for k in keys:
                ttl = await r.ttl(k)
                if ttl == -1:
                    await r.delete(k)
                    removed += 1
        if cursor == 0:
            break
    return {"removed": removed}


class WorkerSettings:
    functions = [generate_report, cleanup_jobs]
    redis_settings = RedisSettings.from_dsn(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    cron_jobs = [
        cron(cleanup_jobs, minute={0, 15, 30, 45}),
    ]

    @staticmethod
    async def startup(ctx):
        # Initialize telemetry on worker start (console exporter)
        init_otel(service_name="metrics-worker")
