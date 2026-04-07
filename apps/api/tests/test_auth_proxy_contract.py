from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import bcrypt
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apps.api.routers import auth as auth_router


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeSession:
    def __init__(self, user):
        self._user = user

    async def execute(self, *args, **kwargs):
        return _ScalarResult(self._user)

    async def commit(self):
        return None


def _build_app(user) -> FastAPI:
    app = FastAPI()
    async def _override_session():
        return _FakeSession(user)

    app.dependency_overrides[auth_router.get_session] = _override_session
    app.include_router(auth_router.router)
    return app


def test_auth_login_returns_401_for_invalid_credentials() -> None:
    password_hash = bcrypt.hashpw(b"correct-password", bcrypt.gensalt()).decode("utf-8")
    user = SimpleNamespace(
        id="user-1",
        email="user@platform.local",
        display_name="User One",
        platform_role="user",
        password_hash=password_hash,
        is_active=True,
    )
    app = _build_app(user)
    client = TestClient(app)

    response = client.post(
        "/auth/login",
        json={"email": "user@platform.local", "password": "wrong-password"},
    )

    assert response.status_code == 401


def test_auth_login_response_shape_matches_canonical_contract() -> None:
    password_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode("utf-8")
    user = SimpleNamespace(
        id="user-1",
        email="admin@platform.local",
        display_name="Platform Admin",
        platform_role="admin",
        password_hash=password_hash,
        is_active=True,
    )
    app = _build_app(user)
    client = TestClient(app)

    with patch("apps.api.routers.auth.get_token_service") as mock_get_token_service:
        mock_get_token_service.return_value.issue = AsyncMock(
            return_value=SimpleNamespace(
                access_token="access-token-123",
                refresh_token="refresh-token-456",
            )
        )

        response = client.post(
            "/auth/login",
            json={"email": "admin@platform.local", "password": "admin123"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"] == "access-token-123"
    assert body["refresh_token"] == "refresh-token-456"
    assert body["token_type"].lower() == "bearer"
    assert body["expires_in"] > 0
