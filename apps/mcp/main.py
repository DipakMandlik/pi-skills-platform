from __future__ import annotations

import json
import logging
import os
import threading
import hashlib
from contextlib import asynccontextmanager
from typing import Any
from datetime import datetime, timezone

import sentry_sdk
import uvicorn
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from .config import load_settings, validate_jwt_secret, validate_required_env
from .secretbox import SecretBoxError, decrypt_json, encrypt_json
from .session_store import SessionStore
from .security import ValidationError, sanitize_error
from .snowflake_client import SnowflakeClient, SnowflakeClientUnavailableError
from .tool_registry import ToolRegistry

settings = load_settings()

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[
            StarletteIntegration(transaction_style="url"),
            FastApiIntegration(transaction_style="url"),
        ],
        environment=os.getenv("APP_ENV", "development"),
        release=os.getenv("GIT_COMMIT_SHA", "dev"),
        traces_sample_rate=0.0,
        send_default_pii=False,
    )
logging.basicConfig(level=getattr(logging, settings.mcp_log_level.upper(), logging.INFO))
logger = logging.getLogger("snowflake-mcp")


def _configure_third_party_logging() -> None:
    level = getattr(logging, settings.snowflake_log_level.upper(), logging.ERROR)
    logging.getLogger("snowflake").setLevel(level)
    logging.getLogger("snowflake.connector").setLevel(level)
    logging.getLogger("snowflake.connector.connection").setLevel(level)
    logging.getLogger("snowflake.connector.vendored.urllib3").setLevel(level)
    logging.getLogger("snowflake.connector.vendored.urllib3.connectionpool").setLevel(level)
    logging.getLogger("urllib3.connectionpool").setLevel(level)
    logging.getLogger("botocore").setLevel(level)


_configure_third_party_logging()

app = FastAPI(title="Snowflake MCP Bridge", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.mcp_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
registry = ToolRegistry(settings=settings, sf=SnowflakeClient(settings))
session_store = SessionStore(settings.mcp_session_database_url, settings.jwt_secret)


# ── Auth Session Store (persistent) ──

_rate_limits: dict[str, tuple[float, int]] = {}
_rate_limit_lock = threading.Lock()

_PLATFORM_ROLE_MAP = {
    "ACCOUNTADMIN": "ORG_ADMIN",
    "SYSADMIN": "ORG_ADMIN",
    "ORG_ADMIN": "ORG_ADMIN",
    "ADMIN": "ORG_ADMIN",
    "SECURITYADMIN": "SECURITY_ADMIN",
    "SECURITY_ADMIN": "SECURITY_ADMIN",
    "DATA_ENGINEER": "DATA_ENGINEER",
    "ANALYTICS_ENGINEER": "ANALYTICS_ENGINEER",
    "DATA_SCIENTIST": "DATA_SCIENTIST",
    "BUSINESS_USER": "BUSINESS_USER",
    "VIEWER": "VIEWER",
    "USER": "BUSINESS_USER",
}


def _to_platform_role(role: str) -> str:
    role_upper = (role or "").upper()
    if role_upper in _PLATFORM_ROLE_MAP:
        return _PLATFORM_ROLE_MAP[role_upper]
    if any(kw in role_upper for kw in ("ADMIN", "SYSADMIN", "SECURITY")):
        return "ORG_ADMIN"
    return "VIEWER"


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    """Strip internal _-prefixed keys before sending user data to clients."""
    return {k: v for k, v in user.items() if not k.startswith("_")}


def _build_execution_context(user: dict[str, Any]) -> dict[str, Any]:
    """Decrypt per-user Snowflake credentials from session and build a scoped client."""
    encrypted_ctx = user.get("_snowflake_ctx_encrypted")
    if not encrypted_ctx:
        return {}

    decrypted = decrypt_json(str(encrypted_ctx), settings.jwt_secret)
    account = str(decrypted.get("account") or "").strip()
    username = str(decrypted.get("username") or "").strip()
    password = str(decrypted.get("password") or "").strip()
    role = str(decrypted.get("role") or "").strip()
    warehouse = str(decrypted.get("warehouse") or "").strip()
    database = str(decrypted.get("database") or "").strip()
    schema = str(decrypted.get("schema") or "").strip()

    if not account or not username or not password or not role:
        raise SecretBoxError("session Snowflake context is incomplete")

    sf_client = SnowflakeClient(
        settings,
        runtime_credentials={
            "account": account,
            "username": username,
            "password": password,
            "role": role,
            "warehouse": warehouse,
            "database": database,
            "schema": schema,
        },
    )
    return {"sf_client": sf_client}


def _store_token(user_info: dict[str, Any]) -> tuple[str, str]:
    return session_store.issue_session(user_info)


def _validate_token(token: str) -> dict[str, Any] | None:
    return session_store.validate_access_token(token)


def _refresh_session(refresh_token: str) -> tuple[str, str] | None:
    return session_store.refresh_session(refresh_token)


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    value = authorization.strip()
    prefix = "Bearer "
    if not value.lower().startswith(prefix.lower()):
        return ""
    return value[len(prefix) :].strip()


def _require_authenticated_user(authorization: str | None) -> tuple[str, dict[str, Any]]:
    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    user = _validate_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return token, user


def _enforce_rate_limit(token: str) -> None:
    now = datetime.now(timezone.utc).timestamp()
    window_seconds = 60.0
    with _rate_limit_lock:
        window_start, count = _rate_limits.get(token, (now, 0))
        if now - window_start >= window_seconds:
            window_start = now
            count = 0

        count += 1
        _rate_limits[token] = (window_start, count)

        if count > settings.mcp_rate_limit_per_minute:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded: max {settings.mcp_rate_limit_per_minute} requests/min",
            )


def _validate_argument_payload(arguments: dict[str, Any]) -> None:
    payload = json.dumps(arguments, separators=(",", ":"), ensure_ascii=True)
    payload_size = len(payload.encode("utf-8"))
    if payload_size > settings.mcp_max_arguments_bytes:
        raise ValidationError(
            f"arguments payload exceeds limit ({payload_size} bytes > {settings.mcp_max_arguments_bytes} bytes)"
        )

    def _walk(value: Any, path: str = "arguments") -> None:
        if isinstance(value, str):
            if len(value) > settings.mcp_max_argument_length:
                raise ValidationError(
                    f"{path} exceeds max length ({len(value)} > {settings.mcp_max_argument_length})"
                )
            return
        if isinstance(value, dict):
            for key, item in value.items():
                _walk(item, f"{path}.{key}")
            return
        if isinstance(value, list):
            for index, item in enumerate(value):
                _walk(item, f"{path}[{index}]")

    _walk(arguments)


def _run_startup_checks() -> None:
    try:
        validate_jwt_secret(settings.jwt_secret)
        logger.info("startup_preflight_passed check=jwt_secret")
    except ValueError as exc:
        logger.error("startup_preflight_failed check=jwt_secret detail=%s", sanitize_error(exc))
        raise


def _start_session_cleanup_loop() -> None:
    def _cleanup_worker() -> None:
        while True:
            try:
                session_store.cleanup_expired()
            except Exception as exc:
                logger.warning("session_cleanup_failed: %s", sanitize_error(exc))
            threading.Event().wait(600)

    threading.Thread(target=_cleanup_worker, daemon=True).start()


def _start_snowflake_warmup() -> None:
    def _warmup() -> None:
        try:
            registry.sf.execute_query("SELECT 1")
            logger.info("snowflake_warmup_success")
        except Exception as exc:
            logger.warning("snowflake_warmup_failed: %s", sanitize_error(exc))

    threading.Thread(target=_warmup, daemon=True).start()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _run_startup_checks()
    _start_session_cleanup_loop()
    _start_snowflake_warmup()
    yield


app.router.lifespan_context = lifespan


# ── Request Models ──


class ToolCallRequest(BaseModel):
    name: str = Field(min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)


class AuthLoginRequest(BaseModel):
    account: str = Field(min_length=1)
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)
    role: str = Field(min_length=1)


class AuthRefreshRequest(BaseModel):
    refreshToken: str = Field(min_length=1)


class AuthLogoutRequest(BaseModel):
    refreshToken: str | None = None


# ── Routes ──


@app.get("/health")
def health() -> dict[str, Any]:
    missing = validate_required_env(settings)
    connector_ready = True
    connector_message = None
    try:
        registry.sf._load_connector()
    except SnowflakeClientUnavailableError as exc:
        connector_ready = False
        connector_message = str(exc)

    return {
        "status": "ok" if (not missing and connector_ready) else "degraded",
        "missing_env": missing,
        "sql_safety_mode": settings.sql_safety_mode,
        "snowflake_connector_ready": connector_ready,
        "snowflake_connector_message": connector_message,
    }


@app.post("/auth/login")
def auth_login(request: AuthLoginRequest) -> dict[str, Any]:
    """Authenticate user against Snowflake REST API."""
    import requests as http_requests

    try:
        url = f"https://{request.account}.snowflakecomputing.com/session/v1/login-request"
        payload = {
            "data": {
                "LOGIN_NAME": request.username,
                "PASSWORD": request.password,
                "ACCOUNT_NAME": request.account,
                "CLIENT_APP_ID": "PiSkills",
                "CLIENT_APP_VERSION": "1.0.0",
            }
        }
        if request.role:
            payload["data"]["ROLE_NAME"] = request.role

        resp = http_requests.post(url, json=payload, timeout=15)
        resp_data = resp.json()

        if not resp_data.get("success"):
            error_msg = resp_data.get("message", "Authentication failed")
            raise HTTPException(status_code=401, detail=str(error_msg))

        session_info = resp_data.get("data", {}).get("sessionInfo", {})
        snowflake_role = session_info.get("roleName", request.role)
        snowflake_user = resp_data.get("data", {}).get("displayUserName", request.username)

        effective_role = (snowflake_role or request.role or "").upper()
        platform_role = _to_platform_role(effective_role)

        display_name = snowflake_user.replace(".", " ").replace("_", " ").title()
        session_ctx = {
            "account": request.account,
            "username": request.username,
            "password": request.password,
            "role": effective_role,
            "warehouse": settings.snowflake_warehouse,
            "database": settings.snowflake_database,
            "schema": settings.snowflake_schema,
        }
        user_info = {
            "id": hashlib.md5(f"{request.account}:{snowflake_user}".encode()).hexdigest()[:12],
            "email": f"{snowflake_user}@{request.account}.snowflakecomputing.com",
            "name": display_name,
            "role": platform_role,
            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "_snowflake_ctx_encrypted": encrypt_json(session_ctx, settings.jwt_secret),
        }

        token, refresh_token = _store_token(user_info)
        logger.info(
            "auth_login_success user=%s account=%s role=%s",
            snowflake_user,
            request.account,
            snowflake_role,
        )

        return {
            "token": token,
            "refreshToken": refresh_token,
            "user": _public_user(user_info),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(
            "auth_login_failed user=%s account=%s error=%s",
            request.username,
            request.account,
            sanitize_error(exc),
        )
        raise HTTPException(
            status_code=401,
            detail="Snowflake authentication failed. Check your account, username, password, and role.",
        )


@app.post("/auth/refresh")
def auth_refresh(request: AuthRefreshRequest) -> dict[str, Any]:
    refreshed = _refresh_session(request.refreshToken)
    if not refreshed:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    token, refresh_token = refreshed
    user = _validate_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Failed to refresh session")
    return {
        "token": token,
        "refreshToken": refresh_token,
        "user": _public_user(user),
    }


@app.post("/auth/logout")
def auth_logout(
    request: AuthLogoutRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    revoked = session_store.revoke_by_access_token(token)
    if not revoked and request.refreshToken:
        revoked = session_store.revoke_by_refresh_token(request.refreshToken)
    if not revoked:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"revoked": True}


@app.get("/users/me")
def get_current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """Get current user from token."""
    _, user = _require_authenticated_user(authorization)
    return _public_user(user)


@app.get("/mcp/tools")
def list_tools(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if settings.mcp_auth_required:
        token, _ = _require_authenticated_user(authorization)
        _enforce_rate_limit(token)

    tools = []
    for tool in registry.list_tools():
        tools.append(
            {
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.input_schema,
                "outputSchema": tool.output_schema,
            }
        )
    return {"tools": tools}


@app.post("/mcp/call")
def call_tool(
    request: ToolCallRequest, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    try:
        user: dict[str, Any] | None = None
        execution_context: dict[str, Any] = {}
        if settings.mcp_auth_required:
            token, user = _require_authenticated_user(authorization)
            _enforce_rate_limit(token)
            execution_context = _build_execution_context(user)

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("http.method", "POST")
            scope.set_tag("http.route", "/mcp/call")
            scope.set_tag("mcp.tool", request.name)
            if user is not None:
                scope.set_user({"id": user.get("id"), "email": user.get("email")})

            _validate_argument_payload(request.arguments)
            result = registry.run_tool(
                request.name, request.arguments, execution_context=execution_context
            )
            logger.info("tool_call_success name=%s", request.name)
            return {"ok": True, "name": request.name, "result": result}
    except SecretBoxError as exc:
        raise HTTPException(status_code=401, detail=sanitize_error(exc)) from exc
    except ValidationError as exc:
        logger.warning("tool_call_validation_error name=%s error=%s", request.name, exc)
        raise HTTPException(status_code=400, detail=sanitize_error(exc)) from exc
    except Exception as exc:
        logger.exception("tool_call_failed name=%s", request.name)
        raise HTTPException(status_code=500, detail=sanitize_error(exc)) from exc


@app.get("/mcp/events")
def mcp_events(authorization: str | None = Header(default=None)) -> StreamingResponse:
    if settings.mcp_auth_required:
        token, _ = _require_authenticated_user(authorization)
        _enforce_rate_limit(token)

    def event_stream():
        payload = {
            "event": "server_ready",
            "tools": [t.name for t in registry.list_tools()],
            "sql_safety_mode": settings.sql_safety_mode,
        }
        yield f"data: {json.dumps(payload)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def run() -> None:
    uvicorn.run(
        "apps.mcp.main:app",
        host=settings.mcp_host,
        port=settings.mcp_port,
        reload=False,
        log_level=settings.mcp_log_level.lower(),
    )


if __name__ == "__main__":
    run()
