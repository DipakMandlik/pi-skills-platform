"""governance_platform_expansion

Revision ID: 4f6d9c2b1a7d
Revises: 8a07c68b3558
Create Date: 2026-04-06 16:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "4f6d9c2b1a7d"
down_revision: Union[str, Sequence[str], None] = "8a07c68b3558"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "teams",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_by", UUID(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_teams_name", "teams", ["name"], unique=False)

    op.create_table(
        "team_members",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("team_id", UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", UUID(as_uuid=False), nullable=False),
        sa.Column("added_by", UUID(as_uuid=False), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("team_id", "user_id", name="uq_team_member"),
    )
    op.create_index("ix_team_members_team_id", "team_members", ["team_id"], unique=False)
    op.create_index("ix_team_members_user_id", "team_members", ["user_id"], unique=False)

    op.create_table(
        "org_settings",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("org_name", sa.String(255), nullable=False, server_default="Pi Skills Platform"),
        sa.Column("org_domain", sa.String(255), nullable=False, server_default="example.com"),
        sa.Column("default_region", sa.String(100), nullable=False, server_default="us-east-1"),
        sa.Column("notifications", JSONB, server_default="{}"),
        sa.Column("appearance", JSONB, server_default="{}"),
        sa.Column("integrations", JSONB, server_default="{}"),
        sa.Column("updated_by", UUID(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "subscription_plans",
        sa.Column("plan_name", sa.String(255), primary_key=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("monthly_token_limit", sa.Integer(), nullable=False, server_default="100000"),
        sa.Column("max_tokens_per_request", sa.Integer(), nullable=False, server_default="2048"),
        sa.Column("allowed_models", JSONB, server_default="[]"),
        sa.Column("features", JSONB, server_default="[]"),
        sa.Column("priority", sa.String(50), nullable=False, server_default="standard"),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("cost_budget_monthly", sa.Float(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "user_subscriptions",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=False), nullable=False),
        sa.Column("plan_name", sa.String(255), nullable=False),
        sa.Column("assigned_by", UUID(as_uuid=False), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("token_limit_override", sa.Integer(), nullable=True),
        sa.UniqueConstraint("user_id", name="uq_user_subscription"),
    )
    op.create_index("ix_user_subscriptions_user_id", "user_subscriptions", ["user_id"], unique=False)
    op.create_index("ix_user_subscriptions_plan_name", "user_subscriptions", ["plan_name"], unique=False)

    op.create_table(
        "model_access_controls",
        sa.Column("model_id", sa.String(255), primary_key=True),
        sa.Column("allowed_roles", JSONB, server_default="[]"),
        sa.Column("max_tokens_per_request", sa.Integer(), nullable=False, server_default="2048"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "feature_flags",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("feature_name", sa.String(255), nullable=False),
        sa.Column("model_id", sa.String(255), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("enabled_for", JSONB, server_default="[]"),
        sa.Column("config", JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("feature_name", "model_id", name="uq_feature_flag_model"),
    )
    op.create_index("ix_feature_flags_feature_name", "feature_flags", ["feature_name"], unique=False)
    op.create_index("ix_feature_flags_model_id", "feature_flags", ["model_id"], unique=False)

    op.create_table(
        "governance_policies",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("policy_name", sa.String(255), nullable=False, unique=True),
        sa.Column("policy_type", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("conditions", JSONB, server_default="{}"),
        sa.Column("actions", JSONB, server_default="{}"),
        sa.Column("priority", sa.String(50), nullable=False, server_default="standard"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_governance_policies_policy_name", "governance_policies", ["policy_name"], unique=False)
    op.create_index("ix_governance_policies_policy_type", "governance_policies", ["policy_type"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_governance_policies_policy_type", table_name="governance_policies")
    op.drop_index("ix_governance_policies_policy_name", table_name="governance_policies")
    op.drop_table("governance_policies")
    op.drop_index("ix_feature_flags_model_id", table_name="feature_flags")
    op.drop_index("ix_feature_flags_feature_name", table_name="feature_flags")
    op.drop_table("feature_flags")
    op.drop_table("model_access_controls")
    op.drop_index("ix_user_subscriptions_plan_name", table_name="user_subscriptions")
    op.drop_index("ix_user_subscriptions_user_id", table_name="user_subscriptions")
    op.drop_table("user_subscriptions")
    op.drop_table("subscription_plans")
    op.drop_table("org_settings")
    op.drop_index("ix_team_members_user_id", table_name="team_members")
    op.drop_index("ix_team_members_team_id", table_name="team_members")
    op.drop_table("team_members")
    op.drop_index("ix_teams_name", table_name="teams")
    op.drop_table("teams")
