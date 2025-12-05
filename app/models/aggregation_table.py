from sqlalchemy import Table, Column, Integer, Text, TIMESTAMP

from app.db.base import metadata


sonus_aggregation_new = Table(
    'sonus_aggregation_new',
    metadata,
    Column('time', TIMESTAMP(timezone=True), nullable=False),
    Column('customer', Text, nullable=True),
    Column('supplier', Text, nullable=True),
    Column('destination', Text, nullable=True),
    Column('seconds', Integer, nullable=True),
    Column('start_nuber', Integer, nullable=True),
    Column('start_attempt', Integer, nullable=True),
    Column('start_uniq_attempt', Integer, nullable=True),
    Column('answer_time', Integer, nullable=True),
    Column('pdd', Integer, nullable=True),
    schema='public',
)
