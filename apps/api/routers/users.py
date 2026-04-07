from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import load_settings
from ..core.database import TeamAccessSnapshotModel, TeamModel, get_session
from ..models.domain import AuthUser
from ..schemas.api import (
    UserListItem, UserListResponse,
    UserInviteRequest, UserInviteResponse,
    UserAccessResponse, UserAccessUpdateRequest,
    UserRoleUpdateRequest, UserRoleUpdateResponse,
    UserStatusUpdateRequest, UserStatusUpdateResponse,
)
from ..services.permission_service import resolve_user_permissions, invalidate_user_permissions
from ..services.snowflake_service import SnowflakeService

logger = logging.getLogger("backend.users_router")

router = APIRouter(prefix="/users", tags=["users"])

_settings = load_settings()


def _is_admin(user) -> bool:
    return user.has_any_role("ORG_ADMIN", "SECURITY_ADMIN", "ACCOUNTADMIN", "SYSADMIN")


def _normalize_username(user_id: str) -> str:
    value = str(user_id or "").strip()
    if not value:
        return value
    if ":" in value:
        return value.split(":")[-1]
    return value


@router.get("", response_model=UserListResponse)
async def list_users(
    request: Request,
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
):
    current_user = request.state.user
    if not _is_admin(current_user):
        raise HTTPException(
            status_code=403,
            detail={"status": 403, "title": "Access Denied", "detail": "Admin role required"},
        )

    snowflake = SnowflakeService(_settings)
    rows = await snowflake.execute_query("SHOW USERS")
    columns = [c.upper() for c in rows.get("columns", [])]

    def _row_map(row):
        return {columns[i]: row[i] for i in range(len(columns))}

    users_raw = [_row_map(r) for r in rows.get("rows", [])]

    users: list[UserListItem] = []
    for raw in users_raw:
        username = raw.get("NAME") or raw.get("LOGIN_NAME")
        if not username:
            continue
        roles = await snowflake.get_user_roles(username)
        if role and role.upper() not in [r.upper() for r in roles]:
            continue
        disabled = bool(raw.get("DISABLED") or False)
        if is_active is not None and is_active == disabled:
            continue
        user_id = f"{_settings.snowflake_account}:{username}"
        auth_user = AuthUser(
            user_id=user_id,
            email=raw.get("EMAIL") or "",
            role=roles[0] if roles else "VIEWER",
            display_name=raw.get("DISPLAY_NAME") or username,
            roles=roles,
            primary_role=roles[0] if roles else "VIEWER",
            account=_settings.snowflake_account,
            username=username,
        )
        perms = await resolve_user_permissions(auth_user)
        users.append(
            UserListItem(
                user_id=user_id,
                email=auth_user.email,
                display_name=auth_user.display_name,
                role=auth_user.primary_role,
                is_active=not disabled,
                last_login_at=None,
                allowed_models=perms.allowed_models,
                allowed_skills=perms.allowed_skills,
            )
        )

    total = len(users)
    start = (page - 1) * page_size
    end = start + page_size
    paged = users[start:end]

    return UserListResponse(users=paged, total=total, page=page, page_size=page_size)


@router.post("/invite", response_model=UserInviteResponse)
async def invite_user(
    request: Request,
    body: UserInviteRequest,
    db: AsyncSession = Depends(get_session),
):
    raise HTTPException(
        status_code=403,
        detail={"status": 403, "title": "Access Denied", "detail": "Snowflake-managed users only"},
    )


@router.patch("/{user_id}/role", response_model=UserRoleUpdateResponse)
async def update_user_role(
    request: Request,
    user_id: str,
    body: UserRoleUpdateRequest,
    db: AsyncSession = Depends(get_session),
):
    raise HTTPException(
        status_code=403,
        detail={"status": 403, "title": "Access Denied", "detail": "Snowflake-managed roles only"},
    )


@router.patch("/{user_id}/status", response_model=UserStatusUpdateResponse)
async def update_user_status(
    request: Request,
    user_id: str,
    body: UserStatusUpdateRequest,
    db: AsyncSession = Depends(get_session),
):
    raise HTTPException(
        status_code=403,
        detail={"status": 403, "title": "Access Denied", "detail": "Snowflake-managed users only"},
    )


@router.get("/{user_id}/access", response_model=UserAccessResponse)
async def get_user_access(
    request: Request,
    user_id: str,
    db: AsyncSession = Depends(get_session),
):
    current_user = request.state.user
    if not _is_admin(current_user):
        raise HTTPException(
            status_code=403,
            detail={"status": 403, "title": "Access Denied", "detail": "Admin role required"},
        )

    username = _normalize_username(user_id)
    snowflake = SnowflakeService(_settings)
    overrides = await snowflake.get_user_overrides(username)

    skill_ids = sorted({
        str(row.get("resource_id"))
        for row in overrides
        if str(row.get("resource_type") or "").upper() == "SKILL" and str(row.get("resource_id") or "").strip()
    })
    model_ids = sorted({
        str(row.get("resource_id"))
        for row in overrides
        if str(row.get("resource_type") or "").upper() == "MODEL" and str(row.get("resource_id") or "").strip()
    })

    snapshots_result = await db.execute(select(TeamAccessSnapshotModel))
    snapshots = snapshots_result.scalars().all()
    team_ids = sorted({
        str(snapshot.team_id)
        for snapshot in snapshots
        if user_id in (snapshot.user_ids or [])
    })

    return UserAccessResponse(
        user_id=user_id,
        skill_ids=skill_ids,
        model_ids=model_ids,
        team_ids=team_ids,
    )


@router.post("/{user_id}/access/add", response_model=UserAccessResponse)
async def add_user_access(
    request: Request,
    user_id: str,
    body: UserAccessUpdateRequest,
    db: AsyncSession = Depends(get_session),
):
    admin = request.state.user
    if not _is_admin(admin):
        raise HTTPException(
            status_code=403,
            detail={"status": 403, "title": "Access Denied", "detail": "Admin role required"},
        )

    username = _normalize_username(user_id)
    snowflake = SnowflakeService(_settings)
    reviewer = admin.username or admin.user_id

    for skill_id in {str(value).strip() for value in body.skill_ids if str(value).strip()}:
        await snowflake.create_override(
            override_id=str(uuid4()),
            user_name=username,
            resource_type="SKILL",
            resource_id=skill_id,
            granted_by=reviewer,
        )
    for model_id in {str(value).strip() for value in body.model_ids if str(value).strip()}:
        await snowflake.create_override(
            override_id=str(uuid4()),
            user_name=username,
            resource_type="MODEL",
            resource_id=model_id,
            granted_by=reviewer,
        )

    for team_id in {str(value).strip() for value in body.team_ids if str(value).strip()}:
        team_result = await db.execute(select(TeamModel).where(TeamModel.id == team_id))
        team = team_result.scalar_one_or_none()
        if team is None:
            continue
        snapshot_result = await db.execute(
            select(TeamAccessSnapshotModel).where(TeamAccessSnapshotModel.team_id == team_id)
        )
        snapshot = snapshot_result.scalar_one_or_none()
        if snapshot is None:
            snapshot = TeamAccessSnapshotModel(
                team_id=team_id,
                user_ids=[user_id],
                skill_ids=[],
                model_ids=[],
                updated_by=admin.user_id,
            )
            db.add(snapshot)
        else:
            current = list(snapshot.user_ids or [])
            if user_id not in current:
                current.append(user_id)
                snapshot.user_ids = current
            snapshot.updated_by = admin.user_id

    await db.commit()
    await invalidate_user_permissions(user_id)
    return await get_user_access(request, user_id, db)


@router.post("/{user_id}/access/remove", response_model=UserAccessResponse)
async def remove_user_access(
    request: Request,
    user_id: str,
    body: UserAccessUpdateRequest,
    db: AsyncSession = Depends(get_session),
):
    admin = request.state.user
    if not _is_admin(admin):
        raise HTTPException(
            status_code=403,
            detail={"status": 403, "title": "Access Denied", "detail": "Admin role required"},
        )

    username = _normalize_username(user_id)
    snowflake = SnowflakeService(_settings)

    for skill_id in {str(value).strip() for value in body.skill_ids if str(value).strip()}:
        await snowflake.revoke_override(
            user_name=username,
            resource_type="SKILL",
            resource_id=skill_id,
        )
    for model_id in {str(value).strip() for value in body.model_ids if str(value).strip()}:
        await snowflake.revoke_override(
            user_name=username,
            resource_type="MODEL",
            resource_id=model_id,
        )

    for team_id in {str(value).strip() for value in body.team_ids if str(value).strip()}:
        snapshot_result = await db.execute(
            select(TeamAccessSnapshotModel).where(TeamAccessSnapshotModel.team_id == team_id)
        )
        snapshot = snapshot_result.scalar_one_or_none()
        if snapshot is None:
            continue
        snapshot.user_ids = [value for value in (snapshot.user_ids or []) if value != user_id]
        snapshot.updated_by = admin.user_id

    await db.commit()
    await invalidate_user_permissions(user_id)
    return await get_user_access(request, user_id, db)
