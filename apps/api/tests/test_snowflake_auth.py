"""Tests for POST /auth/snowflake."""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from apps.api.core.token_deps import init_token_services
from apps.api.models.domain import UserPermissions


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


def _init_services():
    from apps.api.core.config import Settings

    settings = Settings(
        app_env="test",
        jwt_secret="a-safe-32-char-secret-for-testing!",
        postgres_dsn="postgresql+asyncpg://u:p@localhost/db",
        jwt_algorithm="HS256",
    )
    redis = FakeRedis()
    init_token_services(settings, redis)
    return settings


def _make_mock_db(existing_user=None):
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing_user
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    mock_db.add = MagicMock()
    return mock_db


def _empty_permissions(user_id: str = "test-user") -> UserPermissions:
    return UserPermissions(user_id=user_id, allowed_models=[], allowed_skills=[], enabled_features=[])


def test_snowflake_login_returns_jwt_pair():
    _init_services()

    async def _run():
        from apps.api.routers.auth import login_snowflake
        from apps.api.schemas.api import SnowflakeLoginRequest

        mock_db = _make_mock_db()

        with patch(
            "apps.api.routers.auth._validate_snowflake_credentials_sync",
            return_value={"snowflake_role": "ACCOUNTADMIN", "display_user": "JOHN.DOE"},
        ), patch(
            "apps.api.routers.auth.resolve_user_permissions",
            new=AsyncMock(return_value=_empty_permissions("myorg-myaccount:john.doe")),
        ), patch(
            "apps.api.routers.auth.SnowflakeService.get_user_roles",
            new=AsyncMock(return_value=["ACCOUNTADMIN", "ORG_ADMIN"]),
        ):
            body = SnowflakeLoginRequest(
                account="myorg-myaccount",
                username="john.doe",
                password="secret",
                role="ACCOUNTADMIN",
            )
            resp = await login_snowflake(body, db=mock_db)

        assert resp.access_token
        assert resp.refresh_token
        assert resp.role == "ACCOUNTADMIN"
        assert resp.primary_role == "ACCOUNTADMIN"
        assert resp.roles == ["ACCOUNTADMIN", "ORG_ADMIN"]
        assert resp.display_name == "John Doe"
        assert resp.user_id == "myorg-myaccount:john.doe"

    asyncio.run(_run())


def test_snowflake_login_wrong_password_returns_401():
    _init_services()

    async def _run():
        from fastapi import HTTPException
        from apps.api.routers.auth import login_snowflake
        from apps.api.schemas.api import SnowflakeLoginRequest

        mock_db = _make_mock_db()

        with patch(
            "apps.api.routers.auth._validate_snowflake_credentials_sync",
            side_effect=ValueError("Incorrect username or password was specified."),
        ):
            body = SnowflakeLoginRequest(
                account="myorg-myaccount",
                username="john.doe",
                password="wrong",
                role="ACCOUNTADMIN",
            )
            with pytest.raises(HTTPException) as exc_info:
                await login_snowflake(body, db=mock_db)

        assert exc_info.value.status_code == 401

    asyncio.run(_run())


@pytest.mark.parametrize(
    ("requested_role", "fetched_roles"),
    [
        ("ACCOUNTADMIN", ["ACCOUNTADMIN", "ORG_ADMIN"]),
        ("DATA_ENGINEER", ["DATA_ENGINEER"]),
        ("VIEWER", ["VIEWER"]),
        ("SYSADMIN", ["SYSADMIN", "ACCOUNTADMIN"]),
    ],
)
def test_snowflake_login_preserves_snowflake_roles(requested_role: str, fetched_roles: list[str]):
    _init_services()

    async def _run():
        from apps.api.routers.auth import login_snowflake
        from apps.api.schemas.api import SnowflakeLoginRequest

        username = requested_role.lower()
        mock_db = _make_mock_db()

        with patch(
            "apps.api.routers.auth._validate_snowflake_credentials_sync",
            return_value={"snowflake_role": requested_role, "display_user": username.upper()},
        ), patch(
            "apps.api.routers.auth.resolve_user_permissions",
            new=AsyncMock(return_value=_empty_permissions(f"org:{username}")),
        ), patch(
            "apps.api.routers.auth.SnowflakeService.get_user_roles",
            new=AsyncMock(return_value=fetched_roles),
        ):
            resp = await login_snowflake(
                SnowflakeLoginRequest(account="org", username=username, password="pw", role=requested_role),
                db=mock_db,
            )

        assert resp.role == requested_role
        assert resp.primary_role == requested_role
        assert resp.roles == fetched_roles

    asyncio.run(_run())


def test_snowflake_login_uses_account_and_username_as_identity():
    _init_services()

    async def _run():
        from apps.api.routers.auth import login_snowflake
        from apps.api.schemas.api import SnowflakeLoginRequest

        mock_db = _make_mock_db()

        with patch(
            "apps.api.routers.auth._validate_snowflake_credentials_sync",
            return_value={"snowflake_role": "DATA_ENGINEER", "display_user": "EVE.SMITH"},
        ), patch(
            "apps.api.routers.auth.resolve_user_permissions",
            new=AsyncMock(return_value=_empty_permissions("org:eve")),
        ), patch(
            "apps.api.routers.auth.SnowflakeService.get_user_roles",
            new=AsyncMock(return_value=["DATA_ENGINEER"]),
        ):
            resp = await login_snowflake(
                SnowflakeLoginRequest(account="org", username="eve", password="pw", role="DATA_ENGINEER"),
                db=mock_db,
            )

        assert resp.user_id == "org:eve"
        assert resp.role == "DATA_ENGINEER"
        assert resp.roles == ["DATA_ENGINEER"]

    asyncio.run(_run())


def test_snowflake_jwt_can_be_decoded():
    import jwt

    _init_services()

    async def _run():
        from apps.api.routers.auth import login_snowflake
        from apps.api.schemas.api import SnowflakeLoginRequest

        mock_db = _make_mock_db()

        with patch(
            "apps.api.routers.auth._validate_snowflake_credentials_sync",
            return_value={"snowflake_role": "ACCOUNTADMIN", "display_user": "FRANK"},
        ), patch(
            "apps.api.routers.auth.resolve_user_permissions",
            new=AsyncMock(return_value=_empty_permissions("org:frank")),
        ), patch(
            "apps.api.routers.auth.SnowflakeService.get_user_roles",
            new=AsyncMock(return_value=["ACCOUNTADMIN"]),
        ):
            resp = await login_snowflake(
                SnowflakeLoginRequest(account="org", username="frank", password="pw", role="ACCOUNTADMIN"),
                db=mock_db,
            )

        payload = jwt.decode(
            resp.access_token,
            "a-safe-32-char-secret-for-testing!",
            algorithms=["HS256"],
        )
        assert payload["sub"] == "org:frank"
        assert payload["roles"] == ["ACCOUNTADMIN"]
        assert payload["primary_role"] == "ACCOUNTADMIN"
        assert "exp" in payload
        assert "jti" in payload

    asyncio.run(_run())
