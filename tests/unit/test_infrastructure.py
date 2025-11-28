# tests/unit/test_infrastructure.py
# Unit tests for infrastructure components

import pytest
import asyncio
import time


class TestRateLimiter:
    """Test rate limiter implementation."""

    def test_sliding_window_allows_requests_under_limit(self):
        from app.middleware.rate_limiter import SlidingWindowCounter
        
        limiter = SlidingWindowCounter(window_size=60, max_requests=10)
        
        # First 10 requests should be allowed
        for i in range(10):
            allowed, remaining = limiter.is_allowed("test_client")
            assert allowed, f"Request {i+1} should be allowed"
        
        # 11th request should be rejected
        allowed, remaining = limiter.is_allowed("test_client")
        assert not allowed, "11th request should be rejected"

    def test_different_clients_have_separate_limits(self):
        from app.middleware.rate_limiter import SlidingWindowCounter
        
        limiter = SlidingWindowCounter(window_size=60, max_requests=5)
        
        # Fill up client1's limit
        for _ in range(5):
            limiter.is_allowed("client1")
        
        # client2 should still be allowed
        allowed, _ = limiter.is_allowed("client2")
        assert allowed, "Different client should have separate limit"

    def test_cleanup_removes_old_entries(self):
        from app.middleware.rate_limiter import SlidingWindowCounter
        
        limiter = SlidingWindowCounter(window_size=60, max_requests=10)
        limiter.is_allowed("old_client")
        
        # Manually set old window start (simulate time passing)
        limiter._counters["old_client"] = (0, 1, 0)  # Very old window
        
        limiter.cleanup_old_entries(max_age=60)
        
        assert "old_client" not in limiter._counters


class TestCircuitBreaker:
    """Test circuit breaker implementation."""

    @pytest.mark.asyncio
    async def test_circuit_starts_closed(self):
        from app.middleware.circuit_breaker import CircuitBreaker, CircuitState
        
        cb = CircuitBreaker("test", failure_threshold=3)
        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_circuit_opens_after_failures(self):
        from app.middleware.circuit_breaker import CircuitBreaker, CircuitState
        
        cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=30)
        
        # Simulate failures
        async def failing_func():
            raise Exception("Test error")
        
        for _ in range(3):
            try:
                await cb.call(failing_func)
            except Exception:
                pass
        
        assert cb.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_circuit_rejects_when_open(self):
        from app.middleware.circuit_breaker import (
            CircuitBreaker, CircuitState, CircuitBreakerError
        )
        
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=30)
        
        # Open the circuit
        async def failing_func():
            raise Exception("Test error")
        
        try:
            await cb.call(failing_func)
        except Exception:
            pass
        
        assert cb.state == CircuitState.OPEN
        
        # Next call should raise CircuitBreakerError
        with pytest.raises(CircuitBreakerError):
            async def any_func():
                return "result"
            await cb.call(any_func)

    @pytest.mark.asyncio
    async def test_circuit_success_resets_failure_count(self):
        from app.middleware.circuit_breaker import CircuitBreaker
        
        cb = CircuitBreaker("test", failure_threshold=3)
        
        # Some failures
        async def failing_func():
            raise Exception("Test error")
        
        for _ in range(2):
            try:
                await cb.call(failing_func)
            except Exception:
                pass
        
        # Now a success
        async def success_func():
            return "ok"
        
        await cb.call(success_func)
        
        assert cb._failure_count == 0

    def test_circuit_manual_reset(self):
        from app.middleware.circuit_breaker import CircuitBreaker, CircuitState
        
        cb = CircuitBreaker("test", failure_threshold=1)
        cb._state = CircuitState.OPEN
        cb._failure_count = 5
        
        cb.reset()
        
        assert cb.state == CircuitState.CLOSED
        assert cb._failure_count == 0


class TestErrorHandler:
    """Test error handler classes."""

    def test_app_error_has_correct_properties(self):
        from app.middleware.error_handler import AppError
        
        error = AppError(
            message="Test error",
            error_code="TEST_ERROR",
            status_code=400,
            details={"field": "value"}
        )
        
        assert error.message == "Test error"
        assert error.error_code == "TEST_ERROR"
        assert error.status_code == 400
        assert error.details == {"field": "value"}

    def test_database_error_defaults(self):
        from app.middleware.error_handler import DatabaseError
        
        error = DatabaseError()
        
        assert error.error_code == "DATABASE_ERROR"
        assert error.status_code == 503

    def test_validation_error_defaults(self):
        from app.middleware.error_handler import ValidationError
        
        error = ValidationError("Invalid input")
        
        assert error.error_code == "VALIDATION_ERROR"
        assert error.status_code == 400

    def test_create_error_response_structure(self):
        from app.middleware.error_handler import create_error_response
        
        response = create_error_response(
            error_code="TEST",
            message="Test message",
            status_code=400,
            details={"key": "value"},
            request_id="req-123"
        )
        
        assert response.status_code == 400
        # Response body will be JSON with error structure


class TestRetryWithBackoff:
    """Test retry decorator."""

    @pytest.mark.asyncio
    async def test_retry_succeeds_after_failures(self):
        from app.middleware.circuit_breaker import retry_with_backoff
        
        call_count = 0
        
        @retry_with_backoff(max_retries=3, base_delay=0.01)
        async def flaky_func():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ValueError("Not ready yet")
            return "success"
        
        result = await flaky_func()
        
        assert result == "success"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_retry_raises_after_max_retries(self):
        from app.middleware.circuit_breaker import retry_with_backoff
        
        @retry_with_backoff(max_retries=2, base_delay=0.01)
        async def always_fails():
            raise ValueError("Always fails")
        
        with pytest.raises(ValueError):
            await always_fails()


class TestTimeout:
    """Test timeout decorator."""

    @pytest.mark.asyncio
    async def test_timeout_allows_fast_operations(self):
        from app.middleware.circuit_breaker import with_timeout
        
        @with_timeout(1.0)
        async def fast_func():
            return "done"
        
        result = await fast_func()
        assert result == "done"

    @pytest.mark.asyncio
    async def test_timeout_raises_on_slow_operations(self):
        from app.middleware.circuit_breaker import with_timeout
        
        @with_timeout(0.1)
        async def slow_func():
            await asyncio.sleep(1.0)
            return "done"
        
        with pytest.raises(asyncio.TimeoutError):
            await slow_func()
