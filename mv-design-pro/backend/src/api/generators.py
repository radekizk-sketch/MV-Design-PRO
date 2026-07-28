"""API zapisu konfiguracji DER do kanonicznego modelu ENM."""

from __future__ import annotations

import hashlib
from typing import Any, Literal
from uuid import UUID

from api.domain_ops_policy import validate_and_materialize_catalog_binding
from application.analyses.protection.catalog.catalog_store import list_devices
from application.field_read_model import build_field_read_model
from domain.canonical_operations import resolve_operation_name
from domain.der_protection_functions import (
    FaktyPolaWytworcy,
    dobierz_funkcje,
    ocen_urzadzenie,
)
from domain.der_readiness import (
    macierz_gotowosci_der,
    osie_gotowosci_der,
    podsumuj_gotowosc,
    wejscie_z_generatora,
)
from domain.dobor_przekladnika import (
    WymaganiaToru,
    WymaganiaToruNapieciowego,
    sprawdz_dobor_ct,
    sprawdz_dobor_vt,
)
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


def _fakty_pola_wytworcy(
    generator: dict[str, Any],
    sciezka_zwarcia: dict[str, Any] | None,
) -> FaktyPolaWytworcy:
    """Zloz fakty o polu wytworcy z modelu — bez ani jednej wartosci domyslnej.

    Sciezka zwarcia doziemnego pochodzi z KANONICZNEGO odczytu pola
    (`build_field_read_model`), a nie z rownoleglego wyprowadzenia — dwa opisy tego
    samego pola rozjezdzalyby sie (precedens V12K-243).
    """

    zmaterializowane = generator.get("materialized_params") or {}
    meta = generator.get("meta") or {}
    if not isinstance(zmaterializowane, dict):
        zmaterializowane = {}
    if not isinstance(meta, dict):
        meta = {}

    wariant = generator.get("connection_variant")
    strona = {
        "DEDICATED_MV_CONNECTION": "dedicated_transformer",
        "block_transformer": "dedicated_transformer",
        "SOURCE_CONNECTION_STATION": "SN",
    }.get(wariant if isinstance(wariant, str) else "", "nN")

    rodzaj = {
        "pv_inverter": "PV",
        "bess": "BESS",
        "wind_inverter": "FW",
        "fw_pmsg": "FW",
        "fw_dfig": "FW",
        "fw_scig": "FW",
    }.get(generator.get("gen_type") or "", "PV")

    p_mw = generator.get("p_mw")
    sciezka = sciezka_zwarcia or {}
    return FaktyPolaWytworcy(
        der_id=str(generator.get("ref_id") or ""),
        der_kind=rodzaj,  # type: ignore[arg-type]
        connection_side=strona,
        nominal_power_kw=(p_mw * 1000.0 if isinstance(p_mw, int | float) else None),
        block_transformer_catalog_ref=(
            zmaterializowane.get("block_transformer_catalog_ref")
            or meta.get("block_transformer_catalog_ref")
        ),
        # Brak opisu sciezki zwarcia doziemnego zostaje BRAKIEM: regula zamieni go
        # w nazwana kwestie otwarta, zamiast wybrac rodzine funkcji za projektanta.
        neutral_grounding_mode=sciezka.get("neutral_grounding_mode") or "nieznany",
        zero_sequence_current_source=sciezka.get("zero_sequence_current_source") or "brak",
        zero_sequence_voltage_source=sciezka.get("zero_sequence_voltage_source") or "brak",
    )


def _sciezka_zwarcia_dla_pola(
    case_id: str, enm: EnergyNetworkModel, bay_ref: str | None
) -> dict[str, Any] | None:
    if not bay_ref:
        return None
    model_pol = build_field_read_model(case_id, enm)
    for pozycja in model_pol.get("items", []):
        if pozycja.get("bay_ref") == bay_ref:
            wyniki = pozycja.get("project_results") or {}
            return wyniki.get("earth_fault_path")
    return None


def _funkcje_urzadzenia(protection_ref: str | None) -> tuple[tuple[str, ...] | None, str]:
    """Funkcje deklarowane przez wybrane urzadzenie + jego nazwa do komunikatu."""
    if not protection_ref:
        return None, "wybrane urządzenie"
    for urzadzenie in list_devices():
        if urzadzenie.device_id == protection_ref:
            nazwa = f"{urzadzenie.vendor} {urzadzenie.model}".strip()
            return tuple(urzadzenie.functions_supported), nazwa or protection_ref
    return None, protection_ref


@router.get("/{project_id}/cases/{case_id}/generators/{generator_ref:path}/protection-functions")
async def get_der_protection_functions(
    project_id: str,
    case_id: str,
    generator_ref: str,
    request: Request,
) -> dict[str, Any]:
    """Wymagane funkcje zabezpieczeniowe pola wytworcy + ocena wybranego urzadzenia.

    ZERO FIZYKI I ZERO NASTAW: odpowiedz mowi, JAKIE funkcje sa wymagane, CZYM je
    zmierzyc i CZY wybrane urzadzenie je realizuje. Nastawy licza moduly koordynacji.
    """

    _validate_project_case_context(request, project_id, case_id)
    enm = _get_enm(case_id)
    dane = enm.model_dump(mode="json")

    generator = next(
        (g for g in dane.get("generators", []) if g.get("ref_id") == generator_ref),
        None,
    )
    if generator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "generator.not_found",
                "message_pl": f"Wytwórca {generator_ref} nie istnieje w modelu.",
            },
        )

    zmaterializowane = generator.get("materialized_params") or {}
    meta = generator.get("meta") or {}
    bay_ref = None
    for zrodlo in (zmaterializowane, meta):
        if isinstance(zrodlo, dict) and isinstance(zrodlo.get("bay_ref"), str):
            bay_ref = zrodlo["bay_ref"]
            break

    sciezka = _sciezka_zwarcia_dla_pola(case_id, enm, bay_ref)
    fakty = _fakty_pola_wytworcy(generator, sciezka)
    dobor = dobierz_funkcje(fakty)

    protection_ref = None
    for zrodlo in (zmaterializowane, meta):
        if isinstance(zrodlo, dict) and isinstance(zrodlo.get("protection_catalog_ref"), str):
            protection_ref = zrodlo["protection_catalog_ref"]
            break

    funkcje_urzadzenia, nazwa_urzadzenia = _funkcje_urzadzenia(protection_ref)
    ocena = ocen_urzadzenie(dobor.kody(), funkcje_urzadzenia, nazwa_urzadzenia=nazwa_urzadzenia)

    return {
        "generator_ref": generator_ref,
        "bay_ref": bay_ref,
        "fakty": {
            "connection_side": fakty.connection_side,
            "neutral_grounding_mode": fakty.neutral_grounding_mode,
            "zero_sequence_current_source": fakty.zero_sequence_current_source,
            "zero_sequence_voltage_source": fakty.zero_sequence_voltage_source,
        },
        "dobor": dobor.to_dict(),
        "urzadzenie": {
            "protection_catalog_ref": protection_ref,
            "nazwa": nazwa_urzadzenia if protection_ref else None,
            **ocena.to_dict(),
        },
    }


@router.get("/{project_id}/cases/{case_id}/generators/{generator_ref:path}/readiness")
async def get_der_readiness(
    project_id: str,
    case_id: str,
    generator_ref: str,
    request: Request,
) -> dict[str, Any]:
    """Gotowosc analiz dla wytworcy — KANONICZNA regula domenowa (V12K-251).

    DLACZEGO TEN ENDPOINT ISTNIEJE. Regula `domain/der_readiness.py` (519 linii)
    powstala jako backendowy odpowiednik macierzy z frontu i byla utrzymywana pod
    kontraktem parzystosci — ale POMIAR pokazal ZERO konsumentow produkcyjnych
    (`grep -rln der_readiness backend/src` poza samym modulem), wiec wolaly ja
    wylacznie testy. Zdolnosc bez wywolania: regula pilnowana, nikomu nie sluzaca,
    a jedyna ocena widziana przez uzytkownika liczona w przegladarce.

    Odpowiedz niesie statusy osi ORAZ NAZWANE powody (kody + komunikat + miejsce
    naprawy) — bez powodow status jest slepym zaulkiem.

    Klasa przekladnika przychodzi z KATALOGU (`CTType.to_dict`, IEC 61869-2), nie
    ze zgadywania z identyfikatora: regula nie ma wlasnego katalogu.
    """

    _validate_project_case_context(request, project_id, case_id)
    enm = _get_enm(case_id)
    dane = enm.model_dump(mode="json")

    generatory = dane.get("generators", [])
    generator = next((g for g in generatory if g.get("ref_id") == generator_ref), None)
    if generator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "generator.not_found",
                "message_pl": f"Wytwórca {generator_ref} nie istnieje w modelu.",
            },
        )

    # Liczba INNYCH wytworcow w tej samej stacji — wejscie osi selektywnosci.
    stacja = generator.get("station_ref")
    inni = sum(
        1 for g in generatory if g.get("ref_id") != generator_ref and g.get("station_ref") == stacja
    )

    klasa_ct, zastosowanie_ct = _klasa_przekladnika_z_katalogu(generator)
    wejscie = wejscie_z_generatora(
        generator,
        other_ders_in_station=inni,
        ct_accuracy_class=klasa_ct,
        ct_application=zastosowanie_ct,
    )
    macierz = macierz_gotowosci_der(wejscie)
    osie = osie_gotowosci_der(wejscie)

    return {
        "generator_ref": generator_ref,
        "macierz": macierz,
        "osie": [os.to_dict() for os in osie],
        "podsumowanie": podsumuj_gotowosc(macierz),
    }


@router.get("/{project_id}/cases/{case_id}/generators/{generator_ref:path}/instrument-transformers")
async def get_der_instrument_transformers(
    project_id: str,
    case_id: str,
    generator_ref: str,
    request: Request,
) -> dict[str, Any]:
    """Dobor przekladnikow pola wytworcy — kryteria normowe z jawnym rachunkiem.

    DLACZEGO. Ekran pokazywal przekladniki jako NAZWY katalogowe. Audyt E-21 (pkt P9):
    „bez sprawdzenia przekladni wobec pradu chronionego toru, obciazalnosci cieplnej i
    dynamicznej, nasycenia oraz zgodnosci z wejsciem przekaznika jego wybor nie ma
    wiarygodnosci inzynierskiej".

    SKAD DANE (zero wartosci domyslnych, zero fizyki w tej warstwie):
      * typ przekladnika    — katalog (`CTType`/`VTType`, dane doboru z V12K-254/255),
      * prad roboczy toru   — SOLVER `compute_transformer_rated_currents` (I = S/(√3·U)),
      * Ik'' oraz ip        — WIERSZ WYNIKU zwarciowego dla szyny pola (solver IEC 60909);
                              brak zakonczonego przebiegu zostaje BRAKIEM DANEJ,
      * sposob uziemienia i tor napiecia zerowego — kanoniczny odczyt pola,
      * wejscia pomiarowe urzadzenia — katalog urzadzen (z pochodzeniem deklaracji).
    """

    _validate_project_case_context(request, project_id, case_id)
    enm = _get_enm(case_id)
    dane = enm.model_dump(mode="json")

    generator = next(
        (g for g in dane.get("generators", []) if g.get("ref_id") == generator_ref),
        None,
    )
    if generator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "generator.not_found",
                "message_pl": f"Wytwórca {generator_ref} nie istnieje w modelu.",
            },
        )

    zrodla = (
        _slownik_pomocniczy(generator.get("materialized_params")),
        _slownik_pomocniczy(generator.get("meta")),
    )
    bay_ref = _pierwsza_wartosc(zrodla, "bay_ref")
    sciezka = _sciezka_zwarcia_dla_pola(case_id, enm, bay_ref) or {}

    napiecie_v = _napiecie_szyny_v(dane, generator.get("bus_ref"))
    prad_roboczy = _prad_roboczy_pola_a(generator, napiecie_v)
    ik_ka, ip_ka, run_ref = _prady_zwarciowe_szyny(case_id, generator.get("bus_ref"))
    prady_wejsc, napiecia_wejsc, zrodlo_wejsc = _wejscia_urzadzenia(
        _pierwsza_wartosc(zrodla, "protection_catalog_ref")
    )

    tor_pradowy = WymaganiaToru(
        prad_roboczy_a=prad_roboczy,
        ik_ka=ik_ka,
        ip_ka=ip_ka,
        # Czas trwania zwarcia przyjety do sprawdzenia cieplnego jest DANA PROJEKTOWA
        # (nastawa stopnia rezerwowego). Model jej nie niesie, wiec zostaje brakiem —
        # regula nazwie go wprost, zamiast podstawic 1 s „bo tak sie zwykle przyjmuje".
        czas_zwarcia_s=None,
        prady_wejsc_przekaznika_a=prady_wejsc,
        obciazenie_obwodu_va=None,
        zrodlo_wejsc_pl=zrodlo_wejsc,
        dla_zabezpieczen=True,
    )
    tor_napieciowy = WymaganiaToruNapieciowego(
        napiecie_sieci_v=napiecie_v,
        tryb_uziemienia=sciezka.get("neutral_grounding_mode") or "nieznany",
        zwarcie_doziemne_wylaczane_automatycznie=None,
        napiecia_wejsc_przekaznika_v=napiecia_wejsc,
        obciazenie_obwodu_va=None,
        zrodlo_napiecia_zerowego=sciezka.get("zero_sequence_voltage_source") or "brak",
        zrodlo_wejsc_pl=zrodlo_wejsc,
        dla_zabezpieczen=True,
    )

    ct_ref = _pierwsza_wartosc(zrodla, "ct_catalog_ref")
    vt_ref = _pierwsza_wartosc(zrodla, "vt_catalog_ref")
    return {
        "generator_ref": generator_ref,
        "bay_ref": bay_ref,
        "wejscia": {
            "napiecie_sieci_v": napiecie_v,
            "prad_roboczy_a": prad_roboczy,
            "ik_ka": ik_ka,
            "ip_ka": ip_ka,
            "run_ref_zwarciowy": run_ref,
            "tryb_uziemienia": tor_napieciowy.tryb_uziemienia,
            "zrodlo_napiecia_zerowego": tor_napieciowy.zrodlo_napiecia_zerowego,
            "zrodlo_wejsc_urzadzenia": zrodlo_wejsc,
        },
        "przekladnik_pradowy": _dobor_przekladnika(ct_ref, "ct", tor_pradowy),
        "przekladnik_napieciowy": _dobor_przekladnika(vt_ref, "vt", tor_napieciowy),
    }


def _pierwsza_wartosc(zrodla: tuple[dict[str, Any], ...], pole: str) -> str | None:
    for zrodlo in zrodla:
        wartosc = zrodlo.get(pole)
        if isinstance(wartosc, str) and wartosc.strip():
            return wartosc
    return None


def _napiecie_szyny_v(dane: dict[str, Any], bus_ref: Any) -> float | None:
    if not isinstance(bus_ref, str):
        return None
    for szyna in dane.get("buses", []):
        if szyna.get("ref_id") == bus_ref:
            kv = szyna.get("voltage_kv")
            return float(kv) * 1000.0 if isinstance(kv, int | float) else None
    return None


def _prad_roboczy_pola_a(generator: dict[str, Any], napiecie_v: float | None) -> float | None:
    """Prad roboczy toru — Z SOLWERA, nie z wlasnego wzoru w warstwie API.

    `compute_transformer_rated_currents` jest kanonicznym dostawca przeliczenia
    I = S/(√3·U) (WHITE BOX: wzor + zalozenia). Reuzycie zamiast rownoleglego
    rachunku — dwa wzory na to samo rozjezdzaja sie (precedens V12K-243).
    """
    from network_model.solvers.transformer_rated_currents import (
        TransformerRatedCurrentsInput,
        compute_transformer_rated_currents,
    )

    p_mw = generator.get("p_mw")
    if not isinstance(p_mw, int | float) or p_mw <= 0 or not napiecie_v or napiecie_v <= 0:
        return None
    napiecie_kv = napiecie_v / 1000.0
    wynik = compute_transformer_rated_currents(
        TransformerRatedCurrentsInput(
            rated_power_kva=float(p_mw) * 1000.0,
            primary_voltage_kv=napiecie_kv,
            secondary_voltage_kv=napiecie_kv,
        )
    )
    return wynik.primary_current_a


def _prady_zwarciowe_szyny(
    case_id: str, bus_ref: Any
) -> tuple[float | None, float | None, str | None]:
    """Ik'' i ip dla szyny pola z OSTATNIEGO zakonczonego przebiegu zwarciowego.

    Brak przebiegu albo brak wiersza dla tej szyny zwraca `(None, None, None)` —
    regula zamieni to w nazwany brak danej („uruchom analize zwarciowa"), a nie w
    zgodnosc. Zadnego sumowania wkladow: suma prądow zwarciowych nalezy do solwera.
    """
    from enm.canonical_analysis import build_short_circuit_results, list_runs_for_case

    if not isinstance(bus_ref, str):
        return None, None, None
    przebiegi = [
        run
        for run in list_runs_for_case(case_id)
        if run.analysis_type == "short_circuit_sn" and run.status == "FINISHED"
    ]
    for run in sorted(przebiegi, key=lambda r: r.created_at, reverse=True):
        for wiersz in build_short_circuit_results(run).get("rows", []):
            if wiersz.get("fault_type") not in (None, "3F", "three_phase"):
                continue
            if bus_ref in (wiersz.get("target_id"), wiersz.get("element_id")):
                return wiersz.get("ikss_ka"), wiersz.get("ip_ka"), str(run.id)
    return None, None, None


def _wejscia_urzadzenia(
    protection_ref: str | None,
) -> tuple[tuple[float, ...] | None, tuple[float, ...] | None, str | None]:
    if not protection_ref:
        return None, None, None
    for urzadzenie in list_devices():
        if urzadzenie.device_id == protection_ref:
            return (
                urzadzenie.rated_current_inputs_a,
                urzadzenie.rated_voltage_inputs_v,
                urzadzenie.rated_inputs_source,
            )
    return None, None, None


def _dobor_przekladnika(
    ref: str | None,
    rodzaj: Literal["ct", "vt"],
    tor: WymaganiaToru | WymaganiaToruNapieciowego,
) -> dict[str, Any]:
    """Dobor dla wiazania katalogowego; brak wiazania NIE jest bledem doboru."""
    from network_model.catalog import get_default_mv_catalog

    if ref is None:
        return {"catalog_ref": None, "nazwa": None, "wynik": None}
    katalog = get_default_mv_catalog()
    typ = katalog.get_ct_type(ref) if rodzaj == "ct" else katalog.get_vt_type(ref)
    if typ is None:
        return {"catalog_ref": ref, "nazwa": None, "wynik": None}
    jako_slownik = typ.to_dict()
    wynik = (
        sprawdz_dobor_ct(jako_slownik, tor)
        if rodzaj == "ct" and isinstance(tor, WymaganiaToru)
        else (
            sprawdz_dobor_vt(jako_slownik, tor)
            if isinstance(tor, WymaganiaToruNapieciowego)
            else None
        )
    )
    return {
        "catalog_ref": ref,
        "nazwa": jako_slownik.get("name"),
        "typ": jako_slownik,
        "wynik": wynik.to_dict() if wynik is not None else None,
    }


def _klasa_przekladnika_z_katalogu(
    generator: dict[str, Any],
) -> tuple[str | None, Any]:
    """Klasa i zastosowanie przekladnika Z KATALOGU — regula ich nie zgaduje.

    Brak wiazania albo typ nieznany katalogowi daje `(None, None)`, co regula zamienia
    w kod `der.ct_class.unresolved` — „nie da sie ustalic" jest innym faktem niz
    „klasa nie jest zabezpieczeniowa" (V12K-232).
    """
    from network_model.catalog import get_default_mv_catalog

    zrodla = (
        _slownik_pomocniczy(generator.get("materialized_params")),
        _slownik_pomocniczy(generator.get("meta")),
    )
    ref = None
    for zrodlo in zrodla:
        wartosc = zrodlo.get("ct_catalog_ref")
        if isinstance(wartosc, str) and wartosc.strip():
            ref = wartosc
            break
    if ref is None:
        return None, None

    typ = get_default_mv_catalog().get_ct_type(ref)
    if typ is None:
        return None, None
    jako_slownik = typ.to_dict()
    return jako_slownik.get("accuracy_class"), jako_slownik.get("application")


def _slownik_pomocniczy(wartosc: Any) -> dict[str, Any]:
    return wartosc if isinstance(wartosc, dict) else {}
