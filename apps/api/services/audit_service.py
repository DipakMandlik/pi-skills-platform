from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from ..services.snowflake_service import SnowflakeService
from ..core.config import load_settings

logger = logging.getLogger("backend.audit_service")

_settings = load_settings()


class AuditService:
    async def log(
        self,
        db: AsyncSession,
        request_id: str,
        user_id: Optional[str],
        action: str,
        outcome: str,
        skill_id: Optional[str] = None,
        model_id: Optional[str] = None,
        tokens_used: Optional[int] = None,
        latency_ms: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        error_detail: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> None:
        snowflake = SnowflakeService(_settings)
        details = {
            "outcome": outcome,
            "skill_id": skill_id,
            "model_id": model_id,
            "tokens_used": tokens_used,
            "latency_ms": latency_ms,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "error_detail": error_detail,
        }
        if metadata:
            details.update(metadata)
        await snowflake.write_audit_event(
            audit_id=str(uuid4()),
            user_id=user_id,
            action=action,
            resource_type="MODEL" if model_id else ("SKILL" if skill_id else "REQUEST"),
            resource_id=model_id or skill_id or request_id,
            details=details,
            performed_by=user_id,
        )

    async def log_success(self, db, ctx, tokens_used: int, latency_ms: int) -> None:
        await self.log(
            db=db,
            request_id=ctx.request_id,
            user_id=ctx.user_id,
            action="EXEC_SUCCESS",
            outcome="SUCCESS",
            skill_id=ctx.skill_id,
            model_id=ctx.model_id,
            tokens_used=tokens_used,
            latency_ms=latency_ms,
        )

    async def log_denied(self, db, ctx, reason: str, latency_ms: int) -> None:
        await self.log(
            db=db,
            request_id=ctx.request_id,
            user_id=ctx.user_id,
            action=reason,
            outcome="DENIED",
            skill_id=ctx.skill_id,
            model_id=ctx.model_id,
            latency_ms=latency_ms,
            error_detail=reason,
        )

    async def log_error(self, db, ctx, error: str, latency_ms: int) -> None:
        await self.log(
            db=db,
            request_id=ctx.request_id,
            user_id=ctx.user_id,
            action="EXEC_FAILED",
            outcome="ERROR",
            skill_id=ctx.skill_id,
            model_id=ctx.model_id,
            latency_ms=latency_ms,
            error_detail=error,
        )

    async def log_security_event(self, db, ctx, event_type: str) -> None:
        await self.log(
            db=db,
            request_id=ctx.request_id,
            user_id=ctx.user_id,
            action=event_type,
            outcome="DENIED",
            skill_id=ctx.skill_id,
            model_id=ctx.model_id,
        )

    async def log_session_revocation(
        self, actor_id: str, target_user_id: str, count: int
    ) -> None:
        logger.info(
            "session_revocation actor=%s target=%s count=%d",
            actor_id,
            target_user_id,
            count,
        )
