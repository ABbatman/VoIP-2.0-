# tests/integration/test_containers_smoke.py
# Simple smoke tests to ensure TestContainers-backed Postgres & Redis are reachable
# and tests use container URLs, not any local services.

import asyncio

import pytest  # type: ignore[import-not-found]
import asyncpg
from redis.asyncio import from_url as redis_from_url  # type: ignore


@pytest.mark.asyncio
async def test_postgres_container_connect(postgres_url: str):
    # Connect and run a trivial query
    conn = await asyncpg.connect(dsn=postgres_url)
    try:
        val = await conn.fetchval("SELECT 1")
        assert val == 1
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_redis_container_connect(redis_url: str):
    r = redis_from_url(redis_url)
    try:
        pong = await r.ping()
        assert pong is True
    finally:
        # Ensure DB is clean per test
        await r.flushdb()
        await r.close()
