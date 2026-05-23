"""
CIGRE LV residential benchmark builder.

Source: CIGRE TF C6.04.02 (2014), Section 7 — European LV residential 0.4 kV
with rooftop PV. 14 residential buses fed from MV/LV transformer.
"""

from __future__ import annotations

from typing import Any


def build_cigre_lv_benchmark_network() -> dict[str, Any]:
    """Return ENM-like dict for CIGRE LV residential (simplified)."""
    return {
        "header": {
            "name": "CIGRE LV residential 0.4 kV",
            "revision": 0,
            "base_kv": 0.4,
            "base_mva": 1.0,  # small base for LV
            "defaults": {},
        },
        "buses": [
            {"ref_id": "BUS-MV", "id": "BUS-MV", "name": "MV side", "u_n_kv": 20.0, "bus_kind": "slack"},
            {"ref_id": "BUS-LV-MAIN", "id": "BUS-LV-MAIN", "name": "LV main",
             "u_n_kv": 0.4, "bus_kind": "pq"},
            *[
                {"ref_id": f"BUS-LV-{i:02d}", "id": f"BUS-LV-{i:02d}",
                 "name": f"House {i:02d}", "u_n_kv": 0.4, "bus_kind": "pq"}
                for i in range(1, 6)
            ],
        ],
        "branches": [
            *[
                {
                    "ref_id": f"L-MAIN-{i:02d}",
                    "id": f"L-MAIN-{i:02d}",
                    "name": f"LV cable to house {i:02d}",
                    "branch_type": "LineBranch",
                    "from_bus": "BUS-LV-MAIN",
                    "to_bus": f"BUS-LV-{i:02d}",
                    "r_pu": 0.02 + i * 0.005,
                    "x_pu": 0.005,
                    "b_pu": 0.0,
                    "length_km": 0.030 + i * 0.005,
                }
                for i in range(1, 6)
            ],
        ],
        "transformers": [
            {
                "ref_id": "TR-MV-LV",
                "id": "TR-MV-LV",
                "from_bus": "BUS-MV",
                "to_bus": "BUS-LV-MAIN",
                "sn_mva": 0.4,
                "ukr_pct": 4.0,
                "primary_kv": 20.0,
                "secondary_kv": 0.4,
            },
        ],
        "sources": [
            {"ref_id": "GRID", "id": "GRID", "bus": "BUS-MV", "v_pu": 1.0, "source_kind": "slack"},
        ],
        "loads": [
            {
                "ref_id": f"HOUSE-{i:02d}",
                "id": f"HOUSE-{i:02d}",
                "bus": f"BUS-LV-{i:02d}",
                "p_mw": 0.005,  # 5 kW per house
                "q_mvar": 0.001,
            }
            for i in range(1, 6)
        ],
        "generators": [
            # Rooftop PV at houses 2 and 4 (CIGRE benchmark)
            {
                "ref_id": "PV-HOUSE-02",
                "id": "PV-HOUSE-02",
                "bus": "BUS-LV-02",
                "p_mw": 0.003,
                "v_pu": 1.0,
                "gen_kind": "pv_residential",
            },
            {
                "ref_id": "PV-HOUSE-04",
                "id": "PV-HOUSE-04",
                "bus": "BUS-LV-04",
                "p_mw": 0.003,
                "v_pu": 1.0,
                "gen_kind": "pv_residential",
            },
        ],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }
