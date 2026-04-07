"""
Unit tests for ExecutionGuard._get_current_usage method

Tests the current usage lookup function that queries AI_USER_TOKENS.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from apps.api.services.execution_guard import ExecutionGuard


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
    client._query_rows_sync = MagicMock()
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
async def test_get_current_usage_with_existing_record(execution_guard, mock_snowflake_client):
    """Test _get_current_usage returns existing usage data"""
    # Mock Snowflake response with existing usage
    mock_snowflake_client._query_rows_sync.return_value = [
        {
            "TOKENS_USED": 5000,
            "COST_ACCUMULATED": 12.50
        }
    ]
    
    result = await execution_guard._get_current_usage("test_user", "2024-01")
    
    assert result["tokens_used"] == 5000
    assert result["cost_accumulated"] == 12.50
    
    # Verify query was called with correct parameters
    mock_snowflake_client._query_rows_sync.assert_called_once()
    call_args = mock_snowflake_client._query_rows_sync.call_args
    assert "AI_USER_TOKENS" in call_args[0][0]
    assert call_args[0][1] == ("test_user", "2024-01")


@pytest.mark.asyncio
async def test_get_current_usage_with_no_record(execution_guard, mock_snowflake_client):
    """Test _get_current_usage initializes with zeros when no record exists"""
    # Mock Snowflake response with no records
    mock_snowflake_client._query_rows_sync.return_value = []
    
    result = await execution_guard._get_current_usage("new_user", "2024-01")
    
    assert result["tokens_used"] == 0
    assert result["cost_accumulated"] == 0.0


@pytest.mark.asyncio
async def test_get_current_usage_with_lowercase_columns(execution_guard, mock_snowflake_client):
    """Test _get_current_usage handles lowercase column names"""
    # Mock Snowflake response with lowercase column names
    mock_snowflake_client._query_rows_sync.return_value = [
        {
            "tokens_used": 3000,
            "cost_accumulated": 7.25
        }
    ]
    
    result = await execution_guard._get_current_usage("test_user", "2024-02")
    
    assert result["tokens_used"] == 3000
    assert result["cost_accumulated"] == 7.25


@pytest.mark.asyncio
async def test_get_current_usage_with_error(execution_guard, mock_snowflake_client):
    """Test _get_current_usage returns zeros on error (fail-open)"""
    # Mock Snowflake error
    mock_snowflake_client._query_rows_sync.side_effect = Exception("Database connection failed")
    
    result = await execution_guard._get_current_usage("test_user", "2024-01")
    
    # Should return zeros to allow request to proceed (fail-open)
    assert result["tokens_used"] == 0
    assert result["cost_accumulated"] == 0.0


@pytest.mark.asyncio
async def test_get_current_usage_period_format(execution_guard, mock_snowflake_client):
    """Test _get_current_usage accepts YYYY-MM period format"""
    mock_snowflake_client._query_rows_sync.return_value = [
        {
            "TOKENS_USED": 1234,
            "COST_ACCUMULATED": 5.67
        }
    ]
    
    # Test various period formats
    result = await execution_guard._get_current_usage("test_user", "2024-12")
    assert result["tokens_used"] == 1234
    
    # Verify the period was passed correctly
    call_args = mock_snowflake_client._query_rows_sync.call_args
    assert call_args[0][1] == ("test_user", "2024-12")
