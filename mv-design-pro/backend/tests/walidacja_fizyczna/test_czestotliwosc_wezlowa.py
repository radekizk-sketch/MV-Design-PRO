"""CZESTOTLIWOSC WEZLOWA: tozsamosc, niezmienniki i granica dostepnosci (R10 par. 19-21).

Te testy nie dotykaja silnika — badaja SAMA OBSERWABLE jako funkcje. Dzieki temu
kazda porazka wskazuje wzor, a nie „cos w biegu". Sprzezenie obserwabli z biegiem
pilnuje bramka G7 (`bramki.g7_czestotliwosc_wezlowa`), ktora porownuje
opublikowane `f_hz` z DOKLADNA pochodna analityczna wyroczni.
"""

from __future__ import annotations

import cmath
import math

import pytest
from network_model.solvers.dynamika.obserwable import (
    JAKOSC_NIEDOSTEPNA,
    JAKOSC_NIEROZROZNIALNA,
    JAKOSC_ROZROZNIALNA,
    czestotliwosc_wezla,
)

F_N_HZ = 50.0

#: Katy, w ktorych fazor ma byc badany — z zerem, cwiartkami i `pi` (najgorsze dla `atan`).
KATY_RAD = (0.0, 0.3, math.pi / 2.0, math.pi - 1e-9, math.pi, -math.pi / 3.0, 2.7)

#: Predkosci katowe fazora (rad/s) — od zera do odchylki rzedu 1 Hz.
PREDKOSCI_RAD_S = (0.0, 1e-9, 0.1, -0.1, 2.0 * math.pi, -2.0 * math.pi * 1.0)


def _fazor(modul: float, kat: float, tempo_modulu: float, tempo_kata: float):
    """`V` i `dV/dt` dla `V = A e^{j theta}`: `dV/dt = (dA + j A dtheta) e^{j theta}`."""
    obrot = cmath.exp(1j * kat)
    return modul * obrot, (tempo_modulu + 1j * modul * tempo_kata) * obrot


@pytest.mark.parametrize("kat", KATY_RAD)
@pytest.mark.parametrize("tempo_kata", PREDKOSCI_RAD_S)
@pytest.mark.parametrize("modul", (1.0, 0.7, 1.3))
def test_bf1_tozsamosc_czestotliwosci(kat: float, tempo_kata: float, modul: float) -> None:
    """BF-1: `f = f_n + theta_kropka/(2 pi)` DOKLADNIE, dla kazdego kata i modulu.

    Tozsamosc `Im(Vdot conj(V))/|V|^2 = dtheta/dt` jest scisla w arytmetyce
    dokladnej; w podwojnej precyzji roznica moze byc rzedu kilku ulp wyniku.
    """
    napiecie, pochodna = _fazor(modul, kat, tempo_modulu=0.0, tempo_kata=tempo_kata)
    wynik = czestotliwosc_wezla(
        napiecie,
        pochodna,
        f_bazowa_hz=F_N_HZ,
        niepewnosc_napiecia_pu=1e-14,
        niepewnosc_pochodnej_pu_s=1e-14,
    )
    oczekiwana = F_N_HZ + tempo_kata / (2.0 * math.pi)
    assert wynik.f_hz == pytest.approx(oczekiwana, abs=8.0 * math.ulp(F_N_HZ))


@pytest.mark.parametrize("tempo_modulu", (0.0, 5.0, -5.0, 100.0))
def test_bf2_zmiana_modulu_nie_zmienia_czestotliwosci(tempo_modulu: float) -> None:
    """BF-2: skladowa RADIALNA pochodnej fazora nie wchodzi do czestotliwosci.

    Gdyby wzor uzywal `|Vdot|` albo czesci rzeczywistej, gwaltowna zmiana MODULU
    (zapad napiecia) meldowalaby sie jako zmiana czestotliwosci — blad, ktory w
    ocenie stabilnosci wyglada jak realne zdarzenie czestotliwosciowe.
    """
    napiecie, pochodna = _fazor(1.0, 0.4, tempo_modulu=tempo_modulu, tempo_kata=0.7)
    wynik = czestotliwosc_wezla(
        napiecie,
        pochodna,
        f_bazowa_hz=F_N_HZ,
        niepewnosc_napiecia_pu=1e-14,
        niepewnosc_pochodnej_pu_s=1e-14,
    )
    assert wynik.f_hz == pytest.approx(F_N_HZ + 0.7 / (2.0 * math.pi), abs=8.0 * math.ulp(F_N_HZ))


@pytest.mark.parametrize("faza_odniesienia", (0.0, 0.5, math.pi, -1.234, 2.0 * math.pi))
def test_niezmienniczosc_cechowania(faza_odniesienia: float) -> None:
    """Obrot CALEGO ukladu odniesienia `V -> V e^{j phi0}` nie zmienia czestotliwosci.

    Czestotliwosc jest wielkoscia WZGLEDNA wobec wspolnej osi odniesienia; gdyby
    zalezala od jej wyboru, kazdy bieg mialby inna czestotliwosc zaleznie od tego,
    gdzie stoi kat zerowy — wielkosc bez znaczenia fizycznego.
    """
    napiecie, pochodna = _fazor(0.93, 0.31, tempo_modulu=2.0, tempo_kata=-0.45)
    obrot = cmath.exp(1j * faza_odniesienia)
    bez = czestotliwosc_wezla(
        napiecie,
        pochodna,
        f_bazowa_hz=F_N_HZ,
        niepewnosc_napiecia_pu=1e-12,
        niepewnosc_pochodnej_pu_s=1e-12,
    )
    po = czestotliwosc_wezla(
        napiecie * obrot,
        pochodna * obrot,
        f_bazowa_hz=F_N_HZ,
        niepewnosc_napiecia_pu=1e-12,
        niepewnosc_pochodnej_pu_s=1e-12,
    )
    assert po.f_hz == pytest.approx(bez.f_hz, abs=8.0 * math.ulp(F_N_HZ))
    assert po.jakosc == bez.jakosc


@pytest.mark.parametrize("skala", (1.0, 0.5, 2.0, 1e-3, 1e3))
def test_jednorodnosc_stopnia_zero(skala: float) -> None:
    """`V -> k V`, `Vdot -> k Vdot` nie zmienia czestotliwosci (stopien jednorodnosci 0).

    Niepewnosci skaluja sie razem z fazorem, bo inaczej zmiana skali zmienialaby
    sama BRAMKE dostepnosci, a nie tylko wartosc.
    """
    napiecie, pochodna = _fazor(1.0, 0.2, tempo_modulu=1.5, tempo_kata=0.9)
    wzorzec = czestotliwosc_wezla(
        napiecie,
        pochodna,
        f_bazowa_hz=F_N_HZ,
        niepewnosc_napiecia_pu=1e-12,
        niepewnosc_pochodnej_pu_s=1e-12,
    )
    przeskalowany = czestotliwosc_wezla(
        napiecie * skala,
        pochodna * skala,
        f_bazowa_hz=F_N_HZ,
        niepewnosc_napiecia_pu=1e-12 * skala,
        niepewnosc_pochodnej_pu_s=1e-12 * skala,
    )
    assert przeskalowany.f_hz == pytest.approx(wzorzec.f_hz, abs=8.0 * math.ulp(F_N_HZ))
    assert przeskalowany.jakosc == wzorzec.jakosc


#: Zamiatanie glebokiego zapadu (R10 par. 20). Dla kazdego modulu ta sama fizyczna
#: predkosc katowa; zmienia sie WYLACZNIE uwarunkowanie.
MODULY_ZAPADU_PU = (1.0, 0.5, 0.2, 0.1, 0.05, 0.01, 0.001)


@pytest.mark.parametrize("modul", MODULY_ZAPADU_PU)
def test_zamiatanie_zapadu_napiecia(modul: float) -> None:
    """Przy stalej NIEPEWNOSCI BEZWZGLEDNEJ zapad pogarsza uwarunkowanie, nie wartosc.

    Niepewnosc `u_V` jest tu STALA (pochodzi z residuum Newtona, nie z modulu
    napiecia), wiec wraz z zapadem rosnie jej UDZIAL — i o to chodzi: test
    sprawdza, ze wartosc pozostaje poprawna, a rosnaca niepewnosc jest
    RAPORTOWANA, nie ukrywana.
    """
    tempo_kata = 0.6
    u_v = 1e-4
    napiecie, pochodna = _fazor(modul, 0.25, tempo_modulu=0.0, tempo_kata=tempo_kata)
    wynik = czestotliwosc_wezla(
        napiecie,
        pochodna,
        f_bazowa_hz=F_N_HZ,
        niepewnosc_napiecia_pu=u_v,
        niepewnosc_pochodnej_pu_s=u_v,
    )
    oczekiwana = F_N_HZ + tempo_kata / (2.0 * math.pi)
    if modul <= u_v:
        assert wynik.jakosc == JAKOSC_NIEDOSTEPNA
        return
    assert wynik.f_hz == pytest.approx(oczekiwana, abs=8.0 * math.ulp(F_N_HZ))
    assert wynik.niepewnosc_hz > 0.0
    # Niepewnosc rosnie monotonicznie z glebokoscia zapadu — sprawdzane parami nizej.
    assert wynik.jakosc in (JAKOSC_ROZROZNIALNA, JAKOSC_NIEROZROZNIALNA)


def test_niepewnosc_rosnie_monotonicznie_z_zapadem() -> None:
    """Im glebszy zapad, tym wieksza raportowana niepewnosc — bez wyjatku."""
    u_v = 1e-4
    niepewnosci = []
    for modul in MODULY_ZAPADU_PU:
        if modul <= u_v:
            continue
        napiecie, pochodna = _fazor(modul, 0.25, tempo_modulu=0.0, tempo_kata=0.6)
        niepewnosci.append(
            czestotliwosc_wezla(
                napiecie,
                pochodna,
                f_bazowa_hz=F_N_HZ,
                niepewnosc_napiecia_pu=u_v,
                niepewnosc_pochodnej_pu_s=u_v,
            ).niepewnosc_hz
        )
    assert niepewnosci == sorted(niepewnosci), niepewnosci


def test_granica_dostepnosci_jest_fail_closed() -> None:
    """`|V| <= u_V` -> NIEDOSTEPNA. Kat fazora wewnatrz wlasnej kuli nie niesie informacji.

    Niepewnosc jest brana Z FAKTYCZNEGO modulu policzonego fazora, nie z liczby
    zadanej na wejsciu: `abs(A * exp(j theta))` rozni sie od `A` o pojedyncze ulp,
    wiec test przy dokladnej rownosci badalby zaokraglenie, a nie bramke.
    """
    for modul, mnoznik in ((1e-6, 1.0), (1e-6, 2.0), (0.5, 1.0), (1.0, 1.0 + 1e-12)):
        napiecie, pochodna = _fazor(modul, 0.1, tempo_modulu=0.0, tempo_kata=1.0)
        u_v = abs(napiecie) * mnoznik
        wynik = czestotliwosc_wezla(
            napiecie,
            pochodna,
            f_bazowa_hz=F_N_HZ,
            niepewnosc_napiecia_pu=u_v,
            niepewnosc_pochodnej_pu_s=u_v,
        )
        assert wynik.jakosc == JAKOSC_NIEDOSTEPNA, (modul, mnoznik)
        # PRZEPISANE ŚWIADOMIE (karta AB-1b.1 par. 0 pkt 7): wartosc niedostepna to `None`,
        # nie czestotliwosc znamionowa podstawiona w miejsce braku — fail-closed mocniej.
        assert wynik.f_hz is None and wynik.niepewnosc_hz is None


def test_tuz_nad_granica_wartosc_jest_publikowana_ale_nieufna() -> None:
    """Tuz NAD granica wynik wychodzi — z niepewnoscia, ktora sama go dyskwalifikuje.

    To jest granica MIEKKA po wlasciwej stronie: rdzen nie udaje, ze nie umie, ale
    tez nie udaje, ze wie. Pomiar: dla `|V| = u_V (1 + 1e-9)` niepewnosc siega
    rzedu 1e+15 Hz, a stan jakosci wychodzi NIEROZROZNIALNY.
    """
    napiecie, pochodna = _fazor(1e-6, 0.1, tempo_modulu=0.0, tempo_kata=1.0)
    u_v = abs(napiecie) / (1.0 + 1e-9)
    wynik = czestotliwosc_wezla(
        napiecie,
        pochodna,
        f_bazowa_hz=F_N_HZ,
        niepewnosc_napiecia_pu=u_v,
        niepewnosc_pochodnej_pu_s=u_v,
    )
    assert wynik.jakosc == JAKOSC_NIEROZROZNIALNA
    assert wynik.niepewnosc_hz > 1.0e6
