"""
Admin session management tests — Issue #9.

Behaviors tested:
  1. GET /admin/sessions/{user_id} returns active sessions for a user
  2. GET /admin/sessions/{user_id} returns empty list for user with no sessions
  3. GET /admin/sessions/{user_id} returns 403 for non-admin caller
  4. DELETE /admin/sessions/{user_id} revokes all sessions and returns count
  5. DELETE /admin/sessions/{user_id} returns 0 for user with no sessions
  6. DELETE /admin/sessions/{user_id} returns 403 for non-admin caller
  7. After DELETE, access tokens for that user are rejected by the denylist
  8. DELETE does not affect sessions of other users
"""
from __future__ import annotations

import asyncio
import time
from unittest.mock import MagicMock

import pytest

from apps.api.core.token_deps import init_token_services, get_session_manager, get_token_service, get_denylist_service


# ── Shared fake infrastructure ───────────────────────────────────────────────

class FakeRedis:
    def __init__(self):
        self._store: dict = {}

    async def set(self, key, value, ex=None):
        expires_at = time.monotonic() + ex if ex else float("inf")
        self._store[key] = (value, expires_at)

    async def get(self, key):
        entry = self._store.get(key)
        if not entry:
            return None
        value, exp = entry
        if time.monotonic() > exp:
            del self._store[key]
            return None
        return value

    async def delete(self, key):
        self._store.pop(key, None)

    async def exists(self, key):
        return 1 if await self.get(key) is not None else 0

    async def rpush(self, key, value):
        entry = self._store.get(key)
        lst = entry[0] if entry else []
        lst.append(value)
        self._store[key] = (lst, float("inf"))

    async def lrange(self, key, start, end):
        entry = self._store.get(key)
        if not entry:
            return []
        lst, _ = entry
        return lst[start:None if end == -1 else end + 1]


def _make_settings():
    from apps.api.core.config import Settings
    return Settings(
        app_env="test",
        jwt_secret="a-safe-32-char-secret-for-testing!",
        postgres_dsn="postgresql+asyncpg://u:p@localhost/db",
        jwt_algorithm="HS256",
    )


def _init():
    settings = _make_settings()
    redis = FakeRedis()
    init_token_services(settings, redis)
    return settings, redis


def _admin_request(user_id="admin-001"):
    req = MagicMock()
    req.state.user.user_id = user_id
    req.state.user.role = "admin"
    return req


def _user_request(user_id="user-001"):
    req = MagicMock()
    req.state.user.user_id = user_id
    req.state.user.role = "user"
    return req


# ── Behavior 1: list returns active sessions ─────────────────────────────────

def test_list_sessions_returns_active_sessions():
    _init()

    async def _run():
        from apps.api.routers.admin_sessions import list_user_sessions

        pair = await get_token_service().issue("target-user", ["user"])
        response = await list_user_sessions("target-user", _admin_request())

        assert response.user_id == "target-user"
        assert response.count == 1
        assert response.sessions[0].user_id == "target-user"

    asyncio.run(_run())


# ── Behavior 2: list returns empty for unknown user ──────────────────────────

def test_list_sessions_empty_for_unknown_user():
    _init()

    async def _run():
        from apps.api.routers.admin_sessions import list_user_sessions

        response = await list_user_sessions("no-such-user", _admin_request())
        assert response.count == 0
        assert response.sessions == []

    asyncio.run(_run())


# ── Behavior 3: list returns 403 for non-admin ───────────────────────────────

def test_list_sessions_returns_403_for_non_admin():
    _init()
    from fastapi import HTTPException

    async def _run():
        from apps.api.routers.admin_sessions import list_user_sessions

        with pytest.raises(HTTPException) as exc_info:
            await list_user_sessions("any-user", _user_request())
        assert exc_info.value.status_code == 403

    asyncio.run(_run())


# ── Behavior 4: revoke returns count of revoked sessions ─────────────────────

def test_revoke_returns_count_of_revoked_sessions():
    _init()

    async def _run():
        from apps.api.routers.admin_sessions import revoke_user_sessions

        await get_token_service().issue("victim-user", ["user"])
        await get_token_service().issue("victim-user", ["user"])

        response = await revoke_user_sessions("victim-user", _admin_request())
        assert response.sessions_revoked == 2
        assert response.user_id == "victim-user"
        assert response.revoked_by == "admin-001"

    asyncio.run(_run())


# ── Behavior 5: revoke returns 0 for user with no sessions ───────────────────

def test_revoke_returns_zero_for_user_with_no_sessions():
    _init()

    async def _run():
        from apps.api.routers.admin_sessions import revoke_user_sessions

        response = await revoke_user_sessions("ghost-user", _admin_request())
        assert response.sessions_revoked == 0

    asyncio.run(_run())


# ── Behavior 6: revoke returns 403 for non-admin ─────────────────────────────

def test_revoke_returns_403_for_non_admin():
    _init()
    from fastapi import HTTPException

    async def _run():
        from apps.api.routers.admin_sessions import revoke_user_sessions

        with pytest.raises(HTTPException) as exc_info:
            await revoke_user_sessions("any-user", _user_request())
        assert exc_info.value.status_code == 403

    asyncio.run(_run())


# ── Behavior 7: access tokens are blocked after revoke ───────────────────────

def test_access_tokens_blocked_after_revoke():
    _init()

    async def _run():
        from apps.api.routers.admin_sessions import revoke_user_sessions

        pair = await get_token_service().issue("victim2", ["user"])

        await revoke_user_sessions("victim2", _admin_request())

        from apps.api.services.token_service import TokenExpiredError, TokenInvalidError, TokenRevokedError
        with pytest.raises((TokenExpiredError, TokenInvalidError, TokenRevokedError)):
            await get_token_service().verify(pair.access_token)

    asyncio.run(_run())


# ── Behavior 8: revoke does not affect other users ───────────────────────────

def test_revoke_does_not_affect_other_users():
    _init()

    async def _run():
        from apps.api.routers.admin_sessions import revoke_user_sessions

        pair_other = await get_token_service().issue("innocent-user", ["user"])
        await get_token_service().issue("target-user2", ["user"])

        await revoke_user_sessions("target-user2", _admin_request())

        # innocent-user token must still verify
        claims = await get_token_service().verify(pair_other.access_token)
        assert claims.user_id == "innocent-user"

    asyncio.run(_run())
