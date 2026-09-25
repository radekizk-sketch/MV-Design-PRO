"""IEEE case9 (WSCC 9-bus) jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: MATPOWER case9 (WSCC 9-bus) via pandapower 3.4.0 — patrz
dawny dialekt słownikowy `builders/ieee_9bus.py` (pełny cytat) usunięty kartą K2.

Topologia: oczko 9 szyn, jeden poziom napięcia (345 kV), bez transformatorów
(MATPOWER case9 zredukowany do reprezentacji jednonapięciowej przez generator
`scripts/generate_ieee_references.py` — zero transformatorów w builderze
dawnego dialektu, zweryfikowane pomiarem karty).
"""

from __future__ import annotations

from enm.kompilator_grafu import (
    BenchmarkEnm,
    EdgeSpec,
    dodaj_generator_pv,
    dodaj_obciazenie,
    dodaj_zrodlo_slack,
    pusty_enm,
    zbuduj_topologie,
)

_EDGES = [
    EdgeSpec("BR0", "B0", "B3", "bench_ieee9bus_br0"),
    EdgeSpec("BR1", "B3", "B4", "bench_ieee9bus_br1"),
    EdgeSpec("BR2", "B4", "B5", "bench_ieee9bus_br2"),
    EdgeSpec("BR3", "B2", "B5", "bench_ieee9bus_br3"),
    EdgeSpec("BR4", "B5", "B6", "bench_ieee9bus_br4"),
    EdgeSpec("BR5", "B6", "B7", "bench_ieee9bus_br5"),
    EdgeSpec("BR6", "B7", "B1", "bench_ieee9bus_br6"),
    EdgeSpec("BR7", "B7", "B8", "bench_ieee9bus_br7"),
    EdgeSpec("BR8", "B8", "B3", "bench_ieee9bus_br8"),
]


def build_ieee_9bus_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="IEEE case9 (MATPOWER, via pandapower 3.4.0)", sn_nominal_kv=345.0)

    # B0 ma degree 2 w topologii (BR0, BR6) — 2 pola liniowe GPZ.
    enm, bus0 = dodaj_zrodlo_slack(
        enm,
        voltage_kv=345.0,
        sk3_mva=50000.0,
        rx_ratio=0.1,
        line_fields_count=2,
        source_name="External grid (slack)",
    )

    enm, bus_map, branch_map = zbuduj_topologie(enm, slack_lit="B0", slack_ref=bus0, edges=_EDGES)

    enm = dodaj_obciazenie(enm, bus_ref=bus_map["B4"], p_mw=90.0, q_mvar=30.0, name="LOAD-0")
    enm = dodaj_obciazenie(enm, bus_ref=bus_map["B6"], p_mw=100.0, q_mvar=35.0, name="LOAD-1")
    enm = dodaj_obciazenie(enm, bus_ref=bus_map["B8"], p_mw=125.0, q_mvar=50.0, name="LOAD-2")

    enm = dodaj_generator_pv(
        enm,
        bus_ref=bus_map["B1"],
        p_mw=163.0,
        u_set_pu=1.0,
        catalog_ref="bench_ieee9bus_gen1",
        name="GEN-1",
    )
    enm = dodaj_generator_pv(
        enm,
        bus_ref=bus_map["B2"],
        p_mw=85.0,
        u_set_pu=1.0,
        catalog_ref="bench_ieee9bus_gen2",
        name="GEN-2",
    )

    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map=branch_map)
