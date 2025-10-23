from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class MetricIn(BaseModel):
    time: datetime
    customer: str
    supplier: str
    destination: str
    seconds: Optional[int] = None
    start_nuber: Optional[int] = None
    start_attempt: Optional[int] = None
    start_uniq_attempt: Optional[int] = None
    answer_time: Optional[float] = None
    pdd: Optional[float] = None

    class Config:
        from_attributes = True


class MetricOut(BaseModel):
    time: datetime
    customer: Optional[str] = None
    supplier: Optional[str] = None
    destination: Optional[str] = None
    seconds: Optional[int] = None
    start_nuber: Optional[int] = None
    start_attempt: Optional[int] = None
    start_uniq_attempt: Optional[int] = None
    answer_time: Optional[float] = None
    pdd: Optional[float] = None

    class Config:
        from_attributes = True


class MetricFilter(BaseModel):
    customer: Optional[str] = None
    supplier: Optional[str] = None
    destination: Optional[str] = None
    time_from: Optional[datetime] = Field(None, alias="from")
    time_to: Optional[datetime] = Field(None, alias="to")
    limit: int = 100
    next_cursor: Optional[str] = None
    prev_cursor: Optional[str] = None

    class Config:
        from_attributes = True
        populate_by_name = True


class PaginatedMetricsResponse(BaseModel):
    items: list[MetricOut]
    next_cursor: Optional[str] = None
    prev_cursor: Optional[str] = None

    class Config:
        from_attributes = True


