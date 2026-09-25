"""Straznik zakresu waznosci: stan poza modelem konczy bieg ODMOWA, nie liczba.

Dlaczego to jest osobna rzecz od `granice_stanow`, mowi
`kontrakty.Urzadzenie.zakresy_waznosci`. Tutaj sprawdzamy trzy rzeczy: sam predykat
z jego marginesem, KOMPLETNOSC deklaracji w calej bibliotece urzadzen oraz to, ze
margines jest ziarnistoscia arytmetyki, a nie dobrana stala.
"""

from __future__ import annotations

import numpy as np
import pytest
from network_model.solvers.dynamika import OdmowaDynamiki
from network_model.solvers.dynamika.kontrakty import (
    KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY,
    NastawySolvera,
)
from network_model.solvers.dynamika.waznosc import (
    margines_arytmetyczny,
    sprawdz_zakresy_waznosci,
)

from tests.network_model.dynamika.biblioteka_urzadzen import nastawy

BEZ_ZAKRESU = (-np.inf, np.inf)


def wektory(zakresy: tuple[tuple[float, float], ...]) -> tuple[np.ndarray, np.ndarray]:
    return (
        np.array([dolna for dolna, _ in zakresy], dtype=float),
        np.array([gorna for _, gorna in zakresy], dtype=float),
    )


def test_stan_ponizej_dolnego_zakresu_konczy_sie_odmowa_z_adresem() -> None:
    """Komunikat niesie ADRES stanu, wartosc, granice i PRZEKROCZENIE — nie sam fakt."""
    dolne, gorne = wektory(((0.1, 0.9), BEZ_ZAKRESU))
    with pytest.raises(OdmowaDynamiki) as blad:
        sprawdz_zakresy_waznosci(
            np.array([0.0999, 42.0]),
            dolne,
            gorne,
            ("BESS1.soc_pu", "BESS1.kat_rad"),
            nastawy(),
            1.25,
        )
    assert blad.value.kod == KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY
    tresc = str(blad.value)
    assert "BESS1.soc_pu[0]" in tresc
    assert "granica dolna 0.1" in tresc
    assert "przekroczenie 0.000" in tresc
    assert blad.value.szczegoly["adresy"] == ("BESS1.soc_pu",)
    assert blad.value.szczegoly["indeksy"] == (0,)
    assert blad.value.szczegoly["t_s"] == 1.25


def test_stan_powyzej_gornego_zakresu_konczy_sie_odmowa() -> None:
    dolne, gorne = wektory(((0.1, 0.9),))
    with pytest.raises(OdmowaDynamiki) as blad:
        sprawdz_zakresy_waznosci(
            np.array([0.9001]), dolne, gorne, ("BESS1.soc_pu",), nastawy(), 0.5
        )
    assert "granica gorna 0.9" in str(blad.value)


def test_stan_w_zakresie_i_stan_bez_zakresu_przechodza() -> None:
    """Granica osiagnieta DOKLADNIE jeszcze nie jest wyjsciem poza model."""
    dolne, gorne = wektory(((0.1, 0.9), BEZ_ZAKRESU))
    sprawdz_zakresy_waznosci(
        np.array([0.1, -1.0e12]), dolne, gorne, ("BESS1.soc_pu", "G1.efd_pu"), nastawy(), 0.0
    )
    sprawdz_zakresy_waznosci(
        np.array([0.9, 1.0e12]), dolne, gorne, ("BESS1.soc_pu", "G1.efd_pu"), nastawy(), 0.0
    )


def test_szum_reprezentacji_nie_wywoluje_odmowy_a_ruch_fizyczny_wywoluje() -> None:
    """Margines ma przepuscic ZAOKRAGLENIE i zatrzymac RUCH — obie strony naraz.

    Bez marginesu magazyn stojacy DOKLADNIE na `SOC_min` przy mocy praktycznie zerowej
    (`P = 1,07e-17 pu` — tyle daje rozwiazanie algebry dla zadania zerowego) zbieralby
    przez 1000 krokow dryf rzedu 1e-17 i konczyl bieg odmowa z powodu wylacznie
    arytmetycznego. Z marginesem `kroki_max * ulp(granica)` taki dryf przechodzi, a
    przekroczenie o jeden krok calkowania (3,6e-07 w pomiarze granicy SOC) juz nie.
    """
    dolne, gorne = wektory(((0.1, 0.9),))
    nast = nastawy(horyzont_s=2.0, dt_s=0.002)
    margines = float(margines_arytmetyczny(dolne, nast)[0])
    assert margines == pytest.approx(1000.0 * np.spacing(0.1), rel=1e-12)

    sprawdz_zakresy_waznosci(
        np.array([0.1 - 0.5 * margines]), dolne, gorne, ("BESS1.soc_pu",), nast, 1.0
    )
    with pytest.raises(OdmowaDynamiki):
        sprawdz_zakresy_waznosci(
            np.array([0.1 - 2.0 * margines]), dolne, gorne, ("BESS1.soc_pu",), nast, 1.0
        )


def test_margines_skaluje_sie_z_liczba_krokow_i_z_granica() -> None:
    """Margines jest ILOCZYNEM dwoch wielkosci z kontraktu, a nie stala w kodzie."""
    dolne = np.array([0.1, 0.95], dtype=float)
    rzadki = NastawySolvera(
        dt_s=0.01,
        dt_min_s=0.01,
        dt_max_s=0.01,
        tolerancja=1e-11,
        tolerancja_kroku=1e-6,
        eps_init=1e-8,
        max_iteracji_newtona=40,
        max_nawrotow=30,
        horyzont_s=1.0,
        krok_wyjscia_s=0.01,
        integrator="trapez_niejawny",
        tolerancja_lokalizacji_zdarzen_s=None,
    )
    gesty = NastawySolvera(
        dt_s=0.01,
        dt_min_s=1.0e-5,
        dt_max_s=0.01,
        tolerancja=1e-11,
        tolerancja_kroku=1e-6,
        eps_init=1e-8,
        max_iteracji_newtona=40,
        max_nawrotow=30,
        horyzont_s=1.0,
        krok_wyjscia_s=0.01,
        integrator="trapez_niejawny",
        tolerancja_lokalizacji_zdarzen_s=None,
    )
    assert float(margines_arytmetyczny(dolne, gesty)[0]) == pytest.approx(
        1000.0 * float(margines_arytmetyczny(dolne, rzadki)[0]), rel=1e-12
    )
    zgrubny = margines_arytmetyczny(dolne, rzadki)
    assert float(zgrubny[1]) > float(zgrubny[0]), "ulp(0,95) > ulp(0,1) — margines idzie za skala"


def test_granica_nieskonczona_nie_wchodzi_do_marginesu() -> None:
    """Stan bez zakresu waznosci nie ma czego porownywac — margines zero, zero NaN."""
    margines = margines_arytmetyczny(np.array([-np.inf, np.inf, 0.5]), nastawy())
    assert float(margines[0]) == 0.0
    assert float(margines[1]) == 0.0
    assert float(margines[2]) > 0.0


def test_niezgodnosc_dlugosci_adresow_jest_bledem_programisty() -> None:
    dolne, gorne = wektory((BEZ_ZAKRESU, BEZ_ZAKRESU))
    with pytest.raises(AssertionError, match="adresow"):
        sprawdz_zakresy_waznosci(np.array([0.0, 1.0]), dolne, gorne, ("a_pu",), nastawy(), 0.0)
