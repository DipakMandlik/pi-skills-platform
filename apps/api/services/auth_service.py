from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import uuid4

import bcrypt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import UserModel
from ..models.domain import AuthUser

logger = logging.getLogger("api.auth_service")


class AuthService:
    async def verify_credentials(self, email: str, password: str, db: AsyncSession) -> UserModel:
        """Verify email/password and return the active UserModel, or raise AuthError."""
        result = await db.execute(
            select(UserModel).where(UserModel.email == email, UserModel.is_active == True)
        )
        user = result.scalar_one_or_none()

        if user is None or not bcrypt.checkpw(
            password.encode("utf-8"), user.password_hash.encode("utf-8")
        ):
            raise AuthError("Invalid credentials")

        await db.execute(
            update(UserModel)
            .where(UserModel.id == user.id)
            .values(last_login_at=datetime.now(timezone.utc))
        )
        await db.commit()
        return user

    async def create_user(
        self,
        email: str,
        password: str,
        display_name: str,
        role: str,
        db: AsyncSession,
    ) -> UserModel:
        existing = await db.execute(select(UserModel).where(UserModel.email == email))
        if existing.scalar_one_or_none() is not None:
            raise AuthError("User already exists")

        user = UserModel(
            id=str(uuid4()),
            external_id=email,
            email=email,
            display_name=display_name,
            platform_role=role,
            password_hash=bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


class AuthError(Exception):
    pass
