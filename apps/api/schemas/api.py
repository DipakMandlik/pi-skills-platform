from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


# ── Auth ────────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)


class SnowflakeLoginRequest(BaseModel):
    account: str = Field(
        min_length=1, description="Snowflake account identifier (e.g. myorg-myaccount)"
    )
    username: str = Field(min_length=1, description="Snowflake username")
    password: str = Field(min_length=1)
    role: str = Field(default="ACCOUNTADMIN", description="Snowflake role to authenticate with")


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 900  # 15 minutes
    role: str
    roles: list[str] = []
    primary_role: str = ""
    user_id: str
    display_name: str
    allowed_models: list[str] = []
    allowed_skills: list[str] = []
    enabled_features: list[str] = []


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    """Body is optional — access token is taken from the Authorization header."""

    pass


class UserMeResponse(BaseModel):
    user_id: str
    email: str
    role: str
    primary_role: str
    roles: list[str]
    display_name: str
    allowed_models: list[str]
    allowed_skills: list[str]
    enabled_features: list[str]
    token_expires_at: str


# ── Users ────────────────────────────────────────────────────────────


class UserListItem(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: str
    is_active: bool
    last_login_at: Optional[str] = None
    allowed_models: list[str]
    allowed_skills: list[str]


class UserListResponse(BaseModel):
    users: list[UserListItem]
    total: int
    page: int
    page_size: int


# ── Skills ──────────────────────────────────────────────────────────


class SkillAssignmentInfo(BaseModel):
    assigned_at: str
    expires_at: Optional[str] = None
    is_active: bool


class SkillResponse(BaseModel):
    skill_id: str
    display_name: str
    description: str
    required_models: list[str]
    is_active: bool
    version: Optional[str] = None
    skill_type: str = "ai"
    domain: str = "general"
    is_enabled: bool = True
    assignment: Optional[SkillAssignmentInfo] = None


class SkillsListResponse(BaseModel):
    skills: list[SkillResponse]


class SkillFullResponse(BaseModel):
    skill_id: str
    display_name: str
    description: str
    skill_type: str
    domain: str
    required_models: list[str]
    is_enabled: bool
    version: str
    input_schema: dict[str, Any]
    output_format: dict[str, Any]
    execution_handler: str
    error_handling: dict[str, Any]
    instructions: str
    assignment_count: int = 0


class SkillsPaginatedResponse(BaseModel):
    skills: list[SkillFullResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class SkillCreateRequest(BaseModel):
    skill_id: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    description: str = ""
    skill_type: str = "ai"
    domain: str = "general"
    instructions: str = ""
    required_models: list[str] = []
    input_schema: dict[str, Any] = {}
    output_format: dict[str, Any] = {}
    execution_handler: str = ""
    error_handling: dict[str, Any] = {}
    version: str = "1.0.0"
    is_enabled: bool = True


class SkillUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    required_models: Optional[list[str]] = None
    error_handling: Optional[dict[str, Any]] = None
    skill_type: Optional[str] = None
    domain: Optional[str] = None
    input_schema: Optional[dict[str, Any]] = None
    output_format: Optional[dict[str, Any]] = None
    execution_handler: Optional[str] = None
    is_enabled: Optional[bool] = None


class SkillStateUpdateRequest(BaseModel):
    is_enabled: bool


class SkillStateUpdateResponse(BaseModel):
    skill_id: str
    is_enabled: bool
    updated_at: str


class SkillDeleteResponse(BaseModel):
    deleted: bool
    skill_id: str
    message: str


class SkillAssignRequest(BaseModel):
    user_id: str
    skill_id: str = Field(min_length=1)
    expires_at: Optional[str] = None


class SkillAssignResponse(BaseModel):
    assignment_id: str
    user_id: str
    skill_id: str
    assigned_at: str
    expires_at: Optional[str] = None
    assigned_by: str


class SkillRevokeRequest(BaseModel):
    user_id: str
    skill_id: str = Field(min_length=1)


class SkillRevokeResponse(BaseModel):
    revoked: bool
    user_id: str
    skill_id: str
    revoked_at: str
    revoked_by: str


class SkillAccessResponse(BaseModel):
    skill_id: str
    user_ids: list[str]
    team_ids: list[str]


class SkillAccessUpdateRequest(BaseModel):
    user_ids: list[str] = []
    team_ids: list[str] = []


# ── Models ──────────────────────────────────────────────────────────


class ModelAccessInfo(BaseModel):
    granted_at: str
    expires_at: Optional[str] = None
    is_active: bool


class ModelListItem(BaseModel):
    model_id: str
    display_name: str
    provider: str
    tier: str
    is_available: bool
    access: Optional[ModelAccessInfo] = None
    assigned_users_count: Optional[int] = 0


class ModelsListResponse(BaseModel):
    models: list[ModelListItem]


class ModelAssignRequest(BaseModel):
    user_id: str
    model_id: str = Field(min_length=1)
    expires_at: Optional[str] = None
    notes: Optional[str] = None


class ModelAssignResponse(BaseModel):
    permission_id: str
    user_id: str
    model_id: str
    granted_at: str
    expires_at: Optional[str] = None
    granted_by: str


class ModelRevokeRequest(BaseModel):
    user_id: str
    model_id: str = Field(min_length=1)


class ModelRevokeResponse(BaseModel):
    revoked: bool
    effective_immediately: bool
    cache_invalidated: bool


# ── Model Configuration ─────────────────────────────────────────────


class ModelConfigurationCreateRequest(BaseModel):
    model_id: str = Field(min_length=1)
    provider: str = Field(min_length=1)
    base_url: str = Field(min_length=1)
    secret_reference_key: str = Field(min_length=1)
    temperature: float = 0.2
    max_tokens: int = 2048
    request_timeout_seconds: int = 30
    parameters: dict[str, Any] = {}
    is_active: bool = True


class ModelConfigurationUpdateRequest(BaseModel):
    base_url: Optional[str] = None
    secret_reference_key: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    request_timeout_seconds: Optional[int] = None
    parameters: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class ModelConfigurationResponse(BaseModel):
    id: str
    model_id: str
    provider: str
    base_url: str
    secret_reference_key: str
    temperature: float
    max_tokens: int
    request_timeout_seconds: int
    parameters: dict[str, Any]
    is_active: bool
    created_at: str
    updated_at: Optional[str] = None


class ModelConfigurationListResponse(BaseModel):
    configs: list[ModelConfigurationResponse]


class ModelConnectivityValidationRequest(BaseModel):
    provider: str = Field(min_length=1)
    base_url: str = Field(min_length=1)
    secret_reference_key: str = Field(min_length=1)


class ModelConnectivityValidationResponse(BaseModel):
    valid: bool
    provider: str
    base_url: str
    latency_ms: int
    message: str


# ── Secret References ───────────────────────────────────────────────


class SecretReferenceCreateRequest(BaseModel):
    reference_key: str = Field(min_length=1)
    provider: str = Field(min_length=1)
    secret_value: str = Field(min_length=1)


class SecretReferenceResponse(BaseModel):
    reference_key: str
    provider: str
    is_active: bool
    created_at: str


class SecretReferenceListResponse(BaseModel):
    references: list[SecretReferenceResponse]


# ── Execute ─────────────────────────────────────────────────────────


class ExecuteRequest(BaseModel):
    skill_id: str = Field(min_length=1)
    model_id: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    parameters: Optional[dict] = None
    max_tokens: int = Field(default=1000, ge=1, le=100000)


class ExecuteResponse(BaseModel):
    result: str
    model_id: str
    skill_id: str
    tokens_used: int
    latency_ms: int
    finish_reason: str
    request_id: str


# ── Monitoring ──────────────────────────────────────────────────────


class AuditLogEntry(BaseModel):
    id: str
    request_id: str
    user_id: Optional[str] = None
    skill_id: Optional[str] = None
    model_id: Optional[str] = None
    action: str
    outcome: str
    tokens_used: Optional[int] = None
    latency_ms: Optional[int] = None
    timestamp: str


class MonitoringSummary(BaseModel):
    total_executions: int
    total_denials: int
    total_tokens: int
    avg_latency_ms: float


class MonitoringResponse(BaseModel):
    logs: list[AuditLogEntry]
    total: int
    page: int
    page_size: int
    summary: MonitoringSummary


# ── Admin ───────────────────────────────────────────────────────────


class SessionInfoResponse(BaseModel):
    session_id: str
    user_id: str
    issued_at: int
    expires_at: int


class UserSessionsResponse(BaseModel):
    user_id: str
    sessions: list[SessionInfoResponse]
    count: int


class RevokeSessionsResponse(BaseModel):
    user_id: str
    revoked_by: str
    sessions_revoked: int


# ── User Management ─────────────────────────────────────────────────


class UserInviteRequest(BaseModel):
    email: EmailStr
    display_name: str = ""
    role: str = "user"


class UserInviteResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: str
    temp_password: str
    created_at: str


class UserRoleUpdateRequest(BaseModel):
    role: str = Field(min_length=1)


class UserRoleUpdateResponse(BaseModel):
    user_id: str
    role: str
    updated_at: str


class UserStatusUpdateRequest(BaseModel):
    is_active: bool


class UserStatusUpdateResponse(BaseModel):
    user_id: str
    is_active: bool
    updated_at: str


class UserAccessResponse(BaseModel):
    user_id: str
    skill_ids: list[str]
    model_ids: list[str]
    team_ids: list[str]


class UserAccessUpdateRequest(BaseModel):
    skill_ids: list[str] = []
    model_ids: list[str] = []
    team_ids: list[str] = []


# ── Teams ────────────────────────────────────────────────────────────


class TeamCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""


class TeamUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None


class TeamMemberAddRequest(BaseModel):
    user_id: str


class TeamMemberResponse(BaseModel):
    team_id: str
    user_id: str
    email: str
    display_name: str
    added_at: str


class TeamResponse(BaseModel):
    team_id: str
    name: str
    description: str
    member_count: int
    created_at: str


class TeamListResponse(BaseModel):
    teams: list[TeamResponse]
    total: int


class TeamDeleteResponse(BaseModel):
    deleted: bool
    team_id: str


class TeamAccessUpdateRequest(BaseModel):
    user_ids: list[str] = []
    skill_ids: list[str] = []
    model_ids: list[str] = []


class TeamAccessResponse(BaseModel):
    team_id: str
    user_ids: list[str]
    skill_ids: list[str]
    model_ids: list[str]


# ── Settings ─────────────────────────────────────────────────────────


class OrgSettingsResponse(BaseModel):
    org_name: str
    org_domain: str
    default_region: str
    notifications: dict[str, bool]
    appearance: dict[str, Any] = {}
    integrations: dict[str, Any] = {}


class OrgSettingsUpdateRequest(BaseModel):
    org_name: Optional[str] = None
    org_domain: Optional[str] = None
    default_region: Optional[str] = None
    notifications: Optional[dict[str, bool]] = None
    appearance: Optional[dict[str, Any]] = None
    integrations: Optional[dict[str, Any]] = None


# ── Error ───────────────────────────────────────────────────────────


class SubscriptionPlanRequest(BaseModel):
    plan_name: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    monthly_token_limit: int = Field(ge=1)
    max_tokens_per_request: int = Field(ge=1)
    allowed_models: list[str] = []
    features: list[str] = []
    priority: str = "standard"
    rate_limit_per_minute: int = Field(default=60, ge=1)
    cost_budget_monthly: float = Field(default=0.0, ge=0.0)


class SubscriptionPlanUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    monthly_token_limit: Optional[int] = Field(default=None, ge=1)
    max_tokens_per_request: Optional[int] = Field(default=None, ge=1)
    allowed_models: Optional[list[str]] = None
    features: Optional[list[str]] = None
    priority: Optional[str] = None
    rate_limit_per_minute: Optional[int] = Field(default=None, ge=1)
    cost_budget_monthly: Optional[float] = Field(default=None, ge=0.0)
    is_active: Optional[bool] = None


class SubscriptionPlanResponse(BaseModel):
    plan_name: str
    display_name: str
    monthly_token_limit: int
    max_tokens_per_request: int
    allowed_models: list[str]
    features: list[str]
    priority: str
    rate_limit_per_minute: int
    cost_budget_monthly: float


class SubscriptionPlanListResponse(BaseModel):
    subscriptions: list[SubscriptionPlanResponse]
    total: int


class UserSubscriptionAssignRequest(BaseModel):
    user_id: str
    plan_name: str = Field(min_length=1)


class UserSubscriptionResponse(BaseModel):
    user_id: str
    plan_name: str
    assigned_at: str
    plan_details: Optional[SubscriptionPlanResponse] = None


class UserSubscriptionListItem(BaseModel):
    user_id: str
    plan_name: str
    assigned_at: str


class UserSubscriptionListResponse(BaseModel):
    user_subscriptions: list[UserSubscriptionListItem]
    total: int


class ModelAccessControlRequest(BaseModel):
    model_id: str = Field(min_length=1)
    allowed_roles: list[str] = []
    max_tokens_per_request: int = Field(default=2048, ge=1)
    enabled: bool = True
    rate_limit_per_minute: int = Field(default=60, ge=1)


class ModelAccessControlResponse(BaseModel):
    model_id: str
    allowed_roles: list[str]
    max_tokens_per_request: int
    enabled: bool
    rate_limit_per_minute: int


class ModelAccessControlListResponse(BaseModel):
    configs: list[ModelAccessControlResponse]
    total: int


class FeatureFlagRequest(BaseModel):
    feature_name: str = Field(min_length=1)
    model_id: str = Field(min_length=1)
    enabled: bool = False
    enabled_for: list[str] = []
    config: dict[str, Any] = {}


class FeatureFlagResponse(BaseModel):
    feature_name: str
    model_id: str
    enabled: bool
    enabled_for: list[str]
    config: dict[str, Any]


class FeatureFlagListResponse(BaseModel):
    flags: list[FeatureFlagResponse]
    total: int


class AccessRequestCreate(BaseModel):
    resource_type: str = Field(min_length=1)
    resource_id: str = Field(min_length=1)
    reason: Optional[str] = None
    metadata: dict[str, Any] = {}


class AccessRequestApproveRequest(BaseModel):
    expires_at: Optional[str] = None


class AccessRequestRejectRequest(BaseModel):
    reason: Optional[str] = None


class AccessRequestResponse(BaseModel):
    request_id: str
    requester: str
    resource_type: str
    resource_id: str
    status: str
    requested_at: Optional[str] = None
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    reason: Optional[str] = None
    metadata: dict[str, Any] = {}


class AccessRequestListResponse(BaseModel):
    requests: list[AccessRequestResponse]
    total: int

class GovernancePolicyRequest(BaseModel):
    policy_name: str = Field(min_length=1)
    policy_type: str = Field(min_length=1)
    description: str = ""
    conditions: dict[str, Any] = {}
    actions: dict[str, Any] = {}
    priority: str = "standard"
    enabled: bool = True


class GovernancePolicyResponse(BaseModel):
    id: str
    policy_name: str
    policy_type: str
    description: str
    conditions: dict[str, Any]
    actions: dict[str, Any]
    priority: str
    enabled: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class GovernancePolicyListResponse(BaseModel):
    policies: list[GovernancePolicyResponse]
    total: int


class GovernancePolicyEvaluationRequest(BaseModel):
    user_id: str
    user_role: str = Field(min_length=1)
    model_id: str = Field(min_length=1)
    task_type: Optional[str] = None
    estimated_tokens: Optional[int] = Field(default=None, ge=0)
    context: Optional[dict[str, Any]] = None


class GovernancePolicyEvaluationResponse(BaseModel):
    allowed: bool
    violations: list[dict[str, Any]]
    warnings: list[dict[str, Any]]
    policies_evaluated: int


class AdminOverviewResponse(BaseModel):
    subscriptions: list[SubscriptionPlanResponse]
    model_access_configs: list[ModelAccessControlResponse]
    total_subscriptions: int
    total_models_configured: int


class GlobalTokenStatsResponse(BaseModel):
    period: str
    total_tokens: int
    total_cost: float
    total_requests: int
    unique_users: int
    model_breakdown: list[dict[str, Any]]


class UsageLogListResponse(BaseModel):
    logs: list[AuditLogEntry]
    total: int
    offset: int
    limit: int


class ResetUserTokensRequest(BaseModel):
    user_id: str
    new_limit: int = Field(ge=1)


class ResetUserTokensResponse(BaseModel):
    status: str
    user_id: str
    period: str
    new_limit: int


class GovernanceRequest(BaseModel):
    prompt: str = Field(min_length=1)
    model_id: Optional[str] = None
    task_type: Optional[str] = None
    skill_id: Optional[str] = None
    max_tokens: int = Field(default=1000, ge=1, le=100000)
    parameters: Optional[dict[str, Any]] = None


class GovernanceResponse(BaseModel):
    status: str
    request_id: str
    result: Optional[str] = None
    model_id: Optional[str] = None
    tokens_used: Optional[int] = None
    cost: Optional[float] = None
    latency_ms: int
    finish_reason: Optional[str] = None
    remaining_tokens: Optional[int] = None
    reason: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


class GovernanceValidateRequest(BaseModel):
    model_id: Optional[str] = None
    task_type: Optional[str] = None
    estimated_tokens: Optional[int] = Field(default=None, ge=0)


class GovernanceValidateResponse(BaseModel):
    valid: bool
    reason: Optional[str] = None
    message: Optional[str] = None


class TokenUsageResponse(BaseModel):
    user_id: str
    period: str
    tokens_used: int
    tokens_limit: int
    cost_accumulated: float
    remaining_tokens: int


class UserGovernanceDashboardResponse(BaseModel):
    user_id: str
    subscription: Optional[SubscriptionPlanResponse] = None
    token_usage: Optional[TokenUsageResponse] = None
    usage_stats: Optional[dict[str, Any]] = None


class UserTokenUsageEnvelope(BaseModel):
    usage: Optional[TokenUsageResponse] = None
    stats: Optional[dict[str, Any]] = None


class ErrorResponse(BaseModel):
    status: int
    title: str
    detail: str
    type: Optional[str] = None
    request_id: Optional[str] = None
    timestamp: Optional[str] = None

