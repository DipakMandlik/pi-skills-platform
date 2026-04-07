from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.request import Request as UrlRequest, urlopen
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from apps.mcp.secretbox import SecretBoxError, decrypt_json, encrypt_json

from ..core.config import Settings
from ..core.database import (
    ModelConfigurationModel,
    RegisteredModelModel,
    SecretReferenceModel,
    get_session,
)
from ..schemas.api import (
    ModelConfigurationCreateRequest,
    ModelConfigurationListResponse,
    ModelConfigurationResponse,
    ModelConfigurationUpdateRequest,
    ModelAssignRequest,
    ModelAssignResponse,
    ModelConnectivityValidationRequest,
    ModelConnectivityValidationResponse,
    ModelListItem,
    ModelRevokeRequest,
    ModelRevokeResponse,
    ModelAccessInfo,
    ModelsListResponse,
    SecretReferenceCreateRequest,
    SecretReferenceListResponse,
    SecretReferenceResponse,
)
from ..services.permission_service import resolve_user_permissions, invalidate_user_permissions
from ..services.snowflake_service import SnowflakeService

logger = logging.getLogger("api.models_router")

router = APIRouter(prefix="/models", tags=["models"])


def _get_settings() -> Settings:
    from ..main import settings

    return settings


def _is_admin(request: Request) -> bool:
    user = request.state.user
    return user.has_any_role("ORG_ADMIN", "SECURITY_ADMIN", "ACCOUNTADMIN", "SYSADMIN")


def _require_admin(request: Request):
    if not _is_admin(request):
        raise HTTPException(
            status_code=403,
            detail={"status": 403, "title": "Access Denied", "detail": "Admin role required"},
        )
    return request.state.user


def _secret_box_key() -> str:
    return _get_settings().jwt_secret


def _read_secret_value(secret_row: SecretReferenceModel) -> str:
    key = _secret_box_key()
    if not key:
        raise HTTPException(
            status_code=500,
            detail={
                "status": 500,
                "title": "Configuration Error",
                "detail": "JWT secret is required for secret decryption",
            },
        )
    try:
        payload = decrypt_json(secret_row.encrypted_payload, key)
    except SecretBoxError as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "status": 500,
                "title": "Configuration Error",
                "detail": "Secret payload decryption failed",
            },
        ) from exc
    value = payload.get("secret_value")
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(
            status_code=500,
            detail={
                "status": 500,
                "title": "Configuration Error",
                "detail": "Secret payload is invalid",
            },
        )
    return value


def _validate_url(base_url: str) -> None:
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=400,
            detail={
                "status": 400,
                "title": "Bad Request",
                "detail": "base_url must be a valid http/https URL",
            },
        )


async def _validate_connectivity(
    provider: str,
    base_url: str,
    secret_reference_key: str,
    db: AsyncSession,
) -> ModelConnectivityValidationResponse:
    _validate_url(base_url)

    secret_result = await db.execute(
        select(SecretReferenceModel).where(
            SecretReferenceModel.reference_key == secret_reference_key,
            SecretReferenceModel.is_active == True,
        )
    )
    secret_row = secret_result.scalar_one_or_none()
    if secret_row is None:
        env_value = os.getenv(secret_reference_key, "").strip()
        if not env_value:
            return ModelConnectivityValidationResponse(
                valid=False,
                provider=provider,
                base_url=base_url,
                latency_ms=0,
                message="Secret reference not found in DB or environment",
            )
        secret_value = env_value
    else:
        secret_value = _read_secret_value(secret_row)

    start = time.perf_counter()
    try:
        req = UrlRequest(base_url, method="GET")
        with urlopen(req, timeout=5) as resp:
            status = int(getattr(resp, "status", 200))
        latency_ms = int((time.perf_counter() - start) * 1000)
        if status >= 500:
            return ModelConnectivityValidationResponse(
                valid=False,
                provider=provider,
                base_url=base_url,
                latency_ms=latency_ms,
                message=f"Endpoint responded with status {status}",
            )
        if not secret_value:
            return ModelConnectivityValidationResponse(
                valid=False,
                provider=provider,
                base_url=base_url,
                latency_ms=latency_ms,
                message="Secret reference resolved to empty value",
            )
        return ModelConnectivityValidationResponse(
            valid=True,
            provider=provider,
            base_url=base_url,
            latency_ms=latency_ms,
            message="Connectivity validation passed",
        )
    except Exception:
        latency_ms = int((time.perf_counter() - start) * 1000)
        return ModelConnectivityValidationResponse(
            valid=False,
            provider=provider,
            base_url=base_url,
            latency_ms=latency_ms,
            message="Connectivity validation failed (network/endpoint unavailable)",
        )


def _to_model_config_response(row: ModelConfigurationModel) -> ModelConfigurationResponse:
    return ModelConfigurationResponse(
        id=str(row.id),
        model_id=row.model_id,
        provider=row.provider,
        base_url=row.base_url,
        secret_reference_key=row.secret_reference_key,
        temperature=float(row.temperature),
        max_tokens=int(row.max_tokens),
        request_timeout_seconds=int(row.request_timeout_seconds),
        parameters=dict(row.parameters or {}),
        is_active=bool(row.is_active),
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


@router.get("", response_model=ModelsListResponse)
async def list_models(
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    user = request.state.user
    perms = await resolve_user_permissions(user)

    all_models = await db.execute(
        select(RegisteredModelModel).where(RegisteredModelModel.is_available == True)
    )
    all_models_list = all_models.scalars().all()

    models = []
    for m in all_models_list:
        if m.model_id not in perms.allowed_models:
            continue
        models.append(
            ModelListItem(
                model_id=m.model_id,
                display_name=m.display_name,
                provider=m.provider,
                tier=m.tier or "standard",
                is_available=m.is_available,
                access=None,
                assigned_users_count=0,
            )
        )

    return ModelsListResponse(models=models)


@router.post("/assign", response_model=ModelAssignResponse)
async def assign_model(
    body: ModelAssignRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    settings = _get_settings()
    snowflake = SnowflakeService(settings)

    model_check = await db.execute(
        select(RegisteredModelModel).where(RegisteredModelModel.model_id == body.model_id)
    )
    if model_check.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=400,
            detail={
                "status": 400,
                "title": "Bad Request",
                "detail": f"Unknown model: {body.model_id}",
            },
        )

    override_id = str(uuid4())
    await snowflake.create_override(
        override_id=override_id,
        user_name=body.user_id,
        resource_type="MODEL",
        resource_id=body.model_id,
        granted_by=admin.username or admin.user_id,
        expires_at=body.expires_at,
    )

    await invalidate_user_permissions(f"{settings.snowflake_account}:{body.user_id}")

    now = datetime.now(timezone.utc)
    return ModelAssignResponse(
        permission_id=override_id,
        user_id=body.user_id,
        model_id=body.model_id,
        granted_at=now.isoformat(),
        expires_at=body.expires_at,
        granted_by=admin.user_id,
    )


@router.post("/revoke", response_model=ModelRevokeResponse)
async def revoke_model(
    body: ModelRevokeRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    settings = _get_settings()
    snowflake = SnowflakeService(settings)

    await snowflake.revoke_override(
        user_name=body.user_id,
        resource_type="MODEL",
        resource_id=body.model_id,
    )

    await invalidate_user_permissions(f"{settings.snowflake_account}:{body.user_id}")

    return ModelRevokeResponse(
        revoked=True,
        effective_immediately=True,
        cache_invalidated=True,
    )


@router.get("/config", response_model=ModelConfigurationListResponse)
async def list_model_configurations(
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    result = await db.execute(
        select(ModelConfigurationModel).order_by(ModelConfigurationModel.created_at.desc())
    )
    rows = result.scalars().all()
    return ModelConfigurationListResponse(configs=[_to_model_config_response(row) for row in rows])


@router.post("/config", response_model=ModelConfigurationResponse)
async def create_model_configuration(
    body: ModelConfigurationCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    _validate_url(body.base_url)

    model_result = await db.execute(
        select(RegisteredModelModel).where(RegisteredModelModel.model_id == body.model_id)
    )
    if model_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=400,
            detail={
                "status": 400,
                "title": "Bad Request",
                "detail": f"Unknown model: {body.model_id}",
            },
        )

    validation = await _validate_connectivity(
        body.provider, body.base_url, body.secret_reference_key, db
    )
    if not validation.valid:
        raise HTTPException(
            status_code=400,
            detail={"status": 400, "title": "Validation Failed", "detail": validation.message},
        )

    existing_result = await db.execute(
        select(ModelConfigurationModel).where(
            ModelConfigurationModel.model_id == body.model_id,
            ModelConfigurationModel.provider == body.provider,
        )
    )
    if existing_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "status": 409,
                "title": "Conflict",
                "detail": "Configuration already exists for model/provider",
            },
        )

    row = ModelConfigurationModel(
        id=str(uuid4()),
        model_id=body.model_id,
        provider=body.provider,
        base_url=body.base_url,
        secret_reference_key=body.secret_reference_key,
        temperature=body.temperature,
        max_tokens=body.max_tokens,
        request_timeout_seconds=body.request_timeout_seconds,
        parameters=body.parameters,
        is_active=True,
        created_by=admin.user_id,
        updated_by=admin.user_id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_model_config_response(row)


@router.put("/config/{config_id}", response_model=ModelConfigurationResponse)
async def update_model_configuration(
    config_id: str,
    body: ModelConfigurationUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    result = await db.execute(
        select(ModelConfigurationModel).where(ModelConfigurationModel.id == config_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Configuration not found"},
        )

    if body.base_url is not None:
        _validate_url(body.base_url)
        row.base_url = body.base_url
    if body.secret_reference_key is not None:
        row.secret_reference_key = body.secret_reference_key
    if body.temperature is not None:
        row.temperature = body.temperature
    if body.max_tokens is not None:
        row.max_tokens = body.max_tokens
    if body.request_timeout_seconds is not None:
        row.request_timeout_seconds = body.request_timeout_seconds
    if body.parameters is not None:
        row.parameters = body.parameters
    if body.is_active is not None:
        row.is_active = body.is_active
    row.updated_by = admin.user_id

    validation = await _validate_connectivity(
        row.provider, row.base_url, row.secret_reference_key, db
    )
    if not validation.valid:
        raise HTTPException(
            status_code=400,
            detail={"status": 400, "title": "Validation Failed", "detail": validation.message},
        )

    await db.commit()
    await db.refresh(row)
    return _to_model_config_response(row)


@router.delete("/config/{config_id}")
async def delete_model_configuration(
    config_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    result = await db.execute(
        select(ModelConfigurationModel).where(ModelConfigurationModel.id == config_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"status": 404, "title": "Not Found", "detail": "Configuration not found"},
        )
    await db.delete(row)
    await db.commit()
    return {"deleted": True, "id": config_id}


@router.post("/config/validate", response_model=ModelConnectivityValidationResponse)
async def validate_model_configuration_connectivity(
    body: ModelConnectivityValidationRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    return await _validate_connectivity(body.provider, body.base_url, body.secret_reference_key, db)


@router.get("/secrets", response_model=SecretReferenceListResponse)
async def list_secret_references(
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    _require_admin(request)
    result = await db.execute(
        select(SecretReferenceModel).order_by(SecretReferenceModel.created_at.desc())
    )
    rows = result.scalars().all()
    return SecretReferenceListResponse(
        references=[
            SecretReferenceResponse(
                reference_key=row.reference_key,
                provider=row.provider,
                is_active=row.is_active,
                created_at=row.created_at.isoformat() if row.created_at else "",
            )
            for row in rows
        ]
    )


@router.post("/secrets", response_model=SecretReferenceResponse)
async def create_secret_reference(
    body: SecretReferenceCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
):
    admin = _require_admin(request)
    key = _secret_box_key()
    if not key:
        raise HTTPException(
            status_code=500,
            detail={
                "status": 500,
                "title": "Configuration Error",
                "detail": "JWT secret is required for secret encryption",
            },
        )

    existing_result = await db.execute(
        select(SecretReferenceModel).where(SecretReferenceModel.reference_key == body.reference_key)
    )
    existing = existing_result.scalar_one_or_none()
    encrypted = encrypt_json({"secret_value": body.secret_value}, key)

    if existing is None:
        row = SecretReferenceModel(
            id=str(uuid4()),
            reference_key=body.reference_key,
            provider=body.provider,
            encrypted_payload=encrypted,
            is_active=True,
            created_by=admin.user_id,
        )
        db.add(row)
    else:
        existing.provider = body.provider
        existing.encrypted_payload = encrypted
        existing.is_active = True
        row = existing

    await db.commit()
    if existing is None:
        await db.refresh(row)

    return SecretReferenceResponse(
        reference_key=row.reference_key,
        provider=row.provider,
        is_active=row.is_active,
        created_at=row.created_at.isoformat() if row.created_at else "",
    )
