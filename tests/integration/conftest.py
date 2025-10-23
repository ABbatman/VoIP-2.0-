# tests/integration/conftest.py
# Pytest fixtures to start PostgreSQL & Redis via TestContainers.
# - Provides connection URLs via fixtures and environment variables for the app under test.
# - Cleans up containers after the test session.
#
# Comments:
# // start test containers
# // clean up after tests

import os
import pytest  # type: ignore[import-not-found]
from typing import Iterator

from testcontainers.postgres import PostgresContainer  # type: ignore
from testcontainers.redis import RedisContainer  # type: ignore

# Optional Alembic programmatic API
try:
    from alembic import command as alembic_command  # type: ignore
    from alembic.config import Config as AlembicConfig  # type: ignore
    HAVE_ALEMBIC = True
except Exception:
    HAVE_ALEMBIC = False


@pytest.fixture(scope="session")
def postgres_url() -> Iterator[str]:
    # // start test containers (PostgreSQL)
    with PostgresContainer("postgres:16-alpine") as pg:
        # Force a simple DB name for clarity
        db_url = pg.get_connection_url()
        # Example: postgresql://test:test@0.0.0.0:5432/test
        yield db_url
        # // clean up after tests (container stops via context manager)


@pytest.fixture(scope="session")
def redis_url() -> Iterator[str]:
    # // start test containers (Redis)
    with RedisContainer("redis:7-alpine") as rc:
        url = rc.get_connection_url()
        # Example: redis://0.0.0.0:6379/0
        yield url
        # // clean up after tests (container stops via context manager)


@pytest.fixture(scope="session", autouse=True)
def inject_env(postgres_url: str, redis_url: str):
    """Automatically inject container URLs into environment for the app under test.
    This ensures the application connects to containers instead of local services.
    """
    old_db = os.environ.get("DB_URL")
    old_redis = os.environ.get("REDIS_URL")
    os.environ["DB_URL"] = postgres_url
    os.environ["REDIS_URL"] = redis_url
    # Rebind application DB modules to container URLs before imports in tests resolve
    try:
        import importlib
        import app.config as _cfg
        _ = importlib.reload(_cfg)
        import app.db.base as _dbbase
        _ = importlib.reload(_dbbase)
    except Exception:
        pass

    # Optionally initialize DB schema for tests (alembic or fallback DDL)
    _maybe_prepare_db_schema(postgres_url)
    yield
    # restore
    if old_db is None:
        os.environ.pop("DB_URL", None)
    else:
        os.environ["DB_URL"] = old_db
    if old_redis is None:
        os.environ.pop("REDIS_URL", None)
    else:
        os.environ["REDIS_URL"] = old_redis


def _maybe_prepare_db_schema(pg_url: str) -> None:
    """Try to run Alembic migrations; if not configured, create minimal tables needed for tests.
    This runs at session start and does not change application code.
    """
    # 1) Try Alembic if available and alembic.ini exists
    try:
        import os as _os
        ini_path = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.dirname(__file__))), "alembic.ini")
        if HAVE_ALEMBIC and _os.path.isfile(ini_path):
            cfg = AlembicConfig(ini_path)
            # Override sqlalchemy.url for tests
            cfg.set_main_option("sqlalchemy.url", pg_url)
            alembic_command.upgrade(cfg, "head")
            return
    except Exception:
        pass

    # 2) Fallback: create minimal tables via asyncpg
    try:
        import asyncio as _asyncio
        import asyncpg as _asyncpg

        async def _ddl():
            conn = await _asyncpg.connect(dsn=pg_url)
            try:
                # Create schemas/tables if not exist; minimal columns used in code
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS public.metrics (
                        id SERIAL PRIMARY KEY,
                        time TIMESTAMPTZ NOT NULL,
                        customer TEXT NOT NULL,
                        supplier TEXT NOT NULL,
                        destination TEXT NOT NULL,
                        seconds INTEGER NULL,
                        start_nuber INTEGER NULL,
                        start_attempt INTEGER NULL,
                        start_uniq_attempt INTEGER NULL,
                        answer_time NUMERIC(10,2) NULL,
                        pdd NUMERIC(10,2) NULL
                    );
                    CREATE TABLE IF NOT EXISTS public.sonus_aggregation_new (
                        time TIMESTAMPTZ NOT NULL,
                        customer TEXT NULL,
                        supplier TEXT NULL,
                        destination TEXT NULL,
                        seconds INTEGER NULL,
                        start_nuber INTEGER NULL,
                        start_attempt INTEGER NULL,
                        start_uniq_attempt INTEGER NULL,
                        answer_time INTEGER NULL,
                        pdd INTEGER NULL
                    );
                    """
                )
            finally:
                await conn.close()

        _asyncio.get_event_loop().run_until_complete(_ddl())
    except Exception:
        # As a last resort, skip schema bootstrap to not block entire test run
        pass
