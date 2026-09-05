"""
Budowniczowie sieci referencyjnych (Golden Networks).

Kazda siec referencyna jest budowana deterministycznie
przez sekwencje operacji domenowych.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def _canonical_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _snapshot_hash(enm: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(enm).encode("utf-8")).hexdigest()


def _branch_field_ref(enm: dict[str, Any], station_ref: str) -> str:
    station = next(s for s in enm.get("substations", []) if s.get("ref_id") == station_ref)
    for spec in station.get("meta", {}).get("field_specs", []):
        role = str(spec.get("field_role") or spec.get("bay_role") or "").upper()
        if role in {"LINIA_ODG", "FEEDER"}:
            return f"{spec['field_ref']}.BRANCH"
    raise AssertionError(f"Brak pola odgałęźnego w stacji {station_ref}")


def _empty_enm() -> dict[str, Any]:
    """Create a minimal empty ENM structure for testing."""
    return {
        "header": {"name": "Golden Network Test", "revision": 0, "defaults": {}},
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


def build_gn01_sn_promieniowa() -> dict[str, Any]:
    """GN_01: SN promieniowa (GPZ + 3 odcinki + 2 stacje typ B).

    Topology:
    [GPZ] --kabel_01--> [Bus_01] --kabel_02--> [Bus_02/Stacja_B1] --kabel_03--> [Bus_03/Stacja_B2]
                                                      |                              |
                                                  [TR SN/nN]                     [TR SN/nN]
                                                      |                              |
                                                  [Bus_nN_1]                     [Bus_nN_2]
    """
    from enm.domain_operations import execute_domain_operation

    enm = _empty_enm()

    # Step 1: Add GPZ source
    result = execute_domain_operation(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ Referencyjny",
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": "src-gpz-15kv-250mva-rx010",
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    assert result.get("error") is None, f"add_grid_source_sn failed: {result.get('error')}"
    enm = result["snapshot"]

    # Steps 2-4: Add 3 trunk segments (auto-detect trunk end)
    for i, length in enumerate([250, 180, 320], 1):
        result = execute_domain_operation(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": length,
                    "name": f"Odcinek {i}",
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )
        assert result.get("error") is None, f"continue_trunk #{i} failed: {result.get('error')}"
        enm = result["snapshot"]

    # Step 5: Insert station B on last segment
    branches = [b for b in enm.get("branches", []) if b.get("type") in ("cable", "line_overhead")]
    last_branch_ref = branches[-1]["ref_id"] if branches else None
    if last_branch_ref:
        result = execute_domain_operation(
            enm,
            "insert_station_on_segment_sn",
            {
                "segment_id": last_branch_ref,
                # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
                "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
                "insert_at": {"mode": "RATIO", "value": 0.5},
                "station": {
                    "station_type": "B",
                    "station_name": "Stacja B1 Referencyjna",
                    "sn_voltage_kv": 15.0,
                    "nn_voltage_kv": 0.4,
                },
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
            },
        )
        assert result.get("error") is None, f"insert_station failed: {result.get('error')}"
        enm = result["snapshot"]

    return {
        "name": "GN_01_SN_PROSTA",
        "description": "SN promieniowa (GPZ + 3 odcinki + 2 stacje)",
        "enm": enm,
        "snapshot_hash": _snapshot_hash(enm),
        "operations_count": 5,
    }


def build_gn02_sn_odgalezienie() -> dict[str, Any]:
    """GN_02: SN z odgalezieniem (magistrala + odgalezienie + stacja C).

    Topology:
    [GPZ] --kabel_01--> [Bus_01] --kabel_02--> [Bus_02]
                             |
                         [Branch]
                             |
                         [Bus_03/Stacja_C]
    """
    from enm.domain_operations import execute_domain_operation

    enm = _empty_enm()

    # Step 1: Add GPZ
    result = execute_domain_operation(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ Odgalezienie",
            "sk3_mva": 200.0,
            "rx_ratio": 0.1,
            "catalog_ref": "src-gpz-15kv-200mva-rx010",
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    assert result.get("error") is None, f"add_grid_source_sn failed: {result.get('error')}"
    enm = result["snapshot"]

    # Steps 2-3: Continue trunk 2 times
    for i, length in enumerate([200, 300], 1):
        result = execute_domain_operation(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": length,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )
        assert result.get("error") is None, f"continue_trunk #{i} failed: {result.get('error')}"
        enm = result["snapshot"]

    # Step 4: Insert station C on last segment
    branches = [b for b in enm.get("branches", []) if b.get("type") in ("cable", "line_overhead")]
    if branches:
        result = execute_domain_operation(
            enm,
            "insert_station_on_segment_sn",
            {
                "segment_id": branches[-1]["ref_id"],
                # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
                "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
                "insert_at": {"mode": "RATIO", "value": 0.5},
                "station": {
                    "station_type": "C",
                    "station_name": "Stacja C1 Referencyjna",
                    "sn_voltage_kv": 15.0,
                    "nn_voltage_kv": 0.4,
                },
                "sn_fields": [
                    {"field_role": "LINIA_IN"},
                    {"field_role": "LINIA_OUT"},
                    {"field_role": "LINIA_ODG"},
                    {"field_role": "TRANSFORMATOROWE"},
                ],
                "transformer": {
                    "create": True,
                    "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
                },
                "nn_block": {"outgoing_feeders_nn_count": 2},
            },
        )
        assert result.get("error") is None, f"insert_station failed: {result.get('error')}"
        enm = result["snapshot"]

    # Step 5: Start branch from station branch field
    station_refs = [
        s.get("ref_id")
        for s in enm.get("substations", [])
        if s.get("ref_id", "").startswith("stn/")
    ]
    if station_refs:
        result = execute_domain_operation(
            enm,
            "start_branch_segment_sn",
            {
                "from_ref": _branch_field_ref(enm, station_refs[-1]),
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 150,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )
        assert result.get("error") is None, f"start_branch failed: {result.get('error')}"
        enm = result["snapshot"]

    return {
        "name": "GN_02_SN_ODG",
        "description": "SN z odgalezieniam (magistrala + odgalezienie)",
        "enm": enm,
        "snapshot_hash": _snapshot_hash(enm),
        "operations_count": 5,
    }


def build_gn03_sn_pierscien() -> dict[str, Any]:
    """GN_03: SN z pierscieniem + NOP.

    Topology:
    [GPZ] --kabel_01--> [Bus_01] --kabel_02--> [Bus_02] --kabel_03--> [Bus_03]
              |                                                             |
              +-- kabel_ring (NOP) -----------------------------------------+
    """
    from enm.domain_operations import execute_domain_operation

    enm = _empty_enm()

    # Step 1: Add GPZ
    result = execute_domain_operation(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ Pierscien",
            "sk3_mva": 300.0,
            "rx_ratio": 0.1,
            "catalog_ref": "src-gpz-15kv-300mva-rx010",
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    assert result.get("error") is None, f"add_grid_source_sn failed: {result.get('error')}"
    enm = result["snapshot"]

    # Steps 2-4: Continue trunk 3 times
    for i, length in enumerate([200, 250, 300], 1):
        result = execute_domain_operation(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": length,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )
        assert result.get("error") is None, f"continue_trunk #{i} failed: {result.get('error')}"
        enm = result["snapshot"]

    # Step 5: Insert section switch on second segment
    branches = [b for b in enm.get("branches", []) if b.get("type") in ("cable", "line_overhead")]
    if len(branches) >= 2:
        result = execute_domain_operation(
            enm,
            "insert_section_switch_sn",
            {
                "segment_id": branches[1]["ref_id"],
                "insert_at": {"mode": "RATIO", "value": 0.5},
                "catalog_ref": "sw-ls-schneider-rm6-17kv-400a",
            },
        )
        assert result.get("error") is None, f"insert_switch failed: {result.get('error')}"
        enm = result["snapshot"]

    # Step 6: Connect ring between first and last SN buses
    sn_buses = [b for b in enm.get("buses", []) if b.get("voltage_kv", 0) > 1.0]
    if len(sn_buses) >= 2:
        result = execute_domain_operation(
            enm,
            "connect_secondary_ring_sn",
            {
                "from_bus_ref": sn_buses[0]["ref_id"],
                "to_bus_ref": sn_buses[-1]["ref_id"],
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 400,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )
        assert (
            result.get("error") is None
        ), f"connect_secondary_ring_sn failed: {result.get('error')}"
        enm = result["snapshot"]

    # Step 7: Set NOP on the switch
    switches = [b for b in enm.get("branches", []) if b.get("type") in ("switch", "breaker")]
    if switches:
        result = execute_domain_operation(
            enm,
            "set_normal_open_point",
            {
                "switch_ref": switches[0]["ref_id"],
            },
        )
        assert result.get("error") is None, f"set_normal_open_point failed: {result.get('error')}"
        enm = result["snapshot"]

    return {
        "name": "GN_03_SN_PIERSCIEN",
        "description": "SN z pierscieniem + NOP",
        "enm": enm,
        "snapshot_hash": _snapshot_hash(enm),
        "operations_count": 7,
    }


def build_gn04_sn_nn_oze() -> dict[str, Any]:
    """GN_04: SN+nN+OZE (stacja + rozdzielnica nN + PV + BESS).

    Topology:
    [GPZ] --kabel--> [Bus_01] --kabel--> [Bus_02]
                                              |
                                         [Stacja B]
                                              |
                                          [TR SN/nN]
                                              |
                                          [Bus_nN] -- [PV_50kW] -- [BESS_30kW]
    """
    from enm.domain_operations import execute_domain_operation

    enm = _empty_enm()

    # Step 1: GPZ
    result = execute_domain_operation(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ OZE",
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": "src-gpz-15kv-250mva-rx010",
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    assert result.get("error") is None, f"add_grid_source_sn failed: {result.get('error')}"
    enm = result["snapshot"]

    # Step 2: Continue trunk
    result = execute_domain_operation(
        enm,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 600,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            },
        },
    )
    assert result.get("error") is None, f"continue_trunk failed: {result.get('error')}"
    enm = result["snapshot"]

    # Step 3: Insert station B with nN and transformer
    branches = [b for b in enm.get("branches", []) if b.get("type") in ("cable", "line_overhead")]
    assert len(branches) >= 1, "No cable branches found for station insertion"
    result = execute_domain_operation(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_id": branches[0]["ref_id"],
            # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "station": {
                "station_type": "B",
                "station_name": "Stacja OZE B1",
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
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
        },
    )
    assert result.get("error") is None, f"insert_station failed: {result.get('error')}"
    enm = result["snapshot"]

    # Step 4: Add PV inverter (find nN bus)
    nn_buses = [b for b in enm.get("buses", []) if b.get("voltage_kv", 0) < 1.0]
    if nn_buses:
        nn_bus_ref = nn_buses[0]["ref_id"]
        station_ref = next(
            (
                substation.get("ref_id")
                for substation in enm.get("substations", [])
                if nn_bus_ref in list(substation.get("bus_refs") or [])
            ),
            None,
        )

        if station_ref:
            result = execute_domain_operation(
                enm,
                "add_converter_source",
                {
                    "source_technology": "PV",
                    "connection_variant": "nn_side",
                    "station_ref": station_ref,
                    "bus_nn_ref": nn_bus_ref,
                    "source_name": "PV_01",
                    "control_mode": "STALY_COS_PHI",
                    "power_setpoint_mw": 0.05,
                    "catalog_binding": {
                        "catalog_namespace": "ZRODLO_NN_PV",
                        "catalog_item_id": "conv-pv-nn-0p5mw-0p4kv",
                        "catalog_item_version": "2024.1",
                    },
                    "source_field": {
                        "field_name": "Pole PV nN",
                        "source_field_kind": "PV",
                    },
                },
            )
            if result.get("error") is None:
                enm = result["snapshot"]

            # Step 5: Add BESS
            result = execute_domain_operation(
                enm,
                "add_converter_source",
                {
                    "source_technology": "BESS",
                    "connection_variant": "nn_side",
                    "station_ref": station_ref,
                    "bus_nn_ref": nn_bus_ref,
                    "source_name": "BESS_01",
                    "bess_mode": "DWUKIERUNKOWY",
                    "power_setpoint_mw": 0.03,
                    "catalog_binding": {
                        "catalog_namespace": "ZRODLO_NN_BESS",
                        "catalog_item_id": "conv-bess-nn-0p5mw-0p4kv",
                        "catalog_item_version": "2024.1",
                    },
                    "source_field": {
                        "field_name": "Pole BESS nN",
                        "source_field_kind": "BESS",
                    },
                },
            )
            if result.get("error") is None:
                enm = result["snapshot"]

    return {
        "name": "GN_04_SN_NN_OZE",
        "description": "SN+nN+OZE (stacja + PV + BESS)",
        "enm": enm,
        "snapshot_hash": _snapshot_hash(enm),
        "operations_count": 5,
    }


def build_gn05_sn_nn_oze_ochrona() -> dict[str, Any]:
    """GN_05: SN+nN+OZE+ochrona (jak GN_04 + zabezpieczenia + analiza ochrony).

    Extends GN_04 with CT + VT + Relay on transformer field.
    """
    from enm.domain_operations import execute_domain_operation

    gn04 = build_gn04_sn_nn_oze()
    enm = gn04["enm"]

    # Find a bay (field) to attach protection devices
    bays = enm.get("bays", [])
    # Prefer a TR (transformer) bay
    tr_bays = [bay for bay in bays if bay.get("bay_role") == "TR"]
    target_bay = tr_bays[0] if tr_bays else (bays[0] if bays else None)

    if target_bay:
        bay_ref = target_bay["ref_id"]

        # Step 6: Add CT
        result = execute_domain_operation(
            enm,
            "add_ct",
            {
                "bay_ref": bay_ref,
                "ratio_primary_a": 200.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 10.0,
            },
        )
        if result.get("error") is None:
            enm = result["snapshot"]

        # Step 7: Add VT
        result = execute_domain_operation(
            enm,
            "add_vt",
            {
                "bay_ref": bay_ref,
                "ratio_primary_v": 15000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "0.5",
            },
        )
        if result.get("error") is None:
            enm = result["snapshot"]

        # Step 8: Add Relay
        result = execute_domain_operation(
            enm,
            "add_relay",
            {
                "bay_ref": bay_ref,
                "relay_type": "NADPRADOWY",
            },
        )
        if result.get("error") is None:
            enm = result["snapshot"]

        # Keep GN_05 structurally distinct from GN_04 even while protection
        # write-paths are routed through a read-model transition.
        for bay in enm.get("bays", []):
            if bay.get("ref_id") == bay_ref:
                meta = bay.setdefault("meta", {})
                meta["protection_reference"] = {
                    "ct": True,
                    "vt": True,
                    "relay_type": "NADPRADOWY",
                }
                break

    header = enm.setdefault("header", {})
    header["reference_extension"] = {
        "protection_enabled": True,
        "profile": "GN_05_PROTECTION_EXTENSION",
    }

    return {
        "name": "GN_05_SN_NN_OZE_OCHRONA",
        "description": "SN+nN+OZE+ochrona (pelna siec referencyjna)",
        "enm": enm,
        "snapshot_hash": _snapshot_hash(enm),
        "operations_count": 8,
    }


# Convenience function to build all 5
def build_all_golden_networks() -> list[dict[str, Any]]:
    """Build all 5 golden reference networks."""
    return [
        build_gn01_sn_promieniowa(),
        build_gn02_sn_odgalezienie(),
        build_gn03_sn_pierscien(),
        build_gn04_sn_nn_oze(),
        build_gn05_sn_nn_oze_ochrona(),
    ]
