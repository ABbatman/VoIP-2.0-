import json
import hashlib
import os
from typing import Optional, Tuple, TYPE_CHECKING, Any

try:
    import redis  # type: ignore
except Exception:  # During type-checking or if not installed in current interpreter
    redis = None  # type: ignore
    

DEFAULT_TTL_SECONDS = 60


if TYPE_CHECKING:
    from redis import Redis as _RedisType  # type: ignore


def _make_client() -> Any:
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return redis.from_url(url)  # type: ignore[attr-defined]


class Cache:
    def __init__(self, ttl_seconds: int = DEFAULT_TTL_SECONDS):
        self.client = _make_client()
        self.ttl = ttl_seconds
        self.hits = 0
        self.misses = 0

    @staticmethod
    def build_key(prefix: str, payload: dict) -> str:
        raw = json.dumps(payload, sort_keys=True, default=str)
        digest = hashlib.sha256(raw.encode()).hexdigest()
        return f"{prefix}:{digest}"

    def get_json(self, key: str) -> Optional[dict]:
        data = self.client.get(key)
        if not data:
            self.misses += 1
            return None
        self.hits += 1
        return json.loads(data)

    def set_json(self, key: str, value: dict) -> None:
        self.client.setex(key, self.ttl, json.dumps(value, default=str))

    def invalidate_prefix(self, prefix: str) -> int:
        # Simple scan-based invalidation
        cursor = 0
        total = 0
        pattern = f"{prefix}:*"
        while True:
            cursor, keys = self.client.scan(cursor=cursor, match=pattern, count=500)
            if keys:
                total += len(keys)
                self.client.delete(*keys)
            if cursor == 0:
                break
        return total

    def stats(self) -> Tuple[int, int]:
        return self.hits, self.misses


