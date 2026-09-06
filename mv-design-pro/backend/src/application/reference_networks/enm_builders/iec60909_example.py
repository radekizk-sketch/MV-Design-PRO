"""IEC 60909-4 Example jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: IEC 60909-4:2000 "Examples for the calculation of short-circuit
currents", Section 4 — patrz
`application/reference_networks/builders/iec60909_example.py`.

Topologia: BUS-HV (110 kV, źródło Sk''=4000 MVA, X/R=10) — TR-110-33 (25 MVA,
ukr=10%) — BUS-MV (33 kV). Sieć walidacji WYŁĄCZNIE zwarciowej — brak odbiorów/
generatorów w literaturze.
"""

from __future__ import annotations

from application.reference_networks.enm_builders._kernel import (
    BenchmarkEnm,
    dodaj_transformator,
    dodaj_zrodlo_slack,
    pusty_enm,
)


def build_iec60909_example_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="IEC 60909-4 Example", sn_nominal_kv=33.0)

    # Źródło WPROST na szynie 110 kV (skip_hv_transformer — BUS-HV JEST
    # szczytem sieci literatury, transformator do 33 kV jest ELEMENTEM
    # jawnym poniżej, nie wewnętrznym mechanizmem GPZ). X/R=10 -> rx_ratio=0,1.
    enm, bus_hv = dodaj_zrodlo_slack(
        enm,
        voltage_kv=110.0,
        sk3_mva=4000.0,
        rx_ratio=0.1,
        line_fields_count=1,
        source_name="HV Grid",
    )

    enm, bus_mv = dodaj_transformator(
        enm, hv_bus_ref=bus_hv, catalog_ref="bench_iec60909example_tr110_33", lv_voltage_kv=33.0
    )

    bus_map = {"BUS-HV": bus_hv, "BUS-MV": bus_mv}
    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map={})
