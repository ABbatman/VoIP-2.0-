# app/routers/health.py
# Health check endpoints for monitoring and load balancers
# Provides liveness and readiness probes

import time
import asyncio
import logging
from typing import Dict, Any
from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.db.db import get_db_pool, get_connection

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])


class HealthStatus(BaseModel):
    """Health check response model."""
    status: str  # "healthy", "degraded", "unhealthy"
    timestamp: float
    version: str = "1.0.0"
    checks: Dict[str, Dict[str, Any]] = {}


class ComponentHealth(BaseModel):
    """Individual component health."""
    status: str
    latency_ms: float = 0.0
    message: str = ""


async def check_database_health() -> ComponentHealth:
    """Check database connection pool health."""
    start = time.time()
    
    try:
        pool = get_db_pool()
        if pool is None:
            return ComponentHealth(
                status="unhealthy",
                message="Database pool not initialized"
            )
        
        # Check pool stats
        pool_size = pool.get_size()
        pool_free = pool.get_idle_size()
        
        # Try to execute a simple query
        async with get_connection() as conn:
            result = await conn.fetchval("SELECT 1")
            if result != 1:
                return ComponentHealth(
                    status="unhealthy",
                    latency_ms=(time.time() - start) * 1000,
                    message="Database query returned unexpected result"
                )
        
        latency_ms = (time.time() - start) * 1000
        
        # Warn if pool is running low
        if pool_free < 2:
            return ComponentHealth(
                status="degraded",
                latency_ms=latency_ms,
                message=f"Pool running low: {pool_free}/{pool_size} connections free"
            )
        
        return ComponentHealth(
            status="healthy",
            latency_ms=latency_ms,
            message=f"Pool: {pool_free}/{pool_size} connections free"
        )
        
    except asyncio.TimeoutError:
        return ComponentHealth(
            status="unhealthy",
            latency_ms=(time.time() - start) * 1000,
            message="Database connection timeout"
        )
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return ComponentHealth(
            status="unhealthy",
            latency_ms=(time.time() - start) * 1000,
            message=f"Database error: {type(e).__name__}"
        )


@router.get("/health", response_model=HealthStatus)
async def health_check(response: Response):
    """
    Full health check endpoint.
    Returns status of all components.
    Used by monitoring systems and detailed health queries.
    """
    timestamp = time.time()
    checks = {}
    overall_status = "healthy"
    
    # Check database
    db_health = await check_database_health()
    checks["database"] = {
        "status": db_health.status,
        "latency_ms": round(db_health.latency_ms, 2),
        "message": db_health.message
    }
    
    # Determine overall status
    statuses = [c["status"] for c in checks.values()]
    if "unhealthy" in statuses:
        overall_status = "unhealthy"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    elif "degraded" in statuses:
        overall_status = "degraded"
        response.status_code = status.HTTP_200_OK
    else:
        response.status_code = status.HTTP_200_OK
    
    return HealthStatus(
        status=overall_status,
        timestamp=timestamp,
        checks=checks
    )


@router.get("/health/live")
async def liveness_probe():
    """
    Kubernetes liveness probe.
    Returns 200 if the application is running.
    Does NOT check external dependencies.
    """
    return {"status": "alive"}


@router.get("/health/ready")
async def readiness_probe(response: Response):
    """
    Kubernetes readiness probe.
    Returns 200 only if the application can serve traffic.
    Checks critical dependencies (database).
    """
    db_health = await check_database_health()
    
    if db_health.status == "unhealthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "not_ready",
            "reason": db_health.message
        }
    
    return {"status": "ready"}


@router.get("/health/db")
async def database_health(response: Response):
    """
    Detailed database health check.
    Returns pool statistics and connection status.
    """
    pool = get_db_pool()
    
    if pool is None:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "unhealthy",
            "message": "Database pool not initialized"
        }
    
    try:
        # Get pool stats
        stats = {
            "pool_size": pool.get_size(),
            "pool_free": pool.get_idle_size(),
            "pool_min": pool.get_min_size(),
            "pool_max": pool.get_max_size(),
        }
        
        # Test connection
        start = time.time()
        async with get_connection() as conn:
            await conn.fetchval("SELECT 1")
        latency_ms = (time.time() - start) * 1000
        
        return {
            "status": "healthy",
            "latency_ms": round(latency_ms, 2),
            "pool": stats
        }
        
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "unhealthy",
            "error": str(e)
        }
