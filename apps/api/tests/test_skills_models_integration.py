from __future__ import annotations

import asyncio
import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

SECRET = "0123456789abcdef0123456789abcdef"
os.environ["JWT_SECRET"] = SECRET

from apps.api.core import database as db_module
from apps.api.core.config import Settings
from apps.api.core.database import (
    RegisteredModelModel,
    SkillDefinitionModel,
    SkillStateModel,
    create_tables,
    init_engine,
)
from apps.api.models.domain import AuthUser
from apps.api.routers import models as models_router_module
from apps.api.routers.models import router as models_router
from apps.api.routers.skills import router as skills_router
from apps.api.schemas.api import ModelConnectivityValidationResponse
from apps.api.services.skill_registry import get_default_registry_items


def _build_app(tmp_path: Path) -> FastAPI:
    db_path = tmp_path / "integration_test.db"
    settings = Settings(
        jwt_secret=SECRET,
        app_env="test",
        postgres_dsn=f"sqlite+aiosqlite:///{db_path.as_posix()}",
    )

    init_engine(settings)
    asyncio.run(create_tables())
    asyncio.run(_seed_data())

    app = FastAPI()

    @app.middleware("http")
    async def inject_user(request, call_next):
        request.state.user = AuthUser(
            user_id="admin-user",
            email="admin@platform.local",
            role="admin",
            display_name="Admin",
            request_id="integration-test",
        )
        return await call_next(request)

    app.include_router(skills_router)
    app.include_router(models_router)
    return app


async def _seed_data() -> None:
    if db_module._session_factory is None:
        raise RuntimeError("session factory not initialized")

    async with db_module._session_factory() as db:
        existing_model = await db.get(RegisteredModelModel, "gpt-4.1")
        if existing_model is None:
            db.add(
                RegisteredModelModel(
                    model_id="gpt-4.1",
                    display_name="GPT-4.1",
                    provider="openai",
                    tier="premium",
                    is_available=True,
                    max_tokens=8192,
                    cost_per_1k_tokens=0.005,
                )
            )

        for item in get_default_registry_items():
            def_key_result = await db.execute(
                select(SkillDefinitionModel).where(
                    SkillDefinitionModel.skill_id == item.skill_id,
                    SkillDefinitionModel.version == item.version,
                )
            )
            def_key = def_key_result.scalar_one_or_none()
            if def_key is None:
                db.add(
                    SkillDefinitionModel(
                        skill_id=item.skill_id,
                        version=item.version,
                        display_name=item.display_name,
                        description=item.description,
                        required_models=item.required_models,
                        input_schema=item.input_schema,
                        output_format=item.output_format,
                        execution_handler=item.execution_handler,
                        error_handling=item.error_handling,
                        created_by="integration-test",
                        updated_by="integration-test",
                    )
                )
            state_key_result = await db.execute(
                select(SkillStateModel).where(
                    SkillStateModel.skill_id == item.skill_id,
                    SkillStateModel.version == item.version,
                )
            )
            state_key = state_key_result.scalar_one_or_none()
            if state_key is None:
                db.add(
                    SkillStateModel(
                        skill_id=item.skill_id,
                        version=item.version,
                        is_enabled=item.is_enabled,
                        updated_by="integration-test",
                    )
                )

        await db.commit()


def test_skill_registry_and_state_update_flow(tmp_path: Path) -> None:
    client = TestClient(_build_app(tmp_path))

    registry_response = client.get("/skills/registry")
    assert registry_response.status_code == 200

    skills = registry_response.json()["skills"]
    assert len(skills) >= 1
    target_skill = skills[0]
    target_skill_id = target_skill["skill_id"]
    initial_state = target_skill["is_enabled"]

    update_response = client.patch(
        f"/skills/{target_skill_id}/state",
        json={"is_enabled": not initial_state},
    )
    assert update_response.status_code == 200
    assert update_response.json()["skill_id"] == target_skill_id
    assert update_response.json()["is_enabled"] is (not initial_state)

    refreshed_registry = client.get("/skills/registry")
    assert refreshed_registry.status_code == 200
    refreshed_target = next(
        item for item in refreshed_registry.json()["skills"] if item["skill_id"] == target_skill_id
    )
    assert refreshed_target["is_enabled"] is (not initial_state)


def test_model_configuration_crud_and_validate_flow(tmp_path: Path) -> None:
    client = TestClient(_build_app(tmp_path))

    create_secret_response = client.post(
        "/models/secrets",
        json={
            "reference_key": "OPENAI_API_KEY_TEST",
            "provider": "openai",
            "secret_value": "sk-test-secret-value",
        },
    )
    assert create_secret_response.status_code == 200
    assert create_secret_response.json()["reference_key"] == "OPENAI_API_KEY_TEST"

    list_secret_response = client.get("/models/secrets")
    assert list_secret_response.status_code == 200
    assert any(
        row["reference_key"] == "OPENAI_API_KEY_TEST"
        for row in list_secret_response.json()["references"]
    )

    validation_response = client.post(
        "/models/config/validate",
        json={
            "provider": "openai",
            "base_url": "https://api.openai.com/v1/models",
            "secret_reference_key": "MISSING_SECRET_KEY",
        },
    )
    assert validation_response.status_code == 200
    assert validation_response.json()["valid"] is False

    with patch.object(
        models_router_module,
        "_validate_connectivity",
        new=AsyncMock(
            return_value=ModelConnectivityValidationResponse(
                valid=True,
                provider="openai",
                base_url="https://api.openai.com/v1/models",
                latency_ms=7,
                message="Connectivity validation passed",
            )
        ),
    ):
        create_config_response = client.post(
            "/models/config",
            json={
                "model_id": "gpt-4.1",
                "provider": "openai",
                "base_url": "https://api.openai.com/v1/models",
                "secret_reference_key": "OPENAI_API_KEY_TEST",
                "temperature": 0.3,
                "max_tokens": 4000,
                "request_timeout_seconds": 30,
                "parameters": {"top_p": 0.95},
            },
        )
        assert create_config_response.status_code == 200
        created_config = create_config_response.json()
        config_id = created_config["id"]

        update_config_response = client.put(
            f"/models/config/{config_id}",
            json={
                "base_url": "https://api.openai.com/v1/chat/completions",
                "temperature": 0.1,
                "is_active": True,
            },
        )
        assert update_config_response.status_code == 200
        assert (
            update_config_response.json()["base_url"]
            == "https://api.openai.com/v1/chat/completions"
        )

    list_config_response = client.get("/models/config")
    assert list_config_response.status_code == 200
    assert len(list_config_response.json()["configs"]) == 1

    delete_config_response = client.delete(f"/models/config/{config_id}")
    assert delete_config_response.status_code == 200
    assert delete_config_response.json()["deleted"] is True

    post_delete_list = client.get("/models/config")
    assert post_delete_list.status_code == 200
    assert post_delete_list.json()["configs"] == []
