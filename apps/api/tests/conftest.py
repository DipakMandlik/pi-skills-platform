"""
Shared test infrastructure.

FakeRedis  — fixed-clock fake, compatible with existing tests.
ClockFakeRedis — injectable-clock fake for TTL-sensitive tests.
"""

from __future__ import annotations

import time
from typing import Any, Callable, Optional


def pytest_configure(config):
    config.addinivalue_line("markers", "smoke: P0 smoke tests for critical path validation")


class FakeRedis:
    """Async Redis fake using real monotonic clock. Used by token service tests."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, float]] = {}

    async def set(self, key: str, value: str, ex: Optional[int] = None) -> None:
        expires_at = time.monotonic() + ex if ex else float("inf")
        self._store[key] = (value, expires_at)

    async def get(self, key: str) -> Optional[str]:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def exists(self, key: str) -> int:
        entry = self._store.get(key)
        if entry is None:
            return 0
        _, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return 0
        return 1


class ClockFakeRedis:
    """
    Async Redis fake with an injectable clock function.

    Pass a mutable container as the clock so tests can advance time
    without sleeping:

        clock = [0.0]
        redis = ClockFakeRedis(time_fn=lambda: clock[0])
        await redis.set("k", "v", ex=10)
        clock[0] = 11.0          # fast-forward past TTL
        assert await redis.exists("k") == 0
    """

    def __init__(self, time_fn: Callable[[], float] = time.monotonic) -> None:
        self._store: dict[str, tuple[Any, float]] = {}
        self._now = time_fn

    async def set(self, key: str, value: str, ex: Optional[int] = None) -> None:
        expires_at = self._now() + ex if ex else float("inf")
        self._store[key] = (value, expires_at)

    async def get(self, key: str) -> Optional[str]:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if self._now() > expires_at:
            del self._store[key]
            return None
        return value

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def exists(self, key: str) -> int:
        entry = self._store.get(key)
        if entry is None:
            return 0
        _, expires_at = entry
        if self._now() > expires_at:
            del self._store[key]
            return 0
        return 1
