from sqlalchemy import Table, Column, Integer, Text, TIMESTAMP, Numeric, Index

from app.db.base import metadata


metrics = Table(
    'metrics',
    metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),
    Column('time', TIMESTAMP(timezone=True), nullable=False),
    Column('customer', Text, nullable=False),
    Column('supplier', Text, nullable=False),
    Column('destination', Text, nullable=False),
    Column('seconds', Integer, nullable=True),
    Column('start_nuber', Integer, nullable=True),
    Column('start_attempt', Integer, nullable=True),
    Column('start_uniq_attempt', Integer, nullable=True),
    Column('answer_time', Numeric(10, 2), nullable=True),
    Column('pdd', Numeric(10, 2), nullable=True),
    Index('ix_metrics_time_customer_supplier', 'time', 'customer', 'supplier'),
    schema='public',
)
