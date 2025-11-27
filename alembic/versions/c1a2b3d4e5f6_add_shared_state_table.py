"""add shared_state table

Revision ID: c1a2b3d4e5f6
Revises: ba312306addd
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, None] = 'ba312306addd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create shared_state table for short link persistence
    op.create_table(
        'shared_state',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('state', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='public'
    )
    # Index for cleanup queries by timestamp
    op.create_index(
        'ix_shared_state_created_at',
        'shared_state',
        ['created_at'],
        schema='public'
    )


def downgrade() -> None:
    op.drop_index('ix_shared_state_created_at', table_name='shared_state', schema='public')
    op.drop_table('shared_state', schema='public')
