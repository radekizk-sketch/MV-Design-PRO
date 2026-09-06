"""
IEC 60909-4 Example reference network builder.

Source: IEC 60909-4:2000 "Examples for the calculation of short-circuit currents", Section 4.

Network: simplified 33/11 kV substation, focus on SC validation.
- HV system: 110 kV, Sk''=4000 MVA, X/R=10
- Transformer: 110/33 kV, 25 MVA, ukr=10%
- MV system: 33 kV bus with 3 distribution feeders
- Test faults: 3F/2F/1F/2F+G at MV bus
"""

from __future__ import annotations

from typing import Any


def build_iec60909_example_network() -> dict[str, Any]:
    """Return ENM-like dict for IEC 60909 Example network."""
    return {
        "header": {
            "name": "IEC 60909-4 Example",
            "revision": 0,
            "base_kv": 33.0,
            "base_mva": 100.0,
            "defaults": {},
        },
        "buses": [
            {
                "ref_id": "BUS-HV",
                "id": "BUS-HV",
                "name": "BUS-HV 110kV",
                "u_n_kv": 110.0,
                "bus_kind": "slack",
            },
            {
                "ref_id": "BUS-MV",
                "id": "BUS-MV",
                "name": "BUS-MV 33kV",
                "u_n_kv": 33.0,
                "bus_kind": "pq",
            },
        ],
        "branches": [],
        "transformers": [
            {
                "ref_id": "TR-110-33",
                "id": "TR-110-33",
                "name": "TR 110/33 kV",
                "from_bus": "BUS-HV",
                "to_bus": "BUS-MV",
                "sn_mva": 25.0,
                "ukr_pct": 10.0,
                "uk0_pct": 9.0,
                # Uproszczenie podrecznikowe (IEC 60909-4 Sekcja 4, patrz
                # expected/iec60909_example.json:source_note): transformator
                # sieciowy modelowany jako bezstratny (pk=0 kW), bez galezi
                # magnesujacej (i0=0%, p0=0 kW — nieuzywana przez metodyke
                # IEC 60909, ktora liczy tylko impedancje szeregowa) —
                # zalozenie stalo sie jawna dana (FAB-E, E5), a nie
                # fabrykowanym domyslem czytnika wyniku.
                "pk_kw": 0.0,
                "i0_percent": 0.0,
                "p0_kw": 0.0,
                # Bez przelacznika zaczepow (zaczep nominalny, brak regulacji)
                # w tym przykladzie — tap_position=0 => ratio=1.0 niezaleznie
                # od tap_step_percent (mnozona przez zero), stad 0.0.
                "tap_position": 0,
                "tap_step_percent": 0.0,
                "vector_group": "YNd11",
                "primary_kv": 110.0,
                "secondary_kv": 33.0,
            },
        ],
        "sources": [
            {
                "ref_id": "GRID",
                "id": "GRID",
                "name": "HV Grid",
                "bus": "BUS-HV",
                "sk_max_mva": 4000.0,
                "rx_ratio": 0.1,
                "v_pu": 1.0,
                "source_kind": "slack",
                "grounding_type": "directly_grounded",
            },
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
