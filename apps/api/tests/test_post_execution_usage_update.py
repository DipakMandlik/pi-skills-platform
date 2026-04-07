"""
Test for Task 3.9: Post-Execution Usage Update

This test verifies that AI_USER_TOKENS is updated after successful model invocation.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from apps.api.services.execution_guard import ExecutionGuard
from apps.api.models.domain import AuthUser, ModelResult


@pytest.mark.asyncio
async def test_post_execution_usage_update():
    """
    Test that AI_USER_TOKENS is updated after successful execution.
    
    This test verifies task 3.9 implementation:
    - Extract input_tokens and output_tokens from ModelResult
    - Calculate total_tokens and actual cost
    - Update AI_USER_TOKENS via Snowflake MERGE statement
    """
    # Setup mocks
    mock_settings = MagicMock()
    mock_settings.redis_model_ttl = 300
    mock_settings.redis_rate_window = 60
    mock_settings.max_requests_per_minute = 100
    mock_settings.max_prompt_length = 10000
    
    mock_db = AsyncMock()
    result = MagicMock()
    model = MagicMock()
    model.is_available = True
    result.scalar_one_or_none.return_value = model
    mock_db.execute.return_value = result
    
    mock_audit = AsyncMock()
    
    # Mock model adapter to return result with input/output tokens
    mock_model_adapter = AsyncMock()
    mock_model_adapter.invoke.return_value = ModelResult(
        content="Test response",
        tokens_used=150,  # Total tokens
        input_tokens=100,  # Input tokens
        output_tokens=50,  # Output tokens
        model_id="gpt-3.5-turbo",
        finish_reason="end_turn"
    )
    
    # Mock Snowflake client
    mock_snowflake = MagicMock()  # Use MagicMock instead of AsyncMock for sync methods
    
    # Add _parse_variant method (synchronous)
    def parse_variant(value):
        if value is None:
            return []
        if isinstance(value, (list, dict)):
            return value
        if isinstance(value, str):
            try:
                import json
                return json.loads(value)
            except Exception:
                return [value]
        return [value]
    
    mock_snowflake._parse_variant = parse_variant
    
    # Track Snowflake calls
    snowflake_calls = []
    
    def track_query(query, params=None):
        snowflake_calls.append({"query": query, "params": params})
        # Return subscription data
        if "AI_USER_MAPPING" in query:
            return [{"PLAN_NAME": "basic"}]
        elif "AI_SUBSCRIPTIONS" in query:
            return [{
                "PLAN_NAME": "basic",
                "MONTHLY_TOKEN_LIMIT": 10000,
                "MAX_TOKENS_PER_REQUEST": 2048,
                "ALLOWED_MODELS": '["gpt-3.5-turbo"]',
                "COST_BUDGET_MONTHLY": 50.0
            }]
        elif "AI_USER_TOKENS" in query and "SELECT" in query:
            # Return current usage (low enough to pass validation)
            return [{
                "TOKENS_USED": 100,
                "COST_ACCUMULATED": 1.0
            }]
        elif "AI_MODEL_REGISTRY" in query:
            # Return model pricing
            return [{
                "INPUT_COST_PER_1K": 0.001,
                "OUTPUT_COST_PER_1K": 0.002,
                "COST_PER_1K_TOKENS": None
            }]
        return []
    
    def track_execute(query, params=None):
        snowflake_calls.append({"query": query, "params": params, "type": "execute"})
        return {"query_id": "test-query-id", "columns": [], "rows": [], "row_count": 0}
    
    mock_snowflake._query_rows_sync = MagicMock(side_effect=track_query)
    mock_snowflake._execute_query_sync = MagicMock(side_effect=track_execute)
    
    # Create ExecutionGuard
    guard = ExecutionGuard(
        settings=mock_settings,
        db=mock_db,
        model_adapter=mock_model_adapter,
        audit=mock_audit,
        snowflake_client=mock_snowflake
    )
    
    # Create auth user
    auth_user = AuthUser(
        user_id="test_user",
        email="test@example.com",
        role="USER",
        display_name="Test User",
        request_id="req-123"
    )
    
    # Execute request with mocked cache and permissions
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
        
        # Execute the request
        result = await guard.execute(
            user=auth_user,
            skill_id="test-skill",
            model_id="gpt-3.5-turbo",
            prompt="Test prompt",
            max_tokens=100
        )
        
        # Verify result
        assert result.content == "Test response"
        assert result.input_tokens == 100
        assert result.output_tokens == 50
        assert result.tokens_used == 150
        
        # Verify that MERGE statement was called for AI_USER_TOKENS update
        merge_calls = [call for call in snowflake_calls if call.get("type") == "execute" and "MERGE" in call["query"]]
        assert len(merge_calls) > 0, "MERGE statement should have been called to update AI_USER_TOKENS"
        
        merge_call = merge_calls[0]
        assert "AI_USER_TOKENS" in merge_call["query"], "MERGE should target AI_USER_TOKENS table"
        assert "tokens_used" in merge_call["query"].lower(), "MERGE should update tokens_used"
        assert "cost_accumulated" in merge_call["query"].lower(), "MERGE should update cost_accumulated"
        
        # Verify the parameters include the token count and cost
        params = merge_call["params"]
        assert params is not None, "MERGE should have parameters"
        # The params should include: user_id, period (twice for USING and INSERT), tokens_used, cost
        # Expected structure: (user_id, period, tokens_used, cost, user_id, period, tokens_used, cost, tokens_limit)
        assert 150 in params, f"Total tokens (150) should be in MERGE params, got: {params}"
        
        # Verify that INSERT statement was called for AI_TOKEN_USAGE_LOG
        insert_calls = [call for call in snowflake_calls if call.get("type") == "execute" and "INSERT" in call["query"] and "AI_TOKEN_USAGE_LOG" in call["query"]]
        assert len(insert_calls) > 0, "INSERT statement should have been called to log usage to AI_TOKEN_USAGE_LOG"
        
        insert_call = insert_calls[0]
        assert "AI_TOKEN_USAGE_LOG" in insert_call["query"], "INSERT should target AI_TOKEN_USAGE_LOG table"
        assert "log_id" in insert_call["query"].lower(), "INSERT should include log_id"
        assert "input_tokens" in insert_call["query"].lower(), "INSERT should include input_tokens"
        assert "output_tokens" in insert_call["query"].lower(), "INSERT should include output_tokens"
        assert "total_tokens" in insert_call["query"].lower(), "INSERT should include total_tokens"
        assert "cost" in insert_call["query"].lower(), "INSERT should include cost"
        assert "outcome" in insert_call["query"].lower(), "INSERT should include outcome"
        assert "latency_ms" in insert_call["query"].lower(), "INSERT should include latency_ms"
        
        # Verify the parameters include all required fields
        log_params = insert_call["params"]
        assert log_params is not None, "INSERT should have parameters"
        # Expected structure: (log_id, user_id, model_id, skill_id, request_id, input_tokens, output_tokens, total_tokens, cost, outcome, latency_ms)
        assert 100 in log_params, f"Input tokens (100) should be in INSERT params, got: {log_params}"
        assert 50 in log_params, f"Output tokens (50) should be in INSERT params, got: {log_params}"
        assert 150 in log_params, f"Total tokens (150) should be in INSERT params, got: {log_params}"
        assert "SUCCESS" in log_params, f"Outcome (SUCCESS) should be in INSERT params, got: {log_params}"
        
        print(f"✓ Post-execution usage update working correctly")
        print(f"✓ MERGE statement called with tokens={150}")
        print(f"✓ Snowflake client received update request")
        print(f"✓ INSERT statement called for AI_TOKEN_USAGE_LOG")
        print(f"✓ Usage log includes all required fields (log_id, input_tokens, output_tokens, cost, outcome, latency_ms)")



if __name__ == "__main__":
    pytest.main([__file__, "-v"])
