"""
Operacje domenowe V2 — ochrona, Study Case, źródła nN, operacje uniwersalne.

Rozszerzenie domain_operations.py o brakujące operacje z Fazy 1.1 specyfikacji.
Każda operacja jest deterministyczna i generuje zdarzenia domenowe.

BINDING: Komunikaty po polsku, brak kodów projektowych.
"""

from __future__ import annotations

import copy
import json
from typing import Any

from network_model.catalog.materialization import materialize_catalog_binding
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CatalogBinding

from .domain_operations import (
    _build_field_spec,
    _compute_seed,
    _error_legacy_field_write_disabled,
    _error_response,
    _find_element,
    _find_legacy_field_element_collection,
    _make_id,
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
    points = []
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
        catalog_namespace = normalized.get("catalog_namespace")
        if not isinstance(catalog_namespace, str) or not catalog_namespace.strip():
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


def _catalog_namespace(binding: dict[str, Any] | None, fallback: str) -> str:
    if isinstance(binding, dict):
        namespace = binding.get("catalog_namespace")
        if isinstance(namespace, str) and namespace.strip():
            return namespace.strip()
    return fallback


def _catalog_item_id(binding: dict[str, Any] | None) -> str | None:
    if not isinstance(binding, dict):
        return None
    for key in ("catalog_item_id", "catalog_ref", "id"):
        value = binding.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


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


def _relay_catalog_binding(payload: dict[str, Any]) -> dict[str, Any] | None:
    protection = payload.get("protection")
    if isinstance(protection, dict):
        item_id = protection.get("catalog_item_id") or protection.get("catalog_ref")
        if isinstance(item_id, str) and item_id.strip():
            return {
                "catalog_namespace": "ZABEZPIECZENIE",
                "catalog_item_id": item_id.strip(),
                "catalog_item_version": protection.get("catalog_item_version") or "2024.1",
            }
    return _catalog_binding_from_payload(payload, "ZABEZPIECZENIE")


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
    bus_ref: str,
) -> dict[str, Any] | None:
    if station_ref:
        for sub in enm.get("substations", []):
            if sub.get("ref_id") == station_ref or sub.get("id") == station_ref:
                return sub
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

    binding = _catalog_binding_from_payload(payload, "CT")
    catalog_ref, catalog_error = _resolve_catalog_ref(payload.get("catalog_ref"), binding)
    if catalog_error or not catalog_ref:
        return _error_response(
            "Przekładnik prądowy CT wymaga wyboru pozycji katalogowej.",
            catalog_error or "ct.catalog_required",
        )

    primary = payload.get("ratio_primary_a")
    secondary = payload.get("ratio_secondary_a")
    if primary is None or secondary is None:
        return _error_response(
            "Przekładnik CT wymaga przekładni pierwotnej i wtórnej.",
            "ct.ratio_missing",
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
    result = create_measurement(
        enm,
        {
            "ref_id": measurement_ref,
            "name": payload.get("name") or f"CT pola {field_ref}",
            "measurement_type": "CT",
            "bus_ref": bus_ref,
            "bay_ref": field_ref,
            "rating": {
                "ratio_primary": float(primary),
                "ratio_secondary": float(secondary),
                "accuracy_class": payload.get("accuracy_class"),
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
                    "catalog_namespace": _catalog_namespace(binding, "CT"),
                    "parameter_source": "CATALOG",
                    "source_mode": "KATALOG",
                    "materialized_params": {
                        "catalog_item_id": catalog_ref,
                        "ratio_primary_a": float(primary),
                        "ratio_secondary_a": float(secondary),
                        "accuracy_class": payload.get("accuracy_class"),
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

    binding = _catalog_binding_from_payload(payload, "VT")
    catalog_ref, catalog_error = _resolve_catalog_ref(payload.get("catalog_ref"), binding)
    if catalog_error or not catalog_ref:
        return _error_response(
            "Przekładnik napięciowy VT wymaga wyboru pozycji katalogowej.",
            catalog_error or "vt.catalog_required",
        )

    primary = payload.get("ratio_primary_v")
    secondary = payload.get("ratio_secondary_v")
    if primary is None or secondary is None:
        return _error_response(
            "Przekładnik VT wymaga przekładni pierwotnej i wtórnej.",
            "vt.ratio_missing",
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
    result = create_measurement(
        enm,
        {
            "ref_id": measurement_ref,
            "name": payload.get("name") or f"VT pola {field_ref}",
            "measurement_type": "VT",
            "bus_ref": bus_ref,
            "bay_ref": field_ref,
            "rating": {
                "ratio_primary": float(primary),
                "ratio_secondary": float(secondary),
                "accuracy_class": payload.get("accuracy_class"),
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
                    "catalog_namespace": _catalog_namespace(binding, "VT"),
                    "parameter_source": "CATALOG",
                    "source_mode": "KATALOG",
                    "materialized_params": {
                        "catalog_item_id": catalog_ref,
                        "ratio_primary_v": float(primary),
                        "ratio_secondary_v": float(secondary),
                        "accuracy_class": payload.get("accuracy_class"),
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

    binding = _relay_catalog_binding(payload)
    catalog_ref, catalog_error = _resolve_catalog_ref(payload.get("catalog_ref"), binding)
    if catalog_error or not catalog_ref:
        return _error_response(
            "Zabezpieczenie pola SN wymaga wyboru pozycji katalogowej.",
            catalog_error or "relay.catalog_required",
        )

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
    result = attach_protection(
        enm,
        {
            "ref_id": protection_ref,
            "name": payload.get("name") or f"Zabezpieczenie pola {field_ref}",
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
                    "catalog_namespace": _catalog_namespace(binding, "ZABEZPIECZENIE"),
                    "parameter_source": "CATALOG",
                    "source_mode": "KATALOG",
                    "materialized_params": {
                        "catalog_item_id": catalog_ref,
                        "relay_type": relay_type_text,
                        "device_type": device_type,
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
        ref
        for ref in station.get("transformer_refs", [])
        if isinstance(ref, str) and ref.strip()
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
        ref
        for ref in station.get("transformer_refs", [])
        if isinstance(ref, str) and ref.strip()
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


def _materialize_nn_source_params(
    *,
    namespace: str,
    catalog_ref: str,
    required_fields: list[str],
    explicit_params: object,
) -> tuple[dict[str, Any] | None, str | None]:
    if explicit_params is not None:
        return _validate_required_materialization(explicit_params, required_fields)

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
        return _validate_required_materialization(
            {
                "un_kv": result.solver_fields.get("un_kv"),
                "rated_power_ac_kw": result.solver_fields.get("s_n_kva"),
                "max_power_kw": result.solver_fields.get("p_max_kw"),
                "control_mode": result.solver_fields.get("control_mode"),
            },
            required_fields,
        )

    if namespace == "ZRODLO_NN_BESS":
        return _validate_required_materialization(
            {
                "un_kv": result.solver_fields.get("un_kv"),
                "usable_capacity_kwh": result.solver_fields.get("e_kwh"),
                "charge_power_kw": result.solver_fields.get("p_charge_kw"),
                "discharge_power_kw": result.solver_fields.get("p_discharge_kw"),
            },
            required_fields,
        )

    return None, "catalog.materialization_incomplete"


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
    field_name = (
        field_name_raw.strip()
        if isinstance(field_name_raw, str) and field_name_raw.strip()
        else (
            existing_field.get("name")
            if isinstance(existing_field, dict) and isinstance(existing_field.get("name"), str)
            else _default_sn_bay_name(bay_role)
        )
    )
    terminal_bus_ref = _make_id("sn", seed, "bay_terminal")
    apparatus_ref = _make_id("sn", seed, "bay_device")
    voltage_kv = _bus_voltage_kv(enm, bus_ref)
    if voltage_kv is None:
        return _error_response(
            "Nie znaleziono napięcia szyny SN dla pola.", "sn.bus_voltage_missing"
        )
    catalog_binding = _catalog_binding_from_payload(payload, "APARAT_SN")
    catalog_namespace = _catalog_namespace(catalog_binding, "APARAT_SN")
    catalog_ref = _catalog_item_id(catalog_binding)
    branch_type = _sn_bay_branch_type(apparatus_kind)

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
            branch["source_mode"] = "KATALOG"
            branch["catalog_namespace"] = catalog_namespace
            branch["catalog_ref"] = catalog_ref
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
            _update_field_spec(
                new_enm,
                field_ref,
                {
                    "name": field_name,
                    "bay_role": bay_role,
                    "equipment_refs": existing_equipment_refs,
                    "gpz_section_id": gpz_section_id if isinstance(gpz_section_id, str) else None,
                    "meta": {
                        **(
                            existing_field.get("meta")
                            if isinstance(existing_field.get("meta"), dict)
                            else {}
                        ),
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
            "source_mode": "KATALOG",
            "catalog_namespace": catalog_namespace,
            "catalog_ref": catalog_ref,
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
    catalog_binding = _catalog_binding_from_payload(payload, "OBCIAZENIE")
    catalog_ref = _catalog_item_id(catalog_binding)

    if not feeder_ref:
        return _error_response("Brak identyfikatora odpływu (feeder_ref).", "nn.feeder_missing")
    if not isinstance(feeder_ref, str) or not _field_ref_exists(enm, feeder_ref):
        return _error_response("Wskazany odpływ nN nie istnieje w modelu.", "nn.feeder_not_found")

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
            "q_mvar": (payload.get("reactive_power_kvar") or 0) / 1000.0,
            # Load.model akceptuje 'pq' | 'zip' — 'pq' = constant power (klasyczny PQ).
            "model": "pq",
            "catalog_ref": catalog_ref,
            "catalog_namespace": _catalog_namespace(catalog_binding, "OBCIAZENIE"),
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
    technology = payload.get("source_technology")
    if isinstance(technology, str):
        normalized = technology.strip().upper()
        if normalized in {"PV", "BESS", "FW"}:
            return normalized
    return None


def _legacy_converter_spec(payload: dict[str, Any], technology: str) -> dict[str, Any]:
    if technology == "PV" and isinstance(payload.get("pv_spec"), dict):
        return payload["pv_spec"]
    if technology == "BESS" and isinstance(payload.get("bess_spec"), dict):
        return payload["bess_spec"]
    return {}


def _resolve_converter_catalog_namespace(payload: dict[str, Any], technology: str) -> str:
    binding = payload.get("catalog_binding")
    if isinstance(binding, dict):
        namespace = binding.get("catalog_namespace")
        if isinstance(namespace, str) and namespace.strip():
            return namespace.strip()
    if technology == "PV":
        return "ZRODLO_NN_PV"
    if technology == "BESS":
        return "ZRODLO_NN_BESS"
    return "CONVERTER"


def _resolve_converter_catalog_ref(
    payload: dict[str, Any], technology: str
) -> tuple[str | None, str | None]:
    direct_ref: object = payload.get("catalog_ref")
    if direct_ref is None:
        materialized = payload.get("materialized_params")
        if isinstance(materialized, dict):
            direct_ref = materialized.get("catalog_item_id")
    return _resolve_catalog_ref(direct_ref, payload.get("catalog_binding"))


def _build_converter_materialized_params(
    *,
    technology: str,
    payload: dict[str, Any],
    catalog_ref: str,
) -> tuple[dict[str, Any], str | None]:
    explicit = payload.get("materialized_params")
    if isinstance(explicit, dict) and explicit:
        return dict(explicit), None

    if technology == "PV":
        materialized_params, error = _materialize_nn_source_params(
            namespace="ZRODLO_NN_PV",
            catalog_ref=catalog_ref,
            explicit_params=None,
            required_fields=["un_kv", "rated_power_ac_kw", "max_power_kw", "control_mode"],
        )
        if error or materialized_params is None:
            return {}, error or "catalog.materialization_incomplete"
        return {
            "catalog_item_id": catalog_ref,
            "catalog_item_version": "2024.1",
            "rated_power_ac_kw": materialized_params.get("rated_power_ac_kw"),
            "max_power_kw": materialized_params.get("max_power_kw"),
            "control_mode": materialized_params.get("control_mode"),
            "un_kv": materialized_params.get("un_kv"),
            "pmax_mw": _kw_to_mw(materialized_params.get("max_power_kw")),
            "sn_mva": _kw_to_mw(materialized_params.get("rated_power_ac_kw")),
        }, None

    if technology == "BESS":
        materialized_params, error = _materialize_nn_source_params(
            namespace="ZRODLO_NN_BESS",
            catalog_ref=catalog_ref,
            explicit_params=None,
            required_fields=[
                "un_kv",
                "usable_capacity_kwh",
                "charge_power_kw",
                "discharge_power_kw",
            ],
        )
        if error or materialized_params is None:
            return {}, error or "catalog.materialization_incomplete"
        return {
            "catalog_item_id": catalog_ref,
            "catalog_item_version": "2024.1",
            "usable_capacity_kwh": materialized_params.get("usable_capacity_kwh"),
            "charge_power_kw": materialized_params.get("charge_power_kw"),
            "discharge_power_kw": materialized_params.get("discharge_power_kw"),
            "operation_mode": payload.get("bess_mode"),
            "un_kv": materialized_params.get("un_kv"),
            "pmax_mw": _kw_to_mw(materialized_params.get("discharge_power_kw")),
            "sn_mva": _kw_to_mw(materialized_params.get("discharge_power_kw")),
            "e_kwh": materialized_params.get("usable_capacity_kwh"),
        }, None

    # K30-15: FW (turbiny wiatrowe) — brak dedykowanego namespace materializacji
    # (catalog jest w CONVERTER_WIND list, nie indexed przez get_wind_inverter_type).
    # Inline lookup z mv_converter_catalog dla un_kv, pmax_mw bez namespace pipeline.
    if technology == "FW":
        from network_model.catalog.mv_converter_catalog import get_wind_types

        wind_types = get_wind_types()
        match = next((w for w in wind_types if w.get("id") == catalog_ref), None)
        if match is None:
            return {}, "catalog.fw_type_not_found"
        params = match.get("params") or {}
        if not params.get("un_kv"):
            return {}, "catalog.materialization_incomplete"
        return {
            "catalog_item_id": catalog_ref,
            "catalog_item_version": "2024.1",
            "un_kv": float(params.get("un_kv")),
            "pmax_mw": float(params.get("pmax_mw") or 0.0),
            "sn_mva": float(params.get("sn_mva") or params.get("pmax_mw") or 0.0),
            "qmin_mvar": params.get("qmin_mvar"),
            "qmax_mvar": params.get("qmax_mvar"),
            "control_mode": params.get("control_mode") or payload.get("control_mode"),
        }, None

    return {
        "catalog_item_id": catalog_ref,
        "catalog_item_version": "2024.1",
    }, None


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
            "quantity": quantity,
        },
        explicit_power_mw if explicit_power_mw is not None else (default_power or 0.0) * quantity,
    )


def _legacy_converter_binding(
    legacy_spec: dict[str, Any],
    *,
    technology: str,
) -> dict[str, Any] | None:
    binding = legacy_spec.get("catalog_binding")
    if isinstance(binding, dict):
        return binding

    item_id_key = "catalog_item_id" if technology == "PV" else "inverter_catalog_id"
    version_key = "catalog_item_version" if technology == "PV" else "inverter_catalog_version"
    item_id = legacy_spec.get(item_id_key)
    if not isinstance(item_id, str) or not item_id.strip():
        return None

    binding = {
        "catalog_namespace": "ZRODLO_NN_PV" if technology == "PV" else "ZRODLO_NN_BESS",
        "catalog_item_id": item_id.strip(),
        "catalog_item_version": "2024.1",
        "materialize": True,
        "snapshot_mapping_version": "1.0",
    }
    version = legacy_spec.get(version_key)
    if isinstance(version, str) and version.strip():
        binding["catalog_item_version"] = version.strip()
    return binding


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
        field_meta["catalog_binding"] = apparatus_binding
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
    connection_variant = _VARIANT_ALIASES.get(connection_variant_raw, connection_variant_raw)
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
            # Quick lookup converter un_kv z catalog without full materialization
            converter_un_kv: float | None = None
            try:
                _tmp_mp, _err = _build_converter_materialized_params(
                    technology=technology, payload=payload, catalog_ref=catalog_ref
                )
                if not _err:
                    converter_un_kv = _as_float(_tmp_mp.get("un_kv"))
            except Exception:
                converter_un_kv = None
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
        payload=payload,
        catalog_ref=catalog_ref,
    )
    if materialization_error:
        return _error_response(
            f"Źródło {technology} wymaga kompletnej materializacji parametrów katalogowych.",
            materialization_error,
        )

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
    seed_payload = {
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
            "catalog_namespace": _resolve_converter_catalog_namespace(payload, technology),
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

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("generators", []).append(
        {
            "ref_id": gen_ref,
            "name": genset_spec.get("source_name") or "Agregat",
            "bus_ref": bus_nn_ref,
            "gen_type": "GENSET",
            "p_mw": (genset_spec.get("rated_power_kw") or 0) / 1000.0,
            "q_mvar": 0.0,
            "in_service": True,
            "tags": [],
            "meta": {"operation_mode": genset_spec.get("operation_mode")},
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

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("generators", []).append(
        {
            "ref_id": ups_ref,
            "name": ups_spec.get("source_name") or "UPS",
            "bus_ref": bus_nn_ref,
            "gen_type": "UPS",
            "p_mw": (ups_spec.get("rated_power_kw") or 0) / 1000.0,
            "q_mvar": 0.0,
            "in_service": True,
            "tags": [],
            "meta": {
                "backup_time_min": ups_spec.get("backup_time_min"),
                "operation_mode": ups_spec.get("operation_mode"),
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


# ---------------------------------------------------------------------------
# 24-25. UNIWERSALNE
# ---------------------------------------------------------------------------


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
        "set_source_operating_mode",
        "set_dynamic_profile",
        # Universal
        "rename_element",
        "set_label",
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
    "set_source_operating_mode": set_source_operating_mode,
    "set_dynamic_profile": set_dynamic_profile,
    "rename_element": rename_element,
    "set_label": set_label,
}
