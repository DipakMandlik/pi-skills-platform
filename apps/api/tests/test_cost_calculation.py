"""
Unit tests for cost calculation function

**Validates: Requirements 2.8**
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio

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
async def test_calculate_cost_with_separate_pricing(execution_guard):
    """
    Test cost calculation with separate input/output pricing
    
    Formula: (input_tokens/1000 * input_cost_per_1k) + (output_tokens/1000 * output_cost_per_1k)
    """
    # Mock Snowflake response with separate pricing
    mock_pricing = [{
        "INPUT_COST_PER_1K": 0.01,
        "OUTPUT_COST_PER_1K": 0.03,
        "COST_PER_1K_TOKENS": None
    }]
    
    with patch.object(execution_guard.sf_client, '_query_rows_sync', return_value=mock_pricing):
        cost = await execution_guard._calculate_cost(
            input_tokens=1000,
            output_tokens=500,
            model_id="gpt-3.5-turbo"
        )
    
    # Expected: (1000/1000 * 0.01) + (500/1000 * 0.03) = 0.01 + 0.015 = 0.025
    assert cost == pytest.approx(0.025, rel=1e-6)


@pytest.mark.asyncio
async def test_calculate_cost_with_unified_pricing(execution_guard):
    """
    Test cost calculation with unified pricing (fallback)
    
    When separate pricing not available, uses cost_per_1k_tokens for both input and output
    """
    # Mock Snowflake response with unified pricing
    mock_pricing = [{
        "INPUT_COST_PER_1K": None,
        "OUTPUT_COST_PER_1K": None,
        "COST_PER_1K_TOKENS": 0.02
    }]
    
    with patch.object(execution_guard.sf_client, '_query_rows_sync', return_value=mock_pricing):
        cost = await execution_guard._calculate_cost(
            input_tokens=1000,
            output_tokens=500,
            model_id="gpt-3.5-turbo"
        )
    
    # Expected: (1000/1000 * 0.02) + (500/1000 * 0.02) = 0.02 + 0.01 = 0.03
    assert cost == pytest.approx(0.03, rel=1e-6)


@pytest.mark.asyncio
async def test_calculate_cost_missing_pricing_data(execution_guard):
    """
    Test cost calculation when pricing data is missing
    
    Should return 0.0 and log warning
    """
    # Mock Snowflake response with no rows
    mock_pricing = []
    
    with patch.object(execution_guard.sf_client, '_query_rows_sync', return_value=mock_pricing):
        cost = await execution_guard._calculate_cost(
            input_tokens=1000,
            output_tokens=500,
            model_id="unknown-model"
        )
    
    assert cost == 0.0


@pytest.mark.asyncio
async def test_calculate_cost_missing_all_pricing_fields(execution_guard):
    """
    Test cost calculation when all pricing fields are None
    
    Should return 0.0 and log warning
    """
    # Mock Snowflake response with all None pricing
    mock_pricing = [{
        "INPUT_COST_PER_1K": None,
        "OUTPUT_COST_PER_1K": None,
        "COST_PER_1K_TOKENS": None
    }]
    
    with patch.object(execution_guard.sf_client, '_query_rows_sync', return_value=mock_pricing):
        cost = await execution_guard._calculate_cost(
            input_tokens=1000,
            output_tokens=500,
            model_id="gpt-3.5-turbo"
        )
    
    assert cost == 0.0


@pytest.mark.asyncio
async def test_calculate_cost_snowflake_error(execution_guard):
    """
    Test cost calculation when Snowflake query fails
    
    Should return 0.0 and log warning
    """
    # Mock Snowflake to raise an exception
    with patch.object(execution_guard.sf_client, '_query_rows_sync', side_effect=Exception("Connection error")):
        cost = await execution_guard._calculate_cost(
            input_tokens=1000,
            output_tokens=500,
            model_id="gpt-3.5-turbo"
        )
    
    assert cost == 0.0


@pytest.mark.asyncio
async def test_calculate_cost_zero_tokens(execution_guard):
    """
    Test cost calculation with zero tokens
    
    Should return 0.0
    """
    mock_pricing = [{
        "INPUT_COST_PER_1K": 0.01,
        "OUTPUT_COST_PER_1K": 0.03,
        "COST_PER_1K_TOKENS": None
    }]
    
    with patch.object(execution_guard.sf_client, '_query_rows_sync', return_value=mock_pricing):
        cost = await execution_guard._calculate_cost(
            input_tokens=0,
            output_tokens=0,
            model_id="gpt-3.5-turbo"
        )
    
    assert cost == 0.0


@pytest.mark.asyncio
async def test_calculate_cost_large_numbers(execution_guard):
    """
    Test cost calculation with large token counts
    
    Ensures precision is maintained for large values
    """
    mock_pricing = [{
        "INPUT_COST_PER_1K": 0.01,
        "OUTPUT_COST_PER_1K": 0.03,
        "COST_PER_1K_TOKENS": None
    }]
    
    with patch.object(execution_guard.sf_client, '_query_rows_sync', return_value=mock_pricing):
        cost = await execution_guard._calculate_cost(
            input_tokens=100000,
            output_tokens=50000,
            model_id="gpt-4"
        )
    
    # Expected: (100000/1000 * 0.01) + (50000/1000 * 0.03) = 1.0 + 1.5 = 2.5
    assert cost == pytest.approx(2.5, rel=1e-6)


@pytest.mark.asyncio
async def test_calculate_cost_lowercase_field_names(execution_guard):
    """
    Test cost calculation with lowercase field names from Snowflake
    
    Ensures both uppercase and lowercase field names are handled
    """
    mock_pricing = [{
        "input_cost_per_1k": 0.01,
        "output_cost_per_1k": 0.03,
        "cost_per_1k_tokens": None
    }]
    
    with patch.object(execution_guard.sf_client, '_query_rows_sync', return_value=mock_pricing):
        cost = await execution_guard._calculate_cost(
            input_tokens=1000,
            output_tokens=500,
            model_id="gpt-3.5-turbo"
        )
    
    # Expected: (1000/1000 * 0.01) + (500/1000 * 0.03) = 0.01 + 0.015 = 0.025
    assert cost == pytest.approx(0.025, rel=1e-6)
