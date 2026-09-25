"""Urzadzenia rdzenia: jakobiany ANALITYCZNE wobec roznic skonczonych.

DLACZEGO TO JEST NAJWAZNIEJSZY TEST TEJ WARSTWY. Kazdy blok jakobianu jest
wyprowadzony recznie z rownan urzadzenia. Blad znaku albo pominiety skladnik NIE
psuje wyniku w sposob widoczny: Newton nadal zbiega (wolniej), przebieg nadal
wyglada gladko, a rozjazd ujawnia sie dopiero przy silnym zaburzeniu albo wcale.
Roznica skonczona jest wobec tego JEDYNA niezalezna miara tych pochodnych —
liczy je z samej funkcji, bez ani jednej linii wspolnej z wyprowadzeniem.

ILOCZYN CECH (regula KLASA, NIE INSTANCJA): kazdy z czterech blokow jakobianu
(`f_x`, `f_y`, `I_x`, `I_y`) x kazde urzadzenie rdzenia (maszyna klasyczna,
szyna sztywna, urzadzenie odlaczone) x dwa punkty pracy (rownowaga i stan
zaburzony, w ktorym wszystkie skladniki sa niezerowe).
"""

from __future__ import annotations

import cmath

import numpy as np
import pytest
from network_model.solvers.dynamika.urzadzenia import MaszynaKlasyczna, SzynaSztywna
from network_model.solvers.dynamika.urzadzenia.odlaczone import UrzadzenieOdlaczone

from tests.network_model.dynamika.uklady import zbuduj_smib

#: Krok roznicy centralnej — kompromis miedzy bledem obciecia (rosnie jak h^2) a
#: bledem zaokraglenia (rosnie jak eps/h); dla wielkosci rzedu jednosci optimum
#: lezy okolo pierwiastka szescinnego z epsilona maszynowego.
KROK_ROZNICY = 1.0e-6
#: Tolerancja porownania — dobrana z POMIARU: najwiekszy zmierzony blad roznicy
#: centralnej na tych ukladach byl rzedu 1e-7 (skladniki rzedu 1e2 przy 2H w
#: mianowniku), wiec 1e-5 daje trzy rzedy zapasu i nadal zabija blad znaku.
TOLERANCJA = 1.0e-5


def _stany_testowe(maszyna: MaszynaKlasyczna, szyna: SzynaSztywna, uklad) -> list[tuple]:
    rownowaga_maszyny = maszyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["GEN"], uklad.punkt_pracy.moce_zrodel_pu["G1"]
    )
    rownowaga_szyny = szyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["SYS"], uklad.punkt_pracy.moce_zrodel_pu["SYS1"]
    )
    zaburzony_maszyny = rownowaga_maszyny + np.array([0.37, 0.004, 0.0, 0.0])
    zaburzony_szyny = rownowaga_szyny + np.array([0.02, -0.03])
    napiecie_rownowagi = uklad.punkt_pracy.napiecia_pu["GEN"]
    napiecie_zaburzone = 0.72 * cmath.exp(1j * 0.21)
    return [
        (maszyna, rownowaga_maszyny, napiecie_rownowagi, "maszyna/rownowaga"),
        (maszyna, zaburzony_maszyny, napiecie_zaburzone, "maszyna/zaburzenie"),
        (szyna, rownowaga_szyny, uklad.punkt_pracy.napiecia_pu["SYS"], "szyna/rownowaga"),
        (szyna, zaburzony_szyny, napiecie_zaburzone, "szyna/zaburzenie"),
        (
            UrzadzenieOdlaczone(maszyna),
            zaburzony_maszyny,
            napiecie_zaburzone,
            "odlaczone/zaburzenie",
        ),
    ]


@pytest.fixture(scope="module")
def przypadki() -> list[tuple]:
    uklad = zbuduj_smib(d_pu=2.0, ra_pu=0.01)
    return _stany_testowe(uklad.maszyna, uklad.szyna, uklad)


def _roznica_po_stanie(funkcja, stan: np.ndarray, indeks: int) -> np.ndarray:
    w_gore = stan.copy()
    w_dol = stan.copy()
    w_gore[indeks] += KROK_ROZNICY
    w_dol[indeks] -= KROK_ROZNICY
    return (funkcja(w_gore) - funkcja(w_dol)) / (2.0 * KROK_ROZNICY)


def _roznica_po_napieciu(funkcja, napiecie: complex, os: int) -> np.ndarray:
    przesuniecie = complex(KROK_ROZNICY, 0.0) if os == 0 else complex(0.0, KROK_ROZNICY)
    return (funkcja(napiecie + przesuniecie) - funkcja(napiecie - przesuniecie)) / (
        2.0 * KROK_ROZNICY
    )


def test_jakobian_stan_stan_zgodny_z_roznica_skonczona(przypadki: list[tuple]) -> None:
    for urzadzenie, stan, napiecie, opis in przypadki:
        analityczny = urzadzenie.jakobian_stan_stan(stan, napiecie)
        for indeks in range(len(urzadzenie.nazwy_stanow)):
            numeryczny = _roznica_po_stanie(
                lambda x, u=urzadzenie, n=napiecie: u.pochodne(x, n), stan, indeks
            )
            assert np.allclose(analityczny[:, indeks], numeryczny, atol=TOLERANCJA), (
                f"{opis}: kolumna {indeks} bloku f_x rozni sie od roznicy skonczonej "
                f"({analityczny[:, indeks]} vs {numeryczny})"
            )


def test_jakobian_stan_napiecie_zgodny_z_roznica_skonczona(przypadki: list[tuple]) -> None:
    for urzadzenie, stan, napiecie, opis in przypadki:
        analityczny = urzadzenie.jakobian_stan_napiecie(stan, napiecie)
        for os in (0, 1):
            numeryczny = _roznica_po_napieciu(
                lambda v, u=urzadzenie, x=stan: u.pochodne(x, v), napiecie, os
            )
            assert np.allclose(analityczny[:, os], numeryczny, atol=TOLERANCJA), (
                f"{opis}: kolumna {os} bloku f_y rozni sie od roznicy skonczonej "
                f"({analityczny[:, os]} vs {numeryczny})"
            )


def test_jakobian_prad_napiecie_zgodny_z_roznica_skonczona(przypadki: list[tuple]) -> None:
    for urzadzenie, stan, napiecie, opis in przypadki:
        analityczny = urzadzenie.jakobian_prad_napiecie(stan, napiecie)
        for os in (0, 1):
            numeryczny = _roznica_po_napieciu(
                lambda v, u=urzadzenie, x=stan: np.array(
                    [u.prad_pu(x, v).real, u.prad_pu(x, v).imag]
                ),
                napiecie,
                os,
            )
            assert np.allclose(analityczny[:, os], numeryczny, atol=TOLERANCJA), (
                f"{opis}: kolumna {os} bloku I_y rozni sie od roznicy skonczonej "
                f"({analityczny[:, os]} vs {numeryczny})"
            )


def test_jakobian_prad_stan_zgodny_z_roznica_skonczona(przypadki: list[tuple]) -> None:
    for urzadzenie, stan, napiecie, opis in przypadki:
        analityczny = urzadzenie.jakobian_prad_stan(stan, napiecie)
        for indeks in range(len(urzadzenie.nazwy_stanow)):
            numeryczny = _roznica_po_stanie(
                lambda x, u=urzadzenie, n=napiecie: np.array(
                    [u.prad_pu(x, n).real, u.prad_pu(x, n).imag]
                ),
                stan,
                indeks,
            )
            assert np.allclose(analityczny[:, indeks], numeryczny, atol=TOLERANCJA), (
                f"{opis}: kolumna {indeks} bloku I_x rozni sie od roznicy skonczonej "
                f"({analityczny[:, indeks]} vs {numeryczny})"
            )


def test_maszyna_w_rownowadze_ma_zerowe_pochodne() -> None:
    """Stan z punktu pracy MUSI byc rownowaga — inaczej bieg startuje skokiem."""
    uklad = zbuduj_smib()
    stan = uklad.maszyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["GEN"], uklad.punkt_pracy.moce_zrodel_pu["G1"]
    )
    pochodne = uklad.maszyna.pochodne(stan, uklad.punkt_pracy.napiecia_pu["GEN"])
    assert np.max(np.abs(pochodne)) < 1.0e-14


def test_maszyna_odtwarza_moc_punktu_pracy() -> None:
    """Prad i moc z inicjalizacji musza zgadzac sie z punktem pracy rozpływu."""
    uklad = zbuduj_smib()
    napiecie = uklad.punkt_pracy.napiecia_pu["GEN"]
    moc = uklad.punkt_pracy.moce_zrodel_pu["G1"]
    stan = uklad.maszyna.stan_poczatkowy(napiecie, moc)
    prad = uklad.maszyna.prad_pu(stan, napiecie)
    assert abs(napiecie * prad.conjugate() - moc) < 1.0e-12


def test_urzadzenie_odlaczone_nie_wstrzykuje_pradu_i_ma_zerowa_moc() -> None:
    """Odlaczenie zeruje prad i moc elektryczna DOKLADNIE, nie w przyblizeniu."""
    uklad = zbuduj_smib()
    stan = uklad.maszyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["GEN"], uklad.punkt_pracy.moce_zrodel_pu["G1"]
    )
    odlaczona = UrzadzenieOdlaczone(uklad.maszyna)
    assert odlaczona.prad_pu(stan, complex(0.4, -0.2)) == 0j
    moc_elektryczna = uklad.maszyna.moc_elektryczna_pu(
        stan, uklad.maszyna.napiecie_bez_obciazenia(stan)
    )
    assert abs(moc_elektryczna) < 1.0e-15


def test_urzadzenie_odlaczone_przyspiesza_pod_moca_mechaniczna() -> None:
    """Maszyna odlaczona od sieci przyspiesza z `dw/dt = P_m/(2H)` — fizyka, nie zero."""
    uklad = zbuduj_smib()
    stan = uklad.maszyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["GEN"], uklad.punkt_pracy.moce_zrodel_pu["G1"]
    )
    odlaczona = UrzadzenieOdlaczone(uklad.maszyna)
    pochodne = odlaczona.pochodne(stan, complex(0.9, 0.1))
    oczekiwane = stan[2] / (2.0 * uklad.maszyna.h_s)
    assert pochodne[1] == pytest.approx(oczekiwane, rel=1e-12)


def test_zmiana_bazy_urzadzenia_nie_zmienia_wielkosci_fizycznych() -> None:
    """Ta sama maszyna opisana w DWOCH bazach mocy daje ten sam prad i moc w SI.

    To jest test klasy defektu „dwie bazy tej samej wielkosci pu": maszyna o
    bazie 50 MVA w ukladzie 100 MVA musi dac DOKLADNIE ten sam prad, co maszyna
    opisana wprost w bazie 100 MVA o polowie parametrow.
    """
    from network_model.solvers.dynamika.urzadzenia import zbuduj_maszyne_klasyczna

    w_bazie_ukladu = zbuduj_maszyne_klasyczna(
        ident="G",
        wezel="GEN",
        s_n_mva=100.0,
        h_s=1.75,
        d_pu=1.0,
        x_prim_pu=0.6,
        ra_pu=0.02,
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )
    w_bazie_urzadzenia = zbuduj_maszyne_klasyczna(
        ident="G",
        wezel="GEN",
        s_n_mva=50.0,
        h_s=3.5,
        d_pu=2.0,
        x_prim_pu=0.3,
        ra_pu=0.01,
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )
    assert w_bazie_ukladu.h_s == pytest.approx(w_bazie_urzadzenia.h_s)
    assert w_bazie_ukladu.d_pu == pytest.approx(w_bazie_urzadzenia.d_pu)
    assert w_bazie_ukladu.x_prim_pu == pytest.approx(w_bazie_urzadzenia.x_prim_pu)
    assert w_bazie_ukladu.ra_pu == pytest.approx(w_bazie_urzadzenia.ra_pu)

    napiecie = complex(1.02, 0.05)
    moc = complex(0.4, 0.1)
    stan_a = w_bazie_ukladu.stan_poczatkowy(napiecie, moc)
    stan_b = w_bazie_urzadzenia.stan_poczatkowy(napiecie, moc)
    assert w_bazie_ukladu.prad_pu(stan_a, napiecie) == pytest.approx(
        w_bazie_urzadzenia.prad_pu(stan_b, napiecie)
    )
