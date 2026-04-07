from __future__ import annotations

import argparse
import json
import sys
from uuid import uuid4

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.config import load_settings
from apps.api.core.database import UserModel, init_engine, create_tables, _session_factory


async def run_migration(
    source_path: str, provider: str, deactivate_missing: bool, dry_run: bool
) -> int:
    settings = load_settings()
    init_engine(settings)
    await create_tables()

    with open(source_path, "r") as f:
        users_data = json.load(f)

    if not _session_factory:
        print("ERROR: Database session factory not initialized", file=sys.stderr)
        return 1

    async with _session_factory() as db:
        existing = await db.execute(select(UserModel))
        existing_users = {u.external_id: u for u in existing.scalars().all()}

        imported_ids = set()
        for user_entry in users_data:
            external_id = user_entry.get("external_id", user_entry.get("email", ""))
            email = user_entry.get("email", external_id)
            display_name = user_entry.get("display_name", email.split("@")[0])
            platform_role = user_entry.get("role", "user").lower()

            if platform_role not in ("admin", "user", "viewer"):
                platform_role = "user"

            imported_ids.add(external_id)

            if external_id in existing_users:
                print(f"  SKIP: {email} (already exists)")
                continue

            password = user_entry.get("password", f"default-{uuid4().hex[:12]}")
            password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode(
                "utf-8"
            )

            user = UserModel(
                id=str(uuid4()),
                external_id=external_id,
                email=email,
                display_name=display_name,
                platform_role=platform_role,
                password_hash=password_hash,
            )

            if dry_run:
                print(f"  DRY-RUN: Would create {email} as {platform_role}")
            else:
                db.add(user)
                print(f"  IMPORTED: {email} as {platform_role}")

        if deactivate_missing and not dry_run:
            for ext_id, user in existing_users.items():
                if ext_id not in imported_ids:
                    user.is_active = False
                    print(f"  DEACTIVATED: {user.email}")

        if not dry_run:
            await db.commit()

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate identity users")
    parser.add_argument("--source", required=True, help="Path to JSON export")
    parser.add_argument("--provider", default="local", help="Provider name")
    parser.add_argument(
        "--deactivate-missing", action="store_true", help="Deactivate users not in source"
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    import asyncio

    return asyncio.run(
        run_migration(args.source, args.provider, args.deactivate_missing, args.dry_run)
    )


if __name__ == "__main__":
    raise SystemExit(main())
