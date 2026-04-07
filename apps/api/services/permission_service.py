from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Optional

from sqlalchemy import select

from ..core.config import load_settings
from ..core.database import TeamAccessSnapshotModel, _session_factory
from ..core.redis_client import cache_delete, cache_get, cache_set, cache_incr
from ..models.domain import AuthUser, UserPermissions
from .snowflake_service import SnowflakeService

_settings = load_settings()

_GLOBAL_CONTROLS_TTL = 30  # seconds; keeps login snappy while staying fresh in dev


async def _get_version() -> int:
    current = await cache_get("perm:version")
    if isinstance(current, int):
        return current
    if isinstance(current, str) and current.isdigit():
        return int(current)
    return 1


def _role_match(allowed_roles: list[str], user_roles: list[str]) -> bool:
    allowed = [str(r).upper() for r in (allowed_roles or [])]
    if not allowed:
        return False
    if "ALL" in allowed or "*" in allowed or "ANY" in allowed:
        return True
    user_upper = [str(r).upper() for r in (user_roles or [])]
    return any(r in allowed for r in user_upper)


def _global_feature(model_id: str | None) -> bool:
    if model_id is None:
        return True
    return str(model_id).upper() in {"*", "GLOBAL", "ALL"}


async def _cached(key: str, ttl: int, fetch_coro):
    cached = await cache_get(key)
    if cached is not None:
        return cached
    value = await fetch_coro()
    await cache_set(key, value, ttl)
    return value


async def resolve_user_permissions(user: AuthUser) -> UserPermissions:
    version = await _get_version()
    cache_key = f"perm:{version}:{user.user_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return UserPermissions(
            user_id=cached["user_id"],
            allowed_models=cached.get("allowed_models", []),
            allowed_skills=cached.get("allowed_skills", []),
            enabled_features=cached.get("enabled_features", []),
        )

    snowflake = SnowflakeService(_settings)
    roles = [str(r).upper() for r in (user.roles or [])]

    # Snowflake reads are the main source of perceived "slow login".
    # Cache global tables briefly and fetch in parallel to keep UI responsive.
    model_controls_task = _cached(
        "sf:ac:model_controls",
        _GLOBAL_CONTROLS_TTL,
        snowflake.get_model_access_controls,
    )
    feature_flags_task = _cached(
        "sf:ac:feature_flags",
        _GLOBAL_CONTROLS_TTL,
        snowflake.get_feature_flags,
    )
    skill_controls_task = _cached(
        "sf:ac:skill_controls",
        _GLOBAL_CONTROLS_TTL,
        snowflake.get_skill_access_controls,
    )
    overrides_task = _cached(
        f"sf:ac:overrides:{user.user_id}",
        _settings.redis_perm_ttl,
        lambda: snowflake.get_user_overrides(user.username or user.user_id),
    )

    model_controls, feature_flags, skill_controls, overrides = await asyncio.gather(
        model_controls_task,
        feature_flags_task,
        skill_controls_task,
        overrides_task,
    )

    allowed_models: set[str] = set()
    allowed_skills: set[str] = set()
    enabled_features: set[str] = set()

    for row in model_controls:
        if not row.get("enabled"):
            continue
        if _role_match(row.get("allowed_roles", []), roles):
            if row.get("model_id"):
                allowed_models.add(str(row["model_id"]))

    for row in skill_controls:
        if not row.get("enabled"):
            continue
        if _role_match(row.get("allowed_roles", []), roles):
            if row.get("skill_id"):
                allowed_skills.add(str(row["skill_id"]))

    for row in feature_flags:
        if not row.get("enabled"):
            continue
        if not _global_feature(row.get("model_id")):
            continue
        if _role_match(row.get("enabled_for", []), roles):
            if row.get("feature_name"):
                enabled_features.add(str(row["feature_name"]))

    for override in overrides:
        resource_type = str(override.get("resource_type") or "").upper()
        resource_id = override.get("resource_id")
        if not resource_id:
            continue
        if resource_type == "MODEL":
            allowed_models.add(str(resource_id))
        elif resource_type == "SKILL":
            allowed_skills.add(str(resource_id))
        elif resource_type == "FEATURE":
            enabled_features.add(str(resource_id))

    # Team-level access overlays (local DB): apply model/skill grants to users
    # assigned to teams via /teams/{team_id}/access.
    if _session_factory is not None:
        async with _session_factory() as db:
            result = await db.execute(select(TeamAccessSnapshotModel))
            snapshots = result.scalars().all()
            user_keys = {str(user.user_id)}
            if user.username:
                user_keys.add(str(user.username))
                user_keys.add(str(user.username).lower())
            for snapshot in snapshots:
                snapshot_users = {str(value) for value in (snapshot.user_ids or [])}
                if any(key in snapshot_users for key in user_keys):
                    allowed_models.update(str(value) for value in (snapshot.model_ids or []) if str(value).strip())
                    allowed_skills.update(str(value) for value in (snapshot.skill_ids or []) if str(value).strip())

    perms = UserPermissions(
        user_id=user.user_id,
        allowed_models=sorted(allowed_models),
        allowed_skills=sorted(allowed_skills),
        enabled_features=sorted(enabled_features),
    )

    await cache_set(
        cache_key,
        {
            "user_id": perms.user_id,
            "allowed_models": perms.allowed_models,
            "allowed_skills": perms.allowed_skills,
            "enabled_features": perms.enabled_features,
        },
        _settings.redis_perm_ttl,
    )

    return perms


async def check_model_access(user: AuthUser, model_id: str) -> bool:
    perms = await resolve_user_permissions(user)
    return model_id in perms.allowed_models


async def check_skill_access(user: AuthUser, skill_id: str) -> bool:
    perms = await resolve_user_permissions(user)
    return skill_id in perms.allowed_skills


async def check_feature_access(user: AuthUser, feature_name: str) -> bool:
    perms = await resolve_user_permissions(user)
    return feature_name in perms.enabled_features


async def invalidate_user_permissions(user_id: str) -> None:
    version = await _get_version()
    await cache_delete(f"perm:{version}:{user_id}")


async def invalidate_all_permissions() -> None:
    await cache_incr("perm:version")
