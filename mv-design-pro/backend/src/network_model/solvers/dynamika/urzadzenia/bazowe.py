"""Wspolne narzedzia urzadzen dynamicznych: bloki jakobianu i zrodlo napieciowe.

ZAKRES. Karta W6-2 buduje RDZEN: sprzezenie sieciowe, calkowanie, zdarzenia,
re-inicjalizacja, tozsamosc i walidacje analityczne. Biblioteka urzadzen
(maszyna 6. rzedu z AVR/GOV/PSS, GFL, GFM, magazyn, wiatr) jest zakresem
nastepnego wycinka. W tym module i obok niego zyja WYLACZNIE dwa urzadzenia,
bez ktorych rdzenia nie da sie odebrac, bo bez nich nie ma czego calkowac ani
wobec czego porownac: maszyna KLASYCZNA (model 2. rzedu — wyrocznie rownych pol
i malosygnalowa z SS0 p.7 a/b sa sformulowane dokladnie dla niej) oraz SZYNA
SZTYWNA (warunek brzegowy ukladu SMIB).

WSPOLNY WZORZEC ZRODLA NAPIECIOWEGO ZA IMPEDANCJA. Oba urzadzenia wstrzykuja do
wezla prad `I = (E - V) * y`, gdzie `y = 1/(Ra + jX')`. Roznia sie WYLACZNIE tym,
skad bierze sie `E`: maszyna liczy je z kata wirnika (stan rozniczkowy), szyna
sztywna trzyma je jako stan o zerowej pochodnej. Dlatego pochodne pradu wzgledem
napiecia sa dla obu TE SAME i licza sie w jednym miejscu — gdyby kazde
urzadzenie mialo wlasna kopie tego bloku, rozjazd znaku w jednej z nich bylby
niewidoczny do pierwszego zwarcia.
"""

from __future__ import annotations

import numpy as np

from ..kontrakty import (
    KOD_PARAMETRY_SPRZECZNE,
    KOD_WARTOSC_NIESKONCZONA,
    OdmowaDynamiki,
)
from .pochodne_kierunkowe import Dual, Zespolona, kwadrat, pierwiastek


def blok_mnozenia_zespolonego(mnoznik: complex) -> np.ndarray:
    """Blok 2x2 odwzorowania rzeczywistego dla `z -> mnoznik * z`.

    Dla `mnoznik = c_r + j c_i` mnozenie zespolone w postaci rzeczywistej to
    `[[c_r, -c_i], [c_i, c_r]]` — jedyna definicja tego bloku w pakiecie.
    """
    return np.array(
        [[mnoznik.real, -mnoznik.imag], [mnoznik.imag, mnoznik.real]],
        dtype=float,
    )


def admitancja_wewnetrzna(ra_pu: float, x_prim_pu: float) -> complex:
    """`y = 1/(Ra + jX')` — admitancja wewnetrzna zrodla napieciowego."""
    impedancja = complex(ra_pu, x_prim_pu)
    if impedancja == 0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            "Zrodlo napieciowe o zerowej impedancji wewnetrznej nie ma skonczonej "
            "admitancji — Ra i X' nie moga byc jednoczesnie zerowe. Wezel bylby wtedy "
            "sztywno zwiazany z SEM, co jest innym modelem, a nie granicznym przypadkiem "
            "tego.",
            ra_pu=ra_pu,
            x_prim_pu=x_prim_pu,
        )
    return 1.0 / impedancja


def prad_zrodla_napieciowego(sem: complex, napiecie_pu: complex, admitancja: complex) -> complex:
    """Prad wstrzykiwany przez zrodlo napieciowe za impedancja (konwencja generacji)."""
    return (sem - napiecie_pu) * admitancja


def jakobian_prad_napiecie_zrodla(admitancja: complex) -> np.ndarray:
    """∂(Re I, Im I)/∂(Re V, Im V) zrodla napieciowego: blok mnozenia przez `-y`."""
    return blok_mnozenia_zespolonego(-admitancja)


def modul_niezerowy(fazor: Zespolona, opis: str) -> Dual:
    """`|z|` z gradientem; zerowy fazor konczy sie NAZWANA odmowa, nie zerem.

    Modul w zerze jest ciagly, ale NIE ROZNICZKOWALNY — kierunek gradientu nie
    istnieje. Urzadzenie, ktore czyta modul napiecia zaciskow (regulator
    napiecia, ogranicznik pradu, nasycenie obwodu magnetycznego), przy zerowym
    fazorze nie ma okreslonego wejscia regulacji. Cicha podmiana na zero dalaby
    jakobian niezgodny z wlasna funkcja i „dzialajacy" bieg z bezsensownym
    sterowaniem, dlatego jest tu wykluczona z konstrukcji.
    """
    kwadrat_modulu = kwadrat(fazor.re) + kwadrat(fazor.im)
    if kwadrat_modulu.wartosc <= 0.0:
        raise OdmowaDynamiki(
            KOD_WARTOSC_NIESKONCZONA,
            f"{opis}: modul zerowego fazora nie ma pochodnej — regulacja nie ma "
            "okreslonego wejscia przy dokladnie zerowym napieciu",
            wielkosc=opis,
        )
    return pierwiastek(kwadrat_modulu)


__all__ = [
    "admitancja_wewnetrzna",
    "blok_mnozenia_zespolonego",
    "jakobian_prad_napiecie_zrodla",
    "modul_niezerowy",
    "prad_zrodla_napieciowego",
]
