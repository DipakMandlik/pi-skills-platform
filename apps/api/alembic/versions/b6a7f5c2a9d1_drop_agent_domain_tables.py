"""drop_agent_domain_tables

Revision ID: b6a7f5c2a9d1
Revises: a1b2c3d4e5f6
Create Date: 2026-04-07 18:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "b6a7f5c2a9d1"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("agent_execution_steps")
    op.drop_table("agent_execution_records")
    op.drop_table("agent_action_policies")
    op.drop_table("agent_skill_mappings")
    op.drop_table("agent_definitions")


def downgrade() -> None:
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
