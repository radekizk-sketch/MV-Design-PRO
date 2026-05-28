"""Type Catalog API endpoints (P8.2 + P13b)

Provides REST API for Type Library operations:
- Fetch catalog types (line, cable, transformer, switch equipment)
- Assign type_ref to elements (branches, transformers, switches)
- Clear type_ref from elements
- Export/Import type library with governance (P13b)

All assign/clear endpoints return 204 No Content.
"""

from __future__ import annotations

from collections.abc import Callable
from infrastructure.persistence.unit_of_work import UnitOfWork

from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.analyses.protection.catalog.catalog_store import (
    list_devices as list_analytical_protection_devices,
)
from application.analyses.protection.catalog.catalog_store import (
    load_device_capability,
)
from application.catalog_governance import CatalogGovernanceService
from application.network_wizard import NetworkWizardService
from application.network_wizard.service import NotFound
from fastapi import APIRouter, Depends, HTTPException, Response, status
from network_model.catalog.governance import ImportMode
from network_model.catalog.mv_branch_point_catalog import get_all_branch_point_types
from network_model.catalog.mv_ptpiree_catalog import get_ptpiree_catalog_manifest
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.switchgear import (
    list_switchgear_solution_templates_for_manufacturer,
)
from network_model.catalog.switchgear import (
    list_families_for_manufacturer,
)
from network_model.catalog.switchgear import (
    list_manufacturers as list_switchgear_manufacturers,
)
from network_model.catalog.switchgear import (
    list_switchgear_families,
)
from pydantic import BaseModel

router = APIRouter(prefix="/api/catalog", tags=["Type Catalog"])


def _serialize_analytical_protection_device(device: Any) -> dict[str, Any]:
    meta = dict(device.meta or {})
    notes: list[str] = []
    source_ref = meta.get("source_ref")
    if source_ref:
        notes.append(str(source_ref))
    if meta.get("unverified"):
        notes.append(
            "Rekord analityczny: dane urzadzenia nie sa jeszcze zweryfikowane produkcyjnie."
        )
    if meta.get("unverified_ranges"):
        notes.append("Zakresy nastaw pochodza z katalogu analitycznego i wymagaja weryfikacji.")
    verification_status = "NIEWERYFIKOWANY" if meta.get("unverified") else "CZESCIOWO_ZWERYFIKOWANY"

    return {
        "id": device.device_id,
        "name_pl": f"{device.vendor} {device.model}",
        "params": {
            "vendor": device.vendor,
            "model": device.model,
            "series": str(meta.get("series") or device.model),
            "revision": "v0",
            "rated_current_a": float(meta["rated"]) if meta.get("rated") is not None else None,
            "notes_pl": " ".join(notes) if notes else None,
            "source_catalog": "backend/src/application/analyses/protection/catalog/data/devices_v0.json",
            "unverified": bool(meta.get("unverified", False)),
            "unverified_ranges": bool(meta.get("unverified_ranges", False)),
            "source_reference": str(source_ref or "devices_v0.json / katalog analityczny ochrony"),
            "verification_status": verification_status,
            "catalog_status": "ANALITYCZNY_V1",
            "contract_version": "2.0",
            "verification_note": (
                "Zakres ochrony pochodzi z katalogu analitycznego; rekord nie jest promowany do katalogu produkcyjnego."
                if meta.get("unverified") or meta.get("unverified_ranges")
                else "Rekord analityczny zachowany poza torem produkcyjnym."
            ),
            "functions_supported": list(device.functions_supported),
            "curves_supported": list(device.curves_supported),
            "i_pickup_51_a_min": device.i_pickup_51_a_min,
            "i_pickup_51_a_max": device.i_pickup_51_a_max,
            "tms_51_min": device.tms_51_min,
            "tms_51_max": device.tms_51_max,
            "i_inst_50_a_min": device.i_inst_50_a_min,
            "i_inst_50_a_max": device.i_inst_50_a_max,
            "i_pickup_51n_a_min": device.i_pickup_51n_a_min,
            "i_pickup_51n_a_max": device.i_pickup_51n_a_max,
            "tms_51n_min": device.tms_51n_min,
            "tms_51n_max": device.tms_51n_max,
            "i_inst_50n_a_min": device.i_inst_50n_a_min,
            "i_inst_50n_a_max": device.i_inst_50n_a_max,
        },
    }


def _build_service(uow_factory: Any) -> NetworkWizardService:
    return NetworkWizardService(uow_factory)


def _build_governance_service(uow_factory: Any) -> CatalogGovernanceService:
    return CatalogGovernanceService(uow_factory)


class AssignTypePayload(BaseModel):
    """Payload for assigning type_ref to element"""

    type_id: str  # UUID as string


class ImportTypeLibraryPayload(BaseModel):
    """Payload for importing type library"""

    manifest: dict[str, Any]
    line_types: list[dict[str, Any]]
    cable_types: list[dict[str, Any]]
    transformer_types: list[dict[str, Any]]
    switch_types: list[dict[str, Any]]


class ImportProtectionLibraryPayload(BaseModel):
    """Payload for importing protection library (P14b)"""

    manifest: dict[str, Any]
    device_types: list[dict[str, Any]]
    curves: list[dict[str, Any]]
    templates: list[dict[str, Any]]


# ============================================================================
# Type Library Governance (P13b)
# ============================================================================


@router.get("/export")
def export_type_library(
    library_name_pl: str = "Biblioteka typów",
    vendor: str = "MV-DESIGN-PRO",
    series: str = "Standard",
    revision: str = "1.0",
    description_pl: str = "",
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Export type library with deterministic fingerprint (P13b).

    Returns canonical JSON export with manifest and all types.
    Deterministic ordering ensures identical fingerprint for same content.

    Query Parameters:
        library_name_pl: Polish name of the library
        vendor: Vendor/manufacturer name
        series: Product series/line
        revision: Revision string
        description_pl: Optional Polish description
    """
    service = _build_governance_service(uow_factory)
    return service.export_type_library(
        library_name_pl=library_name_pl,
        vendor=vendor,
        series=series,
        revision=revision,
        description_pl=description_pl,
    )


@router.post("/import")
def import_type_library(
    payload: ImportTypeLibraryPayload,
    mode: str = "merge",
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Import type library with conflict detection (P13b).

    Modes:
    - merge (default): Add new types, skip existing (no overwrites)
    - replace: Replace entire library (blocked if types are in use)

    Conflict rules:
    - Existing type_id with different parameters → 409 Conflict
    - REPLACE mode with types in use → 409 Conflict

    Returns ImportReport with added/skipped/conflicts lists.
    """
    # Validate mode
    try:
        import_mode = ImportMode(mode.lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowy tryb: {mode}. Musi być 'merge' lub 'replace'.",
        ) from exc

    service = _build_governance_service(uow_factory)

    try:
        report = service.import_type_library(
            data=payload.model_dump(),
            mode=import_mode,
        )
        return report
    except ValueError as exc:
        # Conflicts detected
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


# ============================================================================
# Fetch catalog types (GET endpoints)
# ============================================================================


@router.get("/line-types")
def list_line_types() -> list[dict[str, Any]]:
    """List all line types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_line_types()]


@router.get("/cable-types")
def list_cable_types() -> list[dict[str, Any]]:
    """List all cable types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_cable_types()]


@router.get("/transformer-types")
def list_transformer_types() -> list[dict[str, Any]]:
    """List all transformer types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_transformer_types()]


@router.get("/switch-equipment-types")
def list_switch_equipment_types() -> list[dict[str, Any]]:
    """List all switch equipment types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_switch_equipment_types()]


@router.get("/mv-apparatus-types")
def list_mv_apparatus_types() -> list[dict[str, Any]]:
    """List all MV apparatus types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_mv_apparatus_types()]


@router.get("/lv-apparatus-types")
def list_lv_apparatus_types() -> list[dict[str, Any]]:
    """List all LV apparatus types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_lv_apparatus_types()]


@router.get("/lv-cable-types")
def list_lv_cable_types() -> list[dict[str, Any]]:
    """List all LV cable types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_lv_cable_types()]


@router.get("/load-types")
def list_load_types() -> list[dict[str, Any]]:
    """List all load types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_load_types()]


@router.get("/ct-types")
def list_ct_types() -> list[dict[str, Any]]:
    """List all CT types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_ct_types()]


@router.get("/vt-types")
def list_vt_types() -> list[dict[str, Any]]:
    """List all VT types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_vt_types()]


@router.get("/surge-arrester-types")
def list_surge_arrester_types() -> list[dict[str, Any]]:
    """List all MV surge arrester types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_surge_arrester_types()]


@router.get("/pv-inverter-types")
def list_pv_inverter_types() -> list[dict[str, Any]]:
    """List all PV inverter types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_pv_inverter_types()]


@router.get("/bess-inverter-types")
def list_bess_inverter_types() -> list[dict[str, Any]]:
    """List all BESS inverter types from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_bess_inverter_types()]


@router.get("/inverter-types")
def list_inverter_types() -> list[dict[str, Any]]:
    """List all generic inverter/converter catalog entries from the canonical MV catalog."""
    return [item.to_dict() for item in get_default_mv_catalog().list_inverter_types()]


@router.get("/converter-types")
def list_converter_types(kind: str | None = None) -> list[dict[str, Any]]:
    """List all converter source types from the canonical MV catalog."""
    records = [item.to_dict() for item in get_default_mv_catalog().list_converter_types()]
    if not kind:
        return records
    normalized_kind = kind.strip().upper()
    return [item for item in records if str(item.get("kind", "")).upper() == normalized_kind]


@router.get("/wind-inverter-types")
def list_wind_inverter_types() -> list[dict[str, Any]]:
    """List all wind farm converter types from the canonical MV catalog."""
    return [
        item.to_dict()
        for item in get_default_mv_catalog().list_converter_types()
        if item.kind.value == "WIND"
    ]


@router.get("/source-system-types")
def list_source_system_types() -> list[dict[str, Any]]:
    """List all MV system source types for GPZ / zasilanie systemowe."""
    return [item.to_dict() for item in get_default_mv_catalog().list_source_system_types()]


@router.get("/ptpiree/manifest")
def get_ptpiree_manifest() -> dict[str, Any]:
    """Return PTPiREE snapshot source metadata used by the local catalog."""
    return get_ptpiree_catalog_manifest()


@router.get("/ptpiree/generator-certificates")
def list_ptpiree_generator_certificates() -> list[dict[str, Any]]:
    """List local PTPiREE generator/converter certificate snapshot records."""
    return [
        item.to_dict()
        for item in get_default_mv_catalog().list_ptpiree_generator_certificates()
    ]


@router.get("/branch-point-types")
def list_branch_point_types(kind: str | None = None) -> list[dict[str, Any]]:
    """List all branch point types for branch poles and ZKSN."""
    return get_all_branch_point_types(kind)


@router.get("/switchgear-families")
def list_switchgear_families_endpoint(
    manufacturer_ref: str | None = None,
) -> list[dict[str, Any]]:
    """Lista rodzin rozdzielnic SN (goal §11A.3).

    Z `manufacturer_ref` zwęża do rodzin danego producenta (np.
    `?manufacturer_ref=ABB` → UniGear ZS1, SafeRing).

    Bez parametru zwraca wszystkie zweryfikowane rodziny (6 startowych):
    - ZPUE_WLOSZCZOWA__ROTOBLOK
    - ELEKTROMETAL__E2ALPHA
    - ABB__UNIGEAR_ZS1, ABB__SAFERING
    - SIEMENS__NXAIR, SIEMENS__8DJH
    """
    families = (
        list_families_for_manufacturer(manufacturer_ref)
        if manufacturer_ref is not None
        else list_switchgear_families()
    )
    return [f.model_dump(mode="json") for f in families]


@router.get("/manufacturers")
def list_manufacturers_endpoint() -> list[dict[str, Any]]:
    """Lista producentów rozdzielnic SN (goal §11A).

    Wszyscy startowi producenci mają `status='requires_catalog'` dopóki nie
    pojawią się zweryfikowane source_refs. UI ma pokazać badge ostrzegawczy.
    """
    return [m.model_dump(mode="json") for m in list_switchgear_manufacturers()]


@router.get("/complete-bay-templates")
def list_complete_bay_templates_endpoint(
    manufacturer_ref: str | None = None,
    bay_kind: str | None = None,
) -> list[dict[str, Any]]:
    """Pełne szablony pól SN powiązane z rodziną rozdzielnicy.

    UI projektanta widzi wyłącznie kompletne pakiety rozwiązań katalogowych.
    Filtrowanie `bay_kind` zwęża listę do pól danego typu (np. transformatorowe).
    """
    templates = list_switchgear_solution_templates_for_manufacturer(manufacturer_ref)
    if bay_kind is not None:
        templates = [t for t in templates if t.bay_kind == bay_kind]
    return [t.model_dump(mode="json") for t in templates]


@router.get("/protection/device-types")
def list_protection_device_types(
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> list[dict[str, Any]]:
    """List protection devices from active library or analytical device catalog."""
    service = _build_service(uow_factory)
    records = service.list_protection_device_types()
    if records:
        return records
    return [
        _serialize_analytical_protection_device(device)
        for device in list_analytical_protection_devices()
    ]


@router.get("/protection/curves")
def list_protection_curves(
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> list[dict[str, Any]]:
    """List all protection curves from catalog (P14a - READ-ONLY)"""
    service = _build_service(uow_factory)
    records = service.list_protection_curves()
    if records:
        return records
    return [item.to_dict() for item in get_default_mv_catalog().list_protection_curves()]


@router.get("/protection/templates")
def list_protection_setting_templates(
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> list[dict[str, Any]]:
    """List all protection setting templates from catalog (P14a - READ-ONLY)"""
    service = _build_service(uow_factory)
    records = service.list_protection_setting_templates()
    if records:
        return records
    return [item.to_dict() for item in get_default_mv_catalog().list_protection_setting_templates()]


@router.get("/protection/device-types/{device_type_id}")
def get_protection_device_type(
    device_type_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Get protection device from active library or analytical device catalog."""
    service = _build_service(uow_factory)
    result = service.get_protection_device_type(device_type_id)
    if result is not None:
        return result

    analytical_device = load_device_capability(device_type_id)
    if analytical_device is not None:
        return _serialize_analytical_protection_device(analytical_device)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Typ urządzenia zabezpieczającego nie znaleziony: {device_type_id}",
    )


@router.get("/protection/curves/{curve_id}")
def get_protection_curve(
    curve_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Get single protection curve by ID (P14a - READ-ONLY)"""
    service = _build_service(uow_factory)
    result = service.get_protection_curve(curve_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Krzywa zabezpieczenia nie znaleziona: {curve_id}",
        )
    return result


@router.get("/protection/templates/{template_id}")
def get_protection_setting_template(
    template_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Get single protection setting template by ID (P14a - READ-ONLY)"""
    service = _build_service(uow_factory)
    result = service.get_protection_setting_template(template_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Szablon nastaw zabezpieczenia nie znaleziony: {template_id}",
        )
    return result


# ============================================================================
# Protection Library Governance (P14b)
# ============================================================================


@router.get("/protection/export")
def export_protection_library(
    library_name_pl: str = "Biblioteka zabezpieczeń",
    vendor: str = "MV-DESIGN-PRO",
    series: str = "Standard",
    revision: str = "1.0",
    description_pl: str = "",
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Export protection library with deterministic fingerprint (P14b).

    Returns canonical JSON export with manifest and all protection types.
    Deterministic ordering ensures identical fingerprint for same content.

    Query Parameters:
        library_name_pl: Polish name of the library
        vendor: Vendor/manufacturer name
        series: Product series/line
        revision: Revision string
        description_pl: Optional Polish description
    """
    service = _build_governance_service(uow_factory)
    return service.export_protection_library(
        library_name_pl=library_name_pl,
        vendor=vendor,
        series=series,
        revision=revision,
        description_pl=description_pl,
    )


@router.post("/protection/import")
def import_protection_library(
    payload: ImportProtectionLibraryPayload,
    mode: str = "merge",
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Import protection library with conflict detection and reference validation (P14b).

    Modes:
    - merge (default): Add new types, check immutability (no overwrites)
    - replace: Replace entire library (safe for P14b as no bindings yet)

    Conflict rules:
    - Existing type_id with different parameters → 409 Conflict
    - Template references non-existent device_type/curve → 422 Validation Error

    Returns ProtectionImportReport with added/skipped/conflicts/blocked lists.
    """
    # Validate mode
    try:
        import_mode = ImportMode(mode.lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowy tryb: {mode}. Musi być 'merge' lub 'replace'.",
        ) from exc

    service = _build_governance_service(uow_factory)

    try:
        report = service.import_protection_library(
            data=payload.model_dump(),
            mode=import_mode,
        )
        return report
    except ValueError as exc:
        # Conflicts or validation errors detected
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


# ============================================================================
# Assign type_ref (POST endpoints)
# ============================================================================


@router.post("/projects/{project_id}/branches/{branch_id}/type-ref", status_code=204)
def assign_type_to_branch(
    project_id: str,
    branch_id: str,
    payload: AssignTypePayload,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> Response:
    """Assign type_ref to branch (LineBranch)"""
    try:
        pid = UUID(project_id)
        bid = UUID(branch_id)
        tid = UUID(payload.type_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nieprawidłowy format UUID",
        ) from exc

    service = _build_service(uow_factory)
    try:
        service.assign_type_ref_to_branch(pid, bid, tid)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return Response(status_code=204)


@router.post("/projects/{project_id}/transformers/{transformer_id}/type-ref", status_code=204)
def assign_type_to_transformer(
    project_id: str,
    transformer_id: str,
    payload: AssignTypePayload,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> Response:
    """Assign type_ref to transformer (TransformerBranch)"""
    try:
        pid = UUID(project_id)
        tid = UUID(transformer_id)
        type_id = UUID(payload.type_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nieprawidłowy format UUID",
        ) from exc

    service = _build_service(uow_factory)
    try:
        service.assign_type_ref_to_transformer(pid, tid, type_id)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return Response(status_code=204)


@router.post("/projects/{project_id}/switches/{switch_id}/equipment-type", status_code=204)
def assign_equipment_type_to_switch(
    project_id: str,
    switch_id: str,
    payload: AssignTypePayload,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> Response:
    """Assign equipment_type to switch"""
    try:
        pid = UUID(project_id)
        sid = UUID(switch_id)
        tid = UUID(payload.type_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nieprawidłowy format UUID",
        ) from exc

    service = _build_service(uow_factory)
    try:
        service.assign_equipment_type_to_switch(pid, sid, tid)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return Response(status_code=204)


# ============================================================================
# Clear type_ref (DELETE endpoints)
# ============================================================================


@router.delete("/projects/{project_id}/branches/{branch_id}/type-ref", status_code=204)
def clear_type_from_branch(
    project_id: str,
    branch_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> Response:
    """Clear type_ref from branch (set to null)"""
    try:
        pid = UUID(project_id)
        bid = UUID(branch_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nieprawidłowy format UUID",
        ) from exc

    service = _build_service(uow_factory)
    try:
        service.clear_type_ref_from_branch(pid, bid)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return Response(status_code=204)


@router.delete("/projects/{project_id}/transformers/{transformer_id}/type-ref", status_code=204)
def clear_type_from_transformer(
    project_id: str,
    transformer_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> Response:
    """Clear type_ref from transformer (set to null)"""
    try:
        pid = UUID(project_id)
        tid = UUID(transformer_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nieprawidłowy format UUID",
        ) from exc

    service = _build_service(uow_factory)
    try:
        service.clear_type_ref_from_transformer(pid, tid)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return Response(status_code=204)


@router.delete("/projects/{project_id}/switches/{switch_id}/equipment-type", status_code=204)
def clear_equipment_type_from_switch(
    project_id: str,
    switch_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> Response:
    """Clear equipment_type from switch"""
    try:
        pid = UUID(project_id)
        sid = UUID(switch_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nieprawidłowy format UUID",
        ) from exc

    service = _build_service(uow_factory)
    try:
        service.clear_equipment_type_from_switch(pid, sid)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return Response(status_code=204)


# =============================================================================
# K30-23: Auto-populate endpoint — suggest catalog types per element context
# =============================================================================


class AutoPopulateRequest(BaseModel):
    """K30-23 user demand: 'dane mają się maksymalnie podczytywać'."""

    voltage_kv: float | None = None
    """Element voltage rating (15 / 20 / 0.4 kV typical)."""
    expected_power_mva: float | None = None
    """Expected power rating (0.063 - 2.5 MVA dla TR, etc.)."""
    expected_current_a: float | None = None
    """Expected nominal current (for switches/cables)."""
    cross_section_mm2: float | None = None
    """Cross-section dla cables (50/95/120/150/240/300 mm²)."""
    prefer_manufacturer: str | None = None
    """Preferred manufacturer cascade (ZPUE/Elektrometal/ABB/Siemens)."""
    prefer_ptpire_certified: bool = True
    """K30-23: prefer Polish PTPiRE-certified entries by default."""


class AutoPopulateSuggestion(BaseModel):
    catalog_ref: str
    label_pl: str
    manufacturer: str | None = None
    confidence: float  # 0.0..1.0 — how well it matches request context
    badge_pl: str | None = None  # 'PTPiRE certyfikat' jeśli applicable
    rationale_pl: str  # Why this suggestion ranked


class AutoPopulateResponse(BaseModel):
    element_type: str
    suggestions: list[AutoPopulateSuggestion]
    total_candidates: int


@router.post("/auto-populate/{element_type}")
def auto_populate_catalog_suggestions(
    element_type: str,
    request: AutoPopulateRequest,
) -> AutoPopulateResponse:
    """K30-23: Return ranked catalog suggestions for element context.

    Element types supported: transformer, cable, switch, branch_point, der.
    Logic: filter by voltage compatibility + power/current range + manufacturer
    cascade. PTPiRE-certified prefer (boost +0.2 confidence).
    """
    normalized = element_type.lower().strip()

    if normalized == "transformer":
        return _auto_populate_transformers(request)
    if normalized == "cable":
        return _auto_populate_cables(request)
    if normalized in ("switch", "circuit_breaker", "breaker", "disconnector"):
        return _auto_populate_switches(request, normalized)
    if normalized in ("protection", "relay"):
        return _auto_populate_protection(request)
    if normalized in ("surge_arrester", "arrester", "ogranicznik", "ogranicznik_sn"):
        return _auto_populate_surge_arresters(request)
    if normalized in ("der", "pv", "bess", "inverter", "converter", "generator"):
        return _auto_populate_inverters(request, normalized)

    raise HTTPException(
        status_code=400,
        detail=(
            f"Unknown element_type '{element_type}'. Supported: transformer, cable, "
            "switch, protection, surge_arrester, inverter."
        ),
    )


def _confidence_with_ptpire(base: float, is_ptpire: bool, prefer: bool) -> float:
    if not prefer:
        return base
    return min(1.0, base + 0.2) if is_ptpire else base


def _auto_populate_transformers(req: AutoPopulateRequest) -> AutoPopulateResponse:
    from network_model.catalog.mv_transformer_catalog import get_all_transformer_types

    all_types = get_all_transformer_types()
    suggestions: list[AutoPopulateSuggestion] = []

    for entry in all_types:
        params = entry.get("params", {})
        rated_mva = params.get("rated_power_mva", 0.0)
        v_hv = params.get("voltage_hv_kv", 0.0)
        v_lv = params.get("voltage_lv_kv", 0.0)
        manufacturer = params.get("manufacturer", "")
        is_ptpire = bool(params.get("ptpire_certified", False))

        # Voltage filter (within ±5%)
        if req.voltage_kv is not None:
            if not (
                abs(v_hv - req.voltage_kv) / req.voltage_kv < 0.05
                or abs(v_lv - req.voltage_kv) / max(v_lv, 0.001) < 0.05
            ):
                continue

        # Power filter (within ±50% — wide net dla typical sizing)
        if req.expected_power_mva is not None:
            if rated_mva < req.expected_power_mva * 0.5 or rated_mva > req.expected_power_mva * 2.0:
                continue

        # Manufacturer cascade
        confidence = 0.6
        if req.prefer_manufacturer and req.prefer_manufacturer.lower() in manufacturer.lower():
            confidence = 0.9
        confidence = _confidence_with_ptpire(confidence, is_ptpire, req.prefer_ptpire_certified)

        rationale = (
            f"Sn={rated_mva*1000:.0f} kVA, U_HV={v_hv} kV, "
            f"U_LV={v_lv} kV ({manufacturer})"
        )

        suggestions.append(
            AutoPopulateSuggestion(
                catalog_ref=entry["id"],
                label_pl=entry.get("name", entry["id"]),
                manufacturer=manufacturer or None,
                confidence=confidence,
                badge_pl="PTPiRE" if is_ptpire else None,
                rationale_pl=rationale,
            )
        )

    suggestions.sort(key=lambda s: (-s.confidence, s.catalog_ref))
    return AutoPopulateResponse(
        element_type="transformer",
        suggestions=suggestions[:20],
        total_candidates=len(suggestions),
    )


def _auto_populate_cables(req: AutoPopulateRequest) -> AutoPopulateResponse:
    from network_model.catalog.mv_cable_line_catalog import get_all_cable_types

    all_types = get_all_cable_types()
    suggestions: list[AutoPopulateSuggestion] = []

    for entry in all_types:
        params = entry.get("params", {})
        v_kv = params.get("voltage_rating_kv", 0.0)
        cross = params.get("cross_section_mm2", 0.0)
        rated_i = params.get("rated_current_a", 0.0)
        manufacturer = params.get("manufacturer", "")
        is_ptpire = bool(params.get("ptpire_certified", False))

        if req.voltage_kv is not None:
            if abs(v_kv - req.voltage_kv) / max(req.voltage_kv, 0.001) > 0.2:
                continue
        if req.cross_section_mm2 is not None:
            if abs(cross - req.cross_section_mm2) / max(req.cross_section_mm2, 0.001) > 0.3:
                continue
        if req.expected_current_a is not None:
            if rated_i < req.expected_current_a * 0.9:
                continue

        confidence = 0.5
        if req.prefer_manufacturer and req.prefer_manufacturer.lower() in manufacturer.lower():
            confidence = 0.85
        confidence = _confidence_with_ptpire(confidence, is_ptpire, req.prefer_ptpire_certified)

        suggestions.append(
            AutoPopulateSuggestion(
                catalog_ref=entry["id"],
                label_pl=entry.get("name", entry["id"]),
                manufacturer=manufacturer or None,
                confidence=confidence,
                badge_pl="PTPiRE PN-HD 620" if is_ptpire else None,
                rationale_pl=f"{int(cross)} mm² {v_kv} kV, In={int(rated_i)} A ({manufacturer})",
            )
        )

    suggestions.sort(key=lambda s: (-s.confidence, s.catalog_ref))
    return AutoPopulateResponse(
        element_type="cable",
        suggestions=suggestions[:20],
        total_candidates=len(suggestions),
    )


def _auto_populate_switches(req: AutoPopulateRequest, kind_filter: str) -> AutoPopulateResponse:
    from network_model.catalog.mv_switch_catalog import get_all_switch_equipment_types

    all_types = get_all_switch_equipment_types()
    suggestions: list[AutoPopulateSuggestion] = []
    target_kind = (
        "CIRCUIT_BREAKER"
        if kind_filter in ("circuit_breaker", "breaker")
        else "DISCONNECTOR" if kind_filter == "disconnector" else None
    )

    for entry in all_types:
        params = entry.get("params", {})
        if target_kind and params.get("equipment_kind") != target_kind:
            continue
        v_kv = params.get("un_kv", 0.0)
        rated_i = params.get("in_a", 0.0)
        manufacturer = params.get("manufacturer", "")
        is_ptpire = bool(params.get("ptpire_certified", False))

        if req.voltage_kv is not None:
            if abs(v_kv - req.voltage_kv) > req.voltage_kv * 0.3:
                continue
        if req.expected_current_a is not None:
            if rated_i < req.expected_current_a * 0.9:
                continue

        confidence = 0.55
        if req.prefer_manufacturer and req.prefer_manufacturer.lower() in manufacturer.lower():
            confidence = 0.88
        confidence = _confidence_with_ptpire(confidence, is_ptpire, req.prefer_ptpire_certified)

        suggestions.append(
            AutoPopulateSuggestion(
                catalog_ref=entry["id"],
                label_pl=entry.get("name", entry["id"]),
                manufacturer=manufacturer or None,
                confidence=confidence,
                badge_pl="PTPiRE" if is_ptpire else None,
                rationale_pl=(
                    f"{int(v_kv)} kV / {int(rated_i)} A ({manufacturer})"
                ),
            )
        )

    suggestions.sort(key=lambda s: (-s.confidence, s.catalog_ref))
    return AutoPopulateResponse(
        element_type="switch",
        suggestions=suggestions[:20],
        total_candidates=len(suggestions),
    )


def _auto_populate_protection(req: AutoPopulateRequest) -> AutoPopulateResponse:
    from application.analyses.protection.catalog.catalog_store import list_devices

    devices = list_devices()
    suggestions: list[AutoPopulateSuggestion] = []
    for d in devices:
        manufacturer = d.vendor
        rated = d.meta.get("rated") if isinstance(d.meta, dict) else None
        confidence = 0.5
        if req.prefer_manufacturer and req.prefer_manufacturer.lower() in manufacturer.lower():
            confidence = 0.85
        # PTPiRE = Polish vendors (Elektrometal, ZPAS, Elester, Energotest, ZIAD)
        is_polish = manufacturer in {
            "ELEKTROMETAL", "ZPAS", "ELESTER", "ENERGOTEST", "ZIAD"
        }
        confidence = _confidence_with_ptpire(confidence, is_polish, req.prefer_ptpire_certified)
        # Current match
        if req.expected_current_a is not None and isinstance(rated, int | float):
            if rated < req.expected_current_a * 0.8:
                continue
        suggestions.append(
            AutoPopulateSuggestion(
                catalog_ref=d.device_id,
                label_pl=f"{d.vendor} {d.model}",
                manufacturer=manufacturer,
                confidence=confidence,
                badge_pl="Polski producent" if is_polish else None,
                rationale_pl=f"{d.vendor} {d.model} — funkcje: {', '.join(d.functions_supported[:6])}",
            )
        )

    suggestions.sort(key=lambda s: (-s.confidence, s.catalog_ref))
    return AutoPopulateResponse(
        element_type="protection",
        suggestions=suggestions[:20],
        total_candidates=len(suggestions),
    )


def _auto_populate_surge_arresters(req: AutoPopulateRequest) -> AutoPopulateResponse:
    catalog = get_default_mv_catalog()
    suggestions: list[AutoPopulateSuggestion] = []

    for item in catalog.list_surge_arrester_types():
        v_kv = item.u_m_kv
        manufacturer = item.manufacturer or ""
        if req.voltage_kv is not None:
            if abs(v_kv - req.voltage_kv) / max(req.voltage_kv, 0.001) > 0.3:
                continue

        confidence = 0.6
        if item.bil_protected_kv >= 125.0:
            confidence += 0.05
        if req.prefer_manufacturer and req.prefer_manufacturer.lower() in manufacturer.lower():
            confidence = 0.9

        suggestions.append(
            AutoPopulateSuggestion(
                catalog_ref=item.id,
                label_pl=item.name,
                manufacturer=manufacturer or None,
                confidence=min(1.0, confidence),
                badge_pl=f"IEC 60099-4, klasa {item.energy_class}",
                rationale_pl=(
                    f"Um={item.u_m_kv:g} kV, MCOV={item.mcov_kv:g} kV, "
                    f"Ures10kA={item.u_residual_at_10ka_kv:g} kV, "
                    f"BIL={item.bil_protected_kv:g} kV"
                ),
            )
        )

    suggestions.sort(key=lambda s: (-s.confidence, s.catalog_ref))
    return AutoPopulateResponse(
        element_type="surge_arrester",
        suggestions=suggestions[:20],
        total_candidates=len(suggestions),
    )


def _auto_populate_inverters(
    req: AutoPopulateRequest,
    normalized_element_type: str,
) -> AutoPopulateResponse:
    catalog = get_default_mv_catalog()
    suggestions: list[AutoPopulateSuggestion] = []
    target_kind = None
    if normalized_element_type == "pv":
        target_kind = "PV"
    elif normalized_element_type == "bess":
        target_kind = "BESS"

    for item in catalog.list_inverter_types():
        kind = str(item.kind).upper()
        if target_kind is not None and kind != target_kind:
            continue
        if req.voltage_kv is not None:
            if abs(item.un_kv - req.voltage_kv) / max(req.voltage_kv, 0.001) > 0.3:
                continue
        if req.expected_power_mva is not None:
            if item.sn_mva < req.expected_power_mva * 0.5 or item.sn_mva > req.expected_power_mva * 2.0:
                continue

        manufacturer = item.manufacturer or ""
        is_ptpiree = item.ptpiree_status == "POWIAZANY"
        confidence = 0.55
        if req.prefer_manufacturer and req.prefer_manufacturer.lower() in manufacturer.lower():
            confidence = 0.85
        confidence = _confidence_with_ptpire(confidence, is_ptpiree, req.prefer_ptpire_certified)
        badge = None
        if is_ptpiree:
            badge = f"PTPiREE {item.ptpiree_wipwc_version or ''}".strip()

        suggestions.append(
            AutoPopulateSuggestion(
                catalog_ref=item.id,
                label_pl=item.name,
                manufacturer=manufacturer or None,
                confidence=confidence,
                badge_pl=badge,
                rationale_pl=(
                    f"{kind}, Un={item.un_kv:g} kV, Sn={item.sn_mva:g} MVA, "
                    f"Pmax={item.pmax_mw:g} MW"
                ),
            )
        )

    suggestions.sort(key=lambda s: (-s.confidence, s.catalog_ref))
    return AutoPopulateResponse(
        element_type="inverter",
        suggestions=suggestions[:20],
        total_candidates=len(suggestions),
    )


_PRODUCTION_DISABLED_ROUTE_KEYS = {
    ("/api/catalog/projects/{project_id}/branches/{branch_id}/type-ref", "POST"),
    ("/api/catalog/projects/{project_id}/transformers/{transformer_id}/type-ref", "POST"),
    ("/api/catalog/projects/{project_id}/switches/{switch_id}/equipment-type", "POST"),
    ("/api/catalog/projects/{project_id}/branches/{branch_id}/type-ref", "DELETE"),
    ("/api/catalog/projects/{project_id}/transformers/{transformer_id}/type-ref", "DELETE"),
    ("/api/catalog/projects/{project_id}/switches/{switch_id}/equipment-type", "DELETE"),
}


def _build_production_router() -> APIRouter:
    production = APIRouter()
    for route in router.routes:
        path = getattr(route, "path", "")
        methods = set(getattr(route, "methods", set()))
        if any((path, method) in _PRODUCTION_DISABLED_ROUTE_KEYS for method in methods):
            continue
        production.routes.append(route)
    return production


production_router = _build_production_router()
