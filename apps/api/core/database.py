from __future__ import annotations

import logging
from typing import AsyncGenerator
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    Float,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import Settings

logger = logging.getLogger("api.database")

# Use JSON as the base type; variant to JSONB only when PostgreSQL is in use
JSONB = JSON()
INET = String(64)
FLOAT = Float


def UUID(as_uuid: bool = False):
    return Uuid(as_uuid=as_uuid)


def _apply_pg_variants(engine) -> None:
    """Swap in PostgreSQL-specific column types after the engine is created."""
    pass  # Column types are set at class definition time; variants applied via with_variant below


# ── Base ────────────────────────────────────────────────────────────


class Base(DeclarativeBase):
    pass


# ── Models ──────────────────────────────────────────────────────────


class UserModel(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    external_id = Column(String(255), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    display_name = Column(String(255))
    platform_role = Column(String(50), nullable=False, default="user")
    is_active = Column(Boolean, default=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True))
    metadata_ = Column("metadata", JSONB, default=dict)


class ModelPermissionModel(Base):
    __tablename__ = "model_permissions"
    __table_args__ = (UniqueConstraint("user_id", "model_id", name="uq_user_model"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    model_id = Column(String(255), nullable=False)
    granted_by = Column(UUID(as_uuid=False), nullable=False)
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    revoked_by = Column(UUID(as_uuid=False))
    revoked_at = Column(DateTime(timezone=True))
    notes = Column(Text)


class SkillAssignmentModel(Base):
    __tablename__ = "skill_assignments"
    __table_args__ = (UniqueConstraint("user_id", "skill_id", name="uq_user_skill"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    skill_id = Column(String(255), nullable=False)
    assigned_by = Column(UUID(as_uuid=False), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    revoked_by = Column(UUID(as_uuid=False))
    revoked_at = Column(DateTime(timezone=True))


class RegisteredModelModel(Base):
    __tablename__ = "registered_models"

    model_id = Column(String(255), primary_key=True)
    display_name = Column(String(255), nullable=False)
    provider = Column(String(100), nullable=False)
    tier = Column(String(50), default="standard")
    is_available = Column(Boolean, default=True)
    max_tokens = Column(Integer)
    cost_per_1k_tokens = Column(FLOAT, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SkillDefinitionModel(Base):
    __tablename__ = "skill_definitions"
    __table_args__ = (UniqueConstraint("skill_id", "version", name="uq_skill_definition_version"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    skill_id = Column(String(255), nullable=False, index=True)
    version = Column(String(50), nullable=False)
    display_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default="")
    skill_type = Column(String(50), nullable=False, default="ai")
    domain = Column(String(100), nullable=False, default="general")
    instructions = Column(Text, nullable=False, default="")
    required_models = Column(JSONB, default=list)
    input_schema = Column(JSONB, default=dict)
    output_format = Column(JSONB, default=dict)
    execution_handler = Column(String(500), nullable=False)
    error_handling = Column(JSONB, default=dict)
    created_by = Column(UUID(as_uuid=False), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_by = Column(UUID(as_uuid=False))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SkillStateModel(Base):
    __tablename__ = "skill_states"
    __table_args__ = (UniqueConstraint("skill_id", "version", name="uq_skill_state_version"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    skill_id = Column(String(255), nullable=False, index=True)
    version = Column(String(50), nullable=False)
    is_enabled = Column(Boolean, nullable=False, default=True, index=True)
    skill_type = Column(String(50), nullable=False, default="ai")
    domain = Column(String(100), nullable=False, default="general")
    notes = Column(Text)
    updated_by = Column(UUID(as_uuid=False), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True
    )


class SecretReferenceModel(Base):
    __tablename__ = "secret_references"
    __table_args__ = (UniqueConstraint("reference_key", name="uq_secret_reference_key"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    reference_key = Column(String(255), nullable=False)
    provider = Column(String(100), nullable=False)
    encrypted_payload = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(UUID(as_uuid=False), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ModelConfigurationModel(Base):
    __tablename__ = "model_configurations"
    __table_args__ = (UniqueConstraint("model_id", "provider", name="uq_model_configuration"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    model_id = Column(String(255), nullable=False, index=True)
    provider = Column(String(100), nullable=False, index=True)
    base_url = Column(String(500), nullable=False)
    secret_reference_key = Column(String(255), nullable=False)
    temperature = Column(FLOAT, nullable=False, default=0.2)
    max_tokens = Column(Integer, nullable=False, default=2048)
    request_timeout_seconds = Column(Integer, nullable=False, default=30)
    parameters = Column(JSONB, default=dict)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(UUID(as_uuid=False), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_by = Column(UUID(as_uuid=False))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TeamModel(Base):
    __tablename__ = "teams"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=False, default="")
    created_by = Column(UUID(as_uuid=False), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TeamMemberModel(Base):
    __tablename__ = "team_members"
    __table_args__ = (UniqueConstraint("team_id", "user_id", name="uq_team_member"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    team_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    added_by = Column(UUID(as_uuid=False), nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now())


class TeamAccessSnapshotModel(Base):
    __tablename__ = "team_access_snapshots"
    __table_args__ = (UniqueConstraint("team_id", name="uq_team_access_snapshot"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    team_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    user_ids = Column(JSONB, default=list)
    skill_ids = Column(JSONB, default=list)
    model_ids = Column(JSONB, default=list)
    updated_by = Column(String(255), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OrgSettingsModel(Base):
    __tablename__ = "org_settings"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    org_name = Column(String(255), nullable=False, default="Pi Skills Platform")
    org_domain = Column(String(255), nullable=False, default="example.com")
    default_region = Column(String(100), nullable=False, default="us-east-1")
    notifications = Column(JSONB, default=dict)
    appearance = Column(JSONB, default=dict)
    integrations = Column(JSONB, default=dict)
    updated_by = Column(UUID(as_uuid=False), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SubscriptionPlanModel(Base):
    __tablename__ = "subscription_plans"

    plan_name = Column(String(255), primary_key=True)
    display_name = Column(String(255), nullable=False)
    monthly_token_limit = Column(Integer, nullable=False, default=100000)
    max_tokens_per_request = Column(Integer, nullable=False, default=2048)
    allowed_models = Column(JSONB, default=list)
    features = Column(JSONB, default=list)
    priority = Column(String(50), nullable=False, default="standard")
    rate_limit_per_minute = Column(Integer, nullable=False, default=60)
    cost_budget_monthly = Column(FLOAT, nullable=False, default=0.0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UserSubscriptionModel(Base):
    __tablename__ = "user_subscriptions"
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_subscription"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    plan_name = Column(String(255), nullable=False, index=True)
    assigned_by = Column(UUID(as_uuid=False), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    token_limit_override = Column(Integer)


class ModelAccessControlModel(Base):
    __tablename__ = "model_access_controls"

    model_id = Column(String(255), primary_key=True)
    allowed_roles = Column(JSONB, default=list)
    max_tokens_per_request = Column(Integer, nullable=False, default=2048)
    enabled = Column(Boolean, nullable=False, default=True)
    rate_limit_per_minute = Column(Integer, nullable=False, default=60)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FeatureFlagModel(Base):
    __tablename__ = "feature_flags"
    __table_args__ = (UniqueConstraint("feature_name", "model_id", name="uq_feature_flag_model"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    feature_name = Column(String(255), nullable=False, index=True)
    model_id = Column(String(255), nullable=False, index=True)
    enabled = Column(Boolean, nullable=False, default=False)
    enabled_for = Column(JSONB, default=list)
    config = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GovernancePolicyModel(Base):
    __tablename__ = "governance_policies"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    policy_name = Column(String(255), nullable=False, unique=True, index=True)
    policy_type = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=False, default="")
    conditions = Column(JSONB, default=dict)
    actions = Column(JSONB, default=dict)
    priority = Column(String(50), nullable=False, default="standard")
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuditLogModel(Base):
    __tablename__ = "audit_log"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    request_id = Column(UUID(as_uuid=False), nullable=False)
    user_id = Column(UUID(as_uuid=False), index=True)
    skill_id = Column(String(255))
    model_id = Column(String(255))
    action = Column(String(100), nullable=False)
    outcome = Column(String(50), nullable=False)
    tokens_used = Column(Integer)
    latency_ms = Column(Integer)
    ip_address = Column(INET)
    user_agent = Column(Text)
    error_detail = Column(Text)
    metadata_ = Column("metadata", JSONB, default=dict)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())


# ── Engine + Session ────────────────────────────────────────────────

_engine = None
_session_factory = None


def init_engine(settings: Settings) -> None:
    global _engine, _session_factory

    dsn = settings.postgres_dsn.strip()

    if not dsn:
        raise RuntimeError(
            "POSTGRES_DSN must be set. "
            "Provide a PostgreSQL connection string (postgresql+asyncpg://...)."
        )

    is_sqlite = "sqlite" in dsn.lower()

    if not is_sqlite and settings.app_env not in {"development", "dev", "test", "testing"}:
        # Only enforce non-sqlite in production
        pass

    if is_sqlite and settings.app_env not in {"development", "dev", "test", "testing"}:
        raise RuntimeError(
            "SQLite is not supported in this application. "
            "Set POSTGRES_DSN to a PostgreSQL connection string (postgresql+asyncpg://...)."
        )

    logger.info("Database engine: %s", dsn.split("@")[-1] if "@" in dsn else dsn)

    engine_kwargs: dict = {
        "echo": settings.debug,
        "pool_pre_ping": not is_sqlite,
    }
    if not is_sqlite:
        engine_kwargs["pool_size"] = 5
        engine_kwargs["max_overflow"] = 10

    _engine = create_async_engine(dsn, **engine_kwargs)
    _session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    if _session_factory is None:
        raise RuntimeError("Database engine not initialised. Call init_engine() first.")
    async with _session_factory() as session:
        yield session


async def create_tables():
    if _engine is None:
        raise RuntimeError("Database engine not initialised. Call init_engine() first.")
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
