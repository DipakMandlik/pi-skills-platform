-- ============================================================
-- READY LOGIN FIX: PI_ORG_ADMIN
-- Purpose: Ensure Snowflake user can authenticate with role ORG_ADMIN
-- ============================================================
-- Run this in Snowflake worksheet as SECURITYADMIN.
-- If your warehouse is not COMPUTE_WH, update DEFAULT_WAREHOUSE value below.
-- ============================================================

USE ROLE SECURITYADMIN;

-- Ensure warehouses exist for default assignment
USE ROLE SYSADMIN;
CREATE WAREHOUSE IF NOT EXISTS COMPUTE_WH
  WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE;
USE ROLE SECURITYADMIN;

-- 1) Optional: set password once here before running
SET PI_ORG_ADMIN_PASSWORD = '<REPLACE_WITH_SECURE_PASSWORD>';

-- 2) Ensure platform role exists
CREATE ROLE IF NOT EXISTS ORG_ADMIN;

-- 3) Create/ensure user
CREATE USER IF NOT EXISTS PI_ORG_ADMIN
  PASSWORD = $PI_ORG_ADMIN_PASSWORD
  LOGIN_NAME = 'PI_ORG_ADMIN'
  DISPLAY_NAME = 'Platform Org Admin'
  FIRST_NAME = 'Platform'
  LAST_NAME = 'OrgAdmin'
  EMAIL = 'dipak.mandlik@pibythree.com'
  MUST_CHANGE_PASSWORD = TRUE
  DISABLED = FALSE;

-- 4) Critical grant for role-based login
GRANT ROLE ORG_ADMIN TO USER PI_ORG_ADMIN;

-- 5) Defaults used by login/session
ALTER USER PI_ORG_ADMIN SET
  DEFAULT_ROLE = 'ORG_ADMIN',
  DEFAULT_WAREHOUSE = 'COMPUTE_WH',
  MUST_CHANGE_PASSWORD = TRUE,
  DISABLED = FALSE;

-- 6) Verification
SHOW GRANTS TO USER PI_ORG_ADMIN;
DESC USER PI_ORG_ADMIN;

-- 7) Expected MCP login payload (role must match grant)
-- {
--   "account": "<your_snowflake_account_identifier>",
--   "username": "PI_ORG_ADMIN",
--   "password": "<REPLACE_WITH_SECURE_PASSWORD>",
--   "role": "ORG_ADMIN"
-- }
