from __future__ import annotations

import json
import time
from typing import Any, Optional

_redis = None
_use_redis = False

# In-memory fallback cache
_mem_cache: dict[str, tuple[Any, float]] = {}


def init_redis(url: str) -> None:
    global _redis, _use_redis
    if not url:
        _use_redis = False
        return
    try:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(url, decode_responses=True)
        _use_redis = True
    except Exception:
        _use_redis = False


def get_redis():
    if not _use_redis or _redis is None:
        raise RuntimeError("Redis not available")
    return _redis


def _mem_get(key: str) -> Optional[Any]:
    entry = _mem_cache.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if expires_at > 0 and time.time() > expires_at:
        del _mem_cache[key]
        return None
    return value


def _mem_set(key: str, value: Any, ttl: int) -> None:
    expires_at = time.time() + ttl if ttl > 0 else 0
    _mem_cache[key] = (value, expires_at)


def _mem_delete(key: str) -> None:
    _mem_cache.pop(key, None)


def _mem_incr(key: str) -> int:
    entry = _mem_cache.get(key)
    if entry is None:
        _mem_set(key, 1, 0)
        return 1
    value, expires_at = entry
    if expires_at > 0 and time.time() > expires_at:
        _mem_set(key, 1, 0)
        return 1
    new_val = int(value) + 1
    _mem_cache[key] = (new_val, expires_at)
    return new_val


def _mem_expire(key: str, ttl: int) -> None:
    entry = _mem_cache.get(key)
    if entry is not None:
        value, _ = entry
        _mem_cache[key] = (value, time.time() + ttl)


async def cache_get(key: str) -> Optional[Any]:
    if _use_redis:
        try:
            r = get_redis()
            raw = await r.get(key)
            return json.loads(raw) if raw else None
        except Exception:
            return _mem_get(key)
    return _mem_get(key)


async def cache_set(key: str, value: Any, ttl: int) -> None:
    if _use_redis:
        try:
            r = get_redis()
            await r.setex(key, ttl, json.dumps(value))
            return
        except Exception:
            pass
    _mem_set(key, value, ttl)


async def cache_delete(key: str) -> None:
    if _use_redis:
        try:
            r = get_redis()
            await r.delete(key)
            return
        except Exception:
            pass
    _mem_delete(key)


async def cache_incr(key: str) -> int:
    if _use_redis:
        try:
            r = get_redis()
            return await r.incr(key)
        except Exception:
            pass
    return _mem_incr(key)


async def cache_expire(key: str, ttl: int) -> None:
    if _use_redis:
        try:
            r = get_redis()
            await r.expire(key, ttl)
            return
        except Exception:
            pass
    _mem_expire(key, ttl)
