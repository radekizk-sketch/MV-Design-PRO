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
    DT_KALIBRACJI_S,
    INTEGRATORY,
    PODLOGA_WAGI_EPS,
    BrakZbieznosciIntegratoraError,
    DziennikKrokow,
    EulerNiejawny,
    KryteriumZbieznosci,
    StatusKroku,
    TrapezNiejawny,
    wspolczynnik_kroku,
)
from dynamic_lab.wzorzec_trajektoria import (
    PrzypadekTrajektorii,
    dryf_niezmiennika,
    przebiegi_laboratorium,
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
    wagi = kryterium.wagi(x, x, dt=DT_KALIBRACJI_S, rzad=2)
    assert len(set(np.round(wagi, 15))) == 4, "cztery stany, cztery różne wagi"
    assert wagi[3] > wagi[1] > wagi[0], "waga rośnie ze skalą stanu"


def test_skala_moze_pochodzic_z_deklaracji_modelu() -> None:
    """Model wie, jaka jest skala jego stanu — i może ją podać zamiast dynamiki kroku."""
    kryterium = KryteriumZbieznosci(skale_stanow=(1.0, 1.0, 1.0, 3.0))
    x = np.array([1.0e-6, 1.0e-6, 1.0e-6, 1.0e-6])
    wagi = kryterium.wagi(x, x, dt=DT_KALIBRACJI_S, rzad=2)
    assert wagi[0] == pytest.approx(1.0e-9 + 1.0e-7 * 1.0)
    assert wagi[3] == pytest.approx(1.0e-9 + 1.0e-7 * 3.0)


def test_kryterium_odrzuca_deklaracje_niespojna_z_liczba_stanow() -> None:
    kryterium = KryteriumZbieznosci(skale_stanow=(1.0, 1.0))
    with pytest.raises(ValueError, match="skale_stanow"):
        kryterium.wagi(np.zeros(3), np.zeros(3), dt=DT_KALIBRACJI_S, rzad=2)
    kryterium = KryteriumZbieznosci(atol_na_stan=(1.0e-9,))
    with pytest.raises(ValueError, match="atol_na_stan"):
        kryterium.wagi(np.zeros(3), np.zeros(3), dt=DT_KALIBRACJI_S, rzad=2)


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
    assert kryterium.rho(residuum, x, x, dt=DT_KALIBRACJI_S, rzad=2) > 1.0
    stary_prog = 1.0e-9 * max(1.0, float(np.max(np.abs(x))))
    assert (
        float(np.max(np.abs(residuum))) < stary_prog
    ), "dokumentacja defektu: stare kryterium bezwzględne przepuściłoby to residuum"


# ---------------------------------------------------------------------------
# Tolerancja SKALOWANA KROKIEM — rząd metody osiągalny dla KAŻDEGO kroku
# ---------------------------------------------------------------------------


def test_wspolczynnik_kroku_jest_jednoscia_przy_kroku_kalibracji() -> None:
    """Kalibracja musi być punktem, w którym `atol` znaczy dokładnie `atol`."""
    assert wspolczynnik_kroku(DT_KALIBRACJI_S, rzad=2) == pytest.approx(1.0)
    assert wspolczynnik_kroku(DT_KALIBRACJI_S, rzad=4) == pytest.approx(1.0)


def test_wspolczynnik_kroku_zaostrza_tolerancje_wraz_z_krokiem() -> None:
    """Krótszy krok => ostrzejsza tolerancja, wykładnik = rzad + 1.

    To jest sedno naprawy: błąd rozwiązania równania kroku kumuluje się liniowo z
    LICZBĄ kroków, więc tolerancja stała sprawiała, że ZAGĘSZCZANIE KROKU
    POGARSZAŁO wynik. Skalowanie `dt^(rzad+1)` trzyma ten błąd poniżej błędu
    obcięcia niezależnie od `dt`.
    """
    assert wspolczynnik_kroku(DT_KALIBRACJI_S / 2, rzad=2) == pytest.approx(1.0 / 8.0)
    assert wspolczynnik_kroku(DT_KALIBRACJI_S / 4, rzad=2) == pytest.approx(1.0 / 64.0)
    # Metoda wyższego rzędu wymaga OSTRZEJSZEJ tolerancji przy tym samym kroku,
    # bo jej błąd obcięcia jest mniejszy — luźniejsza zjadłaby cały jej zysk.
    assert wspolczynnik_kroku(DT_KALIBRACJI_S / 2, rzad=4) < wspolczynnik_kroku(
        DT_KALIBRACJI_S / 2, rzad=2
    )


def test_wspolczynnik_kroku_odrzuca_dane_bez_sensu() -> None:
    with pytest.raises(ValueError, match="Krok musi być dodatni"):
        wspolczynnik_kroku(0.0, rzad=2)
    with pytest.raises(ValueError, match="Rząd metody"):
        wspolczynnik_kroku(0.001, rzad=0)


def test_waga_nie_schodzi_ponizej_podlogi_zaokraglen() -> None:
    """Skalowanie nie może zażądać dokładności poniżej szumu reprezentacji.

    Bez podłogi krok dostatecznie krótki dawałby wagę poniżej ``eps``, czyli
    warunek niespełnialny — a wtedy KAŻDY krok byłby meldowany jako zastój i
    naprawa rzędu metody zamieniłaby się w awarię biegu.
    """
    kryterium = KryteriumZbieznosci(atol=1.0e-9, rtol=1.0e-7)
    x = np.array([1.0, 2.0])
    podloga = PODLOGA_WAGI_EPS * float(np.finfo(np.float64).eps) * np.maximum(np.abs(x), 1.0)
    wagi = kryterium.wagi(x, x, dt=1.0e-9, rzad=4)
    assert np.all(wagi >= podloga * (1.0 - 1.0e-12))
    assert np.all(np.isfinite(wagi))


def test_rzad_trapezu_jest_osiagalny_po_zageszczeniu_kroku() -> None:
    """POMIAR, nie deklaracja: połowienie kroku daje ~4x mniejszy błąd trapezu.

    ZAPADKA NA DEFEKT, KTÓRY TA ZMIANA USUWA. Przy wadze STAŁEJ błąd trapezu na
    tym zagadnieniu ROSŁ przy zagęszczaniu kroku. Zmierzony dryf całki pierwszej
    (SMIB, D = 0, horyzont 4 s), kroki 4/2/1/0,5 ms::

        waga stała:      2,545e-08  6,365e-09  7,569e-06  1,545e-05
                         ilorazy:      4,00       0,00       0,49
        waga skalowana:  2,545e-08  6,365e-09  1,591e-09  3,979e-10
                         ilorazy:      4,00       4,00       4,00

    Metoda deklarująca ``rzad = 2`` zachowywała się więc miejscami jak metoda o
    rzędzie UJEMNYM, a żaden test tego nie widział.

    DLACZEGO SONDA WYGLĄDA WŁAŚNIE TAK — trzy próby, dwie ODRZUCONE jako ślepe:

    1. Oscylator harmoniczny z rozwiązaniem zamkniętym: ZMIERZONO identyczne
       wyniki przed naprawą i po niej (błędy 2,134e-06 … 5,216e-10, ilorazy 16,00
       w obu przypadkach). Dla zagadnienia LINIOWEGO Newton trafia w rozwiązanie
       w jednej iteracji z dokładnością zaokrągleń, więc tolerancja NIGDY nie
       wiąże i defekt jest niewidoczny.
    2. Wahadło nieliniowe z zachowaną energią: również bez różnicy (dryf
       3,386e-04 … 5,294e-06, ilorazy 4,00 w obu przypadkach). Newton zbiega
       kwadratowo, więc pierwsza iteracja spełniająca ``rho <= 1`` schodzi zwykle
       DUŻO poniżej progu — przy analitycznej ``f`` residuum ląduje przy
       zaokrągleniach niezależnie od tolerancji.
    3. REALNY silnik: ``f`` rozwiązuje algebrę sieci, więc niesie własny szum na
       poziomie tolerancji tamtego solvera, a jakobian liczony różnicą przednią
       ten szum wzmacnia (patrz „DRABINA TOLERANCJI" w ``_newton_niejawny``).
       Dopiero tutaj residuum osiągalne jest porównywalne z progiem, więc próg
       naprawdę rozstrzyga — i dopiero tutaj sonda widzi defekt.

    Punkty 1 i 2 zostawiono w tym opisie celowo: test, który przechodzi zarówno
    z defektem, jak i bez niego, jest gorszy niż brak testu, bo wyłącza czujność.

    WYROCZNIA JEST ANALITYCZNA, NIE NARZĘDZIOWA: całka pierwsza maszyny
    klasycznej przy ``D = 0``. Ten test nie potrzebuje ANDES i nie jest pomijany,
    gdy wzorca nie ma.
    """
    przypadek = PrzypadekTrajektorii()
    # Punkt pracy podany WPROST — sonda bada całkowanie, nie zgodność rozpływów.
    q_gen_pu = 0.01877644271298366

    dryfy: list[float] = []
    for krok_s in (0.004, 0.002, 0.001):
        przebiegi, delta0 = przebiegi_laboratorium(
            przypadek, q_gen_pu=q_gen_pu, krok_s=krok_s, integrator="trapez_niejawny"
        )
        dryfy.append(
            dryf_niezmiennika(
                przypadek, przebiegi, zrodlo="sonda", krok_s=krok_s, delta0_rad=delta0
            ).maks_dryf_bezwzgledny
        )

    ilorazy = [a / b for a, b in zip(dryfy[:-1], dryfy[1:], strict=True)]
    assert all(i > 3.0 for i in ilorazy), (
        f"Iloraz dryfu całki pierwszej przy połowieniu kroku {ilorazy} — rząd 2 "
        f"wymaga ~4. Dryf: {dryfy}. Wartość poniżej 3 znaczy, że błąd rozwiązania "
        f"równania kroku wyszedł ponad błąd obcięcia, czyli że tolerancja przestała "
        f"być skalowana krokiem."
    )


def test_rzad_rk4_jest_MIERZONY_na_drabinie_a_nie_czytany_z_etykiety() -> None:
    """Rząd metody = POMIAR na drabinie kroku, nigdy pole ``rzad``.

    ZAPADKA NA MUTANTA C RECENZJI NIEZALEŻNEJ (P1-DELTA-19). Podmiana
    ``Rk4.krok`` na metodę punktu środkowego (rząd 2) przy POZOSTAWIENIU
    deklaracji ``rzad = 4`` przeżyła kampanię i wszystkie testy autora na
    1ff13df9; recenzent zmierzył wtedy rzędy 2,055 / 2,027 / 2,014.

    Etykieta ``rzad`` jest DEKLARACJĄ i nie może być dowodem sama dla siebie —
    to ta sama reguła, przez którą odcisk implementacji liczy się z treści
    plików, a nie z numeru wersji. Tutaj rząd wychodzi z pomiaru dryfu całki
    pierwszej maszyny klasycznej (wyrocznia ANALITYCZNA, bez ANDES).

    ZMIERZONE, obie strony:

        rk4 prawdziwe:   4 ms -> 5,20e-11   2 ms -> 1,66e-12   1 ms -> 4,46e-14
                         ilorazy: 31,33  37,19
        rk4 zmutowane
        (punkt środkowy): 4 ms -> 9,17e-07  2 ms -> 1,14e-07  1 ms -> 1,42e-08
                         ilorazy:  8,03   8,05

    PIERWSZY PRÓG BYŁ ZA LUŹNY I TO JEST ZMIERZONE. Postawiłem go na 8,
    rozumując „metoda rzędu 2 daje iloraz ≈4". Mutant dał 8,03 — czyli przeszedł
    o trzy setne. Powód: dryf CAŁKI dla punktu środkowego skaluje się tu jak
    ``dt^3``, o rząd lepiej niż jego błąd rozwiązania. Wniosek ogólny: progu dla
    metody rzędu p nie wolno wyprowadzać z rzędu BŁĘDU ROZWIĄZANIA, bo mierzona
    wielkość ma własny rząd — trzeba go ZMIERZYĆ po obu stronach.

    Próg 16 (= 2^4) leży w środku zmierzonej luki: prawdziwe rk4 ma zapas ~2x w
    górę (31 i 37), mutant ~2x w dół (8,0). Dodatkowo sprawdzana jest SAMA
    WIELKOŚĆ dryfu — sześć rzędów różnicy (4,46e-14 wobec 1,42e-08) rozdziela te
    przypadki znacznie pewniej niż jakikolwiek iloraz.
    """
    przypadek = PrzypadekTrajektorii()
    q_gen_pu = 0.01877644271298366

    dryfy: list[float] = []
    for krok_s in (0.004, 0.002, 0.001):
        przebiegi, delta0 = przebiegi_laboratorium(
            przypadek, q_gen_pu=q_gen_pu, krok_s=krok_s, integrator="rk4"
        )
        dryfy.append(
            dryf_niezmiennika(
                przypadek, przebiegi, zrodlo="sonda-rk4", krok_s=krok_s, delta0_rad=delta0
            ).maks_dryf_bezwzgledny
        )

    ilorazy = [a / b for a, b in zip(dryfy[:-1], dryfy[1:], strict=True)]
    assert all(i > 16.0 for i in ilorazy), (
        f"Ilorazy dryfu przy połowieniu kroku {ilorazy} dla metody deklarującej "
        f"rząd 4. Wartość ≈8 znaczy, że działa metoda rzędu 2 pod etykietą rzędu 4 "
        f"(zmierzone dla punktu środkowego: 8,03 i 8,05). Dryf: {dryfy}."
    )
    # WIELKOŚĆ, nie tylko tempo. Iloraz mówi o rzędzie, ale metoda o poprawnym
    # rzędzie i sześć rzędów gorszej dokładności też jest defektem.
    assert dryfy[-1] < 1.0e-12, (
        f"Dryf całki pierwszej przy 1 ms wynosi {dryfy[-1]:.3e}; prawdziwe rk4 daje "
        f"4,46e-14, a metoda rzędu 2 pod etykietą rzędu 4 dała 1,42e-08."
    )


def test_skalowanie_tolerancji_NIGDY_nie_luzuje_powyzej_nominalu() -> None:
    """Zapadka na kontrprzykład recenzji: krok duży nie może kupować tolerancji.

    ZMIERZONE PRZED NAPRAWĄ (``x' = -x``, ``x0 = 1``, ``dt = 1 s``, trapez)::

        wspolczynnik_kroku(1,0; 2) = 8,000e+06
        waga efektywna             = 0,808
        x1 zwrócone                = 0,0        (czysty predyktor!)
        x1 dokładne                = 1/3
        |residuum|                 = 0,5
        status                     = STRICT_CONVERGENCE

    Krok, który nie rozwiązał równania w ogóle, meldował zbieżność ŚCISŁĄ —
    defekt wprowadzony przez naprawę rzędu metody, dokładnie tej klasy, którą
    plan naprawy §2 miał zamknąć.

    ``atol``/``rtol`` są tolerancją NAJLUŹNIEJSZĄ dopuszczalną; krok dłuższy od
    kalibracyjnego nie jest powodem, żeby przyjąć większe residuum.
    """
    assert wspolczynnik_kroku(DT_KALIBRACJI_S * 200.0, rzad=2) == 1.0
    assert wspolczynnik_kroku(DT_KALIBRACJI_S * 2.0, rzad=4) == 1.0
    assert wspolczynnik_kroku(DT_KALIBRACJI_S, rzad=2) == pytest.approx(1.0)

    def f(x: NDArray[np.float64], t: float) -> NDArray[np.float64]:
        return -x

    x1, sprawozdanie = TrapezNiejawny().krok_ze_sprawozdaniem(
        f, np.array([1.0], dtype=np.float64), 0.0, 1.0
    )
    # Równanie kroku trapezu dla x'=-x: x1 = x0 + dt/2 (−x0 − x1) => x1 = 1/3.
    assert float(x1[0]) == pytest.approx(1.0 / 3.0, rel=1e-9), (
        f"x1 = {float(x1[0])!r}; wartość 0,0 znaczy, że iteracja została na "
        f"predyktorze, a mimo to zameldowała zbieżność."
    )
    assert sprawozdanie.status is StatusKroku.STRICT_CONVERGENCE
    assert sprawozdanie.rho <= 1.0
