"""P0 smoke tests — critical path validation for the canonical apps/api/ backend.

These tests verify the core user flows:
1. Health endpoint responds correctly
2. Full auth lifecycle (login → verify → refresh → logout → denylist)
3. RBAC enforcement (admin vs non-admin)
4. OpenAPI docs accessible

Run with: pytest apps/api/tests/test_smoke_p0.py -m smoke -v
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

import apps.api.core.database as db_module
from apps.api.core.database import create_tables, init_engine
from apps.api.core.redis_client import init_redis
from apps.api.core.token_deps import init_token_services
from apps.api.core.config import Settings
from apps.api.main import _seed_data, app
from apps.api.tests.conftest import FakeRedis


@pytest.fixture(autouse=True)
def smoke_setup(tmp_path_factory):
    """Ensure database and token services are initialized for smoke tests."""
    db_path = Path(tmp_path_factory.mktemp("smoke-db")) / "smoke.db"
    test_settings = Settings(
        app_env="test",
        jwt_secret="0123456789abcdef0123456789abcdef",
        postgres_dsn=f"sqlite+aiosqlite:///{db_path.as_posix()}",
        redis_url="",
        enable_bootstrap_seed=True,
    )
    init_engine(test_settings)
    asyncio.run(create_tables())
    asyncio.run(_seed_data())
    init_redis(test_settings.redis_url)
    fake_redis = FakeRedis()
    init_token_services(test_settings, fake_redis)
    yield
    db_module._engine = None
    db_module._session_factory = None


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_health_endpoint():
    """Health endpoint returns 200 with database and redis status."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert data["status"] in ("ok", "degraded")
        assert "database" in data
        assert "redis" in data


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_openapi_docs_accessible():
    """OpenAPI docs and schema are accessible without authentication."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/docs")
        assert resp.status_code == 200

        resp = await client.get("/openapi.json")
        assert resp.status_code == 200
        data = resp.json()
        assert "info" in data
        assert "paths" in data


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_unauthenticated_access_rejected():
    """Protected endpoints return 401 without a valid token."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/auth/me")
        assert resp.status_code == 401

        resp = await client.get("/admin/sessions/test-user")
        assert resp.status_code == 401


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_login_returns_token_pair():
    """Login endpoint returns access_token and refresh_token on valid credentials."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/auth/login",
            json={
                "email": "admin@platform.local",
                "password": "admin123",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data
        assert "role" in data
        assert "user_id" in data


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_access_token_works_on_protected_endpoint():
    """Access token grants access to protected endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_resp = await client.post(
            "/auth/login",
            json={
                "email": "admin@platform.local",
                "password": "admin123",
            },
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "user_id" in data
        assert "role" in data


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_refresh_returns_new_token_pair():
    """Refresh endpoint returns a new token pair and old refresh token is rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_resp = await client.post(
            "/auth/login",
            json={
                "email": "admin@platform.local",
                "password": "admin123",
            },
        )
        assert login_resp.status_code == 200
        old_refresh = login_resp.json()["refresh_token"]

        resp = await client.post("/auth/refresh", json={"refresh_token": old_refresh})
        assert resp.status_code == 200
        new_data = resp.json()
        assert new_data["access_token"] != login_resp.json()["access_token"]

        resp = await client.post("/auth/refresh", json={"refresh_token": old_refresh})
        assert resp.status_code == 401


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_logout_denylists_token():
    """Logout adds the access token JTI to the denylist."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_resp = await client.post(
            "/auth/login",
            json={
                "email": "admin@platform.local",
                "password": "admin123",
            },
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        resp = await client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

        resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_rbac_admin_can_access_admin_endpoint():
    """Admin role can access admin endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/auth/login",
            json={
                "email": "admin@platform.local",
                "password": "admin123",
            },
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        resp = await client.get(
            "/admin/sessions/test-user", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code in (200, 404)


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_rbac_non_admin_cannot_access_admin_endpoint():
    """Non-admin role gets 403 on admin endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/auth/login",
            json={
                "email": "user@platform.local",
                "password": "user123",
            },
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        resp = await client.get(
            "/admin/sessions/test-user", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 403


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_wrong_password_returns_401():
    """Login with wrong password returns 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/auth/login",
            json={
                "email": "admin@platform.local",
                "password": "wrong_password",
            },
        )
        assert resp.status_code == 401


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_unknown_user_returns_401():
    """Login with unknown email returns 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/auth/login",
            json={
                "email": "nonexistent@platform.local",
                "password": "anything",
            },
        )
        assert resp.status_code == 401
