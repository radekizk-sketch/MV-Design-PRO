"""Pandapower IEC 60909 radial jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: pandapower.shortcircuit.calc_sc, IEC 60909 equivalent voltage source
method; dawny dialekt słownikowy `builders/pandapower_iec60909_radial.py`
usunięty kartą K2.

Topologia: GRID-20KV (źródło IDEALNE 20 kV) — LINE-20KV-01 (1 km,
R=0,2 Ω/km, X=0,4 Ω/km) — BUS-01. Sieć walidacji WYŁĄCZNIE zwarciowej.

Źródło „idealne" (K1.2 wymaga jawnego Sk''/RX — bez wyjątku dla źródeł):
literatura fikstury (patrz `expected/pandapower_iec60909_radial.json`)
oblicza Ik'' WYŁĄCZNIE z impedancji odcinka (Z_k=(0,2+j0,4) Ω) — źródło jest
matematycznie idealne (Z_Q=0). Model kanoniczny nie ma osobnego pojęcia
„idealny" — reprezentowany jest przez Sk''=1e9 MVA (X/R dowolny, wpływ
zaniedbywalny): Z_Q=c*Un²/Sk''=1,10*400/1e9≈4,4e-7 Ω, czyli ok. 1e-6 razy
mniejsze niż |Z_linii|=0,4472 Ω — poniżej rozdzielczości jakiejkolwiek
publikowanej wartości (rtol tej sieci = 0,001). Zweryfikowane wprost White
Box (`enm_builders/verify_sc`, CV-4.3 K1): wkład źródła w wynik jest
niemierzalny (rel_err < 1e-6), zgodnie z tym, co reprezentuje.
"""

from __future__ import annotations

from enm.kompilator_grafu import (
    BenchmarkEnm,
    _gpz_line_fields,
    dodaj_zrodlo_slack,
    kontynuuj_z_pola,
    pusty_enm,
)

#: Sk'' na tyle duże, by impedancja źródła była numerycznie nieistotna wobec
#: |Z_linii|=0,4472 Ω (patrz docstring modułu) — jedyny sposób wyrażenia
#: źródła „idealnego" w kontrakcie K1.2 (Sk''/RX jawne, bez wyjątku).
_SK3_MVA_IDEALNE = 1.0e9


def build_pandapower_iec60909_radial_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="Pandapower IEC 60909 radial", sn_nominal_kv=20.0)

    enm, bus_grid = dodaj_zrodlo_slack(
        enm,
        voltage_kv=20.0,
        sk3_mva=_SK3_MVA_IDEALNE,
        rx_ratio=0.1,
        line_fields_count=1,
        source_name="GRID",
    )
    enm, bus_01 = kontynuuj_z_pola(
        enm,
        field_ref=_gpz_line_fields(enm)[0]["field_ref"],
        catalog_ref="bench_pandapowerradial_line20kv01",
        dlugosc_m=1000.0,
        name="LINE-20KV-01",
        bus_name="BUS-01",
    )

    bus_map = {"GRID-20KV": bus_grid, "BUS-01": bus_01}
    branch_map = {"LINE-20KV-01": "LINE-20KV-01"}
    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map=branch_map)
