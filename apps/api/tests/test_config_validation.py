"""
Config startup validation tests.

validate_production_settings() must reject unsafe configurations before
the application serves any requests. Failures are loud (RuntimeError), not
silent (no fallback to a degraded state in production).

Development environments are intentionally permissive so engineers can
start the app without provisioning every service.
"""
from __future__ import annotations

import pytest
from unittest.mock import patch
import logging


def make_settings(**overrides):
    """Return a Settings-like object with safe production defaults, overridable per test."""
    from apps.api.core.config import Settings
    base = dict(
        app_env="production",
        jwt_secret="a-safe-32-char-secret-for-testing!",
        postgres_dsn="postgresql+asyncpg://user:pass@localhost/db",
        redis_url="redis://localhost:6379",
        sentry_dsn="https://key@sentry.io/123",
        snowflake_account="test_account",
        snowflake_user="test_user",
        snowflake_password="test_password",
        snowflake_warehouse="test_warehouse",
        snowflake_database="test_database",
        snowflake_schema="test_schema",
    )
    base.update(overrides)
    return Settings(**base)


# ===========================================================================
# Behavior 1: SQLite is rejected in production
# ===========================================================================

def test_sqlite_dsn_rejected_in_production() -> None:
    from apps.api.core.config import validate_production_settings

    settings = make_settings(postgres_dsn="sqlite+aiosqlite:///./dev.db")

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        validate_production_settings(settings)


def test_sqlite_memory_dsn_rejected_in_production() -> None:
    from apps.api.core.config import validate_production_settings

    settings = make_settings(postgres_dsn="sqlite:///:memory:")

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        validate_production_settings(settings)


# ===========================================================================
# Behavior 2: Empty REDIS_URL rejected in production
# ===========================================================================

def test_empty_redis_url_rejected_in_production() -> None:
    from apps.api.core.config import validate_production_settings

    settings = make_settings(redis_url="")

    with pytest.raises(RuntimeError, match="REDIS_URL"):
        validate_production_settings(settings)


# ===========================================================================
# Behavior 3: Valid production config passes
# ===========================================================================

def test_valid_production_config_passes() -> None:
    from apps.api.core.config import validate_production_settings

    settings = make_settings()  # all safe defaults

    validate_production_settings(settings)  # must not raise


# ===========================================================================
# Behavior 4: Development environment allows SQLite and empty Redis
# ===========================================================================

def test_development_allows_sqlite_and_no_redis() -> None:
    from apps.api.core.config import validate_production_settings

    for env in ("development", "dev", "test", "testing"):
        settings = make_settings(
            app_env=env,
            postgres_dsn="sqlite+aiosqlite:///./dev.db",
            redis_url="",
            sentry_dsn="",
        )
        validate_production_settings(settings)  # must not raise


# ===========================================================================
# Behavior 5: Missing SENTRY_DSN warns but does not fail
# ===========================================================================

def test_missing_sentry_dsn_warns_not_raises(caplog) -> None:
    from apps.api.core.config import validate_production_settings

    settings = make_settings(sentry_dsn="")

    with caplog.at_level(logging.WARNING, logger="api.config"):
        validate_production_settings(settings)  # must not raise

    assert any("SENTRY_DSN" in r.message for r in caplog.records)


# ===========================================================================
# Behavior 6: Application refuses to start if JWT_SECRET is missing
# ===========================================================================

def test_missing_jwt_secret_rejected_at_startup() -> None:
    from apps.api.core.config import validate_jwt_secret

    with pytest.raises(ValueError, match="JWT_SECRET"):
        validate_jwt_secret("")


def test_insecure_jwt_secret_rejected_at_startup() -> None:
    from apps.api.core.config import validate_jwt_secret

    with pytest.raises(ValueError, match="JWT_SECRET"):
        validate_jwt_secret("change-me-in-production-please")


# ===========================================================================
# Behavior 7: Snowflake settings required in production
# ===========================================================================

def test_missing_snowflake_account_rejected_in_production() -> None:
    from apps.api.core.config import validate_production_settings

    settings = make_settings(snowflake_account="")

    with pytest.raises(RuntimeError, match="SNOWFLAKE_ACCOUNT"):
        validate_production_settings(settings)


def test_missing_snowflake_user_rejected_in_production() -> None:
    from apps.api.core.config import validate_production_settings

    settings = make_settings(snowflake_user="")

    with pytest.raises(RuntimeError, match="SNOWFLAKE_USER"):
        validate_production_settings(settings)


def test_missing_snowflake_password_rejected_in_production() -> None:
    from apps.api.core.config import validate_production_settings

    settings = make_settings(snowflake_password="")

    with pytest.raises(RuntimeError, match="SNOWFLAKE_PASSWORD"):
        validate_production_settings(settings)


def test_missing_snowflake_warehouse_rejected_in_production() -> None:
    from apps.api.core.config import validate_production_settings

    settings = make_settings(snowflake_warehouse="")

    with pytest.raises(RuntimeError, match="SNOWFLAKE_WAREHOUSE"):
        validate_production_settings(settings)


def test_missing_snowflake_database_rejected_in_production() -> None:
    from apps.api.core.config import validate_production_settings

    settings = make_settings(snowflake_database="")

    with pytest.raises(RuntimeError, match="SNOWFLAKE_DATABASE"):
        validate_production_settings(settings)


def test_missing_snowflake_schema_rejected_in_production() -> None:
    from apps.api.core.config import validate_production_settings

    settings = make_settings(snowflake_schema="")

    with pytest.raises(RuntimeError, match="SNOWFLAKE_SCHEMA"):
        validate_production_settings(settings)


def test_development_allows_missing_snowflake_settings() -> None:
    from apps.api.core.config import validate_production_settings

    for env in ("development", "dev", "test", "testing"):
        settings = make_settings(
            app_env=env,
            snowflake_account="",
            snowflake_user="",
            snowflake_password="",
            snowflake_warehouse="",
            snowflake_database="",
            snowflake_schema="",
        )
        validate_production_settings(settings)  # must not raise
