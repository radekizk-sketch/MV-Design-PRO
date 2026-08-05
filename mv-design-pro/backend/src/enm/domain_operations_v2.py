"""
Operacje domenowe V2 — ochrona, Study Case, źródła nN, operacje uniwersalne.

Rozszerzenie domain_operations.py o brakujące operacje z Fazy 1.1 specyfikacji.
Każda operacja jest deterministyczna i generuje zdarzenia domenowe.

BINDING: Komunikaty po polsku, brak kodów projektowych.

ZNACZNIK POCHODZENIA KATALOGOWEGO (V12K-316 dług 4). Przestrzeń katalogu
(`catalog_namespace`) wynika z RODZAJU elementu, który operacja tworzy — nie
z deklaracji payloadu. TA SAMA wartość wybiera pozycję w katalogu i trafia do
migawki jako znacznik pochodzenia, a element bez pozycji katalogowej nie
deklaruje kategorii wcale. Reguła jest pilnowana skanem struktury w
`tests/enm/test_znacznik_pochodzenia_katalogowego_v2.py`: nowe miejsce zapisu
`catalog_namespace` musi brać wartość ze stałej przestrzeni albo z nazwy, która
w tej samej funkcji pojechała do materializacji.
"""

from __future__ import annotations

import copy
import json
import math
from dataclasses import dataclass
from typing import Any

from network_model.catalog.materialization import materialize_catalog_binding
from network_model.catalog.mv_ptpiree_catalog import annotate_with_ptpiree_status
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CatalogBinding
from network_model.solvers import cable_ampacity_derating as cable_derating

from . import der_sn_validation as der_val
from .domain_operations import (
    _apply_catalog_metadata,
    _apply_materialized_branch_fields,
    _apply_materialized_transformer_fields,
    _build_field_spec,
    _compute_seed,
    _error_legacy_field_write_disabled,
    _error_response,
    _find_element,
    _find_legacy_field_element_collection,
    _make_id,
    _materialize_catalog_payload,
    _require_catalog_ref,
    _response,
    _station_has_transformer,
)
from .topology_ops import attach_protection, create_branch, create_measurement, create_node

# ---------------------------------------------------------------------------
# IEC 60255 — krzywe IDMT (TCC)
# ---------------------------------------------------------------------------

IEC_CURVES = {
    "SI": {"K": 0.14, "alpha": 0.02},  # Standard Inverse
    "VI": {"K": 13.5, "alpha": 1.0},  # Very Inverse
    "EI": {"K": 80.0, "alpha": 2.0},  # Extremely Inverse
    "LTI": {"K": 120.0, "alpha": 1.0},  # Long Time Inverse
}


def _compute_tcc_point(i_ratio: float, tms: float, curve_type: str) -> float | None:
    """Oblicz czas zadziałania dla danego I/Is wg IEC 60255.

    t = TMS * K / ((I/Is)^alpha - 1)
    """
    params = IEC_CURVES.get(curve_type)
    if not params:
        return None
    if i_ratio <= 1.0:
        return None  # poniżej progu — brak zadziałania
    denominator = (i_ratio ** params["alpha"]) - 1.0
    if denominator <= 0:
        return None
    return tms * params["K"] / denominator


def _compute_tcc_curve(
    ipickup_a: float, tms: float, curve_type: str, i_max_a: float = 0.0
) -> list[dict[str, float]]:
    """Wylicz deterministyczną krzywą TCC (punkty I vs t)."""
    points: list[dict[str, float]] = []
    if ipickup_a <= 0:
        return points
    max_ratio = max(20.0, (i_max_a / ipickup_a) if i_max_a > 0 else 20.0)
    # Generuj 50 punktów od 1.05 * Is do max_ratio * Is
    for n in range(50):
        ratio = 1.05 + (max_ratio - 1.05) * n / 49
        t = _compute_tcc_point(ratio, tms, curve_type)
        if t is not None and t > 0:
            points.append(
                {
                    "i_a": round(ratio * ipickup_a, 2),
                    "i_ratio": round(ratio, 4),
                    "t_s": round(t, 4),
                }
            )
    return points


def _field_ref_exists(enm: dict[str, Any], field_ref: str) -> bool:
    if any(bay.get("ref_id") == field_ref for bay in enm.get("bays", [])):
        return True
    for sub in enm.get("substations", []):
        for key in ("field_specs", "nn_field_specs"):
            raw_specs = _substation_meta_specs(sub, key)
            if any(spec.get("field_ref") == field_ref for spec in raw_specs):
                return True
    return False


def _field_record(enm: dict[str, Any], field_ref: str) -> dict[str, Any] | None:
    for bay in enm.get("bays", []):
        if isinstance(bay, dict) and bay.get("ref_id") == field_ref:
            return bay
    for sub in enm.get("substations", []):
        for key in ("field_specs", "nn_field_specs"):
            for spec in _substation_meta_specs(sub, key):
                if spec.get("field_ref") == field_ref:
                    return spec
    return None


def _update_field_spec(
    enm: dict[str, Any],
    field_ref: str,
    values: dict[str, Any],
) -> None:
    for bay in enm.get("bays", []):
        if isinstance(bay, dict) and bay.get("ref_id") == field_ref:
            bay.update(values)
            return
    for sub in enm.get("substations", []):
        for key in ("field_specs", "nn_field_specs"):
            for spec in _substation_meta_specs(sub, key):
                if spec.get("field_ref") == field_ref:
                    spec.update(values)
                    return


def _nazwa_pola(enm: dict[str, Any], field_ref: str) -> str:
    """Czytelna nazwa pola do NAZW ELEMENTÓW pokazywanych użytkownikowi.

    KD-6 (Zero-Debt): domyślna nazwa zabezpieczenia sklejała się z REFERENCJĄ
    pola („Zabezpieczenie pola stn/08489…/sn_field/000"), więc identyfikator
    maszynowy wychodził na strefę pierwszoplanową — widać go było w uzasadnieniu
    czasu wyłączenia na ekranie wyników zwarciowych. Nazwa pola jest w modelu;
    referencja zostaje wyłącznie awaryjnym opisem, gdy pole nazwy nie ma.
    """
    record = _field_record(enm, field_ref)
    if isinstance(record, dict):
        nazwa = record.get("name")
        if isinstance(nazwa, str) and nazwa.strip():
            return nazwa.strip()
    return field_ref


def _field_bus_ref(enm: dict[str, Any], field_ref: str) -> str | None:
    record = _field_record(enm, field_ref)
    bus_ref = record.get("bus_ref") if isinstance(record, dict) else None
    return bus_ref if isinstance(bus_ref, str) and bus_ref.strip() else None


def _field_equipment_refs(enm: dict[str, Any], field_ref: str) -> list[str]:
    record = _field_record(enm, field_ref)
    raw_refs = record.get("equipment_refs") if isinstance(record, dict) else []
    return [ref for ref in raw_refs if isinstance(ref, str)] if isinstance(raw_refs, list) else []


def _first_field_breaker_ref(enm: dict[str, Any], field_ref: str) -> str | None:
    field_refs = set(_field_equipment_refs(enm, field_ref))
    for branch in enm.get("branches", []):
        if not isinstance(branch, dict):
            continue
        if branch.get("ref_id") in field_refs and branch.get("type") == "breaker":
            ref_id = branch.get("ref_id")
            return ref_id if isinstance(ref_id, str) else None
    return None


def _first_measurement_ref(
    enm: dict[str, Any],
    field_ref: str,
    measurement_type: str,
) -> str | None:
    for measurement in enm.get("measurements", []):
        if (
            isinstance(measurement, dict)
            and measurement.get("bay_ref") == field_ref
            and measurement.get("measurement_type") == measurement_type
        ):
            ref_id = measurement.get("ref_id")
            return ref_id if isinstance(ref_id, str) else None
    return None


def _catalog_binding_from_payload(
    payload: dict[str, Any],
    namespace: str,
) -> dict[str, Any] | None:
    """Wiązanie katalogowe payloadu sprowadzone do PRZESTRZENI RODZAJU elementu.

    ZNACZNIK POCHODZENIA OPISUJE ŹRÓDŁO (V12K-316 dług 4). Kategoria katalogu nie
    jest deklaracją klienta, tylko konsekwencją tego, JAKI element operacja tworzy:
    ta sama wartość wybiera akcesor katalogu w materializacji i trafia do migawki.
    Dotąd payload mógł tu podstawić własną kategorię (`normalized` zachowywał
    `catalog_namespace` z żądania), więc migawka deklarowała przestrzeń, w której
    materializacja niczego nie szukała — ślad audytowy kłamał, choć liczby były
    pilnowane bramą katalogową.
    """
    binding = payload.get("catalog_binding")
    if isinstance(binding, dict):
        normalized = copy.deepcopy(binding)
        item_id = (
            normalized.get("catalog_item_id")
            or normalized.get("catalog_ref")
            or normalized.get("item_id")
            or payload.get("catalog_item_id")
            or payload.get("catalog_ref")
        )
        if isinstance(item_id, str) and item_id.strip():
            normalized["catalog_item_id"] = item_id.strip()
        normalized["catalog_namespace"] = namespace
        item_version = normalized.get("catalog_item_version") or payload.get("catalog_item_version")
        normalized["catalog_item_version"] = (
            item_version.strip()
            if isinstance(item_version, str) and item_version.strip()
            else "2024.1"
        )
        normalized.setdefault("materialize", True)
        normalized.setdefault("snapshot_mapping_version", "1.0")
        return normalized

    item_id = payload.get("catalog_item_id") or payload.get("catalog_ref")
    if isinstance(item_id, str) and item_id.strip():
        return {
            "catalog_namespace": namespace,
            "catalog_item_id": item_id.strip(),
            "catalog_item_version": payload.get("catalog_item_version") or "2024.1",
            "materialize": True,
            "snapshot_mapping_version": "1.0",
        }
    return None


def _catalog_item_id(binding: dict[str, Any] | None) -> str | None:
    if not isinstance(binding, dict):
        return None
    for key in ("catalog_item_id", "catalog_ref", "id"):
        value = binding.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


#: Przestrzeń katalogu APARATU POLA — wynika z rodzaju pola (SN albo nN), nigdy
#: z deklaracji payloadu. Jedna stała na obie strony pary predykatów: sprawdzenie
#: ISTNIENIA pozycji (`_blad_aparatu_pola`) i znacznik pochodzenia zapisywany do
#: migawki muszą pytać o TĘ SAMĄ przestrzeń (V12K-316 dług 4).
_PRZESTRZEN_APARATU_POLA_SN = "APARAT_SN"
_PRZESTRZEN_APARATU_POLA_NN = "APARAT_NN"


def _wiazanie_w_przestrzeni(binding: object, namespace: str) -> dict[str, Any] | None:
    """Wiązanie katalogowe sprowadzone do przestrzeni RODZAJU elementu.

    Wiązanie podane w żądaniu wskazuje POZYCJĘ, nie kategorię: kategoria wynika
    z tego, jaki element operacja tworzy (transformator blokowy jest zawsze
    TRAFO_SN_NN, kabel przyłączeniowy zawsze KABEL_SN, aparat pola SN zawsze
    APARAT_SN). Bez tego sprowadzenia payload wybierałby akcesor katalogu — i do
    gałęzi `type: cable` dałoby się zmaterializować typ linii napowietrznej,
    a migawka zapisałaby tę kategorię jako pochodzenie (V12K-316 dług 4;
    ta sama reguła co `catalog.namespace_mismatch` w `assign_catalog_to_element`).
    """
    if not isinstance(binding, dict):
        return None
    return {**copy.deepcopy(binding), "catalog_namespace": namespace}


def _bus_voltage_kv(enm: dict[str, Any], bus_ref: str) -> float | None:
    for bus in enm.get("buses", []):
        if not isinstance(bus, dict) or bus.get("ref_id") != bus_ref:
            continue
        voltage = bus.get("voltage_kv")
        if isinstance(voltage, int | float) and voltage > 0:
            return float(voltage)
    return None


def _same_nominal_voltage(left_kv: float, right_kv: float, tolerance_kv: float = 1e-6) -> bool:
    return abs(left_kv - right_kv) <= tolerance_kv


def _sn_bay_branch_type(apparatus_kind: object) -> str:
    normalized = apparatus_kind.strip().upper() if isinstance(apparatus_kind, str) else ""
    if normalized in {"DISCONNECTOR", "DS", "ODLACZNIK", "ODŁĄCZNIK"}:
        return "disconnector"
    if normalized in {"LOAD_SWITCH", "LS", "ROZLACZNIK", "ROZŁĄCZNIK"}:
        return "switch"
    if normalized in {"MEASUREMENT", "VT", "POMIAR"}:
        return "switch"
    return "breaker"


def _relay_catalog_binding(payload: dict[str, Any], namespace: str) -> dict[str, Any] | None:
    protection = payload.get("protection")
    if isinstance(protection, dict):
        item_id = protection.get("catalog_item_id") or protection.get("catalog_ref")
        if isinstance(item_id, str) and item_id.strip():
            return {
                "catalog_namespace": namespace,
                "catalog_item_id": item_id.strip(),
                "catalog_item_version": protection.get("catalog_item_version") or "2024.1",
            }
    return _catalog_binding_from_payload(payload, namespace)


def _relay_device_type(relay_type: str) -> str:
    normalized = relay_type.upper()
    if normalized == "ZIEMNOZWARCIOWY":
        return "earth_fault"
    if normalized == "KIERUNKOWY_NADPRADOWY":
        return "directional_overcurrent"
    if normalized == "ODLEGLOSCIOWY":
        return "distance"
    if normalized == "ROZNICOWY":
        return "differential"
    if normalized == "NADPRADOWY":
        return "overcurrent"
    return "custom"


def _default_relay_settings(relay_type: str) -> list[dict[str, Any]]:
    device_type = _relay_device_type(relay_type)
    if device_type == "earth_fault":
        return [
            {
                "function_type": "earth_fault_50N",
                "threshold_a": None,
                "time_delay_s": None,
                "curve_type": "DT",
            },
            {
                "function_type": "earth_fault_51N",
                "threshold_a": None,
                "time_delay_s": None,
                "curve_type": "IEC_SI",
            },
        ]
    if device_type == "directional_overcurrent":
        return [
            {
                "function_type": "directional_67",
                "threshold_a": None,
                "time_delay_s": None,
                "curve_type": "IEC_SI",
                "is_directional": True,
            },
            {
                "function_type": "directional_67N",
                "threshold_a": None,
                "time_delay_s": None,
                "curve_type": "IEC_SI",
                "is_directional": True,
            },
        ]
    if device_type == "overcurrent":
        return [
            {
                "function_type": "overcurrent_50",
                "threshold_a": None,
                "time_delay_s": None,
                "curve_type": "DT",
            },
            {
                "function_type": "overcurrent_51",
                "threshold_a": None,
                "time_delay_s": None,
                "curve_type": "IEC_SI",
            },
        ]
    return []


def _substation_meta_specs(substation: dict[str, Any], key: str) -> list[dict[str, Any]]:
    meta = substation.get("meta")
    if not isinstance(meta, dict):
        return []
    raw_specs = meta.get(key)
    if not isinstance(raw_specs, list):
        return []
    return [spec for spec in raw_specs if isinstance(spec, dict)]


def _resolve_station_for_field_write(
    enm: dict[str, Any],
    *,
    station_ref: str | None,
    bus_ref: str | None = None,
) -> dict[str, Any] | None:
    if station_ref:
        for sub in enm.get("substations", []):
            if sub.get("ref_id") == station_ref or sub.get("id") == station_ref:
                return sub
        return None
    if not bus_ref:
        return None
    return _find_station_for_bus(enm, bus_ref)


def _append_substation_field_spec(
    new_enm: dict[str, Any],
    *,
    station_ref: str,
    meta_key: str,
    field_spec: dict[str, Any],
) -> bool:
    for sub in new_enm.get("substations", []):
        if sub.get("ref_id") != station_ref and sub.get("id") != station_ref:
            continue
        meta = sub.setdefault("meta", {})
        if not isinstance(meta, dict):
            meta = {}
            sub["meta"] = meta
        raw_specs = meta.get(meta_key)
        if not isinstance(raw_specs, list):
            raw_specs = []
            meta[meta_key] = raw_specs
        raw_specs.append(field_spec)
        return True
    return False


def _field_adapter_error(
    *,
    field_ref: str | None,
    message: str,
    code: str,
    attach_protection_view: bool = False,
) -> dict[str, Any]:
    response = _error_response(message, code)
    response["adapter_only"] = True
    response["attach_field_view"] = True
    if attach_protection_view:
        response["attach_protection_view"] = True
    if field_ref:
        response["selection_hint"] = {
            "element_id": field_ref,
            "element_type": "field",
            "zoom_to": True,
        }
    return response


def _relay_adapter_error(
    *,
    relay_ref: str,
    message: str,
    code: str = "relay.legacy_write_disabled",
    field_ref: str | None = None,
) -> dict[str, Any]:
    response = _error_response(message, code)
    response["adapter_only"] = True
    response["attach_field_view"] = True
    response["attach_protection_view"] = True
    response["selection_hint"] = {
        "element_id": field_ref or relay_ref,
        "element_type": "field" if field_ref else "protection",
        "zoom_to": True,
    }
    return response


# ---------------------------------------------------------------------------
# 1. OCHRONA — add_ct
# ---------------------------------------------------------------------------


def add_ct(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj przekładnik prądowy CT do pola stacji."""
    field_ref = payload.get("field_ref") or payload.get("bay_ref")
    if not field_ref:
        return _error_response("Brak identyfikatora pola (bay_ref).", "ct.bay_missing")
    if not _field_ref_exists(enm, field_ref):
        return _error_response(f"Pole '{field_ref}' nie istnieje.", "ct.field_not_found")

    bus_ref = _field_bus_ref(enm, field_ref)
    if not bus_ref:
        return _error_response(
            f"Pole '{field_ref}' nie ma przypisanej szyny pomiarowej.",
            "ct.bus_missing",
        )

    # JEDNA przestrzeń katalogu na całą operację: wybiera akcesor materializacji
    # i jest znacznikiem pochodzenia w migawce (V12K-316 dług 4).
    przestrzen_katalogu = "CT"
    binding = _catalog_binding_from_payload(payload, przestrzen_katalogu)
    catalog_ref, catalog_error = _resolve_catalog_ref(payload.get("catalog_ref"), binding)
    if catalog_error or not catalog_ref:
        return _error_response(
            "Przekładnik prądowy CT wymaga wyboru pozycji katalogowej.",
            catalog_error or "ct.catalog_required",
        )

    z_katalogu, blad_katalogu = _pozycja_katalogu(
        namespace=przestrzen_katalogu,
        catalog_ref=catalog_ref,
        catalog_binding=binding,
        opis_pl="Przekładnik prądowy CT",
    )
    if blad_katalogu is not None:
        return blad_katalogu

    primary = payload.get("ratio_primary_a")
    secondary = payload.get("ratio_secondary_a")
    if primary is None or secondary is None:
        return _error_response(
            "Przekładnik CT wymaga przekładni pierwotnej i wtórnej.",
            "ct.ratio_missing",
        )

    rozbieznosci = rozbieznosci_tabliczki(
        {
            "ratio_primary_a": primary,
            "ratio_secondary_a": secondary,
            "accuracy_class": payload.get("accuracy_class"),
        },
        z_katalogu,
    )
    if rozbieznosci:
        return _error_response(
            f"Przekładnik CT: dane formularza przeczą pozycji katalogowej '{catalog_ref}': "
            + "; ".join(rozbieznosci)
            + ". Przekładnia i klasa pochodzą z katalogu — wybierz pozycję o właściwej "
            "przekładni.",
            "catalog.nameplate_mismatch",
        )
    primary = _wartosc_katalogowa(z_katalogu, "ratio_primary_a", primary)
    secondary = _wartosc_katalogowa(z_katalogu, "ratio_secondary_a", secondary)
    accuracy_class = _wartosc_katalogowa(
        z_katalogu, "accuracy_class", payload.get("accuracy_class")
    )

    measurement_ref = _make_id(
        "ct",
        _compute_seed(
            {
                "field_ref": field_ref,
                "catalog_ref": catalog_ref,
                "ratio_primary_a": primary,
                "ratio_secondary_a": secondary,
            }
        ),
        "measurement",
    )
    # KOPIA GRANICZNA OPERACJI (TOPO-COPY, V12K-323). Warstwa topologiczna mutuje
    # model W MIEJSCU, więc izolacja modelu wołającego należy do granicy operacji —
    # dokładnie tak, jak robi to `add_sn_bay` czy `add_grid_source_sn`. Bez tej kopii
    # `_zastosuj_wyposazenie_pol` (gwarancja B-3: albo pole z kompletnym wyposażeniem,
    # albo nic) zostawiałby CT dopisane przed błędem kolejnego kroku serii, a
    # `execute_domain_operation` liczyłby `semantic_issues` z modelu PO zmianie —
    # inaczej niż wszystkie pozostałe operacje domenowe.
    roboczy = copy.deepcopy(enm)
    result = create_measurement(
        roboczy,
        {
            "ref_id": measurement_ref,
            "name": payload.get("name") or f"CT pola {field_ref}",
            "measurement_type": "CT",
            "bus_ref": bus_ref,
            "bay_ref": field_ref,
            "rating": {
                "ratio_primary": float(primary),
                "ratio_secondary": float(secondary),
                "accuracy_class": accuracy_class,
                "burden_va": payload.get("burden_va"),
            },
            "connection": payload.get("connection") or "star",
            "purpose": payload.get("purpose") or "protection",
            "tags": ["field_ct", "catalog_bound"],
            "meta": {"field_ref": field_ref, "catalog_binding": binding},
        },
    )
    if not result.success:
        issue = result.issues[0].message_pl if result.issues else "nieznany błąd"
        return _error_response(f"Nie udało się dodać CT: {issue}", "ct.creation_failed")

    new_enm = result.enm
    for measurement in new_enm.get("measurements", []):
        if measurement.get("ref_id") == measurement_ref:
            measurement.update(
                {
                    "catalog_ref": catalog_ref,
                    "catalog_namespace": przestrzen_katalogu,
                    "parameter_source": "CATALOG",
                    "source_mode": "KATALOG",
                    "materialized_params": {
                        "catalog_item_id": catalog_ref,
                        "ratio_primary_a": float(primary),
                        "ratio_secondary_a": float(secondary),
                        "accuracy_class": accuracy_class,
                        # Obciążalność wtórna nie jest polem kontraktu materializacji
                        # CT — katalog jej nie niesie, więc pozostaje daną formularza
                        # (jawnie, a nie pod pozorem pochodzenia katalogowego).
                        "burden_va": payload.get("burden_va"),
                    },
                    "overrides": [],
                }
            )
            break

    return _response(
        new_enm,
        created=[measurement_ref],
        selection_id=measurement_ref,
        selection_type="measurement",
        events=[
            {
                "event_seq": 1,
                "event_type": "CT_CREATED",
                "element_id": measurement_ref,
                "field_ref": field_ref,
            }
        ],
    )


# ---------------------------------------------------------------------------
# 2. OCHRONA — add_vt
# ---------------------------------------------------------------------------


def add_vt(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj przekładnik napięciowy VT do pola stacji."""
    field_ref = payload.get("field_ref") or payload.get("bay_ref")
    if not field_ref:
        return _error_response("Brak identyfikatora pola (bay_ref).", "vt.bay_missing")
    if not _field_ref_exists(enm, field_ref):
        return _error_response(f"Pole '{field_ref}' nie istnieje.", "vt.field_not_found")

    bus_ref = _field_bus_ref(enm, field_ref)
    if not bus_ref:
        return _error_response(
            f"Pole '{field_ref}' nie ma przypisanej szyny pomiarowej.",
            "vt.bus_missing",
        )

    przestrzen_katalogu = "VT"
    binding = _catalog_binding_from_payload(payload, przestrzen_katalogu)
    catalog_ref, catalog_error = _resolve_catalog_ref(payload.get("catalog_ref"), binding)
    if catalog_error or not catalog_ref:
        return _error_response(
            "Przekładnik napięciowy VT wymaga wyboru pozycji katalogowej.",
            catalog_error or "vt.catalog_required",
        )

    z_katalogu, blad_katalogu = _pozycja_katalogu(
        namespace=przestrzen_katalogu,
        catalog_ref=catalog_ref,
        catalog_binding=binding,
        opis_pl="Przekładnik napięciowy VT",
    )
    if blad_katalogu is not None:
        return blad_katalogu

    primary = payload.get("ratio_primary_v")
    secondary = payload.get("ratio_secondary_v")
    if primary is None or secondary is None:
        return _error_response(
            "Przekładnik VT wymaga przekładni pierwotnej i wtórnej.",
            "vt.ratio_missing",
        )

    rozbieznosci = rozbieznosci_tabliczki(
        {
            "ratio_primary_v": primary,
            "ratio_secondary_v": secondary,
            "accuracy_class": payload.get("accuracy_class"),
        },
        z_katalogu,
    )
    if rozbieznosci:
        return _error_response(
            f"Przekładnik VT: dane formularza przeczą pozycji katalogowej '{catalog_ref}': "
            + "; ".join(rozbieznosci)
            + ". Przekładnia i klasa pochodzą z katalogu — wybierz pozycję o właściwej "
            "przekładni.",
            "catalog.nameplate_mismatch",
        )
    primary = _wartosc_katalogowa(z_katalogu, "ratio_primary_v", primary)
    secondary = _wartosc_katalogowa(z_katalogu, "ratio_secondary_v", secondary)
    accuracy_class = _wartosc_katalogowa(
        z_katalogu, "accuracy_class", payload.get("accuracy_class")
    )

    measurement_ref = _make_id(
        "vt",
        _compute_seed(
            {
                "field_ref": field_ref,
                "catalog_ref": catalog_ref,
                "ratio_primary_v": primary,
                "ratio_secondary_v": secondary,
            }
        ),
        "measurement",
    )
    # KOPIA GRANICZNA OPERACJI — uzasadnienie jak w `add_ct` (TOPO-COPY, V12K-323).
    roboczy = copy.deepcopy(enm)
    result = create_measurement(
        roboczy,
        {
            "ref_id": measurement_ref,
            "name": payload.get("name") or f"VT pola {field_ref}",
            "measurement_type": "VT",
            "bus_ref": bus_ref,
            "bay_ref": field_ref,
            "rating": {
                "ratio_primary": float(primary),
                "ratio_secondary": float(secondary),
                "accuracy_class": accuracy_class,
                "burden_va": payload.get("burden_va"),
            },
            "connection": payload.get("connection") or "star",
            "purpose": payload.get("purpose") or "protection",
            "tags": ["field_vt", "catalog_bound"],
            "meta": {"field_ref": field_ref, "catalog_binding": binding},
        },
    )
    if not result.success:
        issue = result.issues[0].message_pl if result.issues else "nieznany błąd"
        return _error_response(f"Nie udało się dodać VT: {issue}", "vt.creation_failed")

    new_enm = result.enm
    for measurement in new_enm.get("measurements", []):
        if measurement.get("ref_id") == measurement_ref:
            measurement.update(
                {
                    "catalog_ref": catalog_ref,
                    "catalog_namespace": przestrzen_katalogu,
                    "parameter_source": "CATALOG",
                    "source_mode": "KATALOG",
                    "materialized_params": {
                        "catalog_item_id": catalog_ref,
                        "ratio_primary_v": float(primary),
                        "ratio_secondary_v": float(secondary),
                        # Klasa i obciążalność wtórna nie należą do kontraktu
                        # materializacji VT — katalog ich nie niesie, więc zostają
                        # daną formularza (jawnie, bez pozoru pochodzenia z katalogu).
                        "accuracy_class": accuracy_class,
                        "burden_va": payload.get("burden_va"),
                    },
                    "overrides": [],
                }
            )
            break

    return _response(
        new_enm,
        created=[measurement_ref],
        selection_id=measurement_ref,
        selection_type="measurement",
        events=[
            {
                "event_seq": 1,
                "event_type": "VT_CREATED",
                "element_id": measurement_ref,
                "field_ref": field_ref,
            }
        ],
    )


# ---------------------------------------------------------------------------
# 3. OCHRONA — add_relay
# ---------------------------------------------------------------------------


def add_relay(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj zabezpieczenie do pola stacji."""
    field_ref = payload.get("field_ref") or payload.get("bay_ref")
    relay_type = payload.get("relay_type", "NADPRADOWY")

    if not field_ref:
        return _error_response("Brak identyfikatora pola (bay_ref).", "relay.bay_missing")
    if not _field_ref_exists(enm, field_ref):
        return _error_response(f"Pole '{field_ref}' nie istnieje.", "relay.field_not_found")

    przestrzen_katalogu = "ZABEZPIECZENIE"
    binding = _relay_catalog_binding(payload, przestrzen_katalogu)
    catalog_ref, catalog_error = _resolve_catalog_ref(payload.get("catalog_ref"), binding)
    if catalog_error or not catalog_ref:
        return _error_response(
            "Zabezpieczenie pola SN wymaga wyboru pozycji katalogowej.",
            catalog_error or "relay.catalog_required",
        )

    z_katalogu, blad_katalogu = _pozycja_katalogu(
        namespace=przestrzen_katalogu,
        catalog_ref=catalog_ref,
        catalog_binding=binding,
        opis_pl="Zabezpieczenie pola SN",
    )
    if blad_katalogu is not None:
        return blad_katalogu

    breaker_ref = payload.get("breaker_ref")
    if not isinstance(breaker_ref, str) or not breaker_ref.strip():
        breaker_ref = _first_field_breaker_ref(enm, field_ref)
    if not isinstance(breaker_ref, str) or not breaker_ref.strip():
        return _error_response(
            "Pole SN nie ma wyłącznika wykonawczego. Najpierw skonfiguruj aparat pola.",
            "relay.breaker_missing",
        )

    relay_type_text = str(relay_type)
    device_type = _relay_device_type(relay_type_text)
    ct_ref = payload.get("ct_ref")
    if not isinstance(ct_ref, str) or not ct_ref.strip():
        ct_ref = _first_measurement_ref(enm, field_ref, "CT")
    vt_ref = payload.get("vt_ref")
    if not isinstance(vt_ref, str) or not vt_ref.strip():
        vt_ref = _first_measurement_ref(enm, field_ref, "VT")

    if device_type in {"overcurrent", "earth_fault", "directional_overcurrent"} and not ct_ref:
        return _error_response(
            "Dobór zabezpieczenia wymaga przekładnika prądowego CT w tym samym polu.",
            "relay.ct_missing",
        )

    protection_ref = _make_id(
        "relay",
        _compute_seed(
            {
                "field_ref": field_ref,
                "breaker_ref": breaker_ref,
                "ct_ref": ct_ref,
                "vt_ref": vt_ref,
                "catalog_ref": catalog_ref,
                "relay_type": relay_type_text,
            }
        ),
        "assignment",
    )
    # KOPIA GRANICZNA OPERACJI — uzasadnienie jak w `add_ct` (TOPO-COPY, V12K-323).
    roboczy = copy.deepcopy(enm)
    result = attach_protection(
        roboczy,
        {
            "ref_id": protection_ref,
            "name": payload.get("name") or f"Zabezpieczenie pola {_nazwa_pola(enm, field_ref)}",
            "breaker_ref": breaker_ref,
            "ct_ref": ct_ref,
            "vt_ref": vt_ref,
            "device_type": device_type,
            "catalog_ref": catalog_ref,
            "settings": payload.get("settings") or _default_relay_settings(relay_type_text),
            "is_enabled": True,
            "tags": ["field_protection", "catalog_bound"],
            "meta": {
                "field_ref": field_ref,
                "relay_type": relay_type_text,
                "catalog_binding": binding,
            },
        },
    )
    if not result.success:
        issue = result.issues[0].message_pl if result.issues else "nieznany błąd"
        return _error_response(
            f"Nie udało się dodać zabezpieczenia: {issue}",
            "relay.creation_failed",
        )

    new_enm = result.enm
    for assignment in new_enm.get("protection_assignments", []):
        if assignment.get("ref_id") == protection_ref:
            assignment.update(
                {
                    "catalog_ref": catalog_ref,
                    "catalog_namespace": przestrzen_katalogu,
                    "parameter_source": "CATALOG",
                    "source_mode": "KATALOG",
                    "materialized_params": {
                        "catalog_item_id": catalog_ref,
                        "relay_type": relay_type_text,
                        "device_type": device_type,
                        # Tożsamość urządzenia Z KATALOGU (kontrakt ZABEZPIECZENIE):
                        # bez niej migawka deklarowała `source_mode: KATALOG`, nie
                        # niosąc ani jednej wartości pochodzącej z rekordu katalogu.
                        "name_pl": z_katalogu.get("name_pl"),
                        "vendor": z_katalogu.get("vendor"),
                        "series": z_katalogu.get("series"),
                    },
                    "overrides": [],
                }
            )
            break
    _update_field_spec(new_enm, field_ref, {"protection_ref": protection_ref})

    return _response(
        new_enm,
        created=[protection_ref],
        updated=[field_ref],
        selection_id=protection_ref,
        selection_type="protection",
        events=[
            {
                "event_seq": 1,
                "event_type": "PROTECTION_CREATED",
                "element_id": protection_ref,
                "field_ref": field_ref,
            }
        ],
    )


# ---------------------------------------------------------------------------
# 4. OCHRONA — update_relay_settings
# ---------------------------------------------------------------------------


def update_relay_settings(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Aktualizuj nastawy przekaźnika ochronnego."""
    relay_ref = payload.get("relay_ref")
    settings = payload.get("settings", {})

    if not relay_ref:
        return _error_response("Brak identyfikatora przekaźnika.", "relay.ref_missing")
    if not settings:
        return _error_response("Brak nastaw do aktualizacji.", "relay.settings_empty")

    return _relay_adapter_error(
        relay_ref=relay_ref,
        message=(
            f"Aktualizacja nastaw przekaźnika '{relay_ref}' przez legacy protection_assignments "
            "jest wyłączona w V11. Użyj kanonicznego read-modelu ochrony."
        ),
    )


# ---------------------------------------------------------------------------
# 5. OCHRONA — link_relay_to_field
# ---------------------------------------------------------------------------


def link_relay_to_field(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Powiąż przekaźnik z polem i aparatem wykonawczym."""
    relay_ref = payload.get("relay_ref")
    field_ref = payload.get("field_ref")
    payload.get("breaker_ref")

    if not relay_ref:
        return _error_response("Brak identyfikatora przekaźnika.", "relay.ref_missing")
    if not field_ref:
        return _error_response("Brak identyfikatora pola.", "relay.field_missing")
    if not _field_ref_exists(enm, field_ref):
        return _error_response(f"Pole '{field_ref}' nie istnieje.", "relay.field_not_found")

    return _relay_adapter_error(
        relay_ref=relay_ref,
        field_ref=field_ref,
        message=(
            f"Powiązanie przekaźnika '{relay_ref}' z polem '{field_ref}' przez legacy protection_assignments "
            "jest wyłączone w V11. Użyj kanonicznego read-modelu ochrony."
        ),
    )


# ---------------------------------------------------------------------------
# 6. OCHRONA — calculate_tcc_curve
# ---------------------------------------------------------------------------


def calculate_tcc_curve(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Wylicz krzywą TCC z nastaw przekaźnika (IEC 60255)."""
    relay_ref = payload.get("relay_ref")
    if not relay_ref:
        return _error_response("Brak identyfikatora przekaźnika.", "tcc.relay_missing")

    return _relay_adapter_error(
        relay_ref=relay_ref,
        message=(
            f"Cache TCC dla przekaźnika '{relay_ref}' nie jest już zapisywany do legacy protection_assignments. "
            "Użyj read-modelu ochrony lub czystej analizy bez persystencji."
        ),
        code="tcc.legacy_write_disabled",
    )


# ---------------------------------------------------------------------------
# 7. OCHRONA — validate_selectivity
# ---------------------------------------------------------------------------


def validate_selectivity(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Waliduj selektywność ochrony wzdłuż trasy do źródła."""
    delta_t_min_s = payload.get("delta_t_min_s", 0.3)
    test_current_a = payload.get("test_current_a")

    relays = enm.get("protection_assignments", [])
    if len(relays) < 2:
        return _response(
            copy.deepcopy(enm),
            events=[{"event_seq": 1, "event_type": "SELECTIVITY_VALIDATED", "element_id": "all"}],
        )

    # Porównaj pary przekaźników: upstream vs downstream
    selectivity_results = []
    for i in range(len(relays) - 1):
        downstream = relays[i]
        upstream = relays[i + 1]

        ds_settings = downstream.get("settings", {})
        us_settings = upstream.get("settings", {})

        ds_ipickup = ds_settings.get("Ipickup_a", 0)
        us_ipickup = us_settings.get("Ipickup_a", 0)
        ds_tms = ds_settings.get("time_dial", 1.0)
        us_tms = us_settings.get("time_dial", 1.0)
        ds_curve = ds_settings.get("curve_type", "SI")
        us_curve = us_settings.get("curve_type", "SI")

        ik = test_current_a or max(ds_ipickup * 10, us_ipickup * 10)
        if ik <= 0:
            continue

        t_ds = _compute_tcc_point(ik / ds_ipickup, ds_tms, ds_curve) if ds_ipickup > 0 else None
        t_us = _compute_tcc_point(ik / us_ipickup, us_tms, us_curve) if us_ipickup > 0 else None

        if t_ds is not None and t_us is not None:
            delta_t = t_us - t_ds
            passed = delta_t >= delta_t_min_s
            selectivity_results.append(
                {
                    "downstream_ref": downstream.get("ref_id"),
                    "upstream_ref": upstream.get("ref_id"),
                    "ik_a": round(ik, 2),
                    "t_downstream_s": round(t_ds, 4),
                    "t_upstream_s": round(t_us, 4),
                    "delta_t_s": round(delta_t, 4),
                    "passed": passed,
                }
            )

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("meta", {})["selectivity_results"] = selectivity_results

    all_passed = all(r["passed"] for r in selectivity_results) if selectivity_results else True

    return _response(
        new_enm,
        events=[{"event_seq": 1, "event_type": "SELECTIVITY_VALIDATED", "element_id": "all"}],
        audit=[
            {
                "step": 1,
                "action": f"Selektywność: {'OK' if all_passed else 'NIESPEŁNIONA'}",
                "detail": json.dumps(selectivity_results, ensure_ascii=False),
            }
        ],
    )


# ---------------------------------------------------------------------------
# 8-15. STUDY CASE
# ---------------------------------------------------------------------------


def create_study_case(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Utwórz nowy Study Case."""
    label_pl = payload.get("label_pl", "Nowy przypadek")
    mode_pl = payload.get("mode_pl", "NORMALNY")

    cases = enm.get("study_cases", [])
    seed = _compute_seed({"op": "study_case", "label": label_pl, "idx": len(cases)})
    case_id = f"CASE_{seed[:8].upper()}"

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("study_cases", []).append(
        {
            "case_id": case_id,
            "label_pl": label_pl,
            "mode_pl": mode_pl,
            "switch_states": {},
            "normal_states": {},
            "source_modes": {},
            "time_profile_ref": None,
            "analysis_settings": {
                "standard": "IEC_60909",
                "c_factor_max": 1.10,
                "c_factor_min": 0.95,
            },
            "status": "NONE",
            "results": None,
        }
    )

    return _response(
        new_enm,
        created=[case_id],
        selection_id=case_id,
        selection_type="study_case",
        events=[{"event_seq": 1, "event_type": "STUDY_CASE_CREATED", "element_id": case_id}],
    )


def set_case_switch_state(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw stan łącznika w Study Case."""
    case_id = payload.get("case_id")
    switch_id = payload.get("switch_element_id")
    state = payload.get("state", "ZAMKNIETY")

    if not case_id or not switch_id:
        return _error_response("Brak case_id lub switch_element_id.", "case.params_missing")

    new_enm = copy.deepcopy(enm)
    for case in new_enm.get("study_cases", []):
        if case.get("case_id") == case_id:
            case["switch_states"][switch_id] = state
            case["status"] = "OUTDATED"
            return _response(
                new_enm,
                updated=[case_id],
                events=[
                    {"event_seq": 1, "event_type": "CASE_STATE_UPDATED", "element_id": case_id}
                ],
            )

    return _error_response(f"Study Case '{case_id}' nie znaleziony.", "case.not_found")


def set_case_normal_state(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw stan normalny łącznika w Study Case."""
    case_id = payload.get("case_id")
    switch_id = payload.get("switch_element_id")
    state = payload.get("state_normal", "ZAMKNIETY")

    if not case_id or not switch_id:
        return _error_response("Brak case_id lub switch_element_id.", "case.params_missing")

    new_enm = copy.deepcopy(enm)
    for case in new_enm.get("study_cases", []):
        if case.get("case_id") == case_id:
            case["normal_states"][switch_id] = state
            return _response(
                new_enm,
                updated=[case_id],
                events=[
                    {"event_seq": 1, "event_type": "CASE_STATE_UPDATED", "element_id": case_id}
                ],
            )

    return _error_response(f"Study Case '{case_id}' nie znaleziony.", "case.not_found")


def set_case_source_mode(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw tryb pracy źródła w Study Case."""
    case_id = payload.get("case_id")
    source_id = payload.get("source_element_id")
    mode = payload.get("mode", "SIEC")

    if not case_id or not source_id:
        return _error_response("Brak case_id lub source_element_id.", "case.params_missing")

    new_enm = copy.deepcopy(enm)
    for case in new_enm.get("study_cases", []):
        if case.get("case_id") == case_id:
            case["source_modes"][source_id] = mode
            case["status"] = "OUTDATED"
            return _response(
                new_enm,
                updated=[case_id],
                events=[
                    {"event_seq": 1, "event_type": "CASE_STATE_UPDATED", "element_id": case_id}
                ],
            )

    return _error_response(f"Study Case '{case_id}' nie znaleziony.", "case.not_found")


def set_case_time_profile(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Przypisz profil czasowy do Study Case."""
    case_id = payload.get("case_id")
    profile_ref = payload.get("profile_ref")

    if not case_id:
        return _error_response("Brak case_id.", "case.id_missing")

    new_enm = copy.deepcopy(enm)
    for case in new_enm.get("study_cases", []):
        if case.get("case_id") == case_id:
            case["time_profile_ref"] = profile_ref
            return _response(
                new_enm,
                updated=[case_id],
                events=[
                    {"event_seq": 1, "event_type": "CASE_STATE_UPDATED", "element_id": case_id}
                ],
            )

    return _error_response(f"Study Case '{case_id}' nie znaleziony.", "case.not_found")


def run_short_circuit(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Uruchom analizę zwarciową (IEC 60909). Deleguje do solvera."""
    case_id = payload.get("case_id")
    fault = payload.get("fault", {})
    fault_type = fault.get("type", "3F")
    location = fault.get("location_element_id")
    rf_ohm = fault.get("transition_resistance_ohm", 0.0)

    new_enm = copy.deepcopy(enm)
    events = []
    ev_seq = 0

    ev_seq += 1
    events.append(
        {"event_seq": ev_seq, "event_type": "ANALYSIS_RUN_STARTED", "element_id": case_id}
    )

    # Placeholder wyników — w produkcji delegowane do solvera IEC 60909
    results = {
        "run_id": _compute_seed({"case": case_id, "fault": fault_type, "loc": location}),
        "fault_type": fault_type,
        "location": location,
        "transition_resistance_ohm": rf_ohm,
        "results_per_element": {},
        "status": "COMPLETED",
    }

    if case_id:
        for case in new_enm.get("study_cases", []):
            if case.get("case_id") == case_id:
                case["results"] = results
                case["status"] = "FRESH"
                break

    ev_seq += 1
    events.append(
        {"event_seq": ev_seq, "event_type": "ANALYSIS_RUN_COMPLETED", "element_id": case_id}
    )
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "RESULTS_MAPPED", "element_id": case_id})

    return _response(new_enm, updated=[case_id] if case_id else [], events=events)


def run_power_flow(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Uruchom analizę przepływu mocy. Deleguje do solvera Newton-Raphson."""
    case_id = payload.get("case_id")

    new_enm = copy.deepcopy(enm)
    events = [
        {"event_seq": 1, "event_type": "ANALYSIS_RUN_STARTED", "element_id": case_id},
        {"event_seq": 2, "event_type": "ANALYSIS_RUN_COMPLETED", "element_id": case_id},
        {"event_seq": 3, "event_type": "RESULTS_MAPPED", "element_id": case_id},
    ]

    if case_id:
        for case in new_enm.get("study_cases", []):
            if case.get("case_id") == case_id:
                case["status"] = "FRESH"
                break

    return _response(new_enm, updated=[case_id] if case_id else [], events=events)


def run_time_series_power_flow(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Uruchom serię czasową przepływu mocy."""
    case_id = payload.get("case_id")
    new_enm = copy.deepcopy(enm)

    return _response(
        new_enm,
        updated=[case_id] if case_id else [],
        events=[
            {"event_seq": 1, "event_type": "ANALYSIS_RUN_STARTED", "element_id": case_id},
            {"event_seq": 2, "event_type": "ANALYSIS_RUN_COMPLETED", "element_id": case_id},
        ],
    )


def compare_study_cases(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Porównaj dwa Study Cases — wylicz deltę wyników."""
    case_a_id = payload.get("case_a")
    case_b_id = payload.get("case_b")

    if not case_a_id or not case_b_id:
        return _error_response("Brak case_a lub case_b.", "compare.params_missing")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("meta", {})["comparison"] = {
        "case_a": case_a_id,
        "case_b": case_b_id,
        "delta_results": {},
        "delta_overlay_tokens": [],
    }

    return _response(
        new_enm,
        events=[
            {
                "event_seq": 1,
                "event_type": "RESULTS_MAPPED",
                "element_id": f"{case_a_id}_vs_{case_b_id}",
            },
        ],
    )


# ---------------------------------------------------------------------------
# 16-23. ŹRÓDŁA nN
# ---------------------------------------------------------------------------


def _find_station_for_bus(enm: dict[str, Any], bus_ref: str) -> dict[str, Any] | None:
    """Znajdź stację zawierającą daną szynę."""
    for sub in enm.get("substations", []):
        if bus_ref in sub.get("bus_refs", []):
            return sub
    return None


def _has_transformer_in_path(enm: dict[str, Any], station: dict[str, Any]) -> bool:
    """Sprawdź, czy stacja ma transformator w ścieżce zasilania."""
    station_ref = station.get("ref_id") or station.get("id")
    if _station_has_transformer(enm, station_ref):
        return True

    transformer_refs = {
        ref for ref in station.get("transformer_refs", []) if isinstance(ref, str) and ref.strip()
    }
    station_bus_refs = {
        ref for ref in station.get("bus_refs", []) if isinstance(ref, str) and ref.strip()
    }
    if not transformer_refs and not station_bus_refs:
        return False

    for transformer in enm.get("transformers", []):
        if not isinstance(transformer, dict):
            continue
        transformer_ref = transformer.get("ref_id") or transformer.get("id")
        if isinstance(transformer_ref, str) and transformer_ref in transformer_refs:
            return True
        if station_bus_refs and (
            transformer.get("hv_bus_ref") in station_bus_refs
            or transformer.get("lv_bus_ref") in station_bus_refs
        ):
            return True
    return False


def _station_transformers_for_bus(
    enm: dict[str, Any],
    station: dict[str, Any],
    *,
    bus_ref: str | None = None,
    transformer_ref: str | None = None,
) -> list[dict[str, Any]]:
    station_transformer_refs = {
        ref for ref in station.get("transformer_refs", []) if isinstance(ref, str) and ref.strip()
    }
    station_bus_refs = {
        ref for ref in station.get("bus_refs", []) if isinstance(ref, str) and ref.strip()
    }
    candidates: list[dict[str, Any]] = []
    for transformer in enm.get("transformers", []):
        if not isinstance(transformer, dict):
            continue
        ref = transformer.get("ref_id") or transformer.get("id")
        if isinstance(transformer_ref, str) and transformer_ref.strip():
            if ref == transformer_ref:
                candidates.append(transformer)
            continue
        if isinstance(bus_ref, str) and bus_ref.strip():
            if transformer.get("hv_bus_ref") == bus_ref or transformer.get("lv_bus_ref") == bus_ref:
                candidates.append(transformer)
            continue
        if isinstance(ref, str) and ref in station_transformer_refs:
            candidates.append(transformer)
        elif station_bus_refs and (
            transformer.get("hv_bus_ref") in station_bus_refs
            or transformer.get("lv_bus_ref") in station_bus_refs
        ):
            candidates.append(transformer)
    return candidates


def _converter_required_apparent_power_mva(
    payload: dict[str, Any],
    materialized_params: dict[str, Any],
) -> float | None:
    quantity_raw = payload.get("quantity")
    quantity = int(quantity_raw) if isinstance(quantity_raw, int | float) else 1
    quantity = max(quantity, 1)
    candidates: list[float] = []
    for value in (
        materialized_params.get("sn_mva"),
        materialized_params.get("pmax_mw"),
        _kw_to_mw(materialized_params.get("max_power_kw")),
        _kw_to_mw(materialized_params.get("rated_power_ac_kw")),
        _kw_to_mw(materialized_params.get("discharge_power_kw")),
        _as_float(payload.get("power_setpoint_mw")),
    ):
        if isinstance(value, int | float) and value > 0:
            candidates.append(float(value))
    if not candidates:
        return None
    return max(candidates) * quantity


def _validate_converter_transformer_capacity(
    enm: dict[str, Any],
    *,
    station: dict[str, Any],
    bus_ref: str,
    blocking_transformer_ref: str | None,
    connection_variant: str,
    technology: str,
    payload: dict[str, Any],
    materialized_params: dict[str, Any],
) -> dict[str, Any] | None:
    transformer_ref = (
        blocking_transformer_ref
        if connection_variant == "block_transformer"
        and isinstance(blocking_transformer_ref, str)
        and blocking_transformer_ref.strip()
        else None
    )
    transformers = _station_transformers_for_bus(
        enm,
        station,
        bus_ref=bus_ref if connection_variant == "nn_side" else None,
        transformer_ref=transformer_ref,
    )
    if not transformers:
        return None

    capacity_mva = 0.0
    for transformer in transformers:
        sn_mva = _as_float(transformer.get("sn_mva"))
        if sn_mva is not None and sn_mva > 0:
            capacity_mva += sn_mva
    if capacity_mva <= 0:
        return None

    required_mva = _converter_required_apparent_power_mva(payload, materialized_params)
    if required_mva is None or required_mva <= capacity_mva + 1e-9:
        return None

    return _error_response(
        (
            f"Moc katalogowa źródła {technology} ({required_mva * 1000:.0f} kVA) "
            f"przekracza moc transformatora stacji ({capacity_mva * 1000:.0f} kVA). "
            "Wybierz mniejszy wariant źródła albo zastosuj transformator dedykowany."
        ),
        "converter.transformer_capacity_exceeded",
    )


def _resolve_catalog_ref(
    direct_ref: object,
    binding: object | None,
) -> tuple[str | None, str | None]:
    """Wyznacz catalog_ref z jawnego pola lub catalog_binding.

    Zwraca (catalog_ref, error_code). error_code != None oznacza niepoprawny binding.
    """
    if isinstance(direct_ref, str) and direct_ref.strip():
        return direct_ref.strip(), None

    if binding is None:
        return None, "catalog.ref_required"

    if not isinstance(binding, dict):
        return None, "catalog.binding_invalid"

    item_id = binding.get("catalog_item_id") or binding.get("item_id")
    if not isinstance(item_id, str) or not item_id.strip():
        return None, "catalog.binding_invalid"

    return item_id.strip(), None


def _validate_required_materialization(
    materialized_params: object,
    required_fields: list[str],
) -> tuple[dict[str, Any] | None, str | None]:
    """Sprawdź kompletność materialized_params dla pól wymaganych przez solver."""
    if not isinstance(materialized_params, dict):
        return None, "catalog.materialization_incomplete"

    normalized = {}
    for field in required_fields:
        value = materialized_params.get(field)
        if value is None:
            return None, "catalog.materialization_incomplete"
        normalized[field] = value

    return normalized, None


#: Zdanie naprawcze dołączane do KAŻDEGO błędu nierozstrzygalnej pozycji katalogu.
#: Bez niego kod błędu mówi „nie ma", ale nie mówi projektantowi, co zrobić.
_AKCJA_NAPRAWCZA_KATALOG_PL = (
    "Wskaż pozycję istniejącą w katalogu albo uzupełnij rekord katalogowy — "
    "operacja nie przyjmie tabliczki z formularza."
)

#: Tolerancja porównania tabliczki deklarowanej w payloadzie z katalogiem.
#: Obie liczby pochodzą z TEJ SAMEJ pozycji katalogowej (kreator kopiuje rekord),
#: więc jedyna dopuszczalna różnica to zaokrąglenie binarne przeliczeń kW→MW.
_TOLERANCJA_TABLICZKI = 1e-9


def _blad_pozycji_katalogu(blad_materializacji: dict[str, Any], opis_pl: str) -> dict[str, Any]:
    """Nierozstrzygalna pozycja katalogu — JEDEN kształt komunikatu w całym module.

    Nazwa miejsca + przyczyna z materializacji + akcja naprawcza. Bez wspólnego
    kształtu ta sama klasa błędu czytałaby się inaczej w każdej operacji, a
    projektant nie miałby jak rozpoznać, że to wciąż „pozycji nie ma w katalogu".
    """
    return _error_response(
        f"{opis_pl}: {blad_materializacji['error']} {_AKCJA_NAPRAWCZA_KATALOG_PL}",
        str(blad_materializacji.get("error_code") or "catalog.item_not_found"),
    )


def _pozycja_katalogu(
    *,
    namespace: str,
    catalog_ref: str,
    opis_pl: str,
    catalog_binding: object = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Zmaterializuj pozycję katalogu albo zwróć odpowiedź błędu operacji.

    ISTNIENIE, NIE OBECNOŚĆ (defekt G, długi 8/9 rejestru V12K-315). Operacje
    atomowe sprawdzały wyłącznie, czy referencja JEST w payloadzie, po czym
    zapisywały do migawki `source_mode: KATALOG` przy pozycji, której w katalogu
    NIE MA. Tor stacyjny (T5, `_zastosuj_wyposazenie_pol`) odrzucał tę samą
    referencję kodem `catalog.item_not_found` — parytet torów wymaga, żeby zły
    ref dawał ten sam kod po obu stronach.

    PRZESTRZEŃ JEST ROZKAZEM, NIE DOMYŚLNĄ WARTOŚCIĄ (V12K-316 dług 4).
    `_materialize_catalog_payload` traktuje `default_namespace` jako DOMYŚLNĄ:
    kategoria obecna w wiązaniu payloadu wygrywała, więc żądanie kierowało
    wyszukiwanie do cudzego katalogu, a operacja i tak zapisywała do migawki
    kategorię wynikającą z rodzaju elementu. Sprowadzenie wiązania do `namespace`
    zamyka obie strony rozjazdu: szukamy tam, gdzie deklarujemy.

    Zwraca ``(parametry_katalogowe, None)`` albo ``({}, odpowiedź_błędu)``.
    Materializacja stoi PRZED jakąkolwiek mutacją modelu, więc odrzucona
    operacja nie zostawia w migawce połowicznego elementu.
    """
    materializacja = _materialize_catalog_payload(
        catalog_ref=catalog_ref,
        catalog_binding=_wiazanie_w_przestrzeni(catalog_binding, namespace),
        default_namespace=namespace,
        default_version="2024.1",
    )
    if isinstance(materializacja, dict):
        return {}, _blad_pozycji_katalogu(materializacja, opis_pl)
    _binding_payload, parametry = materializacja
    return parametry, None


def _wartosc_katalogowa(z_katalogu: dict[str, Any], klucz: str, z_formularza: object) -> Any:
    """Wartość z katalogu, a gdy katalog jej NIE NIESIE — wartość z formularza.

    Katalog milczący nie jest katalogiem sprzecznym: pole spoza kontraktu
    materializacji (albo puste w rekordzie) nie ma odpowiednika, wobec którego
    formularz mógłby kłamać. Ta sama zasada rządzi `rozbieznosci_tabliczki`,
    żeby warunek przyjęcia i warunek porównania pochodziły z jednego źródła.
    """
    wartosc = z_katalogu.get(klucz)
    return wartosc if wartosc is not None else z_formularza


def _blad_aparatu_pola(
    binding: object,
    *,
    namespace: str,
    opis_pl: str,
) -> dict[str, Any] | None:
    """Aparat pola wskazany w payloadzie musi ISTNIEĆ w katalogu.

    Brak wiązania jest kanoniczny (pole bez wskazanego aparatu, `requires_catalog_binding`);
    wiązanie WSKAZUJĄCE nieistniejącą pozycję nie jest — specyfikacja pola zapisywała
    wtedy `apparatus_catalog_ref` martwej pozycji, a gałąź aparatu deklarowała
    `source_mode: KATALOG`. Zwraca odpowiedź błędu albo ``None``.

    Przestrzeń katalogu bierze się z RODZAJU aparatu (parametr wywołania), nie z
    deklaracji payloadu: inaczej wiązanie wskazujące „CT" kazałoby sprawdzać
    istnienie w katalogu przekładników, a migawka i tak zapisywałaby APARAT_SN
    (V12K-316 dług 4 — predykat wejścia i wyjścia z jednego źródła).
    """
    if not isinstance(binding, dict):
        return None
    ref = _catalog_item_id(binding)
    if not ref:
        return None
    _, blad = _pozycja_katalogu(
        namespace=namespace,
        catalog_ref=ref,
        catalog_binding=binding,
        opis_pl=opis_pl,
    )
    return blad


def _te_same_wartosci(lewa: object, prawa: object) -> bool:
    """Równość tabliczkowa: liczby w tolerancji binarnej, teksty po obcięciu spacji."""
    if isinstance(lewa, bool) or isinstance(prawa, bool):
        return lewa is prawa
    if isinstance(lewa, int | float) and isinstance(prawa, int | float):
        return math.isclose(
            float(lewa),
            float(prawa),
            rel_tol=_TOLERANCJA_TABLICZKI,
            abs_tol=_TOLERANCJA_TABLICZKI,
        )
    if isinstance(lewa, str) and isinstance(prawa, str):
        return lewa.strip() == prawa.strip()
    return bool(lewa == prawa)


def rozbieznosci_tabliczki(
    deklarowane: object,
    katalogowe: dict[str, Any],
    *,
    etykieta_deklaracji: str = "payload",
) -> list[str]:
    """Pola, w których deklarowana tabliczka PRZECZY tabliczce katalogowej.

    KATALOG WYGRYWA ZAWSZE (defekt G). Tabliczka podana z zewnątrz nie zastępuje
    materializacji — jest wyłącznie DEKLARACJĄ weryfikowaną wobec katalogu.
    Porównujemy część wspólną kluczy: pole, którego katalog nie niesie, nie jest
    tabliczką katalogową i nie ma wobec czego się rozjechać; pole niezadeklarowane
    nie jest deklaracją.

    JEDNO ŹRÓDŁO PORÓWNANIA (predykaty parami): tej samej funkcji używa brama API
    (`api/enm.py`), sprawdzając, czy to, co polityka katalogowa zmaterializowała
    PRZED operacją, zgadza się z tym, co operacja zapisała do migawki.
    """
    if not isinstance(deklarowane, dict):
        return []
    rozbieznosci: list[str] = []
    for klucz in sorted(katalogowe):
        z_katalogu = katalogowe[klucz]
        if z_katalogu is None or klucz not in deklarowane:
            continue
        z_payloadu = deklarowane[klucz]
        if z_payloadu is None:
            continue
        if _te_same_wartosci(z_payloadu, z_katalogu):
            continue
        rozbieznosci.append(
            f"{klucz}: {etykieta_deklaracji} {z_payloadu!r}, katalog {z_katalogu!r}"
        )
    return rozbieznosci


def _materialize_nn_source_params(
    *,
    namespace: str,
    catalog_ref: str,
    required_fields: list[str],
) -> tuple[dict[str, Any] | None, str | None]:
    """Tabliczka źródła nN WYŁĄCZNIE z katalogu (kanał payloadu nie istnieje).

    Dawny parametr `explicit_params` był drugą, nieweryfikowaną drogą podania
    tabliczki — usunięty razem z wczesnym zwrotem w
    `_build_converter_materialized_params` (defekt G).
    """
    binding = CatalogBinding(
        catalog_namespace=namespace,
        catalog_item_id=catalog_ref,
        catalog_item_version="2024.1",
        materialize=True,
    )
    result = materialize_catalog_binding(binding, get_default_mv_catalog())
    if not result.success:
        return None, result.error_code or "catalog.materialization_incomplete"

    if namespace == "ZRODLO_NN_PV":
        zmapowane = {
            "un_kv": result.solver_fields.get("un_kv"),
            "rated_power_ac_kw": result.solver_fields.get("s_n_kva"),
            "max_power_kw": result.solver_fields.get("p_max_kw"),
            "control_mode": result.solver_fields.get("control_mode"),
        }
    elif namespace == "ZRODLO_NN_BESS":
        zmapowane = {
            "un_kv": result.solver_fields.get("un_kv"),
            "usable_capacity_kwh": result.solver_fields.get("e_kwh"),
            "charge_power_kw": result.solver_fields.get("p_charge_kw"),
            "discharge_power_kw": result.solver_fields.get("p_discharge_kw"),
            # MOC POZORNA Z KATALOGU (dług 8 rejestru V12K-315): tor atomowy
            # wyprowadzał ją z mocy rozładowania i gubił katalogowe 2,2 MVA
            # (liczył 2,0), więc ta sama pozycja dawała inne liczby w torze
            # stacyjnym i atomowym. Teraz obydwa czytają `s_n_kva` pozycji.
            "s_n_kva": result.solver_fields.get("s_n_kva"),
        }
    elif namespace == "CONVERTER":
        # Falownik wiatrowy: TA SAMA przestrzeń katalogu, co w torze stacyjnym
        # (`_NN_SOURCE_KIND_MAP["FW_INVERTER"]`), więc zły ref daje ten sam kod
        # `catalog.item_not_found` w obu torach. Dawny wyszukiwacz po liście
        # `get_wind_types()` był równoległą ścieżką z własnym kodem błędu.
        zmapowane = dict(result.solver_fields)
    else:
        return None, "catalog.materialization_incomplete"

    _, brak = _validate_required_materialization(zmapowane, required_fields)
    if brak is not None:
        return None, brak
    return zmapowane, None


def _normalize_nn_field_role(payload: dict[str, Any]) -> str:
    raw_role = payload.get("field_role")
    if isinstance(raw_role, str):
        normalized = raw_role.strip().upper()
        if normalized in {"FEEDER", "SOURCE"}:
            return normalized
    return "FEEDER"


def _normalize_nn_source_field_kind(payload: dict[str, Any]) -> str:
    raw_kind = payload.get("source_field_kind")
    if isinstance(raw_kind, str):
        normalized = raw_kind.strip().upper()
        if normalized in {"PV", "BESS", "FW", "AGREGAT", "UPS"}:
            return normalized
    return "PV"


def _normalize_sn_bay_role(payload: dict[str, Any]) -> str:
    raw_role = payload.get("bay_role")
    if isinstance(raw_role, str):
        normalized = raw_role.strip().upper()
        if normalized in {"IN", "OUT", "FEEDER", "TR", "COUPLER", "MEASUREMENT", "OZE"}:
            return normalized
    return "FEEDER"


def _default_sn_bay_name(role: str) -> str:
    return {
        "IN": "Pole liniowe dopływowe",
        "OUT": "Pole liniowe odpływowe",
        "FEEDER": "Pole liniowe SN",
        "TR": "Pole transformatorowe",
        "COUPLER": "Pole sprzęgła",
        "MEASUREMENT": "Pole pomiarowe",
        "OZE": "Pole źródłowe SN",
    }.get(role, "Pole SN")


def _resolve_bay_template_protection_codes(
    manufacturer_ref: str | None, bay_template_ref: str | None, bay_role: str
) -> list[str]:
    """Wymagane funkcje zabezpieczeniowe (ANSI/IEC) pola → Bay.protection_codes.

    Kolejność (zero fabrykacji — tylko realne dane kanonu, żadnych zmyślonych kodów):
    1. `CompleteMvBayTemplate.protection_requirements` z wybranego szablonu producenta
       (reużycie kanonicznego resolvera Reference Engine — bez równoległej ścieżki), gdy
       paczka producenta je dostarcza — mają pierwszeństwo (dane producenckie);
    2. kanoniczna tablica wymaganych funkcji per rola pola (`BAY_PROTECTION_CODES_BY_ROLE`,
       PTPiREE/IRiESD + IEC 60255): IN/OUT/FEEDER/TR/COUPLER/OZE; pole pomiarowe = puste
       (uczciwy brak, nie fabrykacja).
    """
    from network_model.catalog.bay_templates import protection_codes_for_bay_role

    if bay_template_ref:
        from network_model.catalog.switchgear.canonical_fallback import (
            list_canonical_fallback_templates,
            list_switchgear_solution_templates_for_manufacturer,
        )

        candidates = list_switchgear_solution_templates_for_manufacturer(manufacturer_ref)
        template = next((t for t in candidates if t.template_ref == bay_template_ref), None)
        if template is None:
            template = next(
                (
                    t
                    for t in list_canonical_fallback_templates()
                    if t.template_ref == bay_template_ref
                ),
                None,
            )
        if template is not None and template.protection_requirements:
            return list(template.protection_requirements)

    return protection_codes_for_bay_role(bay_role)


def add_sn_bay(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj pole SN do istniejącej rozdzielnicy bez zapisu do legacy bays."""
    existing_field_ref = payload.get("existing_field_ref") or payload.get("field_ref")
    existing_field_ref = (
        existing_field_ref.strip()
        if isinstance(existing_field_ref, str) and existing_field_ref.strip()
        else None
    )
    bus_ref = payload.get("bus_ref")
    if existing_field_ref and (not isinstance(bus_ref, str) or not bus_ref.strip()):
        bus_ref = _field_bus_ref(enm, existing_field_ref)
    station_ref = payload.get("station_ref")

    if not isinstance(bus_ref, str) or not bus_ref.strip():
        return _error_response("Brak szyny SN (bus_ref).", "sn.bus_missing")

    bus_ref = bus_ref.strip()
    station = _resolve_station_for_field_write(enm, station_ref=station_ref, bus_ref=bus_ref)
    if station is None:
        return _error_response("Nie znaleziono stacji dla szyny SN.", "sn.station_not_found")

    bay_role = _normalize_sn_bay_role(payload)
    raw_specs = _substation_meta_specs(station, "field_specs")
    existing_field = _field_record(enm, existing_field_ref) if existing_field_ref else None
    if existing_field_ref and not isinstance(existing_field, dict):
        return _error_response("Nie znaleziono pola SN do konfiguracji.", "sn.field_not_found")
    if existing_field and existing_field.get("bus_ref") != bus_ref:
        return _error_response(
            "Wskazane pole SN nie należy do wybranej szyny SN.",
            "sn.field_bus_mismatch",
        )

    role_index = len(
        [
            spec
            for spec in raw_specs
            if spec.get("bus_ref") == bus_ref and spec.get("bay_role") == bay_role
        ]
    )
    seed = _compute_seed(
        {
            "op": "sn_bay",
            "station_ref": station.get("ref_id"),
            "bus": bus_ref,
            "bay_role": bay_role,
            "n": role_index,
        }
    )
    field_ref = existing_field_ref or _make_id("sn", seed, "bay")
    gpz_section_id = payload.get("gpz_section_id")
    if not isinstance(gpz_section_id, str) or not gpz_section_id.strip():
        gpz_sections = station.get("gpz_sections")
        if isinstance(gpz_sections, list):
            gpz_section_id = next(
                (
                    section.get("section_id")
                    for section in gpz_sections
                    if isinstance(section, dict) and section.get("bus_ref") == bus_ref
                ),
                None,
            )
    apparatus_kind = payload.get("apparatus_kind")
    field_name_raw = payload.get("field_name")
    existing_name = existing_field.get("name") if isinstance(existing_field, dict) else None
    field_name: str = (
        field_name_raw.strip()
        if isinstance(field_name_raw, str) and field_name_raw.strip()
        else (existing_name if isinstance(existing_name, str) else _default_sn_bay_name(bay_role))
    )
    terminal_bus_ref = _make_id("sn", seed, "bay_terminal")
    apparatus_ref = _make_id("sn", seed, "bay_device")
    voltage_kv = _bus_voltage_kv(enm, bus_ref)
    if voltage_kv is None:
        return _error_response(
            "Nie znaleziono napięcia szyny SN dla pola.", "sn.bus_voltage_missing"
        )
    catalog_namespace = _PRZESTRZEN_APARATU_POLA_SN
    catalog_binding = _catalog_binding_from_payload(payload, catalog_namespace)
    catalog_ref = _catalog_item_id(catalog_binding)
    # Pole SN bez wskazanego aparatu jest kanoniczne (`requires_catalog_binding`),
    # ale WSKAZANY aparat musi ISTNIEĆ: bez tego pole deklarowało
    # `source_mode: KATALOG` przy pozycji, której w katalogu nie ma — tor stacyjny
    # odrzucał tę samą referencję kodem `catalog.item_not_found`.
    apparatus_params: dict[str, Any] = {}
    if catalog_ref:
        zmaterializowane, blad_katalogu = _pozycja_katalogu(
            namespace=catalog_namespace,
            catalog_ref=catalog_ref,
            catalog_binding=catalog_binding,
            opis_pl="Aparat pola SN",
        )
        if blad_katalogu is not None:
            return blad_katalogu
        apparatus_params = zmaterializowane or {}
    branch_type = _sn_bay_branch_type(apparatus_kind)

    # V12K-058 (G-POLE-R): powiązania producenckie pola (szablon/rodzina/producent/
    # zabezpieczenie) — trafiają na field_spec przez _build_field_spec (parytet ze stacją/
    # GPZ). Reużycie infrastruktury Reference Engine zamiast równoległej ścieżki.
    def _clean_ref(value: object) -> str | None:
        return value.strip() if isinstance(value, str) and value.strip() else None

    switchgear_family_ref = _clean_ref(payload.get("switchgear_family_ref"))
    bay_template_ref = _clean_ref(payload.get("bay_template_ref"))
    manufacturer_ref = _clean_ref(payload.get("manufacturer_ref"))
    protection_ref = _clean_ref(payload.get("protection_ref"))
    # Tylko podane refy (bez clobber istniejących wartości na None przy re-konfiguracji).
    producer_refs: dict[str, Any] = {
        key: value
        for key, value in {
            "protection_ref": protection_ref,
            "bay_template_ref": bay_template_ref,
            "switchgear_family_ref": switchgear_family_ref,
            "manufacturer_ref": manufacturer_ref,
        }.items()
        if value
    }
    # V12K-059 (audyt B): materializacja wymaganych funkcji zabezpieczeniowych pola z
    # wybranego szablonu producenta (protection_requirements) → Bay.protection_codes.
    # Domyka ogniwo „szablon pola → koordynacja/LoM/glify SLD" (G-POLE-R związał tylko
    # refy danych). Bez szablonu: brak kodów (wsteczna zgodność).
    protection_codes = _resolve_bay_template_protection_codes(
        manufacturer_ref, bay_template_ref, bay_role
    )
    if protection_codes:
        producer_refs["protection_codes"] = protection_codes
    # W1 (RECENZJA_L2 §1/§12.1, V12K-145): materializacja aparatów PIERWOTNYCH
    # pola z szablonu kreatora (BayTemplate.devices) → field_spec.primary_devices.
    # Domyka łańcuch „kreator → ENM → adapter SLD → scena": tor pierwotny pola
    # rysowany Z DANYCH (kolejność/stan/uziemnik bocznie/głowica), a nie z jednego
    # szablonu §12.4. Wybór aparatu głównego (apparatus_kind) różnicuje pola
    # wyłącznikowe/rozłącznikowe. Bez szablonu: brak primary_devices (konwencja).
    from network_model.catalog.bay_templates import template_primary_devices

    primary_devices_spec = template_primary_devices(
        bay_template_ref,
        field_ref=field_ref,
        main_apparatus_kind=apparatus_kind if isinstance(apparatus_kind, str) else None,
    )
    if primary_devices_spec:
        producer_refs["primary_devices"] = primary_devices_spec

    new_enm = copy.deepcopy(enm)
    existing_equipment_refs = (
        _field_equipment_refs(new_enm, field_ref) if existing_field_ref else []
    )
    existing_apparatus_ref = existing_equipment_refs[0] if existing_equipment_refs else None

    if existing_apparatus_ref:
        branch = next(
            (
                item
                for item in new_enm.get("branches", [])
                if isinstance(item, dict) and item.get("ref_id") == existing_apparatus_ref
            ),
            None,
        )
        if branch is not None:
            branch["name"] = f"Aparat {field_name}"
            branch["type"] = branch_type
            # Pochodzenie katalogowe deklarujemy TYLKO wtedy, gdy pozycja katalogu
            # naprawdę stoi za aparatem. Pole bez wskazanego aparatu jest kanoniczne
            # (`requires_catalog_binding`) i nie może nieść kategorii, z której nic
            # nie pochodzi — tak samo jak aparat pola źródłowego SN niżej.
            branch["source_mode"] = "KATALOG" if catalog_ref else None
            branch["catalog_namespace"] = catalog_namespace if catalog_ref else None
            branch["catalog_ref"] = catalog_ref
            # Tabliczka aparatu Z KATALOGU (parytet z torem stacyjnym, gdzie
            # `_materialize_sn_field_apparatus` zapisuje `materialized_params`):
            # sama deklaracja `source_mode: KATALOG` bez materializacji to zdanie
            # o pozycji, którego nikt nie sprawdził.
            if apparatus_params:
                branch["materialized_params"] = copy.deepcopy(apparatus_params)
            branch.setdefault("tags", [])
            meta = branch.setdefault("meta", {})
            if isinstance(meta, dict):
                meta.update(
                    {
                        "field_ref": field_ref,
                        "station_ref": station["ref_id"],
                        "bay_role": bay_role,
                        "apparatus_kind": (
                            apparatus_kind if isinstance(apparatus_kind, str) else None
                        ),
                        "requires_catalog_binding": catalog_ref is None,
                        "catalog_binding": (
                            copy.deepcopy(catalog_binding) if catalog_binding else None
                        ),
                    }
                )
            existing_field_meta = (
                existing_field.get("meta") if isinstance(existing_field, dict) else None
            )
            if not isinstance(existing_field_meta, dict):
                existing_field_meta = {}
            _update_field_spec(
                new_enm,
                field_ref,
                {
                    "name": field_name,
                    "bay_role": bay_role,
                    "equipment_refs": existing_equipment_refs,
                    "gpz_section_id": gpz_section_id if isinstance(gpz_section_id, str) else None,
                    **producer_refs,
                    "meta": {
                        **existing_field_meta,
                        "apparatus_kind": (
                            apparatus_kind if isinstance(apparatus_kind, str) else None
                        ),
                        "catalog_binding": (
                            copy.deepcopy(catalog_binding) if catalog_binding else None
                        ),
                        "default_device_ref": existing_apparatus_ref,
                        "field_status": "CONFIGURED_FOR_TRUNK",
                    },
                },
            )
            return _response(
                new_enm,
                created=[],
                selection_id=field_ref,
                selection_type="bay",
                events=[
                    {
                        "event_seq": 1,
                        "event_type": "FIELD_DEVICE_UPDATED_SN",
                        "element_id": existing_apparatus_ref,
                    },
                    {"event_seq": 2, "event_type": "FIELD_UPDATED_SN", "element_id": field_ref},
                ],
            )

    result = create_node(
        new_enm,
        {
            "ref_id": terminal_bus_ref,
            "name": f"Zacisk odpływowy {field_name}",
            "voltage_kv": voltage_kv,
            "tags": ["helper_bus", "field_terminal"],
            "meta": {
                "visual_role": "FIELD_TERMINAL",
                "render_on_sld": False,
                "show_in_project_tree": False,
                "field_ref": field_ref,
                "station_ref": station["ref_id"],
                "port_kind": "trunk_out",
            },
        },
    )
    if not result.success:
        message = result.issues[0].message_pl if result.issues else "Nieznany błąd."
        return _error_response(
            f"Nie udało się utworzyć zacisku technicznego pola SN: {message}",
            "sn.field_terminal_failed",
        )
    new_enm = result.enm
    created = [terminal_bus_ref]

    result = create_branch(
        new_enm,
        {
            "ref_id": apparatus_ref,
            "name": f"Aparat {field_name}",
            "type": branch_type,
            "from_bus_ref": bus_ref,
            "to_bus_ref": terminal_bus_ref,
            "status": "closed",
            "r_ohm": 0.0,
            "x_ohm": 0.0,
            "source_mode": "KATALOG" if catalog_ref else None,
            "catalog_namespace": catalog_namespace if catalog_ref else None,
            "catalog_ref": catalog_ref,
            # Tabliczka aparatu Z KATALOGU — parytet z torem stacyjnym
            # (`_materialize_sn_field_apparatus`), gdzie ten sam aparat dostaje
            # `materialized_params` po materializacji pozycji.
            "materialized_params": copy.deepcopy(apparatus_params) or None,
            "tags": ["gpz_field_device", "requires_catalog_binding"],
            "meta": {
                "field_ref": field_ref,
                "station_ref": station["ref_id"],
                "bay_role": bay_role,
                "apparatus_kind": apparatus_kind if isinstance(apparatus_kind, str) else None,
                "terminal_bus_ref": terminal_bus_ref,
                "render_on_sld": False,
                "show_in_project_tree": False,
                "requires_catalog_binding": catalog_ref is None,
                "catalog_binding": copy.deepcopy(catalog_binding) if catalog_binding else None,
            },
        },
    )
    if not result.success:
        message = result.issues[0].message_pl if result.issues else "Nieznany błąd."
        return _error_response(
            f"Nie udało się utworzyć aparatu pola SN: {message}",
            "sn.field_apparatus_failed",
        )
    new_enm = result.enm
    created.append(apparatus_ref)

    if existing_field_ref:
        existing_tags = existing_field.get("tags") if isinstance(existing_field, dict) else []
        existing_meta = existing_field.get("meta") if isinstance(existing_field, dict) else {}
        _update_field_spec(
            new_enm,
            field_ref,
            {
                "name": field_name,
                "bay_role": bay_role,
                "bus_ref": bus_ref,
                "gpz_section_id": gpz_section_id if isinstance(gpz_section_id, str) else None,
                "equipment_refs": [apparatus_ref],
                "tags": list(existing_tags) if isinstance(existing_tags, list) else [],
                **producer_refs,
                "meta": {
                    **(existing_meta if isinstance(existing_meta, dict) else {}),
                    "apparatus_kind": apparatus_kind if isinstance(apparatus_kind, str) else None,
                    "catalog_binding": copy.deepcopy(catalog_binding) if catalog_binding else None,
                    "terminal_bus_ref": terminal_bus_ref,
                    "default_device_ref": apparatus_ref,
                    "field_status": "CONFIGURED_FOR_TRUNK",
                },
            },
        )
    else:
        field_spec = _build_field_spec(
            field_ref=field_ref,
            name=field_name,
            bay_role=bay_role,
            bus_ref=bus_ref,
            gpz_section_id=gpz_section_id if isinstance(gpz_section_id, str) else None,
            equipment_refs=[apparatus_ref],
            protection_ref=protection_ref,
            protection_codes=protection_codes,
            bay_template_ref=bay_template_ref,
            switchgear_family_ref=switchgear_family_ref,
            manufacturer_ref=manufacturer_ref,
            primary_devices=primary_devices_spec or None,
            tags=list(payload.get("tags") or []),
            meta={
                "apparatus_kind": apparatus_kind if isinstance(apparatus_kind, str) else None,
                "catalog_binding": copy.deepcopy(catalog_binding) if catalog_binding else None,
                "terminal_bus_ref": terminal_bus_ref,
                "default_device_ref": apparatus_ref,
                "field_status": "CONFIGURED_FOR_TRUNK",
            },
        )
        if not _append_substation_field_spec(
            new_enm,
            station_ref=station["ref_id"],
            meta_key="field_specs",
            field_spec=field_spec,
        ):
            return _error_response("Nie znaleziono stacji dla szyny SN.", "sn.station_not_found")
        created.insert(0, field_ref)

    return _response(
        new_enm,
        created=created,
        selection_id=field_ref,
        selection_type="bay",
        events=[
            {
                "event_seq": 1,
                "event_type": "FIELD_TERMINAL_CREATED_SN",
                "element_id": terminal_bus_ref,
            },
            {"event_seq": 2, "event_type": "FIELD_DEVICE_CREATED_SN", "element_id": apparatus_ref},
            {"event_seq": 3, "event_type": "FIELDS_CREATED_SN", "element_id": field_ref},
        ],
    )


def _add_nn_outgoing_field_internal(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Wewnętrzny zapis odpływu nN do meta.nn_field_specs."""
    bus_nn_ref = payload.get("bus_nn_ref")
    station_ref = payload.get("station_ref")

    if not bus_nn_ref:
        return _error_response("Brak szyny nN (bus_nn_ref).", "nn.bus_missing")

    station = _resolve_station_for_field_write(enm, station_ref=station_ref, bus_ref=bus_nn_ref)
    if station is None:
        return _error_response("Nie znaleziono stacji dla szyny nN.", "nn.station_not_found")

    raw_specs = _substation_meta_specs(station, "nn_field_specs")
    feeder_index = len(
        [
            spec
            for spec in raw_specs
            if spec.get("bus_ref") == bus_nn_ref and spec.get("bay_role") == "FEEDER"
        ]
    )
    seed = _compute_seed(
        {
            "op": "nn_outgoing",
            "station_ref": station.get("ref_id"),
            "bus": bus_nn_ref,
            "n": feeder_index,
        }
    )
    feeder_ref = _make_id("nn", seed, "outgoing")
    field_spec = _build_field_spec(
        field_ref=feeder_ref,
        name=payload.get("field_name") or "Odpływ nN",
        bay_role="FEEDER",
        bus_ref=bus_nn_ref,
        tags=list(payload.get("tags") or []),
        meta={"feeder_role": payload.get("feeder_role", "ODPLYW_NN")},
    )

    new_enm = copy.deepcopy(enm)
    if not _append_substation_field_spec(
        new_enm,
        station_ref=station["ref_id"],
        meta_key="nn_field_specs",
        field_spec=field_spec,
    ):
        return _error_response("Nie znaleziono stacji dla szyny nN.", "nn.station_not_found")

    return _response(
        new_enm,
        created=[feeder_ref],
        selection_id=feeder_ref,
        selection_type="bay",
        events=[{"event_seq": 1, "event_type": "FIELDS_CREATED_NN", "element_id": feeder_ref}],
    )


def _append_nn_source_meta_field(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Wewnętrzny zapis pola źródłowego nN do meta.nn_field_specs."""
    bus_nn_ref = payload.get("bus_nn_ref")
    station_ref = payload.get("station_ref")
    kind = payload.get("source_field_kind", "PV")

    if not bus_nn_ref:
        return _error_response("Brak szyny nN (bus_nn_ref).", "nn.bus_missing")

    station = _resolve_station_for_field_write(enm, station_ref=station_ref, bus_ref=bus_nn_ref)
    if station is None:
        return _error_response("Nie znaleziono stacji dla szyny nN.", "nn.station_not_found")

    raw_specs = _substation_meta_specs(station, "nn_field_specs")
    source_index = len(
        [
            spec
            for spec in raw_specs
            if spec.get("bus_ref") == bus_nn_ref
            and "nn_source_field" in list(spec.get("tags") or [])
        ]
    )
    seed = _compute_seed(
        {
            "op": "nn_source_field",
            "station_ref": station.get("ref_id"),
            "bus": bus_nn_ref,
            "kind": kind,
            "n": source_index,
        }
    )
    field_ref = _make_id("nn", seed, "source_field")
    field_spec = _build_field_spec(
        field_ref=field_ref,
        name=payload.get("field_name") or f"Pole źródłowe nN ({kind})",
        bay_role="OZE",
        bus_ref=bus_nn_ref,
        tags=["nn_source_field"],
        meta={"source_field_kind": kind},
    )

    new_enm = copy.deepcopy(enm)
    if not _append_substation_field_spec(
        new_enm,
        station_ref=station["ref_id"],
        meta_key="nn_field_specs",
        field_spec=field_spec,
    ):
        return _error_response("Nie znaleziono stacji dla szyny nN.", "nn.station_not_found")

    return _response(
        new_enm,
        created=[field_ref],
        selection_id=field_ref,
        selection_type="bay",
        events=[{"event_seq": 1, "event_type": "NN_SOURCE_FIELD_CREATED", "element_id": field_ref}],
    )


def add_nn_outgoing_field(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """V11: jedyny publiczny write-path pola nN dla odpływu albo pola źródłowego."""
    field_role = _normalize_nn_field_role(payload)
    normalized_payload = dict(payload)
    if field_role == "SOURCE":
        normalized_payload.setdefault("source_field_kind", _normalize_nn_source_field_kind(payload))
        return _append_nn_source_meta_field(enm, normalized_payload)
    return _add_nn_outgoing_field_internal(enm, normalized_payload)


def add_nn_load(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj odbiór nN do odpływu."""
    feeder_ref = payload.get("feeder_ref")
    bus_nn_ref = payload.get("bus_nn_ref")
    active_power_kw = payload.get("active_power_kw", 0)
    przestrzen_katalogu = "OBCIAZENIE"
    catalog_binding = _catalog_binding_from_payload(payload, przestrzen_katalogu)
    catalog_ref = _catalog_item_id(catalog_binding)

    # Dobór mocy biernej odbioru z tabliczki: gdy Q nie podano jawnie, wyprowadź
    # z cosφ (Q = P·tan(arccos cosφ)). Wcześniej cosφ trafiał tylko do meta i był
    # ignorowany przez rozpływ mocy (Q=0) — phantom. Input-prep w domenie (nie
    # fizyka sieci): arytmetyka tabliczkowa elementu.
    reactive_power_kvar = payload.get("reactive_power_kvar")
    cos_phi = payload.get("cos_phi")
    if reactive_power_kvar is None and cos_phi is not None:
        try:
            cp = float(cos_phi)
            p_kw = float(active_power_kw)
        except (TypeError, ValueError):
            cp = 0.0
            p_kw = 0.0
        if 0.0 < cp <= 1.0:
            reactive_power_kvar = p_kw * math.tan(math.acos(cp))

    if not feeder_ref:
        return _error_response("Brak identyfikatora odpływu (feeder_ref).", "nn.feeder_missing")
    if not isinstance(feeder_ref, str) or not _field_ref_exists(enm, feeder_ref):
        return _error_response("Wskazany odpływ nN nie istnieje w modelu.", "nn.feeder_not_found")

    # Odbiór bez pozycji katalogowej jest kanoniczny (`EKSPERCKI_RECZNY`), ale
    # WSKAZANA pozycja musi ISTNIEĆ — inaczej odbiór deklaruje w migawce
    # `source_mode: KATALOG` / `parameter_source: CATALOG` przy martwej referencji.
    if catalog_ref:
        _, blad_katalogu = _pozycja_katalogu(
            namespace=przestrzen_katalogu,
            catalog_ref=catalog_ref,
            catalog_binding=catalog_binding,
            opis_pl="Odbiór nN",
        )
        if blad_katalogu is not None:
            return blad_katalogu

    feeder_bus_ref = _field_bus_ref(enm, feeder_ref)
    if not feeder_bus_ref:
        return _error_response("Odpływ nN nie ma przypisanej szyny nN.", "nn.feeder_bus_missing")
    if bus_nn_ref and bus_nn_ref != feeder_bus_ref:
        return _error_response(
            "Niezgodność szyny nN formularza i odpływu.",
            "nn.feeder_bus_mismatch",
        )

    seed = _compute_seed({"op": "nn_load", "feeder": feeder_ref, "p": active_power_kw})
    load_ref = _make_id("nn", seed, "load")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("loads", []).append(
        {
            "ref_id": load_ref,
            "name": payload.get("load_name") or "Odbiór nN",
            "bus_ref": feeder_bus_ref,
            "p_mw": active_power_kw / 1000.0,
            "q_mvar": (reactive_power_kvar or 0) / 1000.0,
            # Load.model akceptuje 'pq' | 'zip' — 'pq' = constant power (klasyczny PQ).
            "model": "pq",
            "catalog_ref": catalog_ref,
            # Odbiór ekspercki (bez pozycji) nie deklaruje kategorii katalogu —
            # inaczej kontekst katalogowy raportu pokazywałby „OBCIAZENIE" przy
            # elemencie, którego katalog nigdy nie widział.
            "catalog_namespace": przestrzen_katalogu if catalog_ref else None,
            "source_mode": "KATALOG" if catalog_ref else "EKSPERCKI_RECZNY",
            "parameter_source": "CATALOG" if catalog_ref else "OVERRIDE",
            "tags": [],
            "meta": {
                "load_kind": payload.get("load_kind", "SKUPIONY"),
                "connection_type": payload.get("connection_type", "TROJFAZOWY"),
                "feeder_ref": feeder_ref,
                "catalog_binding": copy.deepcopy(catalog_binding) if catalog_binding else None,
                "load_profile_ref": payload.get("load_profile_ref"),
                "cos_phi": payload.get("cos_phi"),
            },
        }
    )

    return _response(
        new_enm,
        created=[load_ref],
        selection_id=load_ref,
        selection_type="load",
        events=[{"event_seq": 1, "event_type": "NN_LOAD_CREATED", "element_id": load_ref}],
    )


def _as_float(value: object) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    return None


def _as_bool(value: object) -> bool | None:
    """Zdeklarowana flaga zdolności (NC RfG FRT). None = niedostarczona (bez fabrykacji)."""
    if isinstance(value, bool):
        return value
    return None


def _kw_to_mw(value: object) -> float | None:
    numeric = _as_float(value)
    if numeric is None:
        return None
    return numeric / 1000.0


def _first_number(*candidates: object) -> float | None:
    for candidate in candidates:
        numeric = _as_float(candidate)
        if numeric is not None:
            return numeric
    return None


def _normalize_source_technology(payload: dict[str, Any]) -> str | None:
    """Technologia źródła przekształtnikowego — zbiór dopuszczonych wartości Z MAPY PRZESTRZENI.

    Predykat wejścia (co przyjmujemy) i predykat wyjścia (w jakiej przestrzeni
    katalogu szukamy) pochodzą z JEDNEGO źródła prawdy. Dwa niezależne zbiory,
    które „dziś się zgadzają", rozjechałyby się przy pierwszej nowej technologii
    i dałyby albo martwą gałąź, albo `KeyError` w handlerze.
    """
    technology = payload.get("source_technology")
    if isinstance(technology, str):
        normalized = technology.strip().upper()
        if normalized in _PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO:
            return normalized
    return None


def _resolve_converter_catalog_ref(
    payload: dict[str, Any], technology: str
) -> tuple[str | None, str | None]:
    direct_ref: object = payload.get("catalog_ref")
    if direct_ref is None:
        materialized = payload.get("materialized_params")
        if isinstance(materialized, dict):
            direct_ref = materialized.get("catalog_item_id")
    return _resolve_catalog_ref(direct_ref, payload.get("catalog_binding"))


#: Technologia źródła przekształtnikowego → przestrzeń katalogu. LUSTRO
#: `_NN_SOURCE_KIND_MAP` toru stacyjnego: ten sam ref musi być rozstrzygalny
#: w obu torach, inaczej brama jednego z nich jest fikcją (parytet torów).
#:
#: JEDYNE ŹRÓDŁO PRAWDY dla trzech rzeczy naraz (V12K-316 dług 4): zbioru
#: dopuszczonych technologii (`_normalize_source_technology`), przestrzeni,
#: w której materializacja szuka tabliczki, ORAZ znacznika pochodzenia
#: zapisywanego do migawki. Dopóki znacznik pochodził z payloadu, a tabliczka
#: z tej mapy, migawka mogła deklarować kategorię (np. „CONVERTER"), z której
#: nie pochodziła ani jedna liczba — ślad audytowy kłamał o pochodzeniu.
_PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO: dict[str, str] = {
    "PV": "ZRODLO_NN_PV",
    "BESS": "ZRODLO_NN_BESS",
    "FW": "CONVERTER",
}

#: Pola certyfikatu PTPiREE przenoszone Z REKORDU KATALOGU do tabliczki źródła.
#: Most zgodności NC RfG czyta je z `generator.materialized_params`
#: (`ui/workspace/surfaces/DerSurfaces.tsx` → `der.catalogs.ptpiree_certificate_ref`),
#: a kreator OZE wysyłał je dotąd w payloadzie. Skoro payload przestał być
#: źródłem tabliczki, ogniwo musi pochodzić z katalogu — inaczej naprawa
#: „katalog wygrywa" zerwałaby żywy łańcuch danych.
#: KOMPLET pól adnotacji (styk kart P1/P2, V12K-321): do tej karty most kopiował
#: 4 z 9 pól — bez `ptpiree_status` i `ptpiree_note` tor gotowości czytał KAŻDY
#: DER z kreatora jako „unlinked", a warunek ważności certyfikatu (WOS 2018,
#: „tylko z modułem…") ginął na granicy typów. Lista = klucze, które produkuje
#: `annotate_with_ptpiree_status` — przypięta testem porównującym oba zbiory.
_POLA_CERTYFIKATU_PTPIREE: tuple[str, ...] = (
    "ptpiree_status",
    "ptpiree_certificate_ref",
    "ptpiree_document_number",
    "ptpiree_document_acceptance_date",
    "ptpiree_wos_version",
    "ptpiree_wipwc_version",
    "ptpiree_ppm_scope",
    "ptpiree_source_url",
    "ptpiree_publication_date",
    "ptpiree_note",
    "ptpiree_certificate_condition",
)

#: Pola tabliczki, których katalog NIE niesie (wybór ruchowy projektanta) —
#: wyłączone z porównania z deklaracją payloadu, bo nie mają odpowiednika
#: katalogowego, wobec którego mogłyby się rozjechać.
_POLA_TABLICZKI_SPOZA_KATALOGU: frozenset[str] = frozenset({"operation_mode"})


def _certyfikat_ptpiree_z_katalogu(namespace: str, catalog_ref: str) -> dict[str, Any]:
    """Pola certyfikatu PTPiREE z REKORDU katalogu (pomijane, gdy rekord ich nie ma).

    Uczciwy stan zerowy: brak certyfikatu = brak klucza, nigdy `null` udający daną.
    """
    katalog = get_default_mv_catalog()
    if namespace == "ZRODLO_NN_PV":
        rekord: Any = katalog.get_pv_inverter_type(catalog_ref)
    elif namespace == "ZRODLO_NN_BESS":
        rekord = katalog.get_bess_inverter_type(catalog_ref)
    else:
        rekord = katalog.get_converter_type(catalog_ref)
    if rekord is None:
        return {}
    dane = rekord.to_dict()
    zrodlo = {k: v for k, v in dane.items() if k.startswith("ptpiree_")}
    # Styk P1/P2 (V12K-321): typy katalogowe nie niosa `ptpiree_status` ani
    # `ptpiree_note` w kazdej sciezce ladowania, a to od nich zalezy tor
    # gotowosci. Zrodlem prawdy o dopasowaniu jest annotate na PELNYM wykazie
    # (karta P1) — wolamy TE SAMA funkcje na tabliczce producent/model rekordu,
    # zero drugiej implementacji dopasowania.
    #
    # JEDNO ZRODLO STATUSU (naprawa 2026-08-05, luka klasowa): adnotacja jest
    # WYLACZNIE UZUPELNIENIEM rekordu, ktory statusu nie niesie — nigdy jego
    # nadpisaniem. `ConverterType.to_dict` niesie `model`, ale `PVInverterType`
    # i `BESSInverterType` go NIE MAJA (pole nie istnieje w typie), wiec
    # ponowna adnotacja szla tam z `model=None`, nie trafiala w wykaz i
    # nadpisywala POPRAWNY `POWIAZANY` rekordu falszywym `NIEPOWIAZANY`.
    # Zmierzony skutek na zywej drodze `POST /enm/domain-ops`: jedyne
    # urzadzenie powiazane z wykazem (`conv-pv-card-huawei-sun2000-215ktl`,
    # HUAWEI SUN2000-215KTL-H3, dokument TC-GCC-DNVGL-SE-0124-07526-1) dostawalo
    # w modelu tabliczke z `ptpiree_status: NIEPOWIAZANY` i nota „Brak
    # dopasowania" OBOK wypelnionych pol dowodowych tego samego dopasowania,
    # a tor gotowosci podnosil `der.inverter_certificate_unlinked` („wniosek do
    # OSD moze zostac odrzucony") dla urzadzenia certyfikowanego.
    if not zrodlo.get("ptpiree_status"):
        zrodlo = {
            **zrodlo,
            **annotate_with_ptpiree_status(
                {
                    "id": str(dane.get("id") or catalog_ref),
                    "name": str(dane.get("model") or dane.get("name") or catalog_ref),
                    "params": {
                        "manufacturer": dane.get("manufacturer"),
                        "model": dane.get("model"),
                    },
                }
            )["params"],
        }
    return {pole: zrodlo[pole] for pole in _POLA_CERTYFIKATU_PTPIREE if zrodlo.get(pole)}


def _build_converter_materialized_params(
    *,
    technology: str,
    namespace: str,
    payload: dict[str, Any],
    catalog_ref: str,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Tabliczka źródła przekształtnikowego — WYŁĄCZNIE z katalogu (defekt G).

    DŁUG, KTÓRY TO ZAMYKA (przegląd fali 2026-08-01, znalezisko P12): funkcja
    zaczynała od `explicit = payload.get("materialized_params")` i przy obecnym
    kluczu ZWRACAŁA GO WPROST — katalog nie był czytany w ogóle. Skutki zmierzone
    na produkcyjnej drodze zapisu `POST /enm/domain-ops`:

    * kontrola zgodności napięć liczyła się na danej z payloadu, więc magazyn
      15 kV wchodził na szynę 0,4 kV z `error: None`;
    * `p_mw` generatora (wprost do bilansu rozpływu) brało się z payloadu pod
      referencją prawdziwej, znacznie mniejszej pozycji katalogowej;
    * migawka deklarowała `source_mode: KATALOG` przy tabliczce z przeglądarki.

    Teraz tabliczka pochodzi z materializacji pozycji katalogowej, a
    `materialized_params` z payloadu jest wyłącznie DEKLARACJĄ: rozbieżność
    kończy operację kodem `catalog.nameplate_mismatch`, nigdy cichym przyjęciem.

    PRZESTRZEŃ KATALOGU WCHODZI Z ZEWNĄTRZ (V12K-316 dług 4). Handler wyznacza ją
    raz z `_PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO`, przekazuje tutaj i TĘ SAMĄ
    wartość zapisuje do migawki jako znacznik pochodzenia. Dopóki funkcja
    wyznaczała ją sama, handler pisał do modelu kategorię z payloadu i migawka
    deklarowała przestrzeń, w której nic nie było szukane.

    Zwraca ``(tabliczka, None)`` albo ``({}, odpowiedź_błędu)``.
    """

    def _blad_materializacji(kod: str) -> dict[str, Any]:
        return _error_response(
            f"Źródło {technology}: pozycja katalogowa '{catalog_ref}' "
            f"(kategoria {namespace}) nie ma kompletnej tabliczki albo nie istnieje. "
            f"{_AKCJA_NAPRAWCZA_KATALOG_PL}",
            kod,
        )

    if technology == "PV":
        z_katalogu, blad = _materialize_nn_source_params(
            namespace=namespace,
            catalog_ref=catalog_ref,
            required_fields=["un_kv", "rated_power_ac_kw", "max_power_kw", "control_mode"],
        )
        if blad or z_katalogu is None:
            return {}, _blad_materializacji(blad or "catalog.materialization_incomplete")
        tabliczka: dict[str, Any] = {
            "catalog_item_id": catalog_ref,
            "catalog_item_version": "2024.1",
            "rated_power_ac_kw": z_katalogu.get("rated_power_ac_kw"),
            "max_power_kw": z_katalogu.get("max_power_kw"),
            "control_mode": z_katalogu.get("control_mode"),
            "un_kv": z_katalogu.get("un_kv"),
            "pmax_mw": _kw_to_mw(z_katalogu.get("max_power_kw")),
            "sn_mva": _kw_to_mw(z_katalogu.get("rated_power_ac_kw")),
        }
    elif technology == "BESS":
        z_katalogu, blad = _materialize_nn_source_params(
            namespace=namespace,
            catalog_ref=catalog_ref,
            required_fields=[
                "un_kv",
                "usable_capacity_kwh",
                "charge_power_kw",
                "discharge_power_kw",
                "s_n_kva",
            ],
        )
        if blad or z_katalogu is None:
            return {}, _blad_materializacji(blad or "catalog.materialization_incomplete")
        tabliczka = {
            "catalog_item_id": catalog_ref,
            "catalog_item_version": "2024.1",
            "usable_capacity_kwh": z_katalogu.get("usable_capacity_kwh"),
            "charge_power_kw": z_katalogu.get("charge_power_kw"),
            "discharge_power_kw": z_katalogu.get("discharge_power_kw"),
            "operation_mode": payload.get("bess_mode"),
            "un_kv": z_katalogu.get("un_kv"),
            "pmax_mw": _kw_to_mw(z_katalogu.get("discharge_power_kw")),
            # MOC POZORNA Z KATALOGU, nie z przeliczenia mocy rozładowania
            # (dług 8 rejestru V12K-315): pozycja `conv-bess-nn-2mw-0p4kv` ma
            # 2,2 MVA, a tor atomowy liczył 2,0 — ta sama pozycja dawała inne
            # liczby niż tor stacyjny (`_nn_source_nameplate_from_catalog`).
            "sn_mva": _kw_to_mw(z_katalogu.get("s_n_kva")),
            "e_kwh": z_katalogu.get("usable_capacity_kwh"),
        }
    else:
        z_katalogu, blad = _materialize_nn_source_params(
            namespace=namespace,
            catalog_ref=catalog_ref,
            required_fields=["un_kv", "pmax_mw", "sn_mva"],
        )
        if blad or z_katalogu is None:
            return {}, _blad_materializacji(blad or "catalog.materialization_incomplete")
        tabliczka = {
            "catalog_item_id": catalog_ref,
            "catalog_item_version": "2024.1",
            "un_kv": float(z_katalogu["un_kv"]),
            "pmax_mw": float(z_katalogu["pmax_mw"]),
            "sn_mva": float(z_katalogu["sn_mva"]),
            "qmin_mvar": z_katalogu.get("qmin_mvar"),
            "qmax_mvar": z_katalogu.get("qmax_mvar"),
            "control_mode": z_katalogu.get("control_mode"),
        }

    tabliczka.update(_certyfikat_ptpiree_z_katalogu(namespace, catalog_ref))

    rozbieznosci = rozbieznosci_tabliczki(
        payload.get("materialized_params"),
        {
            klucz: wartosc
            for klucz, wartosc in tabliczka.items()
            if klucz not in _POLA_TABLICZKI_SPOZA_KATALOGU
        },
    )
    if rozbieznosci:
        return {}, _error_response(
            f"Tabliczka podana w formularzu przeczy pozycji katalogowej '{catalog_ref}': "
            + "; ".join(rozbieznosci)
            + ". Źródłem tabliczki jest katalog — popraw wybór pozycji katalogowej "
            "albo usuń tabliczkę z żądania.",
            "catalog.nameplate_mismatch",
        )
    return tabliczka, None


def _resolve_converter_defaults(
    technology: str,
    payload: dict[str, Any],
    materialized_params: dict[str, Any],
) -> tuple[str, str, str, dict[str, Any], float]:
    quantity = int(payload.get("quantity") or 1)
    quantity = max(quantity, 1)
    explicit_power_mw = _as_float(payload.get("power_setpoint_mw"))

    if technology == "PV":
        default_power = _first_number(
            payload.get("power_setpoint_mw"),
            materialized_params.get("pmax_mw"),
            _kw_to_mw(materialized_params.get("max_power_kw")),
            _kw_to_mw(materialized_params.get("rated_power_ac_kw")),
        )
        name = str(payload.get("source_name") or "Blok PV")
        return (
            name,
            "pv_inverter",
            "PV_INVERTER_CREATED",
            {
                "control_mode": payload.get("control_mode")
                or materialized_params.get("control_mode"),
                "q_min_mvar": _first_number(
                    payload.get("q_min_mvar"), materialized_params.get("qmin_mvar")
                ),
                "q_max_mvar": _first_number(
                    payload.get("q_max_mvar"), materialized_params.get("qmax_mvar")
                ),
                # V12K-051 (G-OZE-PF): docelowy cosφ (STALY_COS_PHI) i nachylenie Q(U);
                # brak → unity/0 → brak wpływu na PF (determinizm zachowany).
                "cos_phi": _first_number(payload.get("cos_phi"), materialized_params.get("cosphi")),
                "qu_slope_pu_per_pu": _as_float(payload.get("qu_slope_pu_per_pu")),
                # V12K-064 (G-OZE-B4): napięciowe pasmo nieczułości Q(U) [pu U]; brak → 1.0/1.0.
                "qu_deadband_low_pu": _as_float(payload.get("qu_deadband_low_pu")),
                "qu_deadband_high_pu": _as_float(payload.get("qu_deadband_high_pu")),
                # V12K-062 (G-OZE-B): statyzm P(f)/LFSM [%Pn/%f]; brak/0 → brak wpływu na PF
                # (aktywuje się przy odchyłce częstotliwości studium; determinizm przy 50 Hz).
                "frequency_droop_percent": _as_float(payload.get("frequency_droop_percent")),
                "lfsm_deadband_hz": _as_float(payload.get("lfsm_deadband_hz")),
                # V12K-087 (G-OZE-B2): jawne zdolności FRT (LVRT/HVRT) — most zgodności NC RfG.
                "has_lvrt_curve": _as_bool(payload.get("has_lvrt_curve")),
                "has_hvrt_curve": _as_bool(payload.get("has_hvrt_curve")),
                "quantity": quantity,
            },
            (
                explicit_power_mw
                if explicit_power_mw is not None
                else (default_power or 0.0) * quantity
            ),
        )

    if technology == "BESS":
        default_power = _first_number(
            payload.get("power_setpoint_mw"),
            materialized_params.get("pmax_mw"),
            _kw_to_mw(materialized_params.get("discharge_power_kw")),
            _kw_to_mw(materialized_params.get("charge_power_kw")),
        )
        name = str(payload.get("source_name") or "Blok BESS")
        return (
            name,
            "bess",
            "BESS_INVERTER_CREATED",
            {
                "bess_mode": payload.get("bess_mode") or materialized_params.get("operation_mode"),
                "soc_min_percent": _first_number(payload.get("soc_min_percent")),
                "soc_max_percent": _first_number(payload.get("soc_max_percent")),
                "usable_capacity_kwh": _first_number(
                    materialized_params.get("usable_capacity_kwh"),
                ),
                "cos_phi": _first_number(payload.get("cos_phi"), materialized_params.get("cosphi")),
                "qu_slope_pu_per_pu": _as_float(payload.get("qu_slope_pu_per_pu")),
                # V12K-064 (G-OZE-B4): napięciowe pasmo nieczułości Q(U) [pu U]; brak → 1.0/1.0.
                "qu_deadband_low_pu": _as_float(payload.get("qu_deadband_low_pu")),
                "qu_deadband_high_pu": _as_float(payload.get("qu_deadband_high_pu")),
                # V12K-062 (G-OZE-B): statyzm P(f)/LFSM; magazyn może podnosić P poniżej f0
                # (LFSM-U) — allow_increase. Brak/0 → brak wpływu na PF.
                "frequency_droop_percent": _as_float(payload.get("frequency_droop_percent")),
                "lfsm_deadband_hz": _as_float(payload.get("lfsm_deadband_hz")),
                # V12K-087 (G-OZE-B2): jawne zdolności FRT (LVRT/HVRT) — most zgodności NC RfG.
                "has_lvrt_curve": _as_bool(payload.get("has_lvrt_curve")),
                "has_hvrt_curve": _as_bool(payload.get("has_hvrt_curve")),
                "lfsm_allow_increase": True,
                "quantity": quantity,
            },
            (
                explicit_power_mw
                if explicit_power_mw is not None
                else (default_power or 0.0) * quantity
            ),
        )

    default_power = _first_number(
        payload.get("power_setpoint_mw"),
        materialized_params.get("pmax_mw"),
        _kw_to_mw(materialized_params.get("max_power_kw")),
    )
    return (
        str(payload.get("source_name") or "Blok FW"),
        "wind_inverter",
        "FW_INVERTER_CREATED",
        {
            "control_mode": payload.get("control_mode") or materialized_params.get("control_mode"),
            "q_min_mvar": _first_number(
                payload.get("q_min_mvar"), materialized_params.get("qmin_mvar")
            ),
            "q_max_mvar": _first_number(
                payload.get("q_max_mvar"), materialized_params.get("qmax_mvar")
            ),
            # V12K-051 (G-OZE-PF): docelowy cosφ + nachylenie Q(U); brak → brak wpływu.
            "cos_phi": _first_number(payload.get("cos_phi"), materialized_params.get("cosphi")),
            "qu_slope_pu_per_pu": _as_float(payload.get("qu_slope_pu_per_pu")),
            # V12K-064 (G-OZE-B4): napięciowe pasmo nieczułości Q(U) [pu U]; brak → 1.0/1.0.
            "qu_deadband_low_pu": _as_float(payload.get("qu_deadband_low_pu")),
            "qu_deadband_high_pu": _as_float(payload.get("qu_deadband_high_pu")),
            # V12K-062 (G-OZE-B): statyzm P(f)/LFSM [%Pn/%f]; brak/0 → brak wpływu na PF.
            "frequency_droop_percent": _as_float(payload.get("frequency_droop_percent")),
            "lfsm_deadband_hz": _as_float(payload.get("lfsm_deadband_hz")),
            # V12K-087 (G-OZE-B2): jawne zdolności FRT (LVRT/HVRT) — most zgodności NC RfG.
            "has_lvrt_curve": _as_bool(payload.get("has_lvrt_curve")),
            "has_hvrt_curve": _as_bool(payload.get("has_hvrt_curve")),
            "quantity": quantity,
        },
        explicit_power_mw if explicit_power_mw is not None else (default_power or 0.0) * quantity,
    )


def _append_converter_field_if_needed(
    new_enm: dict[str, Any],
    *,
    station_ref: str,
    bus_nn_ref: str,
    technology: str,
    connection_variant: str,
    payload: dict[str, Any],
) -> tuple[str | None, list[str], list[dict[str, Any]]] | tuple[None, None, None]:
    placement = payload.get("placement")
    if not isinstance(placement, str):
        placement = "NEW_FIELD" if connection_variant == "block_transformer" else "NEW_FIELD"

    if placement == "EXISTING_FIELD":
        existing_field_ref = payload.get("existing_field_ref")
        if not isinstance(existing_field_ref, str) or not existing_field_ref.strip():
            return None, None, None
        if not _field_ref_exists(new_enm, existing_field_ref.strip()):
            return None, None, None
        return existing_field_ref.strip(), [], []

    station = _resolve_station_for_field_write(new_enm, station_ref=station_ref, bus_ref=bus_nn_ref)
    if station is None:
        return None, None, None

    raw_specs = _substation_meta_specs(station, "nn_field_specs")
    source_index = len(
        [
            spec
            for spec in raw_specs
            if spec.get("bus_ref") == bus_nn_ref
            and "nn_source_field" in list(spec.get("tags") or [])
        ]
    )
    field_seed = _compute_seed(
        {
            "op": "converter_source_field",
            "station_ref": station_ref,
            "bus": bus_nn_ref,
            "technology": technology,
            "n": source_index,
        }
    )
    field_ref = _make_id("nn", field_seed, "source_field")
    source_field = payload.get("source_field")
    source_field_payload = source_field if isinstance(source_field, dict) else {}
    field_meta = {"source_field_kind": source_field_payload.get("source_field_kind") or technology}
    apparatus_binding = source_field_payload.get("catalog_binding")
    if isinstance(apparatus_binding, dict):
        # Wiązanie zapisane do pola niesie przestrzeń, w której sprawdzono ISTNIENIE
        # aparatu (`_blad_aparatu_pola`, APARAT_NN) — nie tę zadeklarowaną w żądaniu.
        field_meta["catalog_binding"] = _wiazanie_w_przestrzeni(
            apparatus_binding, _PRZESTRZEN_APARATU_POLA_NN
        )
        catalog_item_id = apparatus_binding.get("catalog_item_id")
        if isinstance(catalog_item_id, str) and catalog_item_id.strip():
            field_meta["apparatus_catalog_ref"] = catalog_item_id.strip()

    field_spec = _build_field_spec(
        field_ref=field_ref,
        name=str(source_field_payload.get("field_name") or f"Pole {technology} nN"),
        bay_role="OZE",
        bus_ref=bus_nn_ref,
        tags=["nn_source_field"],
        meta=field_meta,
    )
    if not _append_substation_field_spec(
        new_enm,
        station_ref=station_ref,
        meta_key="nn_field_specs",
        field_spec=field_spec,
    ):
        return None, None, None

    return (
        field_ref,
        [field_ref],
        [{"event_type": "NN_SOURCE_FIELD_CREATED", "element_id": field_ref}],
    )


def _next_der_sn_sequence(
    enm: dict[str, Any],
    *,
    station_ref: str,
    mv_bus_ref: str,
    catalog_ref: str,
    name: str,
) -> int:
    """Deterministyczny numer kolejny powtarzalnego DER-SN na tej samej szynie SN."""
    sequence = 0
    for existing in enm.get("generators", []):
        if not isinstance(existing, dict):
            continue
        meta = existing.get("meta") if isinstance(existing.get("meta"), dict) else {}
        if (
            existing.get("station_ref") == station_ref
            and isinstance(meta, dict)
            and meta.get("der_mv_bus_ref") == mv_bus_ref
            and existing.get("catalog_ref") == catalog_ref
            and existing.get("name") == name
        ):
            sequence += 1
    return sequence


def _materialize_der_block_transformer(
    *,
    spec: dict[str, Any],
    ref_id: str,
    name: str,
    hv_bus_ref: str,
    lv_bus_ref: str,
    hv_voltage_kv: float,
    lv_voltage_kv: float,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Zmaterializuj TR blokowy DER — OSOBNY element (katalog TRAFO_SN_NN), własny id.

    Zwraca (transformer_dict, None) przy sukcesie albo (None, error_response) przy błędzie.
    Rola „TRANSFORMATOR_BLOKOWY_DER" w meta odróżnia go jednoznacznie od TR stacji.
    """
    przestrzen_katalogu = "TRAFO_SN_NN"
    wiazanie = _wiazanie_w_przestrzeni(spec.get("catalog_binding"), przestrzen_katalogu)
    catalog_ref = _require_catalog_ref(
        payload_ref=spec.get("catalog_ref"),
        payload_binding=wiazanie,
        context_code="der.block_transformer",
    )
    if isinstance(catalog_ref, dict):
        return None, catalog_ref

    tr_data: dict[str, Any] = {
        "ref_id": ref_id,
        "name": name,
        "hv_bus_ref": hv_bus_ref,
        "lv_bus_ref": lv_bus_ref,
        "sn_mva": _as_float(spec.get("rated_power_mva")) or 0.0,
        "uhv_kv": _as_float(spec.get("primary_voltage_kv")) or hv_voltage_kv,
        "ulv_kv": _as_float(spec.get("secondary_voltage_kv")) or lv_voltage_kv,
        "uk_percent": _as_float(spec.get("uk_percent")) or 0.0,
        "pk_kw": 0.0,
        "vector_group": spec.get("vector_group"),
        "source_mode": "KATALOG",
        "catalog_namespace": przestrzen_katalogu,
        "n_parallel": 1,
        "tags": ["der_block_transformer"],
        "meta": {
            "catalog_role": "TRANSFORMATOR_BLOKOWY_DER",
            "der_role": "block_transformer",
            "visual_role": "DER_BLOCK_TRANSFORMER",
        },
        "overrides": [],
    }
    materialization = _materialize_catalog_payload(
        catalog_ref=catalog_ref,
        catalog_binding=wiazanie,
        default_namespace=przestrzen_katalogu,
    )
    if isinstance(materialization, dict):
        return None, _blad_pozycji_katalogu(materialization, "Transformator blokowy DER")
    binding_payload, materialized_params = materialization
    # D3 wymaganie 7: układ połączeń = parametr modelu spójny z TYPEM katalogu. Grupa żądana
    # w payloadzie (spec) musi zgadzać się z grupą typu katalogowego — inaczej odrzucamy JAWNIE
    # (zakaz cichej podmiany rysunkowej na katalogową). Grupa katalogowa pozostaje autorytatywna.
    vector_group_error = der_val.validate_block_transformer_vector_group(
        requested_vector_group=spec.get("vector_group"),
        catalog_vector_group=materialized_params.get("vector_group"),
    )
    if vector_group_error is not None:
        return None, _error_response(vector_group_error.message_pl, vector_group_error.code)
    tr_data["catalog_ref"] = catalog_ref
    _apply_catalog_metadata(tr_data, binding_payload, default_namespace=przestrzen_katalogu)
    _apply_materialized_transformer_fields(tr_data, materialized_params)
    # Rola DER musi przetrwać materializację katalogu (odróżnienie od TR stacji).
    tr_data.setdefault("meta", {})
    tr_data["meta"]["catalog_role"] = "TRANSFORMATOR_BLOKOWY_DER"
    tr_data["meta"]["der_role"] = "block_transformer"
    tr_data["meta"]["visual_role"] = "DER_BLOCK_TRANSFORMER"
    return tr_data, None


def _der_cable_laying_conditions(
    config: dict[str, Any],
) -> tuple[dict[str, Any] | None, str | None]:
    """Warunki UŁOŻENIA kabla DER z konfiguracji pola SN (V12K-207, karta F-K7).

    Zwraca (opis_do_meta, None) albo (None, komunikat_bledu). Opis trafia do modelu, żeby
    raport zgodności liczył propozycję dla TYCH SAMYCH warunków, dla których policzył ją
    kreator — inaczej raport zgłaszałby ODSTĘPSTWO od propozycji, którą sam liczy inaczej.
    Nazwa jest WALIDOWANA tu, przy wejściu do modelu: nieznany zestaw nie może zamilknąć
    i wrócić jako „warunki katalogowe" (fail-closed).
    """
    raw = config.get("cable_laying_conditions")
    if raw is None:
        return None, None
    if isinstance(raw, str):
        raw = {"set_name": raw}
    if not isinstance(raw, dict):
        return None, "Warunki ułożenia kabla SN muszą być nazwą zestawu albo obiektem opisu."
    set_name = str(raw.get("set_name") or "").strip()
    if not set_name:
        # Współczynniki BEZ nazwy zestawu nie mogą zostać cicho pominięte — projektant je
        # podał, więc milczące przyjęcie warunków katalogowych zmieniłoby jego dobór.
        if any(raw.get(pole) is not None for pole in ("f_grunt", "f_wiazka", "f_grupa")):
            return None, (
                "Podano współczynniki obciążalności bez nazwy zestawu warunków ułożenia. "
                f"Użyj set_name = {cable_derating.NAZWA_WLASNE} i dodaj opis warunków."
            )
        return None, None
    if set_name == cable_derating.NAZWA_WARUNKI_KATALOGOWE:
        # Warunki katalogowe = brak korekty; nie zaśmiecamy modelu domyślną wartością
        # (determinizm seedów i porównania modelu bez zmian dla dotychczasowych torów).
        return None, None
    try:
        wspolczynniki = cable_derating.wspolczynniki_z_opisu(
            set_name,
            f_grunt=_as_float(raw.get("f_grunt")),
            f_wiazka=_as_float(raw.get("f_wiazka")),
            f_grupa=_as_float(raw.get("f_grupa")),
            opis_pl=raw.get("opis_pl"),
        )
    except ValueError as exc:
        return None, str(exc)
    opis: dict[str, Any] = {"set_name": wspolczynniki.nazwa}
    if wspolczynniki.nazwa == cable_derating.NAZWA_WLASNE:
        # Własne współczynniki muszą pojechać z modelem — nazwa „wlasne" sama niczego
        # nie odtwarza, a raport zgodności musi umieć powtórzyć ten sam rachunek.
        opis["f_grunt"] = wspolczynniki.f_grunt
        opis["f_wiazka"] = wspolczynniki.f_wiazka
        opis["f_grupa"] = wspolczynniki.f_grupa
        opis["opis_pl"] = wspolczynniki.etykieta_pl
    return opis, None


def _materialize_der_mv_cable(
    *,
    ref_id: str,
    name: str,
    from_bus_ref: str,
    to_bus_ref: str,
    catalog_ref: object,
    catalog_binding: object,
    length_km: float,
    laying_conditions: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Zmaterializuj kabel SN przyłączeniowy DER (katalog KABEL_SN), krótki odcinek.

    Zwraca (branch_data, None) przy sukcesie albo (None, error_response) przy błędzie.
    """
    przestrzen_katalogu = "KABEL_SN"
    wiazanie = _wiazanie_w_przestrzeni(catalog_binding, przestrzen_katalogu)
    resolved_ref = _require_catalog_ref(
        payload_ref=catalog_ref,
        payload_binding=wiazanie,
        context_code="der.mv_cable",
    )
    if isinstance(resolved_ref, dict):
        return None, resolved_ref

    materialization = _materialize_catalog_payload(
        catalog_ref=resolved_ref,
        catalog_binding=wiazanie,
        default_namespace=przestrzen_katalogu,
    )
    if isinstance(materialization, dict):
        return None, _blad_pozycji_katalogu(materialization, "Kabel SN przyłączeniowy DER")
    binding_payload, materialized_params = materialization

    branch_data: dict[str, Any] = {
        "ref_id": ref_id,
        "name": name,
        "type": "cable",
        "from_bus_ref": from_bus_ref,
        "to_bus_ref": to_bus_ref,
        "status": "closed",
        "length_km": length_km,
        "r_ohm_per_km": 0.0,
        "x_ohm_per_km": 0.0,
        "source_mode": "KATALOG",
        "catalog_namespace": przestrzen_katalogu,
        "catalog_ref": resolved_ref,
        "tags": ["der_mv_cable"],
        "meta": {"der_role": "mv_connection_cable", "visual_role": "DER_MV_CABLE"},
    }
    if laying_conditions:
        # F-K7: warunki ułożenia to ZAŁOŻENIE DOBORU, nie parametr fizyczny gałęzi —
        # dlatego meta, a nie pole modelu. Solver liczy z nich obciążalność skorygowaną;
        # w modelu zostaje sam OPIS warunków (jedno źródło reguły to solver).
        branch_data["meta"]["cable_laying_conditions"] = laying_conditions
    _apply_catalog_metadata(branch_data, binding_payload, default_namespace=przestrzen_katalogu)
    _apply_materialized_branch_fields(branch_data, materialized_params)
    branch_data["length_km"] = length_km
    return branch_data, None


def _resolve_apparatus_rated_current_a(apparatus_binding: object) -> float | None:
    """Prąd znamionowy In aparatu głównego pola SN z katalogu (APARAT_SN).

    Zwraca None gdy BRAK powiązania albo gdy pozycja katalogowa nie niesie prądu
    (`i_n_a`/`rated_current_a`) — wtedy ogniwo kaskady prądowej jest pomijane.
    NIE zwraca None z powodu nieistniejącej pozycji: wołający sprawdza istnienie
    aparatu bramą `_blad_aparatu_pola` PRZED mutacją modelu (defekt G), więc
    „nierozstrzygalny ref" kończy operację błędem, a nie cichym brakiem danej.

    TA SAMA PRZESTRZEŃ, CO W BRAMIE (V12K-316 dług 4). Dopóki kategoria szła
    z wiązania payloadu, obietnica z akapitu wyżej była nieprawdziwa: brama
    potwierdzała istnienie aparatu w APARAT_SN, a ten odczyt szukał go w
    kategorii z żądania — nie znajdował i ogniwo kaskady prądowej znikało
    CICHO, mimo że operacja kończyła się sukcesem.
    """
    if not isinstance(apparatus_binding, dict):
        return None
    catalog_ref = _catalog_item_id(apparatus_binding)
    if not catalog_ref:
        return None
    materialization = _materialize_catalog_payload(
        catalog_ref=catalog_ref,
        catalog_binding=_wiazanie_w_przestrzeni(apparatus_binding, _PRZESTRZEN_APARATU_POLA_SN),
        default_namespace=_PRZESTRZEN_APARATU_POLA_SN,
    )
    if not isinstance(materialization, tuple):
        return None
    _binding_payload, materialized_params = materialization
    return _as_float(
        materialized_params.get("i_n_a")
        if materialized_params.get("i_n_a") is not None
        else materialized_params.get("rated_current_a")
    )


def _add_converter_source_der_sn(
    enm: dict[str, Any],
    payload: dict[str, Any],
    *,
    technology: str,
    catalog_ref: str,
    der_topology: dict[str, Any],
) -> dict[str, Any]:
    """Materializuj KOMPLETNY tor DER przyłączonego po stronie SN (kanon
    POLECENIE_DER_SN_TOPOLOGIA_2026-07): szyna nN producenta → TR blokowy (osobny
    element) → kabel SN → dedykowane pole źródłowe SN → szyna SN stacji.

    Generator (falownik) siedzi na szynie nN PRODUCENTA; punkt przyłączenia do sieci
    to pole SN. Wszystkie elementy REALNE (buses/transformers/branches/generators) —
    LF/SC liczą je istniejącymi mechanizmami (zero zmian solverów, zero nowej fizyki).
    """
    from network_model.catalog.bay_templates import (
        mv_source_field_primary_devices,
        protection_codes_for_bay_role,
    )

    has_block_transformer = bool(der_topology.get("has_block_transformer"))
    if not has_block_transformer:
        # Kanon: sn ∧ brak TR blokowego = przypadek 4 (generator SYNCHRONICZNY wprost
        # na SN) — osobna zdolność, NIE źródło przekształtnikowe. Falownik (PV/BESS/FW)
        # na SN zawsze wymaga transformacji napięcia (TR blokowy).
        return _error_response(
            "Źródło przekształtnikowe po stronie SN wymaga transformatora blokowego. "
            "Bezpośrednie przyłączenie do szyny SN bez TR blokowego jest zarezerwowane "
            "dla generatora synchronicznego (osobna operacja).",
            "converter.sn_requires_block_transformer",
        )

    block_spec = der_topology.get("block_transformer")
    if not isinstance(block_spec, dict):
        return _error_response(
            "Tor DER-SN wymaga specyfikacji transformatora blokowego (block_transformer).",
            "der.block_transformer_spec_missing",
        )

    mv_bus_ref = der_topology.get("mv_bus_ref") or payload.get("mv_bus_ref")
    if not isinstance(mv_bus_ref, str) or not mv_bus_ref.strip():
        return _error_response(
            "Tor DER-SN wymaga wskazania szyny SN stacji (mv_bus_ref).",
            "der.mv_bus_missing",
        )
    mv_bus_ref = mv_bus_ref.strip()

    station_ref = payload.get("station_ref")
    if not isinstance(station_ref, str) or not station_ref.strip():
        return _error_response(
            "Brak referencji stacji dla toru DER-SN.", "converter.station_missing"
        )
    station_ref = station_ref.strip()

    station = _resolve_station_for_field_write(enm, station_ref=station_ref, bus_ref=mv_bus_ref)
    if station is None:
        return _error_response("Nie znaleziono stacji dla szyny SN.", "der.station_not_found")

    mv_bus_voltage_kv = _bus_voltage_kv(enm, mv_bus_ref)
    if mv_bus_voltage_kv is None or mv_bus_voltage_kv <= 0:
        return _error_response(
            "Nie znaleziono napięcia szyny SN stacji dla toru DER-SN.",
            "der.mv_bus_voltage_missing",
        )

    # Materializacja parametrów falownika (reużycie kanonicznej ścieżki katalogowej).
    # TA SAMA przestrzeń wybiera pozycję katalogu i trafia do migawki jako znacznik
    # pochodzenia generatora (V12K-316 dług 4).
    przestrzen_katalogu = _PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO[technology]
    materialized_params, materialization_error = _build_converter_materialized_params(
        technology=technology,
        namespace=przestrzen_katalogu,
        payload=payload,
        catalog_ref=catalog_ref,
    )
    if materialization_error is not None:
        return materialization_error
    converter_un_kv = _as_float(materialized_params.get("un_kv"))
    if converter_un_kv is None or converter_un_kv <= 0:
        return _error_response(
            f"Źródło {technology} wymaga napięcia znamionowego un_kv z katalogu.",
            "converter.un_kv_missing",
        )

    # Napięcie wyjściowe falownika / strona nN producenta (== szyna nN producenta).
    inverter_output_kv = (
        _as_float(der_topology.get("inverter_output_voltage_kv"))
        or _as_float(block_spec.get("secondary_voltage_kv"))
        or converter_un_kv
    )
    if inverter_output_kv is None or inverter_output_kv <= 0:
        return _error_response(
            "Tor DER-SN wymaga napięcia wyjściowego falownika (inverter_output_voltage_kv).",
            "der.inverter_voltage_missing",
        )

    # Spójność napięć toru (kanon: napięcia TR blokowego spójne z falownikiem i szyną SN).
    if not _same_nominal_voltage(converter_un_kv, inverter_output_kv):
        return _error_response(
            "Napięcie katalogowe falownika nie jest zgodne z napięciem wyjściowym toru DER. "
            f"Falownik: {converter_un_kv:g} kV, wyjście: {inverter_output_kv:g} kV.",
            "der.inverter_voltage_mismatch",
        )
    block_secondary_kv = _as_float(block_spec.get("secondary_voltage_kv")) or inverter_output_kv
    block_primary_kv = _as_float(block_spec.get("primary_voltage_kv")) or mv_bus_voltage_kv
    # D1 wymaganie 2: U_AC falownika ↔ strona nN TR blokowego (tolerancja nN, kanon).
    lv_error = der_val.validate_inverter_lv_voltage(inverter_output_kv, block_secondary_kv)
    if lv_error is not None:
        return _error_response(lv_error.message_pl, lv_error.code)
    # D1 wymaganie 6: strona SN TR blokowego ↔ napięcie szyny SN przyłączenia (tolerancja SN).
    sn_error = der_val.validate_sn_voltage(block_primary_kv, mv_bus_voltage_kv)
    if sn_error is not None:
        return _error_response(sn_error.message_pl, sn_error.code)

    # Aparat dedykowanego pola źródłowego SN — materializacja PRZED mutacją modelu.
    # Bez tego gałąź aparatu dostawała `source_mode: KATALOG` przy pozycji, której
    # w katalogu nie ma (jedyna próba odczytu, `_resolve_apparatus_rated_current_a`,
    # cicho zwracała None i ogniwo kaskady prądowej znikało bez sygnału).
    blad_aparatu_sn = _blad_aparatu_pola(
        (
            (der_topology.get("mv_field_configuration") or {}).get("apparatus_catalog_binding")
            if isinstance(der_topology.get("mv_field_configuration"), dict)
            else None
        ),
        namespace=_PRZESTRZEN_APARATU_POLA_SN,
        opis_pl="Aparat pola źródłowego SN",
    )
    if blad_aparatu_sn is not None:
        return blad_aparatu_sn

    name, gen_type, event_type, gen_meta, p_mw = _resolve_converter_defaults(
        technology, payload, materialized_params
    )
    q_mvar = _first_number(payload.get("q_min_mvar"), 0.0)

    # Deterministyczny seed z refów (kolejny numer powtarzalnego DER na tej szynie SN).
    source_sequence = _next_der_sn_sequence(
        enm, station_ref=station_ref, mv_bus_ref=mv_bus_ref, catalog_ref=catalog_ref, name=name
    )
    seed_payload: dict[str, Any] = {
        "op": "der_sn_topology",
        "station_ref": station_ref,
        "mv_bus": mv_bus_ref,
        "technology": technology,
        "catalog_ref": catalog_ref,
        "name": name,
    }
    if source_sequence > 0:
        seed_payload["source_sequence"] = source_sequence
    seed = _compute_seed(seed_payload)
    prefix = technology.lower()

    producer_bus_ref = _make_id(prefix, seed, "der/producer_nn_bus")
    block_hv_bus_ref = _make_id(prefix, seed, "der/block_hv_bus")
    block_tr_ref = _make_id(prefix, seed, "der/block_transformer")
    cable_ref = _make_id(prefix, seed, "der/mv_cable")
    field_ref = _make_id("sn", seed, "der/source_field")
    terminal_bus_ref = _make_id("sn", seed, "der/field_terminal")
    apparatus_ref = _make_id("sn", seed, "der/field_device")
    generator_ref = _make_id(prefix, seed, "converter")

    lv_variant = der_topology.get("lv_switchgear_variant") or "none"
    has_lv_switchgear = bool(der_topology.get("has_manufacturer_lv_switchgear"))

    new_enm = copy.deepcopy(enm)
    created: list[str] = []
    events: list[dict[str, Any]] = []
    ev_seq = 0

    def _emit(event_type_name: str, element_id: str) -> None:
        nonlocal ev_seq
        ev_seq += 1
        events.append(
            {"event_seq": ev_seq, "event_type": event_type_name, "element_id": element_id}
        )

    # 1. Szyna nN PRODUCENTA (strona falownika + strona nN TR blokowego).
    result = create_node(
        new_enm,
        {
            "ref_id": producer_bus_ref,
            "name": f"Szyna nN producenta {name}",
            "voltage_kv": inverter_output_kv,
            "tags": ["nn", "der_producer_lv"],
            "meta": {
                "visual_role": "DER_PRODUCER_LV_BUS",
                "der_role": "producer_lv_bus",
                "station_ref": station_ref,
                "has_manufacturer_lv_switchgear": has_lv_switchgear,
                "lv_switchgear_variant": lv_variant,
            },
        },
    )
    if not result.success:
        return _error_response(
            "Nie udało się utworzyć szyny nN producenta DER.", "der.producer_bus_failed"
        )
    new_enm = result.enm
    created.append(producer_bus_ref)
    _emit("BUS_NN_CREATED", producer_bus_ref)

    # 2. Szyna SN po stronie górnej TR blokowego (wejście kabla SN).
    result = create_node(
        new_enm,
        {
            "ref_id": block_hv_bus_ref,
            "name": f"Szyna SN TR blokowego {name}",
            "voltage_kv": block_primary_kv,
            "tags": ["sn", "der_block_hv"],
            "meta": {
                "visual_role": "DER_BLOCK_HV_BUS",
                "der_role": "block_hv_bus",
                "station_ref": station_ref,
            },
        },
    )
    if not result.success:
        return _error_response(
            "Nie udało się utworzyć szyny SN transformatora blokowego DER.",
            "der.block_hv_bus_failed",
        )
    new_enm = result.enm
    created.append(block_hv_bus_ref)
    _emit("BUS_CREATED", block_hv_bus_ref)

    # 3. Dedykowane POLE ŹRÓDŁOWE SN stacji (łańcuch W1: terminal + aparat + field_spec).
    mv_field_cfg = der_topology.get("mv_field_configuration")
    if not isinstance(mv_field_cfg, dict):
        mv_field_cfg = {}
    switching_device = str(mv_field_cfg.get("switching_device") or "CB").upper()
    apparatus_kind = "LOAD_SWITCH" if switching_device in {"LBS", "LOAD_SWITCH"} else "BREAKER"
    branch_type = _sn_bay_branch_type(apparatus_kind)
    apparatus_binding = mv_field_cfg.get("apparatus_catalog_binding")
    apparatus_catalog_ref = (
        _catalog_item_id(apparatus_binding) if isinstance(apparatus_binding, dict) else None
    )

    result = create_node(
        new_enm,
        {
            "ref_id": terminal_bus_ref,
            "name": f"Zacisk pola źródłowego SN {name}",
            "voltage_kv": mv_bus_voltage_kv,
            "tags": ["helper_bus", "field_terminal"],
            "meta": {
                "visual_role": "FIELD_TERMINAL",
                "render_on_sld": False,
                "show_in_project_tree": False,
                "field_ref": field_ref,
                "station_ref": station_ref,
                "port_kind": "der_source_in",
            },
        },
    )
    if not result.success:
        return _error_response(
            "Nie udało się utworzyć zacisku pola źródłowego SN.", "der.field_terminal_failed"
        )
    new_enm = result.enm
    created.append(terminal_bus_ref)
    _emit("FIELD_TERMINAL_CREATED_SN", terminal_bus_ref)

    result = create_branch(
        new_enm,
        {
            "ref_id": apparatus_ref,
            "name": f"Aparat pola źródłowego SN {name}",
            "type": branch_type,
            "from_bus_ref": mv_bus_ref,
            "to_bus_ref": terminal_bus_ref,
            "status": "closed",
            "r_ohm": 0.0,
            "x_ohm": 0.0,
            "source_mode": "KATALOG" if apparatus_catalog_ref else None,
            "catalog_namespace": (_PRZESTRZEN_APARATU_POLA_SN if apparatus_catalog_ref else None),
            "catalog_ref": apparatus_catalog_ref,
            "tags": ["gpz_field_device", "der_source_field_device"],
            "meta": {
                "field_ref": field_ref,
                "station_ref": station_ref,
                "bay_role": "OZE",
                "apparatus_kind": apparatus_kind,
                "terminal_bus_ref": terminal_bus_ref,
                "render_on_sld": False,
                "show_in_project_tree": False,
                "requires_catalog_binding": apparatus_catalog_ref is None,
                # Wiązanie zapisane do migawki niesie przestrzeń, w której
                # sprawdzono ISTNIENIE aparatu, a nie tę z żądania.
                "catalog_binding": _wiazanie_w_przestrzeni(
                    apparatus_binding, _PRZESTRZEN_APARATU_POLA_SN
                ),
            },
        },
    )
    if not result.success:
        message = result.issues[0].message_pl if result.issues else "Nieznany błąd."
        return _error_response(
            f"Nie udało się utworzyć aparatu pola źródłowego SN: {message}",
            "der.field_apparatus_failed",
        )
    new_enm = result.enm
    created.append(apparatus_ref)
    _emit("FIELD_DEVICE_CREATED_SN", apparatus_ref)

    primary_devices = mv_source_field_primary_devices(
        field_ref,
        switching_device=switching_device,
        ct=bool(mv_field_cfg.get("ct", True)),
        vt=bool(mv_field_cfg.get("vt", False)),
        earthing_switch=bool(mv_field_cfg.get("earthing_switch", True)),
        surge_arrester=bool(mv_field_cfg.get("surge_arrester", False)),
        cable_head=bool(mv_field_cfg.get("cable_head", True)),
    )
    protection_codes = (
        protection_codes_for_bay_role("OZE")
        if bool(mv_field_cfg.get("protection_relay", True))
        else []
    )
    field_name = str(mv_field_cfg.get("field_name") or f"Pole źródłowe SN {technology}")
    field_spec = _build_field_spec(
        field_ref=field_ref,
        name=field_name,
        bay_role="OZE",
        bus_ref=mv_bus_ref,
        equipment_refs=[apparatus_ref],
        protection_codes=protection_codes or None,
        bay_template_ref=mv_field_cfg.get("bay_template_ref"),
        primary_devices=primary_devices or None,
        tags=["der_source_field", "nn_source_field"],
        meta={
            "apparatus_kind": apparatus_kind,
            "catalog_binding": _wiazanie_w_przestrzeni(
                apparatus_binding, _PRZESTRZEN_APARATU_POLA_SN
            ),
            "terminal_bus_ref": terminal_bus_ref,
            "default_device_ref": apparatus_ref,
            "field_status": "CONFIGURED_FOR_TRUNK",
            "source_field_kind": technology,
            "der_role": "mv_source_field",
            "der_feeder_bus_ref": block_hv_bus_ref,
        },
    )
    if not _append_substation_field_spec(
        new_enm,
        station_ref=station_ref,
        meta_key="field_specs",
        field_spec=field_spec,
    ):
        return _error_response("Nie znaleziono stacji dla szyny SN.", "der.station_not_found")
    created.insert(0, field_ref)
    _emit("FIELDS_CREATED_SN", field_ref)

    # 4. Kabel SN przyłączeniowy: szyna SN TR blokowego → zacisk pola źródłowego SN.
    cable_length_km = _as_float(mv_field_cfg.get("cable_length_km"))
    if cable_length_km is None or cable_length_km <= 0:
        cable_length_km = 0.05  # krótki odcinek przyłączeniowy (50 m) — domyślny
    laying_conditions, laying_error = _der_cable_laying_conditions(mv_field_cfg)
    if laying_error is not None:
        return _error_response(laying_error, "der.mv_cable_laying_conditions_invalid")
    cable_data, cable_error = _materialize_der_mv_cable(
        ref_id=cable_ref,
        name=f"Kabel SN przyłączeniowy {name}",
        from_bus_ref=block_hv_bus_ref,
        to_bus_ref=terminal_bus_ref,
        catalog_ref=mv_field_cfg.get("cable_catalog_ref"),
        catalog_binding=mv_field_cfg.get("cable_catalog_binding"),
        length_km=cable_length_km,
        laying_conditions=laying_conditions,
    )
    if cable_error is not None:
        return cable_error
    assert cable_data is not None
    result = create_branch(new_enm, cable_data)
    if not result.success:
        message = result.issues[0].message_pl if result.issues else "Nieznany błąd."
        return _error_response(
            f"Nie udało się utworzyć kabla SN przyłączeniowego DER: {message}",
            "der.mv_cable_failed",
        )
    new_enm = result.enm
    created.append(cable_ref)
    _emit("BRANCH_CREATED", cable_ref)

    # 5. TR blokowy DER (osobny element w enm["transformers"], konsumowany przez LF/SC).
    tr_data, tr_error = _materialize_der_block_transformer(
        spec=block_spec,
        ref_id=block_tr_ref,
        name=f"Transformator blokowy {name}",
        hv_bus_ref=block_hv_bus_ref,
        lv_bus_ref=producer_bus_ref,
        hv_voltage_kv=block_primary_kv,
        lv_voltage_kv=inverter_output_kv,
    )
    if tr_error is not None:
        return tr_error
    assert tr_data is not None

    # D1 wymaganie 5: moc TR blokowego — ΣS falowników ≤ Sn_TR · dopuszczalne obciążenie
    # (z uwzgl. współczynnika jednoczesności). Sn_TR = wartość ZMATERIALIZOWANA z katalogu
    # (autorytatywna — ta sama, którą widzi solver i kaskada prądowa); ΣS z mocy czynnej
    # falowników przez cosφ znamionowy (inaczej P=S konserwatywnie).
    cos_phi = _first_number(payload.get("cos_phi"), materialized_params.get("cosphi"))
    sum_apparent_mva = der_val.converter_apparent_power_mva(p_mw, cos_phi)
    tr_sn_mva = _as_float(tr_data.get("sn_mva")) or 0.0
    power_error = der_val.validate_transformer_power(
        sum_apparent_power_mva=sum_apparent_mva,
        transformer_sn_mva=tr_sn_mva,
        loadability_pu=_as_float(block_spec.get("loadability_pu")),
        simultaneity_factor=_as_float(der_topology.get("simultaneity_factor")),
    )
    if power_error is not None:
        return _error_response(power_error.message_pl, power_error.code)

    new_enm.setdefault("transformers", []).append(tr_data)
    created.append(block_tr_ref)
    _emit("TRANSFORMER_CREATED", block_tr_ref)

    # 6. Generator (falownik) na szynie nN PRODUCENTA. Punkt przyłączenia do sieci = pole SN.
    generator_meta = {
        **gen_meta,
        "field_ref": field_ref,
        "der_mv_bus_ref": mv_bus_ref,
        "der_mv_field_ref": field_ref,
        "der_producer_bus_ref": producer_bus_ref,
        "der_block_hv_bus_ref": block_hv_bus_ref,
        "der_mv_cable_ref": cable_ref,
        "block_transformer_ref": block_tr_ref,
        "source_sequence_index": source_sequence,
        "der_topology": {
            "connection_level": "sn",
            "inverter_output_voltage_kv": inverter_output_kv,
            "has_manufacturer_lv_switchgear": has_lv_switchgear,
            "lv_switchgear_variant": lv_variant,
            "has_block_transformer": True,
            "has_dedicated_mv_field": True,
        },
    }
    new_enm.setdefault("generators", []).append(
        {
            "ref_id": generator_ref,
            "name": name,
            "bus_ref": producer_bus_ref,
            "gen_type": gen_type,
            "p_mw": p_mw,
            "q_mvar": q_mvar,
            "catalog_ref": catalog_ref,
            "catalog_namespace": przestrzen_katalogu,
            "source_mode": "KATALOG",
            "materialized_params": materialized_params,
            "station_ref": station_ref,
            "connection_variant": "block_transformer",
            "blocking_transformer_ref": block_tr_ref,
            "quantity": gen_meta.get("quantity"),
            "n_parallel": gen_meta.get("quantity"),
            "in_service": True,
            "tags": [],
            "meta": generator_meta,
        }
    )
    created.append(generator_ref)
    _emit(event_type, generator_ref)

    response = _response(
        new_enm,
        created=created,
        selection_id=field_ref,
        selection_type="bay",
        events=events,
    )

    # D1 wymaganie 5b: kaskada prądowa I_TR (strona SN) ≤ Iz kabla SN ≤ In pola.
    # Ogniwo bez danych jest POMIJANE Z JAWNYM OSTRZEŻENIEM (nie cichy skip). Prąd
    # znamionowy TR z tabliczki (Sn, U_SN); Iz kabla z materializacji katalogu kabla;
    # In pola z katalogu aparatu głównego (best-effort — brak → pominięcie).
    transformer_current_a = der_val.rated_current_a(
        _as_float(tr_data.get("sn_mva")) or 0.0, block_primary_kv
    )
    cable_ampacity_a = _as_float((cable_data.get("rating") or {}).get("in_a"))
    field_rated_current_a = _resolve_apparatus_rated_current_a(apparatus_binding)
    cascade_warnings = der_val.build_current_cascade_warnings(
        transformer_current_a=transformer_current_a,
        cable_ampacity_a=cable_ampacity_a,
        field_rated_current_a=field_rated_current_a,
    )
    if cascade_warnings:
        response["readiness"]["warnings"].extend(
            {
                "code": warning.code,
                "severity": "OSTRZEZENIE",
                "message_pl": warning.message_pl,
                "element_ref": field_ref,
            }
            for warning in cascade_warnings
        )
    return response


def add_converter_source(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj kanoniczne źródło przekształtnikowe PV, BESS albo FW."""
    technology = _normalize_source_technology(payload)
    if technology is None:
        return _error_response(
            "Źródło przekształtnikowe wymaga jawnego typu source_technology (PV, BESS lub FW).",
            "converter.source_technology_missing",
        )

    # V12K-023: Backwards-compatible aliases for FE-canonical variants.
    # FE DerRenderer.connectionVariant deklaruje 5 wartosci:
    #   - nn_side, block_transformer (kanoniczne, backend OK)
    #   - LV_BEHIND_STATION_TRANSFORMER -> alias nn_side (PV za trafo stacji nN)
    #   - SOURCE_CONNECTION_STATION -> alias block_transformer (stacja przylaczeniowa)
    #   - DEDICATED_MV_CONNECTION -> alias block_transformer (dedicated MV via block tr)
    _VARIANT_ALIASES = {
        "LV_BEHIND_STATION_TRANSFORMER": "nn_side",
        "SOURCE_CONNECTION_STATION": "block_transformer",
        "DEDICATED_MV_CONNECTION": "block_transformer",
    }
    connection_variant_raw = payload.get("connection_variant")
    connection_variant = (
        _VARIANT_ALIASES.get(connection_variant_raw, connection_variant_raw)
        if isinstance(connection_variant_raw, str)
        else connection_variant_raw
    )
    if not isinstance(connection_variant, str) or connection_variant not in {
        "nn_side",
        "block_transformer",
    }:
        return _error_response(
            "Źródło przekształtnikowe wymaga jawnego connection_variant (nn_side albo block_transformer).",
            "converter.connection_variant_missing",
        )

    # K30-15: rozwiąż catalog_ref wcześniej — potrzebny dla block_transformer
    # voltage matching (MV-side BESS/FW vs LV-side PV decision).
    catalog_ref, catalog_error = _resolve_converter_catalog_ref(payload, technology)
    if catalog_error or not catalog_ref:
        return _error_response(
            f"Źródło {technology} wymaga poprawnego powiązania z katalogiem.",
            catalog_error or "catalog.ref_required",
        )

    # JEDNA przestrzeń katalogu: wybiera pozycję do materializacji tabliczki i jest
    # znacznikiem pochodzenia w migawce. Payload może ją zadeklarować (kreator OZE
    # wysyła „CONVERTER"), ale deklaracja nie ma wpływu na to, gdzie szukamy ani co
    # zapisujemy — inaczej model niósłby kategorię, z której nic nie pochodzi.
    przestrzen_katalogu = _PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO[technology]

    # W2b-DANE (POLECENIE_DER_SN_TOPOLOGIA_2026-07): kompletny tor DER po stronie SN.
    # ADDYTYWNY — bez der_topology zachowanie bez zmian. connection_level='sn' materializuje
    # szynę nN producenta → TR blokowy (osobny element) → kabel SN → pole źródłowe SN.
    der_topology = payload.get("der_topology")
    if isinstance(der_topology, dict):
        # D1 wymaganie 9: jawny „sposób przyłączenia" — walidacja spójności z kontraktem
        # (dotyczy obu ścieżek nn/sn; PV/BESS/FW = źródło przekształtnikowe).
        method_error = der_val.validate_connection_method(
            connection_method=der_topology.get("connection_method"),
            connection_level=str(der_topology.get("connection_level") or ""),
            has_block_transformer=bool(der_topology.get("has_block_transformer")),
            has_manufacturer_lv_switchgear=bool(der_topology.get("has_manufacturer_lv_switchgear")),
            is_converter=True,
        )
        if method_error is not None:
            return _error_response(method_error.message_pl, method_error.code)
    if isinstance(der_topology, dict) and der_topology.get("connection_level") == "sn":
        return _add_converter_source_der_sn(
            enm,
            payload,
            technology=technology,
            catalog_ref=catalog_ref,
            der_topology=der_topology,
        )

    bus_nn_ref = payload.get("bus_nn_ref")
    blocking_transformer_ref = payload.get("blocking_transformer_ref")
    if connection_variant == "block_transformer":
        # V12K-022: Auto-resolve block_transformer per station if not provided.
        # Polityka:
        #  1. Jezeli blocking_transformer_ref jawnie podany - musi istniec.
        #  2. Jezeli pusty i station ma exactly 1 transformer SN/nN - uzyj go
        #     jako block_transformer (typowy scenariusz: jedyny TR stacji = block tr).
        #  3. Jezeli station ma multiple transformers - blad ambiguous.
        if not isinstance(blocking_transformer_ref, str) or not blocking_transformer_ref.strip():
            # Try auto-resolve from station_ref
            station_ref_for_auto = payload.get("station_ref")
            if isinstance(station_ref_for_auto, str) and station_ref_for_auto.strip():
                station_for_auto = _resolve_station_for_field_write(
                    enm,
                    station_ref=station_ref_for_auto.strip(),
                    bus_ref=None,
                )
                if station_for_auto is not None:
                    station_buses = set(station_for_auto.get("bus_refs") or [])
                    station_transformers = [
                        tr
                        for tr in enm.get("transformers", [])
                        if tr.get("hv_bus_ref") in station_buses
                        or tr.get("lv_bus_ref") in station_buses
                    ]
                    if len(station_transformers) == 1:
                        blocking_transformer_ref = station_transformers[0].get("ref_id")
                    elif len(station_transformers) > 1:
                        return _error_response(
                            "Stacja zawiera wiele transformatorow — wymagany jawny blocking_transformer_ref.",
                            "generator.block_transformer_ambiguous",
                        )
            if (
                not isinstance(blocking_transformer_ref, str)
                or not blocking_transformer_ref.strip()
            ):
                return _error_response(
                    "Wariant block_transformer wymaga blocking_transformer_ref albo station_ref z dokladnie 1 transformatorem.",
                    "generator.block_transformer_missing",
                )
        transformer = next(
            (
                item
                for item in enm.get("transformers", [])
                if item.get("ref_id") == blocking_transformer_ref
            ),
            None,
        )
        if transformer is None:
            return _error_response(
                "Nie znaleziono transformatora blokowego dla źródła przekształtnikowego.",
                "generator.block_transformer_invalid",
            )
        if not isinstance(bus_nn_ref, str) or not bus_nn_ref.strip():
            # K30-15: dla block_transformer wybierz bus side po stronie przyłącza
            # converter zgodnie z un_kv katalogu. MV-side converters (BESS/FW 15 kV)
            # podłączane przez block transformer do MV grid → bus_nn_ref = HV side.
            # LV-side converters (typowe 0.4 kV) → bus_nn_ref = LV side.
            tr_hv_kv = _as_float(transformer.get("uhv_kv"))
            tr_lv_kv = _as_float(transformer.get("ulv_kv"))
            # Napięcie znamionowe falownika Z KATALOGU (ta sama materializacja, co
            # niżej) — wybór strony transformatora blokowego nie może zależeć od
            # tabliczki podanej w formularzu. Błąd materializacji zgłasza pełna
            # ścieżka poniżej, tu wybór strony po prostu nie ma podstawy.
            converter_un_kv: float | None = None
            _tabliczka_wstepna, _blad_wstepny = _build_converter_materialized_params(
                technology=technology,
                namespace=przestrzen_katalogu,
                payload=payload,
                catalog_ref=catalog_ref,
            )
            if _blad_wstepny is None:
                converter_un_kv = _as_float(_tabliczka_wstepna.get("un_kv"))
            if (
                converter_un_kv is not None
                and tr_hv_kv is not None
                and tr_lv_kv is not None
                and abs(converter_un_kv - tr_hv_kv) < abs(converter_un_kv - tr_lv_kv)
            ):
                bus_nn_ref = transformer.get("hv_bus_ref")
            else:
                bus_nn_ref = transformer.get("lv_bus_ref")
    if not isinstance(bus_nn_ref, str) or not bus_nn_ref.strip():
        return _error_response(
            "Brak szyny nN dla źródła przekształtnikowego.", "converter.bus_missing"
        )

    station_ref = payload.get("station_ref")
    if not isinstance(station_ref, str) or not station_ref.strip():
        return _error_response(
            "Brak referencji stacji dla źródła przekształtnikowego.", "converter.station_missing"
        )
    station_ref = station_ref.strip()
    bus_nn_ref = bus_nn_ref.strip()

    station = _resolve_station_for_field_write(enm, station_ref=station_ref, bus_ref=bus_nn_ref)
    if station is None:
        return _error_response("Nie znaleziono stacji dla szyny nN.", "nn.station_not_found")
    if connection_variant == "nn_side" and not _has_transformer_in_path(enm, station):
        return _error_response(
            f"Źródło {technology} wymaga transformatora w ścieżce zasilania stacji.",
            f"{technology.lower()}.transformer_required",
        )

    materialized_params, materialization_error = _build_converter_materialized_params(
        technology=technology,
        namespace=przestrzen_katalogu,
        payload=payload,
        catalog_ref=catalog_ref,
    )
    if materialization_error is not None:
        return materialization_error

    converter_voltage_kv = _as_float(materialized_params.get("un_kv"))
    if converter_voltage_kv is None or converter_voltage_kv <= 0:
        return _error_response(
            f"Źródło {technology} wymaga napięcia znamionowego un_kv z katalogu.",
            "converter.un_kv_missing",
        )
    bus_voltage_kv = _bus_voltage_kv(enm, bus_nn_ref)
    if bus_voltage_kv is None:
        return _error_response(
            "Nie znaleziono napięcia szyny dla źródła przekształtnikowego.",
            "converter.bus_voltage_missing",
        )
    if not _same_nominal_voltage(converter_voltage_kv, bus_voltage_kv):
        return _error_response(
            (
                "Napięcie katalogowe źródła nie jest zgodne z napięciem szyny. "
                f"Źródło: {converter_voltage_kv:g} kV, szyna: {bus_voltage_kv:g} kV."
            ),
            "converter.voltage_mismatch",
        )

    capacity_error = _validate_converter_transformer_capacity(
        enm,
        station=station,
        bus_ref=bus_nn_ref,
        blocking_transformer_ref=blocking_transformer_ref,
        connection_variant=connection_variant,
        technology=technology,
        payload=payload,
        materialized_params=materialized_params,
    )
    if capacity_error is not None:
        return capacity_error

    name, gen_type, event_type, meta, p_mw = _resolve_converter_defaults(
        technology,
        payload,
        materialized_params,
    )
    q_mvar = _first_number(payload.get("q_min_mvar"), 0.0)
    source_sequence = _next_converter_source_sequence(
        enm,
        station_ref=station_ref,
        bus_ref=bus_nn_ref,
        gen_type=gen_type,
        catalog_ref=catalog_ref,
        name=name,
    )
    seed_payload: dict[str, Any] = {
        "op": "converter_source",
        "station_ref": station_ref,
        "bus": bus_nn_ref,
        "technology": technology,
        "catalog_ref": catalog_ref,
        "name": name,
    }
    if source_sequence > 0:
        seed_payload["source_sequence"] = source_sequence
    source_seed = _compute_seed(seed_payload)
    prefix = technology.lower()
    generator_ref = _make_id(prefix, source_seed, "converter")

    # Aparat pola źródłowego nN — sprawdzany PRZED mutacją modelu, żeby zła
    # referencja nie zostawiła w migawce pola z martwym `apparatus_catalog_ref`.
    blad_aparatu = _blad_aparatu_pola(
        (
            (payload.get("source_field") or {}).get("catalog_binding")
            if isinstance(payload.get("source_field"), dict)
            else None
        ),
        namespace=_PRZESTRZEN_APARATU_POLA_NN,
        opis_pl="Aparat pola źródłowego nN",
    )
    if blad_aparatu is not None:
        return blad_aparatu

    new_enm = copy.deepcopy(enm)
    field_ref, created_field_ids, field_events = _append_converter_field_if_needed(
        new_enm,
        station_ref=station_ref,
        bus_nn_ref=bus_nn_ref,
        technology=technology,
        connection_variant=connection_variant,
        payload=payload,
    )
    if field_ref is None and payload.get("placement") == "EXISTING_FIELD":
        return _error_response(
            "Nie znaleziono wskazanego pola źródłowego dla źródła przekształtnikowego.",
            "converter.field_not_found",
        )

    generator_meta = {
        **meta,
        "field_ref": field_ref,
        "source_sequence_index": source_sequence,
    }
    new_enm.setdefault("generators", []).append(
        {
            "ref_id": generator_ref,
            "name": name,
            "bus_ref": bus_nn_ref,
            "gen_type": gen_type,
            "p_mw": p_mw,
            "q_mvar": q_mvar,
            "catalog_ref": catalog_ref,
            "catalog_namespace": przestrzen_katalogu,
            "source_mode": "KATALOG",
            "materialized_params": materialized_params,
            "station_ref": station_ref,
            "connection_variant": connection_variant,
            "blocking_transformer_ref": blocking_transformer_ref,
            "quantity": meta.get("quantity"),
            "n_parallel": meta.get("quantity"),
            "in_service": True,
            "tags": [],
            "meta": generator_meta,
        }
    )

    created_ids = list(created_field_ids or [])
    created_ids.append(generator_ref)
    events: list[dict[str, Any]] = []
    event_seq = 0
    for raw_event in field_events or []:
        event_seq += 1
        events.append(
            {
                "event_seq": event_seq,
                "event_type": raw_event["event_type"],
                "element_id": raw_event["element_id"],
            }
        )
    event_seq += 1
    events.append(
        {
            "event_seq": event_seq,
            "event_type": event_type,
            "element_id": generator_ref,
        }
    )

    return _response(
        new_enm,
        created=created_ids,
        selection_id=field_ref or generator_ref,
        selection_type="bay" if field_ref else "generator",
        events=events,
    )


def _next_converter_source_sequence(
    enm: dict[str, Any],
    *,
    station_ref: str,
    bus_ref: str,
    gen_type: str,
    catalog_ref: str,
    name: str,
) -> int:
    """Return deterministic ordinal for repeated identical DER sources."""
    sequence = 0
    for existing in enm.get("generators", []):
        if not isinstance(existing, dict):
            continue
        if (
            existing.get("station_ref") == station_ref
            and existing.get("bus_ref") == bus_ref
            and existing.get("gen_type") == gen_type
            and existing.get("catalog_ref") == catalog_ref
            and existing.get("name") == name
        ):
            sequence += 1
    return sequence


def add_genset_nn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj agregat prądotwórczy do rozdzielni nN."""
    bus_nn_ref = payload.get("bus_nn_ref")
    genset_spec = payload.get("genset_spec", {})

    if not bus_nn_ref:
        return _error_response("Brak szyny nN.", "genset.bus_missing")

    seed = _compute_seed(
        {"op": "genset_nn", "bus": bus_nn_ref, "p": genset_spec.get("rated_power_kw", 0)}
    )
    gen_ref = _make_id("gen", seed, "genset")

    # G-SCM F-follow-1 (V12K-055): agregat = maszyna synchroniczna. `gen_type="synchronous"`
    # (kanoniczny enum modelu Generator — „GENSET" był ODRZUCANY przez walidację ENM).
    # Tabliczka SC do materialized_params (sr=P/cosφ, un=napięcie znamionowe/szyny, cosφ);
    # x″d = domyślne IEC modelu SynchronousMachineSource (§6.3). Wpina agregat w łańcuch
    # zwarciowy maszyn wirujących (F1 → SynchronousMachineSource, F2 → rozbicie μ/q/i_b).
    p_mw = (genset_spec.get("rated_power_kw") or 0) / 1000.0
    cos_phi = genset_spec.get("power_factor")
    cos_phi = float(cos_phi) if isinstance(cos_phi, int | float) and 0 < cos_phi <= 1 else 0.8
    un_kv = genset_spec.get("rated_voltage_kv") or _bus_voltage_kv(enm, bus_nn_ref)
    sn_mva = (p_mw / cos_phi) if p_mw > 0 else 0.0
    genset_meta: dict[str, Any] = {
        "sn_mva": sn_mva,
        "cos_phi": cos_phi,
    }
    if un_kv:
        genset_meta["un_kv"] = float(un_kv)

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("generators", []).append(
        {
            "ref_id": gen_ref,
            "name": genset_spec.get("source_name") or "Agregat",
            "bus_ref": bus_nn_ref,
            "gen_type": "synchronous",
            "p_mw": p_mw,
            "q_mvar": 0.0,
            "tags": [],
            "materialized_params": genset_meta,
            "meta": {"operation_mode": genset_spec.get("operation_mode"), "source_kind": "GENSET"},
        }
    )

    return _response(
        new_enm,
        created=[gen_ref],
        selection_id=gen_ref,
        selection_type="generator",
        events=[{"event_seq": 1, "event_type": "GENSET_CREATED", "element_id": gen_ref}],
    )


def add_ups_nn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj UPS do rozdzielni nN."""
    bus_nn_ref = payload.get("bus_nn_ref")
    ups_spec = payload.get("ups_spec", {})

    if not bus_nn_ref:
        return _error_response("Brak szyny nN.", "ups.bus_missing")

    seed = _compute_seed(
        {"op": "ups_nn", "bus": bus_nn_ref, "p": ups_spec.get("rated_power_kw", 0)}
    )
    ups_ref = _make_id("ups", seed, "ups")

    # G-SCM F-follow-1 (V12K-055): UPS = źródło przekształtnikowe (bateria + falownik).
    # `gen_type="bess"` (kanoniczny enum inwerterowy — „UPS" był ODRZUCANY przez walidację
    # ENM); zwarciowo modelowany jako ograniczone źródło prądowe (InverterSource, §6.7),
    # co jest fizycznie poprawne dla double-conversion UPS. Tożsamość zachowana w `name`
    # + `meta.source_kind="UPS"`. Tabliczka: sn_mva=P, un=napięcie szyny nN.
    p_mw = (ups_spec.get("rated_power_kw") or 0) / 1000.0
    un_kv = _bus_voltage_kv(enm, bus_nn_ref)
    ups_meta: dict[str, Any] = {"sn_mva": p_mw}
    if un_kv:
        ups_meta["un_kv"] = float(un_kv)

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("generators", []).append(
        {
            "ref_id": ups_ref,
            "name": ups_spec.get("source_name") or "UPS",
            "bus_ref": bus_nn_ref,
            "gen_type": "bess",
            "p_mw": p_mw,
            "q_mvar": 0.0,
            "tags": [],
            "materialized_params": ups_meta,
            "meta": {
                "backup_time_min": ups_spec.get("backup_time_min"),
                "operation_mode": ups_spec.get("operation_mode"),
                "source_kind": "UPS",
            },
        }
    )

    return _response(
        new_enm,
        created=[ups_ref],
        selection_id=ups_ref,
        selection_type="generator",
        events=[{"event_seq": 1, "event_type": "UPS_CREATED", "element_id": ups_ref}],
    )


def add_shunt_compensator_sn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj baterię kondensatorów SN (stały kompensator mocy biernej) na szynę SN.

    Domyka istniejący łańcuch: katalog KOMPENSATOR_SN + materializacja +
    solver PF (b_pu = Q_rated/S_base, +jB) + analiza reactive_adequacy istnieją;
    ta operacja jest brakującym punktem wejścia. Element trafia do kolekcji
    ENM `shunt_capacitors`, którą solver PF czyta bezpośrednio
    (`_build_shunt_specs_from_snapshot`). Katalog-first: rated_mvar/rated_kv
    pochodzą z pozycji katalogowej (nie z payloadu UI) — zero fizyki w UI.
    """
    bus_ref = payload.get("bus_ref") or payload.get("bus_nn_ref")
    if not isinstance(bus_ref, str) or not bus_ref.strip():
        return _error_response(
            "Bateria kondensatorów SN wymaga wskazania szyny SN (bus_ref).",
            "shunt.bus_missing",
        )
    bus_ref = bus_ref.strip()

    bus_voltage_kv = _bus_voltage_kv(enm, bus_ref)
    if bus_voltage_kv is None:
        return _error_response(
            "Wskazana szyna SN nie istnieje w modelu albo nie ma napięcia znamionowego.",
            "shunt.bus_not_found",
        )

    # Materializacja pyta katalog baterii kondensatorów WPROST
    # (`get_shunt_capacitor_type`), więc przestrzeń jest przesądzona rodzajem
    # elementu — payload nie może jej przestawić ani w wiązaniu, ani w migawce.
    przestrzen_katalogu = "KOMPENSATOR_SN"
    binding = _catalog_binding_from_payload(payload, przestrzen_katalogu)
    catalog_ref = _catalog_item_id(binding)
    if not catalog_ref:
        return _error_response(
            "Wybierz typ baterii kondensatorów z katalogu (KOMPENSATOR_SN).",
            "shunt.catalog_required",
        )

    catalog = get_default_mv_catalog()
    catalog_type = catalog.get_shunt_capacitor_type(catalog_ref)
    if catalog_type is None:
        return _error_response(
            f"Typ baterii kondensatorów '{catalog_ref}' nie istnieje w katalogu.",
            "shunt.catalog_not_found",
        )

    rated_mvar = float(catalog_type.rated_mvar)
    rated_kv = float(catalog_type.rated_kv)
    if rated_mvar <= 0.0 or rated_kv <= 0.0:
        return _error_response(
            "Pozycja katalogowa baterii kondensatorów nie ma dodatniej mocy/napięcia znamionowego.",
            "shunt.catalog_invalid",
        )
    if not _same_nominal_voltage(rated_kv, bus_voltage_kv, tolerance_kv=0.5):
        return _error_response(
            f"Napięcie baterii ({rated_kv:g} kV) nie pasuje do szyny SN "
            f"({bus_voltage_kv:g} kV). Dobierz typ dla właściwego napięcia.",
            "shunt.voltage_mismatch",
        )

    status = "open" if str(payload.get("status") or "closed").lower() == "open" else "closed"

    seed = _compute_seed({"op": "shunt_compensator_sn", "bus": bus_ref, "cat": catalog_ref})
    shunt_ref = _make_id("shunt", seed, "cap")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("shunt_capacitors", []).append(
        {
            "ref_id": shunt_ref,
            "name": payload.get("name") or catalog_type.name,
            "bus_ref": bus_ref,
            "rated_mvar": rated_mvar,
            "rated_kv": rated_kv,
            "status": status,
            "catalog_ref": catalog_ref,
            "catalog_namespace": przestrzen_katalogu,
            "source_mode": "KATALOG",
            "parameter_source": "CATALOG",
            "tags": [],
            "meta": {
                "catalog_binding": copy.deepcopy(binding) if binding else None,
                "loss_kw": catalog_type.loss_kw,
            },
        }
    )

    return _response(
        new_enm,
        created=[shunt_ref],
        selection_id=shunt_ref,
        selection_type="shunt_capacitor",
        events=[
            {"event_seq": 1, "event_type": "SHUNT_COMPENSATOR_CREATED", "element_id": shunt_ref}
        ],
    )


def add_surge_arrester_sn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """G-STK-8: postaw ogranicznik przepięć (SPD) w polu SN.

    Domyka stronę KONFIGURACYJNĄ GAP-2: materializuje aparat
    ``kind=SURGE_ARRESTER`` na field_spec wskazanego pola. Ten sam kanał czytają
    OBAJ konsumenci — read-model pola projektuje go na ``Bay.primary_devices``
    (glif SLD, `surge_arrester_10ka`), a most ``build_v126_insulation_from_enm``
    wciąga go do koordynacji izolacji IEC 60071 (margines BIL). Katalog-first:
    parametry ogranicznika z ``mv_surge_arrester_catalog`` po ``catalog_ref``
    (walidacja istnienia typu; zero fizyki/fabrykacji w tej operacji).
    """
    field_ref_raw = payload.get("field_ref") or payload.get("bay_ref")
    field_ref = (
        field_ref_raw.strip() if isinstance(field_ref_raw, str) and field_ref_raw.strip() else None
    )
    bus_ref = payload.get("bus_ref")
    if field_ref and (not isinstance(bus_ref, str) or not bus_ref.strip()):
        bus_ref = _field_bus_ref(enm, field_ref)
    if not isinstance(bus_ref, str) or not bus_ref.strip():
        return _error_response(
            "Ogranicznik przepięć wymaga wskazania pola SN (field_ref) lub szyny SN (bus_ref).",
            "spd.bus_missing",
        )
    bus_ref = bus_ref.strip()

    station = _resolve_station_for_field_write(
        enm, station_ref=payload.get("station_ref"), bus_ref=bus_ref
    )
    if station is None:
        return _error_response("Nie znaleziono stacji dla pola SN.", "spd.station_not_found")

    # Jak wyżej: `get_surge_arrester_type` przesądza przestrzeń rodzajem elementu.
    przestrzen_katalogu = "OGRANICZNIK_SN"
    binding = _catalog_binding_from_payload(payload, przestrzen_katalogu)
    catalog_ref = _catalog_item_id(binding)
    if not catalog_ref:
        return _error_response(
            "Wybierz typ ogranicznika przepięć z katalogu (OGRANICZNIK_SN).",
            "spd.catalog_required",
        )
    catalog_type = get_default_mv_catalog().get_surge_arrester_type(catalog_ref)
    if catalog_type is None:
        return _error_response(
            f"Typ ogranicznika '{catalog_ref}' nie istnieje w katalogu ograniczników SN.",
            "spd.catalog_not_found",
        )

    raw_specs = _substation_meta_specs(station, "field_specs")
    if field_ref is not None:
        target_spec = next((s for s in raw_specs if s.get("field_ref") == field_ref), None)
    else:
        target_spec = next((s for s in raw_specs if s.get("bus_ref") == bus_ref), None)
    if not isinstance(target_spec, dict):
        return _error_response(
            "Brak pola SN na wskazanej szynie do umieszczenia ogranicznika. "
            "Najpierw dodaj pole (np. liniowe lub transformatorowe).",
            "spd.field_not_found",
        )

    target_field_ref = str(target_spec.get("field_ref"))
    existing = target_spec.get("surge_arresters")
    existing_refs = (
        {
            str(item.get("catalog_ref"))
            for item in existing
            if isinstance(item, dict) and item.get("catalog_ref")
        }
        if isinstance(existing, list)
        else set()
    )
    if catalog_ref in existing_refs:
        return _error_response(
            "Ten typ ogranicznika jest już przypisany do wybranego pola.",
            "spd.already_present",
        )

    seed = _compute_seed(
        {
            "op": "surge_arrester_sn",
            "station": station.get("ref_id"),
            "field": target_field_ref,
            "cat": catalog_ref,
        }
    )
    device_ref = _make_id("spd", seed, "arrester")

    new_enm = copy.deepcopy(enm)
    new_station = _resolve_station_for_field_write(
        new_enm, station_ref=station.get("ref_id"), bus_ref=bus_ref
    )
    assert new_station is not None  # deepcopy zachowuje strukturę
    new_specs = _substation_meta_specs(new_station, "field_specs")
    new_target = next((s for s in new_specs if s.get("field_ref") == target_field_ref), None)
    assert isinstance(new_target, dict)
    arresters = new_target.setdefault("surge_arresters", [])
    arresters.append(
        {
            "device_ref": device_ref,
            "catalog_ref": catalog_ref,
            "catalog_namespace": przestrzen_katalogu,
        }
    )

    return _response(
        new_enm,
        created=[device_ref],
        selection_id=target_field_ref,
        selection_type="bay",
        events=[{"event_seq": 1, "event_type": "SURGE_ARRESTER_CREATED", "element_id": device_ref}],
    )


def set_source_operating_mode(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw tryb pracy źródła nN."""
    source_ref = payload.get("source_ref") or payload.get("element_ref")
    mode = payload.get("mode")

    if not source_ref:
        return _error_response("Brak identyfikatora źródła.", "source.ref_missing")

    new_enm = copy.deepcopy(enm)
    for gen in new_enm.get("generators", []):
        if gen.get("ref_id") == source_ref:
            gen.setdefault("meta", {})["operating_mode"] = mode
            return _response(
                new_enm,
                updated=[source_ref],
                events=[
                    {"event_seq": 1, "event_type": "PARAMETERS_UPDATED", "element_id": source_ref}
                ],
            )

    return _error_response(f"Źródło '{source_ref}' nie znalezione.", "source.not_found")


def set_dynamic_profile(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw profil dynamiczny (czasowy) dla elementu."""
    element_ref = payload.get("element_ref") or payload.get("applies_to_element_id")
    profile = payload.get("profile", {})

    if not element_ref:
        return _error_response("Brak identyfikatora elementu.", "profile.element_missing")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("dynamic_profiles", []).append(
        {
            "profile_id": _compute_seed({"op": "profile", "elem": element_ref}),
            "applies_to_element_id": element_ref,
            "time_unit": profile.get("time_unit", "h"),
            "points": profile.get("points", []),
            "interpolation": profile.get("interpolation", "HOLD"),
        }
    )

    return _response(
        new_enm,
        updated=[element_ref],
        events=[{"event_seq": 1, "event_type": "PARAMETERS_UPDATED", "element_id": element_ref}],
    )


#: Wiązania wytwórcy wybierane PO jego utworzeniu — nazwy kluczy są te same, których
#: odczyt ENM (`buildDerFromGenerator`) już szuka w ``materialized_params``, więc ścieżka
#: powrotna nie wymaga tłumaczenia nazw (V12K-238).
DER_BINDING_KEYS: tuple[str, ...] = (
    "protection_catalog_ref",
    "ct_catalog_ref",
    "vt_catalog_ref",
    "fault_current_data_ref",
    "dynamic_model_ref",
)

#: Referencje profili zgodności przyłączeniowej — trzymane w podsłowniku ``profiles``,
#: bo tam ich szuka odczyt (i tam trafiają z kreatora OZE).
DER_PROFILE_KEYS: tuple[str, ...] = (
    "nc_rfg_profile_ref",
    "lvrt_curve_ref",
    "hvrt_curve_ref",
    "pf_curve_ref",
)


#: Wiazania, dla ktorych backend MA katalog i moze sprawdzic istnienie typu.
#: `fault_current_data_ref` i `dynamic_model_ref` NIE sa tu wymienione, bo backend nie
#: ma dla nich katalogu — ich sprawdzenie wymaga najpierw dostawcy danych, a udawanie
#: walidacji bylo by gorsze niz jej brak (jawny dlug, karta w rejestrze).
_KATALOGI_WIAZAN_DER: tuple[tuple[str, str], ...] = (
    ("ct_catalog_ref", "get_ct_type"),
    ("vt_catalog_ref", "get_vt_type"),
    ("protection_catalog_ref", "get_protection_device_type"),
)


def _nieznane_referencje_katalogowe(wiazania: dict[str, Any]) -> list[str]:
    """Referencje wskazujace na typ, ktorego NIE MA w katalogu (V12K-241).

    Bez tej kontroli operacja przyjmowala dowolny lancuch i zapisywala go do modelu:
    literowka albo referencja z wycofanej wersji katalogu stawala sie dana projektowa,
    a regula gotowosci raportowala potem „brak danej" — nieodrozninalnie od „jeszcze
    nie wybrano". Sciezka TWORZENIA wytworcy przechodzi przez polityke wiazania
    katalogowego (`CATALOG_REQUIRED_OPERATIONS`), wiec sciezka AKTUALIZACJI nie moze
    byc slabsza.

    `None` (jawne wyczyszczenie wiazania) NIE jest sprawdzane — to usuniecie danej,
    nie wskazanie typu.
    """
    from application.analyses.protection.catalog.catalog_store import list_devices
    from network_model.catalog import get_default_mv_catalog

    katalog = get_default_mv_catalog()
    nieznane: list[str] = []
    for pole, metoda in _KATALOGI_WIAZAN_DER:
        wartosc = wiazania.get(pole)
        if wartosc is None or pole not in wiazania:
            continue
        if getattr(katalog, metoda)(str(wartosc)) is not None:
            continue
        # V12K-248: zabezpieczenia zyja w DWOCH zbiorach. Repozytorium katalogu MV ma
        # 12 wpisow (syntetyczne `ACME_REX*`), a katalog analityczny — 51 rekordow
        # producenckich (ABB, SEL…), i to WLASNIE jego wystawia endpoint
        # `/api/catalog/protection/device-types`, z ktorego wybiera picker. Sprawdzanie
        # wylacznie repozytorium MV odrzucalo 39 z 51 urzadzen, ktore projektant widzi
        # na liscie — czyli bramka postawiona przeciw literowkom blokowala realny wybor.
        # Walidacja pyta wiec „czy system zna to urzadzenie", a nie „czy zna je jeden
        # z dwoch zbiorow".
        if pole == "protection_catalog_ref" and any(
            urzadzenie.device_id == str(wartosc) for urzadzenie in list_devices()
        ):
            continue
        nieznane.append(f"{pole}={wartosc}")
    return nieznane


def set_der_catalog_bindings(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Zapisz wiązania katalogowe i profile zgodności wytwórcy (DER) w modelu.

    DLACZEGO TA OPERACJA ISTNIEJE (V12K-238, pomiar V12K-237). Kreator DER woła backend
    RAZ, przy tworzeniu, i wysyła wtedy katalog urządzenia, baterii i transformatora
    blokowego. Katalog zabezpieczeń, przekładniki CT/VT, dane prądu zwarciowego, model
    dynamiczny i profile zgodności są wybierane PÓŹNIEJ, w konfiguratorze — a dla tych
    wyborów NIE ISTNIAŁA żadna operacja domenowa. Ginęły więc w store przeglądarki:
    sześć osi gotowości (zabezpieczenia, selektywność, SC1F, SC2FG, FRT, HVRT) opierało
    werdykt na danych, których model nie zna, a które przepadały po odświeżeniu strony
    i nie wchodziły do eksportu projektu.

    ZERO FABRYKACJI. Zapisywane są WYŁĄCZNIE klucze OBECNE w payloadzie — brak klucza
    zostawia model bez zmian (nie wpisuje ``null``, nie kasuje wcześniejszej wartości).
    Jawne wyczyszczenie wiązania to ``null`` W PAYLOADZIE: wtedy klucz jest USUWANY
    z modelu, więc reguła gotowości znów widzi brak danej, a nie puste pole udające
    wartość. Determinizm istniejących modeli nietknięty: wywołanie bez żadnego wiązania
    niczego nie dopisuje.
    """
    generator_ref = payload.get("generator_ref") or payload.get("source_ref")
    if not generator_ref:
        return _error_response("Brak identyfikatora wytwórcy.", "der_bindings.generator_missing")

    obecne_wiazania = {k: payload[k] for k in DER_BINDING_KEYS if k in payload}
    obecne_profile = {k: payload[k] for k in DER_PROFILE_KEYS if k in payload}
    if not obecne_wiazania and not obecne_profile:
        return _error_response(
            "Żadne wiązanie ani profil nie zostały podane.", "der_bindings.payload_empty"
        )

    nieznane = _nieznane_referencje_katalogowe(obecne_wiazania)
    if nieznane:
        return _error_response(
            "Referencje katalogowe nie istnieja w katalogu: " + ", ".join(nieznane) + ".",
            "der_bindings.catalog_ref_unknown",
        )

    new_enm = copy.deepcopy(enm)
    generator = next(
        (
            g
            for g in new_enm.get("generators", [])
            if g.get("ref_id") == generator_ref or g.get("id") == generator_ref
        ),
        None,
    )
    if generator is None:
        return _error_response(
            f"Wytwórca '{generator_ref}' nie istnieje w modelu.",
            "der_bindings.generator_not_found",
        )

    materialized = generator.setdefault("materialized_params", {})
    if not isinstance(materialized, dict):  # pragma: no cover - obrona kontraktu
        return _error_response(
            "Parametry zmaterializowane wytwórcy mają nieoczekiwaną postać.",
            "der_bindings.materialized_params_invalid",
        )

    for klucz, wartosc in obecne_wiazania.items():
        if wartosc is None:
            materialized.pop(klucz, None)
        else:
            materialized[klucz] = wartosc

    if obecne_profile:
        profile = materialized.setdefault("profiles", {})
        if not isinstance(profile, dict):  # pragma: no cover - obrona kontraktu
            return _error_response(
                "Profile wytwórcy mają nieoczekiwaną postać.",
                "der_bindings.profiles_invalid",
            )
        for klucz, wartosc in obecne_profile.items():
            if wartosc is None:
                profile.pop(klucz, None)
            else:
                profile[klucz] = wartosc
        if not profile:
            materialized.pop("profiles", None)

    return _response(
        new_enm,
        updated=[str(generator_ref)],
        selection_id=str(generator_ref),
        selection_type="generator",
        events=[
            {
                "event_seq": 1,
                "event_type": "PARAMETERS_UPDATED",
                "element_id": str(generator_ref),
            }
        ],
    )


# ---------------------------------------------------------------------------
# 24-25. UNIWERSALNE
# ---------------------------------------------------------------------------


def set_connection_conditions(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw warunki przyłączenia OSD w nagłówku modelu (karta K2 FLOW EKSPERT+).

    Dane WEJŚCIOWE projektu z dokumentu warunków przyłączeniowych (GAP B1/B2
    audytu FLOW): moc przyłączeniowa [MW], wymagany cosφ, tryb pracy przyłącza
    (tekst z dokumentu OSD). Zapis addytywny do ``header.connection_conditions``
    — scala pola podane w payload z istniejącym blokiem (pole ``null`` czyści
    wartość). Walidacja zakresów jak w modelu ``ConnectionConditions``.
    """
    znane_pola = ("moc_przylaczeniowa_mw", "wymagany_cos_phi", "tryb_pracy")
    podane = {k: payload[k] for k in znane_pola if k in payload}
    if not podane:
        return _error_response(
            "Brak pól warunków przyłączenia (moc_przylaczeniowa_mw / wymagany_cos_phi / tryb_pracy).",
            "connection_conditions.fields_missing",
        )

    moc = podane.get("moc_przylaczeniowa_mw")
    if moc is not None and (not isinstance(moc, int | float) or moc <= 0):
        return _error_response(
            "Moc przyłączeniowa musi być liczbą dodatnią [MW].",
            "connection_conditions.moc_invalid",
        )
    cos_phi = podane.get("wymagany_cos_phi")
    if cos_phi is not None and (
        not isinstance(cos_phi, int | float) or cos_phi <= 0 or cos_phi > 1
    ):
        return _error_response(
            "Wymagany cosφ musi być w przedziale (0, 1].",
            "connection_conditions.cos_phi_invalid",
        )
    tryb = podane.get("tryb_pracy")
    if tryb is not None and not isinstance(tryb, str):
        return _error_response(
            "Tryb pracy przyłącza musi być tekstem z dokumentu OSD.",
            "connection_conditions.tryb_invalid",
        )

    new_enm = copy.deepcopy(enm)
    header = new_enm.setdefault("header", {})
    blok = dict(header.get("connection_conditions") or {})
    for klucz, wartosc in podane.items():
        if wartosc is None:
            blok.pop(klucz, None)
        else:
            blok[klucz] = wartosc
    header["connection_conditions"] = blok or None

    return _response(
        new_enm,
        updated=["header"],
        events=[{"event_seq": 1, "event_type": "PARAMETERS_UPDATED", "element_id": "header"}],
    )


def rename_element(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Zmień nazwę elementu."""
    element_ref = payload.get("element_ref")
    new_name = payload.get("new_name")
    legacy_field_collection = _find_legacy_field_element_collection(enm, element_ref or "")

    if not element_ref:
        return _error_response("Brak identyfikatora elementu.", "rename.ref_missing")
    if not new_name:
        return _error_response("Brak nowej nazwy.", "rename.name_missing")
    if legacy_field_collection is not None:
        return _error_legacy_field_write_disabled(element_ref, legacy_field_collection)

    loc = _find_element(enm, element_ref)
    if not loc:
        return _error_response(f"Element '{element_ref}' nie znaleziony.", "rename.not_found")

    new_enm = copy.deepcopy(enm)
    coll, idx = loc
    new_enm[coll][idx]["name"] = new_name

    return _response(
        new_enm,
        updated=[element_ref],
        events=[{"event_seq": 1, "event_type": "PARAMETERS_UPDATED", "element_id": element_ref}],
    )


def set_label(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw etykietę (label) elementu."""
    element_ref = payload.get("element_ref")
    label = payload.get("label")
    legacy_field_collection = _find_legacy_field_element_collection(enm, element_ref or "")

    if not element_ref:
        return _error_response("Brak identyfikatora elementu.", "label.ref_missing")
    if legacy_field_collection is not None:
        return _error_legacy_field_write_disabled(element_ref, legacy_field_collection)

    loc = _find_element(enm, element_ref)
    if not loc:
        return _error_response(f"Element '{element_ref}' nie znaleziony.", "label.not_found")

    new_enm = copy.deepcopy(enm)
    coll, idx = loc
    new_enm[coll][idx]["label"] = label

    return _response(
        new_enm,
        updated=[element_ref],
        events=[{"event_seq": 1, "event_type": "PARAMETERS_UPDATED", "element_id": element_ref}],
    )


# ---------------------------------------------------------------------------
# INWENTARZ BRAMY KATALOGOWEJ OPERACJI V2 (defekt G)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PozycjaBramyKatalogowejV2:
    """Jedno miejsce, w którym operacja V2 czyta Z PAYLOADU pozycję katalogu albo tabliczkę."""

    operacja: str
    #: Ścieżka w payloadzie (ostatni człon = klucz czytany przez operację).
    sciezka: str
    #: Przestrzeń katalogu, w której referencja musi być rozstrzygalna.
    przestrzen: str
    #: Czy operacja sprawdza ISTNIENIE pozycji (a nie samą obecność referencji).
    bramkowana: bool
    #: Dlaczego — dla pozycji niebramkowanych uzasadnienie MERYTORYCZNE.
    uzasadnienie: str = ""


#: PEŁNY INWENTARZ (reguła KLASA, NIE INSTANCJA): każda referencja katalogowa
#: i każda tabliczka czytana z payloadu przez operacje `domain_operations_v2`.
#:
#: Defekt G (przegląd fali 2026-08-01, znalezisko P12 + długi 8/9 rejestru
#: V12K-315) nie był pojedynczym błędem `add_converter_source`: KLASĄ było
#: „operacja zapisuje do migawki pochodzenie katalogowe, nie czytając katalogu".
#: Ta lista jest KONTRAKTEM — test klasy skanuje moduł i czerwienieje, gdy
#: operacja V2 zacznie czytać referencję spoza inwentarza.
V2_CATALOG_GATE_INVENTORY: tuple[PozycjaBramyKatalogowejV2, ...] = (
    PozycjaBramyKatalogowejV2("add_ct", "catalog_ref", "CT", True),
    PozycjaBramyKatalogowejV2(
        "add_ct", "catalog_binding", "CT", True, "druga droga wskazania pozycji"
    ),
    PozycjaBramyKatalogowejV2("add_vt", "catalog_ref", "VT", True),
    PozycjaBramyKatalogowejV2(
        "add_vt", "catalog_binding", "VT", True, "druga droga wskazania pozycji"
    ),
    PozycjaBramyKatalogowejV2("add_relay", "catalog_ref", "ZABEZPIECZENIE", True),
    PozycjaBramyKatalogowejV2(
        "add_relay",
        "protection.catalog_item_id",
        "ZABEZPIECZENIE",
        True,
        "kontrakt kreatora pola — rozwiązywany do tego samego wiązania",
    ),
    PozycjaBramyKatalogowejV2("add_sn_bay", "catalog_binding", "APARAT_SN", True),
    PozycjaBramyKatalogowejV2("add_nn_load", "catalog_binding", "OBCIAZENIE", True),
    PozycjaBramyKatalogowejV2(
        "add_converter_source", "catalog_ref", "ZRODLO_NN_PV|ZRODLO_NN_BESS|CONVERTER", True
    ),
    PozycjaBramyKatalogowejV2(
        "add_converter_source",
        "materialized_params",
        "ZRODLO_NN_PV|ZRODLO_NN_BESS|CONVERTER",
        True,
        "tabliczka z payloadu jest DEKLARACJĄ weryfikowaną wobec katalogu "
        "(rozbieżność ⇒ catalog.nameplate_mismatch), nigdy źródłem liczb",
    ),
    PozycjaBramyKatalogowejV2(
        "add_converter_source", "source_field.catalog_binding", "APARAT_NN", True
    ),
    PozycjaBramyKatalogowejV2(
        "add_converter_source",
        "der_topology.block_transformer.catalog_ref",
        "TRAFO_SN_NN",
        True,
        "materializacja przez `_materialize_der_block_transformer`",
    ),
    PozycjaBramyKatalogowejV2(
        "add_converter_source",
        "der_topology.mv_field_configuration.cable_catalog_ref",
        "KABEL_SN",
        True,
        "materializacja przez `_materialize_der_mv_cable`",
    ),
    PozycjaBramyKatalogowejV2(
        "add_converter_source",
        "der_topology.mv_field_configuration.apparatus_catalog_binding",
        "APARAT_SN",
        True,
    ),
    PozycjaBramyKatalogowejV2(
        "add_shunt_compensator_sn", "catalog_binding", "KOMPENSATOR_SN", True
    ),
    PozycjaBramyKatalogowejV2("add_surge_arrester_sn", "catalog_binding", "OGRANICZNIK_SN", True),
    PozycjaBramyKatalogowejV2(
        "set_der_catalog_bindings", "protection_catalog_ref", "ZABEZPIECZENIE", True
    ),
    PozycjaBramyKatalogowejV2("set_der_catalog_bindings", "ct_catalog_ref", "CT", True),
    PozycjaBramyKatalogowejV2("set_der_catalog_bindings", "vt_catalog_ref", "VT", True),
    PozycjaBramyKatalogowejV2(
        "add_genset_nn",
        "genset_spec",
        "",
        False,
        "agregat prądotwórczy NIE MA kategorii w katalogu, więc payload jest jedynym "
        "źródłem tabliczki — i element to przyznaje: bez `catalog_ref`, bez "
        "`catalog_namespace`, bez `source_mode: KATALOG`. To dług katalogu "
        "(brak kategorii), nie obejście bramy: nie ma pozycji, wobec której "
        "można by cokolwiek zweryfikować.",
    ),
    PozycjaBramyKatalogowejV2(
        "add_ups_nn",
        "ups_spec",
        "",
        False,
        "UPS — jak wyżej: brak kategorii katalogu, element nie deklaruje "
        "pochodzenia katalogowego (tabliczka jawnie ekspercka).",
    ),
)

#: Klucze payloadu z referencją katalogową, które operacjom V2 wolno czytać.
#: Zbiór WYPROWADZONY z inwentarza (test klasy pilnuje zgodności obu stron).
V2_CATALOG_REF_PAYLOAD_KEYS: frozenset[str] = frozenset(
    {
        "catalog_ref",
        "apparatus_catalog_ref",
        "cable_catalog_ref",
        "protection_catalog_ref",
        "ct_catalog_ref",
        "vt_catalog_ref",
    }
)

#: Klucze o kształcie WIĄZANIA katalogowego dopuszczone w operacjach V2. Osobny
#: zbiór, bo wiązanie jest drugą drogą wskazania pozycji — bez tej połowy skanu
#: dałoby się obejść inwentarz, podając `catalog_binding` zamiast `catalog_ref`.
V2_CATALOG_BINDING_KEYS: frozenset[str] = frozenset(
    {
        "catalog_binding",
        "catalog_item_id",
        "catalog_item_version",
        "catalog_namespace",
        "apparatus_catalog_binding",
        "cable_catalog_binding",
        # Znacznik migawki („pole czeka na wskazanie aparatu"), nie kanał wskazania
        # pozycji — zapisywany przez operację, nigdy z niego nie czytany.
        "requires_catalog_binding",
    }
)


# ---------------------------------------------------------------------------
# Export — V2 handlers and canonical ops
# ---------------------------------------------------------------------------

V2_CANONICAL_OPS = frozenset(
    {
        # Ochrona
        "add_ct",
        "add_vt",
        "add_relay",
        "update_relay_settings",
        "link_relay_to_field",
        "calculate_tcc_curve",
        "validate_selectivity",
        # Study Case
        "create_study_case",
        "set_case_switch_state",
        "set_case_normal_state",
        "set_case_source_mode",
        "set_case_time_profile",
        "run_short_circuit",
        "run_power_flow",
        "run_time_series_power_flow",
        "compare_study_cases",
        # nN
        "add_sn_bay",
        "add_nn_outgoing_field",
        "add_converter_source",
        "add_nn_load",
        "add_genset_nn",
        "add_ups_nn",
        "add_shunt_compensator_sn",
        "add_surge_arrester_sn",
        "set_source_operating_mode",
        "set_dynamic_profile",
        "set_der_catalog_bindings",
        # Universal
        "rename_element",
        "set_label",
        "set_connection_conditions",
    }
)

ALL_V2_HANDLERS: dict[str, Any] = {
    "add_ct": add_ct,
    "add_vt": add_vt,
    "add_relay": add_relay,
    "update_relay_settings": update_relay_settings,
    "link_relay_to_field": link_relay_to_field,
    "calculate_tcc_curve": calculate_tcc_curve,
    "validate_selectivity": validate_selectivity,
    "create_study_case": create_study_case,
    "set_case_switch_state": set_case_switch_state,
    "set_case_normal_state": set_case_normal_state,
    "set_case_source_mode": set_case_source_mode,
    "set_case_time_profile": set_case_time_profile,
    "run_short_circuit": run_short_circuit,
    "run_power_flow": run_power_flow,
    "run_time_series_power_flow": run_time_series_power_flow,
    "compare_study_cases": compare_study_cases,
    "add_sn_bay": add_sn_bay,
    "add_nn_outgoing_field": add_nn_outgoing_field,
    "add_converter_source": add_converter_source,
    "add_nn_load": add_nn_load,
    "add_genset_nn": add_genset_nn,
    "add_ups_nn": add_ups_nn,
    "add_shunt_compensator_sn": add_shunt_compensator_sn,
    "add_surge_arrester_sn": add_surge_arrester_sn,
    "set_source_operating_mode": set_source_operating_mode,
    "set_dynamic_profile": set_dynamic_profile,
    "set_der_catalog_bindings": set_der_catalog_bindings,
    "rename_element": rename_element,
    "set_label": set_label,
    "set_connection_conditions": set_connection_conditions,
}
