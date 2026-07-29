"""
IEEE 13-bus distribution feeder builder.

Source: Kersting W.H. (2001) "Radial Distribution Test Feeders",
IEEE Trans. PWRS 6(3), p.975. Available at IEEE PES Test Feeders WG.

Network: 13-node radial feeder at 4.16 kV with unbalanced loads,
voltage regulator at substation, single-phase laterals.

Simplified for ENM representation (balanced equivalent + per-phase loads).
"""

from __future__ import annotations

from typing import Any


def build_ieee_13bus_network() -> dict[str, Any]:
    """Return ENM-like dict for IEEE 13-bus distribution feeder."""
    # Bus naming per Kersting 2001: 650, 632, 633, 634, 645, 646, 671, 692, 675, 680, 684, 652, 611
    bus_ids = [
        "BUS-650",
        "BUS-632",
        "BUS-633",
        "BUS-634",
        "BUS-645",
        "BUS-646",
        "BUS-671",
        "BUS-692",
        "BUS-675",
        "BUS-680",
        "BUS-684",
        "BUS-652",
        "BUS-611",
    ]
    buses = []
    for i, bid in enumerate(bus_ids):
        voltage = 4.16 if "634" not in bid else 0.48  # 634 is LV
        buses.append(
            {
                "ref_id": bid,
                "id": bid,
                "name": bid,
                "u_n_kv": voltage,
                "bus_kind": "slack" if i == 0 else "pq",
            }
        )

    # Radial topology (simplified Kersting):
    branches = [
        ("L650-632", "BUS-650", "BUS-632", 0.0001, 0.0003, 2000.0),  # voltage regulator equivalent
        ("L632-633", "BUS-632", "BUS-633", 0.018, 0.024, 500.0),
        ("L632-645", "BUS-632", "BUS-645", 0.022, 0.030, 500.0),
        ("L632-671", "BUS-632", "BUS-671", 0.025, 0.034, 2000.0),
        ("L633-634", "BUS-633", "BUS-634", 0.001, 0.001, 0.0),  # transformer at 633
        ("L645-646", "BUS-645", "BUS-646", 0.015, 0.022, 300.0),
        ("L671-692", "BUS-671", "BUS-692", 0.001, 0.001, 0.0),  # switch
        ("L671-680", "BUS-671", "BUS-680", 0.025, 0.034, 1000.0),
        ("L671-684", "BUS-671", "BUS-684", 0.018, 0.024, 300.0),
        ("L684-611", "BUS-684", "BUS-611", 0.015, 0.022, 300.0),
        ("L684-652", "BUS-684", "BUS-652", 0.022, 0.030, 800.0),
        ("L692-675", "BUS-692", "BUS-675", 0.025, 0.034, 500.0),
    ]
    branch_list = []
    for bid, fbus, tbus, r_pu, x_pu, length in branches:
        branch_list.append(
            {
                "ref_id": bid,
                "id": bid,
                "name": bid,
                "branch_type": "LineBranch",
                "from_bus": fbus,
                "to_bus": tbus,
                "r_pu": r_pu,
                "x_pu": x_pu,
                "b_pu": 0.0,
                "length_km": length / 1000.0,
            }
        )

    # Per Kersting load schedule (Table I) - approximated as balanced 3-phase
    loads = [
        {"ref_id": "LOAD-634", "id": "LOAD-634", "bus": "BUS-634", "p_mw": 0.400, "q_mvar": 0.290},
        {"ref_id": "LOAD-645", "id": "LOAD-645", "bus": "BUS-645", "p_mw": 0.170, "q_mvar": 0.125},
        {"ref_id": "LOAD-646", "id": "LOAD-646", "bus": "BUS-646", "p_mw": 0.230, "q_mvar": 0.132},
        {"ref_id": "LOAD-671", "id": "LOAD-671", "bus": "BUS-671", "p_mw": 1.155, "q_mvar": 0.660},
        {"ref_id": "LOAD-675", "id": "LOAD-675", "bus": "BUS-675", "p_mw": 0.843, "q_mvar": 0.462},
        {"ref_id": "LOAD-652", "id": "LOAD-652", "bus": "BUS-652", "p_mw": 0.128, "q_mvar": 0.086},
        {"ref_id": "LOAD-611", "id": "LOAD-611", "bus": "BUS-611", "p_mw": 0.170, "q_mvar": 0.080},
        {"ref_id": "LOAD-692", "id": "LOAD-692", "bus": "BUS-692", "p_mw": 0.170, "q_mvar": 0.151},
    ]

    return {
        "header": {
            "name": "IEEE 13-bus distribution feeder",
            "revision": 0,
            "base_kv": 4.16,
            "base_mva": 100.0,
            "defaults": {},
        },
        "buses": buses,
        "branches": branch_list,
        "transformers": [],
        "sources": [
            {
                "ref_id": "GRID",
                "id": "GRID",
                "name": "Substation",
                "bus": "BUS-650",
                "v_pu": 1.0,
                "source_kind": "slack",
            },
        ],
        "loads": loads,
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }
