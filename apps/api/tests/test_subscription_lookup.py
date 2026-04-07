"""
Unit tests for subscription plan lookup functionality

Tests the _get_user_subscription method in ExecutionGuard
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from apps.api.services.execution_guard import ExecutionGuard
from apps.api.models.domain import GuardDenied


@pytest.fixture
def mock_settings():
    settings = MagicMock()
    settings.redis_model_ttl = 300
    settings.redis_rate_window = 60
    settings.max_requests_per_minute = 100
    settings.max_prompt_length = 10000
    return settings


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def mock_model_adapter():
    return AsyncMock()


@pytest.fixture
def mock_audit():
    return AsyncMock()


@pytest.fixture
def mock_snowflake_client():
    """Mock Snowflake client for testing."""
    client = MagicMock()
    
    def query_rows_sync(query, params=None):
        # Mock AI_USER_MAPPING query
        if "AI_USER_MAPPING" in query:
            if params and params[0] == "user_with_plan":
                return [{"PLAN_NAME": "premium"}]
            elif params and params[0] == "user_without_plan":
                return []
            return []
        
        # Mock AI_SUBSCRIPTIONS query
        if "AI_SUBSCRIPTIONS" in query:
            if params and params[0] == "premium":
                return [{
                    "PLAN_NAME": "premium",
                    "MONTHLY_TOKEN_LIMIT": 100000,
                    "MAX_TOKENS_PER_REQUEST": 8192,
                    "ALLOWED_MODELS": '["gpt-4", "gpt-3.5-turbo", "claude-2"]',
                    "COST_BUDGET_MONTHLY": 500.0
                }]
            elif params and params[0] == "nonexistent":
                return []
        
        return []
    
    def parse_variant(value):
        if value is None:
            return []
        if isinstance(value, str):
            import json
            try:
                return json.loads(value)
            except:
                return [value]
        return value
    
    client._query_rows_sync = query_rows_sync
    client._parse_variant = parse_variant
    
    return client


@pytest.fixture
def execution_guard(mock_settings, mock_db, mock_model_adapter, mock_audit, mock_snowflake_client):
    return ExecutionGuard(
        settings=mock_settings,
        db=mock_db,
        model_adapter=mock_model_adapter,
        audit=mock_audit,
        snowflake_client=mock_snowflake_client
    )


@pytest.mark.asyncio
async def test_get_user_subscription_with_valid_plan(execution_guard):
    """Test retrieving subscription for user with valid plan"""
    with patch('apps.api.services.execution_guard.cache_get', new_callable=AsyncMock) as mock_cache_get, \
         patch('apps.api.services.execution_guard.cache_set', new_callable=AsyncMock) as mock_cache_set:
        
        mock_cache_get.return_value = None
        
        subscription = await execution_guard._get_user_subscription("user_with_plan")
        
        assert subscription["plan_name"] == "premium"
        assert subscription["monthly_token_limit"] == 100000
        assert subscription["max_tokens_per_request"] == 8192
        assert "gpt-4" in subscription["allowed_models"]
        assert subscription["cost_budget_monthly"] == 500.0
        
        # Verify caching was called
        mock_cache_set.assert_called_once()
        cache_key, cached_data, ttl = mock_cache_set.call_args[0]
        assert cache_key == "subscription:user_with_plan"
        assert ttl == 300


@pytest.mark.asyncio
async def test_get_user_subscription_returns_default_for_unmapped_user(execution_guard):
    """Test that unmapped users get default 'free' plan"""
    with patch('apps.api.services.execution_guard.cache_get', new_callable=AsyncMock) as mock_cache_get, \
         patch('apps.api.services.execution_guard.cache_set', new_callable=AsyncMock) as mock_cache_set:
        
        mock_cache_get.return_value = None
        
        subscription = await execution_guard._get_user_subscription("user_without_plan")
        
        assert subscription["plan_name"] == "free"
        assert subscription["monthly_token_limit"] == 10000
        assert subscription["max_tokens_per_request"] == 2048
        assert subscription["allowed_models"] == ["gpt-3.5-turbo"]
        assert subscription["cost_budget_monthly"] == 10.0
        
        # Verify caching was called
        mock_cache_set.assert_called_once()


@pytest.mark.asyncio
async def test_get_user_subscription_uses_cache(execution_guard):
    """Test that cached subscription data is returned"""
    cached_subscription = {
        "plan_name": "cached_plan",
        "monthly_token_limit": 50000,
        "max_tokens_per_request": 4096,
        "allowed_models": ["gpt-3.5-turbo"],
        "cost_budget_monthly": 100.0
    }
    
    with patch('apps.api.services.execution_guard.cache_get', new_callable=AsyncMock) as mock_cache_get, \
         patch('apps.api.services.execution_guard.cache_set', new_callable=AsyncMock) as mock_cache_set:
        
        mock_cache_get.return_value = cached_subscription
        
        subscription = await execution_guard._get_user_subscription("cached_user")
        
        assert subscription == cached_subscription
        
        # Verify cache_set was NOT called (used cached data)
        mock_cache_set.assert_not_called()


@pytest.mark.asyncio
async def test_get_user_subscription_raises_error_for_missing_plan(execution_guard):
    """Test that GuardDenied is raised when plan doesn't exist in AI_SUBSCRIPTIONS"""
    
    # Mock a user with a plan that doesn't exist
    def query_rows_sync(query, params=None):
        if "AI_USER_MAPPING" in query:
            return [{"PLAN_NAME": "nonexistent"}]
        if "AI_SUBSCRIPTIONS" in query:
            return []
        return []
    
    execution_guard.sf_client._query_rows_sync = query_rows_sync
    
    with patch('apps.api.services.execution_guard.cache_get', new_callable=AsyncMock) as mock_cache_get:
        mock_cache_get.return_value = None
        
        with pytest.raises(GuardDenied) as exc_info:
            await execution_guard._get_user_subscription("user_with_missing_plan")
        
        assert exc_info.value.reason == "SUBSCRIPTION_PLAN_NOT_FOUND"
        assert "nonexistent" in exc_info.value.message
