"""Semantyka zbieżności DOJEŻDŻA DO WYNIKU — ``zbiegl`` to za mało.

PO CO TEN PLIK. Jądro Newtona rozróżnia od niedawna trzy stany kroku
(``STRICT_CONVERGENCE`` / ``STAGNATED_AT_NUMERICAL_FLOOR`` / ``FAILED``), ale
`SilnikRMS` wołał ``integrator.krok`` — czyli wariant BEZ sprawozdania — więc
rozróżnienie ginęło na granicy warstw. Wynik deklarował ``zbiegl = True``
zarówno dla biegu, w którym każdy krok osiągnął żądaną tolerancję, jak i dla
biegu kontynuowanego po zastoju z residuum powyżej progu. Mechanizm istniał,
ale bieg produkcyjny laboratorium go nie używał — to jest dokładnie ta klasa
długu, którą zasada „funkcja żyjąca tylko w testach" nazywa po imieniu.

Zmierzone na kodzie sprzed naprawy (siatka 410 przypadków: 2 integratory ×
5 kroków × 41 poziomów podłogi numerycznej ``f``): 93 biegi zwróciły SUKCES z
residuum powyżej progu ścisłego, największe ``1,2494e-06`` przy progu
``1,0e-09`` — 1249 razy powyżej tolerancji, nieodróżnialnie od kroku z
residuum ``2,8e-17``.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.calkowanie import (
    DT_KALIBRACJI_S,
    INTEGRATORY,
    DziennikKrokow,
    EulerNiejawny,
    KryteriumZbieznosci,
    TrapezNiejawny,
)
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import MaszynaSynchroniczna4Rzedu, ZespolSynchroniczny
from dynamic_lab.wynik import DiagnostykaSolvera, KompletnoscPrzebiegu

INTEGRATORY_TESTOWANE = ("euler_jawny", "rk4", "euler_niejawny", "trapez_niejawny")


def _model() -> ModelDynamiczny:
    return ModelDynamiczny(
        topologia=TopologiaSieci(
            szyny=("GEN", "MID", "SYS"),
            galezie=[Galaz("GEN", "MID", 0.01, 0.08), Galaz("MID", "SYS", 0.01, 0.05)],
            szyny_sztywne={"SYS": complex(1.0, 0.0)},
        ),
        urzadzenia=[
            ZespolSynchroniczny(
                maszyna=MaszynaSynchroniczna4Rzedu(ref="G1", szyna="GEN", h_s=4.0, d_tlumienie=1.0),
                avr=RegulatorNapiecia(),
                governor=RegulatorTurbiny(),
            )
        ],
    )


def _bieg(integrator, krok_s: float = 0.005, czas_s: float = 0.5):
    silnik = SilnikRMS(_model(), integrator=integrator, krok_s=krok_s)
    x0 = silnik.inicjalizuj({"G1": complex(0.6, 0.2)})
    return silnik, silnik.symuluj(x0, czas_koncowy_s=czas_s)


@pytest.mark.parametrize("integrator", INTEGRATORY_TESTOWANE)
def test_kazdy_przyjety_krok_ma_sprawozdanie(integrator: str) -> None:
    """Liczba sprawozdań = liczba kroków. Bez tego „wszystkie ścisłe" nie ma sensu."""
    _, wynik = _bieg(integrator)
    d = wynik.diagnostyka
    assert d.kroki_scisle_zbiezne + d.kroki_na_podlodze_numerycznej == d.liczba_krokow
    assert d.liczba_krokow > 0


@pytest.mark.parametrize("integrator", INTEGRATORY_TESTOWANE)
def test_bieg_zdrowy_jest_scisle_zbiezny_w_kazdym_kroku(integrator: str) -> None:
    """Na dobrze uwarunkowanym układzie żaden krok nie staje na podłodze."""
    _, wynik = _bieg(integrator)
    d = wynik.diagnostyka
    assert d.kroki_na_podlodze_numerycznej == 0
    assert d.kazdy_krok_scisle_zbiezny is True
    assert d.najgorsze_rho <= 1.0


def test_metoda_jawna_ma_kazdy_krok_scisly_z_definicji() -> None:
    """Metoda jawna nie rozwiązuje równania nieliniowego — nie ma czego nie domknąć."""
    _, wynik = _bieg("rk4")
    d = wynik.diagnostyka
    assert d.kroki_scisle_zbiezne == d.liczba_krokow
    assert d.najgorsze_rho == 0.0


def test_zbiegl_nie_wystarcza_do_orzeczenia_o_tolerancji() -> None:
    """``zbiegl=True`` przy krokach na podłodze NIE znaczy „spełnia tolerancję".

    Kontrakt sprawdzamy na samym typie, bo tylko tak da się zbudować kombinację,
    której dobrze uwarunkowany układ nie wyprodukuje: bieg zakończony bez wyjątku,
    ale z krokami powyżej progu.
    """
    d = DiagnostykaSolvera(
        integrator="euler_niejawny",
        krok_s=0.01,
        liczba_krokow=10,
        ewaluacje_pochodnych=40,
        maks_residuum_sieci=1.0e-13,
        maks_iteracji_sieci=3,
        zbiegl=True,
        norma_pochodnej_w_t0=0.0,
        czas_zadany_s=0.1,
        czas_osiagniety_s=0.1,
        kroki_scisle_zbiezne=7,
        kroki_na_podlodze_numerycznej=3,
        najgorsze_rho=997.6,
    )
    assert d.zbiegl is True
    assert d.kazdy_krok_scisle_zbiezny is False
    assert d.to_dict()["kroki_na_podlodze_numerycznej"] == 3


def test_licznik_krokow_nie_moze_sie_rozjechac_ze_sprawozdaniami() -> None:
    """Predykaty parami: liczba kroków i liczba sprawozdań z jednego źródła prawdy."""
    with pytest.raises(ValueError, match="MUSI mieć sprawozdanie"):
        DiagnostykaSolvera(
            integrator="rk4",
            krok_s=0.01,
            liczba_krokow=10,
            ewaluacje_pochodnych=40,
            maks_residuum_sieci=0.0,
            maks_iteracji_sieci=1,
            zbiegl=True,
            norma_pochodnej_w_t0=0.0,
            czas_zadany_s=0.1,
            czas_osiagniety_s=0.1,
            kroki_scisle_zbiezne=4,
            kroki_na_podlodze_numerycznej=0,
        )


def test_rho_ponad_prog_bez_zadnego_zastoju_jest_sprzecznoscia() -> None:
    """Status kroku i osiągnięte rho muszą pochodzić z TEGO SAMEGO sprawozdania."""
    with pytest.raises(ValueError, match="tego samego sprawozdania"):
        DiagnostykaSolvera(
            integrator="rk4",
            krok_s=0.01,
            liczba_krokow=5,
            ewaluacje_pochodnych=20,
            maks_residuum_sieci=0.0,
            maks_iteracji_sieci=1,
            zbiegl=True,
            norma_pochodnej_w_t0=0.0,
            czas_zadany_s=0.05,
            czas_osiagniety_s=0.05,
            kroki_scisle_zbiezne=5,
            kroki_na_podlodze_numerycznej=0,
            najgorsze_rho=12.0,
        )


def test_bieg_przerwany_nie_musi_miec_sprawozdania_na_kazdy_krok() -> None:
    """Krok, który padł, sprawozdania nie wnosi — i to nie jest niespójność."""
    d = (
        DiagnostykaSolvera(
            integrator="euler_niejawny",
            krok_s=0.01,
            liczba_krokow=10,
            ewaluacje_pochodnych=12,
            maks_residuum_sieci=1.0,
            maks_iteracji_sieci=50,
            zbiegl=False,
            norma_pochodnej_w_t0=0.0,
            blad=None,  # uzupełnione niżej
            czas_zadany_s=0.1,
            czas_osiagniety_s=0.03,
            kompletnosc=KompletnoscPrzebiegu.PRZERWANY_BLEDEM,
            kroki_scisle_zbiezne=3,
            kroki_na_podlodze_numerycznej=0,
        )
        if False
        else None
    )
    # `blad=None` przy `zbiegl=False` jest odrzucane osobnym niezmiennikiem,
    # więc budujemy poprawny obiekt:
    from dynamic_lab.wynik import BladSolvera

    d = DiagnostykaSolvera(
        integrator="euler_niejawny",
        krok_s=0.01,
        liczba_krokow=10,
        ewaluacje_pochodnych=12,
        maks_residuum_sieci=1.0,
        maks_iteracji_sieci=50,
        zbiegl=False,
        norma_pochodnej_w_t0=0.0,
        blad=BladSolvera(
            klasa="BrakZbieznosciIntegratoraError",
            komunikat="rozjazd",
            faza="calkowanie",
            czas_s=0.03,
            krok_s=0.01,
            numer_kroku=3,
            residuum_sieci=1.0,
            stan_skonczony=True,
        ),
        czas_zadany_s=0.1,
        czas_osiagniety_s=0.03,
        kompletnosc=KompletnoscPrzebiegu.PRZERWANY_BLEDEM,
        kroki_scisle_zbiezne=3,
        kroki_na_podlodze_numerycznej=0,
    )
    assert d.kazdy_krok_scisle_zbiezny is False, "bieg przerwany nie spełnia tolerancji"


def test_zgoda_na_zastoj_jest_czescia_tozsamosci_biegu() -> None:
    """Ten sam model i krok, inna zgoda na zastój = INNY odcisk scenariusza.

    Bez tego pod dowód o tolerancji ścisłej można podstawić bieg tolerancyjny.
    """
    dziennik = DziennikKrokow()
    scisly = SilnikRMS(_model(), integrator=EulerNiejawny(), krok_s=0.01)
    tolerancyjny = SilnikRMS(
        _model(),
        integrator=EulerNiejawny(dopuszczaj_zastoj=True, dziennik=dziennik),
        krok_s=0.01,
    )
    x0 = scisly.inicjalizuj({"G1": complex(0.6, 0.2)})
    x0b = tolerancyjny.inicjalizuj({"G1": complex(0.6, 0.2)})
    assert np.array_equal(x0, x0b)
    a = scisly.symuluj(x0, czas_koncowy_s=0.3)
    b = tolerancyjny.symuluj(x0b, czas_koncowy_s=0.3)
    assert a.odcisk_scenariusza != b.odcisk_scenariusza


def test_kryterium_komponentowe_nie_zeruje_sie_dla_stanu_bliskiego_zeru() -> None:
    """Próg jednego stanu nie może brać się z rzędu wielkości innego stanu.

    Wektor laboratorium miesza radiany, p.u. i liczby niemianowane; jeden próg
    BEZWZGLĘDNY wzięty z największej współrzędnej czyni próg stanu bliskiego zeru
    praktycznie nieosiągalnym.
    """
    kryterium = KryteriumZbieznosci()
    x = np.array([0.5, 1.0, 0.8, 2.5])
    maly = np.array([1.0e-12, 1.0, 0.8, 2.5])
    wagi_duze = kryterium.wagi(x, x, dt=DT_KALIBRACJI_S, rzad=2)
    wagi_male = kryterium.wagi(maly, maly, dt=DT_KALIBRACJI_S, rzad=2)
    assert wagi_male[0] < wagi_duze[0]
    assert wagi_male[0] > 0.0


def test_integratory_z_rejestru_sa_bezstanowe() -> None:
    """Współdzielenie instancji rejestru między biegami nie może wnosić stanu."""
    for nazwa in ("euler_niejawny", "trapez_niejawny"):
        integrator = INTEGRATORY[nazwa]
        assert integrator.dopuszczaj_zastoj is False  # type: ignore[attr-defined]
        assert integrator.dziennik is None  # type: ignore[attr-defined]


def test_zastoj_bez_dziennika_jest_odrzucany_przy_budowie() -> None:
    """Kontynuacja po zastoju wymaga ZAPISU — inaczej bieg nie ma jak o tym powiedzieć."""
    for klasa in (EulerNiejawny, TrapezNiejawny):
        with pytest.raises(ValueError, match="wymaga dziennika"):
            klasa(dopuszczaj_zastoj=True)
