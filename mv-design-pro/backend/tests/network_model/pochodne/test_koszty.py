"""Algebra kosztu w `network_model/pochodne/koszty.py` (karta W10-2a): wartości i dziedzina."""

from __future__ import annotations

import math

import pytest
from network_model.pochodne.koszty import (
    koszt_cyklu_zycia_pln,
    koszt_energii_strat_pln,
    koszt_pozycji_pln,
    wspolczynnik_wartosci_biezacej,
)


def test_koszt_pozycji_i_strat() -> None:
    assert koszt_pozycji_pln(2.5, 300_000.0) == pytest.approx(750_000.0)
    assert koszt_energii_strat_pln(12.0, 450.0) == pytest.approx(5_400.0)


@pytest.mark.parametrize(
    ("stopa", "lata", "oczekiwany"),
    [
        (0.0, 1, 1.0),
        (0.0, 25, 25.0),
        (0.05, 2, 1 / 1.05 + 1 / 1.05**2),
        # Wzór zamknięty renty: (1 − (1+r)^−N) / r — niezależna droga wyznaczenia.
        (0.07, 30, (1 - 1.07**-30) / 0.07),
    ],
)
def test_wspolczynnik_wartosci_biezacej(stopa: float, lata: int, oczekiwany: float) -> None:
    assert wspolczynnik_wartosci_biezacej(stopa, lata) == pytest.approx(oczekiwany, rel=1e-12)


def test_ciaglosc_w_stopie_zero() -> None:
    assert wspolczynnik_wartosci_biezacej(1e-12, 20) == pytest.approx(20.0, rel=1e-9)


def test_lcc() -> None:
    wsp = wspolczynnik_wartosci_biezacej(0.05, 10)
    assert koszt_cyklu_zycia_pln(1_000.0, 50.0, 30.0, 0.05, 10) == pytest.approx(
        1_000.0 + 80.0 * wsp
    )


@pytest.mark.parametrize("zla", [-1.0, math.inf, math.nan])
def test_wejscie_ujemne_lub_nieskonczone_odrzucone(zla: float) -> None:
    for wywolanie in (
        lambda: koszt_pozycji_pln(zla, 1.0),
        lambda: koszt_pozycji_pln(1.0, zla),
        lambda: koszt_energii_strat_pln(zla, 1.0),
        lambda: koszt_energii_strat_pln(1.0, zla),
        lambda: wspolczynnik_wartosci_biezacej(zla, 5),
        lambda: koszt_cyklu_zycia_pln(zla, 0.0, 0.0, 0.0, 1),
        lambda: koszt_cyklu_zycia_pln(0.0, zla, 0.0, 0.0, 1),
        lambda: koszt_cyklu_zycia_pln(0.0, 0.0, zla, 0.0, 1),
    ):
        with pytest.raises(ValueError):
            wywolanie()


@pytest.mark.parametrize("lata", [0, -3, 2.5, True])
def test_horyzont_calkowity_dodatni(lata: object) -> None:
    with pytest.raises(ValueError):
        wspolczynnik_wartosci_biezacej(0.05, lata)  # type: ignore[arg-type]
