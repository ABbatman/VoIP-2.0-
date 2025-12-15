# app/routers/state.py
# FastAPI router for shared state API (short links)

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.repositories.shared_state_repository import SharedStateRepository


router = APIRouter()


class StateSaveRequest(BaseModel):
    """Request body for saving state."""
    class Config:
        extra = "allow"  # Accept any JSON fields


class StateSaveResponse(BaseModel):
    """Response for saved state."""
    id: str


def get_repository() -> SharedStateRepository:
    return SharedStateRepository()


@router.post("/state", response_model=StateSaveResponse, status_code=status.HTTP_201_CREATED)
async def save_state(payload: Dict[str, Any]) -> StateSaveResponse:
    """Save state and return short ID for sharing."""
    repo = get_repository()
    short_id = await repo.save(payload)
    return StateSaveResponse(id=short_id)


@router.get("/state/{state_id}")
async def load_state(state_id: str) -> Dict[str, Any]:
    """Load state by short ID."""
    if not state_id:
        raise HTTPException(status_code=400, detail="Missing state ID")
    
    repo = get_repository()
    state = await repo.load(state_id)
    
    if state is None:
        raise HTTPException(status_code=404, detail="State not found")
    
    return state
