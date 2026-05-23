"""
IEEE 4-bus reference network builder.

Source: Stevenson "Elements of Power System Analysis" (1982), Example 9.5, p.337.
Network: 4 buses, 5 lines, 1 slack at BUS-1, 1 PV at BUS-4, 2 PQ at BUS-2 and BUS-3.

System data (per Stevenson Example 9.5):
- Base voltage: 132 kV
- Base power: 100 MVA
- Line impedances per-unit (R + jX):
    Line 1-2: 0.01008 + j0.0504
    Line 1-3: 0.00744 + j0.0372
    Line 2-4: 0.00744 + j0.0372
    Line 3-4: 0.01272 + j0.0636
- Load schedule:
    BUS-2: P=50 MW, Q=30.99 MVAR
    BUS-3: P=60 MW, Q=22.66 MVAR
    BUS-4: P=80 MW, Q=33.42 MVAR
- Generation:
    BUS-1: slack
    BUS-4: PV, P=Pgen=auto, |V|=1.02 pu
"""

from __future__ import annotations

from typing import Any


def build_ieee_4bus_network() -> dict[str, Any]:
    """Return ENM-like dict representation of IEEE 4-bus."""
    return {
        "header": {
            "name": "IEEE 4-bus (Stevenson 1982 Example 9.5)",
            "revision": 0,
            "base_kv": 132.0,
            "base_mva": 100.0,
            "defaults": {},
        },
        "buses": [
            {"ref_id": "BUS-1", "id": "BUS-1", "name": "BUS-1", "u_n_kv": 132.0, "bus_kind": "slack"},
            {"ref_id": "BUS-2", "id": "BUS-2", "name": "BUS-2", "u_n_kv": 132.0, "bus_kind": "pq"},
            {"ref_id": "BUS-3", "id": "BUS-3", "name": "BUS-3", "u_n_kv": 132.0, "bus_kind": "pq"},
            {"ref_id": "BUS-4", "id": "BUS-4", "name": "BUS-4", "u_n_kv": 132.0, "bus_kind": "pv"},
        ],
        "branches": [
            {
                "ref_id": "L12",
                "id": "L12",
                "name": "Line 1-2",
                "branch_type": "LineBranch",
                "from_bus": "BUS-1",
                "to_bus": "BUS-2",
                "r_pu": 0.01008,
                "x_pu": 0.0504,
                "b_pu": 0.1025,
                "length_km": 1.0,
            },
            {
                "ref_id": "L13",
                "id": "L13",
                "name": "Line 1-3",
                "branch_type": "LineBranch",
                "from_bus": "BUS-1",
                "to_bus": "BUS-3",
                "r_pu": 0.00744,
                "x_pu": 0.0372,
                "b_pu": 0.0775,
                "length_km": 1.0,
            },
            {
                "ref_id": "L24",
                "id": "L24",
                "name": "Line 2-4",
                "branch_type": "LineBranch",
                "from_bus": "BUS-2",
                "to_bus": "BUS-4",
                "r_pu": 0.00744,
                "x_pu": 0.0372,
                "b_pu": 0.0775,
                "length_km": 1.0,
            },
            {
                "ref_id": "L34",
                "id": "L34",
                "name": "Line 3-4",
                "branch_type": "LineBranch",
                "from_bus": "BUS-3",
                "to_bus": "BUS-4",
                "r_pu": 0.01272,
                "x_pu": 0.0636,
                "b_pu": 0.1280,
                "length_km": 1.0,
            },
        ],
        "transformers": [],
        "sources": [
            {
                "ref_id": "SLACK",
                "id": "SLACK",
                "name": "Slack source @ BUS-1",
                "bus": "BUS-1",
                "v_pu": 1.0,
                "source_kind": "slack",
            },
        ],
        "loads": [
            {
                "ref_id": "LOAD-2",
                "id": "LOAD-2",
                "bus": "BUS-2",
                "p_mw": 50.0,
                "q_mvar": 30.99,
            },
            {
                "ref_id": "LOAD-3",
                "id": "LOAD-3",
                "bus": "BUS-3",
                "p_mw": 60.0,
                "q_mvar": 22.66,
            },
        ],
        "generators": [
            # Net injection at BUS-4 = 318 MW (Stevenson Example 9.5 Table 9.3).
            # Modeled as pure generation (load on BUS-4 = 80 MW absorbed locally, gen produces
            # 398 MW; net export = 318 MW = our gen value here for cleaner PV bus model).
            {
                "ref_id": "GEN-4",
                "id": "GEN-4",
                "bus": "BUS-4",
                "p_mw": 318.0,
                "v_pu": 1.02,
                "gen_kind": "pv",
            },
        ],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }
