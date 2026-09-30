"""Testy `network_model.core.wklad_zwarciowy_przeksztaltnika` (karta S-2 AUTORYTET).

Iloczyn cech (KLASA NIE INSTANCJA, CLAUDE.md): {deklaracja poprawna / brak /
NaN / +Inf / -Inf / zero / ujemna / bool / tekst} x {I_n poprawny / brak /
zero / ujemny / nieskończony} — nie tylko przykład z karty (k_sc<=0).
"""

from __future__ import annotations

import math

import pytest
from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    K_SC_DOMYSLNY_SYSTEMOWY,
    K_SC_ZRODLO_DEKLARACJA,
    K_SC_ZRODLO_DOMYSLNE,
    K_SC_ZRODLO_NIEPOPRAWNE,
    K_SC_ZRODLO_POZA_DZIEDZINA,
    K_SC_ZRODLO_PRAD_NIEPOPRAWNY,
    prad_wkladu_zwarciowego,
    wspolczynnik_wkladu_zwarciowego,
)

# ---------------------------------------------------------------------------
# wspolczynnik_wkladu_zwarciowego — trzy stany
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("wartosc", [1.1, 1.35, 0.9, 1e-6, 1.0, 5.0])
def test_deklaracja_poprawna_zwraca_ta_sama_wartosc_i_znacznik_deklaracja(
    wartosc: float,
) -> None:
    k_sc, znacznik = wspolczynnik_wkladu_zwarciowego(wartosc)
    assert k_sc == wartosc
    assert znacznik == K_SC_ZRODLO_DEKLARACJA


def test_brak_deklaracji_daje_domyslke_systemowa() -> None:
    k_sc, znacznik = wspolczynnik_wkladu_zwarciowego(None)
    assert k_sc == K_SC_DOMYSLNY_SYSTEMOWY
    assert znacznik == K_SC_ZRODLO_DOMYSLNE


@pytest.mark.parametrize(
    "wartosc",
    [
        float("nan"),
        float("inf"),
        float("-inf"),
        0.0,
        -1.0,
        -0.001,
        True,
        False,
        "1.1",
        [1.1],
        {"k_sc": 1.1},
    ],
)
def test_kazda_niepoprawna_deklaracja_daje_dane_niepoprawne(wartosc: object) -> None:
    """Iloczyn cech: WSZYSTKIE enumerowane w karcie przypadki (NaN, ±Inf, 0,
    ujemna, bool, tekst) plus dwa dodatkowe typy (list/dict) jako dowód, że
    predykat odrzuca KAŻDĄ wartość spoza `int|float` skończonych dodatnich."""
    k_sc, znacznik = wspolczynnik_wkladu_zwarciowego(wartosc)
    assert k_sc == K_SC_DOMYSLNY_SYSTEMOWY
    assert znacznik == K_SC_ZRODLO_NIEPOPRAWNE


def test_zwracana_wartosc_zawsze_skonczona_i_dodatnia_nawet_dla_niepoprawnej() -> None:
    for wartosc in (float("nan"), float("inf"), -5.0, 0.0, "x"):
        k_sc, _ = wspolczynnik_wkladu_zwarciowego(wartosc)
        assert math.isfinite(k_sc)
        assert k_sc > 0.0


# ---------------------------------------------------------------------------
# prad_wkladu_zwarciowego — kontrola dziedziny WYNIKU (iloczyn), nie tylko czynników.
# ---------------------------------------------------------------------------


def test_prad_wkladu_deklaracja_i_prad_poprawne_mnozy_wprost() -> None:
    prad, znacznik = prad_wkladu_zwarciowego(1.3, 1000.0)
    assert prad == pytest.approx(1300.0)
    assert znacznik == K_SC_ZRODLO_DEKLARACJA


def test_prad_wkladu_brak_deklaracji_uzywa_domyslki() -> None:
    prad, znacznik = prad_wkladu_zwarciowego(None, 1000.0)
    assert prad == pytest.approx(1100.0)
    assert znacznik == K_SC_ZRODLO_DOMYSLNE


@pytest.mark.parametrize(
    "i_n_a",
    [None, 0.0, -1.0, float("inf"), float("nan"), "1000", True],
)
def test_prad_wkladu_i_n_niepoprawny_nie_udaje_wkladu_zerowego(i_n_a: object) -> None:
    """Iloczyn cech: KAŻDA niepoprawna wartość I_n (nie tylko `None`) musi dać
    znacznik PRAD_ZNAMIONOWY_NIEPOPRAWNY, nie ciche 0 A ze znacznikiem DEKLARACJA
    (defekt, który zaniżałby prąd zwarciowy — patrz docstring modułu)."""
    prad, znacznik = prad_wkladu_zwarciowego(1.3, i_n_a)
    assert prad == 0.0
    assert znacznik == K_SC_ZRODLO_PRAD_NIEPOPRAWNY


def test_prad_wkladu_iloczyn_poza_dziedzina_mimo_czynnikow_poprawnych() -> None:
    """P1-DELTA-07: k_sc=1e308 i I_n=1000 A są KAŻDY z osobna skończone i
    dodatnie (przechodzą `_jest_liczba_skonczona_dodatnia`), ale iloczyn jest
    `inf` w arytmetyce IEEE-754 — kontrola musi być na WYNIKU, nie na czynnikach."""
    prad, znacznik = prad_wkladu_zwarciowego(1e308, 1000.0)
    assert math.isfinite(prad)
    assert prad == pytest.approx(K_SC_DOMYSLNY_SYSTEMOWY * 1000.0)
    assert znacznik == K_SC_ZRODLO_POZA_DZIEDZINA


def test_prad_wkladu_iloczyn_ekstremalny_z_obu_stron() -> None:
    prad, znacznik = prad_wkladu_zwarciowego(1e200, 1e200)
    assert math.isfinite(prad)
    assert znacznik == K_SC_ZRODLO_POZA_DZIEDZINA


def test_prad_wkladu_niepoprawna_deklaracja_i_niepoprawny_prad_priorytet_pradu() -> None:
    """Gdy OBIE wielkości są niepoprawne, znacznik odzwierciedla I_n (kontrola
    I_n jest wykonywana niezależnie od tego, czym jest k_sc) — dokumentuje
    kolejność sprawdzeń, nie tylko wynik pojedynczej ścieżki."""
    prad, znacznik = prad_wkladu_zwarciowego("tekst", -5.0)
    assert prad == 0.0
    assert znacznik == K_SC_ZRODLO_PRAD_NIEPOPRAWNY


@pytest.mark.parametrize("k_sc", [1e308, 1e250, 1e100])
@pytest.mark.parametrize("i_n_a", [1000.0, 50000.0, 1.0])
def test_ik_sc_a_zawsze_skonczone_iloczyn_cech(k_sc: float, i_n_a: float) -> None:
    """DoD karty (§2): `ik_sc_a` skończone dla k_sc = 1e308 — sprawdzone jako
    iloczyn cech (kilka wartości k_sc x kilka wartości I_n), nie jeden przykład."""
    prad, _ = prad_wkladu_zwarciowego(k_sc, i_n_a)
    assert math.isfinite(prad)
