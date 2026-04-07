# MCP Server Consolidation Plan

## Status: **COMPLETED** (2026-04-05)

- **Phase 1: Preparation** — COMPLETE
- **Phase 2: Implementation** — COMPLETE
- **Phase 3: Testing** — COMPLETE
- **Phase 4: Deprecation** — COMPLETE
- **Phase 5: Cleanup** — COMPLETE

Canonical MCP server: `apps/mcp/main.py` (deployed to Railway, tested in CI/CD, includes Sentry).
Deprecated: `server/main.py` — **DELETED** (consolidation complete, 2026-04-05).

## Problem Statement

The project contains **two separate MCP server implementations** with overlapping functionality but different authentication mechanisms and feature sets:

1. **`server/main.py`** (381 lines) - Full-featured implementation
2. **`apps/mcp/main.py`** (231 lines) - Simplified implementation

This duplication creates:
- Maintenance burden (fixes must be applied twice)
- Security inconsistencies
- Confusion for developers
- Increased testing surface area

---

## Current Implementation Comparison

| Feature | `server/main.py` | `apps/mcp/main.py` | Recommendation |
|---------|-----------------|-------------------|----------------|
| **Authentication** | Snowflake REST API | Direct Snowflake connection | Keep Snowflake REST API |
| **Token Refresh** | ✅ Yes | ❌ No | Keep token refresh |
| **Rate Limiting** | ✅ Yes | ❌ No | Keep rate limiting |
| **User Info Endpoint** | ✅ `/users/me` | ✅ `/users/me` | Keep both |
| **Token Storage** | In-memory with refresh tokens | In-memory only | Migrate to Redis |
| **Error Handling** | Comprehensive | Basic | Keep comprehensive |
| **Logging** | Detailed | Basic | Keep detailed |
| **CORS Configuration** | Configurable | Configurable | Keep configurable |
| **Health Check** | Detailed with Snowflake status | Detailed with Snowflake status | Keep detailed |

---

## Recommended Approach: Consolidate to `server/main.py`

### Rationale
1. **More Complete Feature Set** - Includes token refresh, rate limiting, better error handling
2. **Better Security** - Uses Snowflake REST API (more secure than direct connection)
3. **Production Ready** - Already has rate limiting and comprehensive logging
4. **Less Disruption** - `apps/mcp/` appears to be a newer/simplified version

---

## Migration Steps

### Phase 1: Preparation (Week 1)

#### 1.1 Create Feature Parity Matrix
```markdown
| Endpoint | server/main.py | apps/mcp/main.py | Action |
|----------|---------------|------------------|--------|
| POST /auth/login | Snowflake REST API | Direct connection | Standardize on REST API |
| POST /auth/refresh | ✅ | ❌ | Keep in consolidated |
| GET /users/me | ✅ | ✅ | Merge implementations |
| GET /mcp/tools | ✅ | ✅ | Merge implementations |
| POST /mcp/call | ✅ | ✅ | Merge implementations |
| GET /mcp/events | ✅ | ✅ | Merge implementations |
| GET /health | ✅ | ✅ | Merge implementations |
```

#### 1.2 Identify Unique Features in `apps/mcp/main.py`
- Review if any unique logic exists
- Document any differences in tool registry or Snowflake client
- Check for different configuration options

#### 1.3 Create Migration Branch
```bash
git checkout -b feature/consolidate-mcp-server
```

### Phase 2: Implementation (Week 2)

#### 2.1 Enhance `server/main.py` with Missing Features
If `apps/mcp/main.py` has any unique features, port them to `server/main.py`:

```python
# Example: If apps/mcp has different auth flow
# Add to server/main.py if needed
```

#### 2.2 Update Configuration
Ensure `server/config.py` supports all configuration options from both implementations:

```python
# Add any missing configuration options
class Settings:
    # Existing options...
    
    # New options from apps/mcp if any
    mcp_auth_mode: str = "snowflake_rest"  # or "direct"
```

#### 2.3 Update Package Scripts
Modify `package.json` to use consolidated server:

```json
{
  "scripts": {
    "mcp:dev": "py -3.12 -m server.main || python -m server.main",
    "mcp:install": "py -3.12 -m pip install -r server/requirements.txt || python -m pip install -r server/requirements.txt"
  }
}
```

#### 2.4 Update Documentation
Update `README.md` to reflect single MCP server:

```markdown
## MCP Server

The project includes a single MCP server implementation in `server/` directory.

### Endpoints
- Health: GET /health
- Authentication: POST /auth/login, POST /auth/refresh
- User Info: GET /users/me
- Tool Discovery: GET /mcp/tools
- Tool Invocation: POST /mcp/call
- SSE Status Stream: GET /mcp/events
```

### Phase 3: Testing (Week 3)

#### 3.1 Update Test Scripts
Ensure all test scripts point to consolidated server:

```bash
# Update docs/tester/run-api-tests.js
# Update docs/tester/security-attacks.js
# Update any other test files
```

#### 3.2 Run Comprehensive Tests
```bash
# Unit tests
npm run test:unit:py

# Integration tests
npm run test:api

# Security tests
npm run test:security

# Full test suite
npm run test:full
```

#### 3.3 Verify Feature Parity
Create test cases to verify all features work:

```python
# test_mcp_consolidation.py
def test_auth_login():
    """Test authentication via Snowflake REST API"""
    pass

def test_token_refresh():
    """Test token refresh functionality"""
    pass

def test_rate_limiting():
    """Test rate limiting enforcement"""
    pass

def test_tool_invocation():
    """Test MCP tool calls"""
    pass
```

### Phase 4: Deprecation (Week 4)

#### 4.1 Add Deprecation Notice to `apps/mcp/main.py`
```python
"""
DEPRECATED: This MCP server implementation is deprecated.

Please use server/main.py instead.

Migration Guide:
1. Update package.json scripts to use server/main.py
2. Update any direct imports
3. Test your integration

This file will be removed in version 2.0.0
"""
```

#### 4.2 Update Import Paths
If any code imports from `apps.mcp`, update to `server`:

```python
# Before
from apps.mcp.config import load_settings

# After
from server.config import load_settings
```

#### 4.3 Create Migration Guide
```markdown
# MCP Server Migration Guide

## Overview
The MCP server has been consolidated from two implementations to one.

## What Changed
- `apps/mcp/main.py` is now deprecated
- All functionality moved to `server/main.py`
- No breaking API changes

## Migration Steps

### For Developers
1. Update your local development setup:
   ```bash
   # Old
   npm run mcp:dev  # Would run apps/mcp/main.py
   
   # New
   npm run mcp:dev  # Now runs server/main.py
   ```

2. Update any custom scripts:
   ```python
   # Old
   from apps.mcp.main import app
   
   # New
   from server.main import app
   ```

### For Deployment
1. Update Docker configuration if using `apps/mcp/`
2. Update environment variables if different between implementations
3. Test thoroughly before deploying

## Timeline
- **Week 1-3:** Both implementations available, deprecation notice added
- **Week 4:** `apps/mcp/main.py` removed from codebase
- **Week 5+:** Only `server/main.py` supported
```

### Phase 5: Cleanup (Week 5)

#### 5.1 Remove `apps/mcp/main.py`
```bash
git rm apps/mcp/main.py
git commit -m "Remove deprecated MCP server implementation"
```

#### 5.2 Remove `apps/mcp/` Directory if Empty
```bash
# Check if directory is empty
ls apps/mcp/

# If only __init__.py remains, remove it
git rm apps/mcp/__init__.py
git rm -r apps/mcp/
```

#### 5.3 Update CI/CD Pipelines
Ensure all pipelines use consolidated server:

```yaml
# .github/workflows/test.yml
- name: Run MCP Server Tests
  run: |
    npm run mcp:install
    npm run test:api
```

---

## Risk Mitigation

### Risk 1: Breaking Changes for Existing Users
**Mitigation:**
- Maintain API compatibility
- Provide clear migration guide
- Keep deprecated version for 4 weeks

### Risk 2: Lost Features from `apps/mcp/main.py`
**Mitigation:**
- Feature parity audit before consolidation
- Port any unique features
- Comprehensive testing

### Risk 3: Deployment Issues
**Mitigation:**
- Test in staging environment first
- Gradual rollout (canary deployment)
- Rollback plan documented

---

## Success Criteria

- [ ] Single MCP server implementation (`server/main.py`)
- [ ] All features from both implementations available
- [ ] All tests passing
- [ ] Documentation updated
- [ ] No breaking API changes
- [ ] Performance equal or better
- [ ] Security improved (token refresh, rate limiting)

---

## Timeline Summary

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1 | Preparation | Feature matrix, migration branch |
| 2 | Implementation | Consolidated server, updated configs |
| 3 | Testing | All tests passing, feature parity verified |
| 4 | Deprecation | Deprecation notices, migration guide |
| 5 | Cleanup | Old implementation removed |

---

## Appendix: File Inventory

### Files to Keep
- `server/main.py` - Consolidated MCP server
- `server/config.py` - Configuration
- `server/security.py` - Security utilities
- `server/snowflake_client.py` - Snowflake client
- `server/tool_registry.py` - Tool registry
- `server/requirements.txt` - Dependencies

### Files to Deprecate
- `apps/mcp/main.py` - Duplicate implementation
- `apps/mcp/config.py` - Duplicate configuration
- `apps/mcp/security.py` - Duplicate security
- `apps/mcp/snowflake_client.py` - Duplicate client
- `apps/mcp/tool_registry.py` - Duplicate registry

### Files to Update
- `package.json` - Update scripts
- `README.md` - Update documentation
- `docs/tester/*.js` - Update test scripts
- `docker-compose.yml` - Update if using apps/mcp

---

**Document Version:** 1.0  
**Created:** 2026-03-29  
**Author:** AI Solution Architect  
**Status:** Draft - Pending Review
