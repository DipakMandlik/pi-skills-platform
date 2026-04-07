# Access Control Analysis Report

**Date:** April 7, 2026  
**Database:** ai_governance.db (SQLite)  
**Classification:** HYBRID (RBAC + UBAC)

---

## Executive Summary

The current system implements a **hybrid access control model** combining:
- **Role-Based Access Control (RBAC)** via `model_access_controls.allowed_roles`
- **User-Based Access Control (UBAC)** via `model_permissions` and `skill_assignments`
- **Admin bypass logic** where admin roles get automatic access to all resources

---

## 1. Access Control Related Tables

### Core Tables

| Table | Purpose | Row Count |
|-------|---------|-----------|
| `users` | User accounts with platform roles | 4 |
| `model_permissions` | User-level model access grants | 0 |
| `skill_assignments` | User-level skill access grants | 0 |
| `model_access_controls` | Role-based model access rules | 5 |
| `subscription_plans` | Plan-based resource limits | 1 |
| `user_subscriptions` | User-to-plan assignments | 3 |
| `governance_policies` | Policy-based access rules | 2 |
| `feature_flags` | Feature-level access control | 2 |
| `teams` | Team definitions | 2 |
| `team_members` | Team membership | 0 |

---

## 2. Table Structures

### 2.1 users
```
id                  CHAR(32)        PRIMARY KEY
external_id         VARCHAR(255)    NOT NULL, UNIQUE
email               VARCHAR(255)    NOT NULL, UNIQUE
display_name        VARCHAR(255)
platform_role       VARCHAR(50)     NOT NULL (DEFAULT: 'user')
is_active           BOOLEAN
password_hash       VARCHAR(255)    NOT NULL
created_at          DATETIME
last_login_at       DATETIME
metadata            JSON
```

**Key Observations:**
- Roles stored as **strings** in `platform_role` column
- Single role per user (no many-to-many relationship)
- Roles are hardcoded: `admin`, `user`, `viewer`, `org_admin`

### 2.2 model_permissions
```
id              CHAR(32)        PRIMARY KEY
user_id         CHAR(32)        NOT NULL, INDEXED
model_id        VARCHAR(255)    NOT NULL
granted_by      CHAR(32)        NOT NULL
granted_at      DATETIME
expires_at      DATETIME        (nullable - supports time-based access)
is_active       BOOLEAN
revoked_by      CHAR(32)        (nullable)
revoked_at      DATETIME        (nullable)
notes           TEXT
```

**Key Observations:**
- User-level overrides for model access
- Supports expiration and revocation
- Currently **empty** (no user-level grants in use)
- Audit trail via `granted_by`, `revoked_by`

### 2.3 skill_assignments
```
id              CHAR(32)        PRIMARY KEY
user_id         CHAR(32)        NOT NULL, INDEXED
skill_id        VARCHAR(255)    NOT NULL
assigned_by     CHAR(32)        NOT NULL
assigned_at     DATETIME
expires_at      DATETIME        (nullable)
is_active       BOOLEAN
revoked_by      CHAR(32)        (nullable)
revoked_at      DATETIME        (nullable)
```

**Key Observations:**
- User-level overrides for skill access
- Supports expiration and revocation
- Currently **empty** (no user-level grants in use)

### 2.4 model_access_controls
```
model_id                VARCHAR(255)    PRIMARY KEY
allowed_roles           JSON            (array of role strings)
max_tokens_per_request  INTEGER         NOT NULL
enabled                 BOOLEAN         NOT NULL
rate_limit_per_minute   INTEGER         NOT NULL
created_at              DATETIME
updated_at              DATETIME
```

**Key Observations:**
- Role-based access control at model level
- Special value `"all"` grants access to all roles
- Combines access control with resource limits

---

## 3. Sample Data

### 3.1 Users (4 rows)

| email | platform_role | is_active |
|-------|---------------|-----------|
| admin@platform.local | admin | 1 |
| user@platform.local | user | 1 |
| viewer@platform.local | viewer | 1 |
| piskills@cxuhcig-kx63855.snowflakecomputing.com | admin | 1 |

### 3.2 model_access_controls (5 rows)

| model_id | allowed_roles | max_tokens | rate_limit |
|----------|---------------|------------|------------|
| claude-3-haiku-20240307 | ["all"] | 4096 | 120 |
| claude-3-5-sonnet-20241022 | ["admin"] | 4096 | 60 |
| gemini-1.5-pro | ["all"] | 4096 | 90 |
| gpt-4o | ["admin"] | 4096 | 90 |
| claude-3-opus | ["admin", "user"] | 8192 | 120 |

### 3.3 governance_policies (2 rows)

**Policy 1: default-token-guard**
- Type: `token_limit`
- Condition: `estimated_tokens > 4096`
- Action: Deny with reason

**Policy 2: admin-frontier-access**
- Type: `model_access`
- Condition: Model in frontier list AND user role NOT admin
- Action: Deny with reason

---

## 4. Access Control Logic (from permission_service.py)

### 4.1 Admin Bypass
```python
_ADMIN_ROLES = {"admin", "org_admin", "ORG_ADMIN"}

if platform_role in _ADMIN_ROLES:
    # Admins get ALL registered models
    # Admins get ALL enabled skills
```

### 4.2 Non-Admin Access
```python
else:
    # Check model_permissions table for explicit grants
    # Check skill_assignments table for explicit grants
    # Filter by is_active=True and not expired
```

### 4.3 Caching
- Permissions cached in Redis with key `perm:{user_id}`
- TTL controlled by `redis_perm_ttl` setting
- Cache invalidation via `invalidate_user_permissions()`

---

## 5. Final Classification: HYBRID (RBAC + UBAC)

### RBAC Components
✅ Role-based access via `model_access_controls.allowed_roles`  
✅ Roles stored in `users.platform_role`  
✅ Policy-based enforcement via `governance_policies`  

### UBAC Components
✅ User-level overrides via `model_permissions`  
✅ User-level overrides via `skill_assignments`  
✅ Expiration and revocation support  

### Hybrid Characteristics
- **Primary mechanism:** Admin bypass (RBAC)
- **Secondary mechanism:** User-level grants (UBAC)
- **Tertiary mechanism:** Policy-based rules (PBAC)
- **No formal role-permission mapping table**

---

## 6. Missing Components for Production-Ready Access Control

### ❌ Critical Missing Components

#### 6.1 Dedicated `roles` Table
**Current:** Roles are hardcoded strings (`admin`, `user`, `viewer`)  
**Problem:**
- No role metadata (description, permissions, hierarchy)
- Cannot dynamically create/manage roles
- No role inheritance or hierarchy

**Recommended Structure:**
```sql
CREATE TABLE roles (
    role_id VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 0,
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at DATETIME,
    updated_at DATETIME
);
```

#### 6.2 Dedicated `permissions` Table
**Current:** Permissions are implicit (model access, skill access)  
**Problem:**
- No centralized permission registry
- Cannot enumerate all permissions
- No permission metadata or grouping

**Recommended Structure:**
```sql
CREATE TABLE permissions (
    permission_id VARCHAR(100) PRIMARY KEY,
    resource_type VARCHAR(50) NOT NULL,  -- 'model', 'skill', 'api', 'admin'
    action VARCHAR(50) NOT NULL,         -- 'read', 'write', 'execute', 'manage'
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at DATETIME
);
```

#### 6.3 `role_permissions` Mapping Table
**Current:** No formal mapping between roles and permissions  
**Problem:**
- Permissions are scattered across multiple tables
- Cannot query "what can this role do?"
- No centralized permission management

**Recommended Structure:**
```sql
CREATE TABLE role_permissions (
    id CHAR(32) PRIMARY KEY,
    role_id VARCHAR(50) NOT NULL,
    permission_id VARCHAR(100) NOT NULL,
    granted_by CHAR(32) NOT NULL,
    granted_at DATETIME,
    UNIQUE(role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(role_id),
    FOREIGN KEY (permission_id) REFERENCES permissions(permission_id)
);
```

#### 6.4 `user_roles` Table (Many-to-Many)
**Current:** Users can only have ONE role (`users.platform_role`)  
**Problem:**
- Cannot assign multiple roles to a user
- No role composition (e.g., user + data_analyst)
- Inflexible for complex organizations

**Recommended Structure:**
```sql
CREATE TABLE user_roles (
    id CHAR(32) PRIMARY KEY,
    user_id CHAR(32) NOT NULL,
    role_id VARCHAR(50) NOT NULL,
    assigned_by CHAR(32) NOT NULL,
    assigned_at DATETIME,
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
);
```

### ⚠️ Recommended Enhancements

#### 6.5 Generic `resource_permissions` Table
**Current:** Separate tables for each resource type (`model_permissions`, `skill_assignments`)  
**Problem:**
- Adding new resource types requires new tables
- Inconsistent permission patterns
- Difficult to query cross-resource permissions

**Recommended Structure:**
```sql
CREATE TABLE resource_permissions (
    id CHAR(32) PRIMARY KEY,
    user_id CHAR(32) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,  -- 'model', 'skill', 'dataset', etc.
    resource_id VARCHAR(255) NOT NULL,
    permission_type VARCHAR(50) NOT NULL, -- 'read', 'write', 'execute'
    granted_by CHAR(32) NOT NULL,
    granted_at DATETIME,
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    revoked_by CHAR(32),
    revoked_at DATETIME,
    notes TEXT,
    UNIQUE(user_id, resource_type, resource_id, permission_type)
);
```

#### 6.6 Role Hierarchy Support
**Current:** Flat role structure  
**Recommendation:** Add role inheritance

```sql
CREATE TABLE role_hierarchy (
    parent_role_id VARCHAR(50) NOT NULL,
    child_role_id VARCHAR(50) NOT NULL,
    PRIMARY KEY (parent_role_id, child_role_id),
    FOREIGN KEY (parent_role_id) REFERENCES roles(role_id),
    FOREIGN KEY (child_role_id) REFERENCES roles(role_id)
);
```

#### 6.7 Permission Groups
**Current:** No permission grouping  
**Recommendation:** Add permission sets for easier management

```sql
CREATE TABLE permission_groups (
    group_id VARCHAR(100) PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at DATETIME
);

CREATE TABLE permission_group_members (
    group_id VARCHAR(100) NOT NULL,
    permission_id VARCHAR(100) NOT NULL,
    PRIMARY KEY (group_id, permission_id),
    FOREIGN KEY (group_id) REFERENCES permission_groups(group_id),
    FOREIGN KEY (permission_id) REFERENCES permissions(permission_id)
);
```

#### 6.8 Audit Trail Enhancements
**Current:** Basic audit in `audit_log` table  
**Recommendation:** Add permission-specific audit trail

```sql
CREATE TABLE permission_audit_log (
    id CHAR(32) PRIMARY KEY,
    user_id CHAR(32) NOT NULL,
    action VARCHAR(50) NOT NULL,  -- 'grant', 'revoke', 'check', 'deny'
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    permission_id VARCHAR(100),
    result VARCHAR(50),  -- 'allowed', 'denied'
    reason TEXT,
    performed_by CHAR(32),
    timestamp DATETIME,
    request_id CHAR(32)
);
```

---

## 7. Migration Path Recommendations

### Phase 1: Foundation (Week 1-2)
1. Create `roles` table and migrate existing roles
2. Create `permissions` table and enumerate all permissions
3. Create `role_permissions` mapping table
4. Backfill existing access patterns into new tables

### Phase 2: User Role Refactor (Week 3)
1. Create `user_roles` table
2. Migrate `users.platform_role` to `user_roles` table
3. Update `permission_service.py` to query `user_roles`
4. Deprecate `users.platform_role` (keep for backward compatibility)

### Phase 3: Resource Consolidation (Week 4)
1. Create generic `resource_permissions` table
2. Migrate `model_permissions` data
3. Migrate `skill_assignments` data
4. Update permission resolution logic

### Phase 4: Advanced Features (Week 5-6)
1. Implement role hierarchy
2. Add permission groups
3. Enhance audit logging
4. Add permission management UI

---

## 8. Code Changes Required

### 8.1 Update `permission_service.py`

**Current Logic:**
```python
if platform_role in _ADMIN_ROLES:
    # Admin bypass
else:
    # Check model_permissions and skill_assignments
```

**Recommended Logic:**
```python
async def resolve_user_permissions(user_id: str, db: AsyncSession) -> UserPermissions:
    # 1. Get all user roles (from user_roles table)
    user_roles = await get_user_roles(user_id, db)
    
    # 2. Get all permissions for those roles (from role_permissions)
    role_permissions = await get_role_permissions(user_roles, db)
    
    # 3. Get user-specific overrides (from resource_permissions)
    user_overrides = await get_user_overrides(user_id, db)
    
    # 4. Merge and return (user overrides take precedence)
    return merge_permissions(role_permissions, user_overrides)
```

### 8.2 Add Permission Checking Middleware

```python
async def check_permission(
    user_id: str,
    resource_type: str,
    resource_id: str,
    action: str,
    db: AsyncSession
) -> bool:
    """
    Generic permission checker
    
    Args:
        user_id: User ID
        resource_type: 'model', 'skill', 'api', etc.
        resource_id: Specific resource identifier
        action: 'read', 'write', 'execute', 'manage'
    
    Returns:
        True if user has permission, False otherwise
    """
    # Check user-specific permissions first
    # Then check role-based permissions
    # Then check policy-based rules
    # Cache the result
```

---

## 9. Summary

### Current State
- **Classification:** Hybrid (RBAC + UBAC)
- **Strengths:**
  - Admin bypass for simplified management
  - User-level overrides for flexibility
  - Expiration and revocation support
  - Redis caching for performance
  - Policy-based enforcement
  
- **Weaknesses:**
  - Hardcoded roles (no role table)
  - Implicit permissions (no permission table)
  - Single role per user
  - Resource-specific permission tables
  - No role hierarchy
  - No permission grouping

### Production Readiness Score: 6/10

**Missing for Production:**
1. ❌ Dedicated roles table
2. ❌ Dedicated permissions table
3. ❌ Role-permission mapping
4. ❌ Multi-role support per user
5. ⚠️ Generic resource permissions
6. ⚠️ Role hierarchy
7. ⚠️ Permission groups
8. ⚠️ Enhanced audit trail

### Recommended Next Steps
1. Create spec for access control refactoring
2. Implement Phase 1 (Foundation tables)
3. Update permission service logic
4. Add comprehensive tests
5. Migrate existing data
6. Deploy with backward compatibility
7. Deprecate old tables after validation

---

**End of Report**
