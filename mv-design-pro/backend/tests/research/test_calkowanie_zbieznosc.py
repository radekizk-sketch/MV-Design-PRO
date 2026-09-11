"""Semantyka zbieżności kroku niejawnego: trzy stany, kryterium komponentowe.

PO CO TEN PLIK. Jądro Newtona zwracało sukces DWIEMA drogami — przy
``||r|| < tol*skala`` oraz przy zastoju z ``||r|| < 10^4 * tol*skala`` — i obie
wracały tą samą wartością (``x_next``, licznik ewaluacji). Wołający nie miał jak
ich rozróżnić. Zmierzone na HEAD przed naprawą: dla ``tol = 1e-9`` i podłogi
numerycznej ``f`` rzędu ``2e-5`` krok wracał jako SUKCES z residuum
``9,976e-07`` — 998 razy powyżej progu ścisłego — nieodróżnialnie od kroku, w
którym residuum wynosiło ``6,6e-14``.

Drugi defekt tej samej linijki: jeden próg BEZWZGLĘDNY dla stanów o różnych
jednostkach i rzędach. Dla wektora ``(delta=0,5 rad; omega=1,0 p.u.; soc=0,8;
efd=2,5 p.u.)`` próg wynosił ``2,5e-09`` dla KAŻDEJ współrzędnej, bo brał się z
największej z nich; stan bliski zeru miał go praktycznie nieosiągalnym.

Testy poniżej pilnują, że: (1) trzy stany są rozróżnialne, (2) zastój nie
przechodzi domyślnie, (3) kontynuacji po zastoju nie da się włączyć bez zapisu,
(4) kryterium jest komponentowe.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.calkowanie import (
    INTEGRATORY,
    BrakZbieznosciIntegratoraError,
    DziennikKrokow,
    EulerNiejawny,
    KryteriumZbieznosci,
    StatusKroku,
    TrapezNiejawny,
)
from numpy.typing import NDArray

# Układ liniowy, dobrze uwarunkowany — cała nietrywialność siedzi w jakości ``f``.
_A = np.array([[-2.0, 1.0], [1.0, -3.0]])
_X0 = np.array([1.0, -0.5])
_DT = 0.05


def _f_gladkie(x: NDArray[np.float64], t: float) -> NDArray[np.float64]:
    return _A @ x


def _f_z_podloga(eps: float):
    """``f`` z podłogą numeryczną ``eps``, nierozdzielczą dla różnicy przedniej.

    Odwzorowuje realną sytuację laboratorium: ``f`` ROZWIĄZUJE NUMERYCZNIE
    algebrę sieci, więc niesie błąd o skali tolerancji tamtego solvera, a błąd
    ten zmienia się nieciągle (zmiana liczby iteracji zagnieżdżonych).
    Częstotliwość ``1e13`` jest dobrana tak, by składnik był nierozdzielczy przy
    kroku różnicowym ``~1,5e-8``.
    """

    def f(x: NDArray[np.float64], t: float) -> NDArray[np.float64]:
        return _A @ x + eps * np.sin(1.0e13 * x)

    return f


def _f_bez_rozwiazania(x: NDArray[np.float64], t: float) -> NDArray[np.float64]:
    """Nieciągły ogranicznik — równanie niejawne NIE MA rozwiązania.

    To jest dokładnie defekt zmierzony na governorze przed naprawą: przy żądaniu
    ``1,8``, limicie ``1,2``, ``T = 0,5`` i ``dt = 0,5`` gałąź „poniżej limitu"
    wymaga ``x1 = 1,4`` (sprzeczność), a gałąź „na limicie" wymaga ``x1 = 1,0``
    (sprzeczność). Newton nie ma do czego zbiec.
    """
    return np.where(x >= 1.2, 0.0, (1.8 - x) / 0.5)


def _wykonaj(integrator, f, x=_X0, dt=_DT):
    """Zwróć sprawozdanie kroku niezależnie od tego, czy krok podniósł wyjątek."""
    try:
        _, wynik = integrator.krok_ze_sprawozdaniem(f, x, 0.0, dt)
    except BrakZbieznosciIntegratoraError:
        wynik = integrator.dziennik.wyniki[-1]
    return wynik


# ---------------------------------------------------------------------------
# 1. Trzy stany MUSZĄ być rozróżnialne
# ---------------------------------------------------------------------------


def test_prog_scisly_osiagniety_daje_strict_convergence() -> None:
    dziennik = DziennikKrokow()
    integrator = EulerNiejawny(dopuszczaj_zastoj=True, dziennik=dziennik)
    wynik = _wykonaj(integrator, _f_z_podloga(1.0e-9))
    assert wynik.status is StatusKroku.STRICT_CONVERGENCE
    assert wynik.strict_convergence is True
    assert wynik.rho <= 1.0
    assert dziennik.strict_convergence is True


def test_zastoj_na_podlodze_nie_jest_zbieznoscia_scisla() -> None:
    """TA SAMA ``f`` co wyżej, tylko żądana tolerancja poniżej podłogi ``f``.

    Rozróżnienie nie zależy od surowego residuum, lecz od tego, czy osiągnięto
    ŻĄDANĄ tolerancję: tutaj residuum jest MNIEJSZE niż w teście zbieżności
    ścisłej (``~7,9e-11`` wobec ``~9,9e-09``), a mimo to zbieżności ścisłej nie
    ma, bo żądano ``1e-14``.
    """
    dziennik = DziennikKrokow()
    integrator = EulerNiejawny(
        kryterium=KryteriumZbieznosci(atol=1.0e-14, rtol=1.0e-14),
        dopuszczaj_zastoj=True,
        dziennik=dziennik,
    )
    wynik = _wykonaj(integrator, _f_z_podloga(1.0e-9))
    assert wynik.status is StatusKroku.STAGNATED_AT_NUMERICAL_FLOOR
    assert wynik.strict_convergence is False
    assert wynik.rho > 1.0
    assert dziennik.strict_convergence is False
    assert "podłoga numeryczna" in wynik.przyczyna


def test_rozbieznosc_jest_odrozniona_od_zastoju() -> None:
    dziennik = DziennikKrokow()
    integrator = EulerNiejawny(dopuszczaj_zastoj=True, dziennik=dziennik)
    wynik = _wykonaj(integrator, _f_bez_rozwiazania, x=np.array([1.0]), dt=0.5)
    assert wynik.status is StatusKroku.FAILED
    assert wynik.strict_convergence is False
    assert dziennik.strict_convergence is False


def test_trzy_stany_daja_trzy_rozne_wartosci_statusu() -> None:
    """Iloczyn cech: ta sama rodzina przypadków musi dać TRZY różne statusy.

    Bez tego testu można by „naprawić" semantykę, zostawiając dwa stany
    nieosiągalne — a deklaracja bez osiągalności jest fałszywą pewnością.
    """
    statusy = {
        _wykonaj(
            EulerNiejawny(dopuszczaj_zastoj=True, dziennik=DziennikKrokow()),
            _f_z_podloga(1.0e-9),
        ).status,
        _wykonaj(
            EulerNiejawny(
                kryterium=KryteriumZbieznosci(atol=1.0e-14, rtol=1.0e-14),
                dopuszczaj_zastoj=True,
                dziennik=DziennikKrokow(),
            ),
            _f_z_podloga(1.0e-9),
        ).status,
        _wykonaj(
            EulerNiejawny(dopuszczaj_zastoj=True, dziennik=DziennikKrokow()),
            _f_bez_rozwiazania,
            x=np.array([1.0]),
            dt=0.5,
        ).status,
    }
    assert statusy == {
        StatusKroku.STRICT_CONVERGENCE,
        StatusKroku.STAGNATED_AT_NUMERICAL_FLOOR,
        StatusKroku.FAILED,
    }


# ---------------------------------------------------------------------------
# 2. Zastój nie może po cichu stać się dowodem
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("klasa", [EulerNiejawny, TrapezNiejawny])
def test_domyslnie_zastoj_nie_wraca_jako_sukces(klasa: type) -> None:
    """Domyślna konfiguracja ma być fail-closed dla OBU metod niejawnych."""
    integrator = klasa(kryterium=KryteriumZbieznosci(atol=1.0e-14, rtol=1.0e-14))
    with pytest.raises(BrakZbieznosciIntegratoraError, match="dopuszczaj_zastoj"):
        integrator.krok(_f_z_podloga(1.0e-9), _X0, 0.0, _DT)


@pytest.mark.parametrize("klasa", [EulerNiejawny, TrapezNiejawny])
def test_kontynuacji_po_zastoju_nie_da_sie_wlaczyc_bez_dziennika(klasa: type) -> None:
    """Mechanizm, nie zalecenie: bez dziennika zastój nie miałby gdzie zostawić śladu."""
    with pytest.raises(ValueError, match="wymaga dziennika"):
        klasa(dopuszczaj_zastoj=True)


def test_rozbieznosc_podnosi_wyjatek_takze_przy_dopuszczonym_zastoju() -> None:
    """FAILED zawsze zatrzymuje bieg — zgoda dotyczy zastoju, nie rozbieżności."""
    integrator = EulerNiejawny(dopuszczaj_zastoj=True, dziennik=DziennikKrokow())
    with pytest.raises(BrakZbieznosciIntegratoraError):
        integrator.krok(_f_bez_rozwiazania, np.array([1.0]), 0.0, 0.5)


def test_pusty_dziennik_nie_jest_dowodem_zbieznosci() -> None:
    """``all([])`` dałoby ciche ``True`` — czyli dowód z niczego."""
    assert DziennikKrokow().strict_convergence is False


def test_dziennik_traci_strict_gdy_chocby_jeden_krok_byl_zastojem() -> None:
    dziennik = DziennikKrokow()
    integrator = EulerNiejawny(dopuszczaj_zastoj=True, dziennik=dziennik)
    integrator.krok(_f_gladkie, _X0, 0.0, _DT)
    assert dziennik.strict_convergence is True
    zastoj = EulerNiejawny(
        kryterium=KryteriumZbieznosci(atol=1.0e-14, rtol=1.0e-14),
        dopuszczaj_zastoj=True,
        dziennik=dziennik,
    )
    zastoj.krok(_f_z_podloga(1.0e-9), _X0, 0.0, _DT)
    assert dziennik.strict_convergence is False
    assert len(dziennik.zastoje) == 1


# ---------------------------------------------------------------------------
# 3. Sprawozdanie niesie to, co ma nieść
# ---------------------------------------------------------------------------


def test_sprawozdanie_niesie_tolerancje_residuum_iteracje_i_jakobiany() -> None:
    dziennik = DziennikKrokow()
    kryterium = KryteriumZbieznosci(atol=1.0e-9, rtol=1.0e-7)
    integrator = EulerNiejawny(kryterium=kryterium, dopuszczaj_zastoj=True, dziennik=dziennik)
    _, wynik = integrator.krok_ze_sprawozdaniem(_f_gladkie, _X0, 0.0, _DT)
    assert wynik.kryterium == kryterium
    assert wynik.rho >= 0.0
    assert wynik.residuum_maks >= 0.0
    assert wynik.iteracje >= 1
    assert wynik.ewaluacje_jakobianu >= 1
    assert wynik.ewaluacje_f >= wynik.iteracje
    assert wynik.przyczyna.strip()


def test_licznik_ewaluacji_zgadza_sie_ze_starym_kontraktem_krok() -> None:
    """``krok`` nadal zwraca ``(x, ewaluacje)`` — sprawozdanie to DODATEK, nie zamiana."""
    integrator = EulerNiejawny()
    x_a, ewaluacje = integrator.krok(_f_gladkie, _X0, 0.0, _DT)
    x_b, wynik = integrator.krok_ze_sprawozdaniem(_f_gladkie, _X0, 0.0, _DT)
    assert ewaluacje == wynik.ewaluacje_f
    assert np.array_equal(x_a, x_b)


@pytest.mark.parametrize("nazwa", sorted(INTEGRATORY))
def test_kazdy_integrator_rejestru_umie_sprawozdanie(nazwa: str) -> None:
    """Także jawne — inaczej wołający musiałby wiedzieć, z jaką metodą rozmawia."""
    _, wynik = INTEGRATORY[nazwa].krok_ze_sprawozdaniem(_f_gladkie, _X0, 0.0, _DT)
    assert wynik.status is StatusKroku.STRICT_CONVERGENCE
    if INTEGRATORY[nazwa].jawny:
        assert wynik.iteracje == 0
        assert wynik.ewaluacje_jakobianu == 0
        assert "metoda jawna" in wynik.przyczyna


def test_rejestr_integratorow_jest_fail_closed_i_bezstanowy() -> None:
    """Instancje współdzielone nie mogą nieść zgody na zastój ani dziennika."""
    for nazwa, integrator in INTEGRATORY.items():
        if integrator.jawny:
            continue
        assert integrator.dopuszczaj_zastoj is False, nazwa
        assert integrator.dziennik is None, nazwa


# ---------------------------------------------------------------------------
# 4. Kryterium KOMPONENTOWE, nie jeden próg bezwzględny
# ---------------------------------------------------------------------------


def test_kryterium_daje_kazdemu_stanowi_wlasna_wage() -> None:
    """Kąt [rad], prędkość [p.u.], SOC [1] i SEM [p.u.] nie mogą dzielić progu."""
    kryterium = KryteriumZbieznosci(atol_na_stan=(1e-9, 1e-9, 1e-10, 1e-8), rtol=1e-7)
    x = np.array([0.5, 1.0, 0.8, 2.5])
    wagi = kryterium.wagi(x, x)
    assert len(set(np.round(wagi, 15))) == 4, "cztery stany, cztery różne wagi"
    assert wagi[3] > wagi[1] > wagi[0], "waga rośnie ze skalą stanu"


def test_skala_moze_pochodzic_z_deklaracji_modelu() -> None:
    """Model wie, jaka jest skala jego stanu — i może ją podać zamiast dynamiki kroku."""
    kryterium = KryteriumZbieznosci(skale_stanow=(1.0, 1.0, 1.0, 3.0))
    x = np.array([1.0e-6, 1.0e-6, 1.0e-6, 1.0e-6])
    wagi = kryterium.wagi(x, x)
    assert wagi[0] == pytest.approx(1.0e-9 + 1.0e-7 * 1.0)
    assert wagi[3] == pytest.approx(1.0e-9 + 1.0e-7 * 3.0)


def test_kryterium_odrzuca_deklaracje_niespojna_z_liczba_stanow() -> None:
    kryterium = KryteriumZbieznosci(skale_stanow=(1.0, 1.0))
    with pytest.raises(ValueError, match="skale_stanow"):
        kryterium.wagi(np.zeros(3), np.zeros(3))
    kryterium = KryteriumZbieznosci(atol_na_stan=(1.0e-9,))
    with pytest.raises(ValueError, match="atol_na_stan"):
        kryterium.wagi(np.zeros(3), np.zeros(3))


def test_kryterium_odrzuca_niedodatnie_tolerancje() -> None:
    with pytest.raises(ValueError):
        KryteriumZbieznosci(atol=0.0)
    with pytest.raises(ValueError):
        KryteriumZbieznosci(rtol=-1.0)
    with pytest.raises(ValueError):
        KryteriumZbieznosci(skale_stanow=(1.0, 0.0))


def test_maly_stan_nie_jest_badany_progiem_duzego_stanu() -> None:
    """Sedno defektu: próg brany z NAJWIĘKSZEGO stanu obowiązywał wszystkie.

    Residuum ``1e-8`` na stanie o skali ``1e-3`` przy stanie towarzyszącym o
    skali ``100`` nie może przechodzić tylko dlatego, że sąsiad jest duży.
    """
    kryterium = KryteriumZbieznosci(atol=1.0e-12, rtol=1.0e-7)
    x = np.array([1.0e-3, 100.0])
    residuum = np.array([1.0e-8, 0.0])
    assert kryterium.rho(residuum, x, x) > 1.0
    stary_prog = 1.0e-9 * max(1.0, float(np.max(np.abs(x))))
    assert (
        float(np.max(np.abs(residuum))) < stary_prog
    ), "dokumentacja defektu: stare kryterium bezwzględne przepuściłoby to residuum"
