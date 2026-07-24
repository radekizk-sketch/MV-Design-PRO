"""
Pandapower simple_four_bus_system reference network builder.

Source: pandapower.networks.example_simple() — used as cross-check for NR solver.
"""

from __future__ import annotations

from typing import Any


def build_pp_simple_four_bus_network() -> dict[str, Any]:
    """4-bus system from pandapower example_simple()."""
    return {
        "header": {
            "name": "Pandapower simple 4-bus",
            "revision": 0,
            "base_kv": 20.0,
            "base_mva": 100.0,
            "defaults": {},
        },
        "buses": [
            {
                "ref_id": "BUS-1",
                "id": "BUS-1",
                "name": "Slack 110kV",
                "u_n_kv": 110.0,
                "bus_kind": "slack",
            },
            {
                "ref_id": "BUS-2",
                "id": "BUS-2",
                "name": "MV bus 20kV",
                "u_n_kv": 20.0,
                "bus_kind": "pq",
            },
            {
                "ref_id": "BUS-3",
                "id": "BUS-3",
                "name": "MV bus 20kV",
                "u_n_kv": 20.0,
                "bus_kind": "pq",
            },
            {
                "ref_id": "BUS-4",
                "id": "BUS-4",
                "name": "MV bus 20kV",
                "u_n_kv": 20.0,
                "bus_kind": "pq",
            },
        ],
        "branches": [
            {
                "ref_id": "L23",
                "id": "L23",
                "name": "Line 2-3",
                "branch_type": "LineBranch",
                "from_bus": "BUS-2",
                "to_bus": "BUS-3",
                "r_pu": 0.0001,
                "x_pu": 0.0006,
                "b_pu": 0.0,
                "length_km": 1.0,
            },
            {
                "ref_id": "L34",
                "id": "L34",
                "name": "Line 3-4",
                "branch_type": "LineBranch",
                "from_bus": "BUS-3",
                "to_bus": "BUS-4",
                "r_pu": 0.0001,
                "x_pu": 0.0006,
                "b_pu": 0.0,
                "length_km": 1.0,
            },
        ],
        "transformers": [
            {
                "ref_id": "TR-110-20",
                "id": "TR-110-20",
                "from_bus": "BUS-1",
                "to_bus": "BUS-2",
                "sn_mva": 25.0,
                "ukr_pct": 12.0,
                "primary_kv": 110.0,
                "secondary_kv": 20.0,
            },
        ],
        "sources": [
            {"ref_id": "GRID", "id": "GRID", "bus": "BUS-1", "v_pu": 1.0, "source_kind": "slack"},
        ],
        "loads": [
            {"ref_id": "LOAD-3", "id": "LOAD-3", "bus": "BUS-3", "p_mw": 1.0, "q_mvar": 0.4},
            {"ref_id": "LOAD-4", "id": "LOAD-4", "bus": "BUS-4", "p_mw": 0.8, "q_mvar": 0.3},
        ],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }
