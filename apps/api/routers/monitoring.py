from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_session
from ..schemas.api import (
    AuditLogEntry,
    MonitoringResponse,
    MonitoringSummary,
)
from ..services.snowflake_service import SnowflakeService
from ..core.config import load_settings

logger = logging.getLogger("backend.monitoring_router")

router = APIRouter(prefix="/monitoring", tags=["monitoring"])

_settings = load_settings()


def _is_admin(user) -> bool:
    return user.has_any_role("ORG_ADMIN", "SECURITY_ADMIN", "ACCOUNTADMIN", "SYSADMIN")


@router.get("", response_model=MonitoringResponse)
async def get_monitoring(
    request: Request,
    user_id: Optional[str] = Query(None),
    model_id: Optional[str] = Query(None),
    skill_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_session),
):
    current_user = request.state.user
    snowflake = SnowflakeService(_settings)

    offset = (page - 1) * page_size
    rows = await snowflake.get_audit_logs(limit=page_size, offset=offset)

    logs = []
    for r in rows:
        if not _is_admin(current_user) and r.get("user_id") != current_user.user_id:
            continue
        if user_id and r.get("user_id") != user_id:
            continue
        if model_id and r.get("resource_id") != model_id:
            continue
        if skill_id and r.get("resource_id") != skill_id:
            continue
        if action and r.get("action") != action:
            continue
        if from_date:
            dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
            if r.get("timestamp") and r["timestamp"] < dt:
                continue
        if to_date:
            dt = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
            if r.get("timestamp") and r["timestamp"] > dt:
                continue

        details = r.get("details") or {}
        logs.append(
            AuditLogEntry(
                id=str(r.get("audit_id")),
                request_id=str(r.get("resource_id")),
                user_id=r.get("user_id"),
                skill_id=details.get("skill_id"),
                model_id=details.get("model_id"),
                action=r.get("action"),
                outcome=details.get("outcome") or "UNKNOWN",
                tokens_used=details.get("tokens_used"),
                latency_ms=details.get("latency_ms"),
                timestamp=r.get("timestamp").isoformat() if r.get("timestamp") else "",
            )
        )

    total = len(logs)
    total_execs = len([l for l in logs if l.action == "EXEC_SUCCESS"])
    total_denials = len([l for l in logs if l.outcome == "DENIED"])
    total_tokens = sum([l.tokens_used or 0 for l in logs])
    avg_latency = 0.0
    latencies = [l.latency_ms for l in logs if l.latency_ms is not None]
    if latencies:
        avg_latency = sum(latencies) / len(latencies)

    return MonitoringResponse(
        logs=logs,
        total=total,
        page=page,
        page_size=page_size,
        summary=MonitoringSummary(
            total_executions=total_execs,
            total_denials=total_denials,
            total_tokens=total_tokens,
            avg_latency_ms=round(avg_latency, 2),
        ),
    )
