/*
 * AI Governance System - Snowflake DDL Scripts
 * Control plane tables for multi-model governance, token management, and subscription enforcement
 */

-- ============================================================
-- CONTEXT SETUP
-- ============================================================
USE ROLE SYSADMIN;
CREATE DATABASE IF NOT EXISTS GOVERNANCE_DB;
CREATE SCHEMA IF NOT EXISTS GOVERNANCE_DB.AI;
USE DATABASE GOVERNANCE_DB;
USE SCHEMA AI;

-- ============================================================
-- 1. AI MODEL REGISTRY
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_MODEL_REGISTRY (
  model_id VARCHAR(255) PRIMARY KEY,
  display_name VARCHAR(255) NOT NULL,
  provider VARCHAR(100) NOT NULL,
  max_tokens INT NOT NULL,
  cost_per_1k_tokens FLOAT NOT NULL DEFAULT 0.0,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  priority INT NOT NULL DEFAULT 0,
  tier VARCHAR(50) DEFAULT 'standard',
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- ============================================================
-- 2. AI SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_SUBSCRIPTIONS (
  plan_name VARCHAR(100) PRIMARY KEY,
  display_name VARCHAR(255) NOT NULL,
  monthly_token_limit INT NOT NULL,
  max_tokens_per_request INT NOT NULL DEFAULT 4096,
  allowed_models VARIANT NOT NULL DEFAULT '[]'::VARIANT,
  features VARIANT NOT NULL DEFAULT '[]'::VARIANT,
  priority VARCHAR(50) NOT NULL DEFAULT 'standard',
  rate_limit_per_minute INT NOT NULL DEFAULT 60,
  cost_budget_monthly FLOAT DEFAULT 0.0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- ============================================================
-- 3. AI USER MAPPING
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_USER_MAPPING (
  user_id VARCHAR(255) PRIMARY KEY,
  plan_name VARCHAR(100) NOT NULL,
  assigned_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  assigned_by VARCHAR(255),
  FOREIGN KEY (plan_name) REFERENCES AI_SUBSCRIPTIONS(plan_name)
);

-- ============================================================
-- 4. AI USER TOKENS (Monthly Tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_USER_TOKENS (
  user_id VARCHAR(255) NOT NULL,
  period VARCHAR(7) NOT NULL,
  tokens_used INT NOT NULL DEFAULT 0,
  tokens_limit INT NOT NULL,
  cost_accumulated FLOAT NOT NULL DEFAULT 0.0,
  last_reset TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (user_id, period)
);

-- ============================================================
-- 5. AI TOKEN USAGE LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_TOKEN_USAGE_LOG (
  log_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  model_id VARCHAR(255) NOT NULL,
  skill_id VARCHAR(255),
  tokens_used INT NOT NULL,
  cost FLOAT NOT NULL DEFAULT 0.0,
  request_id VARCHAR(255),
  latency_ms INT,
  outcome VARCHAR(50) NOT NULL DEFAULT 'SUCCESS',
  timestamp TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- ============================================================
-- 6. AI MODEL ACCESS CONTROL
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_MODEL_ACCESS_CONTROL (
  model_id VARCHAR(255) NOT NULL,
  allowed_roles VARIANT NOT NULL DEFAULT '[]'::VARIANT,
  max_tokens_per_request INT NOT NULL DEFAULT 4096,
  enabled BOOLEAN DEFAULT TRUE,
  rate_limit_per_minute INT DEFAULT 60,
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (model_id)
);

-- ============================================================
-- 7. AI FEATURE FLAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_FEATURE_FLAGS (
  feature_name VARCHAR(255) NOT NULL,
  model_id VARCHAR(255) NOT NULL,
  enabled_for VARIANT NOT NULL DEFAULT '[]'::VARIANT,
  enabled BOOLEAN DEFAULT TRUE,
  config VARIANT DEFAULT '{}'::VARIANT,
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (feature_name, model_id)
);
-- ============================================================
-- 7b. AI SKILL ACCESS CONTROL
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_SKILL_ACCESS_CONTROL (
  skill_id VARCHAR(255) NOT NULL,
  allowed_roles VARIANT NOT NULL DEFAULT '[]'::VARIANT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (skill_id)
);

-- ============================================================
-- 7c. AI ACCESS REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_ACCESS_REQUESTS (
  request_id VARCHAR(255) PRIMARY KEY,
  requester VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  reviewed_at TIMESTAMP_NTZ,
  reviewed_by VARCHAR(255),
  reason VARCHAR(1000),
  metadata VARIANT DEFAULT '{}'::VARIANT
);

-- ============================================================
-- 7d. AI ACCESS OVERRIDES
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_ACCESS_OVERRIDES (
  override_id VARCHAR(255) PRIMARY KEY,
  user_name VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  granted_by VARCHAR(255) NOT NULL,
  granted_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  expires_at TIMESTAMP_NTZ,
  is_active BOOLEAN DEFAULT TRUE,
  source_request_id VARCHAR(255)
);

-- ============================================================
-- 8. AI COST TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_COST_TRACKING (
  tracking_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  period VARCHAR(7) NOT NULL,
  model_id VARCHAR(255) NOT NULL,
  tokens_used INT NOT NULL,
  cost FLOAT NOT NULL,
  recorded_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- ============================================================
-- 9. AI GOVERNANCE AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS AI_GOVERNANCE_AUDIT (
  audit_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  details VARIANT DEFAULT '{}'::VARIANT,
  performed_by VARCHAR(255),
  timestamp TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- ============================================================
-- INDEXES
-- ============================================================
-- Snowflake does not support CREATE INDEX for standard tables.
-- If needed for acceleration, use Search Optimization Service per table:
-- ALTER TABLE AI_TOKEN_USAGE_LOG ADD SEARCH OPTIMIZATION ON EQUALITY(user_id, model_id);
-- ALTER TABLE AI_USER_TOKENS ADD SEARCH OPTIMIZATION ON EQUALITY(period);
-- ALTER TABLE AI_COST_TRACKING ADD SEARCH OPTIMIZATION ON EQUALITY(user_id, period);
-- ALTER TABLE AI_GOVERNANCE_AUDIT ADD SEARCH OPTIMIZATION ON EQUALITY(user_id);

