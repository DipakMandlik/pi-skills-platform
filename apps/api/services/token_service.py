"""
TokenService - issues, verifies, refreshes, and revokes JWT-based auth tokens.

Public interface:
    issue(user_id, roles, extra_claims)       ? TokenPair
    verify(access_token)                      ? TokenClaims
    refresh(refresh_token)                    ? TokenPair
    revoke(jti, ttl_seconds)                  ? None

Redis is injected; caller controls the connection. Tests inject FakeRedis.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol
from uuid import uuid4

import jwt


# ---------------------------------------------------------------------------
# Public data types
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str


@dataclass(frozen=True)
class TokenClaims:
    user_id: str
    roles: list[str]
    jti: str
    exp: int


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class TokenInvalidError(Exception):
    pass


class TokenExpiredError(Exception):
    pass


class TokenRevokedError(Exception):
    pass


# ---------------------------------------------------------------------------
# Redis protocol - any object satisfying this async interface is accepted
# ---------------------------------------------------------------------------

class RedisProtocol(Protocol):
    async def set(self, key: str, value: str, ex: int | None = None) -> None: ...
    async def get(self, key: str) -> str | None: ...
    async def delete(self, key: str) -> None: ...
    async def exists(self, key: str) -> int: ...


# ---------------------------------------------------------------------------
# TokenService
# ---------------------------------------------------------------------------

_DEFAULT_ACCESS_TTL = 15 * 60        # 15 minutes
_DEFAULT_REFRESH_TTL = 7 * 24 * 3600  # 7 days


class TokenService:
    def __init__(
        self,
        secret: str,
        redis: Any,
        algorithm: str = "HS256",
        access_ttl_seconds: int = _DEFAULT_ACCESS_TTL,
        refresh_ttl_seconds: int = _DEFAULT_REFRESH_TTL,
        denylist: Any = None,
    ) -> None:
        self._secret = secret
        self._redis = redis
        self._algorithm = algorithm
        self._access_ttl = access_ttl_seconds
        self._refresh_ttl = refresh_ttl_seconds
        self._denylist = denylist  # DenylistService; falls back to inline Redis check if None

    async def issue(self, user_id: str, roles: list[str], extra_claims: dict | None = None) -> TokenPair:
        now = datetime.now(timezone.utc)
        exp = now + timedelta(seconds=self._access_ttl)
        jti = str(uuid4())

        payload = {
            "sub": user_id,
            "roles": roles,
            "jti": jti,
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp()),
        }
        if extra_claims:
            payload.update(extra_claims)

        access_token = jwt.encode(
            payload,
            self._secret,
            algorithm=self._algorithm,
        )

        refresh_id = str(uuid4())
        session_data = {
            "user_id": user_id,
            "roles": roles,
            "extra_claims": extra_claims or {},
            "access_jti": jti,
            "access_exp": int(exp.timestamp()),
            "issued_at": int(now.timestamp()),
            "expires_at": int((now + timedelta(seconds=self._refresh_ttl)).timestamp()),
        }
        await self._redis.set(
            f"refresh:{refresh_id}",
            json.dumps(session_data),
            ex=self._refresh_ttl,
        )

        # Maintain user ? session index so SessionManager can enumerate sessions
        index_raw = await self._redis.get(f"sessions:{user_id}")
        index: list[str] = json.loads(index_raw) if index_raw else []
        index.append(refresh_id)
        await self._redis.set(f"sessions:{user_id}", json.dumps(index), ex=self._refresh_ttl)

        return TokenPair(access_token=access_token, refresh_token=refresh_id)

    async def verify(self, access_token: str) -> TokenClaims:
        try:
            payload = jwt.decode(
                access_token,
                self._secret,
                algorithms=[self._algorithm],
            )
        except jwt.ExpiredSignatureError as exc:
            raise TokenExpiredError("Token has expired") from exc
        except jwt.PyJWTError as exc:
            raise TokenInvalidError("Token is invalid") from exc

        jti = payload.get("jti", "")
        blocked = (
            await self._denylist.is_blocked(jti)
            if self._denylist is not None
            else bool(await self._redis.exists(f"deny:{jti}"))
        )
        if blocked:
            raise TokenRevokedError("Token has been revoked")

        return TokenClaims(
            user_id=payload["sub"],
            roles=payload.get("roles", []),
            jti=jti,
            exp=payload["exp"],
        )

    async def refresh(self, refresh_token: str) -> TokenPair:
        key = f"refresh:{refresh_token}"
        raw = await self._redis.get(key)
        if raw is None:
            raise TokenInvalidError("Refresh token is invalid or already used")

        data = json.loads(raw)
        await self._redis.delete(key)  # one-time use - delete before re-issuing
        return await self.issue(
            user_id=data["user_id"],
            roles=data.get("roles", []),
            extra_claims=data.get("extra_claims") or {},
        )

    async def revoke(self, jti: str, ttl_seconds: int) -> None:
        if self._denylist is not None:
            await self._denylist.add(jti, ttl_seconds)
        else:
            await self._redis.set(f"deny:{jti}", "1", ex=ttl_seconds)
