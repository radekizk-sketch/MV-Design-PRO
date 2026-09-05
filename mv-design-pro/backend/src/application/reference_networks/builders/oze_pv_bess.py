"""
OZE PV+BESS reference network builder.

Custom network: 15 kV MV with PV inverter + BESS converter at the same bus.
Used for validation of:
- PF integration with DER (Q contribution)
- SC contribution from inverters
- FRT trajectory (NC RfG Annex II envelope)
"""

from __future__ import annotations

from typing import Any


def build_oze_pv_bess_network() -> dict[str, Any]:
    """3-bus MV network with PV + BESS at BUS-2."""
    return {
        "header": {
            "name": "OZE PV+BESS (NC RfG compliant)",
            "revision": 0,
            "base_kv": 15.0,
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
                "name": "MV bus with DER",
                "u_n_kv": 15.0,
                "bus_kind": "pq",
            },
            {
                "ref_id": "BUS-3",
                "id": "BUS-3",
                "name": "Load bus",
                "u_n_kv": 15.0,
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
                "r_pu": 0.005,
                "x_pu": 0.015,
                # Krotki odcinek SN (1 km) — pojemnosc doziemna pominieta w
                # modelu (typowe uproszczenie dla krotkich linii SN);
                # zalozenie stalo sie jawna dana (FAB-E, E5), a nie
                # fabrykowanym domyslem czytnika wyniku.
                "b_pu": 0.0,
                "length_km": 1.0,
            },
        ],
        "transformers": [
            {
                "ref_id": "TR-110-15",
                "id": "TR-110-15",
                "from_bus": "BUS-1",
                "to_bus": "BUS-2",
                "sn_mva": 16.0,
                "ukr_pct": 10.5,
                "primary_kv": 110.0,
                "secondary_kv": 15.0,
            },
        ],
        "sources": [
            {"ref_id": "GRID", "id": "GRID", "bus": "BUS-1", "v_pu": 1.0, "source_kind": "slack"},
        ],
        "loads": [
            {"ref_id": "LOAD-3", "id": "LOAD-3", "bus": "BUS-3", "p_mw": 2.0, "q_mvar": 0.6},
        ],
        "generators": [
            {
                "ref_id": "PV-2",
                "id": "PV-2",
                "bus": "BUS-2",
                "p_mw": 1.0,
                "v_pu": 1.0,
                "gen_kind": "pv_inverter",
                "sn_mva": 1.2,
                "frt_compliant": True,
                "anti_islanding_enabled": True,
                "nc_rfg_certified": True,
            },
            {
                "ref_id": "BESS-2",
                "id": "BESS-2",
                "bus": "BUS-2",
                "p_mw": 0.5,
                "v_pu": 1.0,
                "gen_kind": "bess_inverter",
                "sn_mva": 0.6,
                "frt_compliant": True,
                "anti_islanding_enabled": True,
                "nc_rfg_certified": True,
            },
        ],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }
