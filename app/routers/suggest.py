from __future__ import annotations

from typing import Dict, List

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, func

from app.db.base import get_session
from app.models.aggregation_table import sonus_aggregation_new

router = APIRouter()


@router.get("/suggest/{kind}")
async def suggest(
    kind: str,
    q: str = Query("", alias="q"),
    limit: int = Query(100, ge=1, le=500),
) -> Dict[str, List[str]]:
    """Return unique values for customer/supplier/destination with optional prefix filter.
    Response shape matches frontend expectations: { "items": ["..."] }
    """
    k = (kind or "").lower()
    col_map = {
        "customer": sonus_aggregation_new.c.customer,
        "supplier": sonus_aggregation_new.c.supplier,
        "destination": sonus_aggregation_new.c.destination,
    }
    col = col_map.get(k)
    if col is None:
        raise HTTPException(status_code=400, detail="Unsupported kind")

    stmt = select(func.distinct(col)).order_by(col.asc()).limit(limit)
    if q:
        stmt = stmt.where(col.ilike(f"{q}%"))

    async with get_session() as session:
        res = await session.execute(stmt)
        values = [v for v in res.scalars().all() if v is not None]

    return {"items": values}
