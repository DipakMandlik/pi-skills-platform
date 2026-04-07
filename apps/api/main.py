from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import sentry_sdk
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from apps.api.core.config import (
    Settings,
    load_settings,
    validate_jwt_secret,
    validate_production_settings,
)
from apps.api.core.database import create_tables, init_engine
from apps.api.core.redis_client import init_redis
from apps.api.core.token_deps import init_token_services
from apps.api.middleware.audit import AuditMiddleware
from apps.api.middleware.auth import JWTAuthMiddleware
from apps.api.middleware.request_id import RequestIDMiddleware
from apps.api.routers import auth, execute, governance, models, monitoring, settings as settings_router, skills, teams, users
from apps.api.routers import admin_sessions

settings = load_settings()

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[
            StarletteIntegration(transaction_style="url"),
            FastApiIntegration(transaction_style="url"),
        ],
        environment=settings.app_env,
        release=os.getenv("GIT_COMMIT_SHA", "dev"),
        traces_sample_rate=0.0,
        send_default_pii=False,
    )

logging.basicConfig(
    level=getattr(logging, settings.app_log_level.upper(), logging.INFO),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("api")


class SentryContextMiddleware(BaseHTTPMiddleware):
    """Attach user_id, route, and method to every Sentry event for this request."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        with sentry_sdk.new_scope() as scope:
            scope.set_tag("http.method", request.method)
            scope.set_tag("http.route", request.url.path)
            request_id = getattr(request.state, "request_id", None)
            if request_id:
                scope.set_tag("request_id", request_id)
            user = getattr(request.state, "user", None)
            if user is not None:
                scope.set_user({"id": user.user_id, "email": getattr(user, "email", None)})
            return await call_next(request)


async def _seed_data():
    from sqlalchemy import select
    from apps.api.core.database import (
        FeatureFlagModel,
        GovernancePolicyModel,
        ModelAccessControlModel,
        OrgSettingsModel,
        RegisteredModelModel,
        SubscriptionPlanModel,
        TeamModel,
        UserModel,
        SkillDefinitionModel,
        SkillStateModel,
        UserSubscriptionModel,
    )
    from apps.api.core.database import _session_factory
    from apps.api.services.skill_registry import get_default_registry_items

    if _session_factory is None:
        return

    async with _session_factory() as db:
        existing = await db.execute(select(RegisteredModelModel).limit(1))
        if existing.scalar_one_or_none() is None:
            model_defs = [
                RegisteredModelModel(
                    model_id="claude-3-5-sonnet-20241022",
                    display_name="Claude 3.5 Sonnet",
                    provider="anthropic",
                    tier="premium",
                    is_available=True,
                    max_tokens=8192,
                ),
                RegisteredModelModel(
                    model_id="claude-3-haiku-20240307",
                    display_name="Claude 3 Haiku",
                    provider="anthropic",
                    tier="standard",
                    is_available=True,
                    max_tokens=4096,
                ),
                RegisteredModelModel(
                    model_id="gemini-1.5-pro",
                    display_name="Gemini 1.5 Pro",
                    provider="google",
                    tier="premium",
                    is_available=True,
                    max_tokens=8192,
                ),
                RegisteredModelModel(
                    model_id="gpt-4o",
                    display_name="GPT-4o",
                    provider="openai",
                    tier="premium",
                    is_available=True,
                    max_tokens=4096,
                ),
            ]
            for m in model_defs:
                db.add(m)
            await db.commit()
            logger.info("Seeded registered models")

        existing_skills = await db.execute(select(SkillDefinitionModel).limit(1))
        if existing_skills.scalar_one_or_none() is None:
            from uuid import uuid4

            registry_items = get_default_registry_items()
            for skill in registry_items:
                defn = SkillDefinitionModel(
                    id=str(uuid4()),
                    skill_id=skill.skill_id,
                    version=skill.version,
                    display_name=skill.display_name,
                    description=skill.description,
                    skill_type=skill.skill_type,
                    domain=skill.domain,
                    instructions=skill.instructions,
                    required_models=skill.required_models,
                    input_schema=skill.input_schema,
                    output_format=skill.output_format,
                    execution_handler=skill.execution_handler,
                    error_handling=skill.error_handling,
                    created_by="00000000-0000-0000-0000-000000000000",
                    updated_by="00000000-0000-0000-0000-000000000000",
                )
                db.add(defn)
                state = SkillStateModel(
                    id=str(uuid4()),
                    skill_id=skill.skill_id,
                    version=skill.version,
                    is_enabled=skill.is_enabled,
                    skill_type=skill.skill_type,
                    domain=skill.domain,
                    updated_by="00000000-0000-0000-0000-000000000000",
                )
                db.add(state)
            await db.commit()
            logger.info("Seeded default skill definitions and states")

        existing_admin = await db.execute(
            select(UserModel).where(UserModel.email == "admin@platform.local")
        )
        if existing_admin.scalar_one_or_none() is None:
            import secrets
            from uuid import uuid4
            import bcrypt

            seed_accounts = [
                ("admin@platform.local", "Platform Admin", "admin"),
                ("user@platform.local", "Test User", "user"),
                ("viewer@platform.local", "Test Viewer", "viewer"),
            ]
            print("\n" + "=" * 60)
            print("BOOTSTRAP SEED — generated credentials (shown once only)")
            print("=" * 60)
            for email, display_name, role in seed_accounts:
                password = secrets.token_urlsafe(24)
                user = UserModel(
                    id=str(uuid4()),
                    external_id=email,
                    email=email,
                    display_name=display_name,
                    platform_role=role,
                    password_hash=bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode(
                        "utf-8"
                    ),
                )
                db.add(user)
                print(f"  {role:8s}  {email}  password={password}")
            print("=" * 60 + "\n")
            await db.commit()
            logger.info("Seeded default admin, user, and viewer accounts with randomized passwords")

        import bcrypt

        deterministic_passwords = {
            "admin@platform.local": "admin123",
            "user@platform.local": "user123",
            "viewer@platform.local": "viewer123",
        }
        seeded_users = (
            await db.execute(select(UserModel).where(UserModel.email.in_(tuple(deterministic_passwords.keys()))))
        ).scalars().all()
        for seeded_user in seeded_users:
            desired_password = deterministic_passwords.get(seeded_user.email)
            if desired_password:
                seeded_user.password_hash = bcrypt.hashpw(
                    desired_password.encode("utf-8"), bcrypt.gensalt()
                ).decode("utf-8")
        await db.commit()

        existing_settings = await db.execute(select(OrgSettingsModel).limit(1))
        if existing_settings.scalar_one_or_none() is None:
            db.add(
                OrgSettingsModel(
                    org_name="PI Skills Platform",
                    org_domain="platform.local",
                    default_region="us-east-1",
                    notifications={
                        "email_alerts": True,
                        "product_updates": True,
                        "weekly_digest": False,
                        "security_alerts": True,
                    },
                    appearance={"theme": "system", "language": "en-US"},
                    integrations={
                        "snowflake": {"connected": False},
                        "slack": {"connected": False},
                        "jira": {"connected": False},
                    },
                    updated_by="00000000-0000-0000-0000-000000000000",
                )
            )
            await db.commit()
            logger.info("Seeded default organization settings")

        existing_teams = await db.execute(select(TeamModel).limit(1))
        if existing_teams.scalar_one_or_none() is None:
            db.add_all(
                [
                    TeamModel(
                        name="Data Engineering",
                        description="Warehouse pipelines, transformation jobs, and data platform reliability.",
                        created_by="00000000-0000-0000-0000-000000000000",
                    ),
                    TeamModel(
                        name="Support",
                        description="Handles user support, incident triage, and operational escalations.",
                        created_by="00000000-0000-0000-0000-000000000000",
                    ),
                    TeamModel(
                        name="Analytics Engineering",
                        description="Builds operational analytics skills and curated reporting workflows.",
                        created_by="00000000-0000-0000-0000-000000000000",
                    ),
                    TeamModel(
                        name="Platform Engineering",
                        description="Core platform and reliability.",
                        created_by="00000000-0000-0000-0000-000000000000",
                    ),
                ]
            )
            await db.commit()
            logger.info("Seeded default teams")

        existing_subscription = await db.execute(select(SubscriptionPlanModel).limit(1))
        if existing_subscription.scalar_one_or_none() is None:
            db.add(
                SubscriptionPlanModel(
                    plan_name="enterprise-default",
                    display_name="Enterprise Default",
                    monthly_token_limit=250000,
                    max_tokens_per_request=4096,
                    allowed_models=[
                        "claude-3-haiku-20240307",
                        "claude-3-5-sonnet-20241022",
                        "gemini-1.5-pro",
                        "gpt-4o",
                    ],
                    features=["audit", "policy-enforcement", "monitoring", "workspace-execution"],
                    priority="standard",
                    rate_limit_per_minute=120,
                    cost_budget_monthly=499.0,
                )
            )
            await db.commit()
            logger.info("Seeded default subscription plan")

        existing_user_subscriptions = await db.execute(select(UserSubscriptionModel).limit(1))
        if existing_user_subscriptions.scalar_one_or_none() is None:
            admin_user = next((u for u in seeded_users if u.email == "admin@platform.local"), seeded_users[0] if seeded_users else None)
            admin_id = admin_user.id if admin_user else "00000000-0000-0000-0000-000000000000"
            for seeded_user in seeded_users:
                db.add(
                    UserSubscriptionModel(
                        user_id=seeded_user.id,
                        plan_name="enterprise-default",
                        assigned_by=admin_id,
                    )
                )
            await db.commit()
            logger.info("Seeded default user subscription assignments")

        existing_access = await db.execute(select(ModelAccessControlModel).limit(1))
        if existing_access.scalar_one_or_none() is None:
            db.add_all(
                [
                    ModelAccessControlModel(
                        model_id="claude-3-haiku-20240307",
                        allowed_roles=["all"],
                        max_tokens_per_request=4096,
                        enabled=True,
                        rate_limit_per_minute=120,
                    ),
                    ModelAccessControlModel(
                        model_id="claude-3-5-sonnet-20241022",
                        allowed_roles=["admin"],
                        max_tokens_per_request=4096,
                        enabled=True,
                        rate_limit_per_minute=60,
                    ),
                    ModelAccessControlModel(
                        model_id="gemini-1.5-pro",
                        allowed_roles=["all"],
                        max_tokens_per_request=4096,
                        enabled=True,
                        rate_limit_per_minute=90,
                    ),
                    ModelAccessControlModel(
                        model_id="gpt-4o",
                        allowed_roles=["admin"],
                        max_tokens_per_request=4096,
                        enabled=True,
                        rate_limit_per_minute=90,
                    ),
                ]
            )
            await db.commit()
            logger.info("Seeded default model access controls")

        existing_flags = await db.execute(select(FeatureFlagModel).limit(1))
        if existing_flags.scalar_one_or_none() is None:
            db.add_all(
                [
                    FeatureFlagModel(
                        feature_name="workspace_assistant",
                        model_id="claude-3-haiku-20240307",
                        enabled=True,
                        enabled_for=["all"],
                        config={"rollout": 100},
                    ),
                    FeatureFlagModel(
                        feature_name="advanced_reasoning",
                        model_id="claude-3-5-sonnet-20241022",
                        enabled=True,
                        enabled_for=["admin"],
                        config={"rollout": 100},
                    ),
                ]
            )
            await db.commit()
            logger.info("Seeded default feature flags")

        existing_policies = await db.execute(select(GovernancePolicyModel).limit(1))
        if existing_policies.scalar_one_or_none() is None:
            db.add_all(
                [
                    GovernancePolicyModel(
                        policy_name="default-token-guard",
                        policy_type="token_limit",
                        description="Warn or deny prompts that exceed the enterprise per-request token ceiling.",
                        conditions={"estimated_tokens": {"gt": 4096}},
                        actions={"deny": True, "reason": "Estimated token usage exceeds the allowed per-request limit."},
                        priority="high",
                        enabled=True,
                    ),
                    GovernancePolicyModel(
                        policy_name="admin-frontier-access",
                        policy_type="model_access",
                        description="Restrict frontier-only models to administrators.",
                        conditions={
                            "model_id": {"in": ["claude-3-5-sonnet-20241022", "gpt-4o"]},
                            "user_role": {"not_in": ["admin"]},
                        },
                        actions={"deny": True, "reason": "This model is reserved for administrators."},
                        priority="critical",
                        enabled=True,
                    ),
                ]
            )
            await db.commit()
            logger.info("Seeded default governance policies")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AI Governance Platform backend")
    validate_jwt_secret(settings.jwt_secret)
    validate_production_settings(settings)
    init_engine(settings)
    init_redis(settings.redis_url)
    from apps.api.core.redis_client import _redis, _use_redis

    _redis_client = _redis if _use_redis else None
    if _redis_client is None:
        logger.warning(
            "Redis unavailable — token denylist and refresh tokens will use in-memory fallback"
        )
        from apps.api.core.redis_client import _mem_cache as _fake_redis_store

        class _InMemRedis:
            """Minimal Redis shim backed by the existing in-memory cache."""

            async def set(self, key, value, ex=None):
                from apps.api.core.redis_client import _mem_set

                _mem_set(key, value, ex or 0)

            async def get(self, key):
                from apps.api.core.redis_client import _mem_get

                return _mem_get(key)

            async def delete(self, key):
                from apps.api.core.redis_client import _mem_delete

                _mem_delete(key)

            async def exists(self, key):
                from apps.api.core.redis_client import _mem_get

                return 1 if _mem_get(key) is not None else 0

            async def rpush(self, key, value):
                from apps.api.core.redis_client import _mem_get, _mem_set

                lst = _mem_get(key) or []
                lst.append(value)
                _mem_set(key, lst, 0)

            async def lrange(self, key, start, end):
                from apps.api.core.redis_client import _mem_get

                lst = _mem_get(key) or []
                return lst[start : None if end == -1 else end + 1]

        _redis_client = _InMemRedis()
    init_token_services(settings, _redis_client)
    if settings.app_env in {"development", "dev", "test", "testing"}:
        await create_tables()
        logger.info("Runtime table creation enabled for dev/test environment")
    else:
        logger.info(
            "Runtime table creation disabled outside dev/test; apply migrations before startup"
        )
    if settings.enable_bootstrap_seed:
        if settings.app_env not in {"development", "dev", "test", "testing"}:
            raise RuntimeError("ENABLE_BOOTSTRAP_SEED is not allowed outside dev/test environments")
        logger.warning(
            "Bootstrap seed is enabled; this should only be used in non-production environments."
        )
        await _seed_data()
    else:
        logger.info("Bootstrap seed disabled; no synthetic data will be inserted.")
    logger.info("Backend startup complete")
    yield
    logger.info("Shutting down backend")


app = FastAPI(
    title="AI Governance Platform",
    version="1.0.0",
    description="Policy enforcement engine for AI model access control",
    lifespan=lifespan,
)

app.add_middleware(SentryContextMiddleware)
app.add_middleware(AuditMiddleware)
app.add_middleware(JWTAuthMiddleware, settings=settings)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.apps_api_auth_routes_enabled:
    app.include_router(auth.router)
else:
    logger.warning(
        "apps/api deprecated auth router is disabled (APPS_API_AUTH_ROUTES_ENABLED=false)."
    )
app.include_router(skills.router)
app.include_router(models.router)
app.include_router(execute.router)
app.include_router(monitoring.router)
app.include_router(users.router)
app.include_router(admin_sessions.router)
app.include_router(teams.router)
app.include_router(settings_router.router)
app.include_router(governance.router)
app.include_router(governance.router, prefix="/governance")


@app.get("/health")
async def health():
    from sqlalchemy import text
    from apps.api.core.redis_client import get_redis, _use_redis
    from apps.api.core.database import _engine

    db_ok = False
    redis_ok = False

    try:
        if _engine:
            async with _engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
                db_ok = True
    except Exception:
        pass

    if _use_redis:
        try:
            r = get_redis()
            await r.ping()
            redis_ok = True
        except Exception:
            pass
    else:
        redis_ok = True  # In-memory mode is always "ok"

    return {
        "status": "ok" if (db_ok and redis_ok) else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "redis": "connected" if redis_ok else ("in-memory" if not _use_redis else "disconnected"),
    }


def run():
    uvicorn.run(
        "apps.api.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.debug,
        log_level=settings.app_log_level.lower(),
    )


if __name__ == "__main__":
    run()
