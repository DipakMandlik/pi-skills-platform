from __future__ import annotations

import json
import logging
import re
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.model_adapter import get_adapter
from ..core.config import Settings
from ..core.database import get_session
from ..models.domain import GuardDenied, ModelInvocationError
from ..schemas.api import ExecuteRequest, ExecuteResponse
from ..services.audit_service import AuditService
from ..services.execution_guard import ExecutionGuard
from ..services.snowflake_service import SnowflakeService

logger = logging.getLogger("api.execute_router")

router = APIRouter(prefix="/execute", tags=["execute"])
MODEL_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$")


def _get_settings() -> Settings:
    from ..main import settings

    return settings


@router.post("", response_model=ExecuteResponse)
async def execute_endpoint(
    body: ExecuteRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    user = request.state.user
    if not MODEL_ID_PATTERN.fullmatch(body.model_id):
        raise HTTPException(
            status_code=400,
            detail={
                "status": 400,
                "title": "Bad Request",
                "detail": "Invalid model_id format",
                "request_id": user.request_id,
            },
        )

    settings = _get_settings()
    adapter = get_adapter(settings.model_adapter_type, settings)
    audit = AuditService()
    snowflake_client = SnowflakeService(settings)
    guard = ExecutionGuard(settings, db, adapter, audit, snowflake_client)
    start = time.monotonic()

    try:
        result = await guard.execute(
            user=user,
            skill_id=body.skill_id,
            model_id=body.model_id,
            prompt=body.prompt,
            parameters=body.parameters,
            max_tokens=body.max_tokens,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        return ExecuteResponse(
            result=result.content,
            model_id=result.model_id,
            skill_id=body.skill_id,
            tokens_used=result.tokens_used,
            latency_ms=latency_ms,
            finish_reason=result.finish_reason,
            request_id=user.request_id,
        )
    except GuardDenied as e:
        raise HTTPException(
            status_code=403,
            detail={
                "status": 403,
                "title": "Access Denied",
                "detail": e.reason,
                "request_id": user.request_id,
            },
        )
    except ModelInvocationError:
        raise HTTPException(
            status_code=502,
            detail={
                "status": 502,
                "title": "Model Error",
                "detail": "Model invocation failed",
                "request_id": user.request_id,
            },
        )


@router.post("/stream")
async def execute_stream(
    body: ExecuteRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    user = request.state.user
    if not MODEL_ID_PATTERN.fullmatch(body.model_id):
        raise HTTPException(
            status_code=400,
            detail={
                "status": 400,
                "title": "Bad Request",
                "detail": "Invalid model_id format",
                "request_id": user.request_id,
            },
        )

    settings = _get_settings()
    adapter = get_adapter(settings.model_adapter_type, settings)
    audit = AuditService()
    snowflake_client = SnowflakeService(settings)
    guard = ExecutionGuard(settings, db, adapter, audit, snowflake_client)

    try:
        await guard.validate_all_gates(
            user=user,
            skill_id=body.skill_id,
            model_id=body.model_id,
        )
    except GuardDenied as e:
        raise HTTPException(
            status_code=403,
            detail={
                "status": 403,
                "title": "Access Denied",
                "detail": e.reason,
                "request_id": user.request_id,
            },
        )

    async def token_stream():
        start = time.monotonic()
        result = await adapter.invoke(
            model_id=body.model_id,
            prompt=body.prompt,
            parameters=body.parameters or {},
            max_tokens=body.max_tokens,
        )

        words = result.content.split()
        for word in words:
            yield f"data: {json.dumps({'token': word + ' '})}\n\n"

        latency_ms = int((time.monotonic() - start) * 1000)
        yield f"data: {json.dumps({'done': True, 'tokens': result.tokens_used, 'request_id': user.request_id})}\n\n"

        await audit.log(
            db=db,
            request_id=user.request_id,
            user_id=user.user_id,
            action="EXEC_SUCCESS",
            outcome="SUCCESS",
            skill_id=body.skill_id,
            model_id=body.model_id,
            tokens_used=result.tokens_used,
            latency_ms=latency_ms,
        )

    return StreamingResponse(token_stream(), media_type="text/event-stream")
