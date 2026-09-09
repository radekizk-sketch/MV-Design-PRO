"""CIGRE MV 14-bus jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: CIGRE TF C6.04.02 (2014), Benchmark Systems for Network Integration
of DER, Section 6 — patrz `application/reference_networks/builders/cigre_mv.py`.

Topologia: łańcuch radialny 15 szyn (BUS-00..BUS-14), jeden poziom napięcia
(20 kV), 2 generatory PV (fotowoltaika modelowana jako węzeł PV — patrz
`mv_benchmark_catalog.py::get_all_benchmark_synchronous_generator_records`
dla uzasadnienia, dlaczego `add_generator_sn` obejmuje też DER benchmarków).
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

#: UWAGA dlugosc_m: `mv_benchmark_catalog.py` przelicza r_pu/x_pu/b_pu na
#: r_ohm_per_km/x_ohm_per_km/b_us_per_km z konwencja "1 km" (ta sama, ktorej
#: uzywa `frozen_solver_input.py` — patrz docstring modulu katalogu). Odcinek
#: MUSI wiec dostac dlugosc_m=1000 (EdgeSpec default) NIEZALEZNIE od tego, co
#: mowi pole `length_km` w dawnym dialekcie (tu: 0.5 km) — to pole per-unit
#: JEST juz calkowita impedancja odcinka, nie wartoscia na jednostke dlugosci
#: fizycznej publikacji.
_EDGES = [
    EdgeSpec(
        f"L{i:02d}-{i + 1:02d}",
        f"BUS-{i:02d}",
        f"BUS-{i + 1:02d}",
        f"bench_cigremv_l{i:02d}-{i + 1:02d}",
    )
    for i in range(14)
]

_LOAD_MW_MVAR = 0.2  # q_mvar wspólne dla wszystkich odbiorów (0.5 MW / 0.2 Mvar)


def build_cigre_mv_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="CIGRE MV 14-bus", sn_nominal_kv=20.0)

    enm, bus0 = dodaj_zrodlo_slack(
        enm,
        voltage_kv=20.0,
        sk3_mva=500.0,
        rx_ratio=0.1,
        line_fields_count=1,
        source_name="Slack @ BUS-00",
    )

    enm, bus_map, branch_map = zbuduj_topologie(
        enm, slack_lit="BUS-00", slack_ref=bus0, edges=_EDGES
    )

    for i in range(1, 15):
        enm = dodaj_obciazenie(
            enm,
            bus_ref=bus_map[f"BUS-{i:02d}"],
            p_mw=0.5,
            q_mvar=_LOAD_MW_MVAR,
            name=f"LOAD-{i:02d}",
        )

    enm = dodaj_generator_pv(
        enm,
        bus_ref=bus_map["BUS-05"],
        p_mw=0.5,
        u_set_pu=1.0,
        catalog_ref="bench_cigremv_pv05",
        name="PV-05",
    )
    enm = dodaj_generator_pv(
        enm,
        bus_ref=bus_map["BUS-10"],
        p_mw=0.3,
        u_set_pu=1.0,
        catalog_ref="bench_cigremv_pv10",
        name="PV-10",
    )

    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map=branch_map)
