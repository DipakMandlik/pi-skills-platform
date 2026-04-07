"""
SessionManager — admin service for enumerating and revoking user sessions.

Public interface:
    list_sessions(user_id: str)              -> list[SessionInfo]
    revoke_all(user_id: str, revoked_by: str) -> int

Sessions are created by TokenService and tracked via a Redis session index.
SessionManager reads that index, enumerates active sessions, and revokes them
by deleting refresh tokens and blocking access token JTIs via DenylistService.

Every call to revoke_all() writes a structured audit log entry before returning.
RBAC enforcement (admin-only) is handled at the route level, not here.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Protocol


# ---------------------------------------------------------------------------
# Public data types
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SessionInfo:
    session_id: str
    user_id: str
    issued_at: int
    expires_at: int


# ---------------------------------------------------------------------------
# Audit log protocol
# ---------------------------------------------------------------------------

class AuditLogProtocol(Protocol):
    async def log_session_revocation(
        self, actor_id: str, target_user_id: str, count: int
    ) -> None: ...


# ---------------------------------------------------------------------------
# SessionManager
# ---------------------------------------------------------------------------

class SessionManager:
    def __init__(self, redis: Any, denylist: Any, audit_log: Any) -> None:
        self._redis = redis
        self._denylist = denylist
        self._audit_log = audit_log

    async def list_sessions(self, user_id: str) -> list[SessionInfo]:
        index_raw = await self._redis.get(f"sessions:{user_id}")
        if not index_raw:
            return []

        session_ids: list[str] = json.loads(index_raw)
        sessions = []
        for sid in session_ids:
            raw = await self._redis.get(f"refresh:{sid}")
            if raw is None:
                continue  # expired or already revoked
            data = json.loads(raw)
            sessions.append(SessionInfo(
                session_id=sid,
                user_id=data["user_id"],
                issued_at=data["issued_at"],
                expires_at=data["expires_at"],
            ))
        return sessions

    async def revoke_all(self, user_id: str, revoked_by: str) -> int:
        index_raw = await self._redis.get(f"sessions:{user_id}")
        if not index_raw:
            await self._audit_log.log_session_revocation(
                actor_id=revoked_by, target_user_id=user_id, count=0
            )
            return 0

        session_ids: list[str] = json.loads(index_raw)
        revoked = 0
        now = int(time.time())

        for sid in session_ids:
            raw = await self._redis.get(f"refresh:{sid}")
            if raw is None:
                continue  # already expired or revoked

            data = json.loads(raw)
            access_jti = data.get("access_jti", "")
            access_exp = data.get("access_exp", 0)

            if access_jti and access_exp > now:
                ttl = access_exp - now
                await self._denylist.add(access_jti, ttl_seconds=ttl)

            await self._redis.delete(f"refresh:{sid}")
            revoked += 1

        await self._redis.delete(f"sessions:{user_id}")

        # Audit log written before returning — tamper-evident record
        await self._audit_log.log_session_revocation(
            actor_id=revoked_by, target_user_id=user_id, count=revoked
        )
        return revoked
