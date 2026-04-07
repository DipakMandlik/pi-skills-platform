"""
Database layer startup validation tests.

init_engine() must fail loudly on unsafe or unsupported configuration.
Silent fallbacks (SQLite when PostgreSQL fails) are not permitted —
they mask misconfiguration and produce a false sense of correctness.

These tests do not require a real PostgreSQL connection. They verify
the rejection logic that fires before any network call is made.
"""
from __future__ import annotations

import asyncio
import pytest


def _reset_engine():
    """Reset global engine state between tests to prevent state leakage."""
    import apps.api.core.database as db_module
    db_module._engine = None
    db_module._session_factory = None


def _make_settings(**overrides):
    from apps.api.core.config import Settings
    base = dict(
        app_env="production",
        jwt_secret="a-safe-32-char-secret-for-testing!",
        postgres_dsn="postgresql+asyncpg://user:pass@localhost/testdb",
        redis_url="redis://localhost:6379",
        sentry_dsn="https://key@sentry.io/1",
        debug=False,
    )
    base.update(overrides)
    return Settings(**base)


# ===========================================================================
# Behavior 1: init_engine() rejects SQLite DSNs — no silent fallback
# ===========================================================================

def test_init_engine_rejects_sqlite_file_dsn() -> None:
    from apps.api.core.database import init_engine
    _reset_engine()

    settings = _make_settings(postgres_dsn="sqlite+aiosqlite:///./dev.db")

    with pytest.raises(RuntimeError, match="SQLite"):
        init_engine(settings)

    _reset_engine()


def test_init_engine_rejects_sqlite_memory_dsn() -> None:
    from apps.api.core.database import init_engine
    _reset_engine()

    settings = _make_settings(postgres_dsn="sqlite:///:memory:")

    with pytest.raises(RuntimeError, match="SQLite"):
        init_engine(settings)

    _reset_engine()


# ===========================================================================
# Behavior 2: init_engine() rejects empty DSN
# ===========================================================================

def test_init_engine_rejects_empty_dsn() -> None:
    from apps.api.core.database import init_engine
    _reset_engine()

    settings = _make_settings(postgres_dsn="")

    with pytest.raises(RuntimeError, match="POSTGRES_DSN"):
        init_engine(settings)

    _reset_engine()


# ===========================================================================
# Behavior 3: get_session() raises RuntimeError before init_engine()
# ===========================================================================

def test_get_session_raises_before_engine_is_initialised() -> None:
    from apps.api.core.database import get_session
    _reset_engine()

    async def _run():
        # get_session is an async generator — must call __anext__ to trigger
        gen = get_session()
        await gen.__anext__()

    with pytest.raises(RuntimeError, match="init_engine"):
        asyncio.run(_run())

    _reset_engine()


# ===========================================================================
# Behavior 4: create_tables() raises RuntimeError before init_engine()
# ===========================================================================

def test_create_tables_raises_before_engine_is_initialised() -> None:
    from apps.api.core.database import create_tables
    _reset_engine()

    with pytest.raises(RuntimeError, match="init_engine"):
        asyncio.run(create_tables())

    _reset_engine()


# ===========================================================================
# Behavior 5: PostgreSQL DSN is accepted (engine object is created)
# ===========================================================================

def test_init_engine_accepts_postgresql_asyncpg_dsn() -> None:
    from apps.api.core.database import init_engine
    import apps.api.core.database as db_module
    _reset_engine()

    settings = _make_settings(postgres_dsn="postgresql+asyncpg://user:pass@localhost/db")
    init_engine(settings)

    assert db_module._engine is not None
    assert db_module._session_factory is not None

    _reset_engine()
