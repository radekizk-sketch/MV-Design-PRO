"""API zapisu konfiguracji DER do kanonicznego modelu ENM."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from api.domain_ops_policy import validate_and_materialize_catalog_binding
from domain.canonical_operations import resolve_operation_name
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from enm.store import get_enm as _get_enm
from enm.store import set_enm as _set_enm
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/api/projects", tags=["generators"])

DerKind = Literal["PV", "BESS", "FW"]
DerConnectionVariant = Literal["nn_side", "sn_side", "dedicated", "block_transformer"]

_DEFAULT_CATALOG_BY_VARIANT: dict[tuple[str, str], str] = {
    ("PV", "nn_side"): "conv-pv-nn-0p5mw-0p4kv",
    ("PV", "block_transformer"): "conv-pv-0.5mw-15kv",
    ("BESS", "nn_side"): "conv-bess-nn-0p5mw-0p4kv",
    ("BESS", "block_transformer"): "conv-bess-0.5mw-1mwh-15kv",
    ("FW", "nn_side"): "conv-wind-nn-2mw-0p4kv",
    ("FW", "block_transformer"): "conv-wind-2mw-15kv",
}


class DerGeneratorCreateRequest(BaseModel):
    """Payload formularza DER z drawera SLD."""

    station_ref: str = Field(..., min_length=1)
    der_kind: DerKind
    power_mw: float = Field(..., ge=0.1, le=10.0)
    connection_variant: DerConnectionVariant = "nn_side"
    catalog_ref: str | None = Field(default=None, min_length=1)
    bus_ref: str | None = Field(default=None, min_length=1)
    blocking_transformer_ref: str | None = Field(default=None, min_length=1)
    source_name: str | None = Field(default=None, min_length=1)
    quantity: int = Field(default=1, ge=1, le=100)
    nc_rfg_module: Literal["A", "B", "C", "D"] | None = None

    @field_validator(
        "station_ref", "catalog_ref", "bus_ref", "blocking_transformer_ref", "source_name"
    )
    @classmethod
    def _strip_optional_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


def _canonical_variant(variant: DerConnectionVariant) -> Literal["nn_side", "block_transformer"]:
    if variant == "nn_side":
        return "nn_side"
    return "block_transformer"


def _catalog_namespace(technology: DerKind) -> str:
    if technology == "PV":
        return "ZRODLO_NN_PV"
    if technology == "BESS":
        return "ZRODLO_NN_BESS"
    return "CONVERTER"


def _validate_project_case_context(request: Request, project_id: str, case_id: str) -> None:
    try:
        parsed_project_id = UUID(project_id)
        parsed_case_id = UUID(case_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "project_case.invalid_uuid",
                "message_pl": "Niepoprawny identyfikator projektu lub przypadku.",
            },
        ) from exc

    uow_factory = getattr(request.app.state, "uow_factory", None)
    if uow_factory is None:
        return

    with uow_factory() as uow:
        study_case = uow.cases.get_study_case(parsed_case_id)

    if study_case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "study_case.not_found",
                "message_pl": "Nie znaleziono przypadku obliczeniowego.",
            },
        )

    if str(study_case.project_id) != str(parsed_project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "study_case.project_mismatch",
                "message_pl": "Przypadek obliczeniowy nie należy do wskazanego projektu.",
            },
        )


def _find_station(enm: dict[str, Any], station_ref: str) -> dict[str, Any] | None:
    return next(
        (
            station
            for station in enm.get("substations", [])
            if station.get("ref_id") == station_ref or station.get("id") == station_ref
        ),
        None,
    )


def _station_transformers(enm: dict[str, Any], station: dict[str, Any]) -> list[dict[str, Any]]:
    transformer_refs = {ref for ref in station.get("transformer_refs", []) if isinstance(ref, str)}
    station_buses = {ref for ref in station.get("bus_refs", []) if isinstance(ref, str)}
    return [
        transformer
        for transformer in enm.get("transformers", [])
        if transformer.get("ref_id") in transformer_refs
        or transformer.get("id") in transformer_refs
        or transformer.get("hv_bus_ref") in station_buses
        or transformer.get("lv_bus_ref") in station_buses
    ]


def _bus_voltage_index(enm: dict[str, Any]) -> dict[str, float]:
    index: dict[str, float] = {}
    for bus in enm.get("buses", []):
        voltage = bus.get("voltage_kv")
        ref = bus.get("ref_id")
        if isinstance(ref, str) and isinstance(voltage, int | float):
            index[ref] = float(voltage)
    return index


def _resolve_nn_bus_ref(enm: dict[str, Any], station: dict[str, Any]) -> str | None:
    for transformer in _station_transformers(enm, station):
        lv_bus_ref = transformer.get("lv_bus_ref")
        if isinstance(lv_bus_ref, str) and lv_bus_ref.strip():
            return lv_bus_ref.strip()

    voltages = _bus_voltage_index(enm)
    for bus_ref in station.get("bus_refs", []):
        if isinstance(bus_ref, str) and voltages.get(bus_ref, 999.0) < 1.0:
            return bus_ref
    return None


def _build_domain_payload(
    enm_dict: dict[str, Any],
    req: DerGeneratorCreateRequest,
) -> dict[str, Any]:
    station = _find_station(enm_dict, req.station_ref)
    if station is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "station.not_found",
                "message_pl": "Nie znaleziono stacji dla konfiguracji DER.",
            },
        )

    canonical_variant = _canonical_variant(req.connection_variant)
    catalog_ref = req.catalog_ref or _DEFAULT_CATALOG_BY_VARIANT[(req.der_kind, canonical_variant)]
    payload: dict[str, Any] = {
        "source_technology": req.der_kind,
        "connection_variant": canonical_variant,
        "station_ref": req.station_ref,
        "catalog_ref": catalog_ref,
        "catalog_binding": {
            "catalog_namespace": _catalog_namespace(req.der_kind),
            "catalog_item_id": catalog_ref,
            "catalog_item_version": "2024.1",
            "materialize": True,
        },
        "power_setpoint_mw": req.power_mw,
        "quantity": req.quantity,
        "source_name": req.source_name or f"{req.der_kind} {req.station_ref}",
    }

    if req.nc_rfg_module is not None:
        payload["nc_rfg_module"] = req.nc_rfg_module
    if req.blocking_transformer_ref:
        payload["blocking_transformer_ref"] = req.blocking_transformer_ref

    if req.bus_ref:
        payload["bus_nn_ref"] = req.bus_ref
    elif canonical_variant == "nn_side":
        nn_bus_ref = _resolve_nn_bus_ref(enm_dict, station)
        if nn_bus_ref is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "station.nn_bus_missing",
                    "message_pl": "Stacja nie ma rozpoznanej szyny nN dla przyłączenia DER.",
                },
            )
        payload["bus_nn_ref"] = nn_bus_ref

    return payload


@router.post(
    "/{project_id}/cases/{case_id}/generators",
    status_code=status.HTTP_201_CREATED,
)
async def create_der_generator(
    project_id: str,
    case_id: str,
    req: DerGeneratorCreateRequest,
    request: Request,
) -> dict[str, Any]:
    """Zapisz konfigurację DER jako generator w kanonicznym ENM."""

    _validate_project_case_context(request, project_id, case_id)

    enm = _get_enm(case_id)
    enm_dict = enm.model_dump(mode="json")
    payload = _build_domain_payload(enm_dict, req)

    resolved_name = resolve_operation_name("add_converter_source")
    policy_error, _ = validate_and_materialize_catalog_binding(resolved_name, payload)
    if policy_error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": policy_error.code,
                "message_pl": policy_error.message_pl,
                "errors": policy_error.errors,
            },
        )

    result = execute_domain_operation(
        enm_dict=enm_dict,
        op_name=resolved_name,
        payload=payload,
    )
    if result.get("error"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": result.get("error_code") or "generator.create_failed",
                "message_pl": result.get("error") or "Nie udało się zapisać konfiguracji DER.",
            },
        )

    if result.get("snapshot"):
        try:
            saved = _set_enm(case_id, EnergyNetworkModel.model_validate(result["snapshot"]))
            result["snapshot"] = saved.model_dump(mode="json")
        except Exception as exc:  # pragma: no cover - defensive validation guard
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "code": "api.snapshot_validation_failed",
                    "message_pl": f"Błąd zapisu snapshotu ENM: {exc}",
                },
            ) from exc

    return result
