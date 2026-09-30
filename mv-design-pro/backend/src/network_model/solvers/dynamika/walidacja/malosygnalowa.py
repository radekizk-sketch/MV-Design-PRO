"""Analiza MALOSYGNALOWA: wartosci wlasne jakobianu w punkcie pracy (SS0 p.7 b).

CO LICZY. Uklad DAE `dx/dt = f(x, y)`, `0 = g(x, y)` zlinearyzowany w punkcie
pracy daje po wyrugowaniu czesci algebraicznej macierz stanu

    A = f_x - f_y * (g_y)^(-1) * g_x ,

ktorej wartosci wlasne opisuja mody ukladu: czestotliwosc oscylacji
`f = |Im(lambda)| / (2 pi)` i wspolczynnik tlumienia
`zeta = -Re(lambda) / |lambda|`.

PO CO. To DRUGA, niezalezna miara tego samego rdzenia: czestotliwosc oscylacji
odczytana z PRZEBIEGU (przejscia przez zero, calkowanie w czasie) musi zgadzac
sie z czestotliwoscia policzona z WARTOSCI WLASNYCH (algebra liniowa w jednym
punkcie, bez ani jednego kroku calkowania). Rozjazd tych dwoch liczb oznacza
blad w jakobianie albo w calkowaniu — i nie da sie go schowac, bo zadna z nich
nie korzysta z kodu tej drugiej.

BLOKI JAKOBIANU pochodza z tych samych metod urzadzen, ktorych uzywa krok
calkowania (`jakobian_stan_stan`, `jakobian_stan_napiecie`, `jakobian_prad_stan`)
oraz z `siec.jakobian_algebry`. To jest zamierzone: gdyby analiza malosygnalowa
miala wlasna kopie pochodnych, zgodnosc dowodzilaby zgodnosci dwoch kopii, a nie
poprawnosci jednej.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from ..calkowanie import KontekstKroku
from ..siec import jakobian_algebry


@dataclass(frozen=True)
class Mod:
    """Jeden mod ukladu: wartosc wlasna, czestotliwosc i tlumienie."""

    wartosc_wlasna: complex
    czestotliwosc_hz: float
    wspolczynnik_tlumienia: float


def macierz_stanu(
    kontekst: KontekstKroku,
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> np.ndarray:
    """Macierz stanu `A = f_x - f_y (g_y)^(-1) g_x` w zadanym punkcie pracy."""
    liczba_wezlow = kontekst.model.liczba_wezlow
    wymiary = kontekst.wymiary_stanow
    liczba_stanow = int(sum(wymiary))

    f_x = np.zeros((liczba_stanow, liczba_stanow), dtype=float)
    f_y = np.zeros((liczba_stanow, 2 * liczba_wezlow), dtype=float)
    g_x = np.zeros((2 * liczba_wezlow, liczba_stanow), dtype=float)

    przesuniecie = 0
    for urzadzenie, stan, wymiar in zip(kontekst.urzadzenia, stany, wymiary, strict=True):
        pozycja = kontekst.model.indeks_wezla[urzadzenie.wezel]
        napiecie = complex(napiecia[pozycja])
        f_x[przesuniecie : przesuniecie + wymiar, przesuniecie : przesuniecie + wymiar] = (
            urzadzenie.jakobian_stan_stan(stan, napiecie)
        )
        blok_fy = urzadzenie.jakobian_stan_napiecie(stan, napiecie)
        f_y[przesuniecie : przesuniecie + wymiar, pozycja] = blok_fy[:, 0]
        f_y[przesuniecie : przesuniecie + wymiar, pozycja + liczba_wezlow] = blok_fy[:, 1]
        blok_ix = urzadzenie.jakobian_prad_stan(stan, napiecie)
        g_x[pozycja, przesuniecie : przesuniecie + wymiar] = -blok_ix[0, :]
        g_x[pozycja + liczba_wezlow, przesuniecie : przesuniecie + wymiar] = -blok_ix[1, :]
        przesuniecie += wymiar

    g_y = jakobian_algebry(
        kontekst.model, kontekst.odbiory, kontekst.urzadzenia, stany, napiecia
    ).toarray()
    return f_x - f_y @ np.linalg.solve(g_y, g_x)


def mody(
    kontekst: KontekstKroku,
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> tuple[Mod, ...]:
    """Mody ukladu posortowane malejaco po czestotliwosci, potem po tlumieniu.

    Kolejnosc jest KANONICZNA (a nie kolejnoscia, ktora zwroci biblioteka), zeby
    porownania miedzy biegami byly powtarzalne.
    """
    wartosci = np.linalg.eigvals(macierz_stanu(kontekst, stany, napiecia))
    wynik = [
        Mod(
            wartosc_wlasna=complex(wartosc),
            czestotliwosc_hz=abs(float(wartosc.imag)) / (2.0 * math.pi),
            wspolczynnik_tlumienia=(
                -float(wartosc.real) / abs(complex(wartosc)) if abs(complex(wartosc)) > 0.0 else 0.0
            ),
        )
        for wartosc in wartosci
    ]
    return tuple(
        sorted(
            wynik,
            key=lambda mod: (
                -mod.czestotliwosc_hz,
                -mod.wspolczynnik_tlumienia,
                mod.wartosc_wlasna.real,
            ),
        )
    )


def mod_oscylacyjny(mody_ukladu: tuple[Mod, ...]) -> Mod:
    """Mod o najwyzszej NIEZEROWEJ czestotliwosci — mod elektromechaniczny SMIB.

    Brak takiego modu jest bledem wolajacego (uklad bez oscylacji nie ma czego
    porownywac z przebiegiem), wiec konczy sie wyjatkiem, nie wartoscia zastepcza.
    """
    oscylacyjne = [mod for mod in mody_ukladu if mod.czestotliwosc_hz > 0.0]
    if not oscylacyjne:
        raise ValueError(
            "Uklad nie ma modu oscylacyjnego (wszystkie wartosci wlasne rzeczywiste) — "
            "nie ma czego porownywac z czestotliwoscia przebiegu."
        )
    return oscylacyjne[0]


__all__ = ["Mod", "macierz_stanu", "mod_oscylacyjny", "mody"]
