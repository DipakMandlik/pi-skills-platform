"""
SessionManager tests — behavior-driven, public interface only.

Interface under test:
    list_sessions(user_id: str) -> list[SessionInfo]
    revoke_all(user_id: str, revoked_by: str) -> int

Sessions are created through TokenService (shared Redis). SessionManager
reads and revokes them. Both services are wired to the same ClockFakeRedis.

Audit entries are captured by FakeAuditLog — no DB required.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

import pytest

from apps.api.tests.conftest import ClockFakeRedis

SECRET = "test-secret-32-chars-minimum-xxxx"


# ---------------------------------------------------------------------------
# Fake audit log — records every call made by SessionManager
# ---------------------------------------------------------------------------

class FakeAuditLog:
    def __init__(self) -> None:
        self.entries: list[dict] = []

    async def log_session_revocation(
        self, actor_id: str, target_user_id: str, count: int
    ) -> None:
        self.entries.append({
            "actor_id": actor_id,
            "target_user_id": target_user_id,
            "count": count,
            "timestamp": int(time.time()),
        })


# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------

def make_services(clock=None):
    from apps.api.services.token_service import TokenService
    from apps.api.services.denylist_service import DenylistService
    from apps.api.services.session_manager import SessionManager

    redis = ClockFakeRedis(time_fn=(lambda: clock[0]) if clock else None) if clock else ClockFakeRedis()
    audit = FakeAuditLog()
    denylist = DenylistService(redis=redis)
    token_svc = TokenService(
        secret=SECRET,
        redis=redis,
        denylist=denylist,
    )
    session_mgr = SessionManager(redis=redis, denylist=denylist, audit_log=audit)
    return token_svc, session_mgr, denylist, audit, redis


# ===========================================================================
# Behavior 1: list_sessions() returns metadata for an active session
# ===========================================================================

def test_list_sessions_returns_active_session() -> None:
    token_svc, session_mgr, *_ = make_services()

    asyncio.run(token_svc.issue(user_id="user-1", roles=["viewer"]))
    sessions = asyncio.run(session_mgr.list_sessions("user-1"))

    assert len(sessions) == 1
    s = sessions[0]
    assert s.user_id == "user-1"
    assert s.session_id != ""
    assert s.issued_at > 0
    assert s.expires_at > s.issued_at


# ===========================================================================
# Behavior 2: list_sessions() returns empty list when no sessions exist
# ===========================================================================

def test_list_sessions_empty_for_unknown_user() -> None:
    _, session_mgr, *_ = make_services()

    sessions = asyncio.run(session_mgr.list_sessions("nobody"))

    assert sessions == []


def test_list_sessions_shows_all_active_sessions() -> None:
    token_svc, session_mgr, *_ = make_services()

    asyncio.run(token_svc.issue("user-multi", ["viewer"]))
    asyncio.run(token_svc.issue("user-multi", ["viewer"]))
    asyncio.run(token_svc.issue("user-multi", ["viewer"]))

    sessions = asyncio.run(session_mgr.list_sessions("user-multi"))

    assert len(sessions) == 3
    assert all(s.user_id == "user-multi" for s in sessions)


# ===========================================================================
# Behavior 3: revoke_all() returns count of revoked sessions
# ===========================================================================

def test_revoke_all_returns_count_of_revoked_sessions() -> None:
    token_svc, session_mgr, *_ = make_services()

    asyncio.run(token_svc.issue("user-2", ["admin"]))
    asyncio.run(token_svc.issue("user-2", ["admin"]))

    count = asyncio.run(session_mgr.revoke_all("user-2", revoked_by="admin-1"))

    assert count == 2


def test_revoke_all_returns_zero_for_user_with_no_sessions() -> None:
    _, session_mgr, *_ = make_services()

    count = asyncio.run(session_mgr.revoke_all("ghost-user", revoked_by="admin-1"))

    assert count == 0


# ===========================================================================
# Behavior 4: After revoke_all(), list_sessions() returns empty
# ===========================================================================

def test_list_sessions_empty_after_revoke_all() -> None:
    token_svc, session_mgr, *_ = make_services()

    asyncio.run(token_svc.issue("user-3", ["viewer"]))
    asyncio.run(token_svc.issue("user-3", ["viewer"]))

    asyncio.run(session_mgr.revoke_all("user-3", revoked_by="admin-1"))

    sessions = asyncio.run(session_mgr.list_sessions("user-3"))
    assert sessions == []


# ===========================================================================
# Behavior 5: After revoke_all(), access tokens are blocked via denylist
# ===========================================================================

def test_access_tokens_blocked_after_revoke_all() -> None:
    from apps.api.services.token_service import TokenRevokedError

    token_svc, session_mgr, denylist, _, _ = make_services()

    pair_a = asyncio.run(token_svc.issue("user-4", ["viewer"]))
    pair_b = asyncio.run(token_svc.issue("user-4", ["viewer"]))

    # Both tokens valid before revocation
    asyncio.run(token_svc.verify(pair_a.access_token))
    asyncio.run(token_svc.verify(pair_b.access_token))

    asyncio.run(session_mgr.revoke_all("user-4", revoked_by="admin-1"))

    with pytest.raises(TokenRevokedError):
        asyncio.run(token_svc.verify(pair_a.access_token))

    with pytest.raises(TokenRevokedError):
        asyncio.run(token_svc.verify(pair_b.access_token))


def test_revoke_all_does_not_affect_other_users() -> None:
    from apps.api.services.token_service import TokenRevokedError

    token_svc, session_mgr, *_ = make_services()

    pair_target = asyncio.run(token_svc.issue("target-user", ["viewer"]))
    pair_other  = asyncio.run(token_svc.issue("other-user",  ["viewer"]))

    asyncio.run(session_mgr.revoke_all("target-user", revoked_by="admin-1"))

    with pytest.raises(TokenRevokedError):
        asyncio.run(token_svc.verify(pair_target.access_token))

    # other-user's token must still be valid
    claims = asyncio.run(token_svc.verify(pair_other.access_token))
    assert claims.user_id == "other-user"


# ===========================================================================
# Behavior 6: revoke_all() writes an audit log entry with correct fields
# ===========================================================================

def test_revoke_all_writes_audit_log_entry() -> None:
    token_svc, session_mgr, _, audit, _ = make_services()

    asyncio.run(token_svc.issue("user-5", ["viewer"]))
    asyncio.run(token_svc.issue("user-5", ["viewer"]))

    asyncio.run(session_mgr.revoke_all("user-5", revoked_by="admin-99"))

    assert len(audit.entries) == 1
    entry = audit.entries[0]
    assert entry["actor_id"] == "admin-99"
    assert entry["target_user_id"] == "user-5"
    assert entry["count"] == 2
    assert entry["timestamp"] > 0


def test_revoke_all_writes_audit_log_even_with_zero_sessions() -> None:
    _, session_mgr, _, audit, _ = make_services()

    asyncio.run(session_mgr.revoke_all("nobody", revoked_by="admin-1"))

    assert len(audit.entries) == 1
    assert audit.entries[0]["count"] == 0
