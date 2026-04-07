"""
Auth router tests — Issue #8.

Tests the public contract of the auth endpoints without a real DB or Redis.
All I/O is stubbed at the service boundary.

Behaviors tested:
  1. POST /auth/login returns access_token + refresh_token on valid credentials
  2. POST /auth/login returns 401 on wrong password
  3. POST /auth/login returns 401 for unknown email
  4. POST /auth/refresh returns new token pair for valid refresh token
  5. POST /auth/refresh returns 401 for expired/invalid refresh token
  6. POST /auth/logout returns 204 and adds JTI to denylist
  7. POST /auth/logout with already-invalid token still returns 204 (idempotent)
  8. Revoked JTI is rejected by middleware (denylist enforced)
"""
from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from apps.api.core.token_deps import init_token_services
from apps.api.services.token_service import TokenExpiredError, TokenInvalidError


# ── Shared fake infrastructure ────────────────────────────────────────────

class FakeRedis:
    def __init__(self):
        self._store: dict[str, tuple[str, float]] = {}

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
        lst_val = await self.get(key)
        lst = lst_val if isinstance(lst_val, list) else []
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


def _init_services():
    settings = _make_settings()
    redis = FakeRedis()
    init_token_services(settings, redis)
    return settings, redis


# ── Behavior 1: login returns token pair on valid credentials ─────────────

def test_login_returns_token_pair_on_valid_credentials():
    settings, _ = _init_services()

    import bcrypt
    password = "correct-password"
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    fake_user = MagicMock()
    fake_user.id = "user-uuid-001"
    fake_user.email = "alice@example.com"
    fake_user.password_hash = hashed
    fake_user.platform_role = "user"
    fake_user.display_name = "Alice"
    fake_user.is_active = True

    async def _run():
        from apps.api.routers.auth import login
        from apps.api.schemas.api import LoginRequest

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = fake_user
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()

        body = LoginRequest(email="alice@example.com", password=password)
        response = await login(body, db=mock_db)

        assert response.access_token
        assert response.refresh_token
        assert response.user_id == "user-uuid-001"
        assert response.role == "user"

    asyncio.run(_run())


# ── Behavior 2: login returns 401 on wrong password ───────────────────────

def test_login_returns_401_on_wrong_password():
    _init_services()

    import bcrypt
    from fastapi import HTTPException

    hashed = bcrypt.hashpw(b"correct", bcrypt.gensalt()).decode()
    fake_user = MagicMock()
    fake_user.id = "user-uuid-001"
    fake_user.password_hash = hashed
    fake_user.is_active = True

    async def _run():
        from apps.api.routers.auth import login
        from apps.api.schemas.api import LoginRequest

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = fake_user
        mock_db.execute = AsyncMock(return_value=mock_result)

        body = LoginRequest(email="alice@example.com", password="wrong-password")
        with pytest.raises(HTTPException) as exc_info:
            await login(body, db=mock_db)
        assert exc_info.value.status_code == 401

    asyncio.run(_run())


# ── Behavior 3: login returns 401 for unknown email ───────────────────────

def test_login_returns_401_for_unknown_email():
    _init_services()
    from fastapi import HTTPException

    async def _run():
        from apps.api.routers.auth import login
        from apps.api.schemas.api import LoginRequest

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        body = LoginRequest(email="nobody@example.com", password="any")
        with pytest.raises(HTTPException) as exc_info:
            await login(body, db=mock_db)
        assert exc_info.value.status_code == 401

    asyncio.run(_run())


# ── Behavior 4: refresh returns new token pair ────────────────────────────

def test_refresh_returns_new_token_pair():
    settings, redis = _init_services()

    async def _run():
        from apps.api.core.token_deps import get_token_service
        from apps.api.routers.auth import refresh_token
        from apps.api.schemas.api import RefreshRequest

        # Issue a real token pair first
        pair = await get_token_service().issue("user-abc", ["user"])

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_user = MagicMock()
        mock_user.platform_role = "user"
        mock_user.display_name = "Bob"
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db.execute = AsyncMock(return_value=mock_result)

        body = RefreshRequest(refresh_token=pair.refresh_token)
        response = await refresh_token(body, db=mock_db)

        assert response.access_token
        assert response.refresh_token
        # New tokens must differ from old
        assert response.access_token != pair.access_token

    asyncio.run(_run())


# ── Behavior 5: refresh returns 401 for invalid refresh token ─────────────

def test_refresh_returns_401_for_invalid_refresh_token():
    _init_services()
    from fastapi import HTTPException

    async def _run():
        from apps.api.routers.auth import refresh_token
        from apps.api.schemas.api import RefreshRequest

        mock_db = AsyncMock()
        body = RefreshRequest(refresh_token="not.a.valid.token")
        with pytest.raises(HTTPException) as exc_info:
            await refresh_token(body, db=mock_db)
        assert exc_info.value.status_code == 401

    asyncio.run(_run())


# ── Behavior 6: logout adds JTI to denylist ───────────────────────────────

def test_logout_adds_jti_to_denylist():
    _init_services()

    async def _run():
        from apps.api.core.token_deps import get_denylist_service, get_token_service
        from apps.api.routers.auth import logout

        pair = await get_token_service().issue("user-xyz", ["admin"])

        mock_request = MagicMock()
        mock_request.headers = {"Authorization": f"Bearer {pair.access_token}"}

        await logout(mock_request)

        # The JTI must now be in the denylist
        claims = None
        import jwt as pyjwt
        payload = pyjwt.decode(pair.access_token, options={"verify_signature": False})
        jti = payload["jti"]
        assert await get_denylist_service().is_blocked(jti)

    asyncio.run(_run())


# ── Behavior 7: logout is idempotent for already-expired token ────────────

def test_logout_is_idempotent_for_already_invalid_token():
    _init_services()

    async def _run():
        from apps.api.routers.auth import logout

        mock_request = MagicMock()
        mock_request.headers = {"Authorization": "Bearer completely.invalid.token"}

        # Should not raise — returns 204 silently
        response = await logout(mock_request)
        assert response.status_code == 204

    asyncio.run(_run())


# ── Behavior 8: middleware rejects revoked JTI ────────────────────────────

def test_middleware_rejects_revoked_jti():
    settings, _ = _init_services()

    async def _run():
        from apps.api.core.token_deps import get_denylist_service, get_token_service
        from apps.api.middleware.auth import JWTAuthMiddleware

        pair = await get_token_service().issue("user-revoked", ["user"])

        # Revoke the token
        import jwt as pyjwt
        payload = pyjwt.decode(pair.access_token, options={"verify_signature": False})
        jti = payload["jti"]
        remaining_ttl = max(1, int(payload["exp"] - time.time()))
        await get_denylist_service().add(jti, remaining_ttl)

        # Simulate middleware dispatch
        received_responses = []

        async def call_next(req):
            received_responses.append("called")
            return MagicMock(status_code=200)

        mock_request = MagicMock()
        mock_request.url.path = "/execute"
        mock_request.method = "POST"
        mock_request.headers = {"Authorization": f"Bearer {pair.access_token}"}
        mock_request.state = MagicMock()

        middleware = JWTAuthMiddleware.__new__(JWTAuthMiddleware)
        middleware.settings = settings

        response = await middleware.dispatch(mock_request, call_next)

        assert response.status_code == 401
        assert not received_responses  # call_next was never called

    asyncio.run(_run())
