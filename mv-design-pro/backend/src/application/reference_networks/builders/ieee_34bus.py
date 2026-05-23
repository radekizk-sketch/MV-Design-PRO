"""
IEEE 34-bus distribution feeder builder.

Source: Kersting W.H. (2001) "Radial Distribution Test Feeders",
IEEE Trans. PWRS 6(3). Long rural feeder at 24.9 kV with voltage regulators.

Simplified topology (linear with branches per Kersting Fig. 2):
Slack-800 -> 802 -> 806 -> 808 -> 812 -> 814 -> 850 (reg) -> 816 -> 824 -> 828 -> 830 -> 854 ->
856 -> 852 -> 832 -> 858 -> 834 -> 842 -> 844 -> 846 -> 848  (main)
Laterals: 808-810, 810-836, 816-818, 818-820, 820-822, 824-826, 832-888, 888-890, 854-856, 858-864, 862-838

This builder uses a simplified 34-node sequence; full unbalanced data computed by BFS solver.
"""

from __future__ import annotations

from typing import Any


def build_ieee_34bus_network() -> dict[str, Any]:
    """Return ENM-like dict for IEEE 34-bus distribution feeder (simplified)."""
    bus_numbers = [
        800, 802, 806, 808, 810, 812, 814, 850, 816, 818, 820, 822,
        824, 826, 828, 830, 854, 856, 852, 832, 888, 890, 858, 864,
        834, 842, 844, 846, 848, 836, 862, 838,
    ]
    buses = []
    for i, num in enumerate(bus_numbers):
        buses.append({
            "ref_id": f"BUS-{num}",
            "id": f"BUS-{num}",
            "name": f"BUS-{num}",
            "u_n_kv": 24.9,
            "bus_kind": "slack" if num == 800 else "pq",
        })

    # Simplified linear topology - main feeder
    branches = []
    main_chain = [800, 802, 806, 808, 812, 814, 850, 816, 824, 828, 830, 854, 856, 852,
                  832, 858, 834, 842, 844, 846, 848]
    for i in range(len(main_chain) - 1):
        fbus, tbus = main_chain[i], main_chain[i + 1]
        branches.append({
            "ref_id": f"L{fbus}-{tbus}",
            "id": f"L{fbus}-{tbus}",
            "name": f"Line {fbus}-{tbus}",
            "branch_type": "LineBranch",
            "from_bus": f"BUS-{fbus}",
            "to_bus": f"BUS-{tbus}",
            "r_pu": 0.010,
            "x_pu": 0.020,
            "b_pu": 0.0,
            "length_km": 0.5,
        })
    # Laterals (simplified)
    laterals = [
        (808, 810), (810, 836), (816, 818), (818, 820), (820, 822),
        (824, 826), (832, 888), (888, 890), (858, 864), (862, 838),
    ]
    for fbus, tbus in laterals:
        branches.append({
            "ref_id": f"L{fbus}-{tbus}",
            "id": f"L{fbus}-{tbus}",
            "name": f"Lateral {fbus}-{tbus}",
            "branch_type": "LineBranch",
            "from_bus": f"BUS-{fbus}",
            "to_bus": f"BUS-{tbus}",
            "r_pu": 0.015,
            "x_pu": 0.028,
            "b_pu": 0.0,
            "length_km": 0.3,
        })

    # Spot loads (Kersting Table II - simplified)
    loads = [
        {"ref_id": f"LOAD-{n}", "id": f"LOAD-{n}", "bus": f"BUS-{n}",
         "p_mw": 0.020, "q_mvar": 0.010}
        for n in [806, 810, 820, 822, 824, 828, 830, 836, 838, 840, 844, 846, 848]
        if n in bus_numbers
    ]

    return {
        "header": {
            "name": "IEEE 34-bus distribution feeder",
            "revision": 0,
            "base_kv": 24.9,
            "base_mva": 100.0,
            "defaults": {},
        },
        "buses": buses,
        "branches": branches,
        "transformers": [],
        "sources": [
            {
                "ref_id": "GRID",
                "id": "GRID",
                "name": "Substation 800",
                "bus": "BUS-800",
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
