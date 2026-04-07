from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import TeamAccessSnapshotModel, TeamMemberModel, TeamModel, get_session
from ..schemas.api import (
    TeamAccessResponse,
    TeamAccessUpdateRequest,
    TeamCreateRequest,
    TeamDeleteResponse,
    TeamListResponse,
    TeamResponse,
    TeamUpdateRequest,
)
from ..services.permission_service import invalidate_all_permissions

router = APIRouter(prefix="/teams", tags=["teams"])


def _require_admin(request: Request):
    user = request.state.user
    if not user.has_admin_access():
        raise HTTPException(
            status_code=403,
            detail={"status": 403, "title": "Access Denied", "detail": "Admin role required"},
        )
    return user


async def _team_response(db: AsyncSession, team: TeamModel) -> TeamResponse:
    snapshot_result = await db.execute(
        select(TeamAccessSnapshotModel).where(TeamAccessSnapshotModel.team_id == team.id)
    )
    snapshot = snapshot_result.scalar_one_or_none()
    if snapshot is not None:
        member_count = len(list(snapshot.user_ids or []))
    else:
        count_result = await db.execute(
            select(func.count(TeamMemberModel.id)).where(TeamMemberModel.team_id == team.id)
        )
        member_count = int(count_result.scalar() or 0)

    return TeamResponse(
        team_id=str(team.id),
        name=team.name,
        description=team.description or "",
        member_count=member_count,
        created_at=team.created_at.isoformat() if team.created_at else "",
    )


@router.get("", response_model=TeamListResponse)
async def list_teams(
    request: Request,
    search: str = Query(""),
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    query = select(TeamModel).order_by(TeamModel.created_at.desc())
    if search:
        like = f"%{search.lower()}%"
        query = query.where(
            func.lower(TeamModel.name).like(like) | func.lower(TeamModel.description).like(like)
        )
    result = await db.execute(query)
    teams = result.scalars().all()
    items = [await _team_response(db, team) for team in teams]
    return TeamListResponse(teams=items, total=len(items))


@router.post("", response_model=TeamResponse)
async def create_team(
    body: TeamCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    existing = await db.execute(select(TeamModel).where(TeamModel.name == body.name.strip()))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail={"status": 409, "title": "Conflict", "detail": "Team already exists"},
        )
    team = TeamModel(
        id=str(uuid4()),
        name=body.name.strip(),
        description=body.description.strip(),
        created_by=admin.user_id,
    )
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return await _team_response(db, team)


@router.put("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    body: TeamUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    result = await db.execute(select(TeamModel).where(TeamModel.id == team_id))
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Team not found"},
        )
    if body.name is not None:
        team.name = body.name.strip()
    if body.description is not None:
        team.description = body.description.strip()
    team.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(team)
    return await _team_response(db, team)


@router.delete("/{team_id}", response_model=TeamDeleteResponse)
async def delete_team(
    team_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    result = await db.execute(select(TeamModel).where(TeamModel.id == team_id))
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Team not found"},
        )
    await db.execute(delete(TeamMemberModel).where(TeamMemberModel.team_id == team_id))
    await db.execute(delete(TeamAccessSnapshotModel).where(TeamAccessSnapshotModel.team_id == team_id))
    await db.delete(team)
    await db.commit()
    return TeamDeleteResponse(deleted=True, team_id=team_id)


@router.get("/{team_id}/access", response_model=TeamAccessResponse)
async def get_team_access(
    team_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    team_result = await db.execute(select(TeamModel).where(TeamModel.id == team_id))
    team = team_result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Team not found"},
        )

    snapshot_result = await db.execute(
        select(TeamAccessSnapshotModel).where(TeamAccessSnapshotModel.team_id == team_id)
    )
    snapshot = snapshot_result.scalar_one_or_none()
    if snapshot is None:
        return TeamAccessResponse(team_id=team_id, user_ids=[], skill_ids=[], model_ids=[])

    return TeamAccessResponse(
        team_id=team_id,
        user_ids=list(snapshot.user_ids or []),
        skill_ids=list(snapshot.skill_ids or []),
        model_ids=list(snapshot.model_ids or []),
    )


@router.put("/{team_id}/access", response_model=TeamAccessResponse)
async def put_team_access(
    team_id: str,
    body: TeamAccessUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    team_result = await db.execute(select(TeamModel).where(TeamModel.id == team_id))
    team = team_result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Team not found"},
        )

    snapshot_result = await db.execute(
        select(TeamAccessSnapshotModel).where(TeamAccessSnapshotModel.team_id == team_id)
    )
    snapshot = snapshot_result.scalar_one_or_none()

    user_ids = list(dict.fromkeys([str(value).strip() for value in body.user_ids if str(value).strip()]))
    skill_ids = list(dict.fromkeys([str(value).strip() for value in body.skill_ids if str(value).strip()]))
    model_ids = list(dict.fromkeys([str(value).strip() for value in body.model_ids if str(value).strip()]))

    if snapshot is None:
        snapshot = TeamAccessSnapshotModel(
            team_id=team_id,
            user_ids=user_ids,
            skill_ids=skill_ids,
            model_ids=model_ids,
            updated_by=admin.user_id,
        )
        db.add(snapshot)
    else:
        snapshot.user_ids = user_ids
        snapshot.skill_ids = skill_ids
        snapshot.model_ids = model_ids
        snapshot.updated_by = admin.user_id

    await db.commit()
    await invalidate_all_permissions()

    return TeamAccessResponse(
        team_id=team_id,
        user_ids=user_ids,
        skill_ids=skill_ids,
        model_ids=model_ids,
    )
