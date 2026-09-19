"""Wyrocznia ZEWNETRZNA: nasz rdzen wobec ANDES na ukladzie SMIB (SS0 p.7 c).

MARKER `andes` — ten plik biegnie WYLACZNIE w izolowanym srodowisku z ANDES
(osobny job CI, wzorzec `pandapower`). W biegu glownym jest DESELEKCJONOWANY
markerem, a nie pomijany warunkowo: `pytest.importorskip` na poziomie modulu
zamienialby brak wyroczni w „zielono" i ukrywalby takze sondy, ktore ANDES-a nie
wymagaja (defekt P1-B55-03 z przegladu watku badawczego).

CZEGO TEN TEST NIE DOWODZI. Zgodnosc z jednym narzedziem na jednym ukladzie nie
jest walidacja fizyczna i nie podnosi mocy dowodowej zdolnosci. Jest pomiarem
NIEZALEZNOSCI ODNIESIENIA: pokazuje, ze rdzen liczy to samo, co narzedzie
napisane przez kogo innego, z wlasnym modelem maszyny, wlasnym skladaniem sieci i
wlasnym calkowaniem — i nic ponadto.

KRYTERIA ODBIORU SA Z POMIARU (2026-09-17, krok 0,5 ms, zwarcie 0,1–0,18 s):

| odcinek           | zmierzony blad kata | prog testu |
|-------------------|---------------------|------------|
| przed zwarciem    | 6,58e-09 rad        | 1e-06 rad  |
| w oknie zwarcia   | 1,35e-04 rad        | 5e-04 rad  |
| po zdjeciu        | 1,42e-04 rad        | 5e-04 rad  |

PODLOGA ROZNICY NIE MALEJE Z KROKIEM (zmierzone dla dt = 0,5 / 0,25 / 0,125 ms:
1,419e-04 / 1,420e-04 / — przy tolerancji wyroczni 1e-10), wiec NIE jest bledem
calkowania zadnej ze stron. Przyczyna pozostaje NIEUSTALONA: zbadano i wykluczono
roznice czestotliwosci bazowej (ANDES domyslnie 60 Hz — to bylo zrodlo
pierwotnego rozjazdu 0,3 rad), tolerancje Newtona wyroczni (domyslna 1e-4 dawala
2,7e-04 rad), model admitancji zwarcia (obie strony: `1/(r_f + j x_f)`) oraz
warunki poczatkowe (zgodne do 7e-10 rad). Progi sa zapisane jako POMIAR z zapasem
3,5x, a nie jako deklaracja zgodnosci.
"""

from __future__ import annotations

import numpy as np
import pytest
from network_model.pochodne import impedancja_z_napiecia_i_mocy_ohm
from network_model.solvers.dynamika import HarmonogramDynamiki, SilnikDynamiki, ZwarcieWezla
from network_model.solvers.dynamika.walidacja import kat_szyny

from tests.network_model.dynamika import wyrocznia_andes as most
from tests.network_model.dynamika.uklady import (
    S_BAZOWA_MVA,
    U_N_KV,
    X_ZWARCIA_OHM,
    nastawy,
    zbuduj_smib,
)

pytestmark = pytest.mark.andes

T_ZWARCIA_S = 0.1
T_ZDJECIA_S = 0.18
HORYZONT_S = 1.5
KROK_S = 0.0005

PROG_PRZED_RAD = 1.0e-6
PROG_OKNO_RAD = 5.0e-4
PROG_PO_RAD = 5.0e-4


def _nasz_przebieg(uklad, *, dt_s: float = KROK_S):
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=T_ZWARCIA_S,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_OHM,
                t_usuniecia_s=T_ZDJECIA_S,
            ),
        )
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(harmonogram, nastawy(dt_s=dt_s, horyzont_s=HORYZONT_S, krok_wyjscia_s=dt_s))
    ).uruchom()
    stan_szyny = uklad.szyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["SYS"], uklad.punkt_pracy.moce_zrodel_pu["SYS1"]
    )
    odniesienie = kat_szyny(stan_szyny)
    return (
        np.array(wynik.os_czasu_s),
        np.array(wynik.probki["delta_rad@G1"]) - odniesienie,
    )


def _wzorzec(uklad, *, dt_s: float = KROK_S):
    x_f_pu = X_ZWARCIA_OHM / impedancja_z_napiecia_i_mocy_ohm(U_N_KV, S_BAZOWA_MVA)
    return most.przebieg(
        uklad,
        horyzont_s=HORYZONT_S,
        dt_s=dt_s,
        zwarcie={
            "t_s": T_ZWARCIA_S,
            "t_usuniecia_s": T_ZDJECIA_S,
            "r_f_pu": 0.0,
            "x_f_pu": x_f_pu,
        },
    )


def test_warunki_poczatkowe_sa_tozsame_z_wyrocznia() -> None:
    """Bez zgodnych warunkow poczatkowych porownanie trajektorii nic nie znaczy."""
    uklad = zbuduj_smib(d_pu=0.0)
    system = most.zbuduj_system(uklad, zwarcie=None)
    system.PFlow.run()
    system.TDS.config.tf = 0.1
    system.TDS.config.tstep = KROK_S
    system.TDS.init()
    delta_wyroczni = float(system.GENCLS.delta.v[0])

    stan_maszyny = uklad.maszyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["GEN"], uklad.punkt_pracy.moce_zrodel_pu["G1"]
    )
    assert delta_wyroczni == pytest.approx(float(stan_maszyny[0]), abs=1e-8)


def test_trajektoria_kata_zgadza_sie_z_wyrocznia_odcinkami() -> None:
    """Blad kata raportowany ODCINKAMI: przed zwarciem / w oknie / po zdjeciu."""
    uklad = zbuduj_smib(d_pu=0.0)
    czas, delta = _nasz_przebieg(uklad)
    wzorzec = _wzorzec(uklad)

    przed = most.blad_trajektorii(czas, delta, wzorzec, od_s=0.0, do_s=T_ZWARCIA_S)
    okno = most.blad_trajektorii(czas, delta, wzorzec, od_s=T_ZWARCIA_S, do_s=T_ZDJECIA_S)
    po = most.blad_trajektorii(czas, delta, wzorzec, od_s=T_ZDJECIA_S, do_s=HORYZONT_S)

    assert przed <= PROG_PRZED_RAD, f"przed zwarciem {przed:.3e} rad"
    assert okno <= PROG_OKNO_RAD, f"w oknie zwarcia {okno:.3e} rad"
    assert po <= PROG_PO_RAD, f"po zdjeciu {po:.3e} rad"


def test_podloga_roznicy_nie_maleje_z_krokiem() -> None:
    """Roznica wobec wyroczni ma PODLOGE — to pomiar, nie usterka do strojenia.

    Gdyby roznica malala z krokiem, bylaby bledem calkowania jednej ze stron i
    nalezaloby ja usunac. Nie maleje, wiec jest roznica SEMANTYKI (nieustalona —
    patrz docstring modulu) i prog testu ma ja obejmowac, a nie udawac, ze jej nie ma.
    """
    uklad = zbuduj_smib(d_pu=0.0)
    bledy = []
    for dt_s in (KROK_S, KROK_S / 2.0):
        czas, delta = _nasz_przebieg(uklad, dt_s=dt_s)
        bledy.append(
            most.blad_trajektorii(
                czas, delta, _wzorzec(uklad, dt_s=dt_s), od_s=0.0, do_s=HORYZONT_S
            )
        )
    assert all(blad <= PROG_PO_RAD for blad in bledy)
    assert bledy[1] > 0.5 * bledy[0], (
        f"roznica zmalala z {bledy[0]:.3e} do {bledy[1]:.3e} — to bylby blad calkowania, "
        "nie podloga semantyki; prog i opis w docstringu wymagaja ponownego pomiaru"
    )
