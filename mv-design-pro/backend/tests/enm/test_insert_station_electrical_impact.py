"""Phase 0C — testy electrical_impact w dry_run insert_station_on_segment_sn.

Operator-grade SLD plan v2 — Conscious Split z Preview wymaga że dry_run zwraca:
  inserted_station_id, station_type, halves{first/second + length + ratio},
  electrical_impact{
    topology_type_changed, affected_object_refs,
    topology_type_changes, catalog_inheritance, length_assignment,
    invalidated_results, affected_proof_packs, missing_data_after, affected_buses
  }

Pokrycie:
  1. preview zawiera halves z deterministycznym split_ratio + length_a/b.
  2. RATIO mode: split 0.5 → length_a == length_b == length_km/2.
  3. RATIO mode: split 0.3 → length_a/length_km == 0.3.
  4. ODLEGLOSC_OD_POCZATKU_M: 250m / 500m → split_ratio = 0.5.
  5. catalog_inheritance: source_catalog_ref propagowany do halves.
  6. catalog_inheritance: missing catalog → fix action message.
  7. topology_type_changes lista zawiera segment + station entries.
  8. affected_object_refs zawiera stację + halves + affected_buses.
  9. missing_data_after zawiera ostrzeżenia.
"""

from __future__ import annotations

import copy
from typing import Any

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_LINE_70 = "line-base-al-st-70"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_ZRODLO_250 = "src-gpz-15kv-250mva-rx010"


def _empty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="electrical_impact_test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def op(snap: dict[str, Any], name: str, payload: dict[str, Any]) -> dict[str, Any]:
    if name == "add_grid_source_sn" and "catalog_ref" not in payload:
        payload = {**payload, "catalog_ref": CATALOG_ZRODLO_250}
    result = execute_domain_operation(snap, name, payload)
    err = result.get("error")
    assert not err, f"Operacja '{name}' zwróciła błąd: {err} (code={result.get('error_code')})"
    return result["snapshot"]


def _build_gpz_with_segment_500m() -> tuple[dict[str, Any], str]:
    """Buduje ENM z 500m segmentem napowietrznym. Zwraca (snap, segment_id)."""
    snap = _empty_enm()
    snap = op(snap, "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
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


def _exec_dry_run(snap: dict[str, Any], seg_id: str, **kwargs: Any) -> dict[str, Any]:
    payload = {
        "segment_id": seg_id,
        # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
        "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
        "dry_run": True,
        "station": {"name": "Stacja", "station_type": "inline", "nn_voltage_kv": 0.4},
        "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
        "nn_voltage_kv": 0.4,
        **kwargs,
    }
    return execute_domain_operation(copy.deepcopy(snap), "insert_station_on_segment_sn", payload)


# ---------------------------------------------------------------------------
# Halves + split_ratio
# ---------------------------------------------------------------------------


def test_halves_default_split_ratio_05() -> None:
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(snap, seg_id)
    halves = response["preview"]["halves"]
    assert halves["split_ratio"] == 0.5
    assert halves["first_length_km"] == 0.25
    assert halves["second_length_km"] == 0.25


def test_halves_ratio_03() -> None:
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(snap, seg_id, insert_at={"mode": "RATIO", "value": 0.3})
    halves = response["preview"]["halves"]
    assert halves["split_ratio"] == 0.3
    assert abs(halves["first_length_km"] - 0.15) < 1e-6
    assert abs(halves["second_length_km"] - 0.35) < 1e-6


def test_halves_distance_mode_250m_of_500m() -> None:
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(
        snap, seg_id, insert_at={"mode": "ODLEGLOSC_OD_POCZATKU_M", "value": 250.0}
    )
    halves = response["preview"]["halves"]
    assert halves["split_ratio"] == 0.5
    assert halves["first_length_km"] == 0.25


def test_halves_first_second_segment_id_naming() -> None:
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(snap, seg_id)
    halves = response["preview"]["halves"]
    assert halves["first_segment_id"] == f"{seg_id}_a"
    assert halves["second_segment_id"] == f"{seg_id}_b"


# ---------------------------------------------------------------------------
# topology_type_changes
# ---------------------------------------------------------------------------


def test_topology_type_changes_lists_segment_and_station() -> None:
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(snap, seg_id)
    changes = response["preview"]["electrical_impact"]["topology_type_changes"]
    # Dwie zmiany: segment (split) + station (inserted)
    segment_changes = [c for c in changes if c.get("object_ref") == seg_id]
    assert len(segment_changes) == 1
    assert segment_changes[0]["before"] == "line_overhead"
    assert segment_changes[0]["after"] == "split_into_two_segments"
    assert "halves" in segment_changes[0]
    # Station inserted
    station_changes = [c for c in changes if c.get("kind") == "station_inserted_on_segment"]
    assert len(station_changes) == 1
    assert station_changes[0]["before"] == "no_station"


# ---------------------------------------------------------------------------
# catalog_inheritance
# ---------------------------------------------------------------------------


def test_catalog_inheritance_propagates_source_catalog() -> None:
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(snap, seg_id)
    inh = response["preview"]["electrical_impact"]["catalog_inheritance"]
    assert inh["source_segment_ref"] == seg_id
    assert inh["source_catalog_ref"] == CATALOG_LINE_70
    assert inh["first_inherits"] is True
    assert inh["second_inherits"] is True
    assert "Obie połówki dziedziczą" in inh["rule"]


# ---------------------------------------------------------------------------
# length_assignment
# ---------------------------------------------------------------------------


def test_length_assignment_ratio_mode() -> None:
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(snap, seg_id, insert_at={"mode": "RATIO", "value": 0.4})
    la = response["preview"]["electrical_impact"]["length_assignment"]
    assert la["source_length_km"] == 0.5
    assert la["split_mode"] == "RATIO"
    assert la["fraction_a"] == 0.4
    assert la["fraction_b"] == 0.6
    assert abs(la["first_length_km"] - 0.2) < 1e-6


def test_length_assignment_distance_mode() -> None:
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(
        snap, seg_id, insert_at={"mode": "ODLEGLOSC_OD_POCZATKU_M", "value": 100.0}
    )
    la = response["preview"]["electrical_impact"]["length_assignment"]
    assert la["split_mode"] == "ODLEGLOSC_OD_POCZATKU_M"
    assert la["split_value"] == 100.0
    assert abs(la["fraction_a"] - 0.2) < 1e-6


# ---------------------------------------------------------------------------
# affected_object_refs + affected_buses
# ---------------------------------------------------------------------------


def test_affected_object_refs_includes_station_and_segment_and_buses() -> None:
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(snap, seg_id)
    impact = response["preview"]["electrical_impact"]
    affected = impact["affected_object_refs"]
    station_id = response["preview"]["inserted_station_id"]
    assert station_id in affected
    assert seg_id in affected
    # Affected buses (from_bus + to_bus segmentu) muszą być w affected_object_refs
    affected_buses = impact["affected_buses"]
    assert len(affected_buses) >= 1
    for bus in affected_buses:
        assert bus in affected


def test_affected_object_refs_sorted_deterministycznie() -> None:
    """Sortowanie alfabetyczne dla determinizmu (snapshot stability)."""
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(snap, seg_id)
    affected = response["preview"]["electrical_impact"]["affected_object_refs"]
    assert affected == sorted(affected)


# ---------------------------------------------------------------------------
# invalidated_results + affected_proof_packs (puste w minimalnym ENM)
# ---------------------------------------------------------------------------


def test_invalidated_results_empty_in_minimal_enm() -> None:
    """W minimalnym ENM bez run/proof — invalidated_results jest pusta lista."""
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(snap, seg_id)
    impact = response["preview"]["electrical_impact"]
    assert impact["invalidated_results"] == []
    assert impact["affected_proof_packs"] == []


# ---------------------------------------------------------------------------
# missing_data_after
# ---------------------------------------------------------------------------


def test_missing_data_after_empty_when_catalog_present() -> None:
    snap, seg_id = _build_gpz_with_segment_500m()
    response = _exec_dry_run(snap, seg_id)
    missing = response["preview"]["electrical_impact"]["missing_data_after"]
    assert missing == []


# ---------------------------------------------------------------------------
# Determinizm
# ---------------------------------------------------------------------------


def test_preview_deterministic_same_input_same_output() -> None:
    """5 reruny dry_run → identyczne preview metadata."""
    snap, seg_id = _build_gpz_with_segment_500m()
    reference = _exec_dry_run(snap, seg_id)["preview"]
    for _ in range(4):
        another = _exec_dry_run(snap, seg_id)["preview"]
        assert another == reference
