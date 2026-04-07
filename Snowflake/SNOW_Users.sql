-- ============================================================
-- SNOWFLAKE USER BOOTSTRAP SCRIPT
-- AI-Powered Data Platform
-- ============================================================
-- Purpose:
--   1) Create bootstrap users for the 8 platform roles
--   2) Grant platform roles to those users
--   3) Set default role and default warehouse
--
-- Security model:
--   - Ready-to-run defaults for immediate bootstrap
--   - Change passwords after first successful login in non-dev environments
--
-- Execution order:
--   1) backend/sql/rbac_snowflake_ddl.sql
--   2) backend/sql/snowflake_governance_ddl.sql
--   3) backend/sql/snowflake_bootstrap_users.sql
--
-- Required privileges:
--   - SECURITYADMIN for user and role grants
--   - SYSADMIN or higher for warehouse visibility if needed
-- ============================================================

-- ============================================================
-- SECTION 0: ENVIRONMENT PLACEHOLDERS
-- ============================================================
-- Direct-run defaults:
-- DEFAULT warehouse: COMPUTE_WH
-- TRANSFORM warehouse: TRANSFORM_WH
-- Account email domain: pibythree.com
-- Password baseline: <REPLACE_WITH_SECURE_PASSWORD> (rotate after bootstrap)

-- Optional session setup (adjust role as needed)
USE ROLE SECURITYADMIN;

-- ============================================================
-- SECTION 1: ROLE PRECONDITIONS
-- ============================================================
-- Defensive creation in case role DDL was not run yet.
CREATE ROLE IF NOT EXISTS ORG_ADMIN;
CREATE ROLE IF NOT EXISTS SECURITY_ADMIN;
CREATE ROLE IF NOT EXISTS DATA_ENGINEER;
CREATE ROLE IF NOT EXISTS ANALYTICS_ENGINEER;
CREATE ROLE IF NOT EXISTS DATA_SCIENTIST;
CREATE ROLE IF NOT EXISTS BUSINESS_USER;
CREATE ROLE IF NOT EXISTS VIEWER;
CREATE ROLE IF NOT EXISTS SYSTEM_AGENT;

-- ============================================================
-- SECTION 2: USER CREATION
-- ============================================================
-- Naming convention: PI_<ROLE>
-- LOGIN_NAME and EMAIL are explicit for auth and auditing consistency.

CREATE USER IF NOT EXISTS PI_ORG_ADMIN
  PASSWORD = '<REPLACE_WITH_SECURE_PASSWORD>'
  LOGIN_NAME = 'PI_ORG_ADMIN'
  DISPLAY_NAME = 'Platform Org Admin'
  FIRST_NAME = 'Platform'
  LAST_NAME = 'OrgAdmin'
  EMAIL = 'dipak.mandlik@pibythree.com'
  MUST_CHANGE_PASSWORD = TRUE
  DISABLED = FALSE;

CREATE USER IF NOT EXISTS PI_SECURITY_ADMIN
  PASSWORD = '<REPLACE_WITH_SECURE_PASSWORD>'
  LOGIN_NAME = 'PI_SECURITY_ADMIN'
  DISPLAY_NAME = 'Platform Security Admin'
  FIRST_NAME = 'Platform'
  LAST_NAME = 'SecurityAdmin'
  EMAIL = 'pi_security_admin@pibythree.com'
  MUST_CHANGE_PASSWORD = TRUE
  DISABLED = FALSE;

CREATE USER IF NOT EXISTS PI_DATA_ENGINEER
  PASSWORD = '<REPLACE_WITH_SECURE_PASSWORD>'
  LOGIN_NAME = 'PI_DATA_ENGINEER'
  DISPLAY_NAME = 'Platform Data Engineer'
  FIRST_NAME = 'Platform'
  LAST_NAME = 'DataEngineer'
  EMAIL = 'pi_data_engineer@pibythree.com'
  MUST_CHANGE_PASSWORD = TRUE
  DISABLED = FALSE;

CREATE USER IF NOT EXISTS PI_ANALYTICS_ENGINEER
  PASSWORD = '<REPLACE_WITH_SECURE_PASSWORD>'
  LOGIN_NAME = 'PI_ANALYTICS_ENGINEER'
  DISPLAY_NAME = 'Platform Analytics Engineer'
  FIRST_NAME = 'Platform'
  LAST_NAME = 'AnalyticsEngineer'
  EMAIL = 'pi_analytics_engineer@pibythree.com'
  MUST_CHANGE_PASSWORD = TRUE
  DISABLED = FALSE;

CREATE USER IF NOT EXISTS PI_DATA_SCIENTIST
  PASSWORD = '<REPLACE_WITH_SECURE_PASSWORD>'
  LOGIN_NAME = 'PI_DATA_SCIENTIST'
  DISPLAY_NAME = 'Platform Data Scientist'
  FIRST_NAME = 'Platform'
  LAST_NAME = 'DataScientist'
  EMAIL = 'pi_data_scientist@pibythree.com'
  MUST_CHANGE_PASSWORD = TRUE
  DISABLED = FALSE;

CREATE USER IF NOT EXISTS PI_BUSINESS_USER
  PASSWORD = '<REPLACE_WITH_SECURE_PASSWORD>'
  LOGIN_NAME = 'PI_BUSINESS_USER'
  DISPLAY_NAME = 'Platform Business User'
  FIRST_NAME = 'Platform'
  LAST_NAME = 'BusinessUser'
  EMAIL = 'pi_business_user@pibythree.com'
  MUST_CHANGE_PASSWORD = TRUE
  DISABLED = FALSE;

CREATE USER IF NOT EXISTS PI_VIEWER
  PASSWORD = '<REPLACE_WITH_SECURE_PASSWORD>'
  LOGIN_NAME = 'PI_VIEWER'
  DISPLAY_NAME = 'Platform Viewer'
  FIRST_NAME = 'Platform'
  LAST_NAME = 'Viewer'
  EMAIL = 'pi_viewer@pibythree.com'
  MUST_CHANGE_PASSWORD = TRUE
  DISABLED = FALSE;

CREATE USER IF NOT EXISTS PI_SYSTEM_AGENT
  PASSWORD = '<REPLACE_WITH_SECURE_PASSWORD>'
  LOGIN_NAME = 'PI_SYSTEM_AGENT'
  DISPLAY_NAME = 'Platform System Agent'
  FIRST_NAME = 'Platform'
  LAST_NAME = 'SystemAgent'
  EMAIL = 'pi_system_agent@pibythree.com'
  MUST_CHANGE_PASSWORD = TRUE
  DISABLED = FALSE;

-- ============================================================
-- SECTION 3: ROLE GRANTS TO USERS
-- ============================================================
GRANT ROLE ORG_ADMIN TO USER PI_ORG_ADMIN;
GRANT ROLE SECURITY_ADMIN TO USER PI_SECURITY_ADMIN;
GRANT ROLE DATA_ENGINEER TO USER PI_DATA_ENGINEER;
GRANT ROLE ANALYTICS_ENGINEER TO USER PI_ANALYTICS_ENGINEER;
GRANT ROLE DATA_SCIENTIST TO USER PI_DATA_SCIENTIST;
GRANT ROLE BUSINESS_USER TO USER PI_BUSINESS_USER;
GRANT ROLE VIEWER TO USER PI_VIEWER;
GRANT ROLE SYSTEM_AGENT TO USER PI_SYSTEM_AGENT;

-- ============================================================
-- SECTION 4: DEFAULT ROLE + WAREHOUSE
-- ============================================================
-- Default warehouse strategy:
--   - ORG_ADMIN and SECURITY_ADMIN use __SF_DEFAULT_WAREHOUSE__
--   - Engineering/science personas can use __SF_TRANSFORM_WAREHOUSE__
--   - Business/Viewer personas use __SF_DEFAULT_WAREHOUSE__

ALTER USER PI_ORG_ADMIN SET
  DEFAULT_ROLE = 'ORG_ADMIN',
  DEFAULT_WAREHOUSE = 'COMPUTE_WH';

ALTER USER PI_SECURITY_ADMIN SET
  DEFAULT_ROLE = 'SECURITY_ADMIN',
  DEFAULT_WAREHOUSE = 'COMPUTE_WH';

ALTER USER PI_DATA_ENGINEER SET
  DEFAULT_ROLE = 'DATA_ENGINEER',
  DEFAULT_WAREHOUSE = 'TRANSFORM_WH';

ALTER USER PI_ANALYTICS_ENGINEER SET
  DEFAULT_ROLE = 'ANALYTICS_ENGINEER',
  DEFAULT_WAREHOUSE = 'TRANSFORM_WH';

ALTER USER PI_DATA_SCIENTIST SET
  DEFAULT_ROLE = 'DATA_SCIENTIST',
  DEFAULT_WAREHOUSE = 'TRANSFORM_WH';

ALTER USER PI_BUSINESS_USER SET
  DEFAULT_ROLE = 'BUSINESS_USER',
  DEFAULT_WAREHOUSE = 'COMPUTE_WH';

ALTER USER PI_VIEWER SET
  DEFAULT_ROLE = 'VIEWER',
  DEFAULT_WAREHOUSE = 'COMPUTE_WH';

ALTER USER PI_SYSTEM_AGENT SET
  DEFAULT_ROLE = 'SYSTEM_AGENT',
  DEFAULT_WAREHOUSE = 'COMPUTE_WH';

-- ============================================================
-- SECTION 5: HARDENING (enforced — users must change password)
-- ============================================================
ALTER USER PI_ORG_ADMIN       SET MUST_CHANGE_PASSWORD = TRUE;
ALTER USER PI_SECURITY_ADMIN  SET MUST_CHANGE_PASSWORD = TRUE;
ALTER USER PI_DATA_ENGINEER   SET MUST_CHANGE_PASSWORD = TRUE;
ALTER USER PI_ANALYTICS_ENGINEER SET MUST_CHANGE_PASSWORD = TRUE;
ALTER USER PI_DATA_SCIENTIST  SET MUST_CHANGE_PASSWORD = TRUE;
ALTER USER PI_BUSINESS_USER   SET MUST_CHANGE_PASSWORD = TRUE;
ALTER USER PI_VIEWER          SET MUST_CHANGE_PASSWORD = TRUE;
ALTER USER PI_SYSTEM_AGENT    SET MUST_CHANGE_PASSWORD = TRUE;

-- Optional key-pair migration placeholder:
-- ALTER USER PI_SYSTEM_AGENT SET RSA_PUBLIC_KEY = '__SF_SYSTEM_AGENT_RSA_PUBLIC_KEY__';

-- ============================================================
-- SECTION 6: VERIFICATION QUERIES
-- ============================================================
-- SHOW USERS LIKE 'PI_%';
-- SHOW GRANTS TO USER PI_ORG_ADMIN;
-- SHOW GRANTS TO USER PI_SECURITY_ADMIN;
-- SHOW GRANTS TO USER PI_DATA_ENGINEER;
-- SHOW GRANTS TO USER PI_ANALYTICS_ENGINEER;
-- SHOW GRANTS TO USER PI_DATA_SCIENTIST;
-- SHOW GRANTS TO USER PI_BUSINESS_USER;
-- SHOW GRANTS TO USER PI_VIEWER;
-- SHOW GRANTS TO USER PI_SYSTEM_AGENT;
