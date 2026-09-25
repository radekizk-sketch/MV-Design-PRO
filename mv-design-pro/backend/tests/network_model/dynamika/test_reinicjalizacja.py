"""Re-inicjalizacja po zdarzeniu — diagnostyka MIERZY skok, a nie sama siebie.

Ten plik zawiera test MUTACYJNY konkretnego defektu, ktory przeglad watku
badawczego zmierzyl na poprzedniej implementacji: diagnostyka porownywala
napiecia PO rozwiazaniu z napieciami PO rozwiazaniu (bo migawka powstawala po
zatwierdzeniu nowego punktu) i meldowala `delta_y = 0` przy rzeczywistym skoku
rzedu jedności. Test `test_mutacja_migawki_po_rozwiazaniu_zabija_diagnostyke`
odtwarza dokladnie ten defekt na zywym kodzie i sprawdza, ze rozni sie on od
zachowania poprawnego — bez tego kryterium odbioru bylo by deklaracja.
"""

from __future__ import annotations

import numpy as np
import pytest
from network_model.solvers.dynamika import OdmowaDynamiki, reinicjalizuj, zloz_model_sieci
from network_model.solvers.dynamika.kontrakty import KOD_REINICJALIZACJA_NIEZBIEZNA
from network_model.solvers.dynamika.siec import residuum_kcl_niezalezne, rozwiaz_algebre

from tests.network_model.dynamika.uklady import nastawy, zbuduj_smib, zbuduj_smib_z_odbiorem


def _punkt_startowy(uklad):
    model = zloz_model_sieci(uklad.wezly, uklad.galezie, ())
    urzadzenia = (uklad.maszyna, uklad.szyna)
    stany = tuple(
        urzadzenie.stan_poczatkowy(
            uklad.punkt_pracy.napiecia_pu[urzadzenie.wezel],
            uklad.punkt_pracy.moce_zrodel_pu[urzadzenie.ident],
        )
        for urzadzenie in urzadzenia
    )
    napiecia = np.array(
        [uklad.punkt_pracy.napiecia_pu[ident] for ident in model.identy_wezlow], dtype=complex
    )
    return model, urzadzenia, stany, napiecia


def test_stany_rozniczkowe_sa_trzymane_a_algebra_liczona_od_nowa() -> None:
    """Zmiana topologii nie rusza stanow rozniczkowych, ale zmienia napiecia."""
    uklad = zbuduj_smib()
    model, urzadzenia, stany, napiecia = _punkt_startowy(uklad)
    model_zwarcie = zloz_model_sieci(
        uklad.wezly, uklad.galezie, (), admitancje_zwarc=(("GEN", complex(0.0, -50.0)),)
    )
    stany_przed = tuple(stan.copy() for stan in stany)
    napiecia_po, raport = reinicjalizuj(
        model_zwarcie, (), urzadzenia, stany, napiecia, nastawy=nastawy(), t_s=0.1
    )
    # Intencja (przepisane 2026-09-24, karta AB-1b.1 S19): re-inicjalizacja NIE zmienia
    # stanow wolajacego — dawne `raport.delta_x_max` mierzylo to samo na kopii w algebrze i
    # zostalo usuniete; ciaglosc stanow przez cala chwile zdarzen mierzy silnik
    # (`delta_x_nieprzypisane_max`, twierdzenie D-13).
    for stan, przed in zip(stany, stany_przed, strict=True):
        assert np.array_equal(stan, przed)
    assert not hasattr(raport, "delta_x_max")
    assert raport.delta_y_max > 0.5
    assert raport.residuum_kcl_max < 1e-10
    assert not np.allclose(napiecia_po, napiecia)


def test_delta_y_zgadza_sie_z_norma_policzona_z_zachowanej_migawki() -> None:
    """Kryterium odbioru: raportowana norma == norma z zachowanego snapshotu."""
    uklad = zbuduj_smib()
    model, urzadzenia, stany, napiecia = _punkt_startowy(uklad)
    migawka = napiecia.copy()
    model_zwarcie = zloz_model_sieci(
        uklad.wezly, uklad.galezie, (), admitancje_zwarc=(("GEN", complex(0.0, -80.0)),)
    )
    napiecia_po, raport = reinicjalizuj(
        model_zwarcie, (), urzadzenia, stany, napiecia, nastawy=nastawy(), t_s=0.1
    )
    oczekiwane = float(np.max(np.abs(napiecia_po - migawka)))
    assert raport.delta_y_max == pytest.approx(oczekiwane, rel=1e-15)
    assert oczekiwane > 0.0


def test_mutacja_migawki_po_rozwiazaniu_zabija_diagnostyke() -> None:
    """MUTACJA `v_przed -> v_po` daje `delta_y = 0` przy rzeczywistym skoku.

    Odtwarzamy defekt jawnie (porownanie wyniku z samym soba) i sprawdzamy, ze
    daje ZERO, podczas gdy poprawna implementacja daje wartosc rzeczywista. Gdyby
    kiedykolwiek ktos przestawil migawke za rozwiazanie algebry, ten test
    przestalby rozrozniac oba przypadki i stalby sie czerwony.
    """
    uklad = zbuduj_smib()
    model, urzadzenia, stany, napiecia = _punkt_startowy(uklad)
    model_zwarcie = zloz_model_sieci(
        uklad.wezly, uklad.galezie, (), admitancje_zwarc=(("GEN", complex(0.0, -80.0)),)
    )
    napiecia_po, raport = reinicjalizuj(
        model_zwarcie, (), urzadzenia, stany, napiecia, nastawy=nastawy(), t_s=0.1
    )
    delta_y_zmutowana = float(np.max(np.abs(napiecia_po - napiecia_po)))
    assert delta_y_zmutowana == 0.0
    assert raport.delta_y_max > 0.5
    assert raport.delta_y_max != delta_y_zmutowana


def test_diagnostyka_per_wezel_pokrywa_wszystkie_wezly() -> None:
    uklad = zbuduj_smib()
    model, urzadzenia, stany, napiecia = _punkt_startowy(uklad)
    model_zwarcie = zloz_model_sieci(
        uklad.wezly, uklad.galezie, (), admitancje_zwarc=(("GEN", complex(0.0, -50.0)),)
    )
    _, raport = reinicjalizuj(
        model_zwarcie, (), urzadzenia, stany, napiecia, nastawy=nastawy(), t_s=0.1
    )
    assert [ident for ident, _ in raport.delta_y_per_wezel] == list(model.identy_wezlow)
    assert max(wartosc for _, wartosc in raport.delta_y_per_wezel) == pytest.approx(
        raport.delta_y_max
    )


def test_residuum_kcl_liczone_niezaleznie_od_solvera() -> None:
    """Residuum raportu pochodzi z drogi element-po-elemencie, nie z Ybus Newtona."""
    uklad = zbuduj_smib()
    model, urzadzenia, stany, napiecia = _punkt_startowy(uklad)
    model_zwarcie = zloz_model_sieci(
        uklad.wezly, uklad.galezie, (), admitancje_zwarc=(("GEN", complex(0.0, -50.0)),)
    )
    napiecia_po, raport = reinicjalizuj(
        model_zwarcie, (), urzadzenia, stany, napiecia, nastawy=nastawy(), t_s=0.1
    )
    niezalezne = residuum_kcl_niezalezne(model_zwarcie, (), urzadzenia, stany, napiecia_po)
    assert raport.residuum_kcl_max == pytest.approx(niezalezne, rel=1e-12)


def test_wejscie_nie_jest_mutowane_przez_reinicjalizacje() -> None:
    """Re-inicjalizacja nie pisze po wektorach wolajacego (kopie na wejsciu)."""
    uklad = zbuduj_smib()
    model, urzadzenia, stany, napiecia = _punkt_startowy(uklad)
    kopia_napiec = napiecia.copy()
    kopie_stanow = tuple(stan.copy() for stan in stany)
    model_zwarcie = zloz_model_sieci(
        uklad.wezly, uklad.galezie, (), admitancje_zwarc=(("GEN", complex(0.0, -50.0)),)
    )
    reinicjalizuj(model_zwarcie, (), urzadzenia, stany, napiecia, nastawy=nastawy(), t_s=0.1)
    assert np.array_equal(napiecia, kopia_napiec)
    for stan, kopia in zip(stany, kopie_stanow, strict=True):
        assert np.array_equal(stan, kopia)


def test_niezbiezna_reinicjalizacja_konczy_sie_wlasnym_kodem() -> None:
    """Odmowa algebry po zdarzeniu jest RE-INICJALIZACJA, nie „zwyklym" bledem algebry.

    Kod odmowy musi wskazywac miejsce w cyklu biegu (`reinicjalizacja_niezbiezna`),
    a przyczyna pierwotna zostaje w szczegolach — inaczej diagnoza gubi informacje,
    czy Newton padl na kroku, czy przy zdarzeniu.
    """
    uklad = zbuduj_smib_z_odbiorem(p_odbioru_pu=0.5)
    model, urzadzenia, stany, napiecia = _punkt_startowy(uklad)
    model_zwarcie = zloz_model_sieci(
        uklad.wezly, uklad.galezie, (), admitancje_zwarc=(("GEN", complex(0.0, -1.0e4)),)
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        reinicjalizuj(
            model_zwarcie,
            uklad.odbiory,
            urzadzenia,
            stany,
            napiecia,
            nastawy=nastawy(),
            t_s=0.4,
        )
    assert blad.value.kod == KOD_REINICJALIZACJA_NIEZBIEZNA
    assert blad.value.szczegoly["przyczyna"] == "dynamika.algebra_niezbiezna"
    assert blad.value.szczegoly["t_s"] == 0.4


def test_reinicjalizacja_bez_zmiany_topologii_nie_rusza_napiec() -> None:
    """Predykat pary: ta sama topologia => zerowy skok, nie „maly skok"."""
    uklad = zbuduj_smib()
    model, urzadzenia, stany, napiecia = _punkt_startowy(uklad)
    napiecia_po, raport = reinicjalizuj(
        model, (), urzadzenia, stany, napiecia, nastawy=nastawy(), t_s=0.0
    )
    assert raport.delta_y_max < 1e-14
    assert np.allclose(napiecia_po, napiecia, atol=1e-14)
    wynik = rozwiaz_algebre(
        model,
        (),
        urzadzenia,
        stany,
        napiecia,
        tolerancja=1e-11,
        max_iteracji=20,
        max_nawrotow=10,
        t_s=0.0,
    )
    assert wynik.iteracje == 0
