"""WYROCZNIA PRADOW I NAPIEC SIECI LINIOWEJ — gesta algebra bez kodu rdzenia (AB-1b.1, P10).

ZERO importow z `network_model.solvers.dynamika`. Siec opisana wprost listami
(galezie pi bez przekladni, boczniki, zrodla Nortona), macierz skladana GESTO i
rozwiazywana `numpy.linalg.solve` — inna droga niz rzadka algebra Newtona rdzenia.

ZWARCIE W LINII x*L (D-21). Wyrocznia NIE redukuje wezla wewnetrznego: stawia go
JAWNIE (dwie polowki pi o admitancjach `y/x`, `y/(1-x)` i susceptancjach `B x`,
`B (1-x)`, plus admitancja zwarcia w wezle wewnetrznym) i rozwiazuje pelny uklad.
Rdzen liczy to samo przez redukcje Krona tego wezla — zgodnosc napiec zaciskow i
pradu zwarcia jest dowodem, ze redukcja jest poprawna, a nie ze powtarza sama siebie.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class GalazPi:
    od: str
    do: str
    y: complex
    b_calkowita: float


@dataclass(frozen=True)
class ZrodloNortona:
    """Zrodlo napieciowe `E` za admitancja `y` — prad Nortona `E y`, bocznik `y`."""

    wezel: str
    sem: complex
    y: complex


def rozwiaz_siec_liniowa(
    wezly: tuple[str, ...],
    galezie: tuple[GalazPi, ...],
    boczniki: tuple[tuple[str, complex], ...],
    zrodla: tuple[ZrodloNortona, ...],
    uziemione: tuple[str, ...] = (),
    zrodla_pradowe: tuple[tuple[str, complex], ...] = (),
) -> dict[str, complex]:
    """Napiecia wezlow sieci liniowej: `Y V = sum(E y) + sum(I)` (gesto, bez redukcji).

    Wezly `uziemione` (zwarcie metaliczne) maja `V = 0` WPROST: ich wiersze i kolumny
    sa usuwane z ukladu, zanim zostanie rozwiazany — wyrocznia nie zna „bardzo duzej
    admitancji" ani zadnej postaci zredukowanej. `zrodla_pradowe` — idealne zrodla pradu
    wstrzykiwanego do wezla (przeksztaltnik nadazny w chwili zdarzenia: prad z petli
    pradowej nie zalezy od napiecia wezla, D-20).
    """
    indeks = {wezel: i for i, wezel in enumerate(wezly)}
    macierz = np.zeros((len(wezly), len(wezly)), dtype=complex)
    wymuszenie = np.zeros(len(wezly), dtype=complex)
    for galaz in galezie:
        i, j = indeks[galaz.od], indeks[galaz.do]
        polowa = 1j * galaz.b_calkowita / 2.0
        macierz[i, i] += galaz.y + polowa
        macierz[j, j] += galaz.y + polowa
        macierz[i, j] -= galaz.y
        macierz[j, i] -= galaz.y
    for wezel, admitancja in boczniki:
        macierz[indeks[wezel], indeks[wezel]] += admitancja
    for zrodlo in zrodla:
        macierz[indeks[zrodlo.wezel], indeks[zrodlo.wezel]] += zrodlo.y
        wymuszenie[indeks[zrodlo.wezel]] += zrodlo.sem * zrodlo.y
    for wezel, prad in zrodla_pradowe:
        wymuszenie[indeks[wezel]] += prad
    wolne = [indeks[wezel] for wezel in wezly if wezel not in uziemione]
    rozwiazanie = np.zeros(len(wezly), dtype=complex)
    rozwiazanie[wolne] = np.linalg.solve(macierz[np.ix_(wolne, wolne)], wymuszenie[wolne])
    return {wezel: complex(rozwiazanie[indeks[wezel]]) for wezel in wezly}


def prad_do_ziemi_wezla_uziemionego(
    galezie: tuple[GalazPi, ...], napiecia: dict[str, complex], wezel: str
) -> complex:
    """Prad plynacy DO ZIEMI w wezle uziemionym: minus suma pradow wplywajacych do galezi.

    I prawo Kirchhoffa w wezle bez wstrzykniecia: prady odplywajace galeziami plus prad
    do ziemi sumuja sie do zera. Liczone element po elemencie z modelu pi.
    """
    odplyw = 0j
    for galaz in galezie:
        polowa = 1j * galaz.b_calkowita / 2.0
        if galaz.od == wezel:
            odplyw += (napiecia[wezel] - napiecia[galaz.do]) * galaz.y + napiecia[wezel] * polowa
        elif galaz.do == wezel:
            odplyw += (napiecia[wezel] - napiecia[galaz.od]) * galaz.y + napiecia[wezel] * polowa
    return -odplyw


def polowki_linii_ze_zwarciem(
    galaz: GalazPi, polozenie: float, wezel_wewnetrzny: str
) -> tuple[GalazPi, GalazPi]:
    """Linia `od -> do` rozcieta w `x`: dwie JAWNE polowki pi przez wezel wewnetrzny."""
    return (
        GalazPi(galaz.od, wezel_wewnetrzny, galaz.y / polozenie, galaz.b_calkowita * polozenie),
        GalazPi(
            wezel_wewnetrzny,
            galaz.do,
            galaz.y / (1.0 - polozenie),
            galaz.b_calkowita * (1.0 - polozenie),
        ),
    )


__all__ = [
    "GalazPi",
    "ZrodloNortona",
    "polowki_linii_ze_zwarciem",
    "prad_do_ziemi_wezla_uziemionego",
    "rozwiaz_siec_liniowa",
]
