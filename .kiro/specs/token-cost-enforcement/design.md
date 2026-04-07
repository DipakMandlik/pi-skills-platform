# Token Cost Enforcement Bugfix Design

## Overview

The AI governance platform has a complete data model for token usage and cost tracking (AI_MODEL_REGISTRY, AI_SUBSCRIPTIONS, AI_USER_MAPPING, AI_USER_TOKENS, AI_TOKEN_USAGE_LOG) but lacks the critical enforcement logic to make it functional. The bug manifests as cost leakage: AI requests execute without validating token limits, cost limits, model access, per-request limits, or rate limits. After execution, token usage and costs are not consistently tracked or logged.

This design transforms the system into a zero-leakage Enterprise AI Billing + Governance Engine by adding a comprehensive pre-execution validation pipeline, standardized token/cost calculation, reliable usage updates, and guaranteed audit logging.

The fix centers on enhancing the ExecutionGuard class in `apps/api/services/execution_guard.py` to add token/cost enforcement gates before model invocation, and ensuring post-execution tracking updates AI_USER_TOKENS and AI_TOKEN_USAGE_LOG reliably.

## Glossary

- **Bug_Condition (C)**: The condition that triggers cost leakage - when AI requests execute without token/cost validation or tracking
- **Property (P)**: The desired behavior - all requests must pass pre-execution validation and post-execution tracking
- **Preservation**: Existing execution flow, audit logging, and security checks that must remain unchanged
- **ExecutionGuard**: The class in `apps/api/services/execution_guard.py` that validates requests before model invocation
- **Token Estimation**: Pre-execution calculation using `input_tokens * 1.3` to predict total token usage
- **Cost Calculation**: Post-execution calculation using `(input_tokens/1000 * input_cost_per_1k) + (output_tokens/1000 * output_cost_per_1k)`
- **AI_USER_TOKENS**: Snowflake table tracking monthly token usage and cost per user (user_id, period, tokens_used, cost_accumulated)
- **AI_TOKEN_USAGE_LOG**: Snowflake table logging every AI request with full details (log_id, user_id, model_id, tokens_used, cost, outcome)
- **AI_MODEL_REGISTRY**: Snowflake table containing model pricing (model_id, cost_per_1k_tokens, max_tokens)
- **AI_SUBSCRIPTIONS**: Snowflake table defining subscription plans (plan_name, monthly_token_limit, max_tokens_per_request, cost_budget_monthly)
- **AI_USER_MAPPING**: Snowflake table mapping users to subscription plans (user_id, plan_name)

## Bug Details

### Bug Condition

The bug manifests when an AI request is received and the system executes it without validating token limits, cost limits, model access, per-request limits, or rate limits. The ExecutionGuard.execute() method in `apps/api/services/execution_guard.py` performs basic checks (model registration, skill access, model access, rate limiting) but does NOT check:
- User's monthly token limit against current usage
- User's monthly cost budget against current spending
- Estimated request tokens against per-request limit
- User's subscription plan access to the requested model

After execution, the model adapter returns token usage in ModelResult, but this data is not used to:
- Update AI_USER_TOKENS.tokens_used and cost_accumulated
- Insert records into AI_TOKEN_USAGE_LOG
- Calculate actual cost using model pricing

**Formal Specification:**
```
FUNCTION isBugCondition(request)
  INPUT: request of type AIExecutionRequest (user_id, model_id, prompt, max_tokens)
  OUTPUT: boolean
  
  RETURN (NOT validated_token_limit(request.user_id, request.estimated_tokens))
         OR (NOT validated_cost_limit(request.user_id, request.estimated_cost))
         OR (NOT validated_model_access(request.user_id, request.model_id))
         OR (NOT validated_per_request_limit(request.estimated_tokens, request.model_id))
         OR (NOT updated_usage_after_execution(request.user_id, request.actual_tokens, request.actual_cost))
         OR (NOT logged_to_usage_log(request.request_id))
END FUNCTION
```

### Examples

- **Example 1**: User with 10,000 token monthly limit has already used 9,500 tokens. They submit a request estimated at 1,000 tokens. Expected: Request blocked with "Monthly token limit exceeded". Actual: Request executes, user now at 10,500 tokens (over limit).

- **Example 2**: User with $50 monthly cost budget has spent $48. They submit a request estimated to cost $5. Expected: Request blocked with "Monthly cost limit exceeded". Actual: Request executes, user now at $53 (over budget).

- **Example 3**: User on "basic" plan (max 2048 tokens per request) submits a request with max_tokens=4096. Expected: Request blocked with "Per-request token limit exceeded". Actual: Request executes with 4096 tokens.

- **Example 4**: User submits a request that completes successfully using 1,234 tokens costing $0.15. Expected: AI_USER_TOKENS updated (+1234 tokens, +$0.15 cost), AI_TOKEN_USAGE_LOG has new record. Actual: No updates, no log entry, usage invisible.

- **Edge Case**: Request fails mid-execution (model timeout). Expected: Partial token usage still logged with status="FAILED". Actual: No logging, tokens consumed but not tracked.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Existing ExecutionGuard validation gates (model registration, skill access, model access, rate limiting) must continue to work exactly as before
- Audit logging to audit_log table via AuditService must remain unchanged
- Model invocation flow through model adapters must remain unchanged
- Error handling and HTTP response formats must remain unchanged
- Authentication and authorization middleware must remain unchanged
- Streaming execution endpoint (/execute/stream) must continue to work

**Scope:**
All inputs that pass the new token/cost validation gates should execute exactly as before. This includes:
- Users within their token and cost limits
- Requests within per-request token limits
- Users with valid model access via their subscription plan
- All existing security checks (prompt injection, rate limiting, etc.)

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Missing Pre-Execution Validation Gates**: ExecutionGuard.execute() does not query AI_USER_TOKENS to check current usage against limits before allowing execution. The validation pipeline is incomplete.

2. **No Token Estimation Logic**: There is no function to estimate token usage before execution. The system cannot predict if a request will exceed limits.

3. **No Cost Calculation Logic**: There is no function to calculate cost from token usage and model pricing. The system cannot track financial impact.

4. **Missing Post-Execution Tracking**: After model invocation returns ModelResult with tokens_used, there is no code to:
   - Update AI_USER_TOKENS (tokens_used += result.tokens_used, cost_accumulated += calculated_cost)
   - Insert into AI_TOKEN_USAGE_LOG
   - Handle failures gracefully (log even if request fails)

5. **No Snowflake Integration**: The ExecutionGuard uses PostgreSQL (self.db) but the token/cost tables are in Snowflake. There's no Snowflake client integration in the execution flow.

6. **No Subscription Plan Enforcement**: The system doesn't check if the user's subscription plan (from AI_USER_MAPPING + AI_SUBSCRIPTIONS) allows access to the requested model or has sufficient limits.

## Correctness Properties

Property 1: Bug Condition - Pre-Execution Validation Blocks Over-Limit Requests

_For any_ AI request where the user's current token usage + estimated request tokens would exceed their monthly token limit, OR where the user's current cost + estimated request cost would exceed their monthly cost budget, OR where the estimated request tokens exceed the per-request limit, OR where the user's subscription plan does not allow the requested model, the fixed ExecutionGuard SHALL block the request before execution and return an appropriate error message ("Monthly token limit exceeded", "Monthly cost limit exceeded", "Per-request token limit exceeded", or "Model not available in your subscription plan").

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.13, 2.14, 2.15, 2.16**

Property 2: Bug Condition - Post-Execution Tracking Updates Usage

_For any_ AI request that executes (successfully or with failure), the fixed system SHALL capture actual input_tokens and output_tokens from the model response, calculate cost using model pricing, update AI_USER_TOKENS by incrementing tokens_used and cost_accumulated, and insert a record into AI_TOKEN_USAGE_LOG with all details (request_id, user_id, model_id, input_tokens, output_tokens, total_tokens, cost, status, latency, created_at).

**Validates: Requirements 2.7, 2.8, 2.9, 2.10, 2.11, 2.12**

Property 3: Preservation - Existing Validation Gates Continue Working

_For any_ input that would have been blocked by existing ExecutionGuard validation (unregistered model, no skill access, no model permission, rate limit exceeded, prompt injection), the fixed code SHALL produce exactly the same blocking behavior with the same error messages, preserving all existing security and access control checks.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7**

Property 4: Preservation - Successful Execution Flow Unchanged

_For any_ request that passes all validation gates (existing + new token/cost gates), the fixed code SHALL execute the model invocation, return the model response, and log to audit_log exactly as the original code did, preserving the successful execution flow.

**Validates: Requirements 3.6, 3.8, 3.9, 3.10**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/api/services/execution_guard.py`

**Function**: `ExecutionGuard.execute()`

**Specific Changes**:

1. **Add Snowflake Client Integration**: Inject a Snowflake client into ExecutionGuard constructor to query AI_* tables
   - Add `snowflake_client` parameter to `__init__`
   - Store as `self.sf_client`

2. **Add Token Estimation Function**: Create `_estimate_tokens(prompt: str, max_tokens: int) -> int`
   - Count input tokens using simple word-based estimation: `len(prompt.split()) * 1.3`
   - Add max_tokens for output estimation
   - Return total estimated tokens

3. **Add Cost Calculation Function**: Create `_calculate_cost(input_tokens: int, output_tokens: int, model_id: str) -> float`
   - Query AI_MODEL_REGISTRY for model pricing (cost_per_1k_tokens or separate input/output costs)
   - Calculate: `(input_tokens/1000 * input_cost_per_1k) + (output_tokens/1000 * output_cost_per_1k)`
   - Return total cost

4. **Add Subscription Plan Lookup**: Create `_get_user_subscription(user_id: str) -> dict`
   - Query AI_USER_MAPPING to get plan_name for user
   - Query AI_SUBSCRIPTIONS to get plan details (monthly_token_limit, max_tokens_per_request, allowed_models, cost_budget_monthly)
   - Cache result in Redis for performance
   - Return subscription plan dict

5. **Add Current Usage Lookup**: Create `_get_current_usage(user_id: str, period: str) -> dict`
   - Query AI_USER_TOKENS for current period (format: "YYYY-MM")
   - Return {tokens_used, cost_accumulated, tokens_limit}
   - If no record exists, initialize with zeros

6. **Add Pre-Execution Validation Gates**: In `execute()` method, before model invocation:
   - Call `_estimate_tokens()` to get estimated_tokens
   - Call `_get_user_subscription()` to get plan limits
   - Call `_get_current_usage()` to get current usage
   - Validate: `current_usage.tokens_used + estimated_tokens <= plan.monthly_token_limit`
   - Validate: `estimated_tokens <= plan.max_tokens_per_request`
   - Validate: `model_id IN plan.allowed_models`
   - Estimate cost and validate: `current_usage.cost_accumulated + estimated_cost <= plan.cost_budget_monthly`
   - Raise GuardDenied with appropriate message if any check fails

7. **Add Post-Execution Usage Update**: After model invocation returns ModelResult:
   - Extract `input_tokens` and `output_tokens` from result (may need to enhance ModelResult dataclass)
   - Call `_calculate_cost()` to get actual cost
   - Update AI_USER_TOKENS: `UPDATE AI_USER_TOKENS SET tokens_used = tokens_used + total_tokens, cost_accumulated = cost_accumulated + cost WHERE user_id = ? AND period = ?`
   - If no record exists, INSERT new record

8. **Add Usage Logging**: After usage update:
   - Insert into AI_TOKEN_USAGE_LOG with all fields: log_id (UUID), user_id, model_id, skill_id, tokens_used, cost, request_id, latency_ms, outcome ("SUCCESS" or "FAILED"), timestamp
   - Use try/except to ensure logging doesn't break execution flow

9. **Handle Failures Gracefully**: Wrap model invocation in try/except:
   - If invocation fails, still log to AI_TOKEN_USAGE_LOG with outcome="FAILED"
   - If partial tokens were consumed (timeout), estimate and log them
   - Re-raise the exception after logging

**File**: `apps/api/models/domain.py`

**Changes**:
- Enhance `ModelResult` dataclass to include `input_tokens` and `output_tokens` separately (currently only has `tokens_used` total)
- Add fields: `input_tokens: int = 0`, `output_tokens: int = 0`

**File**: `apps/api/adapters/model_adapter.py`

**Changes**:
- Update all adapter implementations to populate `input_tokens` and `output_tokens` in ModelResult
- AnthropicAdapter: Use `response.usage.input_tokens` and `response.usage.output_tokens`
- LiteLLMAdapter: Use `response.usage.prompt_tokens` and `response.usage.completion_tokens`
- GeminiAdapter: Parse from `response.usage_metadata` if available
- MockModelAdapter: Return mock values for testing

**File**: `apps/api/routers/execute.py`

**Changes**:
- Inject Snowflake client into ExecutionGuard constructor
- Pass Snowflake client from settings or create new client instance

**File**: `apps/api/core/config.py`

**Changes**:
- Add Snowflake connection settings if not already present (SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA)

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code (requests execute without validation, usage not tracked), then verify the fix works correctly (requests blocked when over limit, usage tracked reliably) and preserves existing behavior (valid requests still execute successfully).

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that requests execute without token/cost validation and usage is not tracked.

**Test Plan**: Write tests that simulate AI requests from users at various usage levels (near limit, over limit, within limit) and observe that the UNFIXED code allows all requests to execute regardless of limits. Verify that AI_USER_TOKENS and AI_TOKEN_USAGE_LOG are not updated after execution.

**Test Cases**:
1. **Over Token Limit Test**: Create user with 10,000 token limit and 9,500 tokens used. Submit request estimated at 1,000 tokens. Observe: Request executes successfully on unfixed code (should fail).
2. **Over Cost Limit Test**: Create user with $50 cost budget and $48 spent. Submit request estimated at $5 cost. Observe: Request executes successfully on unfixed code (should fail).
3. **Over Per-Request Limit Test**: Create user on plan with 2048 max tokens per request. Submit request with max_tokens=4096. Observe: Request executes successfully on unfixed code (should fail).
4. **Model Not in Plan Test**: Create user on "basic" plan (only allows gpt-3.5). Submit request for "gpt-4". Observe: Request executes successfully on unfixed code (should fail).
5. **Usage Not Tracked Test**: Submit successful request. Query AI_USER_TOKENS and AI_TOKEN_USAGE_LOG. Observe: No updates on unfixed code (should have updates).

**Expected Counterexamples**:
- All requests execute regardless of token/cost limits
- AI_USER_TOKENS.tokens_used and cost_accumulated remain unchanged after execution
- AI_TOKEN_USAGE_LOG has no new records after execution
- Possible causes: Missing validation gates, missing Snowflake integration, missing post-execution tracking

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (requests that should be blocked or tracked), the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL request WHERE isBugCondition(request) DO
  result := execute_fixed(request)
  ASSERT expectedBehavior(result)
END FOR
```

**Test Cases**:
1. **Token Limit Enforcement**: User at 9,500/10,000 tokens submits 1,000 token request → Blocked with "Monthly token limit exceeded"
2. **Cost Limit Enforcement**: User at $48/$50 budget submits $5 request → Blocked with "Monthly cost limit exceeded"
3. **Per-Request Limit Enforcement**: User submits 4096 token request on 2048 limit plan → Blocked with "Per-request token limit exceeded"
4. **Model Access Enforcement**: User on "basic" plan requests "gpt-4" → Blocked with "Model not available in your subscription plan"
5. **Usage Tracking**: User submits successful request using 1,234 tokens costing $0.15 → AI_USER_TOKENS updated (+1234, +$0.15), AI_TOKEN_USAGE_LOG has new record
6. **Failure Tracking**: Request fails mid-execution → AI_TOKEN_USAGE_LOG has record with outcome="FAILED"

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (valid requests within limits), the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL request WHERE NOT isBugCondition(request) DO
  ASSERT execute_original(request) = execute_fixed(request)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all valid inputs

**Test Plan**: Observe behavior on UNFIXED code first for valid requests (within limits, valid model access), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Valid Request Execution**: User at 5,000/10,000 tokens submits 500 token request → Executes successfully, returns model response (same as unfixed)
2. **Existing Security Checks**: User submits prompt with injection pattern → Blocked with "PROMPT_POLICY_VIOLATION" (same as unfixed)
3. **Existing Rate Limiting**: User exceeds rate limit → Blocked with "RATE_LIMITED" (same as unfixed)
4. **Existing Model Registration Check**: User requests unregistered model → Blocked with "DENIED_MODEL_UNKNOWN" (same as unfixed)
5. **Existing Skill Access Check**: User requests skill they don't have → Blocked with "DENIED_SKILL" (same as unfixed)
6. **Existing Model Permission Check**: User requests model they don't have permission for → Blocked with "DENIED_MODEL" (same as unfixed)
7. **Audit Logging**: Valid request executes → audit_log table has entry (same as unfixed)

### Unit Tests

- Test token estimation function with various prompt lengths
- Test cost calculation function with different token counts and model pricing
- Test subscription plan lookup with caching
- Test current usage lookup with missing records (should initialize)
- Test each validation gate independently (token limit, cost limit, per-request limit, model access)
- Test usage update with concurrent requests (race conditions)
- Test usage logging with failures and partial executions

### Property-Based Tests

- Generate random user usage states (tokens_used, cost_accumulated) and verify validation logic
- Generate random subscription plans and verify model access enforcement
- Generate random request sizes and verify per-request limit enforcement
- Generate random model pricing and verify cost calculation accuracy
- Test that all valid requests (within limits) execute successfully across many scenarios

### Integration Tests

- Test full execution flow: request → validation → execution → tracking → logging
- Test with real Snowflake connection (or mock Snowflake client)
- Test with multiple concurrent users to verify no race conditions in usage updates
- Test monthly period rollover (usage resets when period changes)
- Test error scenarios: Snowflake unavailable, Redis unavailable, model adapter failure
- Test streaming endpoint (/execute/stream) with new validation gates
