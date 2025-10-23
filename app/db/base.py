from __future__ import annotations

import re
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app import config


def _to_asyncpg_url(sync_or_async_url: str) -> str:
    """
    Ensure the database URL uses SQLAlchemy's asyncpg dialect.

    Accepts URLs like:
      - postgresql://user:pass@host:port/db
      - postgres://user:pass@host:port/db
      - postgresql+asyncpg://user:pass@host:port/db (already async)

    Returns a URL starting with 'postgresql+asyncpg://'.
    """
    if sync_or_async_url.startswith("postgresql+asyncpg://"):
        return sync_or_async_url
    # Normalize common postgres schemes to asyncpg
    if sync_or_async_url.startswith("postgresql://"):
        return sync_or_async_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if sync_or_async_url.startswith("postgres://"):
        return sync_or_async_url.replace("postgres://", "postgresql+asyncpg://", 1)
    # Fallback: if scheme is missing or different, attempt best-effort swap
    return re.sub(r"^[a-zA-Z0-9+.-]+://", "postgresql+asyncpg://", sync_or_async_url, count=1)


# Shared MetaData instance to be used by models and Alembic autogenerate.
# Keep a single metadata object to avoid mismatched tables in migrations.
metadata: MetaData = MetaData()


# Create the async engine using asyncpg
# Echo is tied to DEBUG for easy SQL troubleshooting in dev.
ASYNC_DATABASE_URL: str = _to_asyncpg_url(config.DATABASE_URL)
async_engine: AsyncEngine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=config.DEBUG,
    pool_pre_ping=True,
    future=True,
)


# Async session factory
# expire_on_commit=False so results remain usable after commit.
AsyncSessionFactory = async_sessionmaker(
    bind=async_engine,
    expire_on_commit=False,
    autoflush=False,
)


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield a SQLAlchemy AsyncSession bound to the async engine."""
    async with AsyncSessionFactory() as session:
        yield session


