"""Jedno źródło prawdy: czy moc bierna (Q) wytwórcy jest znana.

Karta FAB-H (H2). Trzy niezależne miejsca (``enm/mapping.py``,
``enm/canonical_analysis.py``, ``solver_input/v126_contracts.py``) liczyły TEN SAM
predykat "czy Q wytwórcy jest jawne" osobno, każde swoją kopią ``gen.q_mvar or 0.0``.
Karta FAB-D2 (D3) naprawiła jedną instancję w bramce gotowości
(``application/calculation_readiness/service.py::_generator_q_mvar_jawne``), ale nie
naprawiła KLASY: bramka gotowości mogła uznać sieć za "ready" (bo karta katalogowa
niesie jawny Q-set-point, ``qmin_mvar == qmax_mvar``), podczas gdy ``enm/mapping.py``
wciąż liczyło z zerem — dwa niezależne warunki, które "dziś się zgadzają" (reguła
KLASA NIE INSTANCJA, CLAUDE.md). Ta funkcja jest JEDYNYM miejscem, które rozstrzyga
"jaka jest moc bierna wytwórcy, i czy jest jawna" — wszystkie trzy miejsca (plus
bramka gotowości) mają z niej korzystać.

Zero fizyki: funkcja NIE wyprowadza Q z cos φ (Q = P·tan(φ) jest trygonometrią
fizyczną i należy do warstwy solvera, ``network_model/solvers/power_flow_inverter.py``
— reguła NOT-A-SOLVER). Czyta WYŁĄCZNIE liczby już obecne w danych: pole ``q_mvar``
wprost, albo zdegenerowany Q-set-point karty katalogowej (``qmin_mvar == qmax_mvar``
w ``materialized_params`` — to ODCZYT liczby już obecnej, nie derywacja).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

__all__ = ["WynikQ", "moc_bierna_wytworcy"]

#: Proweniencja rozstrzygniętej mocy biernej wytwórcy.
#: - "JAWNE": pole ``q_mvar`` wytwórcy niesie liczbę wprost.
#: - "KARTA_Q_SET_POINT": ``q_mvar`` nieznane, ale karta katalogowa niesie
#:   zdegenerowany zakres (qmin_mvar == qmax_mvar) — to tryb stałego Q, odczyt
#:   liczby już obecnej w karcie, nie derywacja trygonometryczna.
#: - "BRAK": Q nieznane i niewyprowadzalne z jawnych danych.
ZrodloQ = Literal["JAWNE", "KARTA_Q_SET_POINT", "BRAK"]


@dataclass(frozen=True)
class WynikQ:
    """Wynik rozstrzygnięcia mocy biernej [Mvar] wytwórcy."""

    q_mvar: float | None
    zrodlo: ZrodloQ

    @property
    def brak(self) -> bool:
        return self.zrodlo == "BRAK"


def _jawne_q_mvar(gen: Any) -> float | None:
    """Odczytaj ``q_mvar`` z wytwórcy — obiekt ENM (atrybut) albo snapshot (słownik)."""
    wartosc = gen.get("q_mvar") if isinstance(gen, dict) else getattr(gen, "q_mvar", None)
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def moc_bierna_wytworcy(gen: Any, karta: dict[str, Any] | None) -> WynikQ:
    """Rozstrzygnij Q [Mvar] wytwórcy — jawne pole, jawny Q-set-point karty, albo BRAK.

    Args:
        gen: wytwórca — ``enm.models.Generator`` (atrybut ``q_mvar``) albo jego
            reprezentacja snapshotu (słownik z kluczem ``"q_mvar"``).
        karta: ``materialized_params`` katalogu (może być ``None``/pusty).
    """
    jawne = _jawne_q_mvar(gen)
    if jawne is not None:
        return WynikQ(q_mvar=jawne, zrodlo="JAWNE")
    dane_karty = karta or {}
    qmin = dane_karty.get("qmin_mvar")
    qmax = dane_karty.get("qmax_mvar")
    if (
        isinstance(qmin, int | float)
        and not isinstance(qmin, bool)
        and isinstance(qmax, int | float)
        and not isinstance(qmax, bool)
        and qmin == qmax
    ):
        return WynikQ(q_mvar=float(qmin), zrodlo="KARTA_Q_SET_POINT")
    return WynikQ(q_mvar=None, zrodlo="BRAK")
