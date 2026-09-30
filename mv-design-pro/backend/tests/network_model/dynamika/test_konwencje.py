"""Konwencje: uklad dq, bazy mocy, admitancja zwarcia."""

from __future__ import annotations

import cmath
import math

import pytest
from network_model.pochodne import impedancja_z_napiecia_i_mocy_ohm
from network_model.solvers.dynamika.konwencje import (
    admitancja_zwarcia_pu,
    dq_na_siec,
    moc_zespolona_pu,
    pulsacja_bazowa_rad_s,
    siec_na_dq,
    zmiana_bazy_impedancji,
    zmiana_bazy_stalej_bezwladnosci,
)


def test_pulsacja_bazowa() -> None:
    assert pulsacja_bazowa_rad_s(50.0) == pytest.approx(2.0 * math.pi * 50.0)


@pytest.mark.parametrize("delta", [0.0, 0.31, -1.2, 2.7])
@pytest.mark.parametrize("para", [(0.0, 1.0), (0.4, -0.9), (-0.7, 0.2)])
def test_dq_i_siec_sa_wzajemnie_odwrotne(delta: float, para: tuple[float, float]) -> None:
    fazor = dq_na_siec(para[0], para[1], delta)
    assert siec_na_dq(fazor, delta) == pytest.approx(para, abs=1e-14)


@pytest.mark.parametrize("delta", [0.0, 0.43, -0.8])
@pytest.mark.parametrize("modul", [0.9, 1.05, 1.4])
def test_os_q_daje_kanoniczne_e_za_x(delta: float, modul: float) -> None:
    """Napiecie na osi q (`E_d = 0`) w ukladzie sieciowym to dokladnie `E * exp(j delta)`.

    To jest sprawdzian TOZSAMOSCIOWY konwencji: model klasyczny trzyma SEM na osi
    q, wiec kazda inna konwencja obrotu daloby inny kat wirnika przy tym samym
    punkcie pracy — i rozjazd bylby widoczny dopiero w zwarciu.
    """
    assert dq_na_siec(0.0, modul, delta) == pytest.approx(modul * cmath.exp(1j * delta))


def test_zmiana_bazy_impedancji_w_gore_i_bezwladnosci_w_dol() -> None:
    """Predykaty pary: impedancja i bezwladnosc skaluja sie PRZECIWNIE.

    Urzadzenie 50 MVA w ukladzie 100 MVA: reaktancja pu ROSNIE dwukrotnie,
    stala bezwladnosci MALEJE dwukrotnie. Jeden przelicznik dla obu kierunkow
    bylby defektem czekajacym na pierwsza maszyne o bazie roznej od ukladu.
    """
    assert zmiana_bazy_impedancji(0.3, 50.0, 100.0) == pytest.approx(0.6)
    assert zmiana_bazy_stalej_bezwladnosci(3.5, 50.0, 100.0) == pytest.approx(1.75)
    assert zmiana_bazy_impedancji(0.3, 100.0, 100.0) == pytest.approx(0.3)
    assert zmiana_bazy_stalej_bezwladnosci(3.5, 100.0, 100.0) == pytest.approx(3.5)


@pytest.mark.parametrize("bazy", [(0.0, 100.0), (100.0, 0.0), (-50.0, 100.0)])
def test_zmiana_bazy_odrzuca_niedodatnie_bazy(bazy: tuple[float, float]) -> None:
    with pytest.raises(ValueError, match="dodatnie"):
        zmiana_bazy_impedancji(0.3, bazy[0], bazy[1])
    with pytest.raises(ValueError, match="dodatnie"):
        zmiana_bazy_stalej_bezwladnosci(3.5, bazy[0], bazy[1])


def test_moc_zespolona_z_napiecia_i_pradu() -> None:
    napiecie = complex(1.02, 0.11)
    prad = complex(0.7, -0.3)
    assert moc_zespolona_pu(napiecie, prad) == pytest.approx(napiecie * prad.conjugate())


def test_admitancja_zwarcia_uzywa_bazy_z_pochodnych() -> None:
    """Baza impedancji wezla pochodzi z `network_model/pochodne`, nie z wlasnej kopii."""
    u_n_kv, s_bazowa = 15.0, 100.0
    z_bazowa = impedancja_z_napiecia_i_mocy_ohm(u_n_kv, s_bazowa)
    admitancja = admitancja_zwarcia_pu(0.0, 0.0225, u_n_kv, s_bazowa)
    assert admitancja == pytest.approx(1.0 / (complex(0.0, 0.0225) / z_bazowa))
    assert z_bazowa == pytest.approx(2.25)


def test_zwarcie_metaliczne_nie_ma_skonczonej_admitancji() -> None:
    """`R_f = X_f = 0` to zwarcie metaliczne — brak skonczonej admitancji, nie duza liczba."""
    with pytest.raises(ZeroDivisionError, match="metaliczne"):
        admitancja_zwarcia_pu(0.0, 0.0, 15.0, 100.0)
