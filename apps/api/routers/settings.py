from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import OrgSettingsModel, get_session
from ..schemas.api import OrgSettingsResponse, OrgSettingsUpdateRequest

router = APIRouter(prefix="/settings", tags=["settings"])


def _require_admin(request: Request):
    user = request.state.user
    if not user.has_admin_access():
        raise HTTPException(
            status_code=403,
            detail={"status": 403, "title": "Access Denied", "detail": "Admin role required"},
        )
    return user


async def _get_or_create_settings(db: AsyncSession, actor_id: str) -> OrgSettingsModel:
    result = await db.execute(select(OrgSettingsModel).limit(1))
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = OrgSettingsModel(
            id=str(uuid4()),
            org_name="Pi Skills Platform",
            org_domain="example.com",
            default_region="us-east-1",
            notifications={
                "email": True,
                "skillCreated": True,
                "skillAssigned": True,
                "skillEdited": False,
                "userJoined": True,
                "errors": True,
            },
            appearance={"theme": "system", "language": "en"},
            integrations={
                "services": [
                    {"name": "Snowflake", "status": "Connected", "configurable": True},
                    {"name": "Google AI", "status": "Connected", "configurable": True},
                    {"name": "Slack", "status": "Not Connected", "configurable": True},
                ],
                "api_keys": [
                    {"name": "Production Key", "status": "Active", "masked_value": "sk-••••••••••••••••••••"},
                    {"name": "Development Key", "status": "Revoked", "masked_value": "sk-••••••••••••••••••••"},
                ],
            },
            updated_by=actor_id,
        )
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.get("", response_model=OrgSettingsResponse)
async def get_settings(
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    settings = await _get_or_create_settings(db, admin.user_id)
    return OrgSettingsResponse(
        org_name=settings.org_name,
        org_domain=settings.org_domain,
        default_region=settings.default_region,
        notifications=settings.notifications or {},
        appearance=settings.appearance or {},
        integrations=settings.integrations or {},
    )


@router.put("", response_model=OrgSettingsResponse)
async def update_settings(
    body: OrgSettingsUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    settings = await _get_or_create_settings(db, admin.user_id)
    if body.org_name is not None:
        settings.org_name = body.org_name.strip()
    if body.org_domain is not None:
        settings.org_domain = body.org_domain.strip()
    if body.default_region is not None:
        settings.default_region = body.default_region.strip()
    if body.notifications is not None:
        settings.notifications = body.notifications
    if body.appearance is not None:
        settings.appearance = body.appearance
    if body.integrations is not None:
        settings.integrations = body.integrations
    settings.updated_by = admin.user_id
    await db.commit()
    await db.refresh(settings)
    return OrgSettingsResponse(
        org_name=settings.org_name,
        org_domain=settings.org_domain,
        default_region=settings.default_region,
        notifications=settings.notifications or {},
        appearance=settings.appearance or {},
        integrations=settings.integrations or {},
    )
