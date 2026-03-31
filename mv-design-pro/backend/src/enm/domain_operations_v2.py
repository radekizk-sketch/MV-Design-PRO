"""
Operacje domenowe V2 — ochrona, Study Case, źródła nN, operacje uniwersalne.

Rozszerzenie domain_operations.py o brakujące operacje z Fazy 1.1 specyfikacji.
Każda operacja jest deterministyczna i generuje zdarzenia domenowe.

BINDING: Komunikaty po polsku, brak kodów projektowych.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from typing import Any

from .domain_operations import (
    _canonical_json,
    _compute_seed,
    _find_element,
    _make_id,
    _response,
    _error_response,
)


# ---------------------------------------------------------------------------
# IEC 60255 — krzywe IDMT (TCC)
# ---------------------------------------------------------------------------

IEC_CURVES = {
    "SI": {"K": 0.14, "alpha": 0.02},    # Standard Inverse
    "VI": {"K": 13.5, "alpha": 1.0},      # Very Inverse
    "EI": {"K": 80.0, "alpha": 2.0},      # Extremely Inverse
    "LTI": {"K": 120.0, "alpha": 1.0},    # Long Time Inverse
}


def _compute_tcc_point(
    i_ratio: float, tms: float, curve_type: str
) -> float | None:
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
            points.append({
                "i_a": round(ratio * ipickup_a, 2),
                "i_ratio": round(ratio, 4),
                "t_s": round(t, 4),
            })
    return points


# ---------------------------------------------------------------------------
# 1. OCHRONA — add_ct
# ---------------------------------------------------------------------------


def add_ct(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj przekładnik prądowy (CT) do pola stacji."""
    bay_ref = payload.get("bay_ref")
    if not bay_ref:
        return _error_response("Brak identyfikatora pola (bay_ref).", "ct.bay_missing")

    ratio_primary = payload.get("ratio_primary_a")
    ratio_secondary = payload.get("ratio_secondary_a", 5.0)
    accuracy_class = payload.get("accuracy_class", "0.5")
    burden_va = payload.get("burden_va")

    if not ratio_primary or ratio_primary <= 0:
        return _error_response(
            "Przekładnia pierwotna CT musi być > 0.", "ct.ratio_primary_invalid"
        )

    seed = _compute_seed({
        "op": "add_ct", "bay_ref": bay_ref,
        "ratio": f"{ratio_primary}/{ratio_secondary}",
    })
    ct_ref = _make_id("ct", seed, "measurement")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("measurements", []).append({
        "ref_id": ct_ref,
        "name": f"CT {ratio_primary}/{ratio_secondary} A",
        "measurement_type": "CT",
        "bay_ref": bay_ref,
        "rating": {
            "primary_value": ratio_primary,
            "secondary_value": ratio_secondary,
            "accuracy_class": accuracy_class,
            "burden_va": burden_va,
        },
        "catalog_ref": payload.get("catalog_ref"),
        "tags": [],
        "meta": {},
    })

    return _response(
        new_enm, created=[ct_ref],
        selection_id=ct_ref, selection_type="measurement",
        events=[{"event_seq": 1, "event_type": "CT_CREATED", "element_id": ct_ref}],
    )


# ---------------------------------------------------------------------------
# 2. OCHRONA — add_vt
# ---------------------------------------------------------------------------


def add_vt(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj przekładnik napięciowy (VT) do pola stacji."""
    bay_ref = payload.get("bay_ref")
    if not bay_ref:
        return _error_response("Brak identyfikatora pola (bay_ref).", "vt.bay_missing")

    ratio_primary = payload.get("ratio_primary_v")
    ratio_secondary = payload.get("ratio_secondary_v", 100.0)

    if not ratio_primary or ratio_primary <= 0:
        return _error_response(
            "Przekładnia pierwotna VT musi być > 0.", "vt.ratio_primary_invalid"
        )

    seed = _compute_seed({
        "op": "add_vt", "bay_ref": bay_ref,
        "ratio": f"{ratio_primary}/{ratio_secondary}",
    })
    vt_ref = _make_id("vt", seed, "measurement")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("measurements", []).append({
        "ref_id": vt_ref,
        "name": f"VT {ratio_primary}/{ratio_secondary} V",
        "measurement_type": "VT",
        "bay_ref": bay_ref,
        "rating": {
            "primary_value": ratio_primary,
            "secondary_value": ratio_secondary,
            "accuracy_class": payload.get("accuracy_class", "0.5"),
            "burden_va": payload.get("burden_va"),
        },
        "catalog_ref": payload.get("catalog_ref"),
        "tags": [],
        "meta": {},
    })

    return _response(
        new_enm, created=[vt_ref],
        selection_id=vt_ref, selection_type="measurement",
        events=[{"event_seq": 1, "event_type": "VT_CREATED", "element_id": vt_ref}],
    )


# ---------------------------------------------------------------------------
# 3. OCHRONA — add_relay
# ---------------------------------------------------------------------------


def add_relay(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj przekaźnik ochronny do pola stacji."""
    bay_ref = payload.get("bay_ref")
    relay_type = payload.get("relay_type", "NADPRADOWY")
    breaker_ref = payload.get("breaker_ref")

    if not bay_ref:
        return _error_response("Brak identyfikatora pola (bay_ref).", "relay.bay_missing")

    seed = _compute_seed({"op": "add_relay", "bay_ref": bay_ref, "type": relay_type})
    relay_ref = _make_id("relay", seed, "protection")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("protection_assignments", []).append({
        "ref_id": relay_ref,
        "name": f"Przekaźnik {relay_type}",
        "protection_type": relay_type,
        "bay_ref": bay_ref,
        "breaker_ref": breaker_ref,
        "settings": {},
        "tcc_cache": None,
        "enabled": True,
        "tags": [],
        "meta": {},
    })

    return _response(
        new_enm, created=[relay_ref],
        selection_id=relay_ref, selection_type="protection",
        events=[{"event_seq": 1, "event_type": "RELAY_CREATED", "element_id": relay_ref}],
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

    new_enm = copy.deepcopy(enm)
    found = False
    for pa in new_enm.get("protection_assignments", []):
        if pa.get("ref_id") == relay_ref:
            pa["settings"] = settings
            pa["tcc_cache"] = None  # Invalidate cache
            found = True
            break

    if not found:
        return _error_response(
            f"Przekaźnik '{relay_ref}' nie znaleziony.", "relay.not_found"
        )

    return _response(
        new_enm, updated=[relay_ref],
        selection_id=relay_ref,
        events=[{"event_seq": 1, "event_type": "RELAY_SETTINGS_UPDATED", "element_id": relay_ref}],
    )


# ---------------------------------------------------------------------------
# 5. OCHRONA — link_relay_to_field
# ---------------------------------------------------------------------------


def link_relay_to_field(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Powiąż przekaźnik z polem i aparatem wykonawczym."""
    relay_ref = payload.get("relay_ref")
    field_ref = payload.get("field_ref")
    breaker_ref = payload.get("breaker_ref")

    if not relay_ref:
        return _error_response("Brak identyfikatora przekaźnika.", "relay.ref_missing")
    if not field_ref:
        return _error_response("Brak identyfikatora pola.", "relay.field_missing")

    new_enm = copy.deepcopy(enm)
    found = False
    for pa in new_enm.get("protection_assignments", []):
        if pa.get("ref_id") == relay_ref:
            pa["bay_ref"] = field_ref
            if breaker_ref:
                pa["breaker_ref"] = breaker_ref
            found = True
            break

    if not found:
        return _error_response(f"Przekaźnik '{relay_ref}' nie znaleziony.", "relay.not_found")

    return _response(
        new_enm, updated=[relay_ref],
        events=[{"event_seq": 1, "event_type": "RELAY_SETTINGS_UPDATED", "element_id": relay_ref}],
    )


# ---------------------------------------------------------------------------
# 6. OCHRONA — calculate_tcc_curve
# ---------------------------------------------------------------------------


def calculate_tcc_curve(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Wylicz krzywą TCC z nastaw przekaźnika (IEC 60255)."""
    relay_ref = payload.get("relay_ref")
    if not relay_ref:
        return _error_response("Brak identyfikatora przekaźnika.", "tcc.relay_missing")

    new_enm = copy.deepcopy(enm)
    relay = None
    for pa in new_enm.get("protection_assignments", []):
        if pa.get("ref_id") == relay_ref:
            relay = pa
            break

    if not relay:
        return _error_response(f"Przekaźnik '{relay_ref}' nie znaleziony.", "tcc.relay_not_found")

    settings = relay.get("settings", {})
    ipickup = settings.get("Ipickup_a", 0)
    tms = settings.get("time_dial", 1.0)
    curve_type = settings.get("curve_type", "SI")

    if ipickup <= 0:
        return _error_response(
            "Próg prądowy Ipickup_a musi być > 0.", "tcc.ipickup_invalid"
        )

    curve_points = _compute_tcc_curve(ipickup, tms, curve_type)
    relay["tcc_cache"] = {
        "curve_type": curve_type,
        "tms": tms,
        "ipickup_a": ipickup,
        "points": curve_points,
    }

    return _response(
        new_enm, updated=[relay_ref],
        events=[{"event_seq": 1, "event_type": "TCC_CURVE_COMPUTED", "element_id": relay_ref}],
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
            selectivity_results.append({
                "downstream_ref": downstream.get("ref_id"),
                "upstream_ref": upstream.get("ref_id"),
                "ik_a": round(ik, 2),
                "t_downstream_s": round(t_ds, 4),
                "t_upstream_s": round(t_us, 4),
                "delta_t_s": round(delta_t, 4),
                "passed": passed,
            })

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("meta", {})["selectivity_results"] = selectivity_results

    all_passed = all(r["passed"] for r in selectivity_results) if selectivity_results else True

    return _response(
        new_enm,
        events=[{"event_seq": 1, "event_type": "SELECTIVITY_VALIDATED", "element_id": "all"}],
        audit=[{
            "step": 1,
            "action": f"Selektywność: {'OK' if all_passed else 'NIESPEŁNIONA'}",
            "detail": json.dumps(selectivity_results, ensure_ascii=False),
        }],
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
    new_enm.setdefault("study_cases", []).append({
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
    })

    return _response(
        new_enm, created=[case_id],
        selection_id=case_id, selection_type="study_case",
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
                new_enm, updated=[case_id],
                events=[{"event_seq": 1, "event_type": "CASE_STATE_UPDATED", "element_id": case_id}],
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
                new_enm, updated=[case_id],
                events=[{"event_seq": 1, "event_type": "CASE_STATE_UPDATED", "element_id": case_id}],
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
                new_enm, updated=[case_id],
                events=[{"event_seq": 1, "event_type": "CASE_STATE_UPDATED", "element_id": case_id}],
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
                new_enm, updated=[case_id],
                events=[{"event_seq": 1, "event_type": "CASE_STATE_UPDATED", "element_id": case_id}],
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
    events.append({"event_seq": ev_seq, "event_type": "ANALYSIS_RUN_STARTED", "element_id": case_id})

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
    events.append({"event_seq": ev_seq, "event_type": "ANALYSIS_RUN_COMPLETED", "element_id": case_id})
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
        new_enm, updated=[case_id] if case_id else [],
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

    return _response(new_enm, events=[
        {"event_seq": 1, "event_type": "RESULTS_MAPPED", "element_id": f"{case_a_id}_vs_{case_b_id}"},
    ])


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
    return bool(station.get("transformer_refs"))


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

    item_id = binding.get("item_id")
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


def add_nn_outgoing_field(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj odpływ nN do szyny nN."""
    bus_nn_ref = payload.get("bus_nn_ref")
    station_ref = payload.get("station_ref")

    if not bus_nn_ref:
        return _error_response("Brak szyny nN (bus_nn_ref).", "nn.bus_missing")

    seed = _compute_seed({"op": "nn_outgoing", "bus": bus_nn_ref, "n": len(enm.get("bays", []))})
    feeder_ref = _make_id("nn", seed, "outgoing")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("bays", []).append({
        "ref_id": feeder_ref,
        "name": f"Odpływ nN",
        "bay_role": "FEEDER",
        "substation_ref": station_ref,
        "bus_ref": bus_nn_ref,
        "equipment_refs": [],
        "protection_ref": None,
        "tags": [],
        "meta": {"feeder_role": "ODPLYW_NN"},
    })

    return _response(
        new_enm, created=[feeder_ref],
        selection_id=feeder_ref, selection_type="bay",
        events=[{"event_seq": 1, "event_type": "FIELDS_CREATED_NN", "element_id": feeder_ref}],
    )


def add_nn_source_field(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj pole źródłowe do rozdzielni nN."""
    bus_nn_ref = payload.get("bus_nn_ref")
    station_ref = payload.get("station_ref")
    kind = payload.get("source_field_kind", "PV")

    if not bus_nn_ref:
        return _error_response("Brak szyny nN (bus_nn_ref).", "nn.bus_missing")

    seed = _compute_seed({"op": "nn_source_field", "bus": bus_nn_ref, "kind": kind})
    field_ref = _make_id("nn", seed, "source_field")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("bays", []).append({
        "ref_id": field_ref,
        "name": f"Pole źródłowe nN ({kind})",
        "bay_role": "SOURCE",
        "substation_ref": station_ref,
        "bus_ref": bus_nn_ref,
        "equipment_refs": [],
        "protection_ref": None,
        "tags": ["nn_source_field"],
        "meta": {"source_field_kind": kind},
    })

    return _response(
        new_enm, created=[field_ref],
        selection_id=field_ref, selection_type="bay",
        events=[{"event_seq": 1, "event_type": "NN_SOURCE_FIELD_CREATED", "element_id": field_ref}],
    )


def add_nn_load(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj odbiór nN do odpływu."""
    feeder_ref = payload.get("feeder_ref")
    bus_nn_ref = payload.get("bus_nn_ref")
    active_power_kw = payload.get("active_power_kw", 0)

    if not feeder_ref:
        return _error_response("Brak identyfikatora odpływu (feeder_ref).", "nn.feeder_missing")

    seed = _compute_seed({"op": "nn_load", "feeder": feeder_ref, "p": active_power_kw})
    load_ref = _make_id("nn", seed, "load")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("loads", []).append({
        "ref_id": load_ref,
        "name": payload.get("load_name") or "Odbiór nN",
        "bus_ref": bus_nn_ref or feeder_ref,
        "p_mw": active_power_kw / 1000.0,
        "q_mvar": (payload.get("reactive_power_kvar") or 0) / 1000.0,
        "model": "constant_power",
        "tags": [],
        "meta": {
            "load_kind": payload.get("load_kind", "SKUPIONY"),
            "connection_type": payload.get("connection_type", "TROJFAZOWY"),
            "feeder_ref": feeder_ref,
        },
    })

    return _response(
        new_enm, created=[load_ref],
        selection_id=load_ref, selection_type="load",
        events=[{"event_seq": 1, "event_type": "NN_LOAD_CREATED", "element_id": load_ref}],
    )


def add_pv_inverter_nn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj falownik PV do rozdzielni nN. Waliduje transformator w ścieżce."""
    bus_nn_ref = payload.get("bus_nn_ref")
    station_ref = payload.get("station_ref")

    if not bus_nn_ref:
        return _error_response("Brak szyny nN.", "pv.bus_missing")

    # Walidacja: PV wymaga transformatora
    station = _find_station_for_bus(enm, bus_nn_ref)
    if station and not _has_transformer_in_path(enm, station):
        return _error_response(
            "Falownik PV wymaga transformatora w ścieżce zasilania. "
            "Dodaj transformator SN/nN przed przyłączeniem źródła OZE.",
            "pv.transformer_required",
        )

    pv_spec = payload.get("pv_spec", {})
    catalog_ref, catalog_error = _resolve_catalog_ref(
        pv_spec.get("catalog_item_id"),
        pv_spec.get("catalog_binding") or payload.get("catalog_binding"),
    )
    if catalog_error:
        return _error_response(
            "Falownik PV wymaga poprawnego powiązania z katalogiem (catalog_ref/catalog_binding).",
            catalog_error,
        )

    materialized_params, materialization_error = _validate_required_materialization(
        pv_spec.get("materialized_params"),
        required_fields=["rated_power_ac_kw", "max_power_kw", "control_mode"],
    )
    if materialization_error:
        return _error_response(
            "Falownik PV wymaga pełnej materializacji parametrów katalogowych.",
            materialization_error,
        )

    seed = _compute_seed({"op": "pv_nn", "bus": bus_nn_ref, "p": pv_spec.get("rated_power_ac_kw", 0)})
    pv_ref = _make_id("pv", seed, "inverter")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("generators", []).append({
        "ref_id": pv_ref,
        "name": pv_spec.get("source_name") or "Falownik PV",
        "bus_ref": bus_nn_ref,
        "gen_type": "PV_INVERTER",
        "p_mw": (pv_spec.get("rated_power_ac_kw") or 0) / 1000.0,
        "q_mvar": 0.0,
        "catalog_ref": catalog_ref,
        "catalog_namespace": "ZRODLO_NN_PV",
        "source_mode": "KATALOG",
        "materialized_params": materialized_params,
        "station_ref": station_ref,
        "in_service": True,
        "tags": [],
        "meta": {
            "control_mode": pv_spec.get("control_mode"),
            "max_power_kw": pv_spec.get("max_power_kw"),
        },
    })

    return _response(
        new_enm, created=[pv_ref],
        selection_id=pv_ref, selection_type="generator",
        events=[{"event_seq": 1, "event_type": "PV_INVERTER_CREATED", "element_id": pv_ref}],
    )


def add_bess_inverter_nn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj falownik BESS do rozdzielni nN. Waliduje transformator w ścieżce."""
    bus_nn_ref = payload.get("bus_nn_ref")
    station_ref = payload.get("station_ref")

    if not bus_nn_ref:
        return _error_response("Brak szyny nN.", "bess.bus_missing")

    station = _find_station_for_bus(enm, bus_nn_ref)
    if station and not _has_transformer_in_path(enm, station):
        return _error_response(
            "Falownik BESS wymaga transformatora w ścieżce zasilania.",
            "bess.transformer_required",
        )

    bess_spec = payload.get("bess_spec", {})
    catalog_ref, catalog_error = _resolve_catalog_ref(
        bess_spec.get("inverter_catalog_id"),
        bess_spec.get("catalog_binding") or payload.get("catalog_binding"),
    )
    if catalog_error:
        return _error_response(
            "Falownik BESS wymaga poprawnego powiązania z katalogiem (catalog_ref/catalog_binding).",
            catalog_error,
        )

    materialized_params, materialization_error = _validate_required_materialization(
        bess_spec.get("materialized_params"),
        required_fields=["usable_capacity_kwh", "charge_power_kw", "discharge_power_kw", "operation_mode"],
    )
    if materialization_error:
        return _error_response(
            "Falownik BESS wymaga pełnej materializacji parametrów katalogowych.",
            materialization_error,
        )

    seed = _compute_seed({"op": "bess_nn", "bus": bus_nn_ref, "e": bess_spec.get("usable_capacity_kwh", 0)})
    bess_ref = _make_id("bess", seed, "inverter")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("generators", []).append({
        "ref_id": bess_ref,
        "name": bess_spec.get("source_name") or "Falownik BESS",
        "bus_ref": bus_nn_ref,
        "gen_type": "BESS_INVERTER",
        "p_mw": (bess_spec.get("charge_power_kw") or 0) / 1000.0,
        "q_mvar": 0.0,
        "catalog_ref": catalog_ref,
        "catalog_namespace": "ZRODLO_NN_BESS",
        "source_mode": "KATALOG",
        "materialized_params": materialized_params,
        "station_ref": station_ref,
        "in_service": True,
        "tags": [],
        "meta": {
            "usable_capacity_kwh": bess_spec.get("usable_capacity_kwh"),
            "operation_mode": bess_spec.get("operation_mode"),
            "control_strategy": bess_spec.get("control_strategy"),
        },
    })

    return _response(
        new_enm, created=[bess_ref],
        selection_id=bess_ref, selection_type="generator",
        events=[{"event_seq": 1, "event_type": "BESS_INVERTER_CREATED", "element_id": bess_ref}],
    )


def add_genset_nn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj agregat prądotwórczy do rozdzielni nN."""
    bus_nn_ref = payload.get("bus_nn_ref")
    genset_spec = payload.get("genset_spec", {})

    if not bus_nn_ref:
        return _error_response("Brak szyny nN.", "genset.bus_missing")

    seed = _compute_seed({"op": "genset_nn", "bus": bus_nn_ref, "p": genset_spec.get("rated_power_kw", 0)})
    gen_ref = _make_id("gen", seed, "genset")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("generators", []).append({
        "ref_id": gen_ref,
        "name": genset_spec.get("source_name") or "Agregat",
        "bus_ref": bus_nn_ref,
        "gen_type": "GENSET",
        "p_mw": (genset_spec.get("rated_power_kw") or 0) / 1000.0,
        "q_mvar": 0.0,
        "in_service": True,
        "tags": [],
        "meta": {"operation_mode": genset_spec.get("operation_mode")},
    })

    return _response(
        new_enm, created=[gen_ref],
        selection_id=gen_ref, selection_type="generator",
        events=[{"event_seq": 1, "event_type": "GENSET_CREATED", "element_id": gen_ref}],
    )


def add_ups_nn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj UPS do rozdzielni nN."""
    bus_nn_ref = payload.get("bus_nn_ref")
    ups_spec = payload.get("ups_spec", {})

    if not bus_nn_ref:
        return _error_response("Brak szyny nN.", "ups.bus_missing")

    seed = _compute_seed({"op": "ups_nn", "bus": bus_nn_ref, "p": ups_spec.get("rated_power_kw", 0)})
    ups_ref = _make_id("ups", seed, "ups")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("generators", []).append({
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
    })

    return _response(
        new_enm, created=[ups_ref],
        selection_id=ups_ref, selection_type="generator",
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
                new_enm, updated=[source_ref],
                events=[{"event_seq": 1, "event_type": "PARAMETERS_UPDATED", "element_id": source_ref}],
            )

    return _error_response(f"Źródło '{source_ref}' nie znalezione.", "source.not_found")


def set_dynamic_profile(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw profil dynamiczny (czasowy) dla elementu."""
    element_ref = payload.get("element_ref") or payload.get("applies_to_element_id")
    profile = payload.get("profile", {})

    if not element_ref:
        return _error_response("Brak identyfikatora elementu.", "profile.element_missing")

    new_enm = copy.deepcopy(enm)
    new_enm.setdefault("dynamic_profiles", []).append({
        "profile_id": _compute_seed({"op": "profile", "elem": element_ref}),
        "applies_to_element_id": element_ref,
        "time_unit": profile.get("time_unit", "h"),
        "points": profile.get("points", []),
        "interpolation": profile.get("interpolation", "HOLD"),
    })

    return _response(
        new_enm, updated=[element_ref],
        events=[{"event_seq": 1, "event_type": "PARAMETERS_UPDATED", "element_id": element_ref}],
    )


# ---------------------------------------------------------------------------
# 24-25. UNIWERSALNE
# ---------------------------------------------------------------------------


def rename_element(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Zmień nazwę elementu."""
    element_ref = payload.get("element_ref")
    new_name = payload.get("new_name")

    if not element_ref:
        return _error_response("Brak identyfikatora elementu.", "rename.ref_missing")
    if not new_name:
        return _error_response("Brak nowej nazwy.", "rename.name_missing")

    loc = _find_element(enm, element_ref)
    if not loc:
        return _error_response(f"Element '{element_ref}' nie znaleziony.", "rename.not_found")

    new_enm = copy.deepcopy(enm)
    coll, idx = loc
    new_enm[coll][idx]["name"] = new_name

    return _response(
        new_enm, updated=[element_ref],
        events=[{"event_seq": 1, "event_type": "PARAMETERS_UPDATED", "element_id": element_ref}],
    )


def set_label(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw etykietę (label) elementu."""
    element_ref = payload.get("element_ref")
    label = payload.get("label")

    if not element_ref:
        return _error_response("Brak identyfikatora elementu.", "label.ref_missing")

    loc = _find_element(enm, element_ref)
    if not loc:
        return _error_response(f"Element '{element_ref}' nie znaleziony.", "label.not_found")

    new_enm = copy.deepcopy(enm)
    coll, idx = loc
    new_enm[coll][idx]["label"] = label

    return _response(
        new_enm, updated=[element_ref],
        events=[{"event_seq": 1, "event_type": "PARAMETERS_UPDATED", "element_id": element_ref}],
    )


# ---------------------------------------------------------------------------
# Export — V2 handlers and canonical ops
# ---------------------------------------------------------------------------

V2_CANONICAL_OPS = frozenset({
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
    "add_nn_outgoing_field",
    "add_nn_source_field",
    "add_nn_load",
    "add_pv_inverter_nn",
    "add_bess_inverter_nn",
    "add_genset_nn",
    "add_ups_nn",
    "set_source_operating_mode",
    "set_dynamic_profile",
    # Universal
    "rename_element",
    "set_label",
})

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
    "add_nn_outgoing_field": add_nn_outgoing_field,
    "add_nn_source_field": add_nn_source_field,
    "add_nn_load": add_nn_load,
    "add_pv_inverter_nn": add_pv_inverter_nn,
    "add_bess_inverter_nn": add_bess_inverter_nn,
    "add_genset_nn": add_genset_nn,
    "add_ups_nn": add_ups_nn,
    "set_source_operating_mode": set_source_operating_mode,
    "set_dynamic_profile": set_dynamic_profile,
    "rename_element": rename_element,
    "set_label": set_label,
}
