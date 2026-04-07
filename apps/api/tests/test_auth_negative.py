from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from apps.api.core.config import validate_jwt_secret as validate_api_jwt_secret
from apps.api.middleware.auth import JWTAuthMiddleware
from apps.api.core.config import Settings


SECRET = "0123456789abcdef0123456789abcdef"


def _build_app() -> FastAPI:
    app = FastAPI()
    settings = Settings(jwt_secret=SECRET)
    app.add_middleware(JWTAuthMiddleware, settings=settings)

    @app.get("/protected")
    def protected() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/auth/me")
    def me(request: Request) -> dict[str, str]:
        user = request.state.user
        return {
            "user_id": user.user_id,
            "email": user.email,
            "role": user.role,
        }

    return app


def _build_token(exp: datetime) -> str:
    payload = {
        "sub": "user-1",
        "email": "user@example.com",
        "role": "VIEWER",
        "roles": ["VIEWER"],
        "display_name": "User",
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")


def test_invalid_token_rejected() -> None:
    client = TestClient(_build_app())

    response = client.get("/protected", headers={"Authorization": "Bearer invalid.token.value"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid token"


def test_expired_token_rejected() -> None:
    client = TestClient(_build_app())
    expired = _build_token(datetime.now(timezone.utc) - timedelta(minutes=5))

    response = client.get("/protected", headers={"Authorization": f"Bearer {expired}"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Token expired"


def test_validate_jwt_secret_rejects_missing_and_weak_values() -> None:
    for value in ("", "short", "change-me-in-production-please"):
        try:
            validate_api_jwt_secret(value)
            assert False, f"Expected ValueError for value: {value!r}"
        except ValueError as exc:
            assert "JWT_SECRET" in str(exc)


def test_non_jwt_token_rejected_without_cross_service_fallback() -> None:
    client = TestClient(_build_app())

    response = client.get("/auth/me", headers={"Authorization": "Bearer mcp_hex_like_token"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid token"
