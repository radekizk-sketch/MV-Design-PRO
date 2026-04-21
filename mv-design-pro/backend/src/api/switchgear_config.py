"""
Switchgear Config API — CRUD + walidacja konfiguracji rozdzielnicy.

RUN #3I COMMIT 2: REST API dla SwitchgearConfigV1.

Endpointy:
- GET  /api/switchgear/{station_id}/config         → pobranie konfiguracji
- PUT  /api/switchgear/{station_id}/config         → zapis konfiguracji
- POST /api/switchgear/{station_id}/validate       → walidacja (issues + fixActions)

Wzorzec: in-memory store (jak sld_overrides.py), Pydantic na granicy API.
"""

from __future__ import annotations

from typing import Any

from domain.field_device import (
    AparatTypeV1,
    DeviceTypeV1,
    FieldRoleV1,
    PoleTypeV1,
)
from domain.switchgear_config import (
    CatalogBindingV1,
    DeviceConfigV1,
    FieldConfigV1,
    ProtectionBindingV1,
    SwitchgearConfigV1,
    canonicalize_config,
    compute_config_hash,
    validate_switchgear_config,
)
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/switchgear",
    tags=["switchgear-config"],
)

# =============================================================================
# REQUEST / RESPONSE MODELS (Pydantic — API boundary only)
# =============================================================================


class FieldConfigRequest(BaseModel):
    field_id: str
    pole_type: str
    field_role: str
    bus_section_id: str | None = None


class DeviceConfigRequest(BaseModel):
    device_id: str
    field_id: str
    device_type: str
    aparat_type: str


class CatalogBindingRequest(BaseModel):
    device_id: str
    catalog_id: str
    catalog_name: str
    manufacturer: str | None = None
    catalog_version: str | None = None


class ProtectionBindingRequest(BaseModel):
    relay_device_id: str
    cb_device_id: str


class PutConfigRequest(BaseModel):
    fields: list[FieldConfigRequest] = []
    devices: list[DeviceConfigRequest] = []
    catalog_bindings: list[CatalogBindingRequest] = []
    protection_bindings: list[ProtectionBindingRequest] = []


class ConfigResponse(BaseModel):
    config_version: str
    station_id: str
    fields: list[dict[str, Any]]
    devices: list[dict[str, Any]]
    catalog_bindings: list[dict[str, Any]]
    protection_bindings: list[dict[str, Any]]
    canonical_hash: str


class ValidationIssueResponse(BaseModel):
    code: str
    severity: str
    message_pl: str
    element_id: str | None = None
    field_id: str | None = None
    device_id: str | None = None


class FixActionResponse(BaseModel):
    code: str
    action: str
    message_pl: str
    station_id: str
    field_id: str | None = None
    device_id: str | None = None


class ValidateResponse(BaseModel):
    valid: bool
    issues: list[ValidationIssueResponse]
    fix_actions: list[FixActionResponse]
    canonical_hash: str


# =============================================================================
# IN-MEMORY STORE
# =============================================================================

_config_store: dict[str, SwitchgearConfigV1] = {}


def _get_config(station_id: str) -> SwitchgearConfigV1:
    """Pobierz konfiguracje lub zwroc pusta."""
    return _config_store.get(
        station_id,
        SwitchgearConfigV1(station_id=station_id),
    )


def _parse_config(station_id: str, req: PutConfigRequest) -> SwitchgearConfigV1:
    """Parse request into domain model."""
    fields = tuple(
        FieldConfigV1(
            field_id=f.field_id,
            pole_type=PoleTypeV1(f.pole_type),
            field_role=FieldRoleV1(f.field_role),
            bus_section_id=f.bus_section_id,
        )
        for f in req.fields
    )
    devices = tuple(
        DeviceConfigV1(
            device_id=d.device_id,
            field_id=d.field_id,
            device_type=DeviceTypeV1(d.device_type),
            aparat_type=AparatTypeV1(d.aparat_type),
        )
        for d in req.devices
    )
    catalog_bindings = tuple(
        CatalogBindingV1(
            device_id=b.device_id,
            catalog_id=b.catalog_id,
            catalog_name=b.catalog_name,
            manufacturer=b.manufacturer,
            catalog_version=b.catalog_version,
        )
        for b in req.catalog_bindings
    )
    protection_bindings = tuple(
        ProtectionBindingV1(
            relay_device_id=p.relay_device_id,
            cb_device_id=p.cb_device_id,
        )
        for p in req.protection_bindings
    )
    return SwitchgearConfigV1(
        station_id=station_id,
        fields=fields,
        devices=devices,
        catalog_bindings=catalog_bindings,
        protection_bindings=protection_bindings,
    )


def _to_response(config: SwitchgearConfigV1) -> ConfigResponse:
    """Convert domain model to API response."""
    canonical = canonicalize_config(config)
    return ConfigResponse(
        config_version=canonical.config_version,
        station_id=canonical.station_id,
        fields=[f.to_dict() for f in canonical.fields],
        devices=[d.to_dict() for d in canonical.devices],
        catalog_bindings=[b.to_dict() for b in canonical.catalog_bindings],
        protection_bindings=[p.to_dict() for p in canonical.protection_bindings],
        canonical_hash=compute_config_hash(canonical),
    )


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.get(
    "/{station_id}/config",
    response_model=ConfigResponse,
    summary="Pobierz konfiguracje rozdzielnicy",
)
async def get_config(station_id: str) -> ConfigResponse:
    """Pobierz konfiguracje rozdzielnicy (kanonizowana, z hashem)."""
    config = _get_config(station_id)
    return _to_response(config)


@router.put(
    "/{station_id}/config",
    response_model=ConfigResponse,
    summary="Zapisz konfiguracje rozdzielnicy",
)
async def put_config(station_id: str, req: PutConfigRequest) -> ConfigResponse:
    """Zapisz konfiguracje rozdzielnicy (kanonizowana, deterministyczna)."""
    config = _parse_config(station_id, req)
    canonical = canonicalize_config(config)
    _config_store[station_id] = canonical
    return _to_response(canonical)


@router.post(
    "/{station_id}/validate",
    response_model=ValidateResponse,
    summary="Waliduj konfiguracje rozdzielnicy",
)
async def validate_config(
    station_id: str,
    req: PutConfigRequest,
) -> ValidateResponse:
    """Waliduj konfiguracje bez zapisu. Zwraca issues + fixActions."""
    config = _parse_config(station_id, req)
    result = validate_switchgear_config(config)
    canonical = canonicalize_config(config)
    return ValidateResponse(
        valid=result.valid,
        issues=[
            ValidationIssueResponse(
                code=i.code,
                severity=i.severity.value,
                message_pl=i.message_pl,
                element_id=i.element_id,
                field_id=i.field_id,
                device_id=i.device_id,
            )
            for i in result.issues
        ],
        fix_actions=[
            FixActionResponse(
                code=fa.code,
                action=fa.action.value,
                message_pl=fa.message_pl,
                station_id=fa.station_id,
                field_id=fa.field_id,
                device_id=fa.device_id,
            )
            for fa in result.fix_actions
        ],
        canonical_hash=compute_config_hash(canonical),
    )
