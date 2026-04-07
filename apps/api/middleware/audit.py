from __future__ import annotations

import json
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from ..core.database import AuditLogModel
from ..core.redis_client import get_redis

logger = logging.getLogger("backend.audit_middleware")

SKIP_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in SKIP_PATHS:
            return await call_next(request)

        start = time.monotonic()
        request_id = getattr(request.state, "request_id", "unknown")
        user = getattr(request.state, "user", None)

        try:
            response = await call_next(request)
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error(
                "request_error request_id=%s path=%s latency_ms=%d error=%s",
                request_id,
                request.url.path,
                latency_ms,
                str(exc),
            )
            raise

        latency_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "request_complete request_id=%s path=%s status=%d latency_ms=%d user=%s",
            request_id,
            request.url.path,
            response.status_code,
            latency_ms,
            user.user_id if user else "anonymous",
        )

        return response
