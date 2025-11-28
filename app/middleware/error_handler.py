# app/middleware/error_handler.py
# Structured error handling middleware
# Catches unhandled exceptions and returns consistent JSON responses

import traceback
import logging
from typing import Callable
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.utils.logger import log_exception

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base application error with structured response."""
    
    def __init__(
        self,
        message: str,
        error_code: str = "INTERNAL_ERROR",
        status_code: int = 500,
        details: dict = None
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}


class DatabaseError(AppError):
    """Database operation failed."""
    def __init__(self, message: str = "Database operation failed", details: dict = None):
        super().__init__(
            message=message,
            error_code="DATABASE_ERROR",
            status_code=503,
            details=details
        )


class ValidationError(AppError):
    """Request validation failed."""
    def __init__(self, message: str = "Validation failed", details: dict = None):
        super().__init__(
            message=message,
            error_code="VALIDATION_ERROR",
            status_code=400,
            details=details
        )


class NotFoundError(AppError):
    """Resource not found."""
    def __init__(self, message: str = "Resource not found", details: dict = None):
        super().__init__(
            message=message,
            error_code="NOT_FOUND",
            status_code=404,
            details=details
        )


class RateLimitError(AppError):
    """Rate limit exceeded."""
    def __init__(self, retry_after: int = 60):
        super().__init__(
            message=f"Rate limit exceeded. Retry after {retry_after} seconds.",
            error_code="RATE_LIMIT_EXCEEDED",
            status_code=429,
            details={"retry_after": retry_after}
        )


def create_error_response(
    error_code: str,
    message: str,
    status_code: int,
    details: dict = None,
    request_id: str = None
) -> JSONResponse:
    """Create a standardized JSON error response."""
    content = {
        "error": {
            "code": error_code,
            "message": message,
        }
    }
    
    if details:
        content["error"]["details"] = details
    
    if request_id:
        content["error"]["request_id"] = request_id
    
    return JSONResponse(status_code=status_code, content=content)


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """
    Middleware that catches all unhandled exceptions and returns
    consistent JSON error responses.
    """
    
    def __init__(self, app, debug: bool = False):
        super().__init__(app)
        self.debug = debug
    
    async def dispatch(self, request: Request, call_next: Callable):
        # Generate request ID for tracing
        request_id = request.headers.get("X-Request-ID", str(id(request)))
        
        try:
            response = await call_next(request)
            return response
            
        except AppError as e:
            # Known application errors
            logger.warning(
                f"AppError: {e.error_code} - {e.message}",
                extra={"request_id": request_id, "path": request.url.path}
            )
            return create_error_response(
                error_code=e.error_code,
                message=e.message,
                status_code=e.status_code,
                details=e.details,
                request_id=request_id
            )
            
        except HTTPException as e:
            # FastAPI HTTP exceptions
            logger.warning(
                f"HTTPException: {e.status_code} - {e.detail}",
                extra={"request_id": request_id, "path": request.url.path}
            )
            return create_error_response(
                error_code="HTTP_ERROR",
                message=str(e.detail),
                status_code=e.status_code,
                request_id=request_id
            )
            
        except Exception as e:
            # Unhandled exceptions
            error_details = None
            if self.debug:
                error_details = {
                    "type": type(e).__name__,
                    "traceback": traceback.format_exc()
                }
            
            # Log full traceback
            log_exception(e, context=f"Unhandled error on {request.url.path}")
            logger.error(
                f"Unhandled exception: {type(e).__name__}: {str(e)}",
                extra={"request_id": request_id, "path": request.url.path},
                exc_info=True
            )
            
            return create_error_response(
                error_code="INTERNAL_ERROR",
                message="An internal error occurred. Please try again later.",
                status_code=500,
                details=error_details,
                request_id=request_id
            )


def setup_exception_handlers(app):
    """Register exception handlers on FastAPI app."""
    
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return create_error_response(
            error_code=exc.error_code,
            message=exc.message,
            status_code=exc.status_code,
            details=exc.details
        )
    
    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        log_exception(exc, context=f"Unhandled error on {request.url.path}")
        return create_error_response(
            error_code="INTERNAL_ERROR",
            message="An internal error occurred",
            status_code=500
        )
