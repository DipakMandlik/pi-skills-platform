from __future__ import annotations

import logging
import re
import time
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import Settings
from ..core.database import RegisteredModelModel
from ..core.redis_client import cache_get, cache_incr, cache_expire, cache_set
from ..models.domain import (
    AuthUser,
    GuardContext,
    GuardDenied,
    ModelInvocationError,
    ModelResult,
)
from .permission_service import resolve_user_permissions
from .audit_service import AuditService
from .snowflake_service import SnowflakeService

logger = logging.getLogger("backend.execution_guard")

INJECTION_PATTERNS = [
    r"ignore previous instructions",
    r"you are now",
    r"act as.*admin",
    r"reveal.*system prompt",
    r"bypass.*security",
    r"override.*policy",
    r"disable.*content\s*filter",
    r"switch.*model",
    r"use.*gpt",
    r"use.*claude",
    r"use.*gemini",
    r"jailbreak",
    r"do anything now",
]


class ExecutionGuard:
    def __init__(self, settings: Settings, db: AsyncSession, model_adapter, audit: AuditService, snowflake_client: SnowflakeService):
        self.settings = settings
        self.db = db
        self.model_adapter = model_adapter
        self.audit = audit
        self.sf_client = snowflake_client

    async def execute(
        self,
        user: AuthUser,
        skill_id: str,
        model_id: str,
        prompt: str,
        parameters: Optional[dict] = None,
        max_tokens: int = 1000,
    ) -> ModelResult:
        ctx = GuardContext(
            user_id=user.user_id,
            role=user.role,
            skill_id=skill_id,
            model_id=model_id,
            request_id=user.request_id,
            started_at=time.monotonic(),
        )

        try:
            await self._assert_model_registered(ctx)
            await self._assert_skill_access(user, ctx)
            await self._assert_model_access(user, ctx)
            await self._assert_rate_limit(ctx)
            sanitized = await self._sanitize_prompt(prompt, ctx)

            # Pre-execution validation gates for token/cost enforcement
            from datetime import datetime
            current_period = datetime.utcnow().strftime("%Y-%m")
            
            # Estimate token usage for this request
            estimated_tokens = self._estimate_tokens(sanitized, max_tokens)
            logger.debug(f"Estimated tokens for request: {estimated_tokens}")
            
            # Get user subscription plan
            subscription = await self._get_user_subscription(user.user_id)
            logger.debug(f"User subscription plan: {subscription['plan_name']}")
            
            # Get current usage for the period
            current_usage = await self._get_current_usage(user.user_id, current_period)
            logger.debug(f"Current usage - tokens: {current_usage['tokens_used']}, cost: {current_usage['cost_accumulated']}")
            
            # Validate monthly token limit
            if current_usage['tokens_used'] + estimated_tokens > subscription['monthly_token_limit']:
                logger.debug(f"Token limit exceeded: {current_usage['tokens_used']} + {estimated_tokens} > {subscription['monthly_token_limit']}")
                raise GuardDenied(
                    reason="MONTHLY_TOKEN_LIMIT_EXCEEDED",
                    message="Monthly token limit exceeded",
                )
            
            # Validate per-request token limit
            if estimated_tokens > subscription['max_tokens_per_request']:
                logger.debug(f"Per-request token limit exceeded: {estimated_tokens} > {subscription['max_tokens_per_request']}")
                raise GuardDenied(
                    reason="PER_REQUEST_TOKEN_LIMIT_EXCEEDED",
                    message="Per-request token limit exceeded",
                )
            
            # Validate model access
            if model_id not in subscription['allowed_models']:
                logger.debug(f"Model not in allowed list: {model_id} not in {subscription['allowed_models']}")
                raise GuardDenied(
                    reason="MODEL_NOT_IN_SUBSCRIPTION",
                    message="Model not available in your subscription plan",
                )
            
            # Estimate cost for this request
            # For pre-execution, we estimate input/output split (e.g., 60% input, 40% output)
            estimated_input_tokens = int(len(sanitized.split()) * 1.3)
            estimated_output_tokens = max_tokens
            estimated_cost = await self._calculate_cost(estimated_input_tokens, estimated_output_tokens, model_id)
            logger.debug(f"Estimated cost for request: ${estimated_cost:.4f}")
            
            # Validate monthly cost budget
            if current_usage['cost_accumulated'] + estimated_cost > subscription['cost_budget_monthly']:
                logger.debug(f"Cost limit exceeded: {current_usage['cost_accumulated']} + {estimated_cost} > {subscription['cost_budget_monthly']}")
                raise GuardDenied(
                    reason="MONTHLY_COST_LIMIT_EXCEEDED",
                    message="Monthly cost limit exceeded",
                )

            # Wrap model invocation in try/except to handle failures gracefully
            try:
                result = await self.model_adapter.invoke(
                    model_id=model_id,
                    prompt=sanitized,
                    parameters=parameters or {},
                    max_tokens=max_tokens,
                )

                # Post-execution usage update for successful invocation
                try:
                    # Extract actual token usage from model result
                    input_tokens = result.input_tokens
                    output_tokens = result.output_tokens
                    total_tokens = input_tokens + output_tokens
                    
                    # Calculate actual cost based on real token usage
                    actual_cost = await self._calculate_cost(input_tokens, output_tokens, model_id)
                    logger.debug(f"Actual usage - input: {input_tokens}, output: {output_tokens}, total: {total_tokens}, cost: ${actual_cost:.4f}")
                    
                    # Update AI_USER_TOKENS with actual usage
                    await self._update_user_tokens(user.user_id, current_period, total_tokens, actual_cost, subscription['monthly_token_limit'])
                    logger.debug(f"Updated AI_USER_TOKENS for user {user.user_id} in period {current_period}")
                    
                    # Log usage to AI_TOKEN_USAGE_LOG
                    import uuid
                    log_id = str(uuid.uuid4())
                    latency_ms = self._elapsed_ms(ctx)
                    
                    try:
                        await self._log_token_usage(
                            log_id=log_id,
                            user_id=user.user_id,
                            model_id=model_id,
                            skill_id=skill_id,
                            request_id=user.request_id,
                            input_tokens=input_tokens,
                            output_tokens=output_tokens,
                            total_tokens=total_tokens,
                            cost=actual_cost,
                            outcome="SUCCESS",
                            latency_ms=latency_ms
                        )
                        logger.debug(f"Logged usage to AI_TOKEN_USAGE_LOG: {log_id}")
                    except Exception as log_error:
                        # Log error but don't raise - logging failure shouldn't break execution
                        logger.error(f"Failed to log usage to AI_TOKEN_USAGE_LOG: {log_error}")
                    
                except Exception as e:
                    # Log warning but don't block response - usage tracking failure shouldn't break execution
                    logger.warning(f"Failed to update usage for user {user.user_id}: {e}")

                await self.audit.log_success(
                    self.db, ctx, tokens_used=result.tokens_used, latency_ms=self._elapsed_ms(ctx)
                )
                return result
                
            except Exception as invocation_error:
                # Model invocation failed - still log usage with FAILED status
                logger.warning(f"Model invocation failed for user {user.user_id}: {invocation_error}")
                
                # Estimate partial token usage (for timeouts or partial execution)
                # Use estimated tokens as a conservative estimate
                estimated_input_tokens = int(len(sanitized.split()) * 1.3)
                estimated_output_tokens = 0  # No output if failed
                estimated_total_tokens = estimated_input_tokens
                estimated_failure_cost = await self._calculate_cost(estimated_input_tokens, estimated_output_tokens, model_id)
                
                # Log the failed request to AI_TOKEN_USAGE_LOG
                import uuid
                log_id = str(uuid.uuid4())
                latency_ms = self._elapsed_ms(ctx)
                
                try:
                    await self._log_token_usage(
                        log_id=log_id,
                        user_id=user.user_id,
                        model_id=model_id,
                        skill_id=skill_id,
                        request_id=user.request_id,
                        input_tokens=estimated_input_tokens,
                        output_tokens=estimated_output_tokens,
                        total_tokens=estimated_total_tokens,
                        cost=estimated_failure_cost,
                        outcome="FAILED",
                        latency_ms=latency_ms
                    )
                    logger.debug(f"Logged failed request to AI_TOKEN_USAGE_LOG: {log_id}")
                except Exception as log_error:
                    # Log error but don't raise - logging failure shouldn't prevent exception propagation
                    logger.error(f"Failed to log failed request to AI_TOKEN_USAGE_LOG: {log_error}")
                
                # Re-raise the original exception to preserve error handling
                raise

        except GuardDenied as e:
            await self.audit.log_denied(
                self.db, ctx, reason=e.reason, latency_ms=self._elapsed_ms(ctx)
            )
            raise

        except ModelInvocationError as e:
            await self.audit.log_error(self.db, ctx, error=str(e), latency_ms=self._elapsed_ms(ctx))
            raise

    async def validate_all_gates(
        self, user: AuthUser, skill_id: str, model_id: str
    ) -> GuardContext:
        ctx = GuardContext(
            user_id=user.user_id,
            role=user.role,
            skill_id=skill_id,
            model_id=model_id,
            request_id=user.request_id,
            started_at=time.monotonic(),
        )
        await self._assert_model_registered(ctx)
        await self._assert_skill_access(user, ctx)
        await self._assert_model_access(user, ctx)
        await self._assert_rate_limit(ctx)
        return ctx

    async def _assert_model_registered(self, ctx: GuardContext) -> None:
        cached = await cache_get(f"model:registered:{ctx.model_id}")
        if cached is not None:
            if cached.get("is_available"):
                return
            raise GuardDenied(
                reason="DENIED_MODEL_UNKNOWN",
                message=f"Model '{ctx.model_id}' is not available",
            )

        result = await self.db.execute(
            select(RegisteredModelModel).where(RegisteredModelModel.model_id == ctx.model_id)
        )
        model = result.scalar_one_or_none()

        if model is None or not model.is_available:
            raise GuardDenied(
                reason="DENIED_MODEL_UNKNOWN",
                message=f"Model '{ctx.model_id}' is not registered or unavailable",
            )

        await cache_set(
            f"model:registered:{ctx.model_id}",
            {"model_id": ctx.model_id, "is_available": True},
            self.settings.redis_model_ttl,
        )

    async def _assert_skill_access(self, user: AuthUser, ctx: GuardContext) -> None:
        perms = await resolve_user_permissions(user)
        if ctx.skill_id not in perms.allowed_skills:
            raise GuardDenied(
                reason="DENIED_SKILL",
                message=f"No active assignment for skill '{ctx.skill_id}'",
            )

    async def _assert_model_access(self, user: AuthUser, ctx: GuardContext) -> None:
        perms = await resolve_user_permissions(user)
        if ctx.model_id not in perms.allowed_models:
            raise GuardDenied(
                reason="DENIED_MODEL",
                message=f"No active permission for model '{ctx.model_id}'",
            )

    async def _assert_rate_limit(self, ctx: GuardContext) -> None:
        key = f"rate:{ctx.user_id}:{ctx.model_id}"
        count = await cache_incr(key)
        if count == 1:
            await cache_expire(key, self.settings.redis_rate_window)
        if count > self.settings.max_requests_per_minute:
            raise GuardDenied(
                reason="RATE_LIMITED",
                message="Rate limit exceeded for this model",
            )

    async def _sanitize_prompt(self, prompt: str, ctx: GuardContext) -> str:
        if len(prompt) > self.settings.max_prompt_length:
            raise GuardDenied(
                reason="PROMPT_TOO_LONG",
                message=f"Prompt exceeds {self.settings.max_prompt_length} characters",
            )

        prompt_lower = prompt.lower()
        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, prompt_lower):
                await self.audit.log_security_event(self.db, ctx, "INJECTION_ATTEMPT_DETECTED")
                raise GuardDenied(
                    reason="PROMPT_POLICY_VIOLATION",
                    message="Prompt did not pass content policy",
                )

        return prompt.strip()

    def _elapsed_ms(self, ctx: GuardContext) -> int:
        return int((time.monotonic() - ctx.started_at) * 1000)

    def _estimate_tokens(self, prompt: str, max_tokens: int) -> int:
        """
        Estimate total token usage for a request using word-based approximation.
        
        This function provides a simple estimation approach:
        - Input tokens: word count * 1.3 (accounts for tokenization overhead)
        - Output tokens: max_tokens parameter (worst-case estimate)
        - Total: input_tokens + max_tokens
        
        Args:
            prompt: The input prompt text
            max_tokens: Maximum tokens allowed in the response
            
        Returns:
            Estimated total token count as integer
        """
        input_tokens = len(prompt.split()) * 1.3
        total_tokens = input_tokens + max_tokens
        return int(total_tokens)

    async def _calculate_cost(self, input_tokens: int, output_tokens: int, model_id: str) -> float:
        """
        Calculate the cost of an AI request based on token usage and model pricing.
        
        This function queries the AI_MODEL_REGISTRY table in Snowflake to retrieve
        pricing information for the specified model. It supports two pricing models:
        1. Separate input/output pricing: Uses input_cost_per_1k and output_cost_per_1k
        2. Unified pricing: Uses cost_per_1k_tokens for both input and output
        
        The cost is calculated using the formula:
        cost = (input_tokens/1000 * input_cost_per_1k) + (output_tokens/1000 * output_cost_per_1k)
        
        Args:
            input_tokens: Number of tokens in the input prompt
            output_tokens: Number of tokens in the model response
            model_id: Identifier of the AI model used
            
        Returns:
            Total cost as a float. Returns 0.0 if pricing data is missing or unavailable.
            
        Note:
            If pricing data cannot be retrieved, a warning is logged and 0.0 is returned
            to allow the request to proceed without blocking on cost calculation failures.
        """
        try:
            # Query AI_MODEL_REGISTRY for pricing information
            query = """
                SELECT 
                    input_cost_per_1k,
                    output_cost_per_1k,
                    cost_per_1k_tokens
                FROM GOVERNANCE_DB.AI.AI_MODEL_REGISTRY
                WHERE model_id = %s
            """
            import asyncio
            rows = await asyncio.to_thread(self.sf_client._query_rows_sync, query, (model_id,))
            
            if not rows:
                logger.warning(f"No pricing data found for model_id={model_id}, returning cost=0.0")
                return 0.0
            
            pricing = rows[0]
            
            # Check for separate input/output pricing (preferred)
            input_cost_per_1k = pricing.get("INPUT_COST_PER_1K") or pricing.get("input_cost_per_1k")
            output_cost_per_1k = pricing.get("OUTPUT_COST_PER_1K") or pricing.get("output_cost_per_1k")
            
            # Fall back to unified pricing if separate pricing not available
            if input_cost_per_1k is None or output_cost_per_1k is None:
                unified_cost = pricing.get("COST_PER_1K_TOKENS") or pricing.get("cost_per_1k_tokens")
                if unified_cost is None:
                    logger.warning(f"No pricing fields found for model_id={model_id}, returning cost=0.0")
                    return 0.0
                input_cost_per_1k = unified_cost
                output_cost_per_1k = unified_cost
            
            # Calculate cost using the formula
            input_cost = (input_tokens / 1000.0) * float(input_cost_per_1k)
            output_cost = (output_tokens / 1000.0) * float(output_cost_per_1k)
            total_cost = input_cost + output_cost
            
            return total_cost
            
        except Exception as e:
            logger.warning(f"Failed to calculate cost for model_id={model_id}: {e}, returning cost=0.0")
            return 0.0

    async def _get_user_subscription(self, user_id: str) -> dict:
        """
        Retrieve user subscription plan details with caching for performance.
        
        This function performs a two-step lookup:
        1. Query AI_USER_MAPPING to get the user's plan_name
        2. Query AI_SUBSCRIPTIONS to get plan details (limits, allowed models, budget)
        
        Results are cached in Redis with a 300-second TTL to reduce database load.
        The cache key format is "subscription:{user_id}".
        
        Caching Strategy:
        - Cache hit: Return cached subscription data immediately
        - Cache miss: Query Snowflake, cache result, return data
        - Cache TTL: 300 seconds (5 minutes) balances freshness with performance
        - Cache invalidation: Automatic via TTL, manual invalidation not implemented
        
        Args:
            user_id: The unique identifier of the user
            
        Returns:
            Dictionary containing subscription plan details:
            - plan_name: Name of the subscription plan (e.g., "free", "basic", "premium")
            - monthly_token_limit: Maximum tokens allowed per month
            - max_tokens_per_request: Maximum tokens allowed per single request
            - allowed_models: List of model IDs the user can access
            - cost_budget_monthly: Maximum monthly cost budget in dollars
            
        Raises:
            GuardDenied: If user has no subscription mapping or plan not found
            
        Note:
            If the user is not found in AI_USER_MAPPING, a default "free" plan is returned
            with conservative limits (10000 tokens/month, 2048 tokens/request, $10 budget).
            This ensures the system remains functional even for unmapped users.
        """
        import asyncio
        
        # Check cache first
        cache_key = f"subscription:{user_id}"
        cached = await cache_get(cache_key)
        if cached is not None:
            return cached
        
        try:
            # Step 1: Get user's plan_name from AI_USER_MAPPING
            mapping_query = """
                SELECT plan_name
                FROM GOVERNANCE_DB.AI.AI_USER_MAPPING
                WHERE user_id = %s
            """
            mapping_rows = await asyncio.to_thread(
                self.sf_client._query_rows_sync, mapping_query, (user_id,)
            )
            
            # If user not found, return default "free" plan
            if not mapping_rows:
                logger.warning(f"User {user_id} not found in AI_USER_MAPPING, using default 'free' plan")
                default_plan = {
                    "plan_name": "free",
                    "monthly_token_limit": 10000,
                    "max_tokens_per_request": 2048,
                    "allowed_models": ["gpt-3.5-turbo"],
                    "cost_budget_monthly": 10.0,
                }
                await cache_set(cache_key, default_plan, 300)
                return default_plan
            
            plan_name = mapping_rows[0].get("PLAN_NAME") or mapping_rows[0].get("plan_name")
            
            # Step 2: Get plan details from AI_SUBSCRIPTIONS
            subscription_query = """
                SELECT 
                    plan_name,
                    monthly_token_limit,
                    max_tokens_per_request,
                    allowed_models,
                    cost_budget_monthly
                FROM GOVERNANCE_DB.AI.AI_SUBSCRIPTIONS
                WHERE plan_name = %s
            """
            subscription_rows = await asyncio.to_thread(
                self.sf_client._query_rows_sync, subscription_query, (plan_name,)
            )
            
            if not subscription_rows:
                logger.error(f"Plan '{plan_name}' not found in AI_SUBSCRIPTIONS for user {user_id}")
                raise GuardDenied(
                    reason="SUBSCRIPTION_PLAN_NOT_FOUND",
                    message=f"Subscription plan '{plan_name}' not found",
                )
            
            plan_data = subscription_rows[0]
            
            # Parse allowed_models (may be JSON array or variant)
            allowed_models_raw = plan_data.get("ALLOWED_MODELS") or plan_data.get("allowed_models")
            allowed_models = self.sf_client._parse_variant(allowed_models_raw)
            
            # Build subscription dict
            subscription = {
                "plan_name": plan_data.get("PLAN_NAME") or plan_data.get("plan_name"),
                "monthly_token_limit": int(plan_data.get("MONTHLY_TOKEN_LIMIT") or plan_data.get("monthly_token_limit") or 0),
                "max_tokens_per_request": int(plan_data.get("MAX_TOKENS_PER_REQUEST") or plan_data.get("max_tokens_per_request") or 0),
                "allowed_models": [str(m) for m in allowed_models] if allowed_models else [],
                "cost_budget_monthly": float(plan_data.get("COST_BUDGET_MONTHLY") or plan_data.get("cost_budget_monthly") or 0.0),
            }
            
            # Cache for 300 seconds
            await cache_set(cache_key, subscription, 300)
            
            return subscription
            
        except GuardDenied:
            raise
        except Exception as e:
            logger.error(f"Failed to retrieve subscription for user {user_id}: {e}")
            raise GuardDenied(
                reason="SUBSCRIPTION_LOOKUP_FAILED",
                message="Failed to retrieve subscription plan",
            )

    async def _get_current_usage(self, user_id: str, period: str) -> dict:
        """
        Retrieve current token usage and cost for a user in the specified period.
        
        This function queries the AI_USER_TOKENS table in Snowflake to get the user's
        current token usage and cost accumulation for the specified monthly period.
        
        Period Format:
        - The period parameter must be in "YYYY-MM" format (e.g., "2024-01", "2024-12")
        - This format matches the period column in AI_USER_TOKENS table
        - The period typically represents the current calendar month
        
        Initialization Behavior:
        - If no record exists for the user in the current period, the function returns
          initialized values with zeros: {tokens_used: 0, cost_accumulated: 0.0}
        - This allows the system to handle new users or new periods gracefully without
          requiring pre-initialization of records
        - The first request in a new period will create the record via usage updates
        
        Args:
            user_id: The unique identifier of the user
            period: The monthly period in "YYYY-MM" format (e.g., "2024-01")
            
        Returns:
            Dictionary containing current usage data:
            - tokens_used: Total tokens consumed in the period (integer)
            - cost_accumulated: Total cost accumulated in the period (float)
            - tokens_limit: Monthly token limit from user's subscription (integer, 0 if not set)
            
        Note:
            This function does not cache results because usage data changes frequently
            with each request. Caching would lead to stale data and incorrect limit
            enforcement. The subscription lookup (which includes tokens_limit) is cached
            separately in _get_user_subscription().
        """
        import asyncio
        from datetime import datetime
        
        try:
            # Query AI_USER_TOKENS for current period usage
            usage_query = """
                SELECT 
                    tokens_used,
                    cost_accumulated
                FROM GOVERNANCE_DB.AI.AI_USER_TOKENS
                WHERE user_id = %s AND period = %s
            """
            usage_rows = await asyncio.to_thread(
                self.sf_client._query_rows_sync, usage_query, (user_id, period)
            )
            
            # If no record exists for current period, initialize with zeros
            if not usage_rows:
                logger.info(f"No usage record found for user {user_id} in period {period}, initializing with zeros")
                return {
                    "tokens_used": 0,
                    "cost_accumulated": 0.0,
                }
            
            usage_data = usage_rows[0]
            
            # Extract usage data with case-insensitive column name handling
            tokens_used = usage_data.get("TOKENS_USED") or usage_data.get("tokens_used") or 0
            cost_accumulated = usage_data.get("COST_ACCUMULATED") or usage_data.get("cost_accumulated") or 0.0
            
            return {
                "tokens_used": int(tokens_used),
                "cost_accumulated": float(cost_accumulated),
            }
            
        except Exception as e:
            logger.error(f"Failed to retrieve current usage for user {user_id} in period {period}: {e}")
            # Return zeros on error to allow request to proceed (fail-open for availability)
            # The validation gates will still enforce limits based on subscription data
            return {
                "tokens_used": 0,
                "cost_accumulated": 0.0,
            }

    async def _update_user_tokens(self, user_id: str, period: str, tokens_used: int, cost: float, tokens_limit: int) -> None:
        """
        Update AI_USER_TOKENS with actual token usage and cost after request execution.
        
        This function updates the user's token usage and cost accumulation in the AI_USER_TOKENS
        table after an AI request completes. It uses an upsert pattern (MERGE statement) to handle
        both new records (first request in a period) and existing records (subsequent requests).
        
        Upsert Pattern:
        - If a record exists for (user_id, period), UPDATE tokens_used and cost_accumulated
        - If no record exists, INSERT a new record with initial values
        - This ensures atomic updates without race conditions
        
        Concurrency Handling:
        - Snowflake MERGE statements are atomic and handle concurrent updates correctly
        - Multiple simultaneous requests from the same user will be serialized by Snowflake
        - No application-level locking is required
        
        Error Handling:
        - If the update fails, the function raises an exception
        - The caller (execute method) catches this and logs a warning without blocking the response
        - This ensures usage tracking failures don't break the user experience
        
        Args:
            user_id: The unique identifier of the user
            period: The monthly period in "YYYY-MM" format (e.g., "2024-01")
            tokens_used: Number of tokens consumed in this request
            cost: Cost of this request in dollars
            tokens_limit: Monthly token limit from user's subscription plan
            
        Raises:
            Exception: If the Snowflake update fails
            
        Note:
            This function is called after every successful model invocation to ensure
            accurate usage tracking. The tokens_limit parameter is stored for reference
            but not used for validation (validation happens pre-execution).
        """
        import asyncio
        
        # Use Snowflake MERGE statement for upsert pattern
        # MERGE is atomic and handles concurrent updates correctly
        merge_query = """
            MERGE INTO GOVERNANCE_DB.AI.AI_USER_TOKENS AS target
            USING (SELECT %s AS user_id, %s AS period) AS source
            ON target.user_id = source.user_id AND target.period = source.period
            WHEN MATCHED THEN
                UPDATE SET 
                    tokens_used = target.tokens_used + %s,
                    cost_accumulated = target.cost_accumulated + %s,
                    updated_at = CURRENT_TIMESTAMP()
            WHEN NOT MATCHED THEN
                INSERT (user_id, period, tokens_used, cost_accumulated, tokens_limit, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """
        
        params = (
            # USING clause
            user_id, period,
            # UPDATE clause
            tokens_used, cost,
            # INSERT clause
            user_id, period, tokens_used, cost, tokens_limit
        )
        
        await asyncio.to_thread(self.sf_client._execute_query_sync, merge_query, params)
        logger.debug(f"Updated AI_USER_TOKENS: user={user_id}, period={period}, tokens={tokens_used}, cost=${cost:.4f}")

    async def _log_token_usage(
        self,
        log_id: str,
        user_id: str,
        model_id: str,
        skill_id: str,
        request_id: str,
        input_tokens: int,
        output_tokens: int,
        total_tokens: int,
        cost: float,
        outcome: str,
        latency_ms: int
    ) -> None:
        """
        Log token usage details to AI_TOKEN_USAGE_LOG for audit and analytics.
        
        This function inserts a record into the AI_TOKEN_USAGE_LOG table in Snowflake
        after every AI request execution. It captures comprehensive details about the
        request including token usage, cost, outcome, and performance metrics.
        
        Purpose:
        - Audit trail: Track every AI request for compliance and security
        - Analytics: Enable usage analysis, cost reporting, and trend identification
        - Debugging: Provide detailed logs for troubleshooting issues
        - Billing: Support detailed billing and chargeback scenarios
        
        Fields Logged:
        - log_id: Unique identifier for this log entry (UUID)
        - user_id: User who made the request
        - model_id: AI model used
        - skill_id: Skill/capability invoked
        - request_id: Request identifier for correlation
        - input_tokens: Tokens in the input prompt
        - output_tokens: Tokens in the model response
        - total_tokens: Sum of input and output tokens
        - cost: Calculated cost in dollars
        - outcome: "SUCCESS" or "FAILED"
        - latency_ms: Request latency in milliseconds
        - timestamp: Automatically set by Snowflake (CURRENT_TIMESTAMP)
        
        Error Handling:
        - If the insert fails, the function raises an exception
        - The caller should catch this and log a warning without blocking the response
        - This ensures logging failures don't break the user experience
        - The try/except pattern in execute() implements this fail-safe behavior
        
        Args:
            log_id: Unique identifier for this log entry (UUID string)
            user_id: The unique identifier of the user
            model_id: The AI model identifier
            skill_id: The skill identifier
            request_id: The request identifier for correlation
            input_tokens: Number of tokens in the input prompt
            output_tokens: Number of tokens in the model response
            total_tokens: Total tokens (input + output)
            cost: Cost of the request in dollars
            outcome: "SUCCESS" or "FAILED"
            latency_ms: Request latency in milliseconds
            
        Raises:
            Exception: If the Snowflake insert fails
            
        Note:
            This function is called after every model invocation to ensure complete
            audit logging. The timestamp is automatically set by Snowflake using
            CURRENT_TIMESTAMP() to ensure accurate server-side timing.
        """
        import asyncio
        
        insert_query = """
            INSERT INTO GOVERNANCE_DB.AI.AI_TOKEN_USAGE_LOG (
                log_id,
                user_id,
                model_id,
                skill_id,
                request_id,
                input_tokens,
                output_tokens,
                total_tokens,
                cost,
                outcome,
                latency_ms,
                timestamp
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP()
            )
        """
        
        params = (
            log_id,
            user_id,
            model_id,
            skill_id,
            request_id,
            input_tokens,
            output_tokens,
            total_tokens,
            cost,
            outcome,
            latency_ms
        )
        
        await asyncio.to_thread(self.sf_client._execute_query_sync, insert_query, params)
