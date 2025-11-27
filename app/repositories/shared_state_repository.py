# app/repositories/shared_state_repository.py
# Repository for shared state CRUD operations

from __future__ import annotations

import secrets
import string
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.db.base import get_session
from app.models.shared_state_table import shared_state


def _generate_short_id(length: int = 8) -> str:
    """Generate a URL-safe short ID."""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


class SharedStateRepository:
    """Repository for shared state persistence."""

    async def save(self, state_data: dict[str, Any]) -> str:
        """Save state and return short ID."""
        short_id = _generate_short_id()
        now = datetime.now(timezone.utc)

        async with get_session() as session:
            # insert new row
            await session.execute(
                shared_state.insert().values(
                    id=short_id,
                    state=state_data,
                    created_at=now,
                )
            )
            await session.commit()

        return short_id

    async def load(self, short_id: str) -> dict[str, Any] | None:
        """Load state by short ID. Returns None if not found."""
        async with get_session() as session:
            result = await session.execute(
                select(shared_state.c.state).where(shared_state.c.id == short_id)
            )
            row = result.fetchone()
            if row:
                return row[0]
        return None
