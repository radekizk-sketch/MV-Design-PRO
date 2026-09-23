"""Os czestotliwosci biegow dziedziny czestotliwosci — `f ∈ ℝ⁺` w Hz (H-41).

Program A/B, kamien AB-1d_min; architektura: `docs/evidence/
OPUS_AUDYT_HARMONICZNE_SUPRAHARMONICZNE_2026-09-23.md` §9 p. 1. ZERO FIZYKI.

KLUCZEM jest czestotliwosc w Hz, nie rzad harmonicznej: interharmoniczne i
supraharmoniczne nie sa wielokrotnosciami ``f1``, wiec os zbudowana na rzedzie
calkowitym nie umialaby ich wyrazic (audyt #28: niezmiennik „rzad 2..50" jako
cecha PRODUKTU byl bledny). Rzad ``h = f / f1`` jest ATRYBUTEM POCHODNYM
(`rzedy`), liczonym z osi, nigdy zapisywanym obok niej.

Rodzaje osi:

- ``HARMONICZNE`` — kazda czestotliwosc jest calkowita wielokrotnoscia ``f1``
  (sprawdzane dokladnie: ``(f / f1).is_integer()`` — bez tolerancji);
- ``LISTA`` — dowolne czestotliwosci dodatnie (w tym interharmoniczne);
- ``SIATKA_LIN`` / ``SIATKA_LOG`` — siatka rownomierna liniowo / logarytmicznie;
  punkty MUSZA byc dokladnie tymi, ktore daje kanoniczny generator siatki
  (`siatka_liniowa` / `siatka_logarytmiczna`) z pierwszego i ostatniego punktu
  i liczby punktow — sprawdzenie bitowe, bez tolerancji (determinizm odcisku).

Rozstrzygniecie wykonawcy (odchylenie od litery audytu §9 p. 1 „sortowanie,
deduplikacja z tolerancja"): kontrakt NIE sortuje i NIE usuwa duplikatow po
cichu — os niemonotoniczna albo z powtorzeniem jest odmowa nazwana. Cicha
poprawka wejscia bylaby ukryta korekta (zakaz WHITE BOX), a tolerancja
deduplikacji — liczba bez zrodla.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from network_model.solvers.harmoniczne.kontrakty import (
    KOD_OS_NIEPOPRAWNA,
    KontraktCzestotliwosciError,
    liczba_dodatnia,
    tekst_niepusty,
)


class RodzajOsiCzestotliwosci(StrEnum):
    """Sposob zadania osi czestotliwosci (H-41)."""

    HARMONICZNE = "HARMONICZNE"
    LISTA = "LISTA"
    SIATKA_LIN = "SIATKA_LIN"
    SIATKA_LOG = "SIATKA_LOG"


#: Pola ladunku osi — komplet wymagany, bez wartosci domyslnych.
POLA_OSI_CZESTOTLIWOSCI: tuple[str, ...] = ("rodzaj", "f_hz", "f1_hz", "zrodlo")


def siatka_liniowa(f_start_hz: float, f_stop_hz: float, liczba_punktow: int) -> tuple[float, ...]:
    """Kanoniczna siatka liniowa: ``f_i = f_start + i·(f_stop − f_start)/(n − 1)``."""
    if liczba_punktow < 2:
        raise KontraktCzestotliwosciError(
            KOD_OS_NIEPOPRAWNA,
            f"Siatka wymaga co najmniej 2 punktow, otrzymano {liczba_punktow}",
        )
    krok = (f_stop_hz - f_start_hz) / (liczba_punktow - 1)
    punkty = [f_start_hz + indeks * krok for indeks in range(liczba_punktow - 1)]
    return (*punkty, f_stop_hz)


def siatka_logarytmiczna(
    f_start_hz: float, f_stop_hz: float, liczba_punktow: int
) -> tuple[float, ...]:
    """Kanoniczna siatka logarytmiczna: ``f_i = f_start·(f_stop/f_start)^(i/(n − 1))``."""
    if liczba_punktow < 2:
        raise KontraktCzestotliwosciError(
            KOD_OS_NIEPOPRAWNA,
            f"Siatka wymaga co najmniej 2 punktow, otrzymano {liczba_punktow}",
        )
    iloraz = f_stop_hz / f_start_hz
    punkty = [
        f_start_hz * iloraz ** (indeks / (liczba_punktow - 1))
        for indeks in range(liczba_punktow - 1)
    ]
    return (*punkty, f_stop_hz)


@dataclass(frozen=True)
class OsCzestotliwosci:
    """Os czestotliwosci biegu: ``f_hz`` (Hz, rosnaco, > 0), rodzaj, ``f1_hz``, zrodlo.

    ``f1_hz`` — czestotliwosc podstawowa studium (jawna; nie 50 Hz z powietrza),
    ``zrodlo`` — skad pochodzi os (dokument, pomiar, decyzja projektanta).
    """

    rodzaj: RodzajOsiCzestotliwosci
    f_hz: tuple[float, ...]
    f1_hz: float
    zrodlo: str

    def __post_init__(self) -> None:
        kod = KOD_OS_NIEPOPRAWNA
        if not isinstance(self.rodzaj, RodzajOsiCzestotliwosci):
            raise KontraktCzestotliwosciError(
                kod,
                f"Nieznany rodzaj osi {self.rodzaj!r}; dozwolone: "
                + ", ".join(rodzaj.value for rodzaj in RodzajOsiCzestotliwosci),
            )
        if not isinstance(self.f_hz, tuple) or not self.f_hz:
            raise KontraktCzestotliwosciError(
                kod, "Os czestotliwosci musi zawierac co najmniej jeden punkt"
            )
        wartosci = [
            liczba_dodatnia(f, pole=f"f_hz[{indeks}]", kod=kod)
            for indeks, f in enumerate(self.f_hz)
        ]
        for indeks in range(1, len(wartosci)):
            if not wartosci[indeks - 1] < wartosci[indeks]:
                raise KontraktCzestotliwosciError(
                    kod,
                    "Os czestotliwosci musi byc scisle rosnaca (bez cichego sortowania i "
                    f"usuwania powtorzen): f_hz[{indeks - 1}] = {wartosci[indeks - 1]} >= "
                    f"f_hz[{indeks}] = {wartosci[indeks]}",
                )
        f1 = liczba_dodatnia(self.f1_hz, pole="f1_hz", kod=kod)
        tekst_niepusty(self.zrodlo, pole="zrodlo", kod=kod)
        if self.rodzaj is RodzajOsiCzestotliwosci.HARMONICZNE:
            niecalkowite = [f for f in wartosci if not (f / f1).is_integer()]
            if niecalkowite:
                raise KontraktCzestotliwosciError(
                    kod,
                    "Os HARMONICZNE przyjmuje wylacznie calkowite wielokrotnosci f1_hz = "
                    f"{f1:g} Hz; czestotliwosci spoza: {niecalkowite} (interharmoniczne "
                    "zadaje sie osia LISTA)",
                )
        elif self.rodzaj in (
            RodzajOsiCzestotliwosci.SIATKA_LIN,
            RodzajOsiCzestotliwosci.SIATKA_LOG,
        ):
            generator = (
                siatka_liniowa
                if self.rodzaj is RodzajOsiCzestotliwosci.SIATKA_LIN
                else siatka_logarytmiczna
            )
            oczekiwana = generator(wartosci[0], wartosci[-1], len(wartosci))
            if tuple(wartosci) != oczekiwana:
                raise KontraktCzestotliwosciError(
                    kod,
                    f"Punkty osi {self.rodzaj.value} nie sa kanoniczna siatka z "
                    f"{wartosci[0]:g}–{wartosci[-1]:g} Hz o {len(wartosci)} punktach "
                    "(generator siatki kontraktu, porownanie dokladne)",
                )

    @property
    def rzedy(self) -> tuple[float, ...]:
        """Rzad ``h = f / f1`` kazdego punktu — atrybut POCHODNY (H-41), nie klucz."""
        return tuple(float(f) / float(self.f1_hz) for f in self.f_hz)

    @classmethod
    def z_dict(cls, dane: Any) -> OsCzestotliwosci:
        """Os z ladunku JSON — komplet pol wymagany, pole nadmiarowe = odmowa."""
        kod = KOD_OS_NIEPOPRAWNA
        if not isinstance(dane, dict):
            raise KontraktCzestotliwosciError(
                kod, f"Os czestotliwosci musi byc obiektem, otrzymano {dane!r}"
            )
        brakujace = [pole for pole in POLA_OSI_CZESTOTLIWOSCI if pole not in dane]
        if brakujace:
            raise KontraktCzestotliwosciError(
                kod,
                "Os czestotliwosci bez wymaganych pol (brak wartosci domyslnych): "
                + ", ".join(brakujace),
            )
        nadmiarowe = sorted(set(dane) - set(POLA_OSI_CZESTOTLIWOSCI))
        if nadmiarowe:
            raise KontraktCzestotliwosciError(
                kod,
                "Os czestotliwosci zawiera pola spoza kontraktu: " + ", ".join(nadmiarowe),
            )
        try:
            rodzaj = RodzajOsiCzestotliwosci(dane["rodzaj"])
        except ValueError as exc:
            raise KontraktCzestotliwosciError(
                kod,
                f"Nieznany rodzaj osi {dane['rodzaj']!r}; dozwolone: "
                + ", ".join(rodzaj.value for rodzaj in RodzajOsiCzestotliwosci),
            ) from exc
        f_hz = dane["f_hz"]
        if not isinstance(f_hz, list | tuple):
            raise KontraktCzestotliwosciError(
                kod,
                f"Pole 'f_hz' musi byc lista czestotliwosci [Hz], otrzymano {f_hz!r}",
            )
        return cls(rodzaj=rodzaj, f_hz=tuple(f_hz), f1_hz=dane["f1_hz"], zrodlo=dane["zrodlo"])

    def to_dict(self) -> dict[str, Any]:
        return {
            "rodzaj": self.rodzaj.value,
            "f_hz": list(self.f_hz),
            "f1_hz": self.f1_hz,
            "zrodlo": self.zrodlo,
        }

    def opis_pl(self) -> str:
        """Opis osi do komunikatu odmowy (rodzaj, zakres, liczba punktow, zrodlo)."""
        return (
            f"oś {self.rodzaj.value}: {len(self.f_hz)} pkt, "
            f"{float(self.f_hz[0]):g}–{float(self.f_hz[-1]):g} Hz, f1 = {float(self.f1_hz):g} Hz, "
            f"źródło: {self.zrodlo}"
        )


__all__ = [
    "POLA_OSI_CZESTOTLIWOSCI",
    "OsCzestotliwosci",
    "RodzajOsiCzestotliwosci",
    "siatka_liniowa",
    "siatka_logarytmiczna",
]
