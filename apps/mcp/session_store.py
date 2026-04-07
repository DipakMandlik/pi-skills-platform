from __future__ import annotations

import hashlib
import json
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import DateTime, Integer, String, Text, create_engine, delete, select, update
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


def _utc_now() -> datetime:
    # Keep database values naive while sourcing from timezone-aware UTC.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class SessionRecord(Base):
    __tablename__ = "mcp_sessions"

    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    chain_id = mapped_column(String(64), index=True)
    access_hash = mapped_column(String(128), unique=True, index=True)
    refresh_hash = mapped_column(String(128), unique=True, index=True)
    user_json = mapped_column(Text)
    expires_at = mapped_column(DateTime)
    created_at = mapped_column(DateTime, default=_utc_now)
    last_seen_at = mapped_column(DateTime, default=_utc_now)
    revoked_at = mapped_column(DateTime, nullable=True)


class SessionStore:
    def __init__(self, database_url: str, secret: str, access_ttl_hours: int = 8):
        connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
        self._engine = create_engine(database_url, future=True, pool_pre_ping=True, connect_args=connect_args)
        Base.metadata.create_all(self._engine)
        self._session_factory = sessionmaker(bind=self._engine, expire_on_commit=False, class_=Session)
        self._secret = secret
        self._access_ttl_hours = access_ttl_hours
        self._lock = threading.Lock()

    def _hash_token(self, token: str) -> str:
        return hashlib.sha256(f"{self._secret}:{token}".encode("utf-8")).hexdigest()

    def _issue_tokens(self) -> tuple[str, str]:
        return secrets.token_hex(32), secrets.token_hex(32)

    def issue_session(self, user_info: dict[str, Any], chain_id: str | None = None) -> tuple[str, str]:
        with self._lock:
            return self._insert_session(user_info, chain_id)

    def _insert_session(self, user_info: dict[str, Any], chain_id: str | None) -> tuple[str, str]:
        access_token, refresh_token = self._issue_tokens()
        now = _utc_now()
        expires_at = now + timedelta(hours=self._access_ttl_hours)
        session_chain_id = chain_id or uuid4().hex
        record = SessionRecord(
            chain_id=session_chain_id,
            access_hash=self._hash_token(access_token),
            refresh_hash=self._hash_token(refresh_token),
            user_json=json.dumps(user_info, separators=(",", ":"), ensure_ascii=True),
            expires_at=expires_at,
            created_at=now,
            last_seen_at=now,
            revoked_at=None,
        )
        with self._session_factory() as db:
            db.add(record)
            db.commit()
        return access_token, refresh_token

    def validate_access_token(self, access_token: str) -> dict[str, Any] | None:
        now = _utc_now()
        access_hash = self._hash_token(access_token)
        with self._session_factory() as db:
            row = db.execute(
                select(SessionRecord).where(SessionRecord.access_hash == access_hash)
            ).scalar_one_or_none()
            if row is None:
                return None
            if row.revoked_at is not None or row.expires_at <= now:
                return None
            row.last_seen_at = now
            db.commit()
            return json.loads(row.user_json)

    def refresh_session(self, refresh_token: str) -> tuple[str, str] | None:
        now = _utc_now()
        refresh_hash = self._hash_token(refresh_token)
        with self._lock:
            with self._session_factory() as db:
                row = db.execute(
                    select(SessionRecord).where(SessionRecord.refresh_hash == refresh_hash)
                ).scalar_one_or_none()
                if row is None:
                    return None

                if row.revoked_at is not None:
                    self._revoke_chain(db, row.chain_id, now)
                    db.commit()
                    return None

                if row.expires_at <= now:
                    row.revoked_at = now
                    db.commit()
                    return None

                row.revoked_at = now
                user_info = json.loads(row.user_json)
                db.commit()
                return self._insert_session(user_info, chain_id=row.chain_id)

    def revoke_by_access_token(self, access_token: str) -> bool:
        now = _utc_now()
        access_hash = self._hash_token(access_token)
        with self._lock:
            with self._session_factory() as db:
                row = db.execute(
                    select(SessionRecord).where(SessionRecord.access_hash == access_hash)
                ).scalar_one_or_none()
                if row is None:
                    return False
                self._revoke_chain(db, row.chain_id, now)
                db.commit()
                return True

    def revoke_by_refresh_token(self, refresh_token: str) -> bool:
        now = _utc_now()
        refresh_hash = self._hash_token(refresh_token)
        with self._lock:
            with self._session_factory() as db:
                row = db.execute(
                    select(SessionRecord).where(SessionRecord.refresh_hash == refresh_hash)
                ).scalar_one_or_none()
                if row is None:
                    return False
                self._revoke_chain(db, row.chain_id, now)
                db.commit()
                return True

    def _revoke_chain(self, db: Session, chain_id: str, revoked_at: datetime) -> None:
        db.execute(
            update(SessionRecord)
            .where(SessionRecord.chain_id == chain_id, SessionRecord.revoked_at.is_(None))
            .values(revoked_at=revoked_at)
        )

    def cleanup_expired(self) -> int:
        cutoff = _utc_now() - timedelta(days=1)
        with self._session_factory() as db:
            result = db.execute(
                delete(SessionRecord).where(
                    SessionRecord.expires_at < cutoff,
                )
            )
            db.commit()
            return int(result.rowcount or 0)

    def clear_all_sessions_for_tests(self) -> None:
        with self._lock:
            with self._session_factory() as db:
                db.execute(delete(SessionRecord))
                db.commit()

    def expire_access_token_for_tests(self, access_token: str) -> None:
        access_hash = self._hash_token(access_token)
        with self._session_factory() as db:
            db.execute(
                update(SessionRecord)
                .where(SessionRecord.access_hash == access_hash)
                .values(expires_at=_utc_now() - timedelta(seconds=1))
            )
            db.commit()
