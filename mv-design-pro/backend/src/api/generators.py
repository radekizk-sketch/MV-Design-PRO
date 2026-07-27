"""API zapisu konfiguracji DER do kanonicznego modelu ENM."""

from __future__ import annotations

import hashlib
from typing import Any, Literal
from uuid import UUID

from api.domain_ops_policy import validate_and_materialize_catalog_binding
from domain.canonical_operations import resolve_operation_name
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from enm.store import get_enm as _get_enm
from enm.store import has_enm as _has_enm
from enm.store import set_enm as _set_enm
from fastapi import APIRouter, HTTPException, Request, status
from network_model.catalog.audit2_catalogs import get_block_transformer
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
    power_mw: float = Field(..., gt=0.0, le=10.0)
    connection_variant: DerConnectionVariant = "nn_side"
    catalog_ref: str | None = Field(default=None, min_length=1)
    bus_ref: str | None = Field(default=None, min_length=1)
    blocking_transformer_ref: str | None = Field(default=None, min_length=1)
    block_transformer_catalog_ref: str | None = Field(default=None, min_length=1)
    source_name: str | None = Field(default=None, min_length=1)
    quantity: int = Field(default=1, ge=1, le=100)
    nc_rfg_module: Literal["A", "B", "C", "D"] | None = None

    @field_validator(
        "station_ref",
        "catalog_ref",
        "bus_ref",
        "blocking_transformer_ref",
        "block_transformer_catalog_ref",
        "source_name",
    )
    @classmethod
    def _strip_optional_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class DerCatalogBindingsRequest(BaseModel):
    """Wiązania katalogowe i profile zgodności wytwórcy wybierane PO jego utworzeniu.

    V12K-238 (pomiar: V12K-237). Kreator DER wysyła przy tworzeniu katalog urządzenia,
    baterii i transformatora blokowego. Katalog zabezpieczeń, przekładniki CT/VT, dane
    prądu zwarciowego, model dynamiczny i profile zgodności są wybierane później — i do
    tej pory nie miały GDZIE spłynąć, bo konfigurator pisał wyłącznie do store
    przeglądarki. Sześć osi gotowości opierało więc werdykt na danych, których model nie
    zna, a które przepadały po odświeżeniu strony.

    KAŻDE pole jest opcjonalne, ale ich brak i jawne ``null`` znaczą CO INNEGO: pole
    pominięte zostawia wiązanie w modelu bez zmian, a ``null`` je USUWA (reguła gotowości
    znów widzi brak danej). Dlatego pola nie mają wartości domyślnych podstawianych po
    cichu — o rozróżnienie dba ``model_fields_set``.
    """

    protection_catalog_ref: str | None = None
    ct_catalog_ref: str | None = None
    vt_catalog_ref: str | None = None
    fault_current_data_ref: str | None = None
    dynamic_model_ref: str | None = None
    nc_rfg_profile_ref: str | None = None
    lvrt_curve_ref: str | None = None
    hvrt_curve_ref: str | None = None
    pf_curve_ref: str | None = None

    @field_validator(
        "protection_catalog_ref",
        "ct_catalog_ref",
        "vt_catalog_ref",
        "fault_current_data_ref",
        "dynamic_model_ref",
        "nc_rfg_profile_ref",
        "lvrt_curve_ref",
        "hvrt_curve_ref",
        "pf_curve_ref",
    )
    @classmethod
    def _strip_or_none(cls, value: str | None) -> str | None:
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
        if _has_enm(case_id):
            return
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


def _stable_ref_token(*parts: str | None) -> str:
    source = "|".join(part.strip() for part in parts if isinstance(part, str) and part.strip())
    return hashlib.sha1(source.encode("utf-8")).hexdigest()[:12]


def _station_bus_ref_for_voltage(
    enm: dict[str, Any],
    station: dict[str, Any],
    voltage_kv: float,
) -> str | None:
    voltages = _bus_voltage_index(enm)
    candidates = [ref for ref in station.get("bus_refs", []) if isinstance(ref, str)]
    for bus_ref in candidates:
        bus_voltage = voltages.get(bus_ref)
        if bus_voltage is not None and abs(bus_voltage - voltage_kv) <= 0.05:
            return bus_ref
    for bus_ref in candidates:
        bus_voltage = voltages.get(bus_ref)
        if bus_voltage is not None and bus_voltage > 1.0:
            return bus_ref
    return None


def _ensure_catalog_block_transformer(
    enm: dict[str, Any],
    station: dict[str, Any],
    req: DerGeneratorCreateRequest,
) -> tuple[str, str]:
    """Materializuj transformator blokowy z katalogu dla wariantu DER."""

    catalog_ref = req.block_transformer_catalog_ref
    if not catalog_ref:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "generator.block_transformer_catalog_missing",
                "message_pl": "Wariant z transformatorem dedykowanym wymaga pozycji katalogowej transformatora.",
            },
        )

    block_transformer = get_block_transformer(catalog_ref)
    if block_transformer is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "generator.block_transformer_catalog_invalid",
                "message_pl": "Nie znaleziono katalogowego transformatora dedykowanego dla DER.",
            },
        )
    if req.der_kind not in block_transformer.applicable_der_kinds:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "generator.block_transformer_kind_mismatch",
                "message_pl": "Wybrany transformator dedykowany nie jest dopuszczony dla tego typu DER.",
            },
        )

    hv_bus_ref = _station_bus_ref_for_voltage(enm, station, float(block_transformer.hv_kv))
    if hv_bus_ref is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "station.sn_bus_missing_for_block_transformer",
                "message_pl": "Stacja nie ma szyny SN zgodnej z transformatorem dedykowanym.",
            },
        )

    station_ref = str(station.get("ref_id") or station.get("id") or req.station_ref)
    token = _stable_ref_token(
        station_ref,
        req.der_kind,
        req.catalog_ref,
        req.block_transformer_catalog_ref,
        req.source_name,
    )
    lv_bus_ref = f"{station_ref}/der/{token}/bus-{block_transformer.lv_kv:g}kv"
    transformer_ref = f"{station_ref}/der/{token}/tr-block"

    if not any(bus.get("ref_id") == lv_bus_ref for bus in enm.get("buses", [])):
        enm.setdefault("buses", []).append(
            {
                "ref_id": lv_bus_ref,
                "name": f"Szyna DER {block_transformer.lv_kv:g} kV",
                "voltage_kv": float(block_transformer.lv_kv),
                "tags": ["DER", req.der_kind, "transformator_blokowy"],
                "meta": {
                    "station_ref": station_ref,
                    "block_transformer_catalog_ref": catalog_ref,
                },
            }
        )

    if not any(
        transformer.get("ref_id") == transformer_ref for transformer in enm.get("transformers", [])
    ):
        enm.setdefault("transformers", []).append(
            {
                "ref_id": transformer_ref,
                "name": block_transformer.label_pl,
                "hv_bus_ref": hv_bus_ref,
                "lv_bus_ref": lv_bus_ref,
                "sn_mva": float(block_transformer.sn_kva) / 1000.0,
                "uhv_kv": float(block_transformer.hv_kv),
                "ulv_kv": float(block_transformer.lv_kv),
                "uk_percent": float(block_transformer.uk_percent),
                "pk_kw": float(block_transformer.pk_kw),
                "p0_kw": float(block_transformer.p0_kw),
                "i0_percent": float(block_transformer.i0_percent),
                "vector_group": block_transformer.vector_group,
                "catalog_ref": catalog_ref,
                "catalog_namespace": block_transformer.catalog_namespace,
                "parameter_source": "CATALOG",
                "source_mode": "KATALOG",
                "materialized_params": block_transformer.to_dict(),
                "tags": ["DER", req.der_kind, "transformator_blokowy"],
                "meta": {
                    "catalog_item_version": block_transformer.catalog_version,
                    "station_ref": station_ref,
                },
            }
        )

    bus_refs = station.setdefault("bus_refs", [])
    if lv_bus_ref not in bus_refs:
        bus_refs.append(lv_bus_ref)
    transformer_refs = station.setdefault("transformer_refs", [])
    if transformer_ref not in transformer_refs:
        transformer_refs.append(transformer_ref)

    return transformer_ref, lv_bus_ref


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
    if req.block_transformer_catalog_ref:
        canonical_variant = "block_transformer"
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
    elif canonical_variant == "block_transformer":
        transformer_ref, converter_bus_ref = _ensure_catalog_block_transformer(
            enm_dict, station, req
        )
        payload["blocking_transformer_ref"] = transformer_ref
        payload["bus_nn_ref"] = converter_bus_ref

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


@router.patch("/{project_id}/cases/{case_id}/generators/{generator_ref:path}/bindings")
async def set_der_bindings(
    project_id: str,
    case_id: str,
    generator_ref: str,
    req: DerCatalogBindingsRequest,
    request: Request,
) -> dict[str, Any]:
    """Zapisz wiązania katalogowe i profile zgodności wytwórcy w kanonicznym ENM."""

    _validate_project_case_context(request, project_id, case_id)

    # WYŁĄCZNIE pola JAWNIE podane w żądaniu — pominięte zostawiają model bez zmian,
    # jawne `null` usuwa wiązanie. Bez `model_fields_set` każde żądanie kasowałoby
    # wszystkie niewymienione wiązania (cicha utrata danych projektowych).
    payload: dict[str, Any] = {"generator_ref": generator_ref}
    for pole in req.model_fields_set:
        payload[pole] = getattr(req, pole)

    enm = _get_enm(case_id)
    resolved_name = resolve_operation_name("set_der_catalog_bindings")
    result = execute_domain_operation(
        enm_dict=enm.model_dump(mode="json"),
        op_name=resolved_name,
        payload=payload,
    )
    if result.get("error"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": result.get("error_code") or "der_bindings.failed",
                "message_pl": result.get("error") or "Nie udało się zapisać wiązań wytwórcy.",
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
