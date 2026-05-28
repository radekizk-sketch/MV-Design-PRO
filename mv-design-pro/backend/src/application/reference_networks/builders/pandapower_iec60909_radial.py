"""Reference short-circuit network aligned with pandapower IEC 60909 calc_sc."""

from __future__ import annotations

from typing import Any


def build_pandapower_iec60909_radial_network() -> dict[str, Any]:
    """Return a minimal 20 kV radial benchmark for IEC 60909 proof checks.

    The topology mirrors the pandapower validation recipe:
    one 20 kV external grid and one 1 km feeder section with R=0.2 ohm/km,
    X=0.4 ohm/km. The expected JSON stores the independent reference values.
    """

    return {
        "header": {
            "name": "Pandapower IEC 60909 radial",
            "revision": 0,
            "base_kv": 20.0,
            "base_mva": 100.0,
            "defaults": {
                "reference_tool": "pandapower.shortcircuit.calc_sc",
                "standard": "IEC 60909",
            },
        },
        "buses": [
            {
                "ref_id": "GRID-20KV",
                "id": "GRID-20KV",
                "name": "Szyna zasilajaca 20 kV",
                "u_n_kv": 20.0,
                "bus_kind": "slack",
                "v_pu": 1.0,
            },
            {
                "ref_id": "BUS-01",
                "id": "BUS-01",
                "name": "Punkt zwarcia BUS-01",
                "u_n_kv": 20.0,
                "bus_kind": "pq",
            },
        ],
        "branches": [
            {
                "ref_id": "LINE-20KV-01",
                "id": "LINE-20KV-01",
                "name": "Odcinek referencyjny 20 kV",
                "branch_type": "LineBranch",
                "from_bus": "GRID-20KV",
                "to_bus": "BUS-01",
                "r_ohm_per_km": 0.2,
                "x_ohm_per_km": 0.4,
                "b_us_per_km": 0.0,
                "length_km": 1.0,
                "rated_current_a": 400.0,
                "source_ref": "pandapower.shortcircuit.calc_sc IEC 60909 benchmark fixture",
            }
        ],
        "transformers": [],
        "sources": [
            {
                "ref_id": "GRID",
                "id": "GRID",
                "name": "Zrodlo sztywne 20 kV",
                "bus": "GRID-20KV",
                "v_pu": 1.0,
                "source_kind": "slack",
                "reference_model": "pandapower ext_grid, ideal source for isolated line benchmark",
            }
        ],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }
