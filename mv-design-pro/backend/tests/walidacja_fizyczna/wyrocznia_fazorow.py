"""WYROCZNIA FAZOROW PRADOW GALEZI — superpozycja Thevenina (karta AB-1b.1, D-15 (i)).

ZERO importow z `network_model.solvers.dynamika`. Siec liniowa opisana wprost listami
(galezie pi z przekladnia zespolona, boczniki, zrodla Nortona), macierz skladana GESTO.

INNA DROGA NIZ RDZEN. Rdzen w chwili zwarcia sklada nowa macierz admitancyjna (zwarcie
jako bocznik albo wiersz ograniczenia `V = 0`) i rozwiazuje algebre od nowa. Wyrocznia
NIE sklada sieci zwartej: bierze stan przed zwarciem i dodaje skutek zwarcia z KOLUMNY
macierzy impedancyjnej `Z = Y^-1` sieci zdrowej (twierdzenie Thevenina):

    I_f = V_k(t_f-) / (Z_kk + Z_f),   dV = -Z[:, k] I_f,
    I_ij(t_f+) = I_ij(t_f-) + stempel_ij(dV).

Stempel galezi to model pi z idealnym transformatorem po stronie `od` (konwencja
MATPOWER, W6-A par. 7.2): `I_od = (y + jB/2)/|a|^2 V_od - y/conj(a) V_do`,
`I_do = -y/a V_od + (y + jB/2) V_do`. Zrodla (szyna sztywna, maszyna klasyczna) sa SEM za
admitancja — SEM jest ciagla w chwili zwarcia, wiec superpozycja jest dokladna.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .wyrocznia_pradow import ZrodloNortona


@dataclass(frozen=True)
class GalazZPrzekladnia:
    """Galaz pi z przekladnia zespolona `a` (1+0j dla linii) po stronie `od`."""

    ident: str
    od: str
    do: str
    y: complex
    b_calkowita: float
    przekladnia: complex


@dataclass(frozen=True)
class SuperpozycjaThevenina:
    napiecia_przed: dict[str, complex]
    napiecia_po: dict[str, complex]
    prad_zwarcia: complex
    prady_przed: dict[str, tuple[complex, complex]]
    prady_po: dict[str, tuple[complex, complex]]


def admitancje_zaciskow(galaz: GalazZPrzekladnia) -> tuple[complex, complex, complex, complex]:
    """(Y_oo, Y_od, Y_do, Y_dd) galezi pi z idealnym transformatorem po stronie `od`."""
    a = galaz.przekladnia
    y_polowa = galaz.y + 1j * galaz.b_calkowita / 2.0
    return (
        y_polowa / (abs(a) ** 2),
        -galaz.y / a.conjugate(),
        -galaz.y / a,
        y_polowa,
    )


def prady_zaciskow(
    galaz: GalazZPrzekladnia, napiecia: dict[str, complex]
) -> tuple[complex, complex]:
    """Prady wplywajace do galezi na zaciskach `od` i `do`."""
    y_oo, y_od, y_do, y_dd = admitancje_zaciskow(galaz)
    v_od, v_do = napiecia[galaz.od], napiecia[galaz.do]
    return y_oo * v_od + y_od * v_do, y_do * v_od + y_dd * v_do


def macierz_admitancyjna(
    wezly: tuple[str, ...],
    galezie: tuple[GalazZPrzekladnia, ...],
    boczniki: tuple[tuple[str, complex], ...],
    zrodla: tuple[ZrodloNortona, ...],
) -> np.ndarray:
    indeks = {wezel: i for i, wezel in enumerate(wezly)}
    macierz = np.zeros((len(wezly), len(wezly)), dtype=complex)
    for galaz in galezie:
        i, j = indeks[galaz.od], indeks[galaz.do]
        y_oo, y_od, y_do, y_dd = admitancje_zaciskow(galaz)
        macierz[i, i] += y_oo
        macierz[i, j] += y_od
        macierz[j, i] += y_do
        macierz[j, j] += y_dd
    for wezel, admitancja in boczniki:
        macierz[indeks[wezel], indeks[wezel]] += admitancja
    for zrodlo in zrodla:
        macierz[indeks[zrodlo.wezel], indeks[zrodlo.wezel]] += zrodlo.y
    return macierz


def napiecia_sieci(
    wezly: tuple[str, ...],
    galezie: tuple[GalazZPrzekladnia, ...],
    boczniki: tuple[tuple[str, complex], ...],
    zrodla: tuple[ZrodloNortona, ...],
) -> dict[str, complex]:
    """Napiecia sieci zdrowej: `Y V = sum(E y)`."""
    indeks = {wezel: i for i, wezel in enumerate(wezly)}
    wymuszenie = np.zeros(len(wezly), dtype=complex)
    for zrodlo in zrodla:
        wymuszenie[indeks[zrodlo.wezel]] += zrodlo.sem * zrodlo.y
    rozwiazanie = np.linalg.solve(
        macierz_admitancyjna(wezly, galezie, boczniki, zrodla), wymuszenie
    )
    return {wezel: complex(rozwiazanie[indeks[wezel]]) for wezel in wezly}


def superpozycja_thevenina(
    wezly: tuple[str, ...],
    galezie: tuple[GalazZPrzekladnia, ...],
    boczniki: tuple[tuple[str, complex], ...],
    zrodla: tuple[ZrodloNortona, ...],
    wezel_zwarcia: str,
    z_zwarcia: complex,
) -> SuperpozycjaThevenina:
    """Stan przed i po zwarciu w `wezel_zwarcia` przez kolumne `Z` sieci zdrowej.

    `z_zwarcia = 0` to zwarcie metaliczne: `I_f = V_k / Z_kk`, a `V_k(t_f+) = 0` wynika z
    algebry (`V_k - Z_kk I_f = 0`), nie z narzucenia.
    """
    przed = napiecia_sieci(wezly, galezie, boczniki, zrodla)
    z_bus = np.linalg.inv(macierz_admitancyjna(wezly, galezie, boczniki, zrodla))
    k = wezly.index(wezel_zwarcia)
    prad_zwarcia = przed[wezel_zwarcia] / (complex(z_bus[k, k]) + z_zwarcia)
    przyrost = {wezel: complex(-z_bus[i, k] * prad_zwarcia) for i, wezel in enumerate(wezly)}
    po = {wezel: przed[wezel] + przyrost[wezel] for wezel in wezly}
    prady_przed = {galaz.ident: prady_zaciskow(galaz, przed) for galaz in galezie}
    prady_po = {}
    for galaz in galezie:
        i_od, i_do = prady_przed[galaz.ident]
        d_od, d_do = prady_zaciskow(galaz, przyrost)
        prady_po[galaz.ident] = (i_od + d_od, i_do + d_do)
    return SuperpozycjaThevenina(
        napiecia_przed=przed,
        napiecia_po=po,
        prad_zwarcia=prad_zwarcia,
        prady_przed=prady_przed,
        prady_po=prady_po,
    )


__all__ = [
    "GalazZPrzekladnia",
    "SuperpozycjaThevenina",
    "admitancje_zaciskow",
    "macierz_admitancyjna",
    "napiecia_sieci",
    "prady_zaciskow",
    "superpozycja_thevenina",
]
