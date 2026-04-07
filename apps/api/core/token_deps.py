"""
Token service singletons — initialized once at startup.

Usage:
    from apps.api.core.token_deps import get_token_service, get_denylist_service, get_session_manager
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..services.token_service import TokenService
    from ..services.denylist_service import DenylistService
    from ..services.session_manager import SessionManager

_token_service: "TokenService | None" = None
_denylist_service: "DenylistService | None" = None
_session_manager: "SessionManager | None" = None


def init_token_services(settings, redis) -> None:
    global _token_service, _denylist_service, _session_manager

    from ..services.audit_service import AuditService
    from ..services.denylist_service import DenylistService
    from ..services.session_manager import SessionManager
    from ..services.token_service import TokenService

    _denylist_service = DenylistService(redis)
    _token_service = TokenService(
        secret=settings.jwt_secret,
        redis=redis,
        algorithm=settings.jwt_algorithm,
        access_ttl_seconds=900,       # 15 minutes
        refresh_ttl_seconds=604800,   # 7 days
        denylist=_denylist_service,
    )
    _session_manager = SessionManager(
        redis=redis,
        denylist=_denylist_service,
        audit_log=AuditService(),
    )


def get_token_service() -> "TokenService":
    if _token_service is None:
        raise RuntimeError("Token services not initialised. Call init_token_services() first.")
    return _token_service


def get_denylist_service() -> "DenylistService":
    if _denylist_service is None:
        raise RuntimeError("Token services not initialised. Call init_token_services() first.")
    return _denylist_service


def get_session_manager() -> "SessionManager":
    if _session_manager is None:
        raise RuntimeError("Token services not initialised. Call init_token_services() first.")
    return _session_manager
