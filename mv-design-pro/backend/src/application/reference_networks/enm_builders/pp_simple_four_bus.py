"""Pandapower simple 4-bus jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: pandapower.networks.example_simple() (deterministic Newton-Raphson) —
patrz `application/reference_networks/builders/pp_simple_four_bus.py`. Ta
sieć rejestru jest 4-magistralową UPROSZCZONĄ reprezentacją, NIE dosłownym
7-szynowym `example_simple()` (zmierzone empirycznie — pandapower rzeczywiste
`example_simple()` ma 7 szyn/4 linie/łączniki/ext_grid vm_pu=1.02@50°/1 odbiór
ze skalowaniem 0,6 — inny model niż zarejestrowany tu 4-magistralowy;
znalezisko poza kartą, zgłoszone w meldunku wykonawcy).

Topologia: BUS-1 (slack 110 kV) — TR-110-20 — BUS-2 (20 kV) — L23 — BUS-3 —
L34 — BUS-4.
"""

from __future__ import annotations

from enm.kompilator_grafu import (
    BenchmarkEnm,
    dodaj_obciazenie,
    dodaj_transformator,
    dodaj_zrodlo_slack,
    kontynuuj_z_szyny,
    pusty_enm,
)


def build_pp_simple_four_bus_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="Pandapower simple 4-bus", sn_nominal_kv=20.0)

    # BUS-1: slack 110 kV, ekwiwalent bez transformatora WN/SN GPZ (literatura
    # nie podaje Sk3/RX — patrz `mv_benchmark_catalog.py` docstring modułu).
    enm, bus1 = dodaj_zrodlo_slack(
        enm,
        voltage_kv=110.0,
        sk3_mva=5000.0,
        rx_ratio=0.1,
        line_fields_count=1,
        source_name="GRID",
    )
    # BUS-1 sam ma jedno pole (do transformatora) — `dodaj_transformator`
    # łączy dwie ISTNIEJĄCE/nowe szyny bezpośrednio, bez pola liniowego, więc
    # pole GPZ zostaje wolne (nieużyte) — zgodne z modelem (BUS-1 ma TYLKO
    # transformator, nie odcinek liniowy).
    enm, bus2 = dodaj_transformator(
        enm,
        hv_bus_ref=bus1,
        catalog_ref="bench_ppsimple4bus_tr110_20",
        lv_voltage_kv=20.0,
    )

    bus_map = {"BUS-1": bus1, "BUS-2": bus2}
    enm, bus3 = kontynuuj_z_szyny(
        enm,
        from_bus_ref=bus2,
        catalog_ref="bench_ppsimple4bus_l23",
        dlugosc_m=1000.0,
        name="L23",
        bus_name="BUS-3",
    )
    bus_map["BUS-3"] = bus3
    enm, bus4 = kontynuuj_z_szyny(
        enm,
        from_bus_ref=bus3,
        catalog_ref="bench_ppsimple4bus_l34",
        dlugosc_m=1000.0,
        name="L34",
        bus_name="BUS-4",
    )
    bus_map["BUS-4"] = bus4
    branch_map = {"L23": "L23", "L34": "L34"}

    enm = dodaj_obciazenie(enm, bus_ref=bus3, p_mw=1.0, q_mvar=0.4, name="LOAD-3")
    enm = dodaj_obciazenie(enm, bus_ref=bus4, p_mw=0.8, q_mvar=0.3, name="LOAD-4")

    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map=branch_map)
