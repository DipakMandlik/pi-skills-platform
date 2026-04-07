# Platform Tester - Test Infrastructure Documentation

## 🧪 Tester Master Execution Plan

This document describes the test infrastructure for the AI Skills Platform with RBAC & Model Governance.

### Prerequisites
1. **Backend running** - Start with `npm run backend:dev`
2. **PostgreSQL** - Must be accessible (default: `postgresql://postgres:postgres@localhost:5432/ai_governance`)
3. **Redis** - Must be running (default: `redis://localhost:6379/0`)

### Test Users (Auto-seeded on backend start)
| Email | Role | Password |
|-------|------|----------|
| admin@platform.local | ADMIN | admin123 |
| user@platform.local | USER | user123 |
| viewer@platform.local | VIEWER | viewer123 |

---

## Quick Start

### Run All Tests
```bash
# First start the backend
npm run backend:dev

# Then run the full test suite
npm run test:full
```

### Run Individual Test Suites
```bash
# API Tests (Auth, RBAC, Execution Guard)
npm run test:api

# Detailed end-to-end auth test (Backend + MCP/Snowflake)
npm run test:auth:e2e

# Auth Tests Only
npm run test:api:auth

# Security Attack Tests
npm run test:security

# Audit Log Validation
npm run test:logs
```

---

## Test Scripts

### 1. `run-api-tests.js` - Main API Test Suite
**Phase 1-4 Tests:**
- Authentication (AUTH-001 to AUTH-012)
- RBAC Matrix (RBAC-001 to RBAC-018)
- Execution Guard (EXEC-001 to EXEC-020)
- JWT Security (SEC-001 to SEC-010)

**Usage:**
```bash
node docs/tester/run-api-tests.js --base-url http://localhost:8000
node docs/tester/run-api-tests.js --phase auth         # Auth tests only
node docs/tester/run-api-tests.js --phase rbac         # RBAC tests only
node docs/tester/run-api-tests.js --phase exec         # Execution guard tests
node docs/tester/run-api-tests.js --phase security     # JWT security tests
node docs/tester/run-api-tests.js --phase logs         # Audit log tests
```

### 1A. `auth-e2e.ps1` - Detailed Auth E2E Suite
Validates both auth paths:
- Backend auth (`/auth/login` with `email/password`)
- MCP/Snowflake auth (`/auth/login` with `account/username/password/role`)

Also checks token introspection endpoints:
- Backend `/auth/me`
- MCP `/users/me`

#### Setup
```powershell
Copy-Item docs/tester/auth-e2e.config.sample.json docs/tester/auth-e2e.config.json
```

Fill `docs/tester/auth-e2e.config.json` with your real values.

#### Run
```powershell
npm run test:auth:e2e
```

#### Run with extended suite
```powershell
powershell -ExecutionPolicy Bypass -File docs/tester/auth-e2e.ps1 -RunFullSuite
```

### 2. `security-attacks.js` - Security Attack Suite
**Phase 4 - Attack Vectors:**
- JWT Manipulation (alg:none, tampering, expiry)
- RBAC Bypass (role in body/headers, no token)
- Model Governance Bypass (spoofing, unicode, null inputs)
- Injection Attacks (SQL, XSS, path traversal)
- Information Leakage (stack traces, monitoring isolation)

**Usage:**
```bash
node docs/tester/security-attacks.js --base-url http://localhost:8000
```

### 3. `validate-audit-logs.js` - Audit Log Validator
**Phase 6 - Log Validation:**
- Completeness check (all actions logged)
- Accuracy check (required fields present)
- Immutability check (manual DB verification)

**Usage:**
```bash
node docs/tester/validate-audit-logs.js --base-url http://localhost:8000
node docs/tester/validate-audit-logs.js --since "2025-01-15T00:00:00Z"
```

---

## Output Files

Test results are saved to the `results/` directory:

| File | Description |
|------|-------------|
| `results/api_test_results.json` | Machine-readable test results |
| `results/api_validation_report.md` | Per-endpoint API validation report |
| `results/security_test_results.json` | Security attack test results |
| `results/security_testing_report.md` | Security testing verdict |
| `results/audit_log_report.md` | Audit log validation report |

---

## Test Execution Flow

```
Phase 0: Environment Setup
├── Check /health endpoint
├── Seed test users
└── Get JWT tokens

Phase 1: Functional API Testing
├── /auth/login, /auth/me
├── /skills CRUD
├── /models CRUD
├── /execute
└── /monitoring

Phase 2: RBAC Testing
├── Admin → full access
├── User → restricted
├── Viewer → minimal
└── Cross-role attacks

Phase 3: Execution Guard Testing
├── Gate 1: Model registered
├── Gate 2: Skill assigned
├── Gate 3: Model permitted
├── Gate 4: Rate limit
└── Gate 5: Prompt safety

Phase 4: Security Attacks
├── JWT attacks (alg:none, tampering)
├── RBAC bypass (role in body/headers)
├── Model bypass (spoofing, null)
├── Injection (SQL, XSS)
└── Information leakage

Phase 5: Integration Testing
├── Full admin → assign → execute → log flow
├── Revoke mid-session
└── Cache validation

Phase 6: Audit Log Validation
├── Completeness
├── Accuracy
└── Immutability
```

---

## Deliverables

After running tests, generate the following reports:

1. **Test Execution Report** - Summary of all tests with pass/fail counts
2. **Bug Report Document** - Any bugs found with reproduction steps
3. **API Validation Report** - Per-endpoint contract validation
4. **Security Testing Report** - Attack vector results
5. **Test Case Document** - Full structured test case records

---

## Troubleshooting

### Backend not responding
```bash
# Check if backend is running
curl http://localhost:8000/health

# Start backend
npm run backend:dev
```

### Database connection errors
- Ensure PostgreSQL is running
- Check `POSTGRES_DSN` in .env
- Run `npm run backend:install` to install dependencies

### Redis connection errors
- Ensure Redis is running
- Check `REDIS_URL` in .env
- Default: `redis://localhost:6379/0`

---

## Definition of Done

System is READY when ALL of these are true:

- ✅ All API endpoints pass contract tests
- ✅ RBAC cannot be bypassed (tested all vectors)
- ✅ Unauthorized model access returns 403
- ✅ Unauthorized skill access returns 403
- ✅ Execution guard blocks all 5 gate failures
- ✅ All denials produce audit log entries
- ✅ JWT tampering attacks return 401
- ✅ Prompt injection patterns detected and rejected
- ✅ No 500 errors on malformed input
- ✅ No information leakage in error responses
- ✅ All 5 deliverables complete