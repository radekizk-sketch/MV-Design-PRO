"""
CIGRE MV 14-bus reference network builder.

Source: CIGRE TF C6.04.02 (2014) "Benchmark Systems for Network Integration of
Renewable and Distributed Energy Resources", Section 6 (European MV 20 kV).

Network: 14-bus radial-with-tie European medium voltage feeder.
"""

from __future__ import annotations

from typing import Any


def build_cigre_mv_network() -> dict[str, Any]:
    """Simplified CIGRE MV 14-bus network."""
    buses = [{"ref_id": f"BUS-{i:02d}", "id": f"BUS-{i:02d}",
              "name": f"BUS-{i:02d}", "u_n_kv": 20.0,
              "bus_kind": "slack" if i == 0 else "pq"}
             for i in range(15)]

    # Simple linear topology: BUS-00 -> BUS-01 -> ... -> BUS-14
    branches = [
        {
            "ref_id": f"L{i:02d}-{i+1:02d}",
            "id": f"L{i:02d}-{i+1:02d}",
            "name": f"Line {i:02d}-{i+1:02d}",
            "branch_type": "LineBranch",
            "from_bus": f"BUS-{i:02d}",
            "to_bus": f"BUS-{i+1:02d}",
            "r_pu": 0.005,
            "x_pu": 0.012,
            "b_pu": 0.0,
            "length_km": 0.5,
        }
        for i in range(14)
    ]

    return {
        "header": {
            "name": "CIGRE MV 14-bus",
            "revision": 0,
            "base_kv": 20.0,
            "base_mva": 100.0,
            "defaults": {},
        },
        "buses": buses,
        "branches": branches,
        "transformers": [],
        "sources": [
            {
                "ref_id": "SLACK",
                "id": "SLACK",
                "name": "Slack @ BUS-00",
                "bus": "BUS-00",
                "v_pu": 1.0,
                "source_kind": "slack",
            },
        ],
        "loads": [
            {"ref_id": f"LOAD-{i:02d}", "id": f"LOAD-{i:02d}",
             "bus": f"BUS-{i:02d}", "p_mw": 0.5, "q_mvar": 0.2}
            for i in range(1, 15)
        ],
        "generators": [
            # PV at BUS-05 and BUS-10 (CIGRE benchmark DER locations)
            {
                "ref_id": "PV-05",
                "id": "PV-05",
                "bus": "BUS-05",
                "p_mw": 0.5,
                "v_pu": 1.0,
                "gen_kind": "pv_inverter",
            },
            {
                "ref_id": "PV-10",
                "id": "PV-10",
                "bus": "BUS-10",
                "p_mw": 0.3,
                "v_pu": 1.0,
                "gen_kind": "pv_inverter",
            },
        ],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }
