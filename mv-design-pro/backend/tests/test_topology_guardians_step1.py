"""Topologia CI guardians — Krok 1 planu 10/10.

Testy deterministyczne dla krytycznych scenariuszy topologicznych:
- radial 10 stacji,
- ring 8 stacji,
- 2 ring + 2 źródła,
- split+insert deterministyczne.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

backend_src = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(backend_src))

from enm.domain_operations import execute_domain_operation
from enm.topology_ops import create_device


def _empty_enm() -> dict:
    return {
        "header": {"name": "Topology Guardians", "revision": 0, "defaults": {}},
        "buses": [],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }


def _snapshot_hash(snapshot: dict) -> str:
    return json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _assert_ok(result: dict, context: str) -> dict:
    assert result.get("error") is None, f"{context}: {result.get('error')}"
    return result["snapshot"]


def _build_radial_with_segments(segment_count: int) -> dict:
    enm = _empty_enm()
    enm = _assert_ok(
        execute_domain_operation(
            enm,
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "source_name": "GPZ-A",
                "sk3_mva": 500.0,
                "rx_ratio": 0.1,
                "catalog_ref": "src-gpz-15kv-500mva-rx010",
            },
        ),
        "add_grid_source_sn",
    )

    for i in range(segment_count):
        enm = _assert_ok(
            execute_domain_operation(
                enm,
                "continue_trunk_segment_sn",
                {
                    "segment": {
                        "rodzaj": "KABEL",
                        "dlugosc_m": 100 + i,
                        "name": f"Segment {i+1}",
                        "catalog_ref": "cable-tfk-yakxs-3x120",
                    }
                },
            ),
            f"continue_trunk_segment_sn[{i}]",
        )
    return enm


def test_topology_radial_10_stations_deterministic() -> None:
    """Topologia radialna: 10 kolejnych stacji/odcinków buduje spójny, powtarzalny graf."""
    hash_runs: list[str] = []

    for _ in range(3):
        enm = _build_radial_with_segments(10)
        hash_runs.append(_snapshot_hash(enm))

        assert len(enm["sources"]) == 1
        assert len(enm["branches"]) == 10
        sn_buses = [bus for bus in enm["buses"] if bus.get("voltage_kv") == 15.0]
        wn_buses = [bus for bus in enm["buses"] if bus.get("voltage_kv") == 110.0]
        assert len(sn_buses) == 11
        assert len(wn_buses) == 1

    assert hash_runs[0] == hash_runs[1] == hash_runs[2]


def test_topology_ring_8_stations_with_nop() -> None:
    """Pierścień 8 odcinków z NOP: ring closure + normal open point."""
    enm = _build_radial_with_segments(8)
    bus_refs = [b["ref_id"] for b in enm["buses"]]

    enm = _assert_ok(
        execute_domain_operation(
            enm,
            "connect_secondary_ring_sn",
            {
                "from_bus_ref": bus_refs[0],
                "to_bus_ref": bus_refs[-1],
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 250,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        ),
        "connect_secondary_ring_sn",
    )

    # Wstaw łącznik sekcyjny i ustaw NOP
    target_segment = enm["branches"][2]["ref_id"]
    enm = _assert_ok(
        execute_domain_operation(
            enm,
            "insert_section_switch_sn",
            {
                "segment_id": target_segment,
                "insert_at": {"mode": "RATIO", "value": 0.5},
                "catalog_ref": "APARAT_SN_ROZLACZNIK",
            },
        ),
        "insert_section_switch_sn",
    )

    switches = [b for b in enm["branches"] if b.get("type") in ("switch", "breaker")]
    assert switches, "Brak łącznika po insert_section_switch_sn"

    enm = _assert_ok(
        execute_domain_operation(
            enm,
            "set_normal_open_point",
            {"switch_ref": switches[0]["ref_id"]},
        ),
        "set_normal_open_point",
    )

    opened_switches = [
        b
        for b in enm["branches"]
        if b.get("type") in ("switch", "breaker") and b.get("status") == "open"
    ]
    assert opened_switches, "Brak łącznika ustawionego jako NOP (open)"


def test_topology_two_rings_two_sources() -> None:
    """Topologia mieszana: 2 domknięte ringi + 2 źródła (GRID + dodatkowe SOURCE)."""
    enm = _build_radial_with_segments(8)
    bus_refs = [b["ref_id"] for b in enm["buses"]]

    # Ring #1
    enm = _assert_ok(
        execute_domain_operation(
            enm,
            "connect_secondary_ring_sn",
            {
                "from_bus_ref": bus_refs[0],
                "to_bus_ref": bus_refs[-1],
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 280,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        ),
        "connect_secondary_ring_sn#1",
    )

    # Ring #2
    enm = _assert_ok(
        execute_domain_operation(
            enm,
            "connect_secondary_ring_sn",
            {
                "from_bus_ref": bus_refs[2],
                "to_bus_ref": bus_refs[6],
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 190,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        ),
        "connect_secondary_ring_sn#2",
    )

    # Dodaj drugie źródło na odległej szynie (multi-source)
    new_enm = copy.deepcopy(enm)
    extra_source = {
        "device_type": "source",
        "ref_id": "source/auxiliary/grid_2",
        "name": "Źródło Rezerwowe",
        "bus_ref": bus_refs[-1],
        "model": "short_circuit_power",
        "sk3_mva": 350.0,
        "rx_ratio": 0.1,
    }
    result = create_device(new_enm, extra_source)
    assert (
        result.success
    ), f"create_device(source#2) failed: {[i.message_pl for i in result.issues]}"
    enm = result.enm

    assert len(enm["sources"]) == 2

    ring_links = [
        b
        for b in enm["branches"]
        if b.get("from_bus_ref") in {bus_refs[0], bus_refs[2]}
        and b.get("to_bus_ref") in {bus_refs[-1], bus_refs[6]}
    ]
    assert len(ring_links) >= 2


def test_topology_split_insert_idempotent() -> None:
    """Split+insert station na tym samym snapshotcie wejściowym daje identyczny wynik."""
    enm = _build_radial_with_segments(3)
    segment_id = enm["branches"][1]["ref_id"]

    payload = {
        "segment_id": segment_id,
        # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
        "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "station": {"station_type": "B", "sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
        "sn_fields": [
            {"field_role": "LINIA_IN"},
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
        "transformer": {
            "create": True,
            "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
        },
        "nn_block": {"outgoing_feeders_nn_count": 2},
    }

    run1 = execute_domain_operation(copy.deepcopy(enm), "insert_station_on_segment_sn", payload)
    run2 = execute_domain_operation(copy.deepcopy(enm), "insert_station_on_segment_sn", payload)

    assert run1.get("error") is None
    assert run2.get("error") is None

    hash1 = _snapshot_hash(run1["snapshot"])
    hash2 = _snapshot_hash(run2["snapshot"])

    assert (
        hash1 == hash2
    ), "Split+insert nie jest deterministyczne dla identycznego snapshotu wejściowego"
