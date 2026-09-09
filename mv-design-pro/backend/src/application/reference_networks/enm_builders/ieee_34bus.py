"""IEEE 34-bus (Kersting) jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: W.H. Kersting, "Distribution System Modeling and Analysis" — patrz
`application/reference_networks/builders/ieee_34bus.py`.

Topologia: drzewo promieniowe od BUS-800 (slack 24,9 kV), 20 odcinków
magistrali + 9 odgałęzień bocznych (patrz K1.4 poniżej dla dziesiątego).

K1.4 (decyzja architekta, wiążąca): sieć NIESYMETRYCZNA — solver FROZEN
kanoniczny (`power_flow_newton`) liczy WYŁĄCZNIE sieci symetryczne; tor
niesymetryczny 4-przewodowy jest przyszłym ADR-021. Ta sieć ISTNIEJE jako
`EnergyNetworkModel` — domyka wymóg K1 „13 sieci jako ENM" — ale wyrocznia
(b) własny-NR/kanoniczny PF dla tej sieci ma status PLANNED/REGRESSION_ONLY
(nie cichy skip; patrz rejestr `tests/golden/registry.py`).

ZNALEZISKO POZA KARTĄ (zmierzone, nie naprawione — zgłoszone w meldunku
wykonawcy): stary dialekt słownikowy (`builders/ieee_34bus.py`,
`library.py::REFERENCE_NETWORK_REGISTRY`) deklaruje 32 szyny/30 gałęzi, ale
BUS-862 nie ma ŻADNEJ gałęzi łączącej ją z resztą drzewa poza „L862-838"
(862→838) — sama 862 jest nieosiągalna z BUS-800 w tych danych (brakujący
odcinek, prawdopodobnie pominięte „848-862" ze standardowego zestawu IEEE
34-bus). `zbuduj_topologie` odmawia budowy krawędzi nieosiągalnej z szyny
bilansującej (jawny błąd, nie cichy pomiń) — potwierdza defekt DANYCH starego
dialektu, nie błąd tego buildera. Naprawa wymagałaby literaturowego
potwierdzenia brakującego odcinka, którego ten wykonawca nie ma — POZA
zakresem tej karty (sieć i tak ma status PLANNED, bez wyroczni liczbowej).
Ten ENM-bliźniak niesie 30 z 32 szyn (BUS-862/BUS-838 POMINIĘTE, jawnie, nie
cicho) — kompletny dla WSZYSTKICH szyn osiągalnych w danych rejestru.
"""

from __future__ import annotations

from enm.kompilator_grafu import (
    BenchmarkEnm,
    EdgeSpec,
    dodaj_obciazenie,
    dodaj_zrodlo_slack,
    pusty_enm,
    zbuduj_topologie,
)

_TRUNK_PAIRS = (
    (800, 802),
    (802, 806),
    (806, 808),
    (808, 812),
    (812, 814),
    (814, 850),
    (850, 816),
    (816, 824),
    (824, 828),
    (828, 830),
    (830, 854),
    (854, 856),
    (856, 852),
    (852, 832),
    (832, 858),
    (858, 834),
    (834, 842),
    (842, 844),
    (844, 846),
    (846, 848),
)
#: (862, 838) CELOWO POMINIĘTE — patrz „ZNALEZISKO POZA KARTĄ" w docstringu
#: modułu (862 nieosiągalna w danych starego dialektu).
_LATERAL_PAIRS = (
    (808, 810),
    (810, 836),
    (816, 818),
    (818, 820),
    (820, 822),
    (824, 826),
    (832, 888),
    (888, 890),
    (858, 864),
)

_EDGES = [
    EdgeSpec(f"L{fb}-{tb}", f"BUS-{fb}", f"BUS-{tb}", f"bench_ieee34bus_l{fb}-{tb}")
    for fb, tb in (_TRUNK_PAIRS + _LATERAL_PAIRS)
]

_LOADS_MW_MVAR = {
    "BUS-806": (0.02, 0.01),
    "BUS-810": (0.02, 0.01),
    "BUS-820": (0.02, 0.01),
    "BUS-822": (0.02, 0.01),
    "BUS-824": (0.02, 0.01),
    "BUS-828": (0.02, 0.01),
    "BUS-830": (0.02, 0.01),
    "BUS-836": (0.02, 0.01),
    "BUS-844": (0.02, 0.01),
    "BUS-846": (0.02, 0.01),
    "BUS-848": (0.02, 0.01),
    # LOAD-838 (na BUS-838) POMINIĘTA razem z BUS-838/BUS-862 — patrz docstring.
}


def build_ieee_34bus_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="IEEE 34-bus distribution feeder", sn_nominal_kv=24.9)
    enm, bus_slack = dodaj_zrodlo_slack(
        enm,
        voltage_kv=24.9,
        sk3_mva=500.0,
        rx_ratio=0.1,
        line_fields_count=1,
        source_name="Substation 800",
    )

    enm, bus_map, branch_map = zbuduj_topologie(
        enm, slack_lit="BUS-800", slack_ref=bus_slack, edges=_EDGES
    )

    for lit_id, (p_mw, q_mvar) in _LOADS_MW_MVAR.items():
        enm = dodaj_obciazenie(
            enm, bus_ref=bus_map[lit_id], p_mw=p_mw, q_mvar=q_mvar, name=f"LOAD-{lit_id[-3:]}"
        )

    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map=branch_map)
