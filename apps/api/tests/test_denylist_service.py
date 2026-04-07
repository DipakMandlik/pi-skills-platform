"""
DenylistService tests — behavior-driven, public interface only.

Interface under test:
    add(jti: str, ttl_seconds: int) -> None
    is_blocked(jti: str) -> bool

Redis is replaced with ClockFakeRedis so TTL expiry can be tested
without sleeping.
"""
from __future__ import annotations

import asyncio

import pytest

from apps.api.tests.conftest import ClockFakeRedis


def make_service(clock=None):
    from apps.api.services.denylist_service import DenylistService
    redis = ClockFakeRedis(time_fn=(lambda: clock[0]) if clock else None) if clock else ClockFakeRedis()
    return DenylistService(redis=redis), redis


# ===========================================================================
# Behavior 1: Added JTI is blocked immediately
# ===========================================================================

def test_added_jti_is_blocked_immediately() -> None:
    service, _ = make_service()

    asyncio.run(service.add("jti-aaa", ttl_seconds=900))

    assert asyncio.run(service.is_blocked("jti-aaa")) is True


# ===========================================================================
# Behavior 2: Non-added JTI is not blocked
# ===========================================================================

def test_unknown_jti_is_not_blocked() -> None:
    service, _ = make_service()

    assert asyncio.run(service.is_blocked("never-added")) is False


def test_different_jtis_are_independent() -> None:
    service, _ = make_service()

    asyncio.run(service.add("jti-blocked", ttl_seconds=900))

    assert asyncio.run(service.is_blocked("jti-blocked")) is True
    assert asyncio.run(service.is_blocked("jti-clean")) is False


# ===========================================================================
# Behavior 3: TTL expiry unblocks the JTI
# ===========================================================================

def test_jti_unblocked_after_ttl_expires() -> None:
    clock = [0.0]
    service, _ = make_service(clock=clock)

    asyncio.run(service.add("jti-expiring", ttl_seconds=60))
    assert asyncio.run(service.is_blocked("jti-expiring")) is True

    clock[0] = 61.0  # advance past TTL — no sleep needed

    assert asyncio.run(service.is_blocked("jti-expiring")) is False


# ===========================================================================
# Behavior 4: Re-adding a JTI updates its TTL
# ===========================================================================

def test_re_adding_jti_extends_block() -> None:
    clock = [0.0]
    service, _ = make_service(clock=clock)

    asyncio.run(service.add("jti-reused", ttl_seconds=60))
    clock[0] = 50.0  # almost expired — still blocked
    assert asyncio.run(service.is_blocked("jti-reused")) is True

    # Re-add with a fresh TTL from the current (advanced) clock position
    asyncio.run(service.add("jti-reused", ttl_seconds=60))
    clock[0] = 100.0  # original TTL would have expired, new one hasn't
    assert asyncio.run(service.is_blocked("jti-reused")) is True

    clock[0] = 120.0  # now past the new TTL too
    assert asyncio.run(service.is_blocked("jti-reused")) is False


# ===========================================================================
# Integration: TokenService.verify() respects DenylistService.is_blocked()
# ===========================================================================

def test_token_service_verify_raises_when_denylist_blocks_jti() -> None:
    """
    TokenService delegates revocation checks to DenylistService.
    When DenylistService.is_blocked() returns True, verify() raises TokenRevokedError.
    The two services share no Redis state — they are wired at construction time.
    """
    from apps.api.services.token_service import TokenService, TokenRevokedError
    from apps.api.services.denylist_service import DenylistService

    shared_redis = ClockFakeRedis()
    denylist = DenylistService(redis=shared_redis)
    token_svc = TokenService(
        secret="test-secret-32-chars-minimum-xxxx",
        redis=shared_redis,
        denylist=denylist,
    )

    pair = asyncio.run(token_svc.issue("user-1", ["viewer"]))
    claims = asyncio.run(token_svc.verify(pair.access_token))

    asyncio.run(denylist.add(claims.jti, ttl_seconds=900))

    with pytest.raises(TokenRevokedError):
        asyncio.run(token_svc.verify(pair.access_token))
