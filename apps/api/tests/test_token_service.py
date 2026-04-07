"""
TokenService tests — behavior-driven, public interface only.

Each test specifies one observable behavior. Tests do not assert on internal
structure (token format, Redis key shape, claim field names). They assert on
what the service promises to callers.

Redis is replaced with an in-process fake that satisfies the same async
contract. No real network calls are made.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

import jwt
import pytest

# ---------------------------------------------------------------------------
# Fake Redis — satisfies the async set/get/delete/exists contract
# ---------------------------------------------------------------------------

class FakeRedis:
    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, float]] = {}  # key → (value, expires_at)

    async def set(self, key: str, value: str, ex: Optional[int] = None) -> None:
        expires_at = time.monotonic() + ex if ex else float("inf")
        self._store[key] = (value, expires_at)

    async def get(self, key: str) -> Optional[str]:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def exists(self, key: str) -> int:
        entry = self._store.get(key)
        if entry is None:
            return 0
        _, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return 0
        return 1


SECRET = "test-secret-32-chars-minimum-xxxx"


def make_service() -> "TokenService":  # noqa: F821
    from apps.api.services.token_service import TokenService
    return TokenService(secret=SECRET, redis=FakeRedis())


# ===========================================================================
# Behavior 1: issue() returns tokens with correct user_id and roles in claims
# ===========================================================================

def test_issue_embeds_user_id_and_roles_in_access_token() -> None:
    from apps.api.services.token_service import TokenService, TokenClaims
    service = make_service()

    pair = asyncio.run(service.issue(user_id="user-123", roles=["admin", "viewer"]))
    claims: TokenClaims = asyncio.run(service.verify(pair.access_token))

    assert claims.user_id == "user-123"
    assert set(claims.roles) == {"admin", "viewer"}


# ===========================================================================
# Behavior 2: issue() stamps every access token with a unique JTI
# ===========================================================================

def test_issue_stamps_unique_jti_on_every_token() -> None:
    from apps.api.services.token_service import TokenService, TokenClaims
    service = make_service()

    jtis = {
        asyncio.run(service.issue("u", ["r"])).access_token
        for _ in range(10)
    }
    decoded = [
        asyncio.run(service.verify(tok))
        for tok in jtis
    ]
    jti_values = [c.jti for c in decoded]

    assert len(set(jti_values)) == 10, "Every issued token must have a distinct JTI"


# ===========================================================================
# Behavior 3: verify() accepts a valid unexpired token
# ===========================================================================

def test_verify_accepts_valid_token() -> None:
    from apps.api.services.token_service import TokenClaims
    service = make_service()

    pair = asyncio.run(service.issue(user_id="user-abc", roles=["viewer"]))
    claims = asyncio.run(service.verify(pair.access_token))

    assert isinstance(claims, TokenClaims)
    assert claims.user_id == "user-abc"
    assert claims.jti != ""
    assert claims.exp > int(time.time())


# ===========================================================================
# Behavior 4: verify() raises TokenExpiredError for an expired token
# ===========================================================================

def test_verify_raises_token_expired_error_for_expired_token() -> None:
    from apps.api.services.token_service import TokenExpiredError
    import jwt as pyjwt

    service = make_service()

    expired_token = pyjwt.encode(
        {"sub": "u", "roles": [], "jti": "j", "exp": 1},  # exp in the past
        SECRET,
        algorithm="HS256",
    )

    with pytest.raises(TokenExpiredError):
        asyncio.run(service.verify(expired_token))


# ===========================================================================
# Behavior 5: verify() raises TokenInvalidError for a tampered token
# ===========================================================================

def test_verify_raises_token_invalid_error_for_tampered_token() -> None:
    from apps.api.services.token_service import TokenInvalidError

    service = make_service()
    pair = asyncio.run(service.issue("u", ["r"]))

    # Replace the signature segment (last JWT part) with garbage to guarantee invalidity
    header, payload, _ = pair.access_token.rsplit(".", 2)
    tampered = f"{header}.{payload}.invalidsignatureXXXXXXXXXXXXXXXXXXXX"

    with pytest.raises(TokenInvalidError):
        asyncio.run(service.verify(tampered))


# ===========================================================================
# Behavior 6: refresh() returns new tokens and invalidates the old one
# ===========================================================================

def test_refresh_returns_new_token_pair() -> None:
    from apps.api.services.token_service import TokenInvalidError
    service = make_service()

    original = asyncio.run(service.issue(user_id="user-xyz", roles=["admin"]))
    refreshed = asyncio.run(service.refresh(original.refresh_token))

    # New access token carries same identity
    claims = asyncio.run(service.verify(refreshed.access_token))
    assert claims.user_id == "user-xyz"
    assert "admin" in claims.roles

    # New tokens are distinct from originals
    assert refreshed.access_token != original.access_token
    assert refreshed.refresh_token != original.refresh_token

    # Old refresh token is now dead
    with pytest.raises(TokenInvalidError):
        asyncio.run(service.refresh(original.refresh_token))


# ===========================================================================
# Behavior 7: refresh() rejects an already-used refresh token (no reuse)
# ===========================================================================

def test_refresh_token_cannot_be_used_twice() -> None:
    from apps.api.services.token_service import TokenInvalidError
    service = make_service()

    pair = asyncio.run(service.issue(user_id="u", roles=["r"]))
    asyncio.run(service.refresh(pair.refresh_token))  # first use — ok

    with pytest.raises(TokenInvalidError):
        asyncio.run(service.refresh(pair.refresh_token))  # second use — must fail


def test_refresh_rejects_fabricated_token() -> None:
    from apps.api.services.token_service import TokenInvalidError
    service = make_service()

    with pytest.raises(TokenInvalidError):
        asyncio.run(service.refresh("completely-made-up-token"))


# ===========================================================================
# Behavior 8: revoke() causes verify() to raise TokenRevokedError
# ===========================================================================

def test_revoked_token_is_rejected_by_verify() -> None:
    from apps.api.services.token_service import TokenRevokedError
    service = make_service()

    pair = asyncio.run(service.issue(user_id="u", roles=["r"]))
    claims = asyncio.run(service.verify(pair.access_token))  # valid before revocation

    remaining_ttl = claims.exp - int(time.time())
    asyncio.run(service.revoke(jti=claims.jti, ttl_seconds=remaining_ttl))

    with pytest.raises(TokenRevokedError):
        asyncio.run(service.verify(pair.access_token))


def test_revoking_one_token_does_not_affect_others() -> None:
    from apps.api.services.token_service import TokenRevokedError
    service = make_service()

    pair_a = asyncio.run(service.issue("u", ["r"]))
    pair_b = asyncio.run(service.issue("u", ["r"]))

    claims_a = asyncio.run(service.verify(pair_a.access_token))
    asyncio.run(service.revoke(claims_a.jti, ttl_seconds=900))

    with pytest.raises(TokenRevokedError):
        asyncio.run(service.verify(pair_a.access_token))

    # pair_b must still be valid
    claims_b = asyncio.run(service.verify(pair_b.access_token))
    assert claims_b.user_id == "u"
