"""
Unit tests for token estimation function

**Validates: Requirements 2.6**
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

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
    return MagicMock()


@pytest.fixture
def execution_guard(mock_settings, mock_db, mock_model_adapter, mock_audit, mock_snowflake_client):
    return ExecutionGuard(
        settings=mock_settings,
        db=mock_db,
        model_adapter=mock_model_adapter,
        audit=mock_audit,
        snowflake_client=mock_snowflake_client
    )


def test_estimate_tokens_simple_prompt(execution_guard):
    """Test token estimation with a simple prompt"""
    prompt = "Hello world"
    max_tokens = 100
    
    estimated = execution_guard._estimate_tokens(prompt, max_tokens)
    
    # 2 words * 1.3 = 2.6 input tokens, + 100 max_tokens = 102.6, rounded to 102
    assert estimated == 102


def test_estimate_tokens_longer_prompt(execution_guard):
    """Test token estimation with a longer prompt"""
    prompt = "This is a longer prompt with multiple words to test the estimation"
    max_tokens = 500
    
    estimated = execution_guard._estimate_tokens(prompt, max_tokens)
    
    # 12 words * 1.3 = 15.6 input tokens, + 500 max_tokens = 515.6, rounded to 515
    assert estimated == 515


def test_estimate_tokens_empty_prompt(execution_guard):
    """Test token estimation with an empty prompt"""
    prompt = ""
    max_tokens = 100
    
    estimated = execution_guard._estimate_tokens(prompt, max_tokens)
    
    # 0 words * 1.3 = 0 input tokens, + 100 max_tokens = 100
    assert estimated == 100


def test_estimate_tokens_single_word(execution_guard):
    """Test token estimation with a single word"""
    prompt = "Hello"
    max_tokens = 50
    
    estimated = execution_guard._estimate_tokens(prompt, max_tokens)
    
    # 1 word * 1.3 = 1.3 input tokens, + 50 max_tokens = 51.3, rounded to 51
    assert estimated == 51


def test_estimate_tokens_large_prompt(execution_guard):
    """Test token estimation with a large prompt"""
    prompt = " ".join(["word"] * 1000)
    max_tokens = 2000
    
    estimated = execution_guard._estimate_tokens(prompt, max_tokens)
    
    # 1000 words * 1.3 = 1300 input tokens, + 2000 max_tokens = 3300
    assert estimated == 3300


def test_estimate_tokens_zero_max_tokens(execution_guard):
    """Test token estimation with zero max_tokens"""
    prompt = "Test prompt"
    max_tokens = 0
    
    estimated = execution_guard._estimate_tokens(prompt, max_tokens)
    
    # 2 words * 1.3 = 2.6 input tokens, + 0 max_tokens = 2.6, rounded to 2
    assert estimated == 2
