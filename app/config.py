# app/config.py
"""
Centralized application configuration using pydantic-settings.

All settings are read from environment variables or .env file.
For legacy CentOS deployments, just modify .env - no code changes needed.
"""

import os
from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables.
    
    Priority: environment variables > .env file > defaults
    """
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # Ignore unknown env vars
    )
    
    # --- Database ---
    DB_URL: str = Field(
        default="postgresql://localhost:5432/aggregation",
        description="PostgreSQL connection URL"
    )
    
    # --- Redis ---
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL"
    )
    
    # --- Server ---
    HOST: str = Field(
        default="127.0.0.1",
        description="Server bind host"
    )
    PORT: int = Field(
        default=8888,
        description="Server bind port"
    )
    
    # --- Debug / Logging ---
    DEBUG: bool = Field(
        default=False,
        description="Enable debug mode"
    )
    LOG_LEVEL: str = Field(
        default="INFO",
        description="Logging level (DEBUG, INFO, WARNING, ERROR)"
    )
    
    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        v_upper = v.upper()
        if v_upper not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {allowed}")
        return v_upper


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance (singleton pattern)."""
    return Settings()


# --- Singleton instance for easy import ---
settings = get_settings()


# --- Backward-compatible module-level exports ---
# These allow existing code using `config.DATABASE_URL` to keep working.

# Database
DATABASE_URL: str = settings.DB_URL

# Server
HOST: str = settings.HOST
PORT: int = settings.PORT
DEBUG: bool = settings.DEBUG
LOG_LEVEL: str = settings.LOG_LEVEL

# Redis
REDIS_URL: str = settings.REDIS_URL

# --- Paths (computed, not from env) ---
PROJECT_ROOT: str = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STATIC_PATH: str = os.path.join(PROJECT_ROOT, "static")
TEMPLATE_PATH: str = os.path.join(PROJECT_ROOT, "templates")
LOGS_PATH: str = os.path.join(PROJECT_ROOT, "logs")
STATIC_URL_PREFIX: str = "/static/"