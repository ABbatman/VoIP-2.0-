# tests/integration/test_repository_metrics.py
# Integration tests for repositories/services using containerized Postgres/Redis.
# Ensures app/db/db.py & app/db/base.py use env-provided URLs and work end-to-end.

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import insert, delete, select

from app.repositories.metrics_repository import MetricsRepository
from app.models.aggregation_table import sonus_aggregation_new
from app.models.metrics_table import metrics
from app.db.base import get_session


@pytest.mark.asyncio
async def test_repository_reads_from_aggregation_table(postgres_url: str):
    # Arrange: clean and seed aggregation source table
    now = datetime.now(timezone.utc).replace(microsecond=0)
    within_from = now - timedelta(hours=1)
    within_to = now + timedelta(hours=1)

    async with get_session() as session:
        # Clean any previous rows
        await session.execute(delete(sonus_aggregation_new))
        # Seed one row in the time window
        await session.execute(
            insert(sonus_aggregation_new).values(
                time=now,
                customer="custA",
                supplier="supA",
                destination="destA",
                seconds=60,
                start_nuber=1,
                start_attempt=1,
                start_uniq_attempt=1,
                answer_time=5,
                pdd=2,
            )
        )
        await session.commit()

    repo = MetricsRepository()
    rows = await repo.get_metrics(
        {
            "customer": "custA",
            "supplier": "supA",
            "destination": "destA",
            "time_from": within_from,
            "time_to": within_to,
        },
        limit=10,
    )

    assert len(rows) == 1
    assert rows[0]["customer"] == "custA"
    assert rows[0]["supplier"] == "supA"
    assert rows[0]["destination"] == "destA"


@pytest.mark.asyncio
async def test_repository_insert_metric_writes_to_metrics_table(postgres_url: str):
    # Arrange: clean target table
    async with get_session() as session:
        await session.execute(delete(metrics))
        await session.commit()

    repo = MetricsRepository()
    now = datetime.now(timezone.utc).replace(microsecond=0)
    new_id = await repo.insert_metric(
        {
            "time": now,
            "customer": "custB",
            "supplier": "supB",
            "destination": "destB",
            "seconds": 120,
            "start_nuber": 2,
            "start_attempt": 2,
            "start_uniq_attempt": 2,
            "answer_time": 7.5,
            "pdd": 3.3,
        }
    )

    assert isinstance(new_id, int) and new_id > 0

    # Verify via direct SELECT
    async with get_session() as session:
        res = await session.execute(select(metrics).where(metrics.c.id == new_id))
        row = res.mappings().first()
        assert row is not None
        assert row["customer"] == "custB"
        assert row["supplier"] == "supB"
        assert row["destination"] == "destB"
