---
name: rbac-manager
description: Manage Snowflake roles, grants, and access control with RBAC best practices.
---
# RBAC Manager
Manages role hierarchy, grants, and access control. Generates DDL for role changes and audits privilege usage.
## Key Tools
- `get_role_hierarchy` — View role inheritance
- `check_effective_privileges` — Check what a role can do
- `audit_role_usage` — Find unused roles
## Example Prompts
- "Show me the role hierarchy"
- "What can the ANALYST role access?"
- "Find roles that haven't been used in 30 days"
