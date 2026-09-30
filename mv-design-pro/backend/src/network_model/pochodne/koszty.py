"""Algebra kosztu — jedno recenzowane miejsce dla mnożeń cena × ilość i dyskontowania.

Karta W10-2a (decyzja OD-16): koszt strat (energia × cena), koszt pozycji listy materiałowej
(ilość × cena jednostkowa) i wartość bieżąca kosztów rocznych liczone są WYŁĄCZNIE tutaj, obok
`wielkosci_pochodne.py` (strażnik `backend_no_physics_guard`: poza `network_model/solvers/**`
i `network_model/pochodne/**` algebra wielkości pochodnych jest zakazana). Warstwa aplikacji
(`application/koszty/`) składa wynik i odmowy, nie mnoży.

ZASADY:
  * ceny nie są przeliczane inflacją ani indeksowane — aktualizacja cen = nowa wersja pliku
    cennika (OD-16); dlatego nie ma tu żadnego wskaźnika wzrostu cen;
  * stopa dyskontowa i horyzont są JAWNYM wejściem analizy (bez domyślek); stopa 0 daje
    współczynnik równy liczbie lat (granica ciągła wzoru, nie przypadek szczególny danych);
  * wejście ujemne albo nieskończone to błąd wywołującego (`ValueError`) — koszt ujemny nie
    istnieje, a brak ceny jest odmową nazwaną warstwy aplikacji, nigdy zerem.

Moduł jest liściem grafu importów (wyłącznie `math`).
"""

from __future__ import annotations

import math

__all__ = [
    "koszt_cyklu_zycia_pln",
    "koszt_energii_strat_pln",
    "koszt_pozycji_pln",
    "wspolczynnik_wartosci_biezacej",
]


def _nieujemna(nazwa: str, wartosc: float) -> float:
    if not math.isfinite(wartosc) or wartosc < 0.0:
        raise ValueError(f"{nazwa} musi być skończoną wartością nieujemną, jest {wartosc!r}.")
    return wartosc


def koszt_pozycji_pln(ilosc: float, cena_jednostkowa_pln: float) -> float:
    """Koszt pozycji listy materiałowej: ``K = n · c`` [PLN] (ilość w jednostce ceny)."""
    return _nieujemna("Ilość", ilosc) * _nieujemna("Cena jednostkowa", cena_jednostkowa_pln)


def koszt_energii_strat_pln(energia_strat_mwh: float, cena_energii_pln_mwh: float) -> float:
    """Roczny koszt strat energii: ``K_s = E_s · c_E`` [PLN/rok]."""
    return _nieujemna("Energia strat", energia_strat_mwh) * _nieujemna(
        "Cena energii", cena_energii_pln_mwh
    )


def wspolczynnik_wartosci_biezacej(stopa_dyskontowa: float, horyzont_lat: int) -> float:
    """Współczynnik wartości bieżącej stałej płatności rocznej: ``Σ_{t=1..N} (1+r)^{-t}``.

    Płatność na koniec każdego roku (konwencja ``t = 1..N``); ``r = 0`` → ``N``.
    """
    _nieujemna("Stopa dyskontowa", stopa_dyskontowa)
    if isinstance(horyzont_lat, bool) or not isinstance(horyzont_lat, int) or horyzont_lat < 1:
        raise ValueError(
            f"Horyzont analizy musi być liczbą całkowitą lat ≥ 1, jest {horyzont_lat!r}."
        )
    if stopa_dyskontowa == 0.0:
        return float(horyzont_lat)
    return math.fsum((1.0 + stopa_dyskontowa) ** (-rok) for rok in range(1, horyzont_lat + 1))


def koszt_cyklu_zycia_pln(
    capex_pln: float,
    opex_roczny_pln: float,
    koszt_strat_roczny_pln: float,
    stopa_dyskontowa: float,
    horyzont_lat: int,
) -> float:
    """Koszt cyklu życia (LCC): ``LCC = CAPEX + (OPEX + K_s) · Σ_{t=1..N} (1+r)^{-t}`` [PLN]."""
    wspolczynnik = wspolczynnik_wartosci_biezacej(stopa_dyskontowa, horyzont_lat)
    roczne = _nieujemna("OPEX roczny", opex_roczny_pln) + _nieujemna(
        "Koszt strat roczny", koszt_strat_roczny_pln
    )
    return _nieujemna("CAPEX", capex_pln) + roczne * wspolczynnik
