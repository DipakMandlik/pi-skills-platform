from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, status

from ..core.token_deps import get_session_manager
from ..schemas.api import RevokeSessionsResponse, SessionInfoResponse, UserSessionsResponse

logger = logging.getLogger("api.admin_sessions_router")

router = APIRouter(prefix="/admin/sessions", tags=["admin"])


def _require_admin(request: Request) -> None:
    user = request.state.user
    if not user.has_admin_access():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"status": 403, "title": "Forbidden", "detail": "Admin role required"},
        )


@router.get("/{user_id}", response_model=UserSessionsResponse)
async def list_user_sessions(user_id: str, request: Request):
    """List all active sessions for a user. Admin only."""
    _require_admin(request)

    sessions = await get_session_manager().list_sessions(user_id)
    return UserSessionsResponse(
        user_id=user_id,
        sessions=[
            SessionInfoResponse(
                session_id=s.session_id,
                user_id=s.user_id,
                issued_at=s.issued_at,
                expires_at=s.expires_at,
            )
            for s in sessions
        ],
        count=len(sessions),
    )


@router.delete("/{user_id}", response_model=RevokeSessionsResponse)
async def revoke_user_sessions(user_id: str, request: Request):
    """Force-revoke all active sessions for a user. Admin only.

    - Deletes all refresh tokens from Redis
    - Adds all active access JTIs to the denylist
    - Writes a tamper-evident audit log entry
    """
    _require_admin(request)
    actor = request.state.user

    revoked = await get_session_manager().revoke_all(
        user_id=user_id,
        revoked_by=actor.user_id,
    )

    logger.info(
        "admin_force_revoke actor=%s target=%s sessions_revoked=%d",
        actor.user_id,
        user_id,
        revoked,
    )

    return RevokeSessionsResponse(
        user_id=user_id,
        revoked_by=actor.user_id,
        sessions_revoked=revoked,
    )
