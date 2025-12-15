import json
import hashlib
from typing import Optional, Tuple, Any

from app.config import settings

try:
    import redis.asyncio as aioredis  # type: ignore
except ImportError:
    aioredis = None  # type: ignore

DEFAULT_TTL_SECONDS = 60

# Module-level connection pool (lazy init)
_pool: Any = None


async def _get_pool() -> Any:
    """Get or create async Redis connection pool."""
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(settings.REDIS_URL, decode_responses=True)  # type: ignore
    return _pool


class Cache:
    def __init__(self, ttl_seconds: int = DEFAULT_TTL_SECONDS):
        self.ttl = ttl_seconds
        self.hits = 0
        self.misses = 0

    @staticmethod
    def build_key(prefix: str, payload: dict) -> str:
        raw = json.dumps(payload, sort_keys=True, default=str)
        digest = hashlib.sha256(raw.encode()).hexdigest()
        return f"{prefix}:{digest}"

    async def get_json(self, key: str) -> Optional[dict]:
        """Async get from Redis."""
        client = await _get_pool()
        data = await client.get(key)
        if not data:
            self.misses += 1
            return None
        self.hits += 1
        return json.loads(data)

    async def set_json(self, key: str, value: dict) -> None:
        """Async set to Redis with TTL."""
        client = await _get_pool()
        await client.setex(key, self.ttl, json.dumps(value, default=str))

    async def invalidate_prefix(self, prefix: str) -> int:
        """Async scan-based invalidation."""
        client = await _get_pool()
        cursor = 0
        total = 0
        pattern = f"{prefix}:*"
        while True:
            cursor, keys = await client.scan(cursor=cursor, match=pattern, count=500)
            if keys:
                total += len(keys)
                await client.delete(*keys)
            if cursor == 0:
                break
        return total

    def stats(self) -> Tuple[int, int]:
        return self.hits, self.misses
