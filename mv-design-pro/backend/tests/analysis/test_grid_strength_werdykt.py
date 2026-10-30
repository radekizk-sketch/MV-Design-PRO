"""Rekord werdyktu wyjaśnialnego siły sieci SCR/WSCR (karta WERDYKT-MIGRACJA-190, domena 6).

Iloczyn cech, w którym defekt mógłby się schować:
- wskaźnik {SCR węzła, WSCR zbioru} × położenie wartości {powyżej progu słabego, równa progowi
  słabemu, między progami, równa progowi bardzo słabemu, poniżej} × dane przyjęte gałęzi
  {brak, obecne};
- braki {S_sc'' brak, S_sc'' zero, S_n brak, S_n zero, oba} — brak danych ≠ spełnia;
- niezmienniki projekcji: ``verdict``/``is_weak`` ↔ status rekordu, wyjaśnienie z rekordu,
  tekst ``why_pl`` bez kodów maszynowych, determinizm ładunku.
"""

from __future__ import annotations

import json

import pytest
from analysis.grid_strength import BusStrengthInput, GridStrengthBuilder
from analysis.grid_strength.serializer import view_to_dict
from werdykt import DanaPrzyjeta, Wielkosc

_PROJEKCJA = {
    "SPELNIA": {("mocna", False)},
    "NIE_SPELNIA": {("słaba", True), ("bardzo słaba", True)},
    "NIE_OCENIONO": {("brak danych", False)},
}

_DANA = DanaPrzyjeta(
    nazwa_pl="Impedancja linii zasilającej",
    wartosc=Wielkosc(wartosc=0.4, jednostka="Ω/km"),
    powod_pl="wartość robocza z profilu typu",
    jakosc="ESTIMATED",
)

# (S_sc'' [MVA] przy S_n = 100 MVA, oczekiwana klasa)
_POLOZENIA = [
    (500.0, "mocna"),
    (300.0, "mocna"),
    (250.0, "słaba"),
    (200.0, "słaba"),
    (150.0, "bardzo słaba"),
]


def _wejscie(ref: str, s_sc: float | None, s_n: float | None, dane: bool) -> BusStrengthInput:
    return BusStrengthInput(
        ref,
        15.0,
        s_sc,
        s_n,
        nazwa_pl=f"Szyna przyłączenia {ref[-1]}",
        dane_przyjete=(_DANA,) if dane else (),
    )


@pytest.mark.parametrize("dane", [False, True], ids=["bez_danych_przyjetych", "dane_przyjete"])
@pytest.mark.parametrize("s_sc,klasa", _POLOZENIA)
def test_scr_wezla_rekord_i_projekcja(s_sc: float, klasa: str, dane: bool) -> None:
    widok = GridStrengthBuilder().build([_wejscie("bus-a", s_sc, 100.0, dane)])
    wpis = widok.entries[0]
    status = wpis.ocena.status_maszynowy
    assert (wpis.verdict, wpis.is_weak) in _PROJEKCJA[status]
    assert wpis.verdict == klasa
    assert wpis.wyjasnienie == wpis.ocena.wyjasnienie
    assert wpis.ocena.przedmiot.nazwa_pl == "Szyna przyłączenia a"
    if dane:
        assert wpis.ocena.dowod.status_danych.dane_przyjete == (_DANA,)
        assert wpis.ocena.kompletnosc_dowodu == "NIEPELNY"
    else:
        assert wpis.ocena.dowod.status_danych.dane_przyjete == ()


@pytest.mark.parametrize("dane", [False, True], ids=["bez_danych_przyjetych", "dane_przyjete"])
@pytest.mark.parametrize("s_sc,klasa", _POLOZENIA)
def test_wscr_zbioru_rekord_i_projekcja(s_sc: float, klasa: str, dane: bool) -> None:
    # Węzeł z kompletem danych (WSCR jednego źródła = jego SCR) obok węzła bez S_sc'' —
    # węzeł niekompletny jest wyłączony ze zbioru WSCR, nie psuje rekordu zbioru.
    widok = GridStrengthBuilder().build(
        [_wejscie("bus-a", s_sc, 100.0, dane), _wejscie("bus-b", None, 100.0, False)]
    )
    s = widok.summary
    assert s.wscr == pytest.approx(s_sc / 100.0)
    status = s.wscr_ocena.status_maszynowy
    assert s.wscr_verdict in {klasa_kodu for klasa_kodu, _ in _PROJEKCJA[status]}
    assert s.wscr_verdict == klasa
    assert s.wscr_wyjasnienie == s.wscr_ocena.wyjasnienie
    if dane:
        assert _DANA in s.wscr_ocena.dowod.status_danych.dane_przyjete
        assert s.wscr_ocena.kompletnosc_dowodu == "NIEPELNY"


@pytest.mark.parametrize(
    "s_sc,s_n",
    [(None, 100.0), (0.0, 100.0), (300.0, None), (300.0, 0.0), (None, None)],
    ids=["ssc_brak", "ssc_zero", "sn_brak", "sn_zero", "oba"],
)
def test_brak_danych_nie_spelnia(s_sc: float | None, s_n: float | None) -> None:
    widok = GridStrengthBuilder().build([_wejscie("bus-a", s_sc, s_n, False)])
    wpis = widok.entries[0]
    assert wpis.ocena.status_maszynowy == "NIE_OCENIONO"
    assert (wpis.verdict, wpis.is_weak) == ("brak danych", False)
    assert wpis.ocena.wynik is None
    # Tekst dla inżyniera nazywa brak po polsku, bez kodu pola.
    for kod in wpis.missing_data:
        assert kod not in wpis.why_pl
    # WSCR bez żadnego węzła z kompletem danych: rekord nieoceniony, nie „mocna”.
    assert widok.summary.wscr is None
    assert widok.summary.wscr_ocena.status_maszynowy == "NIE_OCENIONO"
    assert widok.summary.wscr_verdict == "brak danych"


def test_ladunek_deterministyczny_z_rekordami() -> None:
    wejscia = [_wejscie("bus-b", 150.0, 100.0, True), _wejscie("bus-a", 500.0, 100.0, False)]
    a = json.dumps(view_to_dict(GridStrengthBuilder().build(wejscia)), sort_keys=True)
    b = json.dumps(
        view_to_dict(GridStrengthBuilder().build(list(reversed(wejscia)))), sort_keys=True
    )
    assert a == b
    ladunek = json.loads(a)
    for wpis in ladunek["entries"]:
        assert wpis["ocena"]["wyjasnienie"] == wpis["wyjasnienie"]
    assert ladunek["summary"]["wscr_ocena"]["wyjasnienie"] == ladunek["summary"]["wscr_wyjasnienie"]
