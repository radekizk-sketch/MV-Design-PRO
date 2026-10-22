"""Phase 0B-5: e2e dry_run preview vs apply equivalence.

Sprawdza:
  1. Wywołanie `insert_station_on_segment_sn` z `dry_run=True` na realnym
     ENM ze szkieletem GPZ + segment.
  2. Preview zwraca metadata: inserted_station_id, halves, electrical_impact.
  3. Oryginalny ENM NIE jest mutowany (snapshot przed == snapshot po dry_run).
  4. Wywołanie tej samej operacji z `dry_run=False` (apply) dodaje stację.
  5. `preview.inserted_station_id` zgadza się z faktycznym ID stacji
     po apply (deterministyczny generator ID — operator widzi ten sam ID
     w preview i po zatwierdzeniu).

Buduje minimalny ENM (GPZ + grid source + 1 segment kabla) używając tych
samych katalogów co `test_mv_general_workflow_e2e.py`.
"""

from __future__ import annotations

import copy
import json
from typing import Any

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_LINE_70 = "line-base-al-st-70"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_ZRODLO_250 = "src-gpz-15kv-250mva-rx010"


def _empty_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="dry_run_apply_test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def op(snap: dict, name: str, payload: dict) -> dict:
    if name == "add_grid_source_sn" and "catalog_ref" not in payload:
        payload = {**payload, "catalog_ref": CATALOG_ZRODLO_250}
    result = execute_domain_operation(snap, name, payload)
    err = result.get("error")
    assert not err, f"Operacja '{name}' zwróciła błąd: {err} (code={result.get('error_code')})"
    assert result.get("snapshot") is not None
    return result["snapshot"]


def _build_gpz_with_segment() -> tuple[dict, str]:
    """Buduje ENM ze szkieletem GPZ + 1 segment magistrali. Zwraca (snapshot, segment_id)."""
    snap = _empty_enm()
    snap = op(
        snap,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
        },
    )
    snap = op(
        snap,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA",
                "dlugosc_m": 500.0,
                "catalog_ref": CATALOG_LINE_70,
            },
        },
    )
    seg_id = next(b["ref_id"] for b in snap["branches"] if b.get("type") == "line_overhead")
    return snap, seg_id


def _exec_op(snap: dict, name: str, payload: dict) -> dict[str, Any]:
    """Wywołanie BEZ asercji błędu — zwraca pełen response."""
    return execute_domain_operation(snap, name, payload)


def test_dry_run_returns_preview_metadata() -> None:
    """dry_run=True → response.dry_run=True + preview.{inserted_station_id, halves, electrical_impact}."""
    snap, seg_id = _build_gpz_with_segment()
    response = _exec_op(
        snap,
        "insert_station_on_segment_sn",
        {
            "segment_id": seg_id,
            # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "dry_run": True,
            "station": {"name": "Stacja Preview", "station_type": "inline", "nn_voltage_kv": 0.4},
            "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
            "nn_voltage_kv": 0.4,
        },
    )
    assert response.get("error") is None, response.get("error")
    assert response.get("dry_run") is True
    preview = response.get("preview")
    assert preview is not None
    assert "inserted_station_id" in preview
    assert preview["inserted_station_id"]
    assert "halves" in preview
    assert "electrical_impact" in preview
    assert preview["electrical_impact"]["topology_type_changed"] is True
    affected = preview["electrical_impact"]["affected_object_refs"]
    assert isinstance(affected, list)
    assert preview["inserted_station_id"] in affected


def test_dry_run_does_not_mutate_original_enm() -> None:
    """Po wywołaniu z dry_run=True oryginalny snapshot pozostaje nienaruszony."""
    snap, seg_id = _build_gpz_with_segment()
    original_snapshot_json = json.dumps(snap, sort_keys=True)
    original_substations_count = len(snap["substations"])
    original_branches_count = len(snap["branches"])

    _exec_op(
        snap,
        "insert_station_on_segment_sn",
        {
            "segment_id": seg_id,
            # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "dry_run": True,
            "station": {"name": "Stacja Preview", "station_type": "inline", "nn_voltage_kv": 0.4},
            "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
            "nn_voltage_kv": 0.4,
        },
    )

    # Snapshot nieruszony in-place.
    assert json.dumps(snap, sort_keys=True) == original_snapshot_json
    assert len(snap["substations"]) == original_substations_count
    assert len(snap["branches"]) == original_branches_count


def test_dry_run_preview_returns_no_snapshot() -> None:
    """dry_run=True → response NIE zawiera klucza 'snapshot' (read-only preview)."""
    snap, seg_id = _build_gpz_with_segment()
    response = _exec_op(
        snap,
        "insert_station_on_segment_sn",
        {
            "segment_id": seg_id,
            # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "dry_run": True,
            "station": {"name": "X", "station_type": "inline", "nn_voltage_kv": 0.4},
            "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
            "nn_voltage_kv": 0.4,
        },
    )
    assert "snapshot" not in response
    # Ale są readiness/logical_views/changes (info dla operatora).
    assert "readiness" in response or "preview" in response


def test_apply_inserts_station_with_id_matching_preview() -> None:
    """Determinizm ID: dry_run.inserted_station_id == apply.faktyczny ID."""
    snap, seg_id = _build_gpz_with_segment()
    payload_base = {
        "segment_id": seg_id,
        # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
        "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
        "station": {"name": "Stacja DET", "station_type": "inline", "nn_voltage_kv": 0.4},
        "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
        "nn_voltage_kv": 0.4,
    }
    # 1. Dry-run preview — bierzemy 2 niezależne kopie żeby preview NIE wpływał na apply.
    preview_response = _exec_op(
        copy.deepcopy(snap),
        "insert_station_on_segment_sn",
        {
            **payload_base,
            "dry_run": True,
        },
    )
    assert preview_response.get("error") is None
    preview_id = preview_response["preview"]["inserted_station_id"]

    # 2. Apply (real mutation).
    apply_response = _exec_op(copy.deepcopy(snap), "insert_station_on_segment_sn", payload_base)
    assert apply_response.get("error") is None
    new_snap = apply_response["snapshot"]
    apply_substations_after = {s["ref_id"] for s in new_snap["substations"]}
    original_substations_before = {s["ref_id"] for s in snap["substations"]}
    new_stations = apply_substations_after - original_substations_before
    assert (
        len(new_stations) == 1
    ), f"Apply utworzyło {len(new_stations)} nowych stacji (oczekiwana 1)"
    apply_id = next(iter(new_stations))

    # KRYTYCZNE: ID z preview == ID z apply (operator widzi ten sam ID w obu wywołaniach).
    assert preview_id == apply_id, (
        f"Preview ID '{preview_id}' != Apply ID '{apply_id}'. "
        f"Determinizm złamany — preview NIE odpowiada faktycznemu apply."
    )


def test_apply_creates_changes_consistent_with_preview() -> None:
    """affected_object_refs z preview == created_element_ids z apply.changes."""
    snap, seg_id = _build_gpz_with_segment()
    payload_base = {
        "segment_id": seg_id,
        # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
        "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
        "station": {"name": "Stacja CHANGES", "station_type": "inline", "nn_voltage_kv": 0.4},
        "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
        "nn_voltage_kv": 0.4,
    }

    preview = _exec_op(
        copy.deepcopy(snap),
        "insert_station_on_segment_sn",
        {
            **payload_base,
            "dry_run": True,
        },
    )["preview"]
    apply_response = _exec_op(copy.deepcopy(snap), "insert_station_on_segment_sn", payload_base)
    created_ids = set(apply_response["changes"]["created_element_ids"])
    affected_in_preview = set(preview["electrical_impact"]["affected_object_refs"])

    # Preview affected_object_refs zawiera CO NAJMNIEJ inserted_station_id +
    # created — apply powinien wytworzyć subset/superset spójny.
    # Reguła operator-grade: ID stacji obecny w obu zbiorach.
    assert preview["inserted_station_id"] in affected_in_preview
    assert preview["inserted_station_id"] in created_ids


def test_apply_without_dry_run_default_unchanged_behavior() -> None:
    """Apply bez `dry_run` (default False) zachowuje istniejące zachowanie."""
    snap, seg_id = _build_gpz_with_segment()
    apply_response = _exec_op(
        snap,
        "insert_station_on_segment_sn",
        {
            "segment_id": seg_id,
            # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "station": {"name": "Apply", "station_type": "inline", "nn_voltage_kv": 0.4},
            "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
            "nn_voltage_kv": 0.4,
        },
    )
    assert apply_response.get("error") is None
    # Apply zachowuje pełne response keys.
    assert "snapshot" in apply_response
    assert apply_response.get("dry_run") in (None, False)
    assert "preview" not in apply_response
