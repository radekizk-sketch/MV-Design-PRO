"""Testy `solver_input.moc_bierna_wytworcy` — JEDNO źródło prawdy o Q wytwórcy.

Karta FAB-H (H2). Iloczyn cech: {jawne q_mvar | Q-set-point karty | brak} x
{obiekt ENM Generator (atrybut) | snapshot (słownik)} — dokładnie te dwa kształty
wywołują trzy prawdziwe miejsca konsumpcji (`enm/mapping.py`,
`enm/canonical_analysis.py`, `solver_input/v126_contracts.py`).
"""

from __future__ import annotations

from types import SimpleNamespace

from solver_input.moc_bierna_wytworcy import moc_bierna_wytworcy


def test_q_jawne_z_obiektu_atrybutowego() -> None:
    gen = SimpleNamespace(q_mvar=0.42)
    wynik = moc_bierna_wytworcy(gen, None)
    assert wynik.q_mvar == 0.42
    assert wynik.zrodlo == "JAWNE"
    assert wynik.brak is False


def test_q_jawne_z_slownika_snapshotu() -> None:
    gen = {"q_mvar": 0.42}
    wynik = moc_bierna_wytworcy(gen, None)
    assert wynik.q_mvar == 0.42
    assert wynik.zrodlo == "JAWNE"


def test_q_jawne_zero_jest_jawne_nie_brakiem() -> None:
    """Kontrola dwustronna: 0,0 jawne (odczyt liczby) różni się od BRAK (brak liczby)."""
    gen = SimpleNamespace(q_mvar=0.0)
    wynik = moc_bierna_wytworcy(gen, None)
    assert wynik.q_mvar == 0.0
    assert wynik.zrodlo == "JAWNE"


def test_q_set_point_karty_gdy_q_mvar_nieznane() -> None:
    gen = SimpleNamespace(q_mvar=None)
    karta = {"qmin_mvar": 0.3, "qmax_mvar": 0.3}
    wynik = moc_bierna_wytworcy(gen, karta)
    assert wynik.q_mvar == 0.3
    assert wynik.zrodlo == "KARTA_Q_SET_POINT"
    assert wynik.brak is False


def test_q_set_point_karty_ze_slownika_snapshotu() -> None:
    gen = {"q_mvar": None}
    karta = {"qmin_mvar": -0.2, "qmax_mvar": -0.2}
    wynik = moc_bierna_wytworcy(gen, karta)
    assert wynik.q_mvar == -0.2
    assert wynik.zrodlo == "KARTA_Q_SET_POINT"


def test_karta_z_zakresem_a_nie_set_pointem_nie_wyprowadza_q() -> None:
    """qmin != qmax to ZAKRES zdolności, nie tryb stałego Q — nie wolno zgadywać
    punktu pracy w tym zakresie (to byłaby derywacja fizyczna, NOT-A-SOLVER)."""
    gen = SimpleNamespace(q_mvar=None)
    karta = {"qmin_mvar": -0.5, "qmax_mvar": 0.5}
    wynik = moc_bierna_wytworcy(gen, karta)
    assert wynik.q_mvar is None
    assert wynik.zrodlo == "BRAK"
    assert wynik.brak is True


def test_brak_gdy_zadnej_danej() -> None:
    gen = SimpleNamespace(q_mvar=None)
    wynik = moc_bierna_wytworcy(gen, None)
    assert wynik.q_mvar is None
    assert wynik.zrodlo == "BRAK"
    assert wynik.brak is True


def test_brak_gdy_karta_pusta_slownikiem() -> None:
    gen = {"q_mvar": None}
    wynik = moc_bierna_wytworcy(gen, {})
    assert wynik.brak is True


def test_q_mvar_bool_nie_jest_liczba_jawna() -> None:
    """Anty-fabrykacja: `bool` jest podklasą `int` w Pythonie — nie wolno, żeby
    `q_mvar=True`/`False` uchodziło za liczbę jawną."""
    gen = SimpleNamespace(q_mvar=True)
    wynik = moc_bierna_wytworcy(gen, None)
    assert wynik.zrodlo == "BRAK"


def test_karta_qmin_qmax_bool_nie_jest_set_pointem() -> None:
    gen = SimpleNamespace(q_mvar=None)
    karta = {"qmin_mvar": True, "qmax_mvar": True}
    wynik = moc_bierna_wytworcy(gen, karta)
    assert wynik.zrodlo == "BRAK"


def test_jawne_q_mvar_ma_pierwszenstwo_przed_karta() -> None:
    """Predykaty parami: jawne pole wygrywa, karta nie jest nawet czytana."""
    gen = SimpleNamespace(q_mvar=1.5)
    karta = {"qmin_mvar": 9.9, "qmax_mvar": 9.9}
    wynik = moc_bierna_wytworcy(gen, karta)
    assert wynik.q_mvar == 1.5
    assert wynik.zrodlo == "JAWNE"
