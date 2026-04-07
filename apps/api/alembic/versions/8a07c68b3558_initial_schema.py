"""initial_schema

Revision ID: 8a07c68b3558
Revises:
Create Date: 2026-04-05 12:33:09.944437

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "8a07c68b3558"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("external_id", sa.String(255), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("display_name", sa.String(255)),
        sa.Column("platform_role", sa.String(50), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("metadata", JSONB, server_default="{}"),
    )

    op.create_table(
        "registered_models",
        sa.Column("model_id", sa.String(255), primary_key=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(100), nullable=False),
        sa.Column("tier", sa.String(50), server_default="standard"),
        sa.Column("is_available", sa.Boolean, server_default=sa.true()),
        sa.Column("max_tokens", sa.Integer),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "model_permissions",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=False), nullable=False, index=True),
        sa.Column("model_id", sa.String(255), nullable=False),
        sa.Column("granted_by", UUID(as_uuid=False), nullable=False),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
        sa.Column("revoked_by", UUID(as_uuid=False)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("notes", sa.Text),
        sa.UniqueConstraint("user_id", "model_id", name="uq_user_model"),
    )

    op.create_table(
        "skill_assignments",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=False), nullable=False, index=True),
        sa.Column("skill_id", sa.String(255), nullable=False),
        sa.Column("assigned_by", UUID(as_uuid=False), nullable=False),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
        sa.Column("revoked_by", UUID(as_uuid=False)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("user_id", "skill_id", name="uq_user_skill"),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("request_id", UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", UUID(as_uuid=False), index=True),
        sa.Column("skill_id", sa.String(255)),
        sa.Column("model_id", sa.String(255)),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("outcome", sa.String(50), nullable=False),
        sa.Column("tokens_used", sa.Integer),
        sa.Column("latency_ms", sa.Integer),
        sa.Column("ip_address", INET),
        sa.Column("user_agent", sa.Text),
        sa.Column("error_detail", sa.Text),
        sa.Column("metadata", JSONB, server_default="{}"),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("skill_assignments")
    op.drop_table("model_permissions")
    op.drop_table("registered_models")
    op.drop_table("users")
