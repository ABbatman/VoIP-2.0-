# app/db/db.py

import psycopg2
from psycopg2.extras import RealDictCursor
# Import our centralized config
from app import config

def get_connection():
    """
    Establishes a database connection using the DATABASE_URL from the central config.
    """
    return psycopg2.connect(config.DATABASE_URL, cursor_factory=RealDictCursor)