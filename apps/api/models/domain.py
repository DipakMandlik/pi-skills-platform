from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

SNOWFLAKE_ADMIN_ROLES = (
    "ACCOUNTADMIN",
    "ORG_ADMIN",
    "SYSADMIN",
    "SECURITYADMIN",
    "SECURITY_ADMIN",
)

_LEGACY_ROLE_EXPANSIONS = {
    "ADMIN": list(SNOWFLAKE_ADMIN_ROLES),
    "ORG_ADMIN": ["ORG_ADMIN"],
    "USER": ["ALL"],
    "VIEWER": ["VIEWER"],
    "ALL": ["ALL"],
    "ANY": ["ALL"],
    "*": ["ALL"],
}


def normalize_authorization_roles(values: list[str] | None) -> list[str]:
    normalized: list[str] = []
    for raw in values or []:
        upper = str(raw or "").strip().upper()
        if not upper:
            continue
        expanded = _LEGACY_ROLE_EXPANSIONS.get(upper, [upper])
        for role in expanded:
            if role not in normalized:
                normalized.append(role)
    return normalized


@dataclass
class AuthUser:
    user_id: str
    email: str
    role: str
    display_name: str
    request_id: str = ""
    token_exp: int = 0
    primary_role: str = ""
    roles: list[str] = field(default_factory=list)
    account: str = ""
    username: str = ""

    def __post_init__(self):
        normalized_roles = [r.upper() for r in (self.roles or []) if r]
        normalized_role = (self.role or "").upper()
        if not normalized_roles and normalized_role:
            normalized_roles = [normalized_role]
        object.__setattr__(self, "roles", normalized_roles)
        object.__setattr__(self, "role", normalized_role or (normalized_roles[0] if normalized_roles else ""))
        normalized_primary_role = (self.primary_role or "").upper() or (normalized_roles[0] if normalized_roles else "")
        object.__setattr__(self, "primary_role", normalized_primary_role)
        if (not self.account or not self.username) and ":" in self.user_id:
            account, username = self.user_id.split(":", 1)
            if not self.account:
                object.__setattr__(self, "account", account)
            if not self.username:
                object.__setattr__(self, "username", username)

    def has_role(self, role: str) -> bool:
        return role.upper() in self.roles

    def has_any_role(self, *roles: str) -> bool:
        return any(self.has_role(r) for r in roles)

    def has_admin_access(self) -> bool:
        return self.has_any_role(*SNOWFLAKE_ADMIN_ROLES)


@dataclass
class UserPermissions:
    user_id: str
    allowed_models: list[str] = field(default_factory=list)
    allowed_skills: list[str] = field(default_factory=list)
    enabled_features: list[str] = field(default_factory=list)


@dataclass
class GuardContext:
    user_id: str
    role: str
    skill_id: str
    model_id: str
    request_id: str
    started_at: float


class GuardDenied(Exception):
    def __init__(self, reason: str, message: str = ""):
        self.reason = reason
        self.message = message or reason
        super().__init__(self.message)


class ModelInvocationError(Exception):
    pass


@dataclass
class ModelResult:
    content: str
    tokens_used: int
    model_id: str
    finish_reason: str = "end_turn"
    input_tokens: int = 0
    output_tokens: int = 0
