from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Optional

from ..models.domain import normalize_authorization_roles

logger = logging.getLogger("backend.snowflake")

_ROLE_CACHE: dict[str, tuple[list[str], float]] = {}
_CACHE_TTL = 300  # 5 minutes


class SnowflakeService:
    def __init__(self, settings=None):
        self.settings = settings
        self._conn = None
        self._connector = None
        self._connected = False

    def _load_connector(self):
        if self._connector is not None:
            return self._connector
        try:
            import collections
            import collections.abc
            if not hasattr(collections, "Mapping"):
                collections.Mapping = collections.abc.Mapping  # type: ignore[attr-defined]
            if not hasattr(collections, "MutableMapping"):
                collections.MutableMapping = collections.abc.MutableMapping  # type: ignore[attr-defined]
            import snowflake.connector  # type: ignore
            self._connector = snowflake.connector
            return self._connector
        except ImportError:
            logger.error("snowflake-connector-python not installed")
            return None

    def _connect_sync(self):
        connector = self._load_connector()
        if connector is None:
            raise RuntimeError("Snowflake connector not available")

        logger.info(
            "Connecting to Snowflake account=%s user=%s role=%s warehouse=%s",
            self.settings.snowflake_account,
            self.settings.snowflake_user,
            self.settings.snowflake_role,
            self.settings.snowflake_warehouse,
        )

        self._conn = connector.connect(
            account=self.settings.snowflake_account,
            user=self.settings.snowflake_user,
            password=self.settings.snowflake_password,
            role=self.settings.snowflake_role,
            warehouse=self.settings.snowflake_warehouse,
            database=self.settings.snowflake_database,
            schema=self.settings.snowflake_schema,
            login_timeout=30,
            network_timeout=60,
            client_session_keep_alive=True,
            ocsp_fail_open=True,
        )
        self._connected = True
        logger.info("Snowflake connection established successfully")

    def _ensure_connected(self):
        if self._connected and self._conn is not None:
            return
        self._connect_sync()

    def _query_rows_sync(self, query: str, params: Optional[tuple] = None) -> list[dict]:
        self._ensure_connected()
        cursor = self._conn.cursor()
        try:
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            columns = [col[0] for col in cursor.description] if cursor.description else []
            rows = cursor.fetchall() if columns else []
            return [dict(zip(columns, row)) for row in rows]
        finally:
            cursor.close()

    def _execute_query_sync(self, query: str, params: Optional[tuple] = None) -> dict:
        self._ensure_connected()
        cursor = self._conn.cursor()
        try:
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            columns = [col[0] for col in cursor.description] if cursor.description else []
            rows = cursor.fetchall() if columns else []
            return {
                "query_id": cursor.sfqid,
                "columns": columns,
                "rows": [list(row) for row in rows],
                "row_count": len(rows),
            }
        finally:
            cursor.close()

    def _parse_variant(self, value):
        if value is None:
            return []
        if isinstance(value, (list, dict)):
            return value
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                return [value]
        return [value]

    async def get_user_roles(self, username: str) -> list[str]:
        cache_key = username.upper()
        now = time.monotonic()
        cached = _ROLE_CACHE.get(cache_key)
        if cached and now - cached[1] < _CACHE_TTL:
            return cached[0]

        if not self.settings or not self.settings.snowflake_account:
            logger.warning("Snowflake not configured, returning empty roles for %s", username)
            return []

        rows = await asyncio.to_thread(self._query_rows_sync, f"SHOW GRANTS TO USER {username}")
        roles: list[str] = []
        for row in rows:
            normalized = {str(k).upper(): v for k, v in row.items()}
            if str(normalized.get("GRANTED_ON", "")).upper() == "ROLE":
                role_name = normalized.get("NAME")
                if role_name:
                    roles.append(str(role_name).upper())

        unique_roles = sorted(set(roles))
        _ROLE_CACHE[cache_key] = (unique_roles, now)
        return unique_roles

    async def get_model_access_controls(self) -> list[dict]:
        query = "SELECT model_id, allowed_roles, enabled, max_tokens_per_request, rate_limit_per_minute FROM GOVERNANCE_DB.AI.AI_MODEL_ACCESS_CONTROL"
        rows = await asyncio.to_thread(self._query_rows_sync, query)
        results = []
        for row in rows:
            results.append({
                "model_id": row.get("MODEL_ID") or row.get("model_id"),
                "allowed_roles": [str(r).upper() for r in (self._parse_variant(row.get("ALLOWED_ROLES") or row.get("allowed_roles")) or [])],
                "enabled": bool(row.get("ENABLED") if "ENABLED" in row else row.get("enabled")),
                "max_tokens_per_request": int(row.get("MAX_TOKENS_PER_REQUEST") or row.get("max_tokens_per_request") or 0),
                "rate_limit_per_minute": int(row.get("RATE_LIMIT_PER_MINUTE") or row.get("rate_limit_per_minute") or 0),
            })
        return results

    async def set_model_access_control(
        self,
        model_id: str,
        allowed_roles: list[str],
        enabled: bool,
        max_tokens_per_request: int,
        rate_limit_per_minute: int,
    ) -> None:
        normalized_roles = normalize_authorization_roles(allowed_roles)
        query = (
            "MERGE INTO GOVERNANCE_DB.AI.AI_MODEL_ACCESS_CONTROL t "
            "USING (SELECT %s AS model_id) s "
            "ON t.model_id = s.model_id "
            "WHEN MATCHED THEN UPDATE SET allowed_roles = PARSE_JSON(%s), enabled = %s, max_tokens_per_request = %s, rate_limit_per_minute = %s, updated_at = CURRENT_TIMESTAMP() "
            "WHEN NOT MATCHED THEN INSERT (model_id, allowed_roles, enabled, max_tokens_per_request, rate_limit_per_minute, created_at, updated_at) "
            "VALUES (%s, PARSE_JSON(%s), %s, %s, %s, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())"
        )
        roles_json = json.dumps(normalized_roles)
        params = (
            model_id,
            roles_json,
            enabled,
            max_tokens_per_request,
            rate_limit_per_minute,
            model_id,
            roles_json,
            enabled,
            max_tokens_per_request,
            rate_limit_per_minute,
        )
        await asyncio.to_thread(self._execute_query_sync, query, params)

    async def get_feature_flags(self) -> list[dict]:
        query = "SELECT feature_name, model_id, enabled, enabled_for, config FROM GOVERNANCE_DB.AI.AI_FEATURE_FLAGS"
        rows = await asyncio.to_thread(self._query_rows_sync, query)
        results = []
        for row in rows:
            results.append({
                "feature_name": row.get("FEATURE_NAME") or row.get("feature_name"),
                "model_id": row.get("MODEL_ID") or row.get("model_id"),
                "enabled": bool(row.get("ENABLED") if "ENABLED" in row else row.get("enabled")),
                "enabled_for": [str(r).upper() for r in (self._parse_variant(row.get("ENABLED_FOR") or row.get("enabled_for")) or [])],
                "config": row.get("CONFIG") or row.get("config") or {},
            })
        return results

    async def set_feature_flag(
        self,
        feature_name: str,
        model_id: str,
        enabled: bool,
        enabled_for: list[str],
        config: Optional[dict] = None,
    ) -> None:
        normalized_enabled_for = normalize_authorization_roles(enabled_for)
        query = (
            "MERGE INTO GOVERNANCE_DB.AI.AI_FEATURE_FLAGS t "
            "USING (SELECT %s AS feature_name, %s AS model_id) s "
            "ON t.feature_name = s.feature_name AND t.model_id = s.model_id "
            "WHEN MATCHED THEN UPDATE SET enabled = %s, enabled_for = PARSE_JSON(%s), config = PARSE_JSON(%s), updated_at = CURRENT_TIMESTAMP() "
            "WHEN NOT MATCHED THEN INSERT (feature_name, model_id, enabled, enabled_for, config, created_at, updated_at) "
            "VALUES (%s, %s, %s, PARSE_JSON(%s), PARSE_JSON(%s), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())"
        )
        enabled_for_json = json.dumps(normalized_enabled_for)
        config_json = json.dumps(config or {})
        params = (
            feature_name,
            model_id,
            enabled,
            enabled_for_json,
            config_json,
            feature_name,
            model_id,
            enabled,
            enabled_for_json,
            config_json,
        )
        await asyncio.to_thread(self._execute_query_sync, query, params)

    async def delete_feature_flag(self, feature_name: str, model_id: str) -> None:
        query = (
            "DELETE FROM GOVERNANCE_DB.AI.AI_FEATURE_FLAGS "
            "WHERE feature_name = %s AND model_id = %s"
        )
        await asyncio.to_thread(self._execute_query_sync, query, (feature_name, model_id))

    async def get_skill_access_controls(self) -> list[dict]:
        query = "SELECT skill_id, allowed_roles, enabled FROM GOVERNANCE_DB.AI.AI_SKILL_ACCESS_CONTROL"
        try:
            rows = await asyncio.to_thread(self._query_rows_sync, query)
        except Exception as exc:
            # Table hasn't been created yet — treat as no skill access controls configured
            err_str = str(exc)
            if "002003" in err_str or "42S02" in err_str or "does not exist" in err_str.lower():
                logger.warning("AI_SKILL_ACCESS_CONTROL table not found in Snowflake — returning empty skill controls")
                return []
            raise
        results = []
        for row in rows:
            results.append({
                "skill_id": row.get("SKILL_ID") or row.get("skill_id"),
                "allowed_roles": [str(r).upper() for r in (self._parse_variant(row.get("ALLOWED_ROLES") or row.get("allowed_roles")) or [])],
                "enabled": bool(row.get("ENABLED") if "ENABLED" in row else row.get("enabled")),
            })
        return results

    async def get_user_overrides(self, username: str) -> list[dict]:
        query = (
            "SELECT override_id, user_name, resource_type, resource_id, granted_by, granted_at, expires_at, is_active, source_request_id "
            "FROM GOVERNANCE_DB.AI.AI_ACCESS_OVERRIDES "
            "WHERE UPPER(user_name) = UPPER(%s) AND is_active = TRUE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP())"
        )
        rows = await asyncio.to_thread(self._query_rows_sync, query, (username,))
        results = []
        for row in rows:
            normalized = {str(k).upper(): v for k, v in row.items()}
            results.append({
                "override_id": normalized.get("OVERRIDE_ID"),
                "user_name": normalized.get("USER_NAME"),
                "resource_type": str(normalized.get("RESOURCE_TYPE") or "").upper(),
                "resource_id": normalized.get("RESOURCE_ID"),
                "granted_by": normalized.get("GRANTED_BY"),
                "granted_at": normalized.get("GRANTED_AT"),
                "expires_at": normalized.get("EXPIRES_AT"),
                "is_active": bool(normalized.get("IS_ACTIVE")),
                "source_request_id": normalized.get("SOURCE_REQUEST_ID"),
            })
        return results

    async def insert_access_request(
        self,
        request_id: str,
        requester: str,
        resource_type: str,
        resource_id: str,
        reason: str = "",
        metadata: Optional[dict] = None,
    ) -> None:
        query = (
            "INSERT INTO GOVERNANCE_DB.AI.AI_ACCESS_REQUESTS "
            "(request_id, requester, resource_type, resource_id, status, requested_at, reason, metadata) "
            "VALUES (%s, %s, %s, %s, 'PENDING', CURRENT_TIMESTAMP(), %s, PARSE_JSON(%s))"
        )
        await asyncio.to_thread(
            self._execute_query_sync,
            query,
            (request_id, requester, resource_type, resource_id, reason, json.dumps(metadata or {})),
        )

    async def list_access_requests(self, status: Optional[str] = None) -> list[dict]:
        base = (
            "SELECT request_id, requester, resource_type, resource_id, status, requested_at, reviewed_at, reviewed_by, reason, metadata "
            "FROM GOVERNANCE_DB.AI.AI_ACCESS_REQUESTS"
        )
        if status:
            base += " WHERE status = %s"
            rows = await asyncio.to_thread(self._query_rows_sync, base, (status.upper(),))
        else:
            rows = await asyncio.to_thread(self._query_rows_sync, base)
        results = []
        for row in rows:
            normalized = {str(k).upper(): v for k, v in row.items()}
            results.append({
                "request_id": normalized.get("REQUEST_ID"),
                "requester": normalized.get("REQUESTER"),
                "resource_type": normalized.get("RESOURCE_TYPE"),
                "resource_id": normalized.get("RESOURCE_ID"),
                "status": normalized.get("STATUS"),
                "requested_at": normalized.get("REQUESTED_AT"),
                "reviewed_at": normalized.get("REVIEWED_AT"),
                "reviewed_by": normalized.get("REVIEWED_BY"),
                "reason": normalized.get("REASON"),
                "metadata": normalized.get("METADATA") or {},
            })
        return results

    async def approve_request(
        self,
        request_id: str,
        reviewer: str,
        override_id: str,
        user_name: str,
        resource_type: str,
        resource_id: str,
        expires_at: Optional[str] = None,
    ) -> None:
        update_query = (
            "UPDATE GOVERNANCE_DB.AI.AI_ACCESS_REQUESTS "
            "SET status = 'APPROVED', reviewed_at = CURRENT_TIMESTAMP(), reviewed_by = %s "
            "WHERE request_id = %s"
        )
        await asyncio.to_thread(self._execute_query_sync, update_query, (reviewer, request_id))

        insert_query = (
            "INSERT INTO GOVERNANCE_DB.AI.AI_ACCESS_OVERRIDES "
            "(override_id, user_name, resource_type, resource_id, granted_by, granted_at, expires_at, is_active, source_request_id) "
            "VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP(), %s, TRUE, %s)"
        )
        await asyncio.to_thread(
            self._execute_query_sync,
            insert_query,
            (override_id, user_name, resource_type, resource_id, reviewer, expires_at, request_id),
        )

    async def reject_request(self, request_id: str, reviewer: str, reason: str = "") -> None:
        query = (
            "UPDATE GOVERNANCE_DB.AI.AI_ACCESS_REQUESTS "
            "SET status = 'REJECTED', reviewed_at = CURRENT_TIMESTAMP(), reviewed_by = %s, reason = %s "
            "WHERE request_id = %s"
        )
        await asyncio.to_thread(self._execute_query_sync, query, (reviewer, reason, request_id))

    async def create_override(
        self,
        override_id: str,
        user_name: str,
        resource_type: str,
        resource_id: str,
        granted_by: str,
        expires_at: Optional[str] = None,
        source_request_id: Optional[str] = None,
    ) -> None:
        query = (
            "INSERT INTO GOVERNANCE_DB.AI.AI_ACCESS_OVERRIDES "
            "(override_id, user_name, resource_type, resource_id, granted_by, granted_at, expires_at, is_active, source_request_id) "
            "VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP(), %s, TRUE, %s)"
        )
        await asyncio.to_thread(
            self._execute_query_sync,
            query,
            (override_id, user_name, resource_type, resource_id, granted_by, expires_at, source_request_id),
        )

    async def revoke_override(self, user_name: str, resource_type: str, resource_id: str) -> None:
        query = (
            "UPDATE GOVERNANCE_DB.AI.AI_ACCESS_OVERRIDES "
            "SET is_active = FALSE "
            "WHERE UPPER(user_name) = UPPER(%s) AND resource_type = %s AND resource_id = %s AND is_active = TRUE"
        )
        await asyncio.to_thread(self._execute_query_sync, query, (user_name, resource_type, resource_id))

    async def write_audit_event(
        self,
        audit_id: str,
        user_id: Optional[str],
        action: str,
        resource_type: Optional[str],
        resource_id: Optional[str],
        details: Optional[dict],
        performed_by: Optional[str],
    ) -> None:
        query = (
            "INSERT INTO GOVERNANCE_DB.AI.AI_GOVERNANCE_AUDIT "
            "(audit_id, user_id, action, resource_type, resource_id, details, performed_by, timestamp) "
            "VALUES (%s, %s, %s, %s, %s, PARSE_JSON(%s), %s, CURRENT_TIMESTAMP())"
        )
        await asyncio.to_thread(
            self._execute_query_sync,
            query,
            (audit_id, user_id, action, resource_type, resource_id, json.dumps(details or {}), performed_by),
        )

    async def get_audit_logs(self, limit: int = 100, offset: int = 0) -> list[dict]:
        query = (
            "SELECT audit_id, user_id, action, resource_type, resource_id, details, performed_by, timestamp "
            "FROM GOVERNANCE_DB.AI.AI_GOVERNANCE_AUDIT "
            "ORDER BY timestamp DESC LIMIT %s OFFSET %s"
        )
        rows = await asyncio.to_thread(self._query_rows_sync, query, (limit, offset))
        results = []
        for row in rows:
            normalized = {str(k).upper(): v for k, v in row.items()}
            results.append({
                "audit_id": normalized.get("AUDIT_ID"),
                "user_id": normalized.get("USER_ID"),
                "action": normalized.get("ACTION"),
                "resource_type": normalized.get("RESOURCE_TYPE"),
                "resource_id": normalized.get("RESOURCE_ID"),
                "details": normalized.get("DETAILS") or {},
                "performed_by": normalized.get("PERFORMED_BY"),
                "timestamp": normalized.get("TIMESTAMP"),
            })
        return results

    async def execute_query(self, query: str) -> dict:
        if not self.settings or not self.settings.snowflake_account:
            raise RuntimeError("Snowflake not configured")
        return await asyncio.to_thread(self._execute_query_sync, query)

    async def validate_credentials(self, username: str, password: str) -> bool:
        connector = self._load_connector()
        if connector is None:
            return False
        try:
            test_conn = await asyncio.to_thread(
                connector.connect,
                user=username,
                password=password,
                account=self.settings.snowflake_account,
                login_timeout=15,
            )
            await asyncio.to_thread(test_conn.close)
            return True
        except Exception:
            return False

    def close(self):
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None
            self._connected = False
