"""Przenośność projekcji rozpływu zwarciowego i skrótu wyniku między maszynami.

Pomiar 2026-09-16 (CI run 5030 vs 5031 na tym samym commicie `a8bb926d`, dwa
runnery GitHub): fixtury harnessu z realnego biegu różniły się (a) kierunkiem
prądu gałęzi o `i_ka = 1.97e-18` („from_to" vs „to_from" — znak zera numerycznego),
(b) `result_hash` liczonym z surowych `float` (ostatni bit), (c) tekstem z surowym
`repr` floata („4.611507168332454" vs „…455"). Trzy mechanizmy, jedna klasa:
wynik prezentowany nie może zależeć od maszyny. Solver FROZEN nietknięty —
naprawy leżą w projekcji prezentacyjnej i w warstwie kontraktu.
"""

from __future__ import annotations

from analysis.sanity_bounds.short_circuit_bounds import evaluate_short_circuit_current
from api.v125_contracts import _stable_hash
from application.analyses.kontrakt_liczb import kwantyzuj_kontrakt
from enm.canonical_analysis import PROG_PRADU_ZEROWEGO_KA, _sc_rozplyw_galeziowy

_WEZLY = {"a": {"name": "Szyna A"}, "b": {"name": "Szyna B"}}
_GALEZIE = {"g1": {"name": "Kabel A-B"}}


def _wpis(i_contrib_a: float, direction: str) -> dict:
    return {
        "branch_id": "g1",
        "source_id": "THEVENIN_GRID",
        "from_node_id": "a",
        "to_node_id": "b",
        "i_contrib_a": i_contrib_a,
        "direction": direction,
    }


def test_prad_numerycznie_zerowy_nie_ma_kierunku() -> None:
    """|I| < 1 µA → token „brak" niezależnie od znaku, który dał solver."""
    for direction in ("from_to", "to_from"):
        wynik = _sc_rozplyw_galeziowy([_wpis(1.97e-15, direction)], _WEZLY, _GALEZIE)
        assert wynik is not None
        assert wynik[0]["direction"] == "brak"
        assert wynik[0]["i_ka"] == 1.97e-18  # surowa wartość zostaje (bez korekty)


def test_prad_realny_zachowuje_kierunek_solvera() -> None:
    """Dokładnie na progu i powyżej: kierunek wprost z solvera, bez interpretacji."""
    na_progu = _sc_rozplyw_galeziowy(
        [_wpis(PROG_PRADU_ZEROWEGO_KA * 1000.0, "to_from")], _WEZLY, _GALEZIE
    )
    assert na_progu is not None and na_progu[0]["direction"] == "to_from"
    realny = _sc_rozplyw_galeziowy([_wpis(5.0, "from_to")], _WEZLY, _GALEZIE)
    assert realny is not None and realny[0]["direction"] == "from_to"
    brak = _sc_rozplyw_galeziowy([_wpis(None, "from_to")], _WEZLY, _GALEZIE)  # type: ignore[arg-type]
    assert brak is not None and brak[0]["direction"] == "from_to"  # brak prądu ≠ zero


def test_skrot_wyniku_ignoruje_ostatni_bit_floata() -> None:
    """Dwa artefakty różniące się o 1e-16 względnie dają ten sam skrót; 1e-6 — inny."""
    a = {"rows": [{"ikss_ka": 4.611507168332454, "nested": [1.0, 2.5]}]}
    b = {"rows": [{"ikss_ka": 4.611507168332455, "nested": [1.0, 2.5]}]}
    c = {"rows": [{"ikss_ka": 4.6115121, "nested": [1.0, 2.5]}]}
    assert _stable_hash(kwantyzuj_kontrakt(a, scisle=False)) == _stable_hash(
        kwantyzuj_kontrakt(b, scisle=False)
    )
    assert _stable_hash(kwantyzuj_kontrakt(a, scisle=False)) != _stable_hash(
        kwantyzuj_kontrakt(c, scisle=False)
    )
    # stary skrót (surowe liczby) rozróżniał a i b — to była wada, nie cecha
    assert _stable_hash(a) != _stable_hash(b)


def test_tekst_werdyktu_sanity_bez_surowego_floata() -> None:
    """Liczba w tekście z 3 miejscami kA: ostatnia cyfra repr nie wpływa na tekst."""
    w1 = evaluate_short_circuit_current(15.0, 4.611507168332454)
    w2 = evaluate_short_circuit_current(15.0, 4.611507168332455)
    assert w1.why_pl == w2.why_pl
    assert "4.612 kA" in w1.why_pl
    assert "4.611507" not in w1.why_pl
