"""
Test that model adapters correctly populate input_tokens and output_tokens fields

This test verifies task 3.2: Update model adapters to populate input/output tokens
"""

import pytest
from apps.api.adapters.model_adapter import MockModelAdapter
from apps.api.models.domain import ModelResult


@pytest.mark.asyncio
async def test_mock_adapter_populates_token_fields():
    """Test that MockModelAdapter returns input_tokens and output_tokens"""
    adapter = MockModelAdapter()
    
    result = await adapter.invoke(
        model_id="test-model",
        prompt="Test prompt",
        parameters={},
        max_tokens=100
    )
    
    assert isinstance(result, ModelResult)
    assert result.input_tokens == 100, "MockModelAdapter should set input_tokens=100"
    assert result.output_tokens == 50, "MockModelAdapter should set output_tokens=50"
    assert result.tokens_used > 0, "tokens_used should be populated"
    assert result.content is not None, "content should be populated"
    assert result.model_id == "test-model", "model_id should match"


@pytest.mark.asyncio
async def test_model_result_has_token_fields():
    """Test that ModelResult dataclass has input_tokens and output_tokens fields"""
    result = ModelResult(
        content="Test content",
        tokens_used=150,
        model_id="test-model",
        finish_reason="end_turn",
        input_tokens=100,
        output_tokens=50
    )
    
    assert result.input_tokens == 100
    assert result.output_tokens == 50
    assert result.tokens_used == 150
    assert result.input_tokens + result.output_tokens == result.tokens_used


@pytest.mark.asyncio
async def test_model_result_defaults_to_zero():
    """Test that ModelResult defaults input_tokens and output_tokens to 0"""
    result = ModelResult(
        content="Test content",
        tokens_used=150,
        model_id="test-model",
        finish_reason="end_turn"
    )
    
    assert result.input_tokens == 0, "input_tokens should default to 0"
    assert result.output_tokens == 0, "output_tokens should default to 0"
