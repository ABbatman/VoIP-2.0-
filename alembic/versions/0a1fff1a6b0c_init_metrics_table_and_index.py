"""init metrics table and index

Revision ID: 0a1fff1a6b0c
Revises: 
Create Date: 2025-08-28 07:06:51.019768

"""
from typing import Sequence, Union

from alembic import op  # type: ignore
import sqlalchemy as sa  # type: ignore


# revision identifiers, used by Alembic.
revision: str = '0a1fff1a6b0c'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    """Upgrade schema."""
    # Create table public.metrics
    op.create_table(
        'metrics',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('time', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('customer', sa.Text(), nullable=False),
        sa.Column('supplier', sa.Text(), nullable=False),
        sa.Column('destination', sa.Text(), nullable=False),
        sa.Column('seconds', sa.Integer(), nullable=True),
        sa.Column('start_nuber', sa.Integer(), nullable=True),
        sa.Column('start_attempt', sa.Integer(), nullable=True),
        sa.Column('start_uniq_attempt', sa.Integer(), nullable=True),
        sa.Column('answer_time', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('pdd', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        schema='public',
    )

    # Composite index on (time, customer, supplier)
    op.create_index(
        'ix_metrics_time_customer_supplier',
        'metrics',
        ['time', 'customer', 'supplier'],
        unique=False,
        schema='public',
    )



def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_metrics_time_customer_supplier', table_name='metrics', schema='public')
    op.drop_table('metrics', schema='public')
