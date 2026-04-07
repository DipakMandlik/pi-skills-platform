"""agent_domain_tables

Revision ID: a1b2c3d4e5f6
Revises: 4f6d9c2b1a7d
Create Date: 2026-04-06 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "4f6d9c2b1a7d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Add missing cost_per_1k_tokens column to registered_models ──────────
    op.add_column(
        "registered_models",
        sa.Column("cost_per_1k_tokens", sa.Float(), nullable=True, server_default="0.0"),
    )

    # ── agent_definitions ────────────────────────────────────────────────────
    op.create_table(
        "agent_definitions",
        sa.Column("agent_id", sa.String(255), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("subtype", sa.String(100), nullable=True),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("risk_level", sa.String(50), nullable=False, server_default="medium"),
        sa.Column("source_type", sa.String(100), nullable=False, server_default="platform_native"),
        sa.Column("source_ref", sa.String(500), nullable=True),
        sa.Column("source_metadata", JSONB, server_default="{}"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("required_models", JSONB, server_default="[]"),
        sa.Column("allowed_roles", JSONB, server_default="[]"),
        sa.Column("capabilities", JSONB, server_default="[]"),
        sa.Column("context_requirements", JSONB, server_default="{}"),
        sa.Column("execution_policy", JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_agent_definitions_category", "agent_definitions", ["category"])
    op.create_index("ix_agent_definitions_is_enabled", "agent_definitions", ["is_enabled"])

    # ── agent_skill_mappings ─────────────────────────────────────────────────
    op.create_table(
        "agent_skill_mappings",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("skill_id", sa.String(255), nullable=False),
        sa.Column("agent_id", sa.String(255), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by", UUID(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("skill_id", "agent_id", name="uq_agent_skill_mapping"),
    )
    op.create_index("ix_agent_skill_mappings_skill_id", "agent_skill_mappings", ["skill_id"])
    op.create_index("ix_agent_skill_mappings_agent_id", "agent_skill_mappings", ["agent_id"])

    # ── agent_action_policies ────────────────────────────────────────────────
    op.create_table(
        "agent_action_policies",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("agent_id", sa.String(255), nullable=False),
        sa.Column("allowed_tools", JSONB, server_default="[]"),
        sa.Column("query_restrictions", JSONB, server_default="{}"),
        sa.Column("masking_policy_refs", JSONB, server_default="[]"),
        sa.Column("row_filter_policy_refs", JSONB, server_default="[]"),
        sa.Column("connector_scope", JSONB, server_default="{}"),
        sa.Column("store_raw_query", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("agent_id", name="uq_agent_action_policy"),
    )
    op.create_index("ix_agent_action_policies_agent_id", "agent_action_policies", ["agent_id"])

    # ── agent_execution_records ──────────────────────────────────────────────
    op.create_table(
        "agent_execution_records",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("request_id", UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", UUID(as_uuid=False), nullable=False),
        sa.Column("skill_id", sa.String(255), nullable=True),
        sa.Column("agent_id", sa.String(255), nullable=False),
        sa.Column("model_id", sa.String(255), nullable=False),
        sa.Column("prompt_summary", sa.Text(), nullable=True),
        sa.Column("outcome", sa.String(50), nullable=False, server_default="success"),
        sa.Column("tokens_used", sa.Integer(), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("mcp_actions", JSONB, server_default="[]"),
        sa.Column("generated_queries", JSONB, server_default="[]"),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_agent_execution_records_request_id", "agent_execution_records", ["request_id"])
    op.create_index("ix_agent_execution_records_user_id", "agent_execution_records", ["user_id"])
    op.create_index("ix_agent_execution_records_agent_id", "agent_execution_records", ["agent_id"])
    op.create_index("ix_agent_execution_records_skill_id", "agent_execution_records", ["skill_id"])
    op.create_index("ix_agent_execution_records_created_at", "agent_execution_records", ["created_at"])

    # ── agent_execution_steps ────────────────────────────────────────────────
    op.create_table(
        "agent_execution_steps",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("execution_id", UUID(as_uuid=False), nullable=False),
        sa.Column("step_index", sa.Integer(), nullable=False),
        sa.Column("step_type", sa.String(100), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="success"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("detail", JSONB, server_default="{}"),
    )
    op.create_index("ix_agent_execution_steps_execution_id", "agent_execution_steps", ["execution_id"])

    # ── skill_definitions + skill_states (missing from prior migrations) ─────
    op.create_table(
        "skill_definitions",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("skill_id", sa.String(255), nullable=False),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("skill_type", sa.String(50), nullable=False, server_default="ai"),
        sa.Column("domain", sa.String(100), nullable=False, server_default="general"),
        sa.Column("instructions", sa.Text(), nullable=False, server_default=""),
        sa.Column("required_models", JSONB, server_default="[]"),
        sa.Column("input_schema", JSONB, server_default="{}"),
        sa.Column("output_format", JSONB, server_default="{}"),
        sa.Column("execution_handler", sa.String(500), nullable=False),
        sa.Column("error_handling", JSONB, server_default="{}"),
        sa.Column("created_by", UUID(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_by", UUID(as_uuid=False), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("skill_id", "version", name="uq_skill_definition_version"),
    )
    op.create_index("ix_skill_definitions_skill_id", "skill_definitions", ["skill_id"])

    op.create_table(
        "skill_states",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("skill_id", sa.String(255), nullable=False),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("skill_type", sa.String(50), nullable=False, server_default="ai"),
        sa.Column("domain", sa.String(100), nullable=False, server_default="general"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("updated_by", UUID(as_uuid=False), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("skill_id", "version", name="uq_skill_state_version"),
    )
    op.create_index("ix_skill_states_skill_id", "skill_states", ["skill_id"])
    op.create_index("ix_skill_states_is_enabled", "skill_states", ["is_enabled"])
    op.create_index("ix_skill_states_updated_at", "skill_states", ["updated_at"])


def downgrade() -> None:
    op.drop_table("skill_states")
    op.drop_table("skill_definitions")
    op.drop_index("ix_agent_execution_steps_execution_id", table_name="agent_execution_steps")
    op.drop_table("agent_execution_steps")
    op.drop_index("ix_agent_execution_records_created_at", table_name="agent_execution_records")
    op.drop_index("ix_agent_execution_records_skill_id", table_name="agent_execution_records")
    op.drop_index("ix_agent_execution_records_agent_id", table_name="agent_execution_records")
    op.drop_index("ix_agent_execution_records_user_id", table_name="agent_execution_records")
    op.drop_index("ix_agent_execution_records_request_id", table_name="agent_execution_records")
    op.drop_table("agent_execution_records")
    op.drop_index("ix_agent_action_policies_agent_id", table_name="agent_action_policies")
    op.drop_table("agent_action_policies")
    op.drop_index("ix_agent_skill_mappings_agent_id", table_name="agent_skill_mappings")
    op.drop_index("ix_agent_skill_mappings_skill_id", table_name="agent_skill_mappings")
    op.drop_table("agent_skill_mappings")
    op.drop_index("ix_agent_definitions_is_enabled", table_name="agent_definitions")
    op.drop_index("ix_agent_definitions_category", table_name="agent_definitions")
    op.drop_table("agent_definitions")
    op.drop_column("registered_models", "cost_per_1k_tokens")
