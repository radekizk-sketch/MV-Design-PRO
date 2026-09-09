"""IEEE 13-bus (Kersting) jako `EnergyNetworkModel` (CV-4.3 K1).

Źródło: W.H. Kersting, "Distribution System Modeling and Analysis" — patrz
`application/reference_networks/builders/ieee_13bus.py`.

Topologia: drzewo promieniowe od BUS-650 (slack 4,16 kV) po 11 odcinkach
liniowych + jeden transformator obniżający XFM-1 (633 → 634, 4,16/0,48 kV).

K1.4 (decyzja architekta, wiążąca): PRAWDZIWA sieć Kerstinga jest
NIESYMETRYCZNA (nierówne obciążenie faz, linie nietransponowane) — solver
FROZEN kanoniczny (`power_flow_newton`) liczy WYŁĄCZNIE sieci symetryczne;
tor niesymetryczny 4-przewodowy jest przyszłym ADR-021. Ten builder
konstruuje WYŁĄCZNIE aproksymację pozytywno-sekwencyjną (obciążenia
zbalansowane 3-fazowo, linie symetryczne) — to jest UPROSZCZENIE, nie
wierne odwzorowanie topologii Kerstinga per-fazowo.

Status dwupoziomowy (zmierzony, CV-4.3 K1, 2026-09-06):
- Wyrocznia (a) na TEJ aproksymacji: ZWERYFIKOWANA —
  `expected/ieee_13bus.json` (plik sprzed tej karty, NIEDOTKNIĘTY) sam
  deklaruje w `source_note` bycie "BFS regression baseline z naszego
  uproszczonego 13-bus builder (positive-sequence aproksymacja)", NIE
  wyrocznią prawdziwej fizyki niesymetrycznej. Kanoniczny tor
  (`enm/assembler.py` -> FROZEN `power_flow_newton`) zgadza się z tym
  plikiem w pełnej tolerancji — patrz
  `test_ieee_13bus_pf_aproksymacja_pozytywnosekwencyjna`
  (`tests/golden/parytet_benchmarkow/test_wyrocznia_a_expected_json.py`).
- PRAWDZIWE rozwiązanie niesymetryczne (rzeczywisty rozkład obciążeń per
  fazę z Kerstinga): pozostaje PLANNED/REGRESSION_ONLY (nie cichy skip;
  patrz rejestr `tests/golden/registry.py`) — nie istnieje dziś tor
  obliczeniowy zdolny odtworzyć te wielkości.
"""

from __future__ import annotations

from enm.kompilator_grafu import (
    BenchmarkEnm,
    EdgeSpec,
    dodaj_obciazenie,
    dodaj_transformator,
    dodaj_zrodlo_slack,
    pusty_enm,
    zbuduj_topologie,
)

_EDGES = [
    EdgeSpec("L650-632", "BUS-650", "BUS-632", "bench_ieee13bus_l650-632"),
    EdgeSpec("L632-633", "BUS-632", "BUS-633", "bench_ieee13bus_l632-633"),
    EdgeSpec("L632-645", "BUS-632", "BUS-645", "bench_ieee13bus_l632-645"),
    EdgeSpec("L632-671", "BUS-632", "BUS-671", "bench_ieee13bus_l632-671"),
    EdgeSpec("L645-646", "BUS-645", "BUS-646", "bench_ieee13bus_l645-646"),
    EdgeSpec("L671-692", "BUS-671", "BUS-692", "bench_ieee13bus_l671-692"),
    EdgeSpec("L671-680", "BUS-671", "BUS-680", "bench_ieee13bus_l671-680"),
    EdgeSpec("L671-684", "BUS-671", "BUS-684", "bench_ieee13bus_l671-684"),
    EdgeSpec("L684-611", "BUS-684", "BUS-611", "bench_ieee13bus_l684-611"),
    EdgeSpec("L684-652", "BUS-684", "BUS-652", "bench_ieee13bus_l684-652"),
    EdgeSpec("L692-675", "BUS-692", "BUS-675", "bench_ieee13bus_l692-675"),
]

_LOADS_MW_MVAR = {
    "BUS-645": (0.17, 0.125),
    "BUS-646": (0.23, 0.132),
    "BUS-671": (1.155, 0.66),
    "BUS-675": (0.843, 0.462),
    "BUS-652": (0.128, 0.086),
    "BUS-611": (0.17, 0.08),
    "BUS-692": (0.17, 0.151),
}


def build_ieee_13bus_enm() -> BenchmarkEnm:
    enm = pusty_enm(name="IEEE 13-bus distribution feeder", sn_nominal_kv=4.16)
    enm, bus_slack = dodaj_zrodlo_slack(
        enm,
        voltage_kv=4.16,
        sk3_mva=500.0,
        rx_ratio=0.1,
        line_fields_count=1,
        source_name="Substation",
    )

    enm, bus_map, branch_map = zbuduj_topologie(
        enm, slack_lit="BUS-650", slack_ref=bus_slack, edges=_EDGES
    )

    enm, bus_634 = dodaj_transformator(
        enm, hv_bus_ref=bus_map["BUS-633"], catalog_ref="bench_ieee13bus_xfm1", lv_voltage_kv=0.48
    )
    bus_map["BUS-634"] = bus_634

    enm = dodaj_obciazenie(enm, bus_ref=bus_634, p_mw=0.4, q_mvar=0.29, name="LOAD-634")
    for lit_id, (p_mw, q_mvar) in _LOADS_MW_MVAR.items():
        enm = dodaj_obciazenie(
            enm, bus_ref=bus_map[lit_id], p_mw=p_mw, q_mvar=q_mvar, name=f"LOAD-{lit_id[-3:]}"
        )

    return BenchmarkEnm(enm=enm, bus_map=bus_map, branch_map=branch_map)
