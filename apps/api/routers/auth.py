from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_session
from ..core.token_deps import get_denylist_service, get_token_service
from ..models.domain import AuthUser
from ..schemas.api import (
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    RefreshRequest,
    SnowflakeLoginRequest,
    UserMeResponse,
)
from ..services.permission_service import resolve_user_permissions
from ..services.snowflake_service import SnowflakeService
from ..services.token_service import TokenExpiredError, TokenInvalidError

logger = logging.getLogger("api.auth_router")

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_session),
):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "status": 403,
            "title": "Access Denied",
            "detail": "Local login is disabled. Use Snowflake credentials.",
        },
    )


@router.post("/refresh", response_model=LoginResponse)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_session),
):
    try:
        token_pair = await get_token_service().refresh(body.refresh_token)
    except (TokenExpiredError, TokenInvalidError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"status": 401, "title": "Unauthorized", "detail": str(exc)},
        ) from exc

    claims = await get_token_service().verify(token_pair.access_token)
    roles = claims.roles or []
    primary_role = roles[0] if roles else ""

    auth_user = AuthUser(
        user_id=claims.user_id,
        email="",
        role=primary_role or "viewer",
        display_name="",
        roles=roles,
        primary_role=primary_role,
    )

    perms = await resolve_user_permissions(auth_user)

    return LoginResponse(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        role=primary_role or "viewer",
        roles=roles,
        primary_role=primary_role,
        user_id=claims.user_id,
        display_name="",
        allowed_models=perms.allowed_models,
        allowed_skills=perms.allowed_skills,
        enabled_features=perms.enabled_features,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"status": 401, "title": "Unauthorized", "detail": "Missing bearer token"},
        )

    token = auth_header[7:]
    try:
        claims = await get_token_service().verify(token)
    except (TokenExpiredError, TokenInvalidError):
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    remaining_ttl = max(1, int(claims.exp - time.time()))
    await get_denylist_service().add(claims.jti, remaining_ttl)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _validate_snowflake_credentials_sync(account: str, username: str, password: str, role: str) -> dict:
    import requests as http_requests

    url = f"https://{account}.snowflakecomputing.com/session/v1/login-request"
    payload = {
        "data": {
            "LOGIN_NAME": username,
            "PASSWORD": password,
            "ACCOUNT_NAME": account,
            "CLIENT_APP_ID": "PiSkillsAPI",
            "CLIENT_APP_VERSION": "1.0.0",
        }
    }
    if role:
        payload["data"]["ROLE_NAME"] = role

    def _post(trust_env: bool):
        # requests uses env proxy variables by default. Some dev environments have
        # a broken proxy configured (e.g. 127.0.0.1:9), which breaks Snowflake auth.
        if trust_env:
            return http_requests.post(url, json=payload, timeout=15)
        session = http_requests.Session()
        session.trust_env = False
        try:
            return session.post(url, json=payload, timeout=15)
        finally:
            session.close()

    try:
        resp = _post(trust_env=True)
    except http_requests.exceptions.ProxyError:
        # Retry without env proxies for better DX while still supporting corp proxies when valid.
        resp = _post(trust_env=False)
    except Exception as exc:
        # Most common: DNS failure, proxy/firewall, TLS handshake, connect/read timeout.
        raise ValueError(f"Unable to reach Snowflake login endpoint for account '{account}': {exc}") from exc

    # Snowflake usually returns JSON; if it doesn't, surface a helpful message in dev.
    data = None
    try:
        data = resp.json()
    except Exception:
        snippet = (resp.text or "").strip().replace("\r", " ").replace("\n", " ")
        if len(snippet) > 200:
            snippet = snippet[:200] + "..."
        raise ValueError(
            f"Snowflake login endpoint returned non-JSON response (status={resp.status_code}) for account '{account}'. "
            f"Check account identifier/region and network access. Body: {snippet or '<empty>'}"
        )

    if not resp.ok:
        # Snowflake includes a "message" field for many errors.
        msg = data.get("message") if isinstance(data, dict) else None
        raise ValueError(
            f"Snowflake login failed (status={resp.status_code}) for user '{username}' on account '{account}': "
            f"{msg or 'Authentication failed'}"
        )

    if not isinstance(data, dict) or not data.get("success"):
        error_msg = data.get("message", "Authentication failed") if isinstance(data, dict) else "Authentication failed"
        raise ValueError(str(error_msg))

    session_info = data.get("data", {}).get("sessionInfo", {})
    display_user = data.get("data", {}).get("displayUserName", username)
    return {
        "snowflake_role": session_info.get("roleName", role),
        "display_user": display_user,
    }


@router.post("/snowflake", response_model=LoginResponse)
async def login_snowflake(
    body: SnowflakeLoginRequest,
    db: AsyncSession = Depends(get_session),
):
    t0 = time.monotonic()
    try:
        sf_info = await asyncio.to_thread(
            _validate_snowflake_credentials_sync,
            body.account,
            body.username,
            body.password,
            body.role,
        )
    except ValueError as exc:
        logger.warning("snowflake_login_failed account=%s user=%s: %s", body.account, body.username, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"status": 401, "title": "Unauthorized", "detail": str(exc)},
        )
    except Exception as exc:
        logger.error("snowflake_login_error account=%s user=%s: %s", body.account, body.username, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"status": 401, "title": "Unauthorized", "detail": "Snowflake authentication failed"},
        )

    from ..main import settings

    snowflake = SnowflakeService(settings)
    try:
        t_roles = time.monotonic()
        roles = await snowflake.get_user_roles(body.username)
        logger.info("snowflake_role_fetch_ok user=%s ms=%s", body.username, int((time.monotonic() - t_roles) * 1000))
    except Exception as exc:
        logger.error("snowflake_role_fetch_failed user=%s: %s", body.username, exc)
        roles = []

    primary_role = (body.role or sf_info.get("snowflake_role") or "").upper()
    if primary_role and primary_role not in roles:
        roles = [primary_role] + [r for r in roles if r != primary_role]

    display_user = sf_info["display_user"]
    user_id = f"{body.account}:{body.username}"
    email = f"{display_user}@{body.account}.snowflakecomputing.com".lower()
    display_name = display_user.replace(".", " ").replace("_", " ").title()

    token_pair = await get_token_service().issue(
        user_id=user_id,
        roles=roles,
        extra_claims={
            "primary_role": primary_role or (roles[0] if roles else ""),
            "account": body.account,
            "username": body.username,
            "email": email,
            "display_name": display_name,
        },
    )

    # Keep login fast: permissions are resolved on-demand via /auth/me and protected endpoints.
    logger.info(
        "snowflake_login_success account=%s user=%s role=%s ms=%s",
        body.account,
        body.username,
        primary_role,
        int((time.monotonic() - t0) * 1000),
    )

    return LoginResponse(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        role=primary_role or (roles[0] if roles else "viewer"),
        roles=roles,
        primary_role=primary_role,
        user_id=user_id,
        display_name=display_name,
        allowed_models=[],
        allowed_skills=[],
        enabled_features=[],
    )


@router.get("/me", response_model=UserMeResponse)
async def get_me(
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    user = request.state.user
    logger.info(
        "auth_me_resolved user_id=%s primary_role=%s roles=%s",
        user.user_id,
        user.primary_role,
        user.roles,
    )
    perms = await resolve_user_permissions(user)

    return UserMeResponse(
        user_id=user.user_id,
        email=user.email,
        role=user.role,
        primary_role=user.primary_role,
        roles=user.roles,
        display_name=user.display_name,
        allowed_models=perms.allowed_models,
        allowed_skills=perms.allowed_skills,
        enabled_features=perms.enabled_features,
        token_expires_at=datetime.fromtimestamp(user.token_exp, tz=timezone.utc).isoformat(),
    )
