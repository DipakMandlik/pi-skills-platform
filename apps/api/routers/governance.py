from __future__ import annotations

import time
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.model_adapter import get_adapter
from ..core.config import load_settings
from ..core.database import (
    AuditLogModel,
    FeatureFlagModel,
    GovernancePolicyModel,
    ModelAccessControlModel,
    RegisteredModelModel,
    SubscriptionPlanModel,
    UserModel,
    UserSubscriptionModel,
    get_session,
)
from ..schemas.api import (
    AdminOverviewResponse,
    FeatureFlagListResponse,
    FeatureFlagRequest,
    FeatureFlagResponse,
    GlobalTokenStatsResponse,
    GovernancePolicyEvaluationRequest,
    GovernancePolicyEvaluationResponse,
    GovernancePolicyListResponse,
    GovernancePolicyRequest,
    GovernancePolicyResponse,
    GovernanceRequest,
    GovernanceResponse,
    GovernanceValidateRequest,
    GovernanceValidateResponse,
    ModelAccessControlListResponse,
    ModelAccessControlRequest,
    ModelAccessControlResponse,
    ResetUserTokensRequest,
    ResetUserTokensResponse,
    SubscriptionPlanListResponse,
    SubscriptionPlanRequest,
    SubscriptionPlanResponse,
    SubscriptionPlanUpdateRequest,
    TokenUsageResponse,
    UsageLogListResponse,
    UserGovernanceDashboardResponse,
    UserSubscriptionAssignRequest,
    UserSubscriptionListItem,
    UserSubscriptionListResponse,
    UserSubscriptionResponse,
    UserTokenUsageEnvelope,
    AccessRequestCreate,
    AccessRequestApproveRequest,
    AccessRequestRejectRequest,
    AccessRequestResponse,
    AccessRequestListResponse,
)
from ..services.audit_service import AuditService
from ..services.permission_service import invalidate_all_permissions, resolve_user_permissions
from ..services.snowflake_service import SnowflakeService
from ..services.governance_service import (
    evaluate_policies,
    get_global_token_stats,
    get_subscription_for_user,
    get_token_usage_for_user,
    resolve_governance_allowed_models,
)
from ..models.domain import SNOWFLAKE_ADMIN_ROLES, normalize_authorization_roles

router = APIRouter(tags=["governance"])
POLICY_TYPES = ["token_limit", "model_access", "task_type", "rate_limit", "custom"]


def _require_admin(request: Request):
    user = request.state.user
    if not user.has_admin_access():
        raise HTTPException(
            status_code=403,
            detail={"status": 403, "title": "Access Denied", "detail": "Admin role required"},
        )
    return user


def _subscription_response(plan: SubscriptionPlanModel) -> SubscriptionPlanResponse:
    return SubscriptionPlanResponse(
        plan_name=plan.plan_name,
        display_name=plan.display_name,
        monthly_token_limit=int(plan.monthly_token_limit),
        max_tokens_per_request=int(plan.max_tokens_per_request),
        allowed_models=list(plan.allowed_models or []),
        features=list(plan.features or []),
        priority=plan.priority,
        rate_limit_per_minute=int(plan.rate_limit_per_minute),
        cost_budget_monthly=float(plan.cost_budget_monthly or 0.0),
    )


def _model_access_response(row) -> ModelAccessControlResponse:
    return ModelAccessControlResponse(
        model_id=row["model_id"] if isinstance(row, dict) else row.model_id,
        allowed_roles=list((row.get("allowed_roles") if isinstance(row, dict) else row.allowed_roles) or []),
        max_tokens_per_request=int((row.get("max_tokens_per_request") if isinstance(row, dict) else row.max_tokens_per_request) or 0),
        enabled=bool(row.get("enabled", True) if isinstance(row, dict) else row.enabled),
        rate_limit_per_minute=int((row.get("rate_limit_per_minute") if isinstance(row, dict) else row.rate_limit_per_minute) or 0),
    )


def _feature_flag_response(row) -> FeatureFlagResponse:
    return FeatureFlagResponse(
        feature_name=row["feature_name"] if isinstance(row, dict) else row.feature_name,
        model_id=row["model_id"] if isinstance(row, dict) else row.model_id,
        enabled=bool(row.get("enabled", True) if isinstance(row, dict) else row.enabled),
        enabled_for=list((row.get("enabled_for") if isinstance(row, dict) else row.enabled_for) or []),
        config=dict((row.get("config") if isinstance(row, dict) else row.config) or {}),
    )


def _normalize_model_access_roles(allowed_roles: list[str]) -> list[str]:
    normalized = normalize_authorization_roles(allowed_roles)
    if "ALL" in normalized:
        return ["ALL"]
    return normalized


def _policy_response(row: GovernancePolicyModel) -> GovernancePolicyResponse:
    return GovernancePolicyResponse(
        id=str(row.id),
        policy_name=row.policy_name,
        policy_type=row.policy_type,
        description=row.description or "",
        conditions=dict(row.conditions or {}),
        actions=dict(row.actions or {}),
        priority=row.priority,
        enabled=bool(row.enabled),
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


async def _governance_access_check(
    db: AsyncSession,
    request: Request,
    model_id: str | None,
    estimated_tokens: int,
) -> tuple[list[str], SubscriptionPlanModel | None, UserSubscriptionModel | None, str | None]:
    user = request.state.user
    assignment, subscription = await get_subscription_for_user(db, user.user_id)

    perms = await resolve_user_permissions(user)
    allowed_models = perms.allowed_models
    if not allowed_models:
        return allowed_models, subscription, assignment, "No models available for this user"

    chosen_model = model_id or allowed_models[0]
    if chosen_model not in allowed_models:
        return allowed_models, subscription, assignment, f"Model {chosen_model} is not allowed"

    snowflake = SnowflakeService(load_settings())
    access_controls = await snowflake.get_model_access_controls()
    access = next((row for row in access_controls if row.get("model_id") == chosen_model), None)
    if access is not None:
        if not access.get("enabled", True):
            return allowed_models, subscription, assignment, f"Model {chosen_model} is disabled"
        if estimated_tokens > int(access.get("max_tokens_per_request") or 0):
            return (
                allowed_models,
                subscription,
                assignment,
                f"Estimated tokens exceed per-request limit for {chosen_model}",
            )

    usage = await get_token_usage_for_user(
        db,
        user.user_id,
        "monthly",
        assignment.token_limit_override if assignment is not None else None,
        subscription,
    )
    if usage["remaining_tokens"] < estimated_tokens:
        return allowed_models, subscription, assignment, "User token budget exceeded"
    return allowed_models, subscription, assignment, None


@router.get("/admin/overview", response_model=AdminOverviewResponse)
async def admin_overview(request: Request, db: AsyncSession = Depends(get_session)):
    _require_admin(request)
    subscriptions_result = await db.execute(select(SubscriptionPlanModel))
    access_result = await db.execute(select(ModelAccessControlModel))
    subscriptions = [_subscription_response(row) for row in subscriptions_result.scalars().all()]
    configs = [_model_access_response(row) for row in access_result.scalars().all()]
    return AdminOverviewResponse(
        subscriptions=subscriptions,
        model_access_configs=configs,
        total_subscriptions=len(subscriptions),
        total_models_configured=len(configs),
    )


@router.get("/admin/subscriptions", response_model=SubscriptionPlanListResponse)
async def list_subscriptions(request: Request, db: AsyncSession = Depends(get_session)):
    _require_admin(request)
    result = await db.execute(select(SubscriptionPlanModel).order_by(SubscriptionPlanModel.plan_name))
    subscriptions = [_subscription_response(row) for row in result.scalars().all()]
    return SubscriptionPlanListResponse(subscriptions=subscriptions, total=len(subscriptions))


@router.post("/admin/subscriptions", response_model=SubscriptionPlanResponse)
async def create_subscription(
    body: SubscriptionPlanRequest, request: Request, db: AsyncSession = Depends(get_session)
):
    _require_admin(request)
    existing = await db.execute(
        select(SubscriptionPlanModel).where(SubscriptionPlanModel.plan_name == body.plan_name)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail={"status": 409, "title": "Conflict", "detail": "Subscription plan already exists"},
        )
    row = SubscriptionPlanModel(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _subscription_response(row)


@router.get("/admin/subscriptions/{plan_name}", response_model=SubscriptionPlanResponse)
async def get_subscription(plan_name: str, request: Request, db: AsyncSession = Depends(get_session)):
    _require_admin(request)
    result = await db.execute(
        select(SubscriptionPlanModel).where(SubscriptionPlanModel.plan_name == plan_name)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Subscription plan not found"},
        )
    return _subscription_response(row)


@router.put("/admin/subscriptions/{plan_name}", response_model=SubscriptionPlanResponse)
async def update_subscription(
    plan_name: str,
    body: SubscriptionPlanUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    result = await db.execute(
        select(SubscriptionPlanModel).where(SubscriptionPlanModel.plan_name == plan_name)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Subscription plan not found"},
        )
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return _subscription_response(row)


@router.delete("/admin/subscriptions/{plan_name}")
async def delete_subscription(
    plan_name: str, request: Request, db: AsyncSession = Depends(get_session)
):
    _require_admin(request)
    result = await db.execute(
        select(SubscriptionPlanModel).where(SubscriptionPlanModel.plan_name == plan_name)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Subscription plan not found"},
        )
    await db.delete(row)
    await db.commit()
    return {"deleted": True, "plan_name": plan_name}


@router.post("/admin/subscriptions/assign", response_model=UserSubscriptionResponse)
async def assign_subscription(
    body: UserSubscriptionAssignRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    user_result = await db.execute(select(UserModel).where(UserModel.id == body.user_id))
    if user_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "User not found"},
        )
    plan_result = await db.execute(
        select(SubscriptionPlanModel).where(SubscriptionPlanModel.plan_name == body.plan_name)
    )
    plan = plan_result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Subscription plan not found"},
        )
    existing_result = await db.execute(
        select(UserSubscriptionModel).where(UserSubscriptionModel.user_id == body.user_id)
    )
    existing = existing_result.scalar_one_or_none()
    if existing is None:
        existing = UserSubscriptionModel(
            id=str(uuid4()),
            user_id=body.user_id,
            plan_name=body.plan_name,
            assigned_by=admin.user_id,
        )
        db.add(existing)
    else:
        existing.plan_name = body.plan_name
        existing.assigned_by = admin.user_id
    await db.commit()
    await db.refresh(existing)
    return UserSubscriptionResponse(
        user_id=body.user_id,
        plan_name=body.plan_name,
        assigned_at=existing.assigned_at.isoformat() if existing.assigned_at else "",
        plan_details=_subscription_response(plan),
    )


@router.get("/admin/subscriptions/user/{user_id}", response_model=UserSubscriptionResponse)
async def get_user_subscription(user_id: str, request: Request, db: AsyncSession = Depends(get_session)):
    _require_admin(request)
    assignment, plan = await get_subscription_for_user(db, user_id)
    if assignment is None or plan is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "User subscription not found"},
        )
    return UserSubscriptionResponse(
        user_id=user_id,
        plan_name=assignment.plan_name,
        assigned_at=assignment.assigned_at.isoformat() if assignment.assigned_at else "",
        plan_details=_subscription_response(plan),
    )


@router.get("/admin/user-subscriptions", response_model=UserSubscriptionListResponse)
async def list_user_subscriptions(request: Request, db: AsyncSession = Depends(get_session)):
    _require_admin(request)
    result = await db.execute(select(UserSubscriptionModel).order_by(UserSubscriptionModel.assigned_at.desc()))
    rows = result.scalars().all()
    items = [
        UserSubscriptionListItem(
            user_id=row.user_id,
            plan_name=row.plan_name,
            assigned_at=row.assigned_at.isoformat() if row.assigned_at else "",
        )
        for row in rows
    ]
    return UserSubscriptionListResponse(user_subscriptions=items, total=len(items))


@router.post("/admin/model-access", response_model=ModelAccessControlResponse)
async def set_model_access(
    body: ModelAccessControlRequest, request: Request, db: AsyncSession = Depends(get_session)
):
    _require_admin(request)
    normalized_roles = _normalize_model_access_roles(body.allowed_roles)
    snowflake = SnowflakeService(load_settings())
    await snowflake.set_model_access_control(
        model_id=body.model_id,
        allowed_roles=normalized_roles,
        enabled=body.enabled,
        max_tokens_per_request=body.max_tokens_per_request,
        rate_limit_per_minute=body.rate_limit_per_minute,
    )
    await invalidate_all_permissions()
    return _model_access_response(
        {
            "model_id": body.model_id,
            "allowed_roles": normalized_roles,
            "max_tokens_per_request": body.max_tokens_per_request,
            "enabled": body.enabled,
            "rate_limit_per_minute": body.rate_limit_per_minute,
        }
    )


@router.get("/admin/model-access", response_model=ModelAccessControlListResponse)
async def list_model_access(request: Request, db: AsyncSession = Depends(get_session)):
    _require_admin(request)
    snowflake = SnowflakeService(load_settings())
    rows = await snowflake.get_model_access_controls()
    configs = [_model_access_response(row) for row in rows]
    return ModelAccessControlListResponse(configs=configs, total=len(configs))


@router.get("/admin/model-access/{model_id}", response_model=ModelAccessControlResponse)
async def get_model_access(model_id: str, request: Request, db: AsyncSession = Depends(get_session)):
    _require_admin(request)
    snowflake = SnowflakeService(load_settings())
    rows = await snowflake.get_model_access_controls()
    row = next((r for r in rows if r.get("model_id") == model_id), None)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Model access config not found"},
        )
    return _model_access_response(row)


@router.post("/admin/feature-flags", response_model=FeatureFlagResponse)
async def set_feature_flag(
    body: FeatureFlagRequest, request: Request, db: AsyncSession = Depends(get_session)
):
    _require_admin(request)
    normalized_enabled_for = _normalize_model_access_roles(body.enabled_for)
    snowflake = SnowflakeService(load_settings())
    await snowflake.set_feature_flag(
        feature_name=body.feature_name,
        model_id=body.model_id,
        enabled=body.enabled,
        enabled_for=normalized_enabled_for,
        config=body.config,
    )
    await invalidate_all_permissions()
    return _feature_flag_response(
        {
            "feature_name": body.feature_name,
            "model_id": body.model_id,
            "enabled": body.enabled,
            "enabled_for": normalized_enabled_for,
            "config": body.config,
        }
    )


@router.get("/admin/feature-flags", response_model=FeatureFlagListResponse)
async def list_feature_flags(
    request: Request,
    model_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    snowflake = SnowflakeService(load_settings())
    rows = await snowflake.get_feature_flags()
    if model_id:
        rows = [row for row in rows if row.get("model_id") == model_id]
    flags = [_feature_flag_response(row) for row in rows]
    return FeatureFlagListResponse(flags=flags, total=len(flags))


@router.delete("/admin/feature-flags/{feature_name}/{model_id}")
async def delete_feature_flag(
    feature_name: str,
    model_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    snowflake = SnowflakeService(load_settings())
    await snowflake.delete_feature_flag(feature_name, model_id)
    await invalidate_all_permissions()
    return {"deleted": True, "feature_name": feature_name, "model_id": model_id}


@router.get("/admin/policies/types")
async def list_policy_types(request: Request):
    _require_admin(request)
    return {"types": POLICY_TYPES, "total": len(POLICY_TYPES)}


@router.get("/admin/policies", response_model=GovernancePolicyListResponse)
async def list_policies(
    request: Request,
    policy_type: str | None = Query(default=None),
    enabled_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    query = select(GovernancePolicyModel).order_by(GovernancePolicyModel.created_at.desc())
    if policy_type:
        query = query.where(GovernancePolicyModel.policy_type == policy_type)
    if enabled_only:
        query = query.where(GovernancePolicyModel.enabled == True)
    result = await db.execute(query)
    rows = [_policy_response(row) for row in result.scalars().all()]
    return GovernancePolicyListResponse(policies=rows, total=len(rows))


@router.post("/admin/policies", response_model=GovernancePolicyResponse)
async def create_policy(
    body: GovernancePolicyRequest, request: Request, db: AsyncSession = Depends(get_session)
):
    _require_admin(request)
    if body.policy_type not in POLICY_TYPES:
        raise HTTPException(
            status_code=400,
            detail={"status": 400, "title": "Bad Request", "detail": "Unsupported policy type"},
        )
    existing = await db.execute(
        select(GovernancePolicyModel).where(GovernancePolicyModel.policy_name == body.policy_name)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail={"status": 409, "title": "Conflict", "detail": "Policy already exists"},
        )
    row = GovernancePolicyModel(id=str(uuid4()), **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _policy_response(row)


@router.delete("/admin/policies/{policy_name}")
async def delete_policy(policy_name: str, request: Request, db: AsyncSession = Depends(get_session)):
    _require_admin(request)
    result = await db.execute(
        select(GovernancePolicyModel).where(GovernancePolicyModel.policy_name == policy_name)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Policy not found"},
        )
    await db.delete(row)
    await db.commit()
    return {"deleted": True, "message": f"Policy {policy_name} deleted"}


@router.post("/admin/policies/evaluate", response_model=GovernancePolicyEvaluationResponse)
async def evaluate_policy_endpoint(
    body: GovernancePolicyEvaluationRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    result = await evaluate_policies(db, body.model_dump())
    return GovernancePolicyEvaluationResponse(**result)


@router.get("/admin/tokens/global-stats", response_model=GlobalTokenStatsResponse)
async def global_token_stats(
    request: Request,
    period: str = Query(default="7d"),
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    return GlobalTokenStatsResponse(**await get_global_token_stats(db, period))


@router.get("/admin/tokens/logs", response_model=UsageLogListResponse)
async def usage_logs(
    request: Request,
    user_id: str | None = Query(default=None),
    model_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    query = select(AuditLogModel).order_by(AuditLogModel.timestamp.desc()).offset(offset).limit(limit)
    count_query = select(func.count(AuditLogModel.id))
    if user_id:
        query = query.where(AuditLogModel.user_id == user_id)
        count_query = count_query.where(AuditLogModel.user_id == user_id)
    if model_id:
        query = query.where(AuditLogModel.model_id == model_id)
        count_query = count_query.where(AuditLogModel.model_id == model_id)
    result = await db.execute(query)
    count_result = await db.execute(count_query)
    rows = result.scalars().all()
    return UsageLogListResponse(
        logs=[
            {
                "id": str(row.id),
                "request_id": str(row.request_id),
                "user_id": str(row.user_id) if row.user_id else None,
                "skill_id": row.skill_id,
                "model_id": row.model_id,
                "action": row.action,
                "outcome": row.outcome,
                "tokens_used": row.tokens_used,
                "latency_ms": row.latency_ms,
                "timestamp": row.timestamp.isoformat() if row.timestamp else "",
            }
            for row in rows
        ],
        total=int(count_result.scalar() or 0),
        offset=offset,
        limit=limit,
    )


@router.post("/admin/tokens/reset", response_model=ResetUserTokensResponse)
async def reset_user_tokens(
    body: ResetUserTokensRequest, request: Request, db: AsyncSession = Depends(get_session)
):
    admin = _require_admin(request)
    assignment_result = await db.execute(
        select(UserSubscriptionModel).where(UserSubscriptionModel.user_id == body.user_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    if assignment is None:
        assignment = UserSubscriptionModel(
            id=str(uuid4()),
            user_id=body.user_id,
            plan_name="manual-reset",
            assigned_by=admin.user_id,
            token_limit_override=body.new_limit,
        )
        db.add(assignment)
    else:
        assignment.token_limit_override = body.new_limit
        assignment.assigned_by = admin.user_id
    await db.commit()
    return ResetUserTokensResponse(
        status="ok",
        user_id=body.user_id,
        period="monthly",
        new_limit=body.new_limit,
    )


@router.post("/ai/validate", response_model=GovernanceValidateResponse)
async def validate_governance_request(
    body: GovernanceValidateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    estimated_tokens = body.estimated_tokens or 0
    allowed_models, _, _, error = await _governance_access_check(
        db, request, body.model_id, estimated_tokens
    )
    if error:
        return GovernanceValidateResponse(valid=False, reason=error, message=error)
    model_id = body.model_id or (allowed_models[0] if allowed_models else None)
    policy_eval = await evaluate_policies(
        db,
        {
            "user_id": request.state.user.user_id,
            "user_role": request.state.user.primary_role or request.state.user.role,
            "model_id": model_id,
            "task_type": body.task_type or "general",
            "estimated_tokens": estimated_tokens,
        },
    )
    if not policy_eval["allowed"]:
        reason = policy_eval["violations"][0]["reason"]
        return GovernanceValidateResponse(valid=False, reason=reason, message=reason)
    return GovernanceValidateResponse(valid=True, message="Request is allowed")


@router.get("/ai/dashboard", response_model=UserGovernanceDashboardResponse)
async def get_governance_dashboard(request: Request, db: AsyncSession = Depends(get_session)):
    assignment, subscription = await get_subscription_for_user(db, request.state.user.user_id)
    usage = await get_token_usage_for_user(
        db,
        request.state.user.user_id,
        "monthly",
        assignment.token_limit_override if assignment is not None else None,
        subscription,
    )
    return UserGovernanceDashboardResponse(
        user_id=request.state.user.user_id,
        subscription=_subscription_response(subscription) if subscription is not None else None,
        token_usage=TokenUsageResponse(**{k: usage[k] for k in TokenUsageResponse.model_fields}),
        usage_stats={
            "user_id": request.state.user.user_id,
            "period": usage["period"],
            "model_breakdown": usage["model_breakdown"],
        },
    )


@router.get("/ai/tokens", response_model=UserTokenUsageEnvelope)
async def get_user_tokens(request: Request, db: AsyncSession = Depends(get_session)):
    assignment, subscription = await get_subscription_for_user(db, request.state.user.user_id)
    usage = await get_token_usage_for_user(
        db,
        request.state.user.user_id,
        "monthly",
        assignment.token_limit_override if assignment is not None else None,
        subscription,
    )
    return UserTokenUsageEnvelope(
        usage=TokenUsageResponse(**{k: usage[k] for k in TokenUsageResponse.model_fields}),
        stats={"model_breakdown": usage["model_breakdown"]},
    )


@router.post("/ai/request", response_model=GovernanceResponse)
async def ai_request(
    body: GovernanceRequest, request: Request, db: AsyncSession = Depends(get_session)
):
    allowed_models, _, _, error = await _governance_access_check(
        db, request, body.model_id, body.max_tokens
    )
    if error:
        raise HTTPException(
            status_code=403,
            detail={"status": 403, "title": "Access Denied", "detail": error},
        )
    chosen_model = body.model_id or allowed_models[0]
    policy_eval = await evaluate_policies(
        db,
        {
            "user_id": request.state.user.user_id,
            "user_role": request.state.user.primary_role or request.state.user.role,
            "model_id": chosen_model,
            "task_type": body.task_type or "general",
            "estimated_tokens": body.max_tokens,
        },
    )
    if not policy_eval["allowed"]:
        reason = policy_eval["violations"][0]["reason"]
        raise HTTPException(
            status_code=403,
            detail={"status": 403, "title": "Access Denied", "detail": reason},
        )

    from ..main import settings

    adapter = get_adapter(settings.model_adapter_type, settings)
    start = time.monotonic()
    result = await adapter.invoke(
        model_id=chosen_model,
        prompt=body.prompt,
        parameters=body.parameters or {},
        max_tokens=body.max_tokens,
    )
    latency_ms = int((time.monotonic() - start) * 1000)
    audit = AuditService()
    await audit.log(
        db=db,
        request_id=request.state.user.request_id,
        user_id=request.state.user.user_id,
        action="AI_REQUEST",
        outcome="SUCCESS",
        skill_id=body.skill_id,
        model_id=chosen_model,
        tokens_used=result.tokens_used,
        latency_ms=latency_ms,
        metadata={"task_type": body.task_type or "general"},
    )
    usage = await get_token_usage_for_user(db, request.state.user.user_id, "monthly")
    return GovernanceResponse(
        status="ok",
        request_id=request.state.user.request_id,
        result=result.content,
        model_id=chosen_model,
        tokens_used=result.tokens_used,
        cost=None,
        latency_ms=latency_ms,
        finish_reason=result.finish_reason,
        remaining_tokens=usage["remaining_tokens"],
        message="Request completed",
    )















# --- Access Requests ---


def _access_request_response(row: dict) -> AccessRequestResponse:
    return AccessRequestResponse(
        request_id=row.get("request_id", ""),
        requester=row.get("requester", ""),
        resource_type=row.get("resource_type", ""),
        resource_id=row.get("resource_id", ""),
        status=row.get("status", ""),
        requested_at=row.get("requested_at"),
        reviewed_at=row.get("reviewed_at"),
        reviewed_by=row.get("reviewed_by"),
        reason=row.get("reason"),
        metadata=row.get("metadata") or {},
    )


@router.post("/access-requests", response_model=AccessRequestResponse)
async def create_access_request(
    body: AccessRequestCreate, request: Request, db: AsyncSession = Depends(get_session)
):
    user = request.state.user
    snowflake = SnowflakeService(load_settings())
    request_id = str(uuid4())
    await snowflake.insert_access_request(
        request_id=request_id,
        requester=user.username or user.user_id,
        resource_type=body.resource_type.upper(),
        resource_id=body.resource_id,
        reason=body.reason or "",
        metadata=body.metadata,
    )
    return AccessRequestResponse(
        request_id=request_id,
        requester=user.username or user.user_id,
        resource_type=body.resource_type.upper(),
        resource_id=body.resource_id,
        status="PENDING",
        requested_at=datetime.now(timezone.utc).isoformat(),
        reviewed_at=None,
        reviewed_by=None,
        reason=body.reason,
        metadata=body.metadata or {},
    )


@router.get("/admin/access-requests", response_model=AccessRequestListResponse)
async def list_access_requests(
    request: Request,
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    snowflake = SnowflakeService(load_settings())
    rows = await snowflake.list_access_requests(status)
    return AccessRequestListResponse(
        requests=[_access_request_response(row) for row in rows],
        total=len(rows),
    )


@router.post("/admin/access-requests/{request_id}/approve", response_model=AccessRequestResponse)
async def approve_access_request(
    request_id: str,
    body: AccessRequestApproveRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    snowflake = SnowflakeService(load_settings())
    rows = await snowflake.list_access_requests(None)
    target = next((row for row in rows if row.get("request_id") == request_id), None)
    if not target:
        raise HTTPException(status_code=404, detail={"status": 404, "title": "Not Found", "detail": "Request not found"})

    override_id = str(uuid4())
    await snowflake.approve_request(
        request_id=request_id,
        reviewer=admin.username or admin.user_id,
        override_id=override_id,
        user_name=target.get("requester"),
        resource_type=target.get("resource_type"),
        resource_id=target.get("resource_id"),
        expires_at=body.expires_at,
    )
    await invalidate_all_permissions()
    target["status"] = "APPROVED"
    target["reviewed_by"] = admin.username or admin.user_id
    target["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    return _access_request_response(target)


@router.post("/admin/access-requests/{request_id}/reject", response_model=AccessRequestResponse)
async def reject_access_request(
    request_id: str,
    body: AccessRequestRejectRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    snowflake = SnowflakeService(load_settings())
    rows = await snowflake.list_access_requests(None)
    target = next((row for row in rows if row.get("request_id") == request_id), None)
    if not target:
        raise HTTPException(status_code=404, detail={"status": 404, "title": "Not Found", "detail": "Request not found"})

    await snowflake.reject_request(request_id, admin.username or admin.user_id, body.reason or "")
    target["status"] = "REJECTED"
    target["reviewed_by"] = admin.username or admin.user_id
    target["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    target["reason"] = body.reason
    return _access_request_response(target)
