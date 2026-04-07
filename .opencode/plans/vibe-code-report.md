# VIBE CODE INTELLIGENCE REPORT
**Project:** π-Optimized (AI Governance Platform) | **Analyzed:** 2026-04-04

---

## 1. PLATFORM SUMMARY

π-Optimized is an **AI Governance & Snowflake MCP Bridge Platform** — a full-stack application that provides role-based access control (RBAC), token/cost governance, and AI model management layered on top of Snowflake data warehouse. Users authenticate with Snowflake credentials, get assigned platform roles (8-tier hierarchy), and interact with AI models through a three-panel workspace (skills, chat, SQL editor). The platform enforces execution guards (model access, skill access, rate limiting, prompt injection detection), tracks token usage and costs, and provides admin dashboards for subscription management, model access control, feature flags, and audit monitoring.

**Core Users:** Data engineers, analytics engineers, data scientists, business analysts, security admins, and system agents — all accessing Snowflake through a governed, audited AI interface.

**Core Workflow:** User logs in with Snowflake credentials → JWT issued with platform role → accesses workspace → selects AI skills → writes natural language prompts → platform routes through guard chain → executes against Snowflake via MCP bridge → returns results with audit logging.

---

## 2. TECH STACK

| Layer | Technology | Status |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 | ✅ Active |
| **State Mgmt** | Zustand (single store, 40+ actions, localStorage persistence) | ✅ Active |
| **Routing** | React Router DOM v7 | ✅ Active |
| **UI Library** | Lucide React, Motion (Framer Motion), Recharts, clsx | ✅ Active |
| **Backend (Primary)** | FastAPI (Python 3.12) + Uvicorn | ✅ Active |
| **Backend (MCP)** | FastAPI + Uvicorn (separate server) | ✅ Active |
| **Primary DB** | SQLAlchemy async (SQLite dev, PostgreSQL prod) | 🔶 Partial |
| **Cache** | Redis (with in-memory dict fallback) | 🔶 Partial |
| **Auth** | PyJWT (HS256) + bcrypt + RBAC middleware | ✅ Active |
| **External: Snowflake** | snowflake-connector-python (OCSP bypass) | ✅ Active |
| **External: AI Models** | LiteLLM, Anthropic, Google Gemini adapters | 🔶 Partial |
| **SQL Safety** | sqlglot AST parsing | ✅ Active |
| **Infrastructure** | Docker Compose (5 services), PM2, Nginx | 🔶 Partial |
| **CI/CD** | GitHub Actions (Python tests only) | 🔶 Partial |

---

## 3. COMPLETION STATUS (Overall: ~55% complete)

### Auth & Users
- ✅ JWT authentication with multi-role support — `backend/services/auth_service.py`
- ✅ RBAC middleware (8 roles, hierarchy, endpoint permissions) — `backend/middleware/rbac_middleware.py`
- ✅ Password hashing with bcrypt — `backend/services/auth_service.py`
- ✅ MCP session-based auth with access/refresh tokens — `server/session_store.py`
- ✅ Token refresh with deduplication — `server/session_store.py`
- ✅ Chain-wide token revocation on logout — `server/session_store.py`
- 🔶 MCP auth fallback in RBAC middleware — `backend/middleware/rbac_middleware.py` (works but sync call in thread pool)
- 🔒 Seed user bootstrap (9 hardcoded accounts) — `backend/main.py` (disabled by default)
- ❌ Password reset flow — not implemented
- ❌ Email verification — not implemented
- ❌ MFA/2FA — not implemented

### Core Business Logic
- ✅ Skill registry (4 built-in skills, DB-backed CRUD) — `backend/services/skill_registry.py`
- ✅ Model access control (per-role, per-user) — `backend/services/model_access_service.py`
- ✅ Execution guard chain (5 gates) — `backend/services/execution_guard.py`
- ✅ Token usage tracking & cost calculation — `backend/services/token_service.py`
- ✅ Subscription management (CRUD, user assignment) — `backend/services/subscription_service.py`
- ✅ Governance policy engine (8 policy types) — `backend/services/policy_engine.py`
- ✅ Audit logging (success/denied/error/security) — `backend/services/audit_service.py`
- ✅ AI anomaly detection — `backend/services/ai_anomaly_detection.py`
- ✅ Smart model router (complexity analysis) — `backend/services/smart_router.py`
- ✅ Prompt optimizer (3 compression strategies) — `backend/services/prompt_optimizer.py`
- ✅ Predictive analytics (cost forecasting) — `backend/services/predictive_analytics.py`
- ✅ Content safety engine (moderation, injection detection) — `backend/services/content_safety.py`
- 🔶 Semantic cache — `backend/services/semantic_cache.py` (exact match works, similarity is stubbed)
- 🔶 Governance copilot — `backend/services/governance_copilot.py` (8 intents, NL interface)
- 🔶 Auto-scaling engine — `backend/services/auto_scaling.py` (plan usage stats always return zeros)
- ✅ Model adapter abstraction (Mock, LiteLLM, Anthropic, Gemini) — `backend/adapters/model_adapter.py`

### Database / Data Layer
- ✅ 16 SQLAlchemy ORM models defined — `backend/core/database.py`
- ✅ Redis client with in-memory fallback — `backend/core/redis_client.py`
- ✅ Custom types (GUID, JSON, INET) — `backend/core/database.py`
- 🔶 PostgreSQL production config — `backend/core/config.py` (configured but untested)
- ❌ Database migrations (Alembic) — referenced in npm scripts but no alembic directory exists
- ❌ No explicit SQLAlchemy relationships — all joins are manual queries

### API / Backend Routes
- ✅ 70+ API endpoints across 8 routers — `backend/routers/`
- ✅ Auth routes (`/auth/login`, `/auth/me`) — `backend/routers/auth.py`
- ✅ Skills CRUD + assign/revoke — `backend/routers/skills.py`
- ✅ Model management + configs + secrets — `backend/routers/models.py`
- ✅ Execute + SSE streaming — `backend/routers/execute.py`
- ✅ Monitoring/audit logs — `backend/routers/monitoring.py`
- ✅ User listing — `backend/routers/users.py`
- ✅ Admin (subscriptions, model access, feature flags, policies, tokens) — `backend/routers/admin.py`
- ✅ RBAC admin (roles, permissions, audit) — `backend/routers/rbac_admin.py`
- ✅ Governance AI endpoints — `backend/routers/governance.py`
- ✅ AI intelligence (anomalies, smart routing, optimization, analytics, safety, copilot, scaling) — `backend/routers/ai_intelligence.py`
- 🐛 **BROKEN:** `/models` router has broken import — `backend/routers/models.py:15` imports `from server.secretbox` which doesn't exist in this path

### Frontend / UI
- ✅ 10 routes with role-based protection — `src/App.tsx`
- ✅ Three-panel workspace (skills, chat, SQL editor) — `src/components/`
- ✅ Admin & User dashboards with charts — `src/components/dashboard/`
- ✅ Skills management page — `src/components/skills/SkillsManagement.tsx`
- ✅ Model access management page — `src/components/models/ModelsAccess.tsx`
- ✅ Monitoring/audit log view — `src/components/monitoring/MonitoringView.tsx`
- ✅ Governance admin page (5 tabs) — `src/pages/GovernanceAdminPage.tsx`
- ✅ Project management (panel, canvas, stories, workflow) — `src/components/project/`
- ✅ 15 reusable UI components — `src/components/common/`
- ✅ API client with 401 auto-refresh, caching, retry — `src/services/backendApi.ts`
- ✅ MCP client — `src/api/mcpClient.ts`
- ✅ Snowflake service via MCP — `src/api/snowflakeService.ts`
- ✅ 28 AI skill definitions as markdown — `src/skills/`
- ❌ **SkillsManagement uses MOCK data** — never calls real API
- ❌ **ModelsAccess uses MOCK data** — never calls real API
- ❌ **MonitoringView uses MOCK data** — never calls real API
- ❌ 6 components never imported/rendered (ProjectCanvas, StoryBoard, ProjectHeader, QueryPlanViewer, ObjectSearchBar, SystemMonitorModal)

### MCP Server (Snowflake Bridge)
- ✅ 46 Snowflake tools registered — `server/tool_registry.py`
- ✅ SQL safety enforcement (sqlglot) — `server/security.py`
- ✅ Session management with token rotation — `server/session_store.py`
- ✅ Rate limiting (in-memory, sliding window) — `server/main.py`
- ✅ CORS configuration — `server/main.py`
- ✅ Input validation (payload size limits) — `server/main.py`
- ✅ Background session cleanup — `server/main.py`
- 🔶 `requests` library used but not in requirements.txt — `server/main.py:292`
- 🔶 Typo in SQL: `LAST_ALTERTED` should be `LAST_ALTERED` — `server/tool_registry.py:1098`
- 🔒 6 stub tools (search_snowflake_docs, list_models, search_marketplace, create_task, decompose_goal, create_cortex_agent)

### Integrations
- ✅ Snowflake (role lookup, query execution) — `backend/services/snowflake_service.py`
- ✅ LiteLLM adapter — `backend/adapters/model_adapter.py`
- ✅ Anthropic adapter — `backend/adapters/model_adapter.py`
- ✅ Google Gemini adapter — `backend/adapters/model_adapter.py`
- 🔶 Redis (caching, rate limiting) — works with in-memory fallback
- 🔒 Stripe — not integrated
- ❌ Email provider — not integrated
- ❌ Error monitoring (Sentry) — not integrated

### DevOps / Config / Deployment
- ✅ Docker Compose (5 services: postgres, redis, backend, frontend, nginx) — `deployment/docker/docker-compose.yml`
- ✅ PM2 ecosystem config — `deployment/ecosystem.config.js`
- ✅ GitHub Actions CI (Python startup security + unit tests) — `.github/workflows/startup-security-gate.yml`
- ✅ Test suite (31/31 passing) — `docs/tester/`
- 🐛 **Dockerfile naming mismatch** — compose references `Dockerfile.backend` but file is `api.dockerfile`
- 🐛 **Nginx config naming mismatch** — web.dockerfile references `nginx.frontend.conf` but file is `frontend.conf`
- ❌ Kubernetes manifests — only documented, not implemented
- ❌ No Docker build in CI
- ❌ No frontend tests in CI
- ❌ `.env.local` contains real credentials (Snowflake password, Gemini API key)
- 🔶 `.env.production` has all placeholder values

---

## 4. CRITICAL GAPS (Must fix before launch)

1. **[BROKEN IMPORT]** `backend/routers/models.py:15` — `from server.secretbox import ...` fails because `server` package is not in the backend import path. **Blocks all model management endpoints.** Effort: 1-2 hours
2. **[MOCK DATA IN UI]** SkillsManagement, ModelsAccess, MonitoringView all use hardcoded mock data instead of calling real APIs. **Admin pages are non-functional.** Effort: 8-12 hours
3. **[NO DB MIGRATIONS]** No Alembic setup despite 17 database tables. **Cannot deploy to production database.** Effort: 4-6 hours
4. **[REAL CREDENTIALS EXPOSED]** `.env.local` contains live Snowflake password, Gemini API key, and JWT secret. **Security breach risk.** Effort: 30 minutes (revoke + rotate)
5. **[DUPLICATE MCP SERVERS]** `server/` and `apps/mcp/` are two separate MCP implementations with overlapping functionality. **Maintenance nightmare, confusion about which is canonical.** Effort: 2-3 days (consolidation)
6. **[SQLITE FOR SESSIONS]** MCP session store defaults to SQLite — doesn't support concurrent writes or multi-worker deployments. Effort: 2-4 hours (switch to PostgreSQL)
7. **[MISSING `requests` DEPENDENCY]** `server/main.py:292` imports `requests` but it's not in `requirements.txt`. **Login endpoint crashes at runtime.** Effort: 15 minutes

---

## 5. NICE-TO-HAVE (Post-launch)

1. Password reset / forgot password flow
2. Email verification for new users
3. MFA/2FA support
4. Semantic cache similarity matching (currently stubbed)
5. Auto-scaling plan utilization stats (currently returns zeros)
6. Kubernetes deployment manifests
7. Sentry/error monitoring integration
8. Stripe payment integration for subscriptions
9. Email notifications (budget alerts, role changes)
10. Performance/load testing infrastructure
11. Docker build in CI pipeline
12. Frontend E2E tests in CI

---

## 6. BROKEN / RISKY CODE

| File:Line | Issue | Severity |
|---|---|---|
| `backend/routers/models.py:15` | Broken import `from server.secretbox` — module doesn't exist in backend path | 🔴 Critical |
| `backend/services/semantic_cache.py:136-138` | `_find_similar_cached()` always returns None — semantic similarity is a no-op | 🟡 High |
| `backend/services/auto_scaling.py:258-264` | `_get_plan_usage_stats()` always returns zeros | 🟡 High |
| `server/main.py:292` | `import requests` inside function — package not in requirements.txt | 🔴 Critical |
| `server/tool_registry.py:1098` | SQL typo: `LAST_ALTERTED` → `LAST_ALTERED` | 🟡 High |
| `server/secretbox.py` (entire file) | Custom XOR stream cipher — cryptographically weak for credential storage | 🔴 Critical |
| `backend/services/snowflake_service.py:83` | `insecure_mode=True` — OCSP certificate validation bypassed | 🔴 Critical |
| `backend/main.py:147-167` | 9 hardcoded seed accounts with plaintext passwords in source | 🟡 High |
| `backend/services/token_service.py:237` | `func.strftime` is SQLite-specific — breaks on PostgreSQL | 🟡 High |
| `backend/middleware/rbac_middleware.py:48` | Empty role defaults to VIEWER instead of rejecting | 🟡 Medium |
| `src/services/backendApi.ts:33` | `ApiError` class referenced before declaration (line 164) | 🟡 High |
| `src/components/CenterPanel.tsx` | 1307+ lines — god component, should be split | 🟠 Medium |
| `src/components/project/*.tsx` | 4 components (ProjectCanvas, StoryBoard, ProjectHeader, unused) never imported | 🟠 Medium |
| `src/components/sprint1/*.tsx` | 2 components (QueryPlanViewer, ObjectSearchBar) never imported | 🟠 Medium |
| `src/components/SystemMonitorModal.tsx` | Never rendered — Monitor button does nothing | 🟠 Medium |
| `src/components/RightPanel.tsx:324` | CSS classes like `bg-panel`, `border-border` not defined in Tailwind config | 🟠 Medium |
| `src/auth/AuthProvider.tsx:58` | Password stored in localStorage as `auth_pass_tmp` | 🔴 Critical |
| `deployment/docker/docker-compose.yml:53` | References `Dockerfile.backend` but file is `api.dockerfile` | 🟡 High |
| `deployment/docker/web.dockerfile:26` | References `nginx.frontend.conf` but file is `frontend.conf` | 🟡 High |
| `apps/mcp/tests/test_server_main_security.py:8` | Imports `server.main` instead of `apps.mcp.main` — tests wrong module | 🟡 High |
| `apps/api/tests/*.py` | All tests import from `backend/` not `apps/api/` — wrong module | 🟡 High |
| `.env.local` | Contains real Snowflake password, Gemini API key, JWT secret | 🔴 Critical |
| `backend/core/rbac.py` | Mixed Chinese-English forbidden topics in content safety | 🟠 Medium |

---

## 7. WHAT'S ACTUALLY DONE (celebrate the wins)

**The platform has a genuinely impressive foundation:**

- **70+ well-structured API endpoints** covering auth, skills, models, execution, monitoring, admin, RBAC, governance, and AI intelligence
- **8-tier RBAC hierarchy** with endpoint-level permissions, Snowflake permissions, and environment scoping — this is enterprise-grade access control
- **5-gate execution guard chain** (model registration → skill access → model access → rate limit → prompt sanitization) — solid security architecture
- **46 Snowflake MCP tools** across 8 sprints — comprehensive data warehouse interaction capabilities
- **Full AI intelligence suite** — anomaly detection, smart routing, prompt optimization, predictive analytics, content safety, semantic caching, natural language copilot, auto-scaling recommendations
- **React frontend with 15 reusable components**, three-panel workspace, project management, and animated UI
- **Comprehensive test suite** — 31/31 tests passing across auth, RBAC, execution guard, security attacks, and audit log validation
- **Docker Compose infrastructure** with PostgreSQL, Redis, backend, frontend, and Nginx — production-ready containerization blueprint
- **Extensive documentation** — 6+ architecture documents, deployment guides, test documentation, and migration plans

---

## 8. RECOMMENDED BUILD ORDER

### Phase 1 (This week — Critical Fixes)
1. Fix broken `server.secretbox` import in `backend/routers/models.py` — copy or symlink secretbox module
2. Add `requests` to `server/requirements.txt`
3. Fix Dockerfile naming mismatches in docker-compose.yml
4. Fix nginx config naming mismatch in web.dockerfile
5. Rotate exposed credentials in `.env.local`
6. Remove password from localStorage in `src/auth/AuthProvider.tsx`
7. Fix `ApiError` reference-before-declaration in `src/services/backendApi.ts`

### Phase 2 (Next week — Connect the UI)
1. Wire SkillsManagement component to real `/skills` API endpoints
2. Wire ModelsAccess component to real `/models` API endpoints
3. Wire MonitoringView component to real `/monitoring` API endpoints
4. Wire GovernanceAdminPage to real `/admin` API endpoints
5. Fix CSS class names in project components to use CSS variables
6. Remove or integrate 6 unused components (ProjectCanvas, StoryBoard, etc.)

### Phase 3 (Launch-ready — Infrastructure)
1. Set up Alembic for database migrations
2. Switch MCP session store from SQLite to PostgreSQL
3. Consolidate duplicate MCP servers (`server/` vs `apps/mcp/`)
4. Add Docker build to GitHub Actions CI
5. Add frontend tests to CI pipeline
6. Implement semantic cache similarity matching (or remove the feature)
7. Fix `func.strftime` PostgreSQL compatibility in token_service.py
8. Replace weak XOR cipher with proper AES-GCM encryption for secrets

---

## 9. CONTINUATION PROMPT

```markdown
## PLATFORM CONTEXT
You are helping build π-Optimized — an AI Governance & Snowflake MCP Bridge Platform that provides role-based access control, token/cost governance, and AI model management layered on top of Snowflake data warehouse.

**Business Purpose:** Enable organizations to govern AI model access to Snowflake through role-based permissions, token/cost tracking, execution guards, and comprehensive audit logging. Users authenticate with Snowflake credentials, get assigned one of 8 platform roles, and interact with AI models through a governed workspace.

**Core User Flow:**
1. User logs in with Snowflake credentials (account, username, password, role)
2. Backend validates against Snowflake + issues JWT with platform role
3. User accesses workspace → selects AI skills → writes natural language prompts
4. Platform routes through 5-gate execution guard chain
5. Prompt is executed against Snowflake via MCP bridge (46 tools available)
6. Results returned with full audit logging, token tracking, and cost calculation

**Tech Stack:**
- Frontend: React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Zustand + React Router DOM v7 + Recharts + Motion
- Backend: FastAPI (Python 3.12) + Uvicorn + SQLAlchemy async + PyJWT + bcrypt
- MCP Server: FastAPI + Snowflake connector + sqlglot + session management
- Database: SQLite (dev) / PostgreSQL (prod) + Redis (cache)
- External: Snowflake, LiteLLM, Anthropic, Google Gemini
- Infrastructure: Docker Compose (5 services), Nginx, PM2, GitHub Actions

## WHAT IS ALREADY BUILT

### Backend (backend/)
- ✅ 70+ API endpoints across 8 routers (auth, skills, models, execute, monitoring, users, admin, rbac_admin, governance, ai_intelligence)
- ✅ 21 services including auth, audit, execution guard, permissions, skill registry, subscription, token, model access, routing, policy engine, RBAC, governance, Snowflake, anomaly detection, smart router, prompt optimizer, predictive analytics, content safety, semantic cache, copilot, auto-scaling
- ✅ 16 SQLAlchemy ORM models (users, model_permissions, skill_assignments, skill_definitions, skill_states, registered_models, secret_references, model_configurations, audit_log, subscriptions, user_subscriptions, user_tokens, token_usage_log, model_access_control, feature_flags, cost_tracking)
- ✅ 8-role RBAC hierarchy with endpoint permissions, Snowflake permissions, environment scoping
- ✅ 5-gate execution guard chain
- ✅ 4 middleware (CORS, RequestID, RBACAuth, Audit)
- ✅ Model adapter abstraction (Mock, LiteLLM, Anthropic, Gemini)

### MCP Server (server/)
- ✅ 46 Snowflake tools (run_query, list_databases, explain_query, cortex_complete, scaffold_dbt_project, etc.)
- ✅ SQL safety enforcement via sqlglot
- ✅ Session management with access/refresh token rotation
- ✅ Rate limiting, CORS, input validation
- ✅ Background session cleanup

### Frontend (src/)
- ✅ 10 routes with role-based protection
- ✅ Three-panel workspace (LeftPanel: skills/projects, CenterPanel: chat/AI, RightPanel: SQL editor/data explorer)
- ✅ Admin & User dashboards with recharts visualizations
- ✅ 15 reusable UI components (Button, Card, Modal, DataTable, MetricCard, etc.)
- ✅ Zustand store with 40+ state properties and actions
- ✅ API client with 401 auto-refresh, caching (60s TTL), request deduplication, retry with exponential backoff
- ✅ 28 AI skill definitions as markdown files
- ✅ Auth system with JWT, role normalization, permission derivation

### Infrastructure
- ✅ Docker Compose with 5 services (postgres, redis, backend, frontend, nginx)
- ✅ GitHub Actions CI with Python startup security tests
- ✅ Test suite: 31/31 passing

## WHAT IS PARTIALLY BUILT (needs completion)

### 1. Model Management Endpoints — BROKEN
- **File:** `backend/routers/models.py:15`
- **What exists:** Full CRUD for model configurations, secret references, access controls
- **What's broken:** `from server.secretbox import SecretBoxError, decrypt_json, encrypt_json` — the `server` package is not in the backend import path. This import fails on module load, making the entire `/models/*` router unreachable.
- **Fix:** Copy `server/secretbox.py` to `backend/services/secretbox.py` or create a shared `shared/crypto/` module. Update all imports.

### 2. Semantic Cache — SIMILARITY STUBBED
- **File:** `backend/services/semantic_cache.py:136-138`
- **What exists:** Exact prompt hash matching works. Cache stats endpoint works.
- **What's missing:** `_find_similar_cached()` always returns `None`. The text similarity signature (word frequency) is computed but never used for matching.
- **Fix:** Implement cosine similarity or Jaccard index comparison between cached prompt signatures and incoming prompt.

### 3. Auto-Scaling Engine — USAGE STATS STUBBED
- **File:** `backend/services/auto_scaling.py:258-264`
- **What exists:** Plan upgrade/downgrade recommendation logic, utilization report structure
- **What's missing:** `_get_plan_usage_stats()` always returns `{requests: 0, tokens: 0, cost: 0}`. All recommendations will be based on zero data.
- **Fix:** Query `user_tokens` and `token_usage_log` tables to compute actual usage statistics.

### 4. Frontend Admin Pages — MOCK DATA
- **Files:** `src/components/skills/SkillsManagement.tsx`, `src/components/models/ModelsAccess.tsx`, `src/components/monitoring/MonitoringView.tsx`
- **What exists:** Full UI components with DataTables, forms, modals, filters
- **What's missing:** All data is hardcoded mock arrays (`MOCK_SKILLS`, `MOCK_MODELS`, `MOCK_LOGS`). None of these components call the real API endpoints defined in `src/services/backendApi.ts`.
- **Fix:** Replace mock data with `fetchSkills()`, `fetchModels()`, `fetchMonitoringData()` calls from backendApi.ts. Add loading states and error handling.

### 5. MCP Server Duplicate
- **Files:** `server/` (root) vs `apps/mcp/`
- **What exists:** Two separate MCP server implementations. `server/` is more complete (46 tools, session management). `apps/mcp/` is simpler (40 tools).
- **What's missing:** Clear canonical source. Tests in `apps/mcp/tests/` import from wrong modules.
- **Fix:** Consolidate to one implementation. Deprecate `apps/mcp/` or merge unique tools into `server/`.

## WHAT NEEDS TO BE BUILT FROM SCRATCH

### 1. Database Migrations (Alembic)
- **Where it fits:** `backend/alembic/` directory
- **What it should do:** Manage schema migrations for 17 tables. Support SQLite dev → PostgreSQL prod migration. Include initial migration from current model definitions.
- **Why:** Cannot deploy to production without migration strategy.

### 2. Password Reset Flow
- **Where it fits:** `backend/routers/auth.py` (new endpoints), `src/pages/ForgotPasswordPage.tsx` (new page)
- **What it should do:** Email-based password reset with token. Since users authenticate via Snowflake credentials, this may need to be a platform password reset separate from Snowflake auth.

### 3. Email Notifications
- **Where it fits:** `backend/services/notification_service.py`
- **What it should do:** Send budget alert emails, role change notifications, subscription expiry warnings. Needs email provider integration (SendGrid, Resend, or SES).

### 4. Kubernetes Manifests
- **Where it fits:** `deployment/k8s/` directory
- **What it should do:** Deployment, Service, Ingress, ConfigMap, Secret manifests for all 5 services. Horizontal Pod Autoscaler for backend.

## KNOWN ISSUES TO FIX

### Critical (Fix Immediately)
1. `backend/routers/models.py:15` — Broken import `from server.secretbox` — module doesn't exist
2. `server/main.py:292` — `import requests` not in requirements.txt — login endpoint crashes
3. `server/secretbox.py` — XOR stream cipher is cryptographically weak for credential storage
4. `backend/services/snowflake_service.py:83` — `insecure_mode=True` bypasses OCSP validation
5. `src/auth/AuthProvider.tsx:58` — Password stored in localStorage as plaintext
6. `.env.local` — Contains real Snowflake password, Gemini API key, JWT secret

### High Priority
7. `server/tool_registry.py:1098` — SQL typo `LAST_ALTERTED` → `LAST_ALTERED`
8. `src/services/backendApi.ts:33` — `ApiError` referenced before class declaration (line 164)
9. `backend/services/token_service.py:237` — `func.strftime` is SQLite-specific, breaks on PostgreSQL
10. `backend/main.py:147-167` — 9 hardcoded seed accounts with plaintext passwords
11. `deployment/docker/docker-compose.yml:53` — References `Dockerfile.backend` but file is `api.dockerfile`
12. `deployment/docker/web.dockerfile:26` — References `nginx.frontend.conf` but file is `frontend.conf`
13. `apps/mcp/tests/test_server_main_security.py:8` — Tests import from `server.main` instead of `apps.mcp.main`
14. `apps/api/tests/*.py` — All tests import from `backend/` not `apps/api/`

### Medium Priority
15. `backend/middleware/rbac_middleware.py:48` — Empty role defaults to VIEWER
16. `src/components/RightPanel.tsx:324` — CSS classes `bg-panel`, `border-border` not defined
17. `backend/core/rbac.py` — Mixed Chinese-English forbidden topics in content safety
18. `src/components/CenterPanel.tsx` — 1307+ lines god component
19. 6 unused components never imported (ProjectCanvas, StoryBoard, ProjectHeader, QueryPlanViewer, ObjectSearchBar, SystemMonitorModal)

## ARCHITECTURE DECISIONS ALREADY MADE

### Auth Approach
- JWT with HS256, 24-hour expiration
- Bearer token in Authorization header
- Multi-role support (primary `role` + `roles` array in token payload)
- MCP fallback auth (call MCP `/users/me` if JWT validation fails) — configurable
- Role normalization: legacy `ADMIN` → `ORG_ADMIN`, `USER` → `BUSINESS_USER`
- Snowflake role aliases: `ACCOUNTADMIN` → `ORG_ADMIN`, etc.

### Database Schema Patterns
- GUID primary keys (UUID4)
- No explicit SQLAlchemy `relationship()` — all joins via manual queries
- Soft deletes via `is_active` boolean
- Audit trail via `AuditLogModel` with request_id, user_id, action, outcome
- Token tracking via monthly period (`YYYY-MM`) with per-request usage log

### API Conventions
- FastAPI with Pydantic request/response models
- All admin endpoints require `ORG_ADMIN` or `ADMIN` role
- Error responses: `{"error": "message", "detail": "optional"}`
- Pagination: `?page=N&per_page=N` with `total`, `page`, `per_page`, `items` in response
- Caching: Redis with TTL (60s permissions, 300s models, 3600s semantic cache)

### Naming Conventions
- Python: snake_case for functions/variables, PascalCase for classes
- TypeScript: camelCase for functions/variables, PascalCase for components/types
- Database: snake_case table names, `Model` suffix for ORM classes
- API routes: kebab-case for paths, plural nouns (`/skills`, `/models`, `/users`)
- Env vars: UPPER_SNAKE_CASE with service prefix (MCP_, SNOWFLAKE_, VITE_)

### Frontend Patterns
- Zustand for global state, localStorage for project persistence
- Custom events for cross-component communication (anti-pattern, but currently used)
- Role-based route protection via `ProtectedRoute` with `requiredPermission` prop
- CSS custom properties for theming (`--color-bg-base`, `--color-accent`, etc.)
- Tailwind CSS v4 with `@tailwindcss/vite` plugin

## YOUR TASK

[Specify your next task here. Priority order:
1. Fix critical broken imports and missing dependencies
2. Wire frontend admin pages to real APIs
3. Set up Alembic database migrations
4. Consolidate duplicate MCP servers
5. Fix Dockerfile naming mismatches
6. Implement missing features (password reset, email notifications)]

## CONSTRAINTS
- Do not change the existing FastAPI router structure — keep the 8-router pattern
- Keep the existing RBAC role hierarchy (8 roles) — do not add or remove roles without explicit approval
- Use the existing Zustand store pattern — do not introduce Redux or Context for global state
- Keep the existing MCP tool registry pattern (ToolDefinition + handler method)
- Maintain the 5-gate execution guard chain — do not remove any gates
- Use CSS custom properties for theming — do not introduce new color systems
- Keep the existing API client architecture (backendApi.ts + governanceApi.ts + mcpClient.ts)
- When adding new database tables, add them to `backend/core/database.py` (not in service files)
- Follow the existing Pydantic schema pattern in `backend/schemas/api.py` for new request/response models
- Do not change the JWT token structure (sub, email, role, roles, display_name, iat, exp)
```