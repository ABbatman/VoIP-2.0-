from __future__ import annotations

from pydantic import BaseModel


class StatusResponse(BaseModel):
    success: bool
    message: str


class JobEnqueueResponse(BaseModel):
    task_id: str


class JobStatusResponse(BaseModel):
    task_id: str
    status: str
    result: object | None = None
