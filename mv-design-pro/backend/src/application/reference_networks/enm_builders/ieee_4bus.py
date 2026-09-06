"""IEEE 4-bus jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: Stevenson, "Elements of Power System Analysis" (1982), Example 9.5,
p.337 — patrz `application/reference_networks/builders/ieee_4bus.py` (dawny
dialekt słownikowy, zachowany do kasacji kartą A2) dla pełnego cytatu danych.

Topologia: pierścień 4 szyn (BUS-1 slack — L12 — BUS-2 — L24 — BUS-4 — L34 —
BUS-3 — L13 — BUS-1), jeden poziom napięcia (132 kV), bez transformatorów.
"""

from __future__ import annotations

from application.reference_networks.enm_builders._kernel import (
    BenchmarkEnm,
    EdgeSpec,
    dodaj_generator_pv,
    dodaj_obciazenie,
    dodaj_zrodlo_slack,
    pusty_enm,
    zbuduj_topologie,
)

_EDGES = [
    EdgeSpec("L12", "BUS-1", "BUS-2", "bench_ieee4bus_l12"),
    EdgeSpec("L13", "BUS-1", "BUS-3", "bench_ieee4bus_l13"),
    EdgeSpec("L24", "BUS-2", "BUS-4", "bench_ieee4bus_l24"),
    EdgeSpec("L34", "BUS-3", "BUS-4", "bench_ieee4bus_l34"),
]


def build_ieee_4bus_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="IEEE 4-bus (Stevenson 1982 Example 9.5)", sn_nominal_kv=132.0)

    # Sk3/RX ekwiwalentu szyny bilansującej: literatura (rozpływ mocy czysty)
    # nie podaje mocy zwarciowej — Sk3 duże i klarownie oznaczone, bez wpływu
    # na wynik rozpływu (patrz `mv_benchmark_catalog.py` docstring modułu,
    # sekcja o generatorach — ta sama zasada dotyczy tu źródła).
    enm, bus1 = dodaj_zrodlo_slack(
        enm,
        voltage_kv=132.0,
        sk3_mva=5000.0,
        rx_ratio=0.1,
        line_fields_count=2,
        source_name="Slack BUS-1",
    )

    enm, bus_map, branch_map = zbuduj_topologie(
        enm, slack_lit="BUS-1", slack_ref=bus1, edges=_EDGES
    )

    enm = dodaj_obciazenie(enm, bus_ref=bus_map["BUS-2"], p_mw=50.0, q_mvar=30.99, name="LOAD-2")
    enm = dodaj_obciazenie(enm, bus_ref=bus_map["BUS-3"], p_mw=60.0, q_mvar=22.66, name="LOAD-3")

    enm = dodaj_generator_pv(
        enm,
        bus_ref=bus_map["BUS-4"],
        p_mw=318.0,
        u_set_pu=1.02,
        catalog_ref="bench_ieee4bus_gen4",
        name="GEN-4",
    )

    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map=branch_map)
