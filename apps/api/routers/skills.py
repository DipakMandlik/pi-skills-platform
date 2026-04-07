from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import (
    SkillAssignmentModel,
    SkillDefinitionModel,
    SkillStateModel,
    TeamAccessSnapshotModel,
    get_session,
)
from ..schemas.api import (
    SkillAssignRequest,
    SkillAssignResponse,
    SkillAccessResponse,
    SkillAccessUpdateRequest,
    SkillCreateRequest,
    SkillDeleteResponse,
    SkillFullResponse,
    SkillRevokeRequest,
    SkillRevokeResponse,
    SkillResponse,
    SkillStateUpdateRequest,
    SkillStateUpdateResponse,
    SkillUpdateRequest,
    SkillsListResponse,
    SkillsPaginatedResponse,
    SkillAssignmentInfo,
)
from ..services.permission_service import resolve_user_permissions, invalidate_user_permissions
from ..services.skill_registry import (
    create_skill_db,
    delete_skill_db,
    get_skill_assignment_count,
    get_skill_db,
    list_skills_db,
    list_skills_paginated,
    set_skill_enabled_db,
    update_skill_db,
)
from ..services.snowflake_service import SnowflakeService
from ..core.config import load_settings

logger = logging.getLogger("api.skills_router")

router = APIRouter(prefix="/skills", tags=["skills"])

_settings = load_settings()


def _is_admin(user) -> bool:
    return user.has_any_role("ORG_ADMIN", "SECURITY_ADMIN", "ACCOUNTADMIN", "SYSADMIN")


def _skill_to_full(skill, count: int = 0) -> SkillFullResponse:
    return SkillFullResponse(
        skill_id=skill.skill_id,
        display_name=skill.display_name,
        description=skill.description,
        skill_type=skill.skill_type,
        domain=skill.domain,
        required_models=skill.required_models,
        is_enabled=skill.is_enabled,
        version=skill.version,
        input_schema=skill.input_schema,
        output_format=skill.output_format,
        execution_handler=skill.execution_handler,
        error_handling=skill.error_handling,
        instructions=skill.instructions,
        assignment_count=count,
    )


@router.get("", response_model=SkillsPaginatedResponse)
async def list_skills_endpoint(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str = Query(""),
    skill_type: str = Query(""),
    domain: str = Query(""),
    db: AsyncSession = Depends(get_session),
):
    user = request.state.user
    perms = await resolve_user_permissions(user)

    skills, total, total_pages = await list_skills_paginated(
        db,
        page=page,
        page_size=page_size,
        search=search,
        skill_type=skill_type,
        domain=domain,
        include_disabled=_is_admin(user),
    )

    items = []
    for s in skills:
        if s.skill_id not in perms.allowed_skills and not _is_admin(user):
            continue
        c = await get_skill_assignment_count(db, s.skill_id)
        items.append(_skill_to_full(s, c))

    return SkillsPaginatedResponse(
        skills=items,
        total=len(items),
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/registry")
async def list_skill_registry(request: Request, db: AsyncSession = Depends(get_session)):
    user = request.state.user
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")
    items = []
    for s in await list_skills_db(db, include_disabled=True):
        c = await get_skill_assignment_count(db, s.skill_id)
        items.append(_skill_to_full(s, c))
    return {"skills": items, "total": len(items)}


@router.post("", response_model=SkillFullResponse)
async def create_skill(
    body: SkillCreateRequest, request: Request, db: AsyncSession = Depends(get_session)
):
    user = request.state.user
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")
    try:
        skill = await create_skill_db(db, body.model_dump(), user.user_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _skill_to_full(skill)


@router.get("/{skill_id}", response_model=SkillFullResponse)
async def get_skill(skill_id: str, request: Request, db: AsyncSession = Depends(get_session)):
    user = request.state.user
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")
    skill = await get_skill_db(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")
    c = await get_skill_assignment_count(db, skill_id)
    return _skill_to_full(skill, c)


@router.put("/{skill_id}", response_model=SkillFullResponse)
async def update_skill(
    skill_id: str,
    body: SkillUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    user = request.state.user
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    skill = await update_skill_db(db, skill_id, data, user.user_id)
    if skill is None:
        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")
    c = await get_skill_assignment_count(db, skill_id)
    return _skill_to_full(skill, c)


@router.delete("/{skill_id}", response_model=SkillDeleteResponse)
async def delete_skill(skill_id: str, request: Request, db: AsyncSession = Depends(get_session)):
    user = request.state.user
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")
    deleted = await delete_skill_db(db, skill_id, user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")
    return SkillDeleteResponse(
        deleted=True, skill_id=skill_id, message=f"Skill '{skill_id}' deleted successfully"
    )


@router.patch("/{skill_id}/state", response_model=SkillStateUpdateResponse)
async def update_skill_state(
    skill_id: str,
    body: SkillStateUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    user = request.state.user
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")
    updated = await set_skill_enabled_db(db, skill_id, body.is_enabled, user.user_id)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Unknown skill: {skill_id}")
    return SkillStateUpdateResponse(
        skill_id=updated.skill_id,
        is_enabled=updated.is_enabled,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/assign", response_model=SkillAssignResponse)
async def assign_skill(
    body: SkillAssignRequest, request: Request, db: AsyncSession = Depends(get_session)
):
    user = request.state.user
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")
    skill = await get_skill_db(db, body.skill_id)
    if skill is None:
        raise HTTPException(status_code=400, detail=f"Unknown skill: {body.skill_id}")
    if not skill.is_enabled:
        raise HTTPException(status_code=409, detail=f"Skill disabled: {body.skill_id}")

    snowflake = SnowflakeService(_settings)
    assignment_id = str(uuid4())
    await snowflake.create_override(
        override_id=assignment_id,
        user_name=body.user_id,
        resource_type="SKILL",
        resource_id=body.skill_id,
        granted_by=user.username or user.user_id,
        expires_at=body.expires_at,
    )
    await invalidate_user_permissions(f"{_settings.snowflake_account}:{body.user_id}")

    now = datetime.now(timezone.utc)
    return SkillAssignResponse(
        assignment_id=str(assignment_id),
        user_id=str(body.user_id),
        skill_id=body.skill_id,
        assigned_at=now.isoformat(),
        expires_at=body.expires_at,
        assigned_by=str(user.user_id),
    )


@router.post("/revoke", response_model=SkillRevokeResponse)
async def revoke_skill(
    body: SkillRevokeRequest, request: Request, db: AsyncSession = Depends(get_session)
):
    user = request.state.user
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")

    snowflake = SnowflakeService(_settings)
    await snowflake.revoke_override(
        user_name=body.user_id,
        resource_type="SKILL",
        resource_id=body.skill_id,
    )
    await invalidate_user_permissions(f"{_settings.snowflake_account}:{body.user_id}")

    now = datetime.now(timezone.utc)
    return SkillRevokeResponse(
        revoked=True,
        user_id=body.user_id,
        skill_id=body.skill_id,
        revoked_at=now.isoformat(),
        revoked_by=user.user_id,
    )


@router.get("/{skill_id}/access", response_model=SkillAccessResponse)
async def get_skill_access(
    skill_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    user = request.state.user
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")

    skill = await get_skill_db(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")

    snowflake = SnowflakeService(_settings)
    users_rows = await snowflake.execute_query("SHOW USERS")
    columns = [str(c).upper() for c in users_rows.get("columns", [])]

    def _row_map(row):
        return {columns[i]: row[i] for i in range(len(columns))}

    user_ids: list[str] = []
    for raw in [_row_map(r) for r in users_rows.get("rows", [])]:
        username = raw.get("NAME") or raw.get("LOGIN_NAME")
        if not username:
            continue
        overrides = await snowflake.get_user_overrides(str(username))
        has_skill = any(
            str(item.get("resource_type") or "").upper() == "SKILL"
            and str(item.get("resource_id") or "") == skill_id
            for item in overrides
        )
        if has_skill:
            user_ids.append(f"{_settings.snowflake_account}:{username}")

    snapshot_result = await db.execute(select(TeamAccessSnapshotModel))
    snapshots = snapshot_result.scalars().all()
    team_ids = sorted({
        str(snapshot.team_id)
        for snapshot in snapshots
        if skill_id in (snapshot.skill_ids or [])
    })

    return SkillAccessResponse(skill_id=skill_id, user_ids=sorted(set(user_ids)), team_ids=team_ids)


@router.post("/{skill_id}/access/add", response_model=SkillAccessResponse)
async def add_skill_access(
    skill_id: str,
    body: SkillAccessUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    user = request.state.user
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")

    skill = await get_skill_db(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")

    snowflake = SnowflakeService(_settings)
    reviewer = user.username or user.user_id

    for target in {str(value).strip() for value in body.user_ids if str(value).strip()}:
        username = target.split(":")[-1]
        await snowflake.create_override(
            override_id=str(uuid4()),
            user_name=username,
            resource_type="SKILL",
            resource_id=skill_id,
            granted_by=reviewer,
        )
        await invalidate_user_permissions(f"{_settings.snowflake_account}:{username}")

    for team_id in {str(value).strip() for value in body.team_ids if str(value).strip()}:
        snapshot_result = await db.execute(
            select(TeamAccessSnapshotModel).where(TeamAccessSnapshotModel.team_id == team_id)
        )
        snapshot = snapshot_result.scalar_one_or_none()
        if snapshot is None:
            snapshot = TeamAccessSnapshotModel(
                team_id=team_id,
                user_ids=[],
                skill_ids=[skill_id],
                model_ids=[],
                updated_by=user.user_id,
            )
            db.add(snapshot)
        else:
            existing = list(snapshot.skill_ids or [])
            if skill_id not in existing:
                existing.append(skill_id)
                snapshot.skill_ids = existing
            snapshot.updated_by = user.user_id

    await db.commit()
    return await get_skill_access(skill_id, request, db)


@router.post("/{skill_id}/access/remove", response_model=SkillAccessResponse)
async def remove_skill_access(
    skill_id: str,
    body: SkillAccessUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    user = request.state.user
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")

    skill = await get_skill_db(db, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")

    snowflake = SnowflakeService(_settings)
    for target in {str(value).strip() for value in body.user_ids if str(value).strip()}:
        username = target.split(":")[-1]
        await snowflake.revoke_override(
            user_name=username,
            resource_type="SKILL",
            resource_id=skill_id,
        )
        await invalidate_user_permissions(f"{_settings.snowflake_account}:{username}")

    for team_id in {str(value).strip() for value in body.team_ids if str(value).strip()}:
        snapshot_result = await db.execute(
            select(TeamAccessSnapshotModel).where(TeamAccessSnapshotModel.team_id == team_id)
        )
        snapshot = snapshot_result.scalar_one_or_none()
        if snapshot is None:
            continue
        snapshot.skill_ids = [value for value in (snapshot.skill_ids or []) if value != skill_id]
        snapshot.updated_by = user.user_id

    await db.commit()
    return await get_skill_access(skill_id, request, db)
