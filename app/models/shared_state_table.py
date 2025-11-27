# app/models/shared_state_table.py
# Model for storing shared UI state (short links)

from sqlalchemy import Table, Column, Text, TIMESTAMP, Index
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import metadata


shared_state = Table(
    'shared_state',
    metadata,
    Column('id', Text, primary_key=True),  # short URL-safe ID
    Column('state', JSONB, nullable=False),  # JSON state payload
    Column('created_at', TIMESTAMP(timezone=True), nullable=False),
    Index('ix_shared_state_created_at', 'created_at'),
    schema='public',
)
