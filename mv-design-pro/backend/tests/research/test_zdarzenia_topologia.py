"""Zdarzenia topologiczne: tożsamość bocznika, chwila zero, regularizacja zwarcia.

PO CO TEN PLIK (pakiet E audytu). Trzy defekty, z których każdy powodował, że
symulacja liczyła INNĄ sieć niż ta, którą opisywał scenariusz — i żaden nie
dawał o sobie znać:

  E1. ``ZdjecieZwarcia`` wołało ``bez_bocznikow_na(szyna)``, czyli kasowało
      WSZYSTKIE boczniki szyny. Bateria kondensatorów istniejąca przed zwarciem
      znikała razem ze zwarciem i już nie wracała.
  E2. Zdarzenie zadane na ``t = 0`` nie było stosowane NIGDY (siatka odrzucała
      chwilę zero, a pętla pytała o przedział otwarty od lewej), ale nadal
      figurowało w harmonogramie.
  E3. Zwarcie metaliczne jest regularizowane arbitralną admitancją ``1e6``.
      Arbitralna stała w fizyce wymaga POMIARU wrażliwości, nie zapewnienia.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.benchmarki import czas_krytyczny_zwarcia, harmonogram_zwarcia, smib
from dynamic_lab.siec import ZRODLO_MODEL, Bocznik, TopologiaSieci
from dynamic_lab.silnik import SilnikRMS
from dynamic_lab.zdarzenia import (
    HarmonogramZdarzen,
    ZdjecieZwarcia,
    ZwarcieTrojfazowe,
)


def _topologia_z_kondensatorem() -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("SZT", "GEN"),
        galezie=[],
        boczniki=[Bocznik(szyna="GEN", g_pu=0.0, b_pu=0.30, zrodlo=ZRODLO_MODEL)],
        szyny_sztywne={"SZT": complex(1.0, 0.0)},
    )


# ---------------------------------------------------------------------------
# E1 — zdjęcie zwarcia usuwa DOKŁADNIE bocznik tego zwarcia
# ---------------------------------------------------------------------------


def test_zdjecie_zwarcia_zostawia_kondensator_i_odtwarza_ybus() -> None:
    """Inwariant: fault-on -> fault-off bez innych zdarzeń daje Y_post == Y_pre.

    Przy starym zachowaniu bateria kondensatorów na tej samej szynie znikała
    razem ze zwarciem, więc ``Y_post != Y_pre`` — i nic tego nie sygnalizowało.
    """
    przed = _topologia_z_kondensatorem()
    y_przed = przed.zbuduj_ybus()

    zwarcie = ZwarcieTrojfazowe(czas_s=0.5, szyna="GEN")
    w_zwarciu = zwarcie.zastosuj(przed)
    assert len(w_zwarciu.boczniki) == 2

    po = ZdjecieZwarcia(czas_s=0.65, szyna="GEN").zastosuj(w_zwarciu)

    kondensatory = [b for b in po.boczniki if b.zrodlo == ZRODLO_MODEL]
    assert len(kondensatory) == 1, "bateria kondensatorów musi przeżyć zdjęcie zwarcia"
    assert kondensatory[0].b_pu == pytest.approx(0.30)
    assert np.allclose(po.zbuduj_ybus(), y_przed), "Ybus po zdjęciu != Ybus sprzed zwarcia"


def test_zdjecie_zwarcia_zostawia_inne_zwarcie_na_tej_samej_szynie() -> None:
    """„Inny event shunt ma pozostać" — dwa zwarcia są zdejmowane niezależnie."""
    topologia = _topologia_z_kondensatorem()
    a = ZwarcieTrojfazowe(czas_s=0.5, szyna="GEN", x_f_pu=0.05)
    b = ZwarcieTrojfazowe(czas_s=0.7, szyna="GEN", x_f_pu=0.10)
    assert a.identyfikator != b.identyfikator

    topologia = b.zastosuj(a.zastosuj(topologia))
    po = ZdjecieZwarcia(czas_s=0.9, szyna="GEN", identyfikator_zwarcia=a.identyfikator).zastosuj(
        topologia
    )

    zrodla = po.zrodla_bocznikow_na("GEN")
    assert a.identyfikator not in zrodla
    assert b.identyfikator in zrodla
    assert ZRODLO_MODEL in zrodla


def test_niejednoznaczne_zdjecie_zwarcia_jest_bledem_glosnym() -> None:
    """Dwa zwarcia na szynie bez wskazania — cisza tutaj byłaby zgadywaniem."""
    topologia = _topologia_z_kondensatorem()
    topologia = ZwarcieTrojfazowe(czas_s=0.7, szyna="GEN", x_f_pu=0.10).zastosuj(
        ZwarcieTrojfazowe(czas_s=0.5, szyna="GEN", x_f_pu=0.05).zastosuj(topologia)
    )
    with pytest.raises(ValueError, match="identyfikator_zwarcia"):
        ZdjecieZwarcia(czas_s=0.9, szyna="GEN").zastosuj(topologia)


def test_zdjecie_nieistniejacego_zwarcia_jest_bledem_glosnym() -> None:
    with pytest.raises(ValueError, match="nie ma bocznika zwarciowego"):
        ZdjecieZwarcia(czas_s=0.9, szyna="GEN").zastosuj(_topologia_z_kondensatorem())


# ---------------------------------------------------------------------------
# E2 — semantyka chwili zero
# ---------------------------------------------------------------------------


def test_zdarzenie_w_chwili_zero_jest_stosowane_i_zapisane_w_sladzie() -> None:
    """``x0`` to stan 0-, próbka w t=0 to stan 0+, ślad wskazuje dokładnie 0.0.

    Przy starym zachowaniu zwarcie zadane na t=0 nie zmieniało niczego, a wynik
    i tak deklarował, że scenariusz je zawierał.
    """
    model, moce = smib(h_s=4.0, x_linii_pu=0.15)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.002)
    x0 = silnik.inicjalizuj(moce)

    wynik = silnik.symuluj(
        x0,
        czas_koncowy_s=0.1,
        harmonogram=HarmonogramZdarzen([ZwarcieTrojfazowe(czas_s=0.0, szyna="GEN")]),
    )

    assert len(wynik.zdarzenia) == 1, "zdarzenie w t=0 musi zostać ZASTOSOWANE"
    zapis = wynik.zdarzenia[0]
    assert zapis["czas_s"] == 0.0
    assert zapis["czas_zastosowania_s"] == pytest.approx(0.0, abs=1e-12)
    assert zapis["blad_czasu_s"] == pytest.approx(0.0, abs=1e-12)

    # Próbka w t=0 opisuje stan 0+ — sieć JUŻ po zwarciu, więc napięcie zapadłe.
    u = np.array(wynik.sygnal("u_pu", "GEN").wartosci)
    assert u[0] < 0.1, "próbka w t=0 musi opisywać stan PO zdarzeniu (0+)"


def test_brak_zdarzenia_w_zerze_nie_zmienia_niczego() -> None:
    """Strona pozytywna: bez zdarzenia w t=0 próbka zerowa to punkt równowagi."""
    model, moce = smib(h_s=4.0, x_linii_pu=0.15)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.002)
    x0 = silnik.inicjalizuj(moce)
    wynik = silnik.symuluj(x0, czas_koncowy_s=0.1, harmonogram=HarmonogramZdarzen([]))
    assert wynik.zdarzenia == ()
    u = np.array(wynik.sygnal("u_pu", "GEN").wartosci)
    assert u[0] > 0.9


# ---------------------------------------------------------------------------
# E3 — wrażliwość na regularizację zwarcia metalicznego
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("admitancja", [1.0e4, 1.0e6, 1.0e8])
def test_regularizacja_zwarcia_daje_napiecie_odwrotnie_proporcjonalne(admitancja) -> None:
    """Napięcie w miejscu zwarcia maleje jak 1/Y — to znaczy, że bocznik DZIAŁA."""
    model, moce = smib(h_s=4.0, x_linii_pu=0.15, d_tlumienie=0.0)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.002)
    x0 = silnik.inicjalizuj(moce)
    wynik = silnik.symuluj(
        x0,
        czas_koncowy_s=0.5,
        harmonogram=harmonogram_zwarcia(
            szyna="GEN",
            chwila_s=0.2,
            czas_trwania_s=0.15,
            admitancja_metaliczna_pu=admitancja,
        ),
    )
    t = np.array(wynik.czas_s)
    u = np.array(wynik.sygnal("u_pu", "GEN").wartosci)
    u_zwarcia = float(u[(t > 0.21) & (t < 0.34)].mean())
    assert u_zwarcia == pytest.approx(10.0 / admitancja, rel=0.5)


def test_cct_nie_zalezy_istotnie_od_regularizacji() -> None:
    """POMIAR, nie zapewnienie: czy wynik inżynierski zależy od arbitralnej stałej.

    Zmierzone (2026-09-11, SMIB H=4 s, x_linii=0,15 p.u., rk4, dt=2 ms,
    dokładność bisekcji 5 ms):

        Y_f = 1e4  ->  U_zwarcia = 1,008e-03 p.u.,  CCT = 424,8 ms
        Y_f = 1e6  ->  U_zwarcia = 1,008e-05 p.u.,  CCT = 420,9 ms
        Y_f = 1e8  ->  U_zwarcia = 1,008e-07 p.u.,  CCT = 420,9 ms

    WNIOSEK. CCT dla 1e6 i 1e8 jest IDENTYCZNY — wynik jest zbieżny względem
    regularizacji i wybór 1e6 nie wnosi arbitralności do odpowiedzi
    inżynierskiej. Odstaje wyłącznie 1e4, i to z powodu fizycznego, a nie
    numerycznego: przy tej admitancji napięcie w miejscu zwarcia to wciąż
    1e-3 p.u., czyli zwarcie NIE JEST metaliczne. Cały rozrzut (3,9 ms) leży
    przy tym PONIŻEJ dokładności samej bisekcji (5 ms), więc nie jest nawet
    rozdzielczy tą metodą.

    Test pilnuje zbieżności 1e6 vs 1e8 — gdyby przyszła zmiana solvera
    wprowadziła zależność od tej stałej, ten test zapali się pierwszy.
    """
    cct_6 = czas_krytyczny_zwarcia(h_s=4.0, x_linii_pu=0.15, admitancja_metaliczna_pu=1.0e6)
    cct_8 = czas_krytyczny_zwarcia(h_s=4.0, x_linii_pu=0.15, admitancja_metaliczna_pu=1.0e8)
    assert cct_6 == pytest.approx(cct_8, abs=0.005), (
        f"CCT zależy od regularizacji: 1e6 -> {cct_6 * 1000:.1f} ms, "
        f"1e8 -> {cct_8 * 1000:.1f} ms"
    )
