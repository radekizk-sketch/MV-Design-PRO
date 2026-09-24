"""ZDARZENIA: reinicjalizacja, tozsamosc i rownoczesnosc (R10 par. 27-29).

Trzy pytania, ktore kazde osobno moga uniewaznic wynik biegu ze zdarzeniami:

1. Czy po zdarzeniu punkt jest ROZWIAZANIEM nowej sieci (`g(x+, y+) = 0`), czy tylko
   „kontynuacja" starego? Stan rozniczkowy jest ciagly, stan algebraiczny SKACZE —
   i wlasnie ten skok musi byc rozwiazany, a nie przeniesiony.
2. Czy zdarzenie zachowuje TOZSAMOSC w wyniku? Dwa rozne zdarzenia moga dac podobny
   przebieg; jesli wynik nie niesie, KTORE zaszlo i KIEDY, przebieg jest nieinterpretowalny.
3. Czy dwa zdarzenia o TEJ SAMEJ chwili daja wynik DETERMINISTYCZNY — takze przy
   zmienionym `PYTHONHASHSEED`, ktory zmienia kolejnosc iteracji po zbiorach i slownikach?
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
from network_model.solvers.dynamika import ZmianaGalezi, ZwarcieWezla

from . import stanowisko

KORZEN_BACKENDU = Path(__file__).resolve().parents[2]


def _zwarcie(t_s: float, x_f_pu: float, t_usuniecia_s: float | None) -> ZwarcieWezla:
    return ZwarcieWezla(
        t_s=t_s,
        wezel="GEN",
        typ="3F",
        r_f_ohm=0.0,
        x_f_ohm=x_f_pu * stanowisko.Z_BAZOWA_OM,
        t_usuniecia_s=t_usuniecia_s,
        sposob_usuniecia=None if t_usuniecia_s is None else "samoczynne",
    )


# --------------------------------------------------------------- reinicjalizacja
@pytest.mark.parametrize(
    ("t_zdarzenia", "opis"),
    [(0.3, "zdarzenie DOKLADNIE na wezle siatki"), (0.30025, "zdarzenie MIEDZY krokami")],
)
def test_reinicjalizacja_rozwiazuje_algebre_po_zdarzeniu(t_zdarzenia: float, opis: str) -> None:
    """`g(x+, y+) = 0` po zdarzeniu — niezaleznie od tego, czy trafia w siatke.

    Miara pochodzi z NIEZALEZNEJ drogi: `residuum_kcl_max` liczy bilans pradow
    element po elemencie z modelu pi, nie przez Ybus Newtona, wiec nie moze
    „potwierdzic" zbieznosci jej wlasna macierza.
    """
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(),
        (_zwarcie(t_zdarzenia, 0.5, t_zdarzenia + 0.15),),
        horyzont_s=0.8,
        dt_s=5e-4,
        krok_wyjscia_s=5e-4,
    )
    assert len(wynik.zdarzenia_wykonane) == 2, opis
    for zdarzenie in wynik.zdarzenia_wykonane:
        assert zdarzenie.residuum_kcl_max < 1e-9, (opis, zdarzenie)


def test_stan_rozniczkowy_ciagly_a_algebraiczny_skacze() -> None:
    """Kat i predkosc przechodza przez zdarzenie CIAGLE; napiecie wezla SKACZE.

    To jest rozroznienie, ktore odroznia poprawna reinicjalizacje od „przeniesienia
    starego punktu": gdyby algebra nie byla rozwiazywana od nowa, `delta_y_max`
    bylby zerem, a napiecie po zwarciu zostaloby przedzwarciowe.
    """
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(),
        (_zwarcie(0.3, 0.2, None),),
        horyzont_s=0.4,
        dt_s=5e-4,
        krok_wyjscia_s=5e-4,
    )
    (zdarzenie,) = wynik.zdarzenia_wykonane
    assert zdarzenie.delta_x_max == pytest.approx(
        0.0, abs=1e-12
    ), "stan rozniczkowy musi byc ciagly"
    assert zdarzenie.delta_y_max > 0.1, "napiecie wezla musi skoczyc przy zwarciu"


def test_probki_w_chwili_zdarzenia_L_przed_i_P_po_zdarzeniu() -> None:
    """Kontrakt OBUSTRONNY (karta AB-1b.1 par. 0 pkt 6): chwila zdarzenia ma probke `L`
    (stan PRZED zdarzeniami tej chwili) i `P` (stan PO nich i po re-inicjalizacji).

    PRZEPISANY ŚWIADOMIE: dawniej jedna probka prawostronna. Intencja zachowana
    (probka `P` niesie skok), dopisana strona lewa. Sprawdzane na wielkosci, ktora
    SKACZE (modul napiecia wezla), a nie na kacie wirnika — ten jest ciagly i nie
    odroznilby obu stron. Bez tego testu kontrakt z docstringu `silnik.py` bylby
    deklaracja bez pokrycia.
    """
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(),
        (_zwarcie(0.3, 0.2, None),),
        horyzont_s=0.4,
        dt_s=5e-4,
        krok_wyjscia_s=5e-4,
    )
    czas = stanowisko.czas(wynik, strony=stanowisko.SIATKA_PRAWOSTRONNA)
    modul = stanowisko.szereg(wynik, "u_pu@GEN", strony=stanowisko.SIATKA_PRAWOSTRONNA)
    i_zdarzenia = int(np.flatnonzero(np.isclose(czas, 0.3, atol=1e-12))[0])
    przed = float(modul[i_zdarzenia - 1])
    w_chwili = float(modul[i_zdarzenia])
    assert w_chwili < 0.9 * przed, (
        f"probka P chwili zdarzenia ({w_chwili}) nie rozni sie od przedzwarciowej ({przed}) "
        "— strona prawa zlamana"
    )
    lewa = wynik.probki["u_pu@GEN"][stanowisko.indeks_probki(wynik, 0.3, "L")]
    assert lewa == pytest.approx(przed, rel=1e-9), "probka L to stan przed zwarciem"


# --------------------------------------------------------------- tozsamosc zdarzenia
def test_tozsamosc_zdarzenia_jest_w_wyniku() -> None:
    """Dwa ROZNE zdarzenia o zblizonym skutku musza byc rozroznialne W WYNIKU.

    Bez tozsamosci przebieg jest nieinterpretowalny: inzynier widzi „cos sie stalo",
    ale nie wie, co ani gdzie. Test porownuje zwarcie w wezle z otwarciem galezi
    dobrane tak, zeby kat wirnika zachowywal sie podobnie.
    """
    zwarciowy = stanowisko.uruchom(
        stanowisko.zbuduj(),
        (_zwarcie(0.3, 0.5, 0.45),),
        horyzont_s=0.8,
        dt_s=5e-4,
        krok_wyjscia_s=5e-4,
    )
    topologiczny = stanowisko.uruchom(
        stanowisko.zbuduj(x_linii_pu=0.15, dwutorowa=True),
        (ZmianaGalezi(t_s=0.3, galaz="LINIA2", zalaczona=False),),
        horyzont_s=0.8,
        dt_s=5e-4,
        krok_wyjscia_s=5e-4,
    )
    rodzaje_zw = {z.rodzaj for z in zwarciowy.zdarzenia_wykonane}
    rodzaje_top = {z.rodzaj for z in topologiczny.zdarzenia_wykonane}
    assert rodzaje_zw != rodzaje_top, (rodzaje_zw, rodzaje_top)
    for zdarzenie in zwarciowy.zdarzenia_wykonane + topologiczny.zdarzenia_wykonane:
        assert zdarzenie.rodzaj, "kazde zdarzenie musi niesc rodzaj"
        assert zdarzenie.ref, "kazde zdarzenie musi niesc odnosnik do elementu"
        assert zdarzenie.t_zaplanowany_s == pytest.approx(zdarzenie.t_wykonany_s, abs=1e-12)


# --------------------------------------------------------------- rownoczesnosc
def _bieg_dwoch_zdarzen_w_tej_samej_chwili(kolejnosc_odwrotna: bool) -> tuple[float, ...]:
    zdarzenia = [
        ZmianaGalezi(t_s=0.3, galaz="LINIA2", zalaczona=False),
        _zwarcie(0.3, 0.5, None),
    ]
    if kolejnosc_odwrotna:
        zdarzenia.reverse()
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(x_linii_pu=0.15, dwutorowa=True),
        tuple(zdarzenia),
        horyzont_s=0.5,
        dt_s=5e-4,
        krok_wyjscia_s=5e-4,
    )
    return tuple(stanowisko.szereg(wynik, "delta_rad@G1", strony=stanowisko.SIATKA_PRAWOSTRONNA))


def test_dwa_zdarzenia_w_tej_samej_chwili_daja_ten_sam_wynik() -> None:
    """Kolejnosc ZAPISU dwoch zdarzen o tej samej chwili nie moze zmieniac wyniku.

    Semantyka jest ATOMOWA: wszystkie zdarzenia chwili `t` sa nanoszone na model,
    a algebra rozwiazywana RAZ dla zlozonego stanu koncowego. Gdyby byly nanoszone
    po kolei z osobna reinicjalizacja, kolejnosc zapisu decydowalaby o trajektorii.
    """
    assert _bieg_dwoch_zdarzen_w_tej_samej_chwili(False) == _bieg_dwoch_zdarzen_w_tej_samej_chwili(
        True
    )


@pytest.mark.parametrize("ziarno", ("0", "1", "12345"))
def test_wynik_nie_zalezy_od_pythonhashseed(ziarno: str) -> None:
    """Zmiana `PYTHONHASHSEED` zmienia kolejnosc iteracji po zbiorach — wynik nie.

    `ModelSieci` trzyma `galezie_aktywne` jako `frozenset`, a wynik `probki` jako
    slownik; gdyby ktorakolwiek petla po nich wchodzila do SUMY zmiennoprzecinkowej,
    bieg przestalby byc deterministyczny miedzy procesami. Test uruchamia bieg w
    OSOBNYM procesie, bo `PYTHONHASHSEED` dziala wylacznie przy starcie interpretera.
    """
    program = (
        "import json,sys;"
        f"sys.path[:0]=[{str(KORZEN_BACKENDU / 'src')!r},{str(KORZEN_BACKENDU)!r}];"
        "from tests.walidacja_fizyczna import stanowisko;"
        "from network_model.solvers.dynamika import ZwarcieWezla, ZmianaGalezi;"
        "u=stanowisko.zbuduj(x_linii_pu=0.15, dwutorowa=True);"
        "z=(ZmianaGalezi(t_s=0.3, galaz='LINIA2', zalaczona=False),"
        " ZwarcieWezla(t_s=0.3, wezel='GEN', typ='3F', r_f_ohm=0.0,"
        "  x_f_ohm=0.5*stanowisko.Z_BAZOWA_OM, t_usuniecia_s=None, sposob_usuniecia=None));"
        "w=stanowisko.uruchom(u,z,horyzont_s=0.5,dt_s=5e-4,krok_wyjscia_s=5e-4);"
        "print(json.dumps([float(x) for x in"
        " stanowisko.szereg(w,'delta_rad@G1',strony=stanowisko.SIATKA_PRAWOSTRONNA)]))"
    )
    srodowisko = dict(os.environ, PYTHONHASHSEED=ziarno)
    proces = subprocess.run(
        [sys.executable, "-c", program],
        cwd=str(KORZEN_BACKENDU),
        env=srodowisko,
        capture_output=True,
        text=True,
        timeout=900,
    )
    assert proces.returncode == 0, proces.stderr[-800:]
    przebieg = json.loads(proces.stdout)
    wzorzec = list(_bieg_dwoch_zdarzen_w_tej_samej_chwili(False))
    assert przebieg == wzorzec, (
        f"PYTHONHASHSEED={ziarno} zmienil trajektorie — bieg nie jest deterministyczny "
        "miedzy procesami"
    )
