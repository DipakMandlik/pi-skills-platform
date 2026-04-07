from __future__ import annotations

import re
from typing import Any

import sqlglot
from sqlglot import exp

IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")
CREATE_PROCEDURE_PATTERN = re.compile(r"^create\s+(or\s+replace\s+)?procedure\b", re.IGNORECASE | re.DOTALL)
CALL_PROCEDURE_PATTERN = re.compile(r"^call\b", re.IGNORECASE)


class ValidationError(ValueError):
    pass


def validate_identifier(name: str, field_name: str) -> str:
    value = name.strip()
    if not value:
        raise ValidationError(f"{field_name} is required")
    if not IDENTIFIER_PATTERN.match(value):
        raise ValidationError(f"{field_name} contains invalid characters")
    return value


def validate_days(days: int) -> int:
    if days < 1 or days > 90:
        raise ValidationError("days must be between 1 and 90")
    return days


def validate_max_rows(max_rows: int | None, hard_cap: int) -> int:
    if max_rows is None:
        return hard_cap
    if max_rows < 1:
        raise ValidationError("max_rows must be greater than 0")
    return min(max_rows, hard_cap)


def classify_statement(query: str) -> str:
    normalized = query.strip()
    if CREATE_PROCEDURE_PATTERN.match(normalized):
        return "CREATE_PROCEDURE"
    if CALL_PROCEDURE_PATTERN.match(normalized):
        return "CALL"

    parsed = sqlglot.parse_one(query, read="snowflake")
    if isinstance(parsed, exp.Select):
        return "SELECT"
    if isinstance(parsed, exp.Show):
        return "SHOW"
    if isinstance(parsed, exp.Describe):
        return "DESCRIBE"
    if isinstance(parsed, exp.With):
        return "SELECT"
    return parsed.key.upper() if parsed.key else "UNKNOWN"


def enforce_safety(query: str, mode: str) -> None:
    statement_type = classify_statement(query)
    if mode == "prod":
        allowed = {"SELECT", "SHOW", "DESCRIBE"}
    else:
        # Dev mode allows controlled object creation for iterative workflows.
        allowed = {
            "SELECT",
            "SHOW",
            "DESCRIBE",
            "WITH",
            "CREATE",
            "CREATE_PROCEDURE",
            "CALL",
        }

    if statement_type not in allowed:
        raise ValidationError(
            f"Statement type '{statement_type}' is not allowed in SQL_SAFETY_MODE={mode}"
        )


def apply_row_limit(query: str, default_limit: int) -> str:
    statement_type = classify_statement(query)
    if statement_type not in {"SELECT", "WITH"}:
        return query

    parsed = sqlglot.parse_one(query, read="snowflake")
    if parsed.find(exp.Limit):
        return query

    if isinstance(parsed, (exp.Select, exp.With, exp.Union)) or parsed.find(exp.Select):
        return f"{query.rstrip(';')} LIMIT {default_limit}"
    return query


def sanitize_error(error: Exception) -> dict[str, Any]:
    return {
        "error": error.__class__.__name__,
        "message": str(error),
    }
