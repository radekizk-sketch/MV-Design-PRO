"""Nadzorca biegu: postep i przerwanie MIEDZY krokami calkowania (karta DYNAMIKA-W-TLE).

Jedyny punkt styku rdzenia z wykonawca w tle — ADDYTYWNY: `SilnikDynamiki` bez nadzorcy
liczy dokladnie to samo, co z nadzorca, ktory niczego nie przerywa (nadzorca nie widzi
stanow ani napiec, wiec nie ma jak zmienic wyniku; przypina to test parytetu bit w bit).

Nadzorca jest wolany po KAZDYM przyjetym kroku calkowania z chwila `t_s`, horyzontem i
liczba krokow. Moze przerwac bieg wyjatkiem `BiegPrzerwany` — rdzen go NIE przechwytuje i
nie zostawia zadnego wyniku czesciowego (w chwili przerwania `WynikDynamiki` jeszcze nie
istnieje), a wolajacy nadaje biegowi stan `CANCELLED` z wyjasnieniem.

`BiegPrzerwany` celowo NIE dziedziczy po `ValueError`/`OdmowaDanychError`: odmowa
obliczenia to wynik biegu (FAILED z kodem), przerwanie to decyzja uzytkownika — dwie rozne
klasy skutkow, ktorych nie wolno zlac w jeden `except`.
"""

from __future__ import annotations

from typing import Protocol


class BiegPrzerwany(Exception):
    """Bieg przerwany na zadanie wolajacego miedzy krokami calkowania."""

    def __init__(self, t_s: float, kroki: int, horyzont_s: float) -> None:
        super().__init__(
            f"Bieg przerwany w chwili t = {t_s:.6g} s po {kroki} krokach "
            f"(horyzont {horyzont_s:.6g} s)"
        )
        self.t_s = t_s
        self.kroki = kroki
        self.horyzont_s = horyzont_s


class NadzorcaBiegu(Protocol):
    """Obserwator postepu biegu; przerywa bieg wyjatkiem `BiegPrzerwany`."""

    def po_kroku(self, t_s: float, horyzont_s: float, kroki: int) -> None:
        """Wolane po kazdym PRZYJETYM kroku calkowania (nie po odrzuconym)."""


__all__ = ["BiegPrzerwany", "NadzorcaBiegu"]
