# app/db/db.py

import asyncpg
from contextlib import asynccontextmanager
from app import config
from app.utils.logger import log_info

# A global variable to hold the connection pool.
pool = None

async def init_db_pool():
    """
    Initializes the asynchronous database connection pool.
    """
    global pool
    if pool is None:
        try:
            pool = await asyncpg.create_pool(
                dsn=config.DATABASE_URL,
                min_size=5,
                max_size=20
            )
            log_info("Database connection pool created")
        except Exception as e:
            log_info(f"Failed to create database connection pool: {e}")
            raise e

@asynccontextmanager
async def get_connection():
    """
    Acquires a connection from the pool as an asynchronous context manager.
    It ensures the connection is acquired and released correctly.
    """
    if pool is None:
        raise RuntimeError("Database pool is not initialized. Call init_db_pool() first.")
    
    conn = None
    try:
        # Acquire a connection from the pool
        conn = await pool.acquire()
        # Yield it to the 'with' block
        yield conn
    finally:
        # This block will always run, ensuring the connection is released
        if conn:
            await pool.release(conn)

def get_db_pool():
    """
    Returns the entire pool object. Useful for graceful shutdown.
    """
    return pool