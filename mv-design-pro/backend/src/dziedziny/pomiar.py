"""Parametry pomiaru widma — część danych widma, nie metadana (karta AB-H0 §0.5).

Widmo bez parametrów pomiaru nie ma określonego zakresu ważności: ta sama amplituda
składowej zmierzona oknem 200 ms z grupowaniem podgrup i oknem 10 okresów bez grupowania
opisuje co innego. Dlatego parametry pomiaru są polem modelu widma
(``ModelZrodlaWidmowego.pomiar``), a nie komentarzem karty.

Reguła kompletu (JEDNO miejsce): model ``MEASURED_SPECTRUM`` wymaga kompletu
``KOMPLET_POMIARU`` = {metoda, rozdzielczość, okno, agregacja, podstawa} — brak któregoś
z nich jest błędem walidacji modelu z listą braków (``ParametryPomiaru.braki_kompletu``).
Dla dziedziny supraharmonicznej obowiązkowe jest dodatkowo pasmo rozdzielczości ``rbw_hz``
(``ParametryPomiaru.braki_kompletu(supraharmoniczna=True)``).

Każda liczba pochodzi z dokumentu pomiaru (raport badań, protokół laboratorium) — pole
bez wartości w dokumencie pozostaje ``None`` i wchodzi do listy braków, nigdy nie jest
uzupełniane wartością typową.

IMPORTY: stdlib, pydantic, ``werdykt.kontrakt``, ``dziedziny.kanon``.
"""

from __future__ import annotations

from typing import Literal, Self

from dziedziny.kanon import Dodatnia, KontraktDziedziny, naruszenie
from pydantic import model_validator
from werdykt.kontrakt import DanaPrzyjeta, PodstawaWymagania, Tekst, Wielkosc

#: Pola parametrów pomiaru, bez których widmo zmierzone nie ma określonego zakresu ważności.
#: Kolejność = kolejność w komunikacie braków.
KOMPLET_POMIARU: tuple[str, ...] = ("metoda", "rozdzielczosc_hz", "okno", "agregacja", "podstawa")
#: Pole wymagane dodatkowo dla dziedziny supraharmonicznej (pasmo rozdzielczości analizatora).
POLE_SUPRAHARMONICZNE: Literal["rbw_hz"] = "rbw_hz"


class OknoPomiaru(KontraktDziedziny):
    """Okno analizy widmowej: rodzaj (np. prostokątne zsynchronizowane), długość i liczba
    okresów podstawowej — wszystkie z dokumentu pomiaru."""

    rodzaj_pl: Tekst
    dlugosc_s: Dodatnia
    liczba_okresow: int | None = None

    @model_validator(mode="after")
    def _okresy_dodatnie(self) -> Self:
        if self.liczba_okresow is not None and self.liczba_okresow <= 0:
            raise ValueError(
                naruszenie(
                    "widmo.pomiar",
                    f"Liczba okresów okna pomiaru musi być dodatnia (podano {self.liczba_okresow}).",
                )
            )
        return self


class AgregacjaPomiaru(KontraktDziedziny):
    """Agregacja wyników pomiaru: czas agregacji i statystyka (np. „wartość średnia 10 min",
    „95. percentyl") — z dokumentu."""

    czas_s: Dodatnia
    statystyka_pl: Tekst


class KalibracjaPomiaru(KontraktDziedziny):
    """Świadectwo kalibracji przyrządu: dokument i data (tekst z dokumentu)."""

    dokument: Tekst
    data: Tekst


class ParametryPomiaru(KontraktDziedziny):
    """Parametry pomiaru widma (IEC 61000-4-7, IEC 61000-4-30, CISPR 16-1-1 — wg dokumentu).

    ``warunki_sieci_probierczej`` — S_k, X/R, tło sieci probierczej jako dane przyjęte ze
    statusem jakości (każda pozycja MUSI mieć jakość — jak parametry sieci w
    ``werdykt.kontrakt.ZakresWaznosci``).
    """

    metoda: Tekst | None = None
    czestotliwosc_probkowania_hz: Dodatnia | None = None
    okno: OknoPomiaru | None = None
    rozdzielczosc_hz: Dodatnia | None = None
    rbw_hz: Dodatnia | None = None
    agregacja: AgregacjaPomiaru | None = None
    czas_pomiaru_s: Dodatnia | None = None
    poziom_szumu: Wielkosc | None = None
    kalibracja: KalibracjaPomiaru | None = None
    warunki_sieci_probierczej: tuple[DanaPrzyjeta, ...] = ()
    podstawa: PodstawaWymagania | None = None

    @model_validator(mode="after")
    def _warunki_ze_statusem(self) -> Self:
        bez_jakosci = [d.nazwa_pl for d in self.warunki_sieci_probierczej if d.jakosc is None]
        if bez_jakosci:
            raise ValueError(
                naruszenie(
                    "widmo.pomiar",
                    f"Warunki sieci probierczej bez statusu jakości: {bez_jakosci} — każda dana "
                    "przyjęta pomiaru niesie jakość (DATASHEET / ESTIMATED / SYSTEM_DEFAULT).",
                )
            )
        if self.poziom_szumu is not None and self.poziom_szumu.wartosc < 0.0:
            raise ValueError(
                naruszenie(
                    "widmo.pomiar",
                    f"Poziom szumu pomiaru jest wielkością nieujemną (podano {self.poziom_szumu}).",
                )
            )
        return self

    def braki_kompletu(self, *, supraharmoniczna: bool) -> tuple[str, ...]:
        """Pola kompletu pomiaru, których brakuje (pusta krotka = komplet).

        ``supraharmoniczna`` — dziedzina modelu; dla supraharmonicznej obowiązkowe jest też
        pasmo rozdzielczości ``rbw_hz``.
        """
        braki = [nazwa for nazwa in KOMPLET_POMIARU if getattr(self, nazwa) is None]
        if supraharmoniczna and self.rbw_hz is None:
            braki.append(POLE_SUPRAHARMONICZNE)
        return tuple(braki)


__all__ = [
    "KOMPLET_POMIARU",
    "POLE_SUPRAHARMONICZNE",
    "AgregacjaPomiaru",
    "KalibracjaPomiaru",
    "OknoPomiaru",
    "ParametryPomiaru",
]
