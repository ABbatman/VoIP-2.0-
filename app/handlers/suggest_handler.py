# app/handlers/suggest_handler.py
from __future__ import annotations

import tornado.web
from sqlalchemy import select, func

from app.db.base import get_session
from app.models.aggregation_table import sonus_aggregation_new
from app.utils.logger import log_info, json_error, json_response


class SuggestHandler(tornado.web.RequestHandler):
    """Return unique values for customer/supplier/destination with optional prefix filter."""

    async def get(self, kind: str):
        # Validate kind and map to column
        kind = (kind or "").lower()
        col_map = {
            "customer": sonus_aggregation_new.c.customer,
            "supplier": sonus_aggregation_new.c.supplier,
            "destination": sonus_aggregation_new.c.destination,
        }
        col = col_map.get(kind)
        if col is None:
            return json_error(self, "Unsupported kind", status=400)

        # Query param name is 'q' (prefix)
        q = self.get_argument("q", default="").strip()
        log_info(f"SuggestHandler {kind} q='{q}'")

        # Build statement: SELECT DISTINCT col FROM table [WHERE col ILIKE q%] ORDER BY col ASC
        stmt = select(func.distinct(col).label("v")).order_by(col.asc())
        if q:
            # Prefix search, case-insensitive
            stmt = stmt.where(col.ilike(f"{q}%"))

        async with get_session() as session:
            res = await session.execute(stmt)
            # Use scalars() to get first column values
            values = [v for v in res.scalars().all() if v is not None]

        # Return as an object to satisfy json_response(dict)
        return json_response(self, {"items": values})
