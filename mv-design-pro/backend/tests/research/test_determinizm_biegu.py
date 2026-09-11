"""Bieg jest funkcją (model, wejście, scenariusz) — NIE historii obiektu Pythona.

PO CO TEN PLIK (P0, runda 3). Silnik trzymał stan mutowalny MIĘDZY biegami:
zdarzenie wołało ``solver_sieci.ustaw_topologie(...)``, a ``symuluj`` zerowało
wyłącznie liczniki. Topologia po ostatnim zdarzeniu i ostatnie zatwierdzone
napięcia przechodziły więc do NASTĘPNEGO biegu.

ZMIERZONY SKUTEK PRZED NAPRAWĄ (SMIB, rk4, dt = 5 ms). Bieg B kończy się
W TRAKCIE zwarcia, po nim bieg A bez ŻADNYCH zdarzeń na zdrowej sieci:

    U_GEN(A po B)   = 0,3213 … 0,3374 p.u.
    U_GEN(A świeży) = 1,0121 p.u.
    max|różnica|    = 6,908e-01 p.u.

a wynik biegu A deklarował ``odcisk_topologii`` sieci ZDROWEJ, bo odcisk czytał
``self.model.topologia``, podczas gdy solver liczył na zmutowanej. Wynik nie był
więc tylko błędny — TWIERDZIŁ, że policzył inną sieć, niż policzył. Dokładnie ten
mechanizm wywrócił ``test_gfm_ogranicznik`` w CI (residuum 6,890e-01), mimo że
ten sam plik uruchamiany osobno przechodził: w pełnym biegu kolejność jest inna.

Matematycznie wymagamy:  R(A | po B) = R(A | świeży silnik).
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.benchmarki import smib
from dynamic_lab.silnik import SilnikRMS
from dynamic_lab.zdarzenia import HarmonogramZdarzen, ZwarcieTrojfazowe


def _swiezy():
    model, moce = smib(h_s=4.0, x_linii_pu=0.15)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.005)
    return silnik, silnik.inicjalizuj(moce)


def _bieg_a(silnik, x0):
    """Sieć ZDROWA, zero zdarzeń — wynik nie może zależeć od tego, co było wcześniej."""
    return silnik.symuluj(x0, czas_koncowy_s=0.3, harmonogram=HarmonogramZdarzen([]))


def _bieg_b_urwany_w_zwarciu(silnik, x0):
    """Zwarcie ZAŁĄCZONE i nigdy niezdjęte — najgorszy przypadek dla stanu solvera."""
    return silnik.symuluj(
        x0,
        czas_koncowy_s=0.3,
        harmonogram=HarmonogramZdarzen([ZwarcieTrojfazowe(czas_s=0.1, szyna="GEN", x_f_pu=0.05)]),
    )


@pytest.mark.parametrize("poprzedzajace", ["brak", "B", "A_potem_B", "A"])
def test_bieg_nie_zalezy_od_historii_silnika(poprzedzajace: str) -> None:
    """Macierz powtarzalności: cztery historie, jeden wynik."""
    silnik_ref, x_ref = _swiezy()
    referencja = _bieg_a(silnik_ref, x_ref)

    silnik, x0 = _swiezy()
    if poprzedzajace == "B":
        _bieg_b_urwany_w_zwarciu(silnik, x0)
    elif poprzedzajace == "A_potem_B":
        _bieg_a(silnik, x0)
        _bieg_b_urwany_w_zwarciu(silnik, x0)
    elif poprzedzajace == "A":
        _bieg_a(silnik, x0)

    wynik = _bieg_a(silnik, x0)

    assert wynik.odcisk_wyniku() == referencja.odcisk_wyniku(), (
        f"historia „{poprzedzajace}” zmieniła TOŻSAMOŚĆ wyniku"
    )
    u = np.array(wynik.sygnal("u_pu", "GEN").wartosci)
    u_ref = np.array(referencja.sygnal("u_pu", "GEN").wartosci)
    assert np.array_equal(u, u_ref), (
        f"historia „{poprzedzajace}” zmieniła TRAJEKTORIĘ: "
        f"max|dU| = {np.max(np.abs(u - u_ref)):.3e}"
    )


def test_zwarcie_z_poprzedniego_biegu_nie_wchodzi_do_nastepnego() -> None:
    """Reprodukcja defektu wprost: sieć zdrowa ma mieć napięcie sieci zdrowej.

    Ten test padłby przed naprawą z U ≈ 0,32 p.u. zamiast ≈ 1,01 p.u.
    """
    silnik, x0 = _swiezy()
    _bieg_b_urwany_w_zwarciu(silnik, x0)

    wynik = _bieg_a(silnik, x0)
    u = np.array(wynik.sygnal("u_pu", "GEN").wartosci)
    assert u.min() > 0.9, f"bieg bez zdarzeń liczył sieć w zwarciu (U_min={u.min():.4f})"
    assert wynik.zdarzenia == ()


def test_solver_zaczyna_kazdy_bieg_od_topologii_modelu() -> None:
    """Stan wewnętrzny solvera po biegu ze zwarciem NIE przechodzi dalej."""
    silnik, x0 = _swiezy()
    bocznikow_przed = len(silnik.solver_sieci.topologia.boczniki)

    _bieg_b_urwany_w_zwarciu(silnik, x0)
    assert len(silnik.solver_sieci.topologia.boczniki) == bocznikow_przed + 1, (
        "test przestałby mierzyć cokolwiek, gdyby zwarcie nie dodało bocznika"
    )

    _bieg_a(silnik, x0)
    assert len(silnik.solver_sieci.topologia.boczniki) == bocznikow_przed


def test_bieg_nie_mutuje_definicji_topologii_modelu() -> None:
    """Kopia na bieg: zdarzenie nie może zmienić modelu widzianego przez inne biegi."""
    silnik, x0 = _swiezy()
    bocznikow_w_modelu = len(silnik.model.topologia.boczniki)
    _bieg_b_urwany_w_zwarciu(silnik, x0)
    assert len(silnik.model.topologia.boczniki) == bocznikow_w_modelu
