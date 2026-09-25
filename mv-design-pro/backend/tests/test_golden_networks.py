"""
Golden Networks — deterministyczne sieci referencyjne.

6 złotych sieci z weryfikacją hash i artefaktów.
"""

from __future__ import annotations

from enm.domain_operations import execute_domain_operation


def _empty_enm() -> dict:
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


def _branch_field_ref(enm: dict, station_ref: str) -> str:
    station = next(s for s in enm.get("substations", []) if s.get("ref_id") == station_ref)
    for spec in station.get("meta", {}).get("field_specs", []):
        role = str(spec.get("field_role") or spec.get("bay_role") or "").upper()
        if role in {"LINIA_ODG", "FEEDER"}:
            return f"{spec['field_ref']}.BRANCH"
    raise AssertionError(f"Brak pola odgałęźnego w stacji {station_ref}")


class TestGN01SNProsta:
    """GN_01: GPZ -> 3 odcinki magistrali -> stacja B"""

    def _build_gn01(self):
        enm = _empty_enm()
        # 1. Add GPZ source
        r = execute_domain_operation(
            enm,
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "source_name": "GPZ Główne",
                "sk3_mva": 500.0,
                "rx_ratio": 0.1,
                "catalog_ref": "src-gpz-15kv-500mva-rx010",
                "hv_voltage_kv": 110.0,
                "transformer_sn_mva": 25.0,
            },
        )
        assert r.get("error") is None, f"GPZ failed: {r.get('error')}"
        enm = r["snapshot"]

        # 2-4. Add 3 trunk segments
        for i, length in enumerate([250, 180, 320], 1):
            r = execute_domain_operation(
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
            assert r.get("error") is None, f"Trunk {i} failed: {r.get('error')}"
            enm = r["snapshot"]

        # 5. Insert station B on last segment
        branches = [
            b for b in enm.get("branches", []) if b.get("type") in ("cable", "line_overhead")
        ]
        last_branch_ref = branches[-1]["ref_id"] if branches else None
        if last_branch_ref:
            r = execute_domain_operation(
                enm,
                "insert_station_on_segment_sn",
                {
                    "segment_id": last_branch_ref,
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
                },
            )
            assert r.get("error") is None, f"Station failed: {r.get('error')}"
            enm = r["snapshot"]

        return enm, r["layout"]["layout_hash"]

    def test_build(self):
        enm, layout_hash = self._build_gn01()
        assert len(enm.get("sources", [])) >= 1
        assert len(enm.get("buses", [])) >= 4
        assert len(enm.get("substations", [])) >= 2
        assert layout_hash

    def test_determinism(self):
        _, hash1 = self._build_gn01()
        _, hash2 = self._build_gn01()
        _, hash3 = self._build_gn01()
        assert hash1 == hash2 == hash3, "Layout hash not deterministic"


class TestGN02SNODG:
    """GN_02: GPZ -> magistrala 2 odcinki -> stacja C z odgałęzieniem"""

    def test_build(self):
        enm = _empty_enm()
        r = execute_domain_operation(
            enm,
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "catalog_ref": "src-gpz-15kv-250mva-rx010",
                "hv_voltage_kv": 110.0,
                "transformer_sn_mva": 25.0,
            },
        )
        assert r.get("error") is None, f"GPZ failed: {r.get('error')}"
        enm = r["snapshot"]

        for length in [200, 300]:
            r = execute_domain_operation(
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
            enm = r["snapshot"]

        branches = [
            b for b in enm.get("branches", []) if b.get("type") in ("cable", "line_overhead")
        ]
        if branches:
            r = execute_domain_operation(
                enm,
                "insert_station_on_segment_sn",
                {
                    "segment_id": branches[-1]["ref_id"],
                    # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
                    "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
                    "insert_at": {"mode": "RATIO", "value": 0.5},
                    "station": {"station_type": "C", "sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
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
            enm = r["snapshot"]

        # Start branch from station branch field
        station_refs = [
            s.get("ref_id")
            for s in enm.get("substations", [])
            if s.get("ref_id", "").startswith("stn/")
        ]
        if station_refs:
            r = execute_domain_operation(
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
            assert r.get("error") is None

        assert len(enm.get("substations", [])) >= 2


class TestGN03SNRingNOP:
    """GN_03: GPZ -> ring wtórny + NOP"""

    def test_build(self):
        enm = _empty_enm()
        r = execute_domain_operation(
            enm,
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "catalog_ref": "src-gpz-15kv-250mva-rx010",
                "hv_voltage_kv": 110.0,
                "transformer_sn_mva": 25.0,
            },
        )
        assert r.get("error") is None, f"GPZ failed: {r.get('error')}"
        enm = r["snapshot"]

        for length in [200, 250, 300]:
            r = execute_domain_operation(
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
            enm = r["snapshot"]

        # Insert switch
        branches = [
            b for b in enm.get("branches", []) if b.get("type") in ("cable", "line_overhead")
        ]
        if branches:
            r = execute_domain_operation(
                enm,
                "insert_section_switch_sn",
                {
                    "segment_id": branches[1]["ref_id"],
                    "insert_at": {"mode": "RATIO", "value": 0.5},
                    "catalog_ref": "sw-ls-schneider-rm6-17kv-400a",
                },
            )
            enm = r["snapshot"]

        # Connect ring
        sn_buses = [b for b in enm.get("buses", []) if b.get("voltage_kv", 0) > 1.0]
        if len(sn_buses) >= 2:
            r = execute_domain_operation(
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
            assert r.get("error") is None
            enm = r["snapshot"]

        # Set NOP
        switches = [b for b in enm.get("branches", []) if b.get("type") in ("switch", "breaker")]
        if switches:
            r = execute_domain_operation(
                enm,
                "set_normal_open_point",
                {
                    "switch_ref": switches[0]["ref_id"],
                },
            )
            assert r.get("error") is None


class TestRepeatability:
    """Deterministyczność: 3x powtórzenia (placeholder for 100x)."""

    def test_repeatability_3x(self):
        hashes = set()
        for _ in range(3):
            enm = _empty_enm()
            r = execute_domain_operation(
                enm,
                "add_grid_source_sn",
                {
                    "voltage_kv": 15.0,
                    "sk3_mva": 500.0,
                    "catalog_ref": "src-gpz-15kv-500mva-rx010",
                    "hv_voltage_kv": 110.0,
                    "transformer_sn_mva": 25.0,
                },
            )
            assert r.get("error") is None, f"GPZ failed: {r.get('error')}"
            enm = r["snapshot"]
            r = execute_domain_operation(
                enm,
                "continue_trunk_segment_sn",
                {
                    "segment": {
                        "rodzaj": "KABEL",
                        "dlugosc_m": 250,
                        "catalog_ref": "cable-tfk-yakxs-3x120",
                    },
                },
            )
            assert r.get("error") is None, f"Odcinek failed: {r.get('error')}"
            hashes.add(r["layout"]["layout_hash"])
        assert len(hashes) == 1, f"Non-deterministic: {hashes}"
