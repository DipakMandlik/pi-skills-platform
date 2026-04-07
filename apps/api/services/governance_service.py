from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import (
    AuditLogModel,
    FeatureFlagModel,
    GovernancePolicyModel,
    ModelAccessControlModel,
    ModelPermissionModel,
    RegisteredModelModel,
    SubscriptionPlanModel,
    UserModel,
    UserSubscriptionModel,
)
from ..models.domain import AuthUser


def _start_for_period(period: str) -> datetime:
    now = datetime.now(timezone.utc)
    if period == "24h":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "30d":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def get_subscription_for_user(
    db: AsyncSession, user_id: str
) -> tuple[UserSubscriptionModel | None, SubscriptionPlanModel | None]:
    assignment_result = await db.execute(
        select(UserSubscriptionModel).where(UserSubscriptionModel.user_id == user_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    if assignment is None:
        return None, None
    plan_result = await db.execute(
        select(SubscriptionPlanModel).where(SubscriptionPlanModel.plan_name == assignment.plan_name)
    )
    return assignment, plan_result.scalar_one_or_none()


async def resolve_governance_allowed_models(
    db: AsyncSession, user: AuthUser, subscription_plan: SubscriptionPlanModel | None
) -> list[str]:
    allowed = set()

    perm_result = await db.execute(
        select(ModelPermissionModel.model_id).where(
            ModelPermissionModel.user_id == user.user_id,
            ModelPermissionModel.is_active == True,
        )
    )
    allowed.update(row[0] for row in perm_result.all())

    if subscription_plan is not None:
        allowed.update(subscription_plan.allowed_models or [])

    access_result = await db.execute(select(ModelAccessControlModel))
    user_roles = [role.upper() for role in (user.roles or [user.role]) if role]
    for row in access_result.scalars().all():
        allowed_roles = [str(value).upper() for value in (row.allowed_roles or [])]
        if row.enabled and ("ALL" in allowed_roles or any(role in allowed_roles for role in user_roles)):
            allowed.add(row.model_id)

    if user.has_admin_access():
        models_result = await db.execute(
            select(RegisteredModelModel.model_id).where(RegisteredModelModel.is_available == True)
        )
        allowed.update(row[0] for row in models_result.all())

    return sorted(allowed)


async def get_token_usage_for_user(
    db: AsyncSession,
    user_id: str,
    period: str = "monthly",
    token_limit_override: int | None = None,
    subscription_plan: SubscriptionPlanModel | None = None,
) -> dict[str, Any]:
    start = _start_for_period(period)
    token_sum_query = select(func.coalesce(func.sum(AuditLogModel.tokens_used), 0)).where(
        AuditLogModel.user_id == user_id,
        AuditLogModel.timestamp >= start,
    )
    token_sum_result = await db.execute(token_sum_query)
    tokens_used = int(token_sum_result.scalar() or 0)

    request_count_query = select(func.count(AuditLogModel.id)).where(
        AuditLogModel.user_id == user_id,
        AuditLogModel.timestamp >= start,
    )
    request_count_result = await db.execute(request_count_query)
    request_count = int(request_count_result.scalar() or 0)

    breakdown_query = select(
        AuditLogModel.model_id,
        func.coalesce(func.sum(AuditLogModel.tokens_used), 0),
        func.count(AuditLogModel.id),
    ).where(
        AuditLogModel.user_id == user_id,
        AuditLogModel.timestamp >= start,
    ).group_by(AuditLogModel.model_id)
    breakdown_result = await db.execute(breakdown_query)

    cost_lookup_result = await db.execute(select(RegisteredModelModel))
    cost_lookup = {
        row.model_id: float(row.cost_per_1k_tokens or 0.0) for row in cost_lookup_result.scalars().all()
    }

    model_breakdown: list[dict[str, Any]] = []
    total_cost = 0.0
    for model_id, token_sum, count in breakdown_result.all():
        token_sum = int(token_sum or 0)
        model_cost = round((token_sum / 1000.0) * cost_lookup.get(model_id, 0.0), 4)
        total_cost += model_cost
        model_breakdown.append(
            {
                "model_id": model_id or "unknown",
                "total_tokens": token_sum,
                "total_cost": model_cost,
                "request_count": int(count or 0),
            }
        )

    token_limit = token_limit_override or (
        int(subscription_plan.monthly_token_limit) if subscription_plan is not None else 100000
    )
    return {
        "user_id": user_id,
        "period": period,
        "tokens_used": tokens_used,
        "tokens_limit": token_limit,
        "cost_accumulated": round(total_cost, 4),
        "remaining_tokens": max(token_limit - tokens_used, 0),
        "request_count": request_count,
        "model_breakdown": model_breakdown,
    }


async def get_global_token_stats(db: AsyncSession, period: str = "7d") -> dict[str, Any]:
    start = _start_for_period("monthly" if period not in {"24h", "30d"} else period)
    total_query = select(
        func.coalesce(func.sum(AuditLogModel.tokens_used), 0),
        func.count(AuditLogModel.id),
        func.count(func.distinct(AuditLogModel.user_id)),
    ).where(AuditLogModel.timestamp >= start)
    total_result = await db.execute(total_query)
    total_tokens, total_requests, unique_users = total_result.one()

    models_query = select(
        AuditLogModel.model_id,
        func.coalesce(func.sum(AuditLogModel.tokens_used), 0),
        func.count(AuditLogModel.id),
    ).where(
        AuditLogModel.timestamp >= start
    ).group_by(AuditLogModel.model_id)
    models_result = await db.execute(models_query)

    registered_models_result = await db.execute(select(RegisteredModelModel))
    cost_lookup = {
        row.model_id: float(row.cost_per_1k_tokens or 0.0) for row in registered_models_result.scalars().all()
    }

    model_breakdown = []
    total_cost = 0.0
    for model_id, token_sum, request_count in models_result.all():
        token_sum = int(token_sum or 0)
        total_model_cost = round((token_sum / 1000.0) * cost_lookup.get(model_id, 0.0), 4)
        total_cost += total_model_cost
        model_breakdown.append(
            {
                "model_id": model_id or "unknown",
                "total_tokens": token_sum,
                "total_cost": total_model_cost,
                "request_count": int(request_count or 0),
            }
        )

    return {
        "period": period,
        "total_tokens": int(total_tokens or 0),
        "total_cost": round(total_cost, 4),
        "total_requests": int(total_requests or 0),
        "unique_users": int(unique_users or 0),
        "model_breakdown": model_breakdown,
    }


def evaluate_policy_conditions(
    policy_conditions: dict[str, Any],
    payload: dict[str, Any],
) -> bool:
    if not policy_conditions:
        return True
    for key, expected in policy_conditions.items():
        actual = payload.get(key)
        if isinstance(expected, dict):
            if "gt" in expected and not (actual is not None and actual > expected["gt"]):
                return False
            if "gte" in expected and not (actual is not None and actual >= expected["gte"]):
                return False
            if "lt" in expected and not (actual is not None and actual < expected["lt"]):
                return False
            if "lte" in expected and not (actual is not None and actual <= expected["lte"]):
                return False
            if "eq" in expected and actual != expected["eq"]:
                return False
            if "in" in expected and actual not in expected["in"]:
                return False
        elif actual != expected:
            return False
    return True


async def evaluate_policies(
    db: AsyncSession,
    payload: dict[str, Any],
) -> dict[str, Any]:
    result = await db.execute(
        select(GovernancePolicyModel).where(GovernancePolicyModel.enabled == True)
    )
    policies = result.scalars().all()
    violations: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    for policy in policies:
        if not evaluate_policy_conditions(policy.conditions or {}, payload):
            continue
        target = violations if bool((policy.actions or {}).get("deny")) else warnings
        target.append(
            {
                "policy_name": policy.policy_name,
                "policy_type": policy.policy_type,
                "reason": (policy.actions or {}).get("reason") or policy.description,
            }
        )

    return {
        "allowed": len(violations) == 0,
        "violations": violations,
        "warnings": warnings,
        "policies_evaluated": len(policies),
    }
