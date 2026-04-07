"""
DenylistService — Redis-backed JTI denylist for token revocation.

Public interface:
    add(jti: str, ttl_seconds: int) -> None
    is_blocked(jti: str) -> bool

Every authenticated request calls is_blocked() before the route handler.
add() is called on logout and by SessionManager.revoke_all().

Redis is injected; caller controls the connection. Tests inject ClockFakeRedis.
"""
from __future__ import annotations

from typing import Any, Protocol


class RedisProtocol(Protocol):
    async def set(self, key: str, value: str, ex: int | None = None) -> None: ...
    async def exists(self, key: str) -> int: ...


_PREFIX = "deny:"


class DenylistService:
    def __init__(self, redis: Any) -> None:
        self._redis = redis

    async def add(self, jti: str, ttl_seconds: int) -> None:
        await self._redis.set(f"{_PREFIX}{jti}", "1", ex=ttl_seconds)

    async def is_blocked(self, jti: str) -> bool:
        return bool(await self._redis.exists(f"{_PREFIX}{jti}"))
