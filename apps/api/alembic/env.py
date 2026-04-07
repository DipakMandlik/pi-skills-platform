"""Alembic migration environment — async PostgreSQL via asyncpg.

Run migrations:
    alembic upgrade head

Generate a new migration after model changes:
    alembic revision --autogenerate -m "describe change"
"""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

# Make project root importable so `apps.api.*` resolves correctly.
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Import Base so Alembic can see all mapped models for autogenerate.
from apps.api.core.database import Base  # noqa: F401 — registers all models

# ---------------------------------------------------------------------------
# Alembic config / logging
# ---------------------------------------------------------------------------

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _get_dsn() -> str:
    """Resolve the PostgreSQL DSN from the environment at migration time."""
    from dotenv import load_dotenv
    load_dotenv(".env.local")
    load_dotenv(".env")

    dsn = os.environ.get("POSTGRES_DSN", "").strip()
    if not dsn:
        raise RuntimeError(
            "POSTGRES_DSN is not set. "
            "Export it before running alembic, or add it to .env.local."
        )
    if "sqlite" in dsn.lower():
        raise RuntimeError(
            "POSTGRES_DSN must be a PostgreSQL connection string, not SQLite."
        )
    return dsn


# ---------------------------------------------------------------------------
# Offline mode (generate SQL without connecting)
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    dsn = _get_dsn()
    context.configure(
        url=dsn,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online mode (connect and apply)
# ---------------------------------------------------------------------------

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    dsn = _get_dsn()
    connectable = async_engine_from_config(
        {"sqlalchemy.url": dsn},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    import asyncio
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
