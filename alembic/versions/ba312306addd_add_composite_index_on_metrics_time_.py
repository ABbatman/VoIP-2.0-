"""add composite index on metrics (time desc, customer, supplier)

Revision ID: ba312306addd
Revises: 0a1fff1a6b0c
Create Date: 2025-08-28 13:05:22.027097

"""
from typing import Sequence, Union
from alembic import op  # type: ignore
import sqlalchemy as sa  # type: ignore
# revision identifiers, used by Alembic.
revision: str = 'ba312306addd'
down_revision: Union[str, Sequence[str], None] = '0a1fff1a6b0c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    """Upgrade schema."""
    # Create composite index with DESC on time for recent-first queries
    op.create_index(
        'ix_metrics_time_desc_customer_supplier',
        'metrics',
        [sa.text('time DESC'), 'customer', 'supplier'],
        unique=False,
        schema='public',
        postgresql_using='btree',
    )



def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_metrics_time_desc_customer_supplier', table_name='metrics', schema='public')
