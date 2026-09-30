"""Macierz stanu analizy malosygnalowej wobec roznicy skonczonej ukladu ZREDUKOWANEGO.

PO CO (karta AB-1b.3b-NA-CZUBKU, regula predykatow parami). `walidacja.malosygnalowa.
macierz_stanu` linearyzuje `dx/dt = f(x, y(x))`, gdzie `y(x)` rozwiazuje `g(x, y) = 0`.
Dawniej skladala blok `dg/dx` wlasna petla: stemplowala `dI/dx` KAZDEGO elementu — takze
w wierszu ograniczenia (zwarcie metaliczne, obszar odciety: wiersz `V = 0`) i dla urzadzenia
o sprzezeniu napieciowym (wiersz `V - E(x) = 0`), czyli linearyzowala INNY uklad niz ten,
ktory calkuje rdzen. Blok ma teraz jedno zrodlo z jakobianem sprzezonym kroku
(`calkowanie.blok_algebry_po_stanie`).

WYROCZNIA: roznica centralna `f(x +- h e_j, y(x +- h e_j))` z algebra rozwiazana Newtonem
rdzenia (`siec.rozwiaz_algebre`) — inna droga niz eliminacja Schura `f_x - f_y g_y^-1 g_x`.

ILOCZYN CECH: {odbior ze stanem: przylaczony, odlaczony zdarzeniem na zywej szynie, w wezle
ograniczonym zerem} x {urzadzenie: pradowe, pradowe w wezle ograniczonym, napieciowe (zrodlo
idealne)}.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    GalazDynamiki,
    OdbiorDynamiki,
    WezelDynamiki,
)
from network_model.solvers.dynamika.calkowanie import (
    KontekstKroku,
    pochodne_ukladu,
    rozpakuj_stany,
    spakuj_stany,
)
from network_model.solvers.dynamika.odbiory import (
    TRYB_ODLACZONY,
    model_odbioru,
)
from network_model.solvers.dynamika.siec import rozwiaz_algebre, zloz_model_sieci
from network_model.solvers.dynamika.urzadzenia import zbuduj_zrodlo_testowe
from network_model.solvers.dynamika.walidacja.malosygnalowa import macierz_stanu

from tests.network_model.dynamika import uklady

F_N = uklady.F_BAZOWA_HZ


def _odbior(ident: str, wezel: str, *, odlaczony: bool = False) -> Any:
    return model_odbioru(
        OdbiorDynamiki(ident, wezel, 0.3, 0.1, charakterystyka=uklady.charakterystyka_czula()),
        F_N,
        tryb_poza_obwodem=TRYB_ODLACZONY if odlaczony else None,
        estymator_wyzerowany=False,
    )


def _smib(*, zwarcie_metaliczne: bool, odlaczony: bool) -> tuple[Any, ...]:
    """SMIB z odbiorem CZULYM na szynie generatora (maszyna i odbior pradowe)."""
    smib = uklady.zbuduj_smib_z_odbiorem(
        q_odbioru_pu=0.05, charakterystyka=uklady.charakterystyka_czula()
    )
    model = zloz_model_sieci(
        smib.wezly,
        smib.galezie,
        (),
        zwarcia_metaliczne=frozenset({"GEN"}) if zwarcie_metaliczne else frozenset(),
    )
    (odbior,) = smib.odbiory
    odbiory = (
        model_odbioru(
            odbior,
            F_N,
            tryb_poza_obwodem=TRYB_ODLACZONY if odlaczony else None,
            estymator_wyzerowany=False,
        ),
    )
    urzadzenia = (smib.maszyna, smib.szyna)
    punkt = smib.punkt_pracy
    napiecia = np.array(
        [
            0j if zwarcie_metaliczne and ident == "GEN" else punkt.napiecia_pu[ident]
            for ident in model.identy_wezlow
        ],
        dtype=complex,
    )
    # Stan estymatora ODSUNIETY od rownowagi (x = arg V - 0,05 rad): linearyzacja
    # w punkcie, w ktorym czestotliwosc widziana rozni sie od znamionowej.
    stany = (
        np.array([np.angle(punkt.napiecia_pu["GEN"]) - 0.05]),
        smib.maszyna.stan_poczatkowy(punkt.napiecia_pu["GEN"], punkt.moce_zrodel_pu["G1"]),
        smib.szyna.stan_poczatkowy(punkt.napiecia_pu["SYS"], punkt.moce_zrodel_pu["SYS1"]),
    )
    return model, odbiory, urzadzenia, stany, napiecia


def _zrodlo_idealne(*, odlaczony: bool) -> tuple[Any, ...]:
    """Zrodlo testowe IDEALNE (sprzezenie napieciowe, wiersz `V - E(x) = 0`) — linia —
    odbior czuly: wiersz wezla zrodla nie jest bilansem pradow."""
    wezly = (WezelDynamiki("SRC", uklady.U_N_KV), WezelDynamiki("ODB", uklady.U_N_KV))
    galezie = (
        GalazDynamiki("L", "SRC", "ODB", 1.0 / complex(0.02, 0.1), 0.0, 1 + 0j, True, "linia"),
    )
    model = zloz_model_sieci(wezly, galezie, ())
    zrodlo = zbuduj_zrodlo_testowe(ident="ZT", wezel="SRC", impedancja_pu=None, f_bazowa_hz=F_N)
    odbiory = (_odbior("ODB1", "ODB", odlaczony=odlaczony),)
    napiecia = np.array([1.0 + 0j, 0.97 - 0.03j], dtype=complex)
    stany = (
        np.array([np.angle(napiecia[1]) + 0.03]),
        zrodlo.stan_poczatkowy(1.0 + 0j, complex(0.3, 0.1)),
    )
    return model, odbiory, (zrodlo,), stany, napiecia


PRZYPADKI = {
    "pradowe-odbior_przylaczony": lambda: _smib(zwarcie_metaliczne=False, odlaczony=False),
    "pradowe-odbior_odlaczony": lambda: _smib(zwarcie_metaliczne=False, odlaczony=True),
    "pradowe_w_wezle_ograniczonym-odbior_w_wezle_ograniczonym": lambda: _smib(
        zwarcie_metaliczne=True, odlaczony=False
    ),
    "napieciowe-odbior_przylaczony": lambda: _zrodlo_idealne(odlaczony=False),
    "napieciowe-odbior_odlaczony": lambda: _zrodlo_idealne(odlaczony=True),
}


def _algebra(kontekst: KontekstKroku, stany: tuple[np.ndarray, ...], start: np.ndarray) -> Any:
    return rozwiaz_algebre(
        kontekst.model,
        kontekst.odbiory,
        kontekst.urzadzenia,
        stany,
        start,
        tolerancja=1.0e-13,
        max_iteracji=60,
        max_nawrotow=30,
        t_s=0.0,
    ).napiecia


@pytest.mark.parametrize("przypadek", sorted(PRZYPADKI))
def test_macierz_stanu_wobec_roznicy_skonczonej_ukladu_zredukowanego(przypadek: str) -> None:
    model, odbiory, urzadzenia, stany, start = PRZYPADKI[przypadek]()
    kontekst = KontekstKroku(model, odbiory, urzadzenia, uklady.nastawy())
    napiecia = _algebra(kontekst, stany, start)
    analityczna = macierz_stanu(kontekst, stany, napiecia)

    wektor = spakuj_stany(stany)
    numeryczna = np.zeros_like(analityczna)
    for j in range(wektor.shape[0]):
        krok = 1.0e-6 * max(1.0, abs(float(wektor[j])))
        kolumny = []
        for znak in (1.0, -1.0):
            przesuniety = wektor.copy()
            przesuniety[j] += znak * krok
            stany_j = rozpakuj_stany(przesuniety, kontekst.wymiary_stanow)
            kolumny.append(
                pochodne_ukladu(kontekst, stany_j, _algebra(kontekst, stany_j, napiecia), 0.0)
            )
        numeryczna[:, j] = (kolumny[0] - kolumny[1]) / (2.0 * krok)

    skala = float(np.max(np.abs(numeryczna)))
    np.testing.assert_allclose(analityczna, numeryczna, rtol=1.0e-5, atol=1.0e-6 * skala)
    # Niepustosc cechy: odbior ze stanem ma w macierzy wlasny wiersz i kolumne.
    assert kontekst.wymiary_stanow[0] == 1


def test_przypadki_pokrywaja_iloczyn_cech() -> None:
    """Wiersz ograniczenia i urzadzenie napieciowe sa NAPRAWDE w przypadkach (inaczej test
    macierzy nie rozroznilby reguly bloku `dg/dx`)."""
    model, _, _, _, _ = PRZYPADKI["pradowe_w_wezle_ograniczonym-odbior_w_wezle_ograniczonym"]()
    assert model.indeks_wezla["GEN"] in set(model.pozycje_zerowe)
    _, _, urzadzenia_zrodla, _, _ = PRZYPADKI["napieciowe-odbior_przylaczony"]()
    assert urzadzenia_zrodla[0].sprzezenie == "napieciowe"
