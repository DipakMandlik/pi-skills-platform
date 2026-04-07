from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator
import collections
import collections.abc
import os
import threading
import time

from .config import Settings


class SnowflakeClientUnavailableError(RuntimeError):
    pass


class SnowflakeClient:
    def __init__(self, settings: Settings, runtime_credentials: dict[str, Any] | None = None) -> None:
        self.settings = settings
        self.runtime_credentials = runtime_credentials or {}
        self._connection: Any | None = None
        self._connection_lock = threading.RLock()
        self._query_lock = threading.RLock()
        self._list_cache_lock = threading.RLock()
        self._list_cache: dict[str, tuple[float, dict[str, Any]]] = {}
        self._list_cache_ttl_seconds = 300
        if self.settings.suppress_cloud_metadata_probes:
            os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")
            os.environ.setdefault("AWS_METADATA_SERVICE_TIMEOUT", "1")
            os.environ.setdefault("AWS_METADATA_SERVICE_NUM_ATTEMPTS", "1")

    def _load_connector(self):
        try:
            # Compatibility patch for legacy dependency chains on Python 3.13+.
            if not hasattr(collections, "Mapping"):
                collections.Mapping = collections.abc.Mapping  # type: ignore[attr-defined]
            if not hasattr(collections, "MutableMapping"):
                collections.MutableMapping = collections.abc.MutableMapping  # type: ignore[attr-defined]
            if not hasattr(collections, "Sequence"):
                collections.Sequence = collections.abc.Sequence  # type: ignore[attr-defined]
            import snowflake.connector  # type: ignore
            return snowflake.connector
        except Exception as exc:  # pragma: no cover - runtime environment dependent
            raise SnowflakeClientUnavailableError(
                "snowflake-connector-python is unavailable in this Python runtime. "
                "Use Python 3.10-3.13 and reinstall backend dependencies."
            ) from exc

    def _create_connection(self) -> Any:
        connector = self._load_connector()
        account = self.runtime_credentials.get("account") or self.settings.snowflake_account
        user = self.runtime_credentials.get("username") or self.settings.snowflake_user
        password = self.runtime_credentials.get("password") or self.settings.snowflake_password
        role = self.runtime_credentials.get("role") or self.settings.snowflake_role
        warehouse = self.runtime_credentials.get("warehouse") or self.settings.snowflake_warehouse
        database = self.runtime_credentials.get("database") or self.settings.snowflake_database
        schema = self.runtime_credentials.get("schema") or self.settings.snowflake_schema
        return connector.connect(
            account=account,
            user=user,
            password=password,
            role=role,
            warehouse=warehouse,
            database=database,
            schema=schema,
            login_timeout=10,
            network_timeout=self.settings.sql_timeout_seconds,
            client_session_keep_alive=True,
            ocsp_fail_open=True,
        )

    def _get_connection(self) -> Any:
        with self._connection_lock:
            if self._connection is None:
                self._connection = self._create_connection()
            return self._connection

    def _reset_connection(self) -> None:
        with self._connection_lock:
            conn = self._connection
            self._connection = None
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    @contextmanager
    def get_connection(self) -> Iterator[Any]:
        conn = self._get_connection()
        try:
            yield conn
        except Exception:
            self._reset_connection()
            raise

    def execute_query(self, query: str, params: Any | None = None) -> dict[str, Any]:
        last_error: Exception | None = None
        for _attempt in range(2):
            try:
                with self.get_connection() as conn:
                    with self._query_lock:
                        with conn.cursor() as cursor:
                            if params is None:
                                cursor.execute(query)
                            else:
                                cursor.execute(query, params)
                            columns = [col[0] for col in cursor.description] if cursor.description else []
                            rows = cursor.fetchall() if columns else []
                            return {
                                "query_id": cursor.sfqid,
                                "columns": columns,
                                "rows": [list(row) for row in rows],
                                "row_count": len(rows),
                            }
            except Exception as exc:
                last_error = exc
                self._reset_connection()

        if last_error is not None:
            raise last_error
        raise RuntimeError("Snowflake query failed without an exception")

    def execute_list(
        self,
        query: str,
        key: str,
        value_column_candidates: list[str] | None = None,
    ) -> dict[str, Any]:
        candidates_key = ",".join((value_column_candidates or []))
        cache_key = f"{key}|{query}|{candidates_key}"
        now = time.monotonic()

        with self._list_cache_lock:
            cached = self._list_cache.get(cache_key)
            if cached and now - cached[0] < self._list_cache_ttl_seconds:
                return cached[1]

        result = self.execute_query(query)
        columns = [str(col).lower() for col in result.get("columns", [])]
        target_index = 0

        if value_column_candidates:
            for candidate in value_column_candidates:
                candidate_name = candidate.lower()
                if candidate_name in columns:
                    target_index = columns.index(candidate_name)
                    break

        values = []
        for row in result["rows"]:
            if row and len(row) > target_index:
                values.append(str(row[target_index]))

        payload = {key: values, "query_id": result["query_id"]}
        with self._list_cache_lock:
            self._list_cache[cache_key] = (time.monotonic(), payload)
        return payload
