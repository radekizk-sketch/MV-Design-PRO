"""Phase 0B: e2e tests dla append_station_on_endpoint (operator-grade SLD plan v2).

Operacja addytywna — dodaje stację na końcu istniejącego ciągu (endpoint_bus)
bez rozcinania segmentu. Naturalny workflow inżyniera: zakończ ciąg w stacji
zamiast dzielić odcinek w środku (insert_station_on_segment_sn).

Pokrycie:
  1. Sygnatura/parser dry_run (preview metadata).
  2. Endpoint walidacja (missing/not_found/not_free/voltage).
  3. Station type whitelist.
  4. Build minimal station (bez transformatora) — wolny terminal → Substation+Bay(IN).
  5. Build full station (z transformatorem) — Substation+Bay(IN)+TR+Bus(nN)+Bay(TR).
  6. Determinizm seed: ten sam endpoint+name → ten sam station_id.
  7. Re-tag endpoint_bus (helper_bus → substation_bus).
  8. STATION_APPENDED_ON_ENDPOINT event w response.
  9. Operacja addytywna: brak modyfikacji innych stacji.
"""
from __future__ import annotations

import copy
from typing import Any

from enm.domain_operations import append_station_on_endpoint, execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_LINE_70 = "line-base-al-st-70"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_ZRODLO_250 = "src-gpz-15kv-250mva-rx010"
CATALOG_APARAT_SN = "sw-cb-abb-vd4-24kv-630a"


def _empty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="append_test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def op(snap: dict[str, Any], name: str, payload: dict[str, Any]) -> dict[str, Any]:
    if name == "add_grid_source_sn":
        payload = {
            **({"catalog_ref": CATALOG_ZRODLO_250} if "catalog_ref" not in payload else {}),
            "gpz_line_field_apparatus": {
                "apparatus_kind": "BREAKER",
                "catalog_binding": {
                    "catalog_namespace": "APARAT_SN",
                    "catalog_item_id": CATALOG_APARAT_SN,
                },
            },
            **payload,
        }
    result = execute_domain_operation(snap, name, payload)
    err = result.get("error")
    assert not err, f"Operacja '{name}' zwróciła błąd: {err} (code={result.get('error_code')})"
    return result["snapshot"]


def _build_gpz_with_endpoint() -> tuple[dict[str, Any], str]:
    """Buduje ENM ze szkieletem GPZ + 1 segment napowietrzny. Zwraca (snapshot, endpoint_bus_ref)."""
    snap = _empty_enm()
    snap = op(snap, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
    snap = op(snap, "continue_trunk_segment_sn", {
        "segment": {
            "rodzaj": "LINIA_NAPOWIETRZNA",
            "dlugosc_m": 500.0,
            "catalog_ref": CATALOG_LINE_70,
        },
    })
    # Endpoint bus = to_bus_ref ostatniego branchu
    last_branch = snap["branches"][-1]
    return snap, last_branch["to_bus_ref"]


def _first_gpz_line_field(snap: dict[str, Any]) -> dict[str, Any]:
    gpz = next(s for s in snap["substations"] if s.get("station_type") == "gpz")
    fallback = None
    for spec in gpz.get("meta", {}).get("field_specs", []):
        if str(spec.get("bay_role") or "").upper() in {"OUT", "FEEDER"}:
            fallback = spec
            meta = spec.get("meta")
            if isinstance(meta, dict) and meta.get("terminal_bus_ref"):
                return spec
    if fallback is not None:
        return fallback
    raise AssertionError("GPZ nie ma pola liniowego SN")


# ---------------------------------------------------------------------------
# Walidacja sygnatury / parser
# ---------------------------------------------------------------------------


def test_dry_run_param_accepted_returns_preview() -> None:
    """dry_run=True → response zawiera preview metadata bez snapshot."""
    snap, endpoint = _build_gpz_with_endpoint()
    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "Stacja Preview", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
        "dry_run": True,
    })
    assert response.get("error") is None
    assert response.get("dry_run") is True
    preview = response.get("preview")
    assert preview is not None
    assert "appended_station_id" in preview
    assert preview["endpoint_bus_ref"] == endpoint
    assert preview["electrical_impact"]["topology_changed"] is True
    assert preview["electrical_impact"]["endpoint_bus_consumed"] is True
    # snapshot NIE w response (dry_run = read-only)
    assert "snapshot" not in response


def test_dry_run_does_not_mutate_original() -> None:
    """dry_run=True nie zmienia oryginalnego ENM (deep equality)."""
    snap, endpoint = _build_gpz_with_endpoint()
    original_substations_count = len(snap.get("substations", []))
    original_buses_count = len(snap.get("buses", []))

    append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "X", "station_type": "terminal"},
        "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
        "nn_voltage_kv": 0.4,
        "dry_run": True,
    })

    assert len(snap["substations"]) == original_substations_count
    assert len(snap["buses"]) == original_buses_count


# ---------------------------------------------------------------------------
# Walidacja inputów
# ---------------------------------------------------------------------------


def test_rejects_missing_endpoint() -> None:
    snap = _empty_enm()
    response = append_station_on_endpoint(snap, {
        "station": {"name": "X", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
    })
    assert response.get("error_code") == "station.append.endpoint_missing"


def test_rejects_endpoint_not_found() -> None:
    snap = _empty_enm()
    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": "bus/nonexistent",
        "station": {"name": "X", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
    })
    assert response.get("error_code") == "station.append.endpoint_not_found"


def test_rejects_endpoint_not_free() -> None:
    """Bus który ma >1 branch (środek segmentu) NIE jest wolnym terminalem."""
    snap, endpoint = _build_gpz_with_endpoint()
    # Dodaj kolejny segment z endpoint — czyni go węzłem przepustowym
    snap = op(snap, "continue_trunk_segment_sn", {
        "from_terminal_id": endpoint,
        "segment": {
            "rodzaj": "LINIA_NAPOWIETRZNA",
            "dlugosc_m": 500.0,
            "catalog_ref": CATALOG_LINE_70,
        },
    })
    # Teraz endpoint ma 2 branchy — nie jest wolnym terminalem
    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "X", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
    })
    assert response.get("error_code") == "station.append.endpoint_not_free"


def test_rejects_invalid_station_type() -> None:
    snap, endpoint = _build_gpz_with_endpoint()
    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "X", "station_type": "garbage_type"},
        "nn_voltage_kv": 0.4,
    })
    assert response.get("error_code") == "station.append.station_type_invalid"


def test_rejects_zero_nn_voltage() -> None:
    snap, endpoint = _build_gpz_with_endpoint()
    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "X", "station_type": "terminal"},
        "nn_voltage_kv": 0.0,
    })
    assert response.get("error_code") == "station.append.nn_voltage_missing"


# ---------------------------------------------------------------------------
# Build minimal (bez transformatora)
# ---------------------------------------------------------------------------


def test_minimal_station_creates_substation_and_bay_in() -> None:
    snap, endpoint = _build_gpz_with_endpoint()
    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "Stacja Końcowa", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
    })
    assert response.get("error") is None
    new_snap = response["snapshot"]
    # Substation utworzona
    new_subs = [s for s in new_snap["substations"] if s["name"] == "Stacja Końcowa"]
    assert len(new_subs) == 1
    sub = new_subs[0]
    assert sub["station_type"] == "mv_lv"
    assert endpoint in sub["bus_refs"]
    # Bay(IN) wskazujący na endpoint_bus
    bays_in = [b for b in new_snap.get("bays", []) if b.get("substation_ref") == sub["ref_id"] and b.get("bay_role") == "IN"]
    assert len(bays_in) == 1
    assert bays_in[0]["bus_ref"] == endpoint


def test_minimal_station_does_not_create_transformer() -> None:
    snap, endpoint = _build_gpz_with_endpoint()
    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "Stacja", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
    })
    new_snap = response["snapshot"]
    # Brak transformer — nie podano transformer_catalog_ref
    sub = next(s for s in new_snap["substations"] if s["name"] == "Stacja")
    assert sub["transformer_refs"] == []


# ---------------------------------------------------------------------------
# Build full (z transformatorem)
# ---------------------------------------------------------------------------


def test_full_station_creates_transformer_and_nn_bus() -> None:
    snap, endpoint = _build_gpz_with_endpoint()
    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "Stacja Pełna", "station_type": "terminal"},
        "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
        "nn_voltage_kv": 0.4,
    })
    assert response.get("error") is None
    new_snap = response["snapshot"]
    sub = next(s for s in new_snap["substations"] if s["name"] == "Stacja Pełna")
    # Transformer w substation
    assert len(sub["transformer_refs"]) == 1
    tr_ref = sub["transformer_refs"][0]
    transformers = [t for t in new_snap["transformers"] if t["ref_id"] == tr_ref]
    assert len(transformers) == 1
    transformer = transformers[0]
    assert transformer["hv_bus_ref"] == endpoint
    # Bus nN wśród bus_refs
    nn_bus_ref = transformer["lv_bus_ref"]
    assert nn_bus_ref in sub["bus_refs"]
    nn_bus = next(b for b in new_snap["buses"] if b["ref_id"] == nn_bus_ref)
    assert nn_bus["voltage_kv"] == 0.4
    # Bay(TR)
    bays_tr = [b for b in new_snap.get("bays", []) if b.get("substation_ref") == sub["ref_id"] and b.get("bay_role") == "TR"]
    assert len(bays_tr) == 1
    assert tr_ref in bays_tr[0]["equipment_refs"]


def test_endpoint_append_materializes_requested_station_sn_fields_without_splitting_segment() -> None:
    """Payload z kreatora stacji tworzy pełne pola SN i nie rozcina poprzedniego odcinka."""
    snap, endpoint = _build_gpz_with_endpoint()
    original_branch_refs = {branch["ref_id"] for branch in snap.get("branches", [])}
    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "run_ref": snap.get("corridors", [{}])[-1].get("ref_id"),
        "station": {
            "name": "Stacja Przelotowa",
            "station_type": "inline",
            "switchgear": {
                "manufacturer_ref": "ZPUE_WLOSZCZOWA",
                "switchgear_family_ref": "ZPUE_CANONICAL_RMU",
            },
        },
        "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
        "nn_voltage_kv": 0.4,
        "sn_fields": [
            {
                "field_role": "LINIA_IN",
                "bay_kind": "liniowe_doplywowe",
                "manufacturer_ref": "ZPUE_WLOSZCZOWA",
                "switchgear_family_ref": "ZPUE_CANONICAL_RMU",
                "bay_template_ref": "tpl-line-in",
                "source_status": "canonical_fallback",
                "source_refs": [],
            },
            {
                "field_role": "LINIA_OUT",
                "bay_kind": "liniowe_odplywowe",
                "manufacturer_ref": "ZPUE_WLOSZCZOWA",
                "switchgear_family_ref": "ZPUE_CANONICAL_RMU",
                "bay_template_ref": "tpl-line-out",
                "source_status": "canonical_fallback",
                "source_refs": [],
            },
            {
                "field_role": "TRANSFORMATOROWE",
                "bay_kind": "transformatorowe",
                "manufacturer_ref": "ZPUE_WLOSZCZOWA",
                "switchgear_family_ref": "ZPUE_CANONICAL_RMU",
                "bay_template_ref": "tpl-tr",
                "source_status": "canonical_fallback",
                "source_refs": [],
            },
        ],
    })

    assert response.get("error") is None
    new_snap = response["snapshot"]
    branch_refs_after = {branch["ref_id"] for branch in new_snap.get("branches", [])}
    assert original_branch_refs.issubset(branch_refs_after)
    field_apparatus_refs = {
        branch["ref_id"]
        for branch in new_snap.get("branches", [])
        if "station_field_device" in (branch.get("tags") or [])
    }
    assert field_apparatus_refs
    sub = next(s for s in new_snap["substations"] if s["name"] == "Stacja Przelotowa")
    field_specs = sub.get("meta", {}).get("field_specs") or []
    assert {spec["field_role"] for spec in field_specs} == {
        "LINIA_IN",
        "LINIA_OUT",
        "TRANSFORMATOROWE",
    }
    assert all(spec.get("bus_ref") == endpoint for spec in field_specs)
    assert all(spec.get("equipment_refs") for spec in field_specs)
    station_bays = [bay for bay in new_snap.get("bays", []) if bay.get("substation_ref") == sub["ref_id"]]
    assert {bay["bay_role"] for bay in station_bays} >= {"IN", "OUT", "TR"}
    assert all(bay.get("equipment_refs") for bay in station_bays)
    out_bay = next(bay for bay in station_bays if bay["bay_role"] == "OUT")
    assert out_bay["meta"]["sn_field_template"]["bay_template_ref"] == "tpl-line-out"


def test_continue_trunk_from_gpz_field_uses_terminal_bus_and_updates_line_run() -> None:
    """Pierwszy odcinek wychodzi z terminala pola SN, nie z szyny sekcji GPZ."""
    snap = _empty_enm()
    snap = op(snap, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
    field = _first_gpz_line_field(snap)
    field_ref = field["field_ref"]
    terminal_bus_ref = field["meta"]["terminal_bus_ref"]

    response = execute_domain_operation(
        snap,
        "continue_trunk_segment_sn",
        {
            "field_ref": field_ref,
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA",
                "dlugosc_m": 500.0,
                "catalog_ref": CATALOG_LINE_70,
            },
        },
    )

    assert response.get("error") is None
    new_snap = response["snapshot"]
    branch_ref = next(
        ref for ref in response["changes"]["created_element_ids"] if str(ref).startswith("seg/")
    )
    branch = next(branch for branch in new_snap["branches"] if branch["ref_id"] == branch_ref)
    assert branch["from_bus_ref"] == terminal_bus_ref
    assert branch["meta"]["origin_bay_ref"] == field_ref

    corridor_ref = new_snap["corridors"][0]["ref_id"]
    line_run = next(run for run in new_snap["line_runs"] if run["id"] == corridor_ref)
    assert line_run["starting_bay_ref"] == field_ref
    assert line_run["starting_port_ref"] == terminal_bus_ref
    assert any(item["segment_ref"] == branch_ref for item in line_run["segments"])


def test_continue_trunk_from_appended_station_uses_line_field_terminal_not_station_bus() -> None:
    """Kolejny odcinek po stacji wychodzi z zacisku pola OUT, nie z szyny rozdzielnicy."""
    snap, endpoint = _build_gpz_with_endpoint()
    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "run_ref": snap.get("corridors", [{}])[-1].get("ref_id"),
        "station": {
            "name": "Stacja Przelotowa 2",
            "station_type": "inline",
            "switchgear": {
                "manufacturer_ref": "ZPUE_WLOSZCZOWA",
                "switchgear_family_ref": "ZPUE_CANONICAL_RMU",
            },
        },
        "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
        "nn_voltage_kv": 0.4,
        "sn_fields": [
            {
                "field_role": "LINIA_IN",
                "bay_kind": "liniowe_doplywowe",
                "manufacturer_ref": "ZPUE_WLOSZCZOWA",
                "switchgear_family_ref": "ZPUE_CANONICAL_RMU",
                "bay_template_ref": "tpl-line-in",
                "source_status": "canonical_fallback",
                "source_refs": [],
            },
            {
                "field_role": "LINIA_OUT",
                "bay_kind": "liniowe_odplywowe",
                "manufacturer_ref": "ZPUE_WLOSZCZOWA",
                "switchgear_family_ref": "ZPUE_CANONICAL_RMU",
                "bay_template_ref": "tpl-line-out",
                "source_status": "canonical_fallback",
                "source_refs": [],
            },
            {
                "field_role": "TRANSFORMATOROWE",
                "bay_kind": "transformatorowe",
                "manufacturer_ref": "ZPUE_WLOSZCZOWA",
                "switchgear_family_ref": "ZPUE_CANONICAL_RMU",
                "bay_template_ref": "tpl-tr",
                "source_status": "canonical_fallback",
                "source_refs": [],
            },
        ],
    })

    assert response.get("error") is None
    appended = response["snapshot"]
    sub = next(s for s in appended["substations"] if s["name"] == "Stacja Przelotowa 2")
    out_field = next(
        spec
        for spec in sub.get("meta", {}).get("field_specs", [])
        if spec.get("field_role") == "LINIA_OUT"
    )
    main_bus_ref = out_field["meta"]["terminal_bus_ref"]
    field_terminal_ref = out_field["meta"]["field_terminal_bus_ref"]
    assert main_bus_ref == endpoint
    assert field_terminal_ref != main_bus_ref

    response_continue = execute_domain_operation(
        appended,
        "continue_trunk_segment_sn",
        {
            "field_ref": out_field["field_ref"],
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 250.0,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            },
        },
    )

    assert response_continue.get("error") is None
    continued = response_continue["snapshot"]
    branch_ref = next(
        ref
        for ref in response_continue["changes"]["created_element_ids"]
        if str(ref).startswith("seg/")
    )
    branch = next(branch for branch in continued["branches"] if branch["ref_id"] == branch_ref)
    assert branch["from_bus_ref"] == field_terminal_ref
    assert branch["from_bus_ref"] != endpoint
    assert branch["meta"]["origin_bay_ref"] == out_field["field_ref"]


def test_endpoint_append_updates_existing_line_run_with_station() -> None:
    """Stacja dodana z UI staje się węzłem ciągu SN w line_runs."""
    snap, endpoint = _build_gpz_with_endpoint()
    run_ref = snap["corridors"][-1]["ref_id"]

    response = append_station_on_endpoint(
        snap,
        {
            "endpoint_bus_ref": endpoint,
            "run_ref": run_ref,
            "station": {"name": "Stacja W Ciągu", "station_type": "inline"},
            "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
            "nn_voltage_kv": 0.4,
        },
    )

    assert response.get("error") is None
    new_snap = response["snapshot"]
    sub = next(s for s in new_snap["substations"] if s["name"] == "Stacja W Ciągu")
    line_run = next(run for run in new_snap["line_runs"] if run["id"] == run_ref)
    assert line_run["segments"]
    assert any(item["substation_ref"] == sub["ref_id"] for item in line_run["stations"])


# ---------------------------------------------------------------------------
# Determinizm + re-tag + STATION_APPENDED_ON_ENDPOINT event
# ---------------------------------------------------------------------------


def test_deterministic_seed_same_input_same_id() -> None:
    """Ten sam endpoint+name → ten sam station_id (dry_run vs apply)."""
    snap, endpoint = _build_gpz_with_endpoint()
    payload = {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "DET Stacja", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
    }
    preview = append_station_on_endpoint(copy.deepcopy(snap), {**payload, "dry_run": True})
    apply_response = append_station_on_endpoint(copy.deepcopy(snap), payload)

    preview_id = preview["preview"]["appended_station_id"]
    apply_substations_after = {s["ref_id"] for s in apply_response["snapshot"]["substations"]}
    apply_substations_before = {s["ref_id"] for s in snap.get("substations", [])}
    new_ids = apply_substations_after - apply_substations_before
    assert len(new_ids) == 1
    apply_id = next(iter(new_ids))
    assert preview_id == apply_id


def test_endpoint_bus_retagged_to_substation_bus() -> None:
    """Po append endpoint_bus traci 'topology_terminal' i zyskuje 'substation_bus'."""
    snap, endpoint = _build_gpz_with_endpoint()
    # Sprawdź initial tags
    initial_bus = next(b for b in snap["buses"] if b["ref_id"] == endpoint)
    assert "topology_terminal" in (initial_bus.get("tags") or [])

    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "X", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
    })
    new_snap = response["snapshot"]
    new_bus = next(b for b in new_snap["buses"] if b["ref_id"] == endpoint)
    new_tags = new_bus.get("tags") or []
    assert "topology_terminal" not in new_tags
    assert "substation_bus" in new_tags


def test_station_appended_on_endpoint_event_emitted() -> None:
    snap, endpoint = _build_gpz_with_endpoint()
    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "X", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
    })
    events = response.get("domain_events", [])
    appended_events = [e for e in events if e.get("event_type") == "STATION_APPENDED_ON_ENDPOINT"]
    assert len(appended_events) == 1
    event = appended_events[0]
    assert "affected_object_refs" in event
    assert event["element_id"] in event["affected_object_refs"]


def test_addytywna_operacja_nie_modyfikuje_innych_stacji() -> None:
    """Append nie usuwa ani nie modyfikuje istniejącego GPZ."""
    snap, endpoint = _build_gpz_with_endpoint()
    gpz_before = next(s for s in snap["substations"] if s.get("station_type") == "gpz")
    gpz_id = gpz_before["ref_id"]

    response = append_station_on_endpoint(snap, {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "X", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
    })
    new_snap = response["snapshot"]
    gpz_after = next(s for s in new_snap["substations"] if s["ref_id"] == gpz_id)
    # GPZ nadal istnieje, jego bus_refs niezmienione
    assert gpz_before["bus_refs"] == gpz_after["bus_refs"]
    assert gpz_before["station_type"] == gpz_after["station_type"]


# ---------------------------------------------------------------------------
# Dispatcher integration
# ---------------------------------------------------------------------------


def test_dispatcher_routes_append_station_on_endpoint() -> None:
    """Operacja jest dostępna przez execute_domain_operation."""
    snap, endpoint = _build_gpz_with_endpoint()
    result = execute_domain_operation(snap, "append_station_on_endpoint", {
        "endpoint_bus_ref": endpoint,
        "station": {"name": "Disp", "station_type": "terminal"},
        "nn_voltage_kv": 0.4,
    })
    assert result.get("error") is None
    assert "snapshot" in result
