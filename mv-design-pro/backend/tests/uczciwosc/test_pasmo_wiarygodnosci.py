"""Etykieta kontroli wiarygodności: „w paśmie wiarygodności", nie „zweryfikowany".

Blok wiarygodności (pasma Ik'' per poziom napięcia, pasmo napięcia Un ± 10 %, pasma
obciążenia i strat, blok `sanity` analiz V12.6) sprawdza WYŁĄCZNIE, czy liczba leży w paśmie
fizycznie możliwym. Etykieta „zweryfikowany" twierdziła weryfikację (wyrocznię, pomiar), której
nie było — sonda audytu harmonicznych pokazała „zweryfikowany" przy rzędach cicho odrzuconych
i przy źródle na wyspie. Jedna stała dla całej rodziny pasm (zwarcia i rozpływ dzielą ją importem).
"""

from __future__ import annotations

from analysis.sanity_bounds.power_flow_bounds import evaluate_bus_voltage
from analysis.sanity_bounds.short_circuit_bounds import CREDIBLE, evaluate_short_circuit_current

_W_PASMIE = "w paśmie wiarygodności"


def test_stala_pasma_nazywa_pasmo_a_nie_weryfikacje() -> None:
    assert CREDIBLE == _W_PASMIE


def test_pasmo_zwarciowe_i_napieciowe_nosza_te_sama_etykiete() -> None:
    assert evaluate_short_circuit_current(15.0, 8.0).status == _W_PASMIE
    assert evaluate_bus_voltage(15.0, 15.2).status == _W_PASMIE
