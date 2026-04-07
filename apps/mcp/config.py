from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv('.env.local')
load_dotenv('.env')


@dataclass(frozen=True)
class Settings:
    mcp_host: str
    mcp_port: int
    mcp_log_level: str
    mcp_cors_origins: list[str]
    mcp_auth_required: bool
    mcp_rate_limit_per_minute: int
    mcp_max_arguments_bytes: int
    mcp_max_argument_length: int
    mcp_session_database_url: str
    jwt_secret: str
    sql_safety_mode: str
    sql_default_row_limit: int
    sql_max_rows: int
    sql_timeout_seconds: int
    snowflake_account: str
    snowflake_user: str
    snowflake_password: str
    snowflake_role: str
    snowflake_warehouse: str
    snowflake_database: str
    snowflake_schema: str
    snowflake_log_level: str
    suppress_cloud_metadata_probes: bool
    sentry_dsn: str


def _to_int(name: str, fallback: int) -> int:
    raw = os.getenv(name, str(fallback)).strip()
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"Invalid integer for {name}: {raw}") from exc


def _to_bool(name: str, fallback: bool) -> bool:
    raw = os.getenv(name, str(fallback)).strip().lower()
    return raw in {"1", "true", "yes", "y", "on"}


def _jwt_secret_remediation() -> str:
    return (
        "Set JWT_SECRET in .env.local using a 64-char hex value. "
        "Generate with: python -c \"import secrets; print(secrets.token_hex(32))\". "
        "Then restart MCP server."
    )


def validate_jwt_secret(secret: str) -> None:
    if not secret:
        raise ValueError(
            "startup_preflight_failed code=JWT_SECRET_MISSING "
            "message='JWT_SECRET must be set' "
            f"remediation='{_jwt_secret_remediation()}'"
        )
    if secret == "change-me-in-production-please":
        raise ValueError(
            "startup_preflight_failed code=JWT_SECRET_INSECURE_DEFAULT "
            "message='JWT_SECRET must not use the insecure default value' "
            f"remediation='{_jwt_secret_remediation()}'"
        )
    if len(secret) < 32:
        raise ValueError(
            "startup_preflight_failed code=JWT_SECRET_TOO_SHORT "
            "message='JWT_SECRET must be at least 32 characters' "
            f"remediation='{_jwt_secret_remediation()}'"
        )


def load_settings() -> Settings:
    cors_raw = os.getenv(
        "MCP_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
    )
    cors_origins = [origin.strip() for origin in cors_raw.split(",") if origin.strip()]

    return Settings(
        mcp_host=os.getenv("MCP_HOST", "0.0.0.0"),
        mcp_port=_to_int("MCP_PORT", 5000),
        mcp_log_level=os.getenv("MCP_LOG_LEVEL", "INFO"),
        mcp_cors_origins=cors_origins,
        mcp_auth_required=_to_bool("MCP_AUTH_REQUIRED", True),
        mcp_rate_limit_per_minute=_to_int("MCP_RATE_LIMIT_PER_MINUTE", 60),
        mcp_max_arguments_bytes=_to_int("MCP_MAX_ARGUMENTS_BYTES", 50000),
        mcp_max_argument_length=_to_int("MCP_MAX_ARGUMENT_LENGTH", 10000),
        mcp_session_database_url=os.getenv(
            "MCP_SESSION_DATABASE_URL",
            "sqlite:///./apps_mcp_sessions.db",
        ).strip(),
        jwt_secret=os.getenv("JWT_SECRET", "").strip(),
        sql_safety_mode=os.getenv("SQL_SAFETY_MODE", "dev").lower(),
        sql_default_row_limit=_to_int("SQL_DEFAULT_ROW_LIMIT", 1000),
        sql_max_rows=_to_int("SQL_MAX_ROWS", 5000),
        sql_timeout_seconds=_to_int("SQL_TIMEOUT_SECONDS", 60),
        snowflake_account=os.getenv("SNOWFLAKE_ACCOUNT", "").strip(),
        snowflake_user=os.getenv("SNOWFLAKE_USER", "").strip(),
        snowflake_password=os.getenv("SNOWFLAKE_PASSWORD", "").strip(),
        snowflake_role=os.getenv("SNOWFLAKE_ROLE", "").strip(),
        snowflake_warehouse=os.getenv("SNOWFLAKE_WAREHOUSE", "").strip(),
        snowflake_database=os.getenv("SNOWFLAKE_DATABASE", "").strip(),
        snowflake_schema=os.getenv("SNOWFLAKE_SCHEMA", "").strip(),
        snowflake_log_level=os.getenv("SNOWFLAKE_LOG_LEVEL", "ERROR").strip().upper(),
        suppress_cloud_metadata_probes=_to_bool("SUPPRESS_CLOUD_METADATA_PROBES", True),
        sentry_dsn=os.getenv("SENTRY_DSN", "").strip(),
    )


def validate_required_env(settings: Settings) -> list[str]:
    missing: list[str] = []
    required = {
        "SNOWFLAKE_ACCOUNT": settings.snowflake_account,
        "SNOWFLAKE_USER": settings.snowflake_user,
        "SNOWFLAKE_PASSWORD": settings.snowflake_password,
        "SNOWFLAKE_ROLE": settings.snowflake_role,
        "SNOWFLAKE_WAREHOUSE": settings.snowflake_warehouse,
        "SNOWFLAKE_DATABASE": settings.snowflake_database,
        "SNOWFLAKE_SCHEMA": settings.snowflake_schema,
    }
    for key, value in required.items():
        if not value:
            missing.append(key)
    return missing
