"""
Bug Condition Exploration Test for Token/Cost Enforcement

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.9, 1.10, 1.11, 1.13, 1.14, 1.15**

CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
DO NOT attempt to fix the test or the code when it fails.

This test encodes the expected behavior - it will validate the fix when it passes after implementation.

GOAL: Surface counterexamples that demonstrate requests execute without validation and usage is not tracked.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from apps.api.services.execution_guard import ExecutionGuard
from apps.api.models.domain import AuthUser, ModelResult, GuardDenied


class FakeSnowflakeService:
    """Mock Snowflake service for testing token/cost enforcement"""
    
    def __init__(self):
        self.user_tokens = {}
        self.usage_log = []
        self.subscriptions = {}
        self.plans = {
            "basic": {
                "monthly_token_limit": 10000,
                "max_tokens_per_request": 2048,
                "cost_budget_monthly": 50.0,
                "allowed_models": ["gpt-3.5-turbo", "claude-instant"]
            }
        }
    
    def set_user_usage(self, user_id: str, period: str, tokens_used: int, cost_accumulated: float):
        if user_id not in self.user_tokens:
            self.user_tokens[user_id] = {}
        self.user_tokens[user_id][period] = {
            "tokens_used": tokens_used,
            "cost_accumulated": cost_accumulated
        }
    
    def set_user_subscription(self, user_id: str, plan_name: str):
        self.subscriptions[user_id] = plan_name
    
    def get_user_usage(self, user_id: str, period: str):
        return self.user_tokens.get(user_id, {}).get(period, {
            "tokens_used": 0,
            "cost_accumulated": 0.0
        })
    
    def get_usage_log_count(self):
        return len(self.usage_log)


@pytest.fixture
def fake_snowflake():
    return FakeSnowflakeService()


@pytest.fixture
def mock_db():
    db = AsyncMock()
    result = MagicMock()
    model = MagicMock()
    model.is_available = True
    result.scalar_one_or_none.return_value = model
    db.execute.return_value = result
    return db


@pytest.fixture
def mock_settings():
    settings = MagicMock()
    settings.redis_model_ttl = 300
    settings.redis_rate_window = 60
    settings.max_requests_per_minute = 100
    settings.max_prompt_length = 10000
    return settings


@pytest.fixture
def mock_audit():
    return AsyncMock()


@pytest.fixture
def mock_model_adapter():
    adapter = AsyncMock()
    adapter.invoke.return_value = ModelResult(
        content="Test response",
        tokens_used=1000,
        model_id="gpt-3.5-turbo",
        finish_reason="end_turn"
    )
    return adapter


@pytest.fixture
def mock_snowflake_client():
    """Mock Snowflake client for testing."""
    client = MagicMock()
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


@pytest.fixture
def auth_user():
    return AuthUser(
        user_id="test_user",
        email="test@example.com",
        role="USER",
        display_name="Test User",
        request_id="req-123"
    )


@pytest.mark.asyncio
async def test_bug_token_limit_not_enforced(execution_guard, auth_user, fake_snowflake):
    """
    Test that requests execute without token limit validation
    
    User at 9,500/10,000 tokens submits 1,000 token request → should block but doesn't
    
    **Validates: Requirements 1.1, 1.13**
    """
    fake_snowflake.set_user_subscription("test_user", "basic")
    fake_snowflake.set_user_usage("test_user", "2024-01", 9500, 10.0)
    
    with patch('apps.api.services.execution_guard.cache_get', new_callable=AsyncMock) as mock_cache_get, \
         patch('apps.api.services.execution_guard.cache_set', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.cache_incr', new_callable=AsyncMock) as mock_cache_incr, \
         patch('apps.api.services.execution_guard.cache_expire', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.resolve_user_permissions') as mock_perms:
        
        mock_cache_get.return_value = None
        mock_cache_incr.return_value = 1
        mock_perms.return_value = MagicMock(
            allowed_skills=["test-skill"],
            allowed_models=["gpt-3.5-turbo"]
        )
        
        try:
            result = await execution_guard.execute(
                user=auth_user,
                skill_id="test-skill",
                model_id="gpt-3.5-turbo",
                prompt="Test prompt",
                max_tokens=1000
            )
            
            pytest.fail(
                "BUG CONFIRMED: Request executed without token limit validation. "
                f"User at 9,500/10,000 tokens submitted 1,000 token request and it was not blocked."
            )
        except GuardDenied as e:
            assert e.reason == "MONTHLY_TOKEN_LIMIT_EXCEEDED" or "token limit" in e.message.lower()


@pytest.mark.asyncio
async def test_bug_cost_limit_not_enforced(execution_guard, auth_user, fake_snowflake, mock_model_adapter):
    """
    Test that requests execute without cost limit validation
    
    User at $48/$50 budget submits $5 request → should block but doesn't
    
    **Validates: Requirements 1.2, 1.14**
    """
    fake_snowflake.set_user_subscription("test_user", "basic")
    fake_snowflake.set_user_usage("test_user", "2024-01", 5000, 48.0)
    
    mock_model_adapter.invoke.return_value = ModelResult(
        content="Test response",
        tokens_used=2500,
        model_id="gpt-4",
        finish_reason="end_turn"
    )
    
    with patch('apps.api.services.execution_guard.cache_get', new_callable=AsyncMock) as mock_cache_get, \
         patch('apps.api.services.execution_guard.cache_set', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.cache_incr', new_callable=AsyncMock) as mock_cache_incr, \
         patch('apps.api.services.execution_guard.cache_expire', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.resolve_user_permissions') as mock_perms:
        
        mock_cache_get.return_value = None
        mock_cache_incr.return_value = 1
        mock_perms.return_value = MagicMock(
            allowed_skills=["test-skill"],
            allowed_models=["gpt-4"]
        )
        
        try:
            result = await execution_guard.execute(
                user=auth_user,
                skill_id="test-skill",
                model_id="gpt-4",
                prompt="Test prompt",
                max_tokens=2000
            )
            
            pytest.fail(
                "BUG CONFIRMED: Request executed without cost limit validation. "
                f"User at $48/$50 budget submitted request estimated at $5+ and it was not blocked."
            )
        except GuardDenied as e:
            assert e.reason == "MONTHLY_COST_LIMIT_EXCEEDED" or "cost limit" in e.message.lower()


@pytest.mark.asyncio
async def test_bug_per_request_limit_not_enforced(execution_guard, auth_user, fake_snowflake):
    """
    Test that requests execute without per-request limit validation
    
    User submits 4096 token request on 2048 limit plan → should block but doesn't
    
    **Validates: Requirements 1.4, 1.15**
    """
    fake_snowflake.set_user_subscription("test_user", "basic")
    fake_snowflake.set_user_usage("test_user", "2024-01", 1000, 5.0)
    
    with patch('apps.api.services.execution_guard.cache_get', new_callable=AsyncMock) as mock_cache_get, \
         patch('apps.api.services.execution_guard.cache_set', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.cache_incr', new_callable=AsyncMock) as mock_cache_incr, \
         patch('apps.api.services.execution_guard.cache_expire', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.resolve_user_permissions') as mock_perms:
        
        mock_cache_get.return_value = None
        mock_cache_incr.return_value = 1
        mock_perms.return_value = MagicMock(
            allowed_skills=["test-skill"],
            allowed_models=["gpt-3.5-turbo"]
        )
        
        try:
            result = await execution_guard.execute(
                user=auth_user,
                skill_id="test-skill",
                model_id="gpt-3.5-turbo",
                prompt="Test prompt",
                max_tokens=4096
            )
            
            pytest.fail(
                "BUG CONFIRMED: Request executed without per-request limit validation. "
                f"User on basic plan (2048 max) submitted 4096 token request and it was not blocked."
            )
        except GuardDenied as e:
            assert e.reason == "PER_REQUEST_TOKEN_LIMIT_EXCEEDED" or "per-request" in e.message.lower()


@pytest.mark.asyncio
async def test_bug_model_access_not_enforced(execution_guard, auth_user, fake_snowflake):
    """
    Test that requests execute without model access validation
    
    User on "basic" plan requests "gpt-4" → should block but doesn't
    
    **Validates: Requirements 1.3**
    """
    fake_snowflake.set_user_subscription("test_user", "basic")
    fake_snowflake.set_user_usage("test_user", "2024-01", 1000, 5.0)
    
    with patch('apps.api.services.execution_guard.cache_get', new_callable=AsyncMock) as mock_cache_get, \
         patch('apps.api.services.execution_guard.cache_set', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.cache_incr', new_callable=AsyncMock) as mock_cache_incr, \
         patch('apps.api.services.execution_guard.cache_expire', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.resolve_user_permissions') as mock_perms:
        
        mock_cache_get.return_value = None
        mock_cache_incr.return_value = 1
        mock_perms.return_value = MagicMock(
            allowed_skills=["test-skill"],
            allowed_models=["gpt-4"]
        )
        
        try:
            result = await execution_guard.execute(
                user=auth_user,
                skill_id="test-skill",
                model_id="gpt-4",
                prompt="Test prompt",
                max_tokens=1000
            )
            
            pytest.fail(
                "BUG CONFIRMED: Request executed without subscription plan model access validation. "
                f"User on basic plan requested gpt-4 (not in plan) and it was not blocked."
            )
        except GuardDenied as e:
            assert e.reason == "MODEL_NOT_IN_SUBSCRIPTION" or "subscription" in e.message.lower()


@pytest.mark.asyncio
async def test_bug_usage_not_tracked(execution_guard, auth_user, fake_snowflake):
    """
    Test that AI_USER_TOKENS is not updated after execution
    
    Tokens_used and cost_accumulated remain unchanged after request
    
    **Validates: Requirements 1.9, 1.10**
    """
    fake_snowflake.set_user_subscription("test_user", "basic")
    fake_snowflake.set_user_usage("test_user", "2024-01", 1000, 5.0)
    
    initial_tokens = fake_snowflake.get_user_usage("test_user", "2024-01")["tokens_used"]
    initial_cost = fake_snowflake.get_user_usage("test_user", "2024-01")["cost_accumulated"]
    
    with patch('apps.api.services.execution_guard.cache_get', new_callable=AsyncMock) as mock_cache_get, \
         patch('apps.api.services.execution_guard.cache_set', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.cache_incr', new_callable=AsyncMock) as mock_cache_incr, \
         patch('apps.api.services.execution_guard.cache_expire', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.resolve_user_permissions') as mock_perms:
        
        mock_cache_get.return_value = None
        mock_cache_incr.return_value = 1
        mock_perms.return_value = MagicMock(
            allowed_skills=["test-skill"],
            allowed_models=["gpt-3.5-turbo"]
        )
        
        result = await execution_guard.execute(
            user=auth_user,
            skill_id="test-skill",
            model_id="gpt-3.5-turbo",
            prompt="Test prompt",
            max_tokens=500
        )
        
        final_tokens = fake_snowflake.get_user_usage("test_user", "2024-01")["tokens_used"]
        final_cost = fake_snowflake.get_user_usage("test_user", "2024-01")["cost_accumulated"]
        
        if final_tokens == initial_tokens and final_cost == initial_cost:
            pytest.fail(
                "BUG CONFIRMED: AI_USER_TOKENS not updated after execution. "
                f"Initial: {initial_tokens} tokens, ${initial_cost}. "
                f"Final: {final_tokens} tokens, ${final_cost}. "
                f"Request used {result.tokens_used} tokens but usage was not tracked."
            )


@pytest.mark.asyncio
async def test_bug_usage_log_not_created(execution_guard, auth_user, fake_snowflake):
    """
    Test that AI_TOKEN_USAGE_LOG has no records after execution
    
    **Validates: Requirements 1.11**
    """
    fake_snowflake.set_user_subscription("test_user", "basic")
    fake_snowflake.set_user_usage("test_user", "2024-01", 1000, 5.0)
    
    initial_log_count = fake_snowflake.get_usage_log_count()
    
    with patch('apps.api.services.execution_guard.cache_get', new_callable=AsyncMock) as mock_cache_get, \
         patch('apps.api.services.execution_guard.cache_set', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.cache_incr', new_callable=AsyncMock) as mock_cache_incr, \
         patch('apps.api.services.execution_guard.cache_expire', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.resolve_user_permissions') as mock_perms:
        
        mock_cache_get.return_value = None
        mock_cache_incr.return_value = 1
        mock_perms.return_value = MagicMock(
            allowed_skills=["test-skill"],
            allowed_models=["gpt-3.5-turbo"]
        )
        
        result = await execution_guard.execute(
            user=auth_user,
            skill_id="test-skill",
            model_id="gpt-3.5-turbo",
            prompt="Test prompt",
            max_tokens=500
        )
        
        final_log_count = fake_snowflake.get_usage_log_count()
        
        if final_log_count == initial_log_count:
            pytest.fail(
                "BUG CONFIRMED: AI_TOKEN_USAGE_LOG not updated after execution. "
                f"Initial log count: {initial_log_count}. "
                f"Final log count: {final_log_count}. "
                f"Request completed successfully but no usage log entry was created."
            )



@pytest.mark.asyncio
async def test_failure_tracking_with_failed_invocation(execution_guard, auth_user, fake_snowflake, mock_model_adapter):
    """
    Test that failed requests are still logged to AI_TOKEN_USAGE_LOG with outcome="FAILED"
    
    When model invocation fails (exception raised), the system should:
    1. Catch the exception
    2. Log to AI_TOKEN_USAGE_LOG with outcome="FAILED" and estimated tokens
    3. Re-raise the exception to preserve error handling
    
    **Validates: Requirements 2.12**
    """
    fake_snowflake.set_user_subscription("test_user", "basic")
    fake_snowflake.set_user_usage("test_user", "2024-01", 1000, 5.0)
    
    # Make model adapter raise an exception to simulate failure
    from apps.api.models.domain import ModelInvocationError
    mock_model_adapter.invoke.side_effect = ModelInvocationError("Model timeout")
    
    # Track if _log_token_usage was called
    log_calls = []
    
    async def mock_log_token_usage(*args, **kwargs):
        log_calls.append(kwargs)
    
    with patch('apps.api.services.execution_guard.cache_get', new_callable=AsyncMock) as mock_cache_get, \
         patch('apps.api.services.execution_guard.cache_set', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.cache_incr', new_callable=AsyncMock) as mock_cache_incr, \
         patch('apps.api.services.execution_guard.cache_expire', new_callable=AsyncMock), \
         patch('apps.api.services.execution_guard.resolve_user_permissions') as mock_perms:
        
        mock_cache_get.return_value = None
        mock_cache_incr.return_value = 1
        mock_perms.return_value = MagicMock(
            allowed_skills=["test-skill"],
            allowed_models=["gpt-3.5-turbo"]
        )
        
        # Patch _log_token_usage to track calls
        execution_guard._log_token_usage = mock_log_token_usage
        
        # Execute should raise the original exception
        with pytest.raises(ModelInvocationError) as exc_info:
            await execution_guard.execute(
                user=auth_user,
                skill_id="test-skill",
                model_id="gpt-3.5-turbo",
                prompt="Test prompt that will fail",
                max_tokens=500
            )
        
        # Verify the exception was re-raised
        assert "Model timeout" in str(exc_info.value)
        
        # Verify that _log_token_usage was called with outcome="FAILED"
        assert len(log_calls) == 1, f"Expected 1 log call, got {len(log_calls)}"
        
        log_call = log_calls[0]
        assert log_call['outcome'] == "FAILED", f"Expected outcome='FAILED', got {log_call['outcome']}"
        assert log_call['user_id'] == "test_user"
        assert log_call['model_id'] == "gpt-3.5-turbo"
        assert log_call['input_tokens'] > 0, "Expected estimated input tokens > 0"
        assert log_call['output_tokens'] == 0, "Expected output tokens = 0 for failed request"
        assert log_call['total_tokens'] > 0, "Expected total tokens > 0"
