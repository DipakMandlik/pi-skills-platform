-- ============================================================
-- MASTER RUNNER: FULL SNOWFLAKE SETUP (READY)
-- ============================================================
-- Run in SnowSQL/CLI using:
--   snowsql -f backend/sql/snowflake_full_setup_ready.sql
--
-- If running in Snowsight worksheet, execute the 4 files in this order:
--   1) backend/sql/rbac_snowflake_ddl.sql
--   2) backend/sql/snowflake_governance_ddl.sql
--   3) backend/sql/snowflake_bootstrap_users.sql
--   4) backend/sql/snowflake_admin_login_ready.sql
-- ============================================================

!source backend/sql/rbac_snowflake_ddl.sql
!source backend/sql/snowflake_governance_ddl.sql
!source backend/sql/snowflake_bootstrap_users.sql
!source backend/sql/snowflake_admin_login_ready.sql

-- Post-run verification
SHOW ROLES;
SHOW USERS LIKE 'PI_%';
SHOW GRANTS TO USER PI_ORG_ADMIN;
