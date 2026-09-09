"""CIGRE LV residential benchmark jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: fikstura własna (custom, CIGRE-style LV residential) — patrz
`application/reference_networks/builders/cigre_lv_benchmark.py`.

Topologia: gwiazda — BUS-LV-MAIN (slack 0,4 kV) z 5 kablami do domów
BUS-LV-01..05 (odbiory + 2 instalacje PV rezydencjalne na 02/04).
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
    EdgeSpec(f"L-MAIN-{n:02d}", "BUS-LV-MAIN", f"BUS-LV-{n:02d}", f"bench_cigrelv_l-main-{n:02d}")
    for n in range(1, 6)
]

_LOADS_MW_MVAR = {
    "BUS-LV-01": (0.005, 0.001),
    "BUS-LV-02": (0.005, 0.001),
    "BUS-LV-03": (0.005, 0.001),
    "BUS-LV-04": (0.005, 0.001),
    "BUS-LV-05": (0.005, 0.001),
}

_PV_MW = {
    "BUS-LV-02": ("bench_cigrelv_pvhouse02", 0.003),
    "BUS-LV-04": ("bench_cigrelv_pvhouse04", 0.003),
}


def build_cigre_lv_benchmark_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="CIGRE LV residential 0.4 kV", sn_nominal_kv=0.4)
    enm, bus_slack = dodaj_zrodlo_slack(
        enm,
        voltage_kv=0.4,
        sk3_mva=5.0,
        rx_ratio=0.1,
        line_fields_count=5,
        source_name="LV MAIN",
    )

    enm, bus_map, branch_map = zbuduj_topologie(
        enm, slack_lit="BUS-LV-MAIN", slack_ref=bus_slack, edges=_EDGES
    )

    for lit_id, (p_mw, q_mvar) in _LOADS_MW_MVAR.items():
        enm = dodaj_obciazenie(
            enm, bus_ref=bus_map[lit_id], p_mw=p_mw, q_mvar=q_mvar, name=f"HOUSE-{lit_id[-2:]}"
        )

    for lit_id, (catalog_ref, p_mw) in _PV_MW.items():
        enm = dodaj_generator_pv(
            enm,
            bus_ref=bus_map[lit_id],
            p_mw=p_mw,
            u_set_pu=1.0,
            catalog_ref=catalog_ref,
            name=f"PV-{lit_id[-2:]}",
        )

    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map=branch_map)
