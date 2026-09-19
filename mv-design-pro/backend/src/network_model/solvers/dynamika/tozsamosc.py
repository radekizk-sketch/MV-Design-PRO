"""Tozsamosc biegu: piec odciskow + wersja rdzenia (SS0 p.6).

KONTRAKT DETERMINIZMU. Ta sama migawka + ten sam punkt pracy + te same nastawy +
ten sam harmonogram + ta sama implementacja ==> IDENTYCZNY wynik (po kwantyzacji
na granicy kontraktu). Piec odciskow czyni te piatke SPRAWDZALNA: dwa biegi o tej
samej piatce, ktore daja rozne szeregi, sa defektem, a nie „szumem numerycznym".

PRECYZJA MIEDZYPLATFORMOWA JEST ZADEKLAROWANA, NIE UDAWANA. Odciski powstaja z
liczb SKWANTYZOWANYCH do 9 cyfr znaczacych — dokladnie tak, jak kwantyzuje
granica kontraktu wyniku. Rownosc bit w bit miedzy roznymi procesorami, wersjami
BLAS i kolejnoscia sumowania NIE jest obiecywana; obiecywana jest rownosc po
kwantyzacji i to jest jedyne, co da sie dotrzymac bez klamstwa.

ODCISK IMPLEMENTACJI to skrot ZRODEL calego pakietu (posortowane sciezki
wzgledne + skroty tresci). Zmiana dowolnego rownania, dowolnej stalej i dowolnego
docstringa zmienia odcisk — celowo szeroko: taniej jest przeliczyc bieg po zmianie
komentarza niz uznac dwa rozne rdzenie za ten sam.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from .kontrakty import (
    HarmonogramDynamiki,
    NastawySolvera,
    OdbiorDynamiki,
    OdsprzegDynamiki,
    PunktPracy,
    Urzadzenie,
    WejscieDynamiki,
)
from .siec import ModelSieci

#: Wersja rdzenia — ta sama etykieta, ktora rejestr rodzajow biegu przypisuje
#: `dynamika_rms` jako podstawe normatywna (`standard_basis_ref`).
WERSJA_SOLVERA = "DYNAMIKA_RMS_DAE_V1"

#: Liczba cyfr znaczacych kwantyzacji na granicy tozsamosci i wyniku.
CYFRY_KWANTYZACJI = 9

_KATALOG_PAKIETU = Path(__file__).resolve().parent


def kwantyzuj(wartosc: float) -> float:
    """Liczba skwantyzowana do `CYFRY_KWANTYZACJI` cyfr znaczacych.

    `-0.0` wraca jako `0.0`: znak zera nie jest wielkoscia fizyczna, a rozniclby
    odciski dwoch biegow o tym samym wyniku.
    """
    skwantyzowana = float(f"%.{CYFRY_KWANTYZACJI}g" % float(wartosc))
    return 0.0 if skwantyzowana == 0.0 else skwantyzowana


def _kwantyzuj_zespolona(wartosc: complex) -> list[float]:
    return [kwantyzuj(wartosc.real), kwantyzuj(wartosc.imag)]


def skrot_kanoniczny(tresc: Any) -> str:
    """SHA-256 nad KANONICZNYM JSON-em (klucze posortowane, bez spacji, ASCII).

    Jedyna droga liczenia odciskow w pakiecie — dwa miejsca liczace skrot dwoma
    sposobami daloby dwa rozne „odciski tej samej rzeczy".
    """
    kanoniczny = json.dumps(tresc, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(kanoniczny.encode("utf-8")).hexdigest()


def odcisk_migawki(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
) -> str:
    """Odcisk WIDOKU SIECI, na ktorym rdzen liczyl: wezly, galezie, odsprzegi,
    odbiory i urzadzenia (z parametrami i wymiarem stanu)."""
    return skrot_kanoniczny(
        {
            "wezly": [[wezel.ident, kwantyzuj(wezel.u_n_kv)] for wezel in model.wezly],
            "galezie": [
                [
                    galaz.ident,
                    galaz.wezel_od,
                    galaz.wezel_do,
                    _kwantyzuj_zespolona(galaz.y_szeregowa_pu),
                    kwantyzuj(galaz.b_poprzeczna_pu),
                    _kwantyzuj_zespolona(galaz.przekladnia),
                ]
                for galaz in model.galezie
            ],
            "odsprzegi": [
                [odsprzeg.ident, odsprzeg.wezel, kwantyzuj(odsprzeg.g_pu), kwantyzuj(odsprzeg.b_pu)]
                for odsprzeg in _posortowane_odsprzegi(model.odsprzegi)
            ],
            "odbiory": [
                [odbior.ident, odbior.wezel, kwantyzuj(odbior.p_pu), kwantyzuj(odbior.q_pu)]
                for odbior in odbiory
            ],
            "urzadzenia": [
                [urzadzenie.ident, urzadzenie.wezel, list(urzadzenie.nazwy_stanow)]
                for urzadzenie in urzadzenia
            ],
        }
    )


def _posortowane_odsprzegi(
    odsprzegi: tuple[OdsprzegDynamiki, ...],
) -> tuple[OdsprzegDynamiki, ...]:
    return tuple(sorted(odsprzegi, key=lambda odsprzeg: odsprzeg.ident))


def odcisk_punktu_pracy(punkt: PunktPracy) -> str:
    """Odcisk rozwiazania rozpływu, od ktorego rusza bieg."""
    return skrot_kanoniczny(
        {
            "napiecia": sorted(
                [ident, *_kwantyzuj_zespolona(wartosc)]
                for ident, wartosc in punkt.napiecia_pu.items()
            ),
            "moce_zrodel": sorted(
                [ident, *_kwantyzuj_zespolona(wartosc)]
                for ident, wartosc in punkt.moce_zrodel_pu.items()
            ),
        }
    )


def odcisk_nastaw(nastawy: NastawySolvera) -> str:
    """Odcisk nastaw numerycznych — kazda z nich wplywa na przebieg."""
    return skrot_kanoniczny(
        {
            "dt_s": kwantyzuj(nastawy.dt_s),
            "dt_min_s": kwantyzuj(nastawy.dt_min_s),
            "dt_max_s": kwantyzuj(nastawy.dt_max_s),
            "tolerancja": kwantyzuj(nastawy.tolerancja),
            "tolerancja_kroku": kwantyzuj(nastawy.tolerancja_kroku),
            "eps_init": kwantyzuj(nastawy.eps_init),
            "max_iteracji_newtona": nastawy.max_iteracji_newtona,
            "max_nawrotow": nastawy.max_nawrotow,
            "horyzont_s": kwantyzuj(nastawy.horyzont_s),
            "krok_wyjscia_s": kwantyzuj(nastawy.krok_wyjscia_s),
            "integrator": nastawy.integrator,
        }
    )


def odcisk_harmonogramu(harmonogram: HarmonogramDynamiki) -> str:
    """Odcisk harmonogramu w KOLEJNOSCI ZAPISU.

    Kolejnosc zapisu jest czescia tresci (remis czasowy rozstrzyga indeks
    wstawienia), wiec dwa harmonogramy o tych samych zdarzeniach zapisanych w
    innej kolejnosci maja ROZNE odciski — ten sam kontrakt, co w warstwie danych.
    """
    tresc: list[Any] = []
    for zdarzenie in harmonogram.zdarzenia:
        pola: dict[str, Any] = {}
        for nazwa, wartosc in vars(zdarzenie).items():
            if isinstance(wartosc, bool) or wartosc is None or isinstance(wartosc, str):
                pola[nazwa] = wartosc
            elif isinstance(wartosc, complex):
                pola[nazwa] = _kwantyzuj_zespolona(wartosc)
            else:
                pola[nazwa] = kwantyzuj(float(wartosc))
        tresc.append({"rodzaj": type(zdarzenie).__name__, "pola": pola})
    return skrot_kanoniczny(tresc)


def odcisk_implementacji() -> str:
    """Skrot ZRODEL pakietu `dynamika` (posortowane sciezki wzgledne + tresc)."""
    wpisy: list[list[str]] = []
    for sciezka in sorted(_KATALOG_PAKIETU.rglob("*.py")):
        if "__pycache__" in sciezka.parts:
            continue
        tresc = sciezka.read_bytes()
        wpisy.append(
            [
                sciezka.relative_to(_KATALOG_PAKIETU).as_posix(),
                hashlib.sha256(tresc).hexdigest(),
            ]
        )
    return skrot_kanoniczny(wpisy)


@dataclass(frozen=True)
class TozsamoscBiegu:
    """Piec odciskow + wersja rdzenia — kontrakt determinizmu biegu."""

    odcisk_migawki: str
    odcisk_punktu_pracy: str
    odcisk_nastaw_solvera: str
    odcisk_harmonogramu: str
    odcisk_implementacji: str
    wersja_solvera: str


def zbuduj_tozsamosc(
    wejscie: WejscieDynamiki, model: ModelSieci, urzadzenia: tuple[Urzadzenie, ...]
) -> TozsamoscBiegu:
    """Zloz tozsamosc biegu z wejscia i zlozonego modelu sieci."""
    return TozsamoscBiegu(
        odcisk_migawki=odcisk_migawki(model, wejscie.odbiory, urzadzenia),
        odcisk_punktu_pracy=odcisk_punktu_pracy(wejscie.punkt_pracy),
        odcisk_nastaw_solvera=odcisk_nastaw(wejscie.nastawy),
        odcisk_harmonogramu=odcisk_harmonogramu(wejscie.harmonogram),
        odcisk_implementacji=odcisk_implementacji(),
        wersja_solvera=WERSJA_SOLVERA,
    )


def kwantyzuj_szereg(wartosci: np.ndarray) -> tuple[float, ...]:
    """Szereg skwantyzowany do 9 cyfr znaczacych (granica kontraktu wyniku)."""
    return tuple(kwantyzuj(float(wartosc)) for wartosc in wartosci)


__all__ = [
    "CYFRY_KWANTYZACJI",
    "WERSJA_SOLVERA",
    "TozsamoscBiegu",
    "kwantyzuj",
    "kwantyzuj_szereg",
    "skrot_kanoniczny",
    "odcisk_harmonogramu",
    "odcisk_implementacji",
    "odcisk_migawki",
    "odcisk_nastaw",
    "odcisk_punktu_pracy",
    "zbuduj_tozsamosc",
]
