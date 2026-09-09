"""OZE PV+BESS jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: fikstura własna (custom), zgodna z Annex II NC RfG; dawny dialekt
słownikowy `builders/oze_pv_bess.py` usunięty kartą K2.

Topologia: BUS-1 (slack 110 kV) — TR-110-15 — BUS-2 (15 kV, z PV+BESS) — L23
— BUS-3 (odbiór).
"""

from __future__ import annotations

from enm.kompilator_grafu import (
    BenchmarkEnm,
    dodaj_generator_pq,
    dodaj_generator_pv,
    dodaj_obciazenie,
    dodaj_transformator,
    dodaj_zrodlo_slack,
    kontynuuj_z_szyny,
    pusty_enm,
)


def build_oze_pv_bess_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="OZE PV+BESS (NC RfG compliant)", sn_nominal_kv=15.0)

    enm, bus1 = dodaj_zrodlo_slack(
        enm, voltage_kv=110.0, sk3_mva=5000.0, rx_ratio=0.1, line_fields_count=1, source_name="GRID"
    )
    enm, bus2 = dodaj_transformator(
        enm, hv_bus_ref=bus1, catalog_ref="bench_ozepvbess_tr110_15", lv_voltage_kv=15.0
    )
    enm, bus3 = kontynuuj_z_szyny(
        enm,
        from_bus_ref=bus2,
        catalog_ref="bench_ozepvbess_l23",
        dlugosc_m=1000.0,
        name="L23",
        bus_name="BUS-3",
    )

    bus_map = {"BUS-1": bus1, "BUS-2": bus2, "BUS-3": bus3}
    branch_map = {"L23": "L23"}

    enm = dodaj_obciazenie(enm, bus_ref=bus3, p_mw=2.0, q_mvar=0.6, name="LOAD-3")

    # PV-2 niesie regulację napięcia (węzeł PV); BESS-2 wchodzi jako wstrzyk
    # mocy stałej na TĘ SAMĄ szynę — kontrakt rozpływu ma jedną nastawę |U| na
    # węzeł (patrz docstring `dodaj_generator_pq`); obie mają tę samą nastawę
    # literaturową v_pu=1,0, więc rozdział jest fizycznie równoważny sumie mocy.
    enm = dodaj_generator_pv(
        enm,
        bus_ref=bus2,
        p_mw=1.0,
        u_set_pu=1.0,
        catalog_ref="bench_ozepvbess_pv2",
        name="PV-2",
    )
    enm = dodaj_generator_pq(
        enm,
        bus_ref=bus2,
        p_mw=0.5,
        q_mvar=0.0,
        catalog_ref="bench_ozepvbess_bess2",
        name="BESS-2",
    )

    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map=branch_map)
