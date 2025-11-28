# app/middleware/rate_limiter.py
# Rate limiting middleware to protect against DDoS attacks
# Uses in-memory sliding window counter (can be upgraded to Redis for distributed)

import time
from collections import defaultdict
from typing import Dict, Tuple
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.utils.logger import log_info
import logging

logger = logging.getLogger(__name__)


class RateLimitExceeded(HTTPException):
    """Custom exception for rate limit exceeded."""
    def __init__(self, retry_after: int = 60):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Retry after {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )


class SlidingWindowCounter:
    """
    Sliding window rate limiter implementation.
    More accurate than fixed window, less memory than sliding log.
    """
    
    def __init__(self, window_size: int = 60, max_requests: int = 100):
        self.window_size = window_size  # seconds
        self.max_requests = max_requests
        # key -> (prev_count, curr_count, window_start)
        self._counters: Dict[str, Tuple[int, int, float]] = defaultdict(lambda: (0, 0, 0.0))
    
    def is_allowed(self, key: str) -> Tuple[bool, int]:
        """
        Check if request is allowed for given key.
        Returns (is_allowed, remaining_requests).
        """
        now = time.time()
        prev_count, curr_count, window_start = self._counters[key]
        
        # Calculate current window
        current_window = now // self.window_size
        
        if window_start < current_window - 1:
            # More than one window has passed, reset
            prev_count = 0
            curr_count = 1
            window_start = current_window
        elif window_start < current_window:
            # Previous window, slide
            prev_count = curr_count
            curr_count = 1
            window_start = current_window
        else:
            # Same window
            curr_count += 1
        
        # Calculate weighted count (sliding window approximation)
        elapsed_in_window = now % self.window_size
        weight = elapsed_in_window / self.window_size
        weighted_count = prev_count * (1 - weight) + curr_count
        
        self._counters[key] = (prev_count, curr_count, window_start)
        
        remaining = max(0, int(self.max_requests - weighted_count))
        is_allowed = weighted_count <= self.max_requests
        
        return is_allowed, remaining
    
    def cleanup_old_entries(self, max_age: int = 300):
        """Remove entries older than max_age seconds."""
        now = time.time()
        current_window = now // self.window_size
        keys_to_remove = []
        
        for key, (_, _, window_start) in self._counters.items():
            if current_window - window_start > max_age // self.window_size:
                keys_to_remove.append(key)
        
        for key in keys_to_remove:
            del self._counters[key]


# Global rate limiter instance
_rate_limiter = SlidingWindowCounter(window_size=60, max_requests=100)
_api_rate_limiter = SlidingWindowCounter(window_size=60, max_requests=60)  # stricter for API


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for rate limiting.
    Different limits for API endpoints vs static content.
    """
    
    def __init__(self, app, api_limit: int = 60, general_limit: int = 100):
        super().__init__(app)
        self.api_limiter = SlidingWindowCounter(window_size=60, max_requests=api_limit)
        self.general_limiter = SlidingWindowCounter(window_size=60, max_requests=general_limit)
        self._last_cleanup = time.time()
    
    def _get_client_key(self, request: Request) -> str:
        """Extract client identifier from request."""
        # Try to get real IP from proxy headers
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            # Take first IP (original client)
            return forwarded.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fallback to direct client
        if request.client:
            return request.client.host
        
        return "unknown"
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path in ("/health", "/health/", "/api/health"):
            return await call_next(request)
        
        # Periodic cleanup (every 5 minutes)
        now = time.time()
        if now - self._last_cleanup > 300:
            self.api_limiter.cleanup_old_entries()
            self.general_limiter.cleanup_old_entries()
            self._last_cleanup = now
        
        client_key = self._get_client_key(request)
        
        # Choose limiter based on path
        is_api = request.url.path.startswith("/api/")
        limiter = self.api_limiter if is_api else self.general_limiter
        
        is_allowed, remaining = limiter.is_allowed(client_key)
        
        if not is_allowed:
            logger.warning(f"Rate limit exceeded for {client_key} on {request.url.path}")
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests. Please slow down.",
                    "retry_after": 60
                },
                headers={"Retry-After": "60", "X-RateLimit-Remaining": "0"}
            )
        
        # Add rate limit headers to response
        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Limit"] = str(
            self.api_limiter.max_requests if is_api else self.general_limiter.max_requests
        )
        
        return response


def get_rate_limiter() -> SlidingWindowCounter:
    """Get global rate limiter instance."""
    return _rate_limiter
