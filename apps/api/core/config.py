from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

logger = logging.getLogger("api.config")

load_dotenv(".env.local")
load_dotenv(".env")


def _to_int(name: str, fallback: int) -> int:
    raw = os.getenv(name, str(fallback)).strip()
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"Invalid integer for {name}: {raw}") from exc


def _to_bool(name: str, fallback: bool) -> bool:
    raw = os.getenv(name, str(fallback)).strip().lower()
    return raw in {"1", "true", "yes", "y", "on"}


_DEV_ENVS = {"development", "dev", "test", "testing"}


def validate_jwt_secret(secret: str) -> None:
    if not secret:
        raise ValueError("JWT_SECRET must be set")
    if secret == "change-me-in-production-please":
        raise ValueError("JWT_SECRET must not use the insecure default value")
    if len(secret) < 32:
        raise ValueError("JWT_SECRET must be at least 32 characters")


def validate_production_settings(settings: "Settings") -> None:
    """Fail fast on unsafe configuration before the app serves any requests.

    Development environments are intentionally permissive. Production and
    staging must have every service properly provisioned.
    """
    if settings.app_env in _DEV_ENVS:
        return

    if settings.app_env not in _DEV_ENVS:
        if "sqlite" in settings.postgres_dsn.lower():
            raise RuntimeError(
                "DATABASE_URL must not use SQLite in production. "
                "Set POSTGRES_DSN to a PostgreSQL connection string."
            )
    else:
        if "sqlite" in settings.postgres_dsn.lower():
            logger.warning("Using SQLite for development. Set POSTGRES_DSN for production parity.")

    if not settings.redis_url:
        raise RuntimeError(
            "REDIS_URL must be set in production. "
            "Configure an Upstash or self-hosted Redis instance."
        )

    if not settings.sentry_dsn:
        logger.warning(
            "SENTRY_DSN is not set. Error tracking will be disabled. "
            "Set SENTRY_DSN to enable Sentry in this environment."
        )

    # Validate Snowflake settings for token cost enforcement
    if not settings.snowflake_account:
        raise RuntimeError(
            "SNOWFLAKE_ACCOUNT must be set in production. "
            "Configure Snowflake connection for token cost enforcement."
        )
    if not settings.snowflake_user:
        raise RuntimeError(
            "SNOWFLAKE_USER must be set in production. "
            "Configure Snowflake connection for token cost enforcement."
        )
    if not settings.snowflake_password:
        raise RuntimeError(
            "SNOWFLAKE_PASSWORD must be set in production. "
            "Configure Snowflake connection for token cost enforcement."
        )
    if not settings.snowflake_warehouse:
        raise RuntimeError(
            "SNOWFLAKE_WAREHOUSE must be set in production. "
            "Configure Snowflake connection for token cost enforcement."
        )
    if not settings.snowflake_database:
        raise RuntimeError(
            "SNOWFLAKE_DATABASE must be set in production. "
            "Configure Snowflake connection for token cost enforcement."
        )
    if not settings.snowflake_schema:
        raise RuntimeError(
            "SNOWFLAKE_SCHEMA must be set in production. "
            "Configure Snowflake connection for token cost enforcement."
        )


@dataclass(frozen=True)
class Settings:
    # App
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_log_level: str = "INFO"
    debug: bool = False

    # JWT
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    # Service-boundary consolidation: route auth to canonical backend service.
    governance_backend_url: str = "http://localhost:8000"
    apps_api_auth_proxy_enabled: bool = True
    apps_api_auth_routes_enabled: bool = True
    governance_auth_timeout_seconds: int = 5

    # Database (PostgreSQL default; SQLite allowed in dev with warning)
    postgres_dsn: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_governance"

    # Redis (optional; falls back to in-memory cache)
    redis_url: str = ""
    redis_perm_ttl: int = 60
    redis_model_ttl: int = 300
    redis_rate_window: int = 60

    # Snowflake
    snowflake_account: str = ""
    snowflake_user: str = ""
    snowflake_password: str = ""
    snowflake_role: str = ""
    snowflake_warehouse: str = ""
    snowflake_database: str = ""
    snowflake_schema: str = ""

    # Rate Limiting
    max_requests_per_minute: int = 60
    max_prompt_length: int = 50000

    # CORS
    cors_origins: list[str] = field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    )

    # Model Adapter
    model_adapter_type: str = "litellm"
    allow_mock_adapter: bool = False
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""

    # Observability
    sentry_dsn: str = ""

    # Cloud / Auth fallback
    suppress_cloud_metadata_probes: bool = True
    mcp_auth_fallback_enabled: bool = False

    # Data bootstrap / seeding
    enable_bootstrap_seed: bool = False

    # MCP bridge base URL (used by execution services for internal calls)
    mcp_base_url: str = "http://localhost:5001"


def load_settings() -> Settings:
    cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    cors_origins = [o.strip() for o in cors_raw.split(",") if o.strip()]

    # Keep both common local dev origins enabled even when env var is customized.
    for default_origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
        if default_origin not in cors_origins:
            cors_origins.append(default_origin)

    return Settings(
        app_env=os.getenv("APP_ENV", "development").strip().lower(),
        app_host=os.getenv("APP_HOST", "0.0.0.0"),
        app_port=_to_int("APP_PORT", 8000),
        app_log_level=os.getenv("APP_LOG_LEVEL", "INFO"),
        debug=_to_bool("DEBUG", False),
        jwt_secret=os.getenv("JWT_SECRET", "").strip(),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        jwt_expire_hours=_to_int("JWT_EXPIRE_HOURS", 24),
        governance_backend_url=os.getenv("GOVERNANCE_BACKEND_URL", "http://localhost:8000").strip(),
        apps_api_auth_proxy_enabled=_to_bool("APPS_API_AUTH_PROXY_ENABLED", True),
        apps_api_auth_routes_enabled=_to_bool("APPS_API_AUTH_ROUTES_ENABLED", True),
        governance_auth_timeout_seconds=_to_int("GOVERNANCE_AUTH_TIMEOUT_SECONDS", 5),
        postgres_dsn=os.getenv(
            "POSTGRES_DSN", "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_governance"
        ),
        redis_url=os.getenv("REDIS_URL", ""),
        redis_perm_ttl=_to_int("REDIS_PERM_TTL", 60),
        redis_model_ttl=_to_int("REDIS_MODEL_TTL", 300),
        redis_rate_window=_to_int("REDIS_RATE_WINDOW", 60),
        snowflake_account=os.getenv("SNOWFLAKE_ACCOUNT", "").strip(),
        snowflake_user=os.getenv("SNOWFLAKE_USER", "").strip(),
        snowflake_password=os.getenv("SNOWFLAKE_PASSWORD", "").strip(),
        snowflake_role=os.getenv("SNOWFLAKE_ROLE", "").strip(),
        snowflake_warehouse=os.getenv("SNOWFLAKE_WAREHOUSE", "").strip(),
        snowflake_database=os.getenv("SNOWFLAKE_DATABASE", "").strip(),
        snowflake_schema=os.getenv("SNOWFLAKE_SCHEMA", "").strip(),
        max_requests_per_minute=_to_int("MAX_REQUESTS_PER_MINUTE", 60),
        max_prompt_length=_to_int("MAX_PROMPT_LENGTH", 50000),
        cors_origins=cors_origins,
        model_adapter_type=os.getenv("MODEL_ADAPTER_TYPE", "litellm"),
        allow_mock_adapter=_to_bool("ALLOW_MOCK_ADAPTER", False),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", "").strip(),
        openai_api_key=os.getenv("OPENAI_API_KEY", "").strip(),
        google_api_key=os.getenv("GOOGLE_API_KEY", "").strip(),
        sentry_dsn=os.getenv("SENTRY_DSN", "").strip(),
        suppress_cloud_metadata_probes=_to_bool("SUPPRESS_CLOUD_METADATA_PROBES", True),
        mcp_auth_fallback_enabled=_to_bool("MCP_AUTH_FALLBACK_ENABLED", False),
        enable_bootstrap_seed=_to_bool("ENABLE_BOOTSTRAP_SEED", False),
        mcp_base_url=os.getenv("MCP_BASE_URL", "http://localhost:5001").strip(),
    )
