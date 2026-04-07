from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from .config import Settings
from .security import (
    ValidationError,
    apply_row_limit,
    enforce_safety,
    validate_days,
    validate_identifier,
    validate_max_rows,
)
from .snowflake_client import SnowflakeClient

ToolHandler = Callable[[dict[str, Any]], dict[str, Any]]


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]


class ToolRegistry:
    def __init__(self, settings: Settings, sf: SnowflakeClient) -> None:
        self.settings = settings
        self._default_sf = sf
        self._execution_scope = threading.local()
        self._tools: dict[str, tuple[ToolDefinition, ToolHandler]] = {}
        self._register_tools()

    @property
    def sf(self) -> SnowflakeClient:
        scoped = getattr(self._execution_scope, "sf", None)
        if scoped is not None:
            return scoped
        return self._default_sf

    def list_tools(self) -> list[ToolDefinition]:
        return [tool for tool, _ in self._tools.values()]

    def run_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        execution_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        entry = self._tools.get(name)
        if not entry:
            raise ValidationError(f"Unknown tool: {name}")
        _, handler = entry
        scoped_sf = (execution_context or {}).get("sf_client")
        if scoped_sf is None:
            return handler(arguments)

        previous = getattr(self._execution_scope, "sf", None)
        self._execution_scope.sf = scoped_sf
        try:
            return handler(arguments)
        finally:
            if previous is None:
                delattr(self._execution_scope, "sf")
            else:
                self._execution_scope.sf = previous

    def _register(self, definition: ToolDefinition, handler: ToolHandler) -> None:
        self._tools[definition.name] = (definition, handler)

    def _register_tools(self) -> None:
        self._register(
            ToolDefinition(
                name="run_query",
                description="Execute a Snowflake SQL query with safety checks and row limits.",
                input_schema={
                    "type": "object",
                    "required": ["query"],
                    "properties": {
                        "query": {"type": "string", "minLength": 1},
                        "max_rows": {"type": "integer", "minimum": 1},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "query_id": {"type": "string"},
                        "executed_query": {"type": "string"},
                        "columns": {"type": "array", "items": {"type": "string"}},
                        "rows": {"type": "array", "items": {"type": "array"}},
                        "row_count": {"type": "integer"},
                    },
                },
            ),
            self._run_query,
        )

        self._register(
            ToolDefinition(
                name="list_databases",
                description="List databases visible to the configured Snowflake role.",
                input_schema={"type": "object", "properties": {}},
                output_schema={
                    "type": "object",
                    "properties": {
                        "databases": {"type": "array", "items": {"type": "string"}},
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._list_databases,
        )

        self._register(
            ToolDefinition(
                name="list_schemas",
                description="List schemas in a given database.",
                input_schema={
                    "type": "object",
                    "required": ["database"],
                    "properties": {"database": {"type": "string", "minLength": 1}},
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "schemas": {"type": "array", "items": {"type": "string"}},
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._list_schemas,
        )

        self._register(
            ToolDefinition(
                name="list_tables",
                description="List tables in a given database schema.",
                input_schema={
                    "type": "object",
                    "required": ["database", "schema"],
                    "properties": {
                        "database": {"type": "string", "minLength": 1},
                        "schema": {"type": "string", "minLength": 1},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "tables": {"type": "array", "items": {"type": "string"}},
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._list_tables,
        )

        self._register(
            ToolDefinition(
                name="describe_table",
                description="Describe columns and metadata for a Snowflake table.",
                input_schema={
                    "type": "object",
                    "required": ["database", "schema", "table"],
                    "properties": {
                        "database": {"type": "string", "minLength": 1},
                        "schema": {"type": "string", "minLength": 1},
                        "table": {"type": "string", "minLength": 1},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "columns": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "type": {"type": "string"},
                                    "nullable": {"type": "string"},
                                    "default": {"type": ["string", "null"]},
                                },
                            },
                        },
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._describe_table,
        )

        self._register(
            ToolDefinition(
                name="list_warehouses",
                description="List Snowflake virtual warehouses.",
                input_schema={"type": "object", "properties": {}},
                output_schema={
                    "type": "object",
                    "properties": {
                        "warehouses": {"type": "array", "items": {"type": "string"}},
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._list_warehouses,
        )

        self._register(
            ToolDefinition(
                name="warehouse_usage",
                description="Summarize warehouse usage over the last N days using ACCOUNT_USAGE views.",
                input_schema={
                    "type": "object",
                    "required": ["warehouse", "days"],
                    "properties": {
                        "warehouse": {"type": "string", "minLength": 1},
                        "days": {"type": "integer", "minimum": 1, "maximum": 90},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "warehouse": {"type": "string"},
                        "days": {"type": "integer"},
                        "credits_used": {"type": "number"},
                        "avg_running": {"type": "number"},
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._warehouse_usage,
        )

        # ── SPRINT 1: DEEP SQL + EXPLORER ──

        self._register(
            ToolDefinition(
                name="explain_query",
                description="Get the query execution plan for a SQL statement using EXPLAIN.",
                input_schema={
                    "type": "object",
                    "required": ["query"],
                    "properties": {
                        "query": {"type": "string", "minLength": 1},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "plan": {"type": "string"},
                        "operations": {"type": "array", "items": {"type": "object"}},
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._explain_query,
        )

        self._register(
            ToolDefinition(
                name="get_query_profile",
                description="Get detailed execution profile for a completed query by query_id.",
                input_schema={
                    "type": "object",
                    "required": ["query_id"],
                    "properties": {
                        "query_id": {"type": "string", "minLength": 1},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "query_id": {"type": "string"},
                        "status": {"type": "string"},
                        "execution_time_ms": {"type": "number"},
                        "bytes_scanned": {"type": "number"},
                        "rows_produced": {"type": "number"},
                        "partitions_scanned": {"type": "number"},
                        "partitions_total": {"type": "number"},
                        "profile": {"type": "object"},
                    },
                },
            ),
            self._get_query_profile,
        )

        self._register(
            ToolDefinition(
                name="validate_sql",
                description="Validate a SQL statement without executing it using EXPLAIN.",
                input_schema={
                    "type": "object",
                    "required": ["query"],
                    "properties": {
                        "query": {"type": "string", "minLength": 1},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "valid": {"type": "boolean"},
                        "errors": {"type": "array", "items": {"type": "string"}},
                        "warnings": {"type": "array", "items": {"type": "string"}},
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._validate_sql,
        )

        self._register(
            ToolDefinition(
                name="search_objects",
                description="Search for database objects (tables, views, procedures) by name pattern.",
                input_schema={
                    "type": "object",
                    "required": ["keyword"],
                    "properties": {
                        "keyword": {"type": "string", "minLength": 1},
                        "database": {"type": "string"},
                        "object_types": {"type": "array", "items": {"type": "string"}},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "results": {"type": "array", "items": {"type": "object"}},
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._search_objects,
        )

        self._register(
            ToolDefinition(
                name="get_table_stats",
                description="Get table statistics including row count, size, and cluster info.",
                input_schema={
                    "type": "object",
                    "required": ["database", "schema", "table"],
                    "properties": {
                        "database": {"type": "string", "minLength": 1},
                        "schema": {"type": "string", "minLength": 1},
                        "table": {"type": "string", "minLength": 1},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "table_name": {"type": "string"},
                        "row_count": {"type": "number"},
                        "bytes": {"type": "number"},
                        "created": {"type": "string"},
                        "last_altered": {"type": "string"},
                        "cluster_by": {"type": "string"},
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._get_table_stats,
        )

        self._register(
            ToolDefinition(
                name="preview_table",
                description="Preview sample rows and column profiles from a table.",
                input_schema={
                    "type": "object",
                    "required": ["database", "schema", "table"],
                    "properties": {
                        "database": {"type": "string", "minLength": 1},
                        "schema": {"type": "string", "minLength": 1},
                        "table": {"type": "string", "minLength": 1},
                        "sample_pct": {"type": "number", "minimum": 0.01, "maximum": 100},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "columns": {"type": "array", "items": {"type": "string"}},
                        "sample_rows": {"type": "array", "items": {"type": "array"}},
                        "column_profiles": {"type": "array", "items": {"type": "object"}},
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._preview_table,
        )

        self._register(
            ToolDefinition(
                name="get_column_profile",
                description="Get detailed profile for a specific column including distribution and stats.",
                input_schema={
                    "type": "object",
                    "required": ["database", "schema", "table", "column"],
                    "properties": {
                        "database": {"type": "string", "minLength": 1},
                        "schema": {"type": "string", "minLength": 1},
                        "table": {"type": "string", "minLength": 1},
                        "column": {"type": "string", "minLength": 1},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "column_name": {"type": "string"},
                        "data_type": {"type": "string"},
                        "null_count": {"type": "number"},
                        "null_pct": {"type": "number"},
                        "distinct_count": {"type": "number"},
                        "min_value": {"type": "string"},
                        "max_value": {"type": "string"},
                        "top_values": {"type": "array", "items": {"type": "object"}},
                        "query_id": {"type": "string"},
                    },
                },
            ),
            self._get_column_profile,
        )

        self._register(
            ToolDefinition(
                name="format_sql",
                description="Format a SQL query for readability.",
                input_schema={
                    "type": "object",
                    "required": ["query"],
                    "properties": {
                        "query": {"type": "string", "minLength": 1},
                        "indent_size": {"type": "integer", "minimum": 1, "maximum": 8},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "formatted_query": {"type": "string"},
                    },
                },
            ),
            self._format_sql,
        )

        # ── SPRINT 2: GOVERNANCE + COST ──

        self._register(
            ToolDefinition(
                name="get_object_lineage",
                description="Get upstream and downstream dependencies for a Snowflake object.",
                input_schema={
                    "type": "object",
                    "required": ["database", "schema", "table"],
                    "properties": {
                        "database": {"type": "string", "minLength": 1},
                        "schema": {"type": "string", "minLength": 1},
                        "table": {"type": "string", "minLength": 1},
                        "direction": {"type": "string", "enum": ["upstream", "downstream", "both"]},
                    },
                },
                output_schema={
                    "type": "object",
                    "properties": {
                        "object": {"type": "string"},
                        "upstream": {"type": "array", "items": {"type": "object"}},
                        "downstream": {"type": "array", "items": {"type": "object"}},
                    },
                },
            ),
            self._get_object_lineage,
        )

        self._register(
            ToolDefinition(
                name="get_access_history",
                description="Get access history for a Snowflake object.",
                input_schema={
                    "type": "object",
                    "required": ["database", "schema", "table"],
                    "properties": {
                        "database": {"type": "string", "minLength": 1},
                        "schema": {"type": "string", "minLength": 1},
                        "table": {"type": "string", "minLength": 1},
                        "days": {"type": "integer", "minimum": 1, "maximum": 90},
                    },
                },
                output_schema={"type": "object", "properties": {"object": {"type": "string"}, "accesses": {"type": "array"}}},
            ),
            self._get_access_history,
        )

        self._register(
            ToolDefinition(
                name="run_quality_checks",
                description="Run data quality checks on a table.",
                input_schema={
                    "type": "object",
                    "required": ["database", "schema", "table"],
                    "properties": {
                        "database": {"type": "string", "minLength": 1},
                        "schema": {"type": "string", "minLength": 1},
                        "table": {"type": "string", "minLength": 1},
                    },
                },
                output_schema={"type": "object", "properties": {"table": {"type": "string"}, "checks": {"type": "array"}}},
            ),
            self._run_quality_checks,
        )

        self._register(
            ToolDefinition(
                name="classify_columns",
                description="Auto-classify columns for PII/sensitivity using Snowflake CLASSIFY.",
                input_schema={
                    "type": "object",
                    "required": ["database", "schema", "table"],
                    "properties": {
                        "database": {"type": "string", "minLength": 1},
                        "schema": {"type": "string", "minLength": 1},
                        "table": {"type": "string", "minLength": 1},
                    },
                },
                output_schema={"type": "object", "properties": {"table": {"type": "string"}, "classification": {"type": "array"}}},
            ),
            self._classify_columns,
        )

        self._register(
            ToolDefinition(
                name="get_credit_usage",
                description="Get Snowflake credit usage by service type.",
                input_schema={"type": "object", "properties": {"days": {"type": "integer", "minimum": 1, "maximum": 90}}},
                output_schema={"type": "object", "properties": {"days": {"type": "integer"}, "total_credits": {"type": "number"}, "by_service": {"type": "array"}}},
            ),
            self._get_credit_usage,
        )

        self._register(
            ToolDefinition(
                name="get_top_cost_queries",
                description="Get the most expensive queries by execution time.",
                input_schema={"type": "object", "properties": {"days": {"type": "integer"}, "limit": {"type": "integer"}}},
                output_schema={"type": "object", "properties": {"days": {"type": "integer"}, "queries": {"type": "array"}}},
            ),
            self._get_top_cost_queries,
        )

        self._register(
            ToolDefinition(
                name="detect_idle_warehouses",
                description="Detect warehouses with low utilization.",
                input_schema={"type": "object", "properties": {"days": {"type": "integer"}, "threshold_pct": {"type": "number"}}},
                output_schema={"type": "object", "properties": {"days": {"type": "integer"}, "idle_warehouses": {"type": "array"}}},
            ),
            self._detect_idle_warehouses,
        )

        self._register(
            ToolDefinition(
                name="get_storage_costs",
                description="Get storage costs by database.",
                input_schema={"type": "object", "properties": {"days": {"type": "integer"}}},
                output_schema={"type": "object", "properties": {"days": {"type": "integer"}, "total_gb": {"type": "number"}, "by_database": {"type": "array"}}},
            ),
            self._get_storage_costs,
        )

        # ── SPRINT 3: CORTEX AI FUNCTIONS ──

        self._register(
            ToolDefinition(
                name="cortex_complete",
                description="Call Snowflake Cortex COMPLETE function for text generation.",
                input_schema={
                    "type": "object",
                    "required": ["prompt"],
                    "properties": {
                        "prompt": {"type": "string", "minLength": 1},
                        "model": {"type": "string"},
                        "max_tokens": {"type": "integer"},
                    },
                },
                output_schema={"type": "object", "properties": {"model": {"type": "string"}, "response": {"type": "string"}}},
            ),
            self._cortex_complete,
        )

        self._register(
            ToolDefinition(
                name="cortex_summarize",
                description="Summarize text using Snowflake Cortex SUMMARIZE.",
                input_schema={"type": "object", "required": ["text"], "properties": {"text": {"type": "string", "minLength": 1}}},
                output_schema={"type": "object", "properties": {"summary": {"type": "string"}}},
            ),
            self._cortex_summarize,
        )

        self._register(
            ToolDefinition(
                name="cortex_sentiment",
                description="Analyze sentiment using Snowflake Cortex SENTIMENT.",
                input_schema={"type": "object", "required": ["text"], "properties": {"text": {"type": "string", "minLength": 1}}},
                output_schema={"type": "object", "properties": {"score": {"type": "number"}, "label": {"type": "string"}}},
            ),
            self._cortex_sentiment,
        )

        self._register(
            ToolDefinition(
                name="cortex_classify_text",
                description="Classify text into categories using Snowflake Cortex.",
                input_schema={"type": "object", "required": ["text", "categories"], "properties": {"text": {"type": "string"}, "categories": {"type": "array"}}},
                output_schema={"type": "object", "properties": {"classification": {"type": "string"}}},
            ),
            self._cortex_classify_text,
        )

        self._register(
            ToolDefinition(
                name="cortex_translate",
                description="Translate text using Snowflake Cortex TRANSLATE.",
                input_schema={"type": "object", "required": ["text", "target_language"], "properties": {"text": {"type": "string"}, "target_language": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"translated": {"type": "string"}, "target_language": {"type": "string"}}},
            ),
            self._cortex_translate,
        )

        self._register(
            ToolDefinition(
                name="cortex_analyst_query",
                description="Query using Snowflake Cortex Analyst with a semantic model.",
                input_schema={"type": "object", "required": ["question"], "properties": {"question": {"type": "string"}, "model_path": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"question": {"type": "string"}, "result": {"type": "string"}}},
            ),
            self._cortex_analyst_query,
        )

        # ── SPRINT 4: DBT STUDIO ──

        self._register(
            ToolDefinition(
                name="scaffold_dbt_project",
                description="Generate a dbt project skeleton.",
                input_schema={"type": "object", "required": ["project_name"], "properties": {"project_name": {"type": "string"}, "database": {"type": "string"}, "schema": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"project_name": {"type": "string"}, "files": {"type": "object"}}},
            ),
            self._scaffold_dbt_project,
        )

        self._register(
            ToolDefinition(
                name="generate_dbt_model",
                description="Generate a dbt staging model from a table.",
                input_schema={"type": "object", "required": ["database", "schema", "table"], "properties": {"database": {"type": "string"}, "schema": {"type": "string"}, "table": {"type": "string"}, "model_name": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"model_name": {"type": "string"}, "model_sql": {"type": "string"}, "schema_yaml": {"type": "string"}}},
            ),
            self._generate_dbt_model,
        )

        self._register(
            ToolDefinition(
                name="generate_dbt_tests",
                description="Generate dbt test YAML for a model.",
                input_schema={"type": "object", "required": ["database", "schema", "table"], "properties": {"database": {"type": "string"}, "schema": {"type": "string"}, "table": {"type": "string"}, "model_name": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"model_name": {"type": "string"}, "tests_yaml": {"type": "string"}}},
            ),
            self._generate_dbt_tests,
        )

        # ── SPRINT 5: OPERATIONS + SECURITY ──

        self._register(
            ToolDefinition(
                name="get_role_hierarchy",
                description="Get the Snowflake role hierarchy.",
                input_schema={"type": "object", "properties": {}},
                output_schema={"type": "object", "properties": {"roles": {"type": "object"}, "total_roles": {"type": "integer"}}},
            ),
            self._get_role_hierarchy,
        )

        self._register(
            ToolDefinition(
                name="check_effective_privileges",
                description="Check effective privileges for a role.",
                input_schema={"type": "object", "required": ["role"], "properties": {"role": {"type": "string"}, "object_name": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"role": {"type": "string"}, "privileges": {"type": "array"}}},
            ),
            self._check_effective_privileges,
        )

        self._register(
            ToolDefinition(
                name="audit_role_usage",
                description="Audit which roles have been used recently.",
                input_schema={"type": "object", "properties": {"days": {"type": "integer"}}},
                output_schema={"type": "object", "properties": {"days": {"type": "integer"}, "used_roles": {"type": "object"}}},
            ),
            self._audit_role_usage,
        )

        self._register(
            ToolDefinition(
                name="run_security_scan",
                description="Run a security posture scan on the account.",
                input_schema={"type": "object", "properties": {}},
                output_schema={"type": "object", "properties": {"findings": {"type": "array"}, "total_findings": {"type": "integer"}}},
            ),
            self._run_security_scan,
        )

        self._register(
            ToolDefinition(
                name="get_unprotected_columns",
                description="Find PII columns without masking policies.",
                input_schema={"type": "object", "properties": {"database": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"unprotected_columns": {"type": "array"}}},
            ),
            self._get_unprotected_columns,
        )

        self._register(
            ToolDefinition(
                name="search_snowflake_docs",
                description="Search Snowflake documentation.",
                input_schema={"type": "object", "required": ["query"], "properties": {"query": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"results": {"type": "array"}}},
            ),
            self._search_snowflake_docs,
        )

        self._register(
            ToolDefinition(
                name="list_models",
                description="List registered ML models.",
                input_schema={"type": "object", "properties": {}},
                output_schema={"type": "object", "properties": {"models": {"type": "array"}}},
            ),
            self._list_models,
        )

        # ── SPRINT 7: STREAMLIT + MARKETPLACE ──

        self._register(
            ToolDefinition(
                name="create_streamlit_app",
                description="Create a Streamlit in Snowflake app scaffold.",
                input_schema={"type": "object", "required": ["app_name"], "properties": {"app_name": {"type": "string"}, "database": {"type": "string"}, "schema": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"app_name": {"type": "string"}, "sample_code": {"type": "string"}}},
            ),
            self._create_streamlit_app,
        )

        self._register(
            ToolDefinition(
                name="list_streamlit_apps",
                description="List Streamlit apps in the account.",
                input_schema={"type": "object", "properties": {}},
                output_schema={"type": "object", "properties": {"apps": {"type": "array"}}},
            ),
            self._list_streamlit_apps,
        )

        self._register(
            ToolDefinition(
                name="search_marketplace",
                description="Search Snowflake Marketplace listings.",
                input_schema={"type": "object", "required": ["keyword"], "properties": {"keyword": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"results": {"type": "array"}}},
            ),
            self._search_marketplace,
        )

        # ── SPRINT 8: WORKFLOW ORCHESTRATION ──

        self._register(
            ToolDefinition(
                name="create_task",
                description="Create a workflow task.",
                input_schema={"type": "object", "required": ["title"], "properties": {"title": {"type": "string"}, "description": {"type": "string"}, "priority": {"type": "string"}, "skill": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"task_id": {"type": "string"}, "title": {"type": "string"}, "status": {"type": "string"}}},
            ),
            self._create_task,
        )

        self._register(
            ToolDefinition(
                name="decompose_goal",
                description="Decompose a high-level goal into subtasks.",
                input_schema={"type": "object", "required": ["goal"], "properties": {"goal": {"type": "string"}}},
                output_schema={"type": "object", "properties": {"goal": {"type": "string"}, "subtasks": {"type": "array"}}},
            ),
            self._decompose_goal,
        )

    def _run_query(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query", "")).strip()
        if not query:
            raise ValidationError("query is required")

        enforce_safety(query, self.settings.sql_safety_mode)
        requested_max_rows = validate_max_rows(args.get("max_rows"), self.settings.sql_max_rows)
        limited_query = apply_row_limit(query, min(requested_max_rows, self.settings.sql_default_row_limit))
        result = self.sf.execute_query(limited_query)
        result["executed_query"] = limited_query
        return result

    def _list_databases(self, _args: dict[str, Any]) -> dict[str, Any]:
        return self.sf.execute_list(
            "SHOW DATABASES",
            "databases",
            value_column_candidates=["name", "database_name"],
        )

    def _list_schemas(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database")
        return self.sf.execute_list(
            f"SHOW SCHEMAS IN DATABASE {database}",
            "schemas",
            value_column_candidates=["name", "schema_name"],
        )

    def _list_tables(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database")
        schema = validate_identifier(str(args.get("schema", "")), "schema")
        return self.sf.execute_list(
            f"SHOW TABLES IN SCHEMA {database}.{schema}",
            "tables",
            value_column_candidates=["name", "table_name"],
        )

    def _describe_table(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database")
        schema = validate_identifier(str(args.get("schema", "")), "schema")
        table = validate_identifier(str(args.get("table", "")), "table")
        result = self.sf.execute_query(f"DESC TABLE {database}.{schema}.{table}")

        columns: list[dict[str, Any]] = []
        for row in result["rows"]:
            columns.append(
                {
                    "name": row[0] if len(row) > 0 else None,
                    "type": row[1] if len(row) > 1 else None,
                    "nullable": row[3] if len(row) > 3 else None,
                    "default": row[4] if len(row) > 4 else None,
                }
            )

        return {"columns": columns, "query_id": result["query_id"]}

    def _list_warehouses(self, _args: dict[str, Any]) -> dict[str, Any]:
        return self.sf.execute_list(
            "SHOW WAREHOUSES",
            "warehouses",
            value_column_candidates=["name", "warehouse_name"],
        )

    def _warehouse_usage(self, args: dict[str, Any]) -> dict[str, Any]:
        warehouse = validate_identifier(str(args.get("warehouse", "")), "warehouse")
        days = validate_days(int(args.get("days", 0)))

        start_ts = datetime.now(timezone.utc) - timedelta(days=days)
        query = """
            SELECT
                WAREHOUSE_NAME,
                COALESCE(SUM(AVG_RUNNING), 0) AS TOTAL_AVG_RUNNING,
                COALESCE(SUM(CREDITS_USED), 0) AS TOTAL_CREDITS_USED
            FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_LOAD_HISTORY
            WHERE WAREHOUSE_NAME = %s
              AND START_TIME >= %s
            GROUP BY WAREHOUSE_NAME
        """.strip()

        result = self.sf.execute_query(
            query,
            (warehouse.upper(), start_ts.strftime("%Y-%m-%d %H:%M:%S")),
        )
        if not result["rows"]:
            return {
                "warehouse": warehouse,
                "days": days,
                "credits_used": 0,
                "avg_running": 0,
                "query_id": result["query_id"],
            }

        row = result["rows"][0]
        return {
            "warehouse": warehouse,
            "days": days,
            "credits_used": float(row[2] or 0),
            "avg_running": float(row[1] or 0),
            "query_id": result["query_id"],
        }

    # ── SPRINT 1 HANDLERS ──

    def _explain_query(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query", "")).strip()
        if not query:
            raise ValidationError("query is required")

        enforce_safety(query, self.settings.sql_safety_mode)
        result = self.sf.execute_query(f"EXPLAIN USING TABULAR {query}")

        operations: list[dict[str, Any]] = []
        for row in result.get("rows", []):
            if len(row) >= 2:
                operations.append({
                    "id": str(row[0]) if row[0] else "",
                    "operation": str(row[1]) if row[1] else "",
                    "details": str(row[2]) if len(row) > 2 and row[2] else "",
                })

        return {
            "plan": "\n".join(str(row[0]) for row in result.get("rows", []) if row[0]),
            "operations": operations,
            "query_id": result["query_id"],
        }

    def _get_query_profile(self, args: dict[str, Any]) -> dict[str, Any]:
        query_id = str(args.get("query_id", "")).strip()
        if not query_id:
            raise ValidationError("query_id is required")

        query = """
            SELECT
                QUERY_ID,
                QUERY_TEXT,
                STATUS,
                EXECUTION_TIME,
                BYTES_SCANNED,
                ROWS_PRODUCED,
                PARTITIONS_SCANNED,
                PARTITIONS_TOTAL,
                QUEUED_PROVISIONING_TIME,
                QUEUED_REPAIR_TIME,
                QUEUED_OVERLOAD_TIME,
                TRANSACTION_BLOCKED_TIME,
                ERROR_CODE,
                ERROR_MESSAGE
            FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
            WHERE QUERY_ID = %s
            LIMIT 1
        """.strip()

        result = self.sf.execute_query(query, (query_id,))
        if not result["rows"]:
            return {"query_id": query_id, "error": "Query not found"}

        row = result["rows"][0]
        return {
            "query_id": row[0],
            "query_text": str(row[1])[:500] if row[1] else "",
            "status": row[2],
            "execution_time_ms": float(row[3] or 0),
            "bytes_scanned": float(row[4] or 0),
            "rows_produced": int(row[5] or 0),
            "partitions_scanned": int(row[6] or 0),
            "partitions_total": int(row[7] or 0),
            "queued_provisioning_ms": float(row[8] or 0),
            "queued_repair_ms": float(row[9] or 0),
            "queued_overload_ms": float(row[10] or 0),
            "transaction_blocked_ms": float(row[11] or 0),
            "error_code": row[12],
            "error_message": row[13],
        }

    def _validate_sql(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query", "")).strip()
        if not query:
            raise ValidationError("query is required")

        try:
            result = self.sf.execute_query(f"EXPLAIN USING TABULAR {query}")
            return {
                "valid": True,
                "errors": [],
                "warnings": [],
                "query_id": result["query_id"],
            }
        except Exception as e:
            error_msg = str(e)
            return {
                "valid": False,
                "errors": [error_msg],
                "warnings": [],
                "query_id": "",
            }

    def _search_objects(self, args: dict[str, Any]) -> dict[str, Any]:
        keyword = str(args.get("keyword", "")).strip()
        if not keyword:
            raise ValidationError("keyword is required")

        database = args.get("database")
        object_types = args.get("object_types", ["TABLE", "VIEW"])

        keyword_pattern = f"%{keyword.upper()}%"
        results: list[dict[str, Any]] = []

        type_filter = ""
        safe_object_types: list[str] = []
        allowed_object_types = {
            "BASE TABLE",
            "EXTERNAL TABLE",
            "EVENT TABLE",
            "HYBRID TABLE",
            "ICEBERG TABLE",
            "MATERIALIZED VIEW",
            "VIEW",
        }
        if object_types:
            for object_type in object_types:
                candidate = str(object_type).strip().upper()
                if candidate in allowed_object_types:
                    safe_object_types.append(candidate)
            if safe_object_types:
                placeholders = ", ".join(["%s"] * len(safe_object_types))
                type_filter = f"AND TABLE_TYPE IN ({placeholders})"

        if database:
            db_list = [validate_identifier(str(database), "database")]
        else:
            db_list = self._get_databases()

        for db in db_list:
            try:
                q = f"""
                    SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
                    FROM {db}.INFORMATION_SCHEMA.TABLES
                    WHERE UPPER(TABLE_NAME) LIKE %s
                    {type_filter}
                    ORDER BY TABLE_NAME
                    LIMIT 50
                """.strip()
                params: list[Any] = [keyword_pattern]
                params.extend(safe_object_types)
                res = self.sf.execute_query(q, tuple(params))
                for row in res["rows"]:
                    results.append({
                        "database": row[0],
                        "schema": row[1],
                        "name": row[2],
                        "type": row[3],
                    })
            except Exception:
                continue

        return {"results": results, "query_id": ""}

    def _get_databases(self) -> list[str]:
        try:
            res = self.sf.execute_list("SHOW DATABASES", "databases", ["name", "database_name"])
            return res.get("databases", [])
        except Exception:
            return []

    def _get_table_stats(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database")
        schema = validate_identifier(str(args.get("schema", "")), "schema")
        table = validate_identifier(str(args.get("table", "")), "table")

        query = f"""
            SELECT
                TABLE_NAME,
                ROW_COUNT,
                BYTES,
                CREATED,
                LAST_ALTERTED,
                CLUSTERING_KEY
            FROM {database}.INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = %s
              AND TABLE_NAME = %s
            LIMIT 1
        """.strip()

        result = self.sf.execute_query(query, (schema, table))
        if not result["rows"]:
            return {"table_name": f"{database}.{schema}.{table}", "error": "Table not found"}

        row = result["rows"][0]
        return {
            "table_name": f"{database}.{schema}.{table}",
            "row_count": int(row[1] or 0),
            "bytes": int(row[2] or 0),
            "created": str(row[3]) if row[3] else None,
            "last_altered": str(row[4]) if row[4] else None,
            "cluster_by": row[5],
            "query_id": result["query_id"],
        }

    def _preview_table(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database")
        schema = validate_identifier(str(args.get("schema", "")), "schema")
        table = validate_identifier(str(args.get("table", "")), "table")
        sample_pct = float(args.get("sample_pct", 10))

        full_table = f"{database}.{schema}.{table}"

        # Get columns
        desc_result = self.sf.execute_query(f"DESC TABLE {full_table}")
        columns = [row[0] for row in desc_result["rows"] if row[0]]

        # Get sample rows
        sample_query = f"SELECT * FROM {full_table} TABLESAMPLE BERNOULLI ({sample_pct}) LIMIT 20"
        sample_result = self.sf.execute_query(sample_query)

        # Get column profiles (null counts)
        profile_parts: list[str] = []
        for col in columns[:20]:  # Limit to first 20 columns
            profile_parts.append(f"COUNT_IF({col} IS NULL) AS {col}_nulls")
        profile_query = f"SELECT {', '.join(profile_parts)} FROM {full_table} TABLESAMPLE BERNOULLI ({sample_pct})"
        profile_result = self.sf.execute_query(profile_query)

        column_profiles: list[dict[str, Any]] = []
        if profile_result["rows"]:
            profile_row = profile_result["rows"][0]
            for i, col in enumerate(columns[:20]):
                column_profiles.append({
                    "name": col,
                    "null_count": int(profile_row[i] or 0),
                })

        return {
            "columns": columns,
            "sample_rows": sample_result["rows"],
            "column_profiles": column_profiles,
            "query_id": sample_result["query_id"],
        }

    def _get_column_profile(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database")
        schema = validate_identifier(str(args.get("schema", "")), "schema")
        table = validate_identifier(str(args.get("table", "")), "table")
        column = validate_identifier(str(args.get("column", "")), "column")

        full_table = f"{database}.{schema}.{table}"

        # Get column info from DESC
        desc_result = self.sf.execute_query(f"DESC TABLE {full_table}")
        data_type = "UNKNOWN"
        for row in desc_result["rows"]:
            if row[0] and row[0].upper() == column.upper():
                data_type = row[1]
                break

        # Get stats
        stats_query = f"""
            SELECT
                COUNT(*) AS total_rows,
                COUNT_IF({column} IS NULL) AS null_count,
                COUNT(DISTINCT {column}) AS distinct_count,
                MIN({column}) AS min_value,
                MAX({column}) AS max_value
            FROM {full_table}
        """.strip()

        stats_result = self.sf.execute_query(stats_query)
        if not stats_result["rows"]:
            return {"column_name": column, "error": "Could not profile column"}

        stats_row = stats_result["rows"][0]
        total_rows = int(stats_row[0] or 0)
        null_count = int(stats_row[1] or 0)
        distinct_count = int(stats_row[2] or 0)

        # Get top values
        top_query = f"""
            SELECT {column}, COUNT(*) AS cnt
            FROM {full_table}
            WHERE {column} IS NOT NULL
            GROUP BY {column}
            ORDER BY cnt DESC
            LIMIT 10
        """.strip()

        try:
            top_result = self.sf.execute_query(top_query)
            top_values = [{"value": str(row[0]), "count": int(row[1])} for row in top_result["rows"]]
        except Exception:
            top_values = []

        return {
            "column_name": column,
            "data_type": data_type,
            "null_count": null_count,
            "null_pct": round(null_count / total_rows * 100, 2) if total_rows > 0 else 0,
            "distinct_count": distinct_count,
            "min_value": str(stats_row[3]) if stats_row[3] else None,
            "max_value": str(stats_row[4]) if stats_row[4] else None,
            "top_values": top_values,
            "query_id": stats_result["query_id"],
        }

    def _format_sql(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query", "")).strip()
        if not query:
            raise ValidationError("query is required")

        # Simple SQL formatting - normalize whitespace and add indentation
        import re

        # Keywords to uppercase
        keywords = [
            "SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
            "OUTER JOIN", "CROSS JOIN", "ON", "AND", "OR", "NOT", "IN", "EXISTS",
            "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET", "UNION", "UNION ALL",
            "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "TRUNCATE",
            "INTO", "VALUES", "SET", "AS", "WITH", "RECURSIVE", "CASE", "WHEN",
            "THEN", "ELSE", "END", "DISTINCT", "ALL", "BETWEEN", "LIKE", "IS",
            "NULL", "TRUE", "FALSE", "ASC", "DESC", "OVER", "PARTITION BY",
            "WINDOW", "QUALIFY", "SAMPLE", "TABLESAMPLE", "LATERAL", "FLATTEN"
        ]

        formatted = query
        for kw in sorted(keywords, key=len, reverse=True):
            formatted = re.sub(rf'\b{kw}\b', kw, formatted, flags=re.IGNORECASE)

        # Add newlines after major clauses
        for clause in ["SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "OUTER JOIN", "CROSS JOIN"]:
            formatted = re.sub(rf'\b{clause}\b', f'\n{clause}', formatted)

        # Clean up
        formatted = formatted.strip()
        lines = formatted.split('\n')
        indent_level = 0
        formatted_lines: list[str] = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if line.startswith(('WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT')):
                indent_level = 1
            formatted_lines.append('    ' * indent_level + line)

        return {"formatted_query": '\n'.join(formatted_lines)}

    # ── SPRINT 2: GOVERNANCE + COST ──

    def _get_object_lineage(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database")
        schema = validate_identifier(str(args.get("schema", "")), "schema")
        table = validate_identifier(str(args.get("table", "")), "table")
        direction = str(args.get("direction", "both")).lower()

        full_name = f"{database}.{schema}.{table}"

        if direction in ("upstream", "both"):
            up_query = """
                SELECT REFERENCED_OBJECT_NAME, REFERENCED_OBJECT_DOMAIN
                FROM SNOWFLAKE.ACCOUNT_USAGE.OBJECT_DEPENDENCIES
                WHERE OBJECT_NAME = %s
                  AND OBJECT_DATABASE = %s
                  AND OBJECT_SCHEMA = %s
            """.strip()
            up_result = self.sf.execute_query(up_query, (table, database, schema))
            upstream = [{"name": row[0], "type": row[1]} for row in up_result["rows"]]
        else:
            upstream = []

        if direction in ("downstream", "both"):
            down_query = """
                SELECT OBJECT_NAME, OBJECT_DOMAIN
                FROM SNOWFLAKE.ACCOUNT_USAGE.OBJECT_DEPENDENCIES
                WHERE REFERENCED_OBJECT_NAME = %s
                  AND REFERENCED_OBJECT_DATABASE = %s
                  AND REFERENCED_OBJECT_SCHEMA = %s
            """.strip()
            down_result = self.sf.execute_query(down_query, (table, database, schema))
            downstream = [{"name": row[0], "type": row[1]} for row in down_result["rows"]]
        else:
            downstream = []

        return {
            "object": full_name,
            "upstream": upstream,
            "downstream": downstream,
            "query_id": "",
        }

    def _get_access_history(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database").upper()
        schema = validate_identifier(str(args.get("schema", "")), "schema").upper()
        table = validate_identifier(str(args.get("table", "")), "table").upper()
        days = validate_days(int(args.get("days", 7)))

        start_ts = datetime.now(timezone.utc) - timedelta(days=days)
        object_name = f"{database}.{schema}.{table}"

        query = """
            SELECT USER_NAME, QUERY_ID, QUERY_START_TIME, OBJECTS_MODIFIED
            FROM SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY
            WHERE QUERY_START_TIME >= %s
              AND ARRAY_CONTAINS(%s::VARIANT, DIRECT_OBJECTS_ACCESSED)
            ORDER BY QUERY_START_TIME DESC
            LIMIT 50
        """.strip()

        try:
            result = self.sf.execute_query(
                query,
                (start_ts.strftime("%Y-%m-%d %H:%M:%S"), object_name),
            )
            accesses = [{
                "user": row[0],
                "query_id": row[1],
                "timestamp": str(row[2]) if row[2] else None,
            } for row in result["rows"]]
        except Exception:
            accesses = []

        return {"object": object_name, "accesses": accesses, "days": days}

    def _run_quality_checks(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database")
        schema = validate_identifier(str(args.get("schema", "")), "schema")
        table = validate_identifier(str(args.get("table", "")), "table")

        full_table = f"{database}.{schema}.{table}"
        checks = []

        # Get columns
        desc_result = self.sf.execute_query(f"DESC TABLE {full_table}")
        columns = [row[0] for row in desc_result["rows"] if row[0]]

        # Run basic checks
        try:
            count_result = self.sf.execute_query(f"SELECT COUNT(*) FROM {full_table}")
            total_rows = int(count_result["rows"][0][0]) if count_result["rows"] else 0
            checks.append({"check": "row_count", "status": "pass" if total_rows > 0 else "fail", "value": total_rows})
        except Exception as e:
            checks.append({"check": "row_count", "status": "error", "error": str(e)})

        # Check null rates for first 10 columns
        for col in columns[:10]:
            try:
                null_query = f"SELECT COUNT_IF({col} IS NULL) * 100.0 / COUNT(*) FROM {full_table}"
                null_result = self.sf.execute_query(null_query)
                null_pct = float(null_result["rows"][0][0]) if null_result["rows"] else 0
                status = "pass" if null_pct < 50 else "warn" if null_pct < 90 else "fail"
                checks.append({"check": f"{col}_null_rate", "status": status, "value": round(null_pct, 2)})
            except Exception:
                pass

        return {"table": full_table, "checks": checks, "total_checks": len(checks)}

    def _classify_columns(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database")
        schema = validate_identifier(str(args.get("schema", "")), "schema")
        table = validate_identifier(str(args.get("table", "")), "table")

        full_table = f"{database}.{schema}.{table}"

        try:
            classify_result = self.sf.execute_query(
                "CALL SYSTEM$CLASSIFY(%s, {'auto_classify': true})",
                (full_table,),
            )
            return {"table": full_table, "classification": classify_result["rows"], "query_id": classify_result["query_id"]}
        except Exception as e:
            return {"table": full_table, "error": str(e), "classification": []}

    def _get_credit_usage(self, args: dict[str, Any]) -> dict[str, Any]:
        days = validate_days(int(args.get("days", 7)))
        start_ts = datetime.now(timezone.utc) - timedelta(days=days)

        query = """
            SELECT SERVICE_TYPE, SUM(CREDITS_USED) AS total_credits
            FROM SNOWFLAKE.ACCOUNT_USAGE.METERING_HISTORY
            WHERE START_TIME >= %s
            GROUP BY SERVICE_TYPE
            ORDER BY total_credits DESC
        """.strip()

        result = self.sf.execute_query(query, (start_ts.strftime("%Y-%m-%d %H:%M:%S"),))
        usage = [{"service": row[0], "credits": float(row[1] or 0)} for row in result["rows"]]

        total = sum(u["credits"] for u in usage)
        return {"days": days, "total_credits": round(total, 4), "by_service": usage}

    def _get_top_cost_queries(self, args: dict[str, Any]) -> dict[str, Any]:
        days = validate_days(int(args.get("days", 7)))
        limit = max(1, min(int(args.get("limit", 10)), 50))
        start_ts = datetime.now(timezone.utc) - timedelta(days=days)

        query = f"""
            SELECT QUERY_ID, QUERY_TEXT, USER_NAME, EXECUTION_TIME, BYTES_SCANNED
            FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
            WHERE START_TIME >= %s
              AND EXECUTION_TIME > 0
            ORDER BY EXECUTION_TIME DESC
            LIMIT {limit}
        """.strip()

        result = self.sf.execute_query(query, (start_ts.strftime("%Y-%m-%d %H:%M:%S"),))
        queries = [{
            "query_id": row[0],
            "query_text": str(row[1])[:200] if row[1] else "",
            "user": row[2],
            "execution_time_ms": float(row[3] or 0),
            "bytes_scanned": float(row[4] or 0),
        } for row in result["rows"]]

        return {"days": days, "queries": queries}

    def _detect_idle_warehouses(self, args: dict[str, Any]) -> dict[str, Any]:
        days = validate_days(int(args.get("days", 7)))
        threshold = float(args.get("threshold_pct", 10))
        start_ts = datetime.now(timezone.utc) - timedelta(days=days)

        query = """
            SELECT WAREHOUSE_NAME,
                   COUNT(*) AS total_checks,
                   SUM(CASE WHEN AVG_RUNNING = 0 THEN 1 ELSE 0 END) AS idle_checks
            FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_LOAD_HISTORY
            WHERE START_TIME >= %s
            GROUP BY WAREHOUSE_NAME
        """.strip()

        result = self.sf.execute_query(query, (start_ts.strftime("%Y-%m-%d %H:%M:%S"),))
        idle_warehouses = []
        for row in result["rows"]:
            total = int(row[1] or 0)
            idle = int(row[2] or 0)
            idle_pct = (idle / total * 100) if total > 0 else 0
            if idle_pct >= threshold:
                idle_warehouses.append({
                    "warehouse": row[0],
                    "idle_pct": round(idle_pct, 1),
                    "total_checks": total,
                    "suggestion": "Consider scaling down or reducing AUTO_SUSPEND time",
                })

        return {"days": days, "threshold_pct": threshold, "idle_warehouses": idle_warehouses}

    def _get_storage_costs(self, args: dict[str, Any]) -> dict[str, Any]:
        days = validate_days(int(args.get("days", 30)))
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()

        query = """
            SELECT DATABASE_NAME,
                   AVERAGE_DATABASE_BYTES / POWER(1024, 3) AS avg_gb,
                   AVERAGE_DATABASE_BYTES
            FROM SNOWFLAKE.ACCOUNT_USAGE.DATABASE_STORAGE_USAGE_HISTORY
            WHERE USAGE_DATE >= %s
            GROUP BY DATABASE_NAME
            ORDER BY avg_gb DESC
            LIMIT 20
        """.strip()

        try:
            result = self.sf.execute_query(query, (start_date,))
            databases = [{
                "database": row[0],
                "avg_gb": round(float(row[1] or 0), 2),
                "bytes": int(row[2] or 0),
            } for row in result["rows"]]
        except Exception:
            databases = []

        total_gb = sum(d["avg_gb"] for d in databases)
        return {"days": days, "total_gb": round(total_gb, 2), "by_database": databases}

    # ── SPRINT 3: CORTEX AI FUNCTIONS ──

    def _cortex_complete(self, args: dict[str, Any]) -> dict[str, Any]:
        model = str(args.get("model", "llama3-70b")).strip()
        prompt = str(args.get("prompt", "")).strip()
        _max_tokens = int(args.get("max_tokens", 1024))

        if not prompt:
            raise ValidationError("prompt is required")

        query = "SELECT SNOWFLAKE.CORTEX.COMPLETE(%s, %s) AS response"

        try:
            result = self.sf.execute_query(query, (model, prompt))
            response = result["rows"][0][0] if result["rows"] else ""
            return {"model": model, "response": str(response), "query_id": result["query_id"]}
        except Exception as e:
            return {"model": model, "error": str(e)}

    def _cortex_summarize(self, args: dict[str, Any]) -> dict[str, Any]:
        text = str(args.get("text", "")).strip()
        if not text:
            raise ValidationError("text is required")

        query = "SELECT SNOWFLAKE.CORTEX.SUMMARIZE(%s) AS summary"

        try:
            result = self.sf.execute_query(query, (text,))
            summary = result["rows"][0][0] if result["rows"] else ""
            return {"summary": str(summary), "query_id": result["query_id"]}
        except Exception as e:
            return {"error": str(e)}

    def _cortex_sentiment(self, args: dict[str, Any]) -> dict[str, Any]:
        text = str(args.get("text", "")).strip()
        if not text:
            raise ValidationError("text is required")

        query = "SELECT SNOWFLAKE.CORTEX.SENTIMENT(%s) AS sentiment"

        try:
            result = self.sf.execute_query(query, (text,))
            score = float(result["rows"][0][0]) if result["rows"] else 0
            label = "positive" if score > 0.25 else "negative" if score < -0.25 else "neutral"
            return {"score": score, "label": label, "query_id": result["query_id"]}
        except Exception as e:
            return {"error": str(e)}

    def _cortex_classify_text(self, args: dict[str, Any]) -> dict[str, Any]:
        text = str(args.get("text", "")).strip()
        categories = args.get("categories", [])

        if not text:
            raise ValidationError("text is required")
        if not isinstance(categories, list) or not categories:
            raise ValidationError("categories must be a non-empty array")

        categories_json = json.dumps(categories)
        query = "SELECT SNOWFLAKE.CORTEX.CLASSIFY_TEXT(%s, PARSE_JSON(%s)) AS classification"

        try:
            result = self.sf.execute_query(query, (text, categories_json))
            classification = result["rows"][0][0] if result["rows"] else ""
            return {"classification": str(classification), "query_id": result["query_id"]}
        except Exception as e:
            return {"error": str(e)}

    def _cortex_translate(self, args: dict[str, Any]) -> dict[str, Any]:
        text = str(args.get("text", "")).strip()
        target_lang = str(args.get("target_language", "en")).strip()

        if not text:
            raise ValidationError("text is required")

        query = "SELECT SNOWFLAKE.CORTEX.TRANSLATE(%s, '', %s) AS translated"

        try:
            result = self.sf.execute_query(query, (text, target_lang))
            translated = result["rows"][0][0] if result["rows"] else ""
            return {"original": text, "translated": str(translated), "target_language": target_lang, "query_id": result["query_id"]}
        except Exception as e:
            return {"error": str(e)}

    def _cortex_analyst_query(self, args: dict[str, Any]) -> dict[str, Any]:
        question = str(args.get("question", "")).strip()
        model_path = str(args.get("model_path", "")).strip()

        if not question:
            raise ValidationError("question is required")

        query = """
            SELECT SNOWFLAKE.CORTEX.ANALYST(%s, %s) AS result
        """.strip()

        try:
            result = self.sf.execute_query(query, (question, model_path))
            analyst_result = result["rows"][0][0] if result["rows"] else ""
            return {"question": question, "result": str(analyst_result), "query_id": result["query_id"]}
        except Exception as e:
            return {"error": str(e)}

    # ── SPRINT 4: DBT STUDIO ──

    def _scaffold_dbt_project(self, args: dict[str, Any]) -> dict[str, Any]:
        project_name = str(args.get("project_name", "")).strip()
        database = str(args.get("database", "")).strip()
        schema = str(args.get("schema", "")).strip()

        if not project_name:
            raise ValidationError("project_name is required")

        files = {
            "dbt_project.yml": f"""
name: '{project_name}'
version: '1.0.0'
config-version: 2
profile: '{project_name}'
model-paths: ["models"]
analysis-paths: ["analyses"]
test-paths: ["tests"]
seed-paths: ["data"]
macro-paths: ["macros"]
target-path: "target"
clean-targets: ["target", "dbt_packages"]

models:
  {project_name}:
    staging:
      +materialized: view
    marts:
      +materialized: table
""".strip(),
            "models/staging/.gitkeep": "",
            "models/marts/.gitkeep": "",
            "macros/.gitkeep": "",
            "tests/.gitkeep": "",
            "data/.gitkeep": "",
            "analyses/.gitkeep": "",
        }

        return {
            "project_name": project_name,
            "files": files,
            "message": f"dbt project '{project_name}' scaffolded successfully",
        }

    def _generate_dbt_model(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database")
        schema = validate_identifier(str(args.get("schema", "")), "schema")
        table = validate_identifier(str(args.get("table", "")), "table")
        model_name = str(args.get("model_name", f"stg_{table.lower()}")).strip()

        full_table = f"{database}.{schema}.{table}"

        # Get columns
        desc_result = self.sf.execute_query(f"DESC TABLE {full_table}")
        columns = []
        for row in desc_result["rows"]:
            if row[0]:
                columns.append({"name": row[0], "type": row[1], "nullable": row[3] if len(row) > 3 else "Y"})

        # Generate SQL
        col_sql = ",\n    ".join([f"    {c['name']}" for c in columns])

        model_sql = f"""
WITH source AS (
    SELECT * FROM {{{{ source('{schema}', '{table}') }}}}
),

renamed AS (
    SELECT
{col_sql}
    FROM source
)

SELECT * FROM renamed
""".strip()

        # Generate YAML
        schema_yaml = f"""
version: 2

sources:
  - name: {schema}
    database: {database}
    tables:
      - name: {table}

models:
  - name: {model_name}
    description: "Staging model for {full_table}"
    columns:
{chr(10).join([f'      - name: {c["name"]}{chr(10)}        description: ""' for c in columns])}
""".strip()

        return {
            "model_name": model_name,
            "model_sql": model_sql,
            "schema_yaml": schema_yaml,
            "columns": columns,
        }

    def _generate_dbt_tests(self, args: dict[str, Any]) -> dict[str, Any]:
        database = validate_identifier(str(args.get("database", "")), "database")
        schema = validate_identifier(str(args.get("schema", "")), "schema")
        table = validate_identifier(str(args.get("table", "")), "table")
        model_name = str(args.get("model_name", table.lower())).strip()

        # Get columns
        desc_result = self.sf.execute_query(f"DESC TABLE {database}.{schema}.{table}")
        columns = [{"name": row[0], "type": row[1]} for row in desc_result["rows"] if row[0]]

        tests_yaml = f"""
version: 2

models:
  - name: {model_name}
    columns:
"""
        for col in columns[:10]:
            tests_yaml += f"""
      - name: {col['name']}
        tests:
          - not_null
"""

        return {"model_name": model_name, "tests_yaml": tests_yaml}

    # ── SPRINT 5: OPERATIONS + SECURITY ──

    def _get_role_hierarchy(self, args: dict[str, Any]) -> dict[str, Any]:
        query = """
            SELECT ROLE_NAME, GRANTED_TO, GRANTEE_NAME
            FROM SNOWFLAKE.ACCOUNT_USAGE.GRANTS_TO_ROLES
            WHERE GRANTED_TO = 'ROLE'
              AND DELETED_ON IS NULL
            ORDER BY ROLE_NAME
        """.strip()

        try:
            result = self.sf.execute_query(query)
            roles = {}
            for row in result["rows"]:
                parent = row[0]
                child = row[2]
                if parent not in roles:
                    roles[parent] = []
                roles[parent].append(child)
            return {"roles": roles, "total_roles": len(roles)}
        except Exception as e:
            return {"error": str(e), "roles": {}}

    def _check_effective_privileges(self, args: dict[str, Any]) -> dict[str, Any]:
        role = validate_identifier(str(args.get("role", "")), "role")
        object_name = str(args.get("object_name", "")).strip()

        query = """
            SELECT PRIVILEGE, GRANTED_ON, NAME
            FROM SNOWFLAKE.ACCOUNT_USAGE.GRANTS_TO_ROLES
            WHERE GRANTEE_NAME = %s
              AND DELETED_ON IS NULL
            ORDER BY GRANTED_ON, NAME
        """.strip()

        try:
            result = self.sf.execute_query(query, (role.upper(),))
            privileges = [{
                "privilege": row[0],
                "granted_on": row[1],
                "name": row[2],
            } for row in result["rows"]]
            return {"role": role, "privileges": privileges, "total": len(privileges)}
        except Exception as e:
            return {"error": str(e), "role": role, "privileges": []}

    def _audit_role_usage(self, args: dict[str, Any]) -> dict[str, Any]:
        days = validate_days(int(args.get("days", 30)))
        start_ts = datetime.now(timezone.utc) - timedelta(days=days)

        query = """
            SELECT ROLE_NAME, COUNT(DISTINCT QUERY_ID) AS query_count
            FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
            WHERE START_TIME >= %s
              AND ROLE_NAME IS NOT NULL
            GROUP BY ROLE_NAME
            ORDER BY query_count DESC
        """.strip()

        try:
            result = self.sf.execute_query(query, (start_ts.strftime("%Y-%m-%d %H:%M:%S"),))
            used_roles = {row[0]: int(row[1]) for row in result["rows"]}
            return {"days": days, "used_roles": used_roles}
        except Exception as e:
            return {"error": str(e), "days": days}

    def _run_security_scan(self, args: dict[str, Any]) -> dict[str, Any]:
        findings = []

        # Check for PUBLIC role grants
        try:
            public_query = """
                SELECT PRIVILEGE, GRANTED_ON, NAME
                FROM SNOWFLAKE.ACCOUNT_USAGE.GRANTS_TO_ROLES
                WHERE GRANTEE_NAME = 'PUBLIC'
                  AND DELETED_ON IS NULL
                LIMIT 20
            """
            public_result = self.sf.execute_query(public_query)
            if public_result["rows"]:
                findings.append({
                    "severity": "warning",
                    "check": "public_grants",
                    "message": f"PUBLIC role has {len(public_result['rows'])} grants",
                    "details": [row[0] for row in public_result["rows"][:5]],
                })
        except Exception:
            pass

        # Check for users without MFA
        try:
            mfa_query = """
                SELECT NAME, HAS_MFA
                FROM SNOWFLAKE.ACCOUNT_USAGE.USERS
                WHERE DELETED_ON IS NULL AND HAS_MFA = FALSE
                LIMIT 20
            """
            mfa_result = self.sf.execute_query(mfa_query)
            if mfa_result["rows"]:
                findings.append({
                    "severity": "critical",
                    "check": "mfa_missing",
                    "message": f"{len(mfa_result['rows'])} users without MFA",
                    "details": [row[0] for row in mfa_result["rows"][:5]],
                })
        except Exception:
            pass

        return {"findings": findings, "total_findings": len(findings)}

    def _get_unprotected_columns(self, args: dict[str, Any]) -> dict[str, Any]:
        database = str(args.get("database", "")).upper()

        try:
            query = """
                SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
                FROM SNOWFLAKE.ACCOUNT_USAGE.COLUMNS
                WHERE UPPER(COMMENT) LIKE '%PII%'
                   OR UPPER(COMMENT) LIKE '%SENSITIVE%'
                   OR UPPER(COMMENT) LIKE '%CONFIDENTIAL%'
                LIMIT 50
            """
            result = self.sf.execute_query(query)
            columns = [{
                "database": row[0],
                "schema": row[1],
                "table": row[2],
                "column": row[3],
            } for row in result["rows"]]
            return {"unprotected_columns": columns, "total": len(columns)}
        except Exception as e:
            return {"error": str(e), "unprotected_columns": []}

    def _search_snowflake_docs(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query", "")).strip()
        if not query:
            raise ValidationError("query is required")

        return {
            "query": query,
            "results": [{
                "title": f"Snowflake Documentation: {query}",
                "url": f"https://docs.snowflake.com/en/search?q={query.replace(' ', '+')}",
                "snippet": f"Search results for {query} in Snowflake documentation.",
            }],
            "message": "Use web search for actual documentation lookup",
        }

    def _list_models(self, args: dict[str, Any]) -> dict[str, Any]:
        try:
            query = """
                SELECT MODEL_NAME, MODEL_VERSION, CREATED_ON, LANGUAGE
                FROM SNOWFLAKE.ML_MODELS
                ORDER BY CREATED_ON DESC
                LIMIT 50
            """
            result = self.sf.execute_query(query)
            models = [{
                "name": row[0],
                "version": row[1],
                "created": str(row[2]) if row[2] else None,
                "language": row[3],
            } for row in result["rows"]]
            return {"models": models, "total": len(models)}
        except Exception as e:
            return {"error": str(e), "models": []}

    # ── SPRINT 7: STREAMLIT + NOTEBOOKS + MARKETPLACE ──

    def _create_streamlit_app(self, args: dict[str, Any]) -> dict[str, Any]:
        app_name = str(args.get("app_name", "")).strip()
        database = str(args.get("database", "")).strip()
        schema = str(args.get("schema", "")).strip()
        main_file = str(args.get("main_file", "streamlit_app.py")).strip()

        if not app_name:
            raise ValidationError("app_name is required")

        sample_code = f"""
import streamlit as st
import pandas as pd
from snowflake.snowpark.context import get_active_session

st.title("{app_name}")

session = get_active_session()

# Add your app logic here
st.write("Welcome to {app_name}!")
"""

        return {
            "app_name": app_name,
            "database": database,
            "schema": schema,
            "main_file": main_file,
            "sample_code": sample_code.strip(),
            "message": f"Streamlit app '{app_name}' scaffolded",
        }

    def _list_streamlit_apps(self, args: dict[str, Any]) -> dict[str, Any]:
        try:
            query = "SHOW STREAMLITS"
            result = self.sf.execute_query(query)
            apps = []
            for row in result["rows"]:
                apps.append({
                    "name": row[0] if len(row) > 0 else None,
                    "database": row[1] if len(row) > 1 else None,
                    "schema": row[2] if len(row) > 2 else None,
                    "created": str(row[3]) if len(row) > 3 and row[3] else None,
                })
            return {"apps": apps, "total": len(apps)}
        except Exception as e:
            return {"error": str(e), "apps": []}

    def _search_marketplace(self, args: dict[str, Any]) -> dict[str, Any]:
        keyword = str(args.get("keyword", "")).strip()
        if not keyword:
            raise ValidationError("keyword is required")

        return {
            "keyword": keyword,
            "results": [{
                "name": f"Sample Listing for '{keyword}'",
                "provider": "Snowflake",
                "description": f"Search results for {keyword} in Snowflake Marketplace.",
                "url": f"https://app.snowflake.com/marketplace/listings?search={keyword.replace(' ', '+')}",
            }],
            "message": "Use Snowflake Marketplace UI for actual listings",
        }

    # ── SPRINT 8: WORKFLOW ORCHESTRATION ──

    def _create_task(self, args: dict[str, Any]) -> dict[str, Any]:
        title = str(args.get("title", "")).strip()
        description = str(args.get("description", "")).strip()
        priority = str(args.get("priority", "medium")).strip()
        skill = str(args.get("skill", "")).strip()

        if not title:
            raise ValidationError("title is required")

        task_id = f"task_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        return {
            "task_id": task_id,
            "title": title,
            "description": description,
            "priority": priority,
            "skill": skill,
            "status": "created",
        }

    def _decompose_goal(self, args: dict[str, Any]) -> dict[str, Any]:
        goal = str(args.get("goal", "")).strip()
        if not goal:
            raise ValidationError("goal is required")

        return {
            "goal": goal,
            "subtasks": [
                {"step": 1, "title": "Analyze requirements", "skill": "Requirements Analyst", "status": "pending"},
                {"step": 2, "title": "Design architecture", "skill": "Data Architect", "status": "pending"},
                {"step": 3, "title": "Implement solution", "skill": "SQL Writer", "status": "pending"},
                {"step": 4, "title": "Test and validate", "skill": "Query Optimizer", "status": "pending"},
            ],
            "message": "Goal decomposed into subtasks. Review and approve each step.",
        }
