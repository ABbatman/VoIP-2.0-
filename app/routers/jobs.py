from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, status
from pydantic import BaseModel
from arq.connections import ArqRedis, create_pool, RedisSettings
from arq.jobs import Job
from app.schemas.common import JobEnqueueResponse, JobStatusResponse


router = APIRouter()

# Module-level connection pool (lazy init)
_arq_pool: Optional[ArqRedis] = None


class ReportRequest(BaseModel):
    customer: str
    supplier: str
    hours: int = 24


async def _get_arq() -> ArqRedis:
    """Get or create shared ArqRedis connection pool."""
    global _arq_pool
    if _arq_pool is None:
        settings = RedisSettings.from_dsn(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
        _arq_pool = await create_pool(settings)
    return _arq_pool


@router.post("/jobs/report", response_model=JobEnqueueResponse, status_code=status.HTTP_202_ACCEPTED)
async def enqueue_report(req: ReportRequest) -> JobEnqueueResponse:
    arq = await _get_arq()
    job = await arq.enqueue_job("generate_report", req.customer, req.supplier, req.hours)
    return JobEnqueueResponse(task_id=job.job_id if job else "")


@router.get("/jobs/{task_id}", response_model=JobStatusResponse)
async def get_job_status(task_id: str) -> JobStatusResponse:
    arq = await _get_arq()
    job = Job(task_id, arq)
    info = await job.info()
    status_str = info.status if info else "pending"
    result = info.result if info and hasattr(info, "status") and info.status == "complete" else None
    return JobStatusResponse(task_id=task_id, status=str(status_str), result=result)


@router.get("/jobs/metrics")
async def jobs_metrics():
    """Return counters of jobs activity in Redis."""
    arq = await _get_arq()

    async def _get_int(key: str) -> int:
        v = await arq.get(key)
        try:
            return int(v) if v is not None else 0
        except Exception:
            return 0

    queued = await arq.llen("arq:queue")
    started = await _get_int("jobs:started")
    finished = await _get_int("jobs:finished")
    failed = await _get_int("jobs:failed")
    return {
        "queued": queued or 0,
        "started": started,
        "finished": finished,
        "failed": failed,
    }
