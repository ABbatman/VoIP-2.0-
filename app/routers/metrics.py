from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends

from app.schemas.metrics import MetricIn, MetricOut, MetricFilter, PaginatedMetricsResponse
from app.repositories.metrics_repository import MetricsRepository
from app.services.metrics_service import MetricsService
from app.schemas.common import StatusResponse
from app.utils.cache import Cache
from fastapi import Query
from datetime import datetime


router = APIRouter()

def get_service() -> MetricsService:
    """Provide service with DI so handlers stay thin."""
    repo = MetricsRepository()
    return MetricsService(repository=repo)


_cache = Cache()


@router.post("/metrics", response_model=MetricOut)
async def create_metric(payload: MetricIn, service: MetricsService = Depends(get_service)) -> MetricOut:
    data = await service.insert_metric(payload.dict())
    return MetricOut(**data)


@router.get("/metrics")
async def get_metrics_report(
    customer: str | None = None,
    supplier: str | None = None,
    destination: str | None = None,
    time_from: datetime = Query(..., alias="from"),
    time_to: datetime = Query(..., alias="to"),
    reverse: bool = False,
    service: MetricsService = Depends(get_service),
):
    cache_key = Cache.build_key(
        "api:report",
        {
            "customer": customer or "",
            "supplier": supplier or "",
            "destination": destination or "",
            "from": time_from,
            "to": time_to,
            "reverse": reverse,
        },
    )
    cached = _cache.get_json(cache_key)
    if cached:
        return cached

    data = await service.get_full_metrics_report(customer, supplier, destination, time_from, time_to, reverse)
    _cache.set_json(cache_key, data)
    return data


@router.get("/metrics/page", response_model=PaginatedMetricsResponse)
async def list_metrics_page(filters: MetricFilter = Depends(), service: MetricsService = Depends(get_service)) -> PaginatedMetricsResponse:
    cache_key = Cache.build_key("api:metrics_page", filters.dict(by_alias=True))
    cached = _cache.get_json(cache_key)
    if cached:
        return PaginatedMetricsResponse(**cached)

    rows, next_c, prev_c = await service.list_metrics_page(
        filters={
            "customer": filters.customer,
            "supplier": filters.supplier,
            "destination": filters.destination,
            "time_from": filters.time_from,
            "time_to": filters.time_to,
        },
        limit=filters.limit,
        next_cursor=filters.next_cursor,
        prev_cursor=filters.prev_cursor,
    )
    resp = PaginatedMetricsResponse(items=[MetricOut(**row) for row in rows], next_cursor=next_c, prev_cursor=prev_c)
    _cache.set_json(cache_key, resp.dict())
    return resp


@router.delete("/metrics/{id}", response_model=StatusResponse)
async def delete_metric(id: int, service: MetricsService = Depends(get_service)) -> StatusResponse:
    await service.delete_metric(id)
    return StatusResponse(success=True, message="deleted")


