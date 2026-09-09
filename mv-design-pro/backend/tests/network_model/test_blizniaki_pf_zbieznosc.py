"""Klasa: każdy bliźniak PF rejestru zbiega bez przełączeń PV→PQ (granice Q nieograniczające).

Dwie deklaracje `mv_benchmark_catalog.py`, które do 2026-09-09 nie miały testu:
1. „rozpływ kanoniczny bliźniaków benchmarków zbiega" — IEEE case14 NIE zbiegał (30 iteracji,
   |U| do 320 p.u.; linie 0,208 kV stemplowane bazą 135 kV, slack 1,0 zamiast 1,06 p.u.), a złoty
   parytet asemblera przypinał wynik niezbieżny;
2. „granice mocy biernej generatorów są celowo szerokie (nie saturują się)" — przy 3× bazie
   (150 Mvar) bliźniak case14 przełączał węzeł w iteracji 3 (−152,3 Mvar), przy granicach z
   literatury (MATPOWER) solver FROZEN przełącza 4 węzły w iteracjach 1–3 na STANACH
   PRZEJŚCIOWYCH (Q zbieżne mieści się w granicach) i myli wynik o 0,022 p.u. (OD-11).
Test pilnuje obu: zbieżność w ≤ 10 iteracjach, zero przełączeń, każde napięcie w paśmie
0,85–1,15 p.u. (fizyczny wynik, nie rozbieżność numeryczna).
"""

from __future__ import annotations

import pytest
from enm.canonical_analysis import _execute_power_flow

from tests.golden.parytet_assemblera.harness import _bieg, sieci_enm_rejestru

_BLIZNIAKI = [
    (klucz, enm)
    for klucz, enm in sieci_enm_rejestru()
    if klucz.startswith("B-BENCH/") and any(b.voltage_kv for b in enm.buses)
]
#: Bliźniaki wyłącznie zwarciowe (bez odbiorów/rozpływu): rozpływ liczy się w 1 iteracji
#: płaskim profilem — sprawdzamy je tak samo (zbieżność), bo to też jest deklaracja.


@pytest.mark.parametrize("klucz,enm", _BLIZNIAKI, ids=[k for k, _ in _BLIZNIAKI])
def test_blizniak_zbiega_bez_przelaczen_pv_pq(klucz: str, enm) -> None:
    run = _bieg(enm, klucz=f"{klucz}/PF", analysis_type="PF", options={})
    _execute_power_flow(run)
    raw = run.raw_result or {}
    wynik = raw.get("result_v1") or {}
    assert wynik.get("converged") is True, f"{klucz}: rozpływ nie zbiegł"
    assert (
        int(wynik.get("iterations_count") or 99) <= 10
    ), f"{klucz}: {wynik.get('iterations_count')} iteracji"
    przelaczenia = raw.get("pv_to_pq_switches") or []
    assert (
        przelaczenia == []
    ), f"{klucz}: przełączenia PV→PQ {przelaczenia} — granice Q bliźniaka wiążą"
    nodes = (raw.get("graph") or {}).get("nodes", {})
    for node_id, u_kv in (raw.get("node_voltage_kv") or {}).items():
        un = nodes.get(node_id, {}).get("voltage_level")
        if u_kv is None or not un:
            continue
        assert (
            0.85 <= u_kv / un <= 1.15
        ), f"{klucz}: {nodes[node_id].get('name')} {u_kv / un:.3f} p.u."


def test_klasa_obejmuje_wszystkie_blizniaki_rejestru() -> None:
    """Zapadka pokrycia: 11 bliźniaków B-BENCH (pomiar 2026-09-09)."""
    assert len(_BLIZNIAKI) == 11, sorted(k for k, _ in _BLIZNIAKI)
