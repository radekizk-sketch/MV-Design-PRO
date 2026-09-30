"""`ConverterType` — statyzmy GFM (karta W2-C) i skasowane pole widma (karta AB-H0 §0.7.5).

Dwa pola opcjonalne kontraktu katalogu przekształtników, ZERO wartości domyślnych:
`droop_p_f_percent`, `droop_q_u_percent`. Dawne pole `harmonic_spectrum_percent`
(rząd → % prądu znamionowego, bez fazy, punktu pracy, dokumentu i nazwanej bazy) jest
SKASOWANE: widmo urządzenia to osobny rekord katalogu — karta widmowa
(`dziedziny.karta_widmowa.KartaWidmowa`, przestrzeń `KARTA_WIDMOWA`; reguły kształtu
widma KAT-T-009/014/015/016 przypięte parami w `test_niezmienniki_obie_strony.py`).
Klasa testu (reguła KLASA §2): {pole obecne poprawne · pole obecne niepoprawne ·
pole nieobecne} × {to_dict/from_dict round-trip} × {cała opublikowana lista 176
pozycji (pomiar 2026-09-23) — PIN 0, do czasu OD-17 (realna karta producenta)}.
"""

from __future__ import annotations

from dataclasses import fields

import pytest
from network_model.catalog.mv_converter_catalog import get_all_converter_types
from network_model.catalog.types import ConverterKind, ConverterType


def _typ(**nadpisania: object) -> ConverterType:
    dane: dict = {
        "id": "conv-test-1",
        "name": "Falownik testowy",
        "kind": ConverterKind.PV,
        "un_kv": 15.0,
        "sn_mva": 2.2,
        "pmax_mw": 2.0,
    }
    dane.update(nadpisania)
    return ConverterType(**dane)


# ---------------------------------------------------------------------------
# Domyślnie None — zero wartości domyślnych
# ---------------------------------------------------------------------------


def test_pola_domyslnie_zadne() -> None:
    typ = _typ()
    assert typ.droop_p_f_percent is None
    assert typ.droop_q_u_percent is None
    slownik = typ.to_dict()
    assert "droop_p_f_percent" not in slownik
    assert "droop_q_u_percent" not in slownik


# ---------------------------------------------------------------------------
# Pole obecne poprawne — round-trip to_dict/from_dict
# ---------------------------------------------------------------------------


def test_droop_round_trip_to_dict_from_dict() -> None:
    typ = _typ(control_mode="GRID_FORMING", droop_p_f_percent=4.0, droop_q_u_percent=3.0)
    slownik = typ.to_dict()
    assert slownik["droop_p_f_percent"] == pytest.approx(4.0)
    assert slownik["droop_q_u_percent"] == pytest.approx(3.0)

    odtworzony = ConverterType.from_dict(slownik)
    assert odtworzony.droop_p_f_percent == pytest.approx(4.0)
    assert odtworzony.droop_q_u_percent == pytest.approx(3.0)
    assert odtworzony.to_dict() == slownik


def test_typy_bez_nowych_pol_sa_bajtowo_identyczne_po_round_tripie() -> None:
    """Kontrola dwustronna: pozycja BEZ nowych pól zostaje bajtowo identyczna
    (byte-identical round-trip, ADR-011 §5b) — dodanie pola nie rusza
    istniejących opublikowanych typów."""
    typ = _typ()
    odtworzony = ConverterType.from_dict(typ.to_dict())
    assert odtworzony.to_dict() == typ.to_dict()
    assert odtworzony.droop_p_f_percent is None
    assert odtworzony.droop_q_u_percent is None


# ---------------------------------------------------------------------------
# Pole widma skasowane z typu (karta AB-H0 §0.7.5)
# ---------------------------------------------------------------------------


def test_pole_widma_skasowane_z_kontraktu_typu() -> None:
    """Widmo urządzenia nie jest polem typu: konstruktor nie zna pola, a `to_dict`
    żadnej pozycji go nie niesie (widmo = karta widmowa, osobny rekord)."""
    assert "harmonic_spectrum_percent" not in {pole.name for pole in fields(ConverterType)}
    with pytest.raises(TypeError, match="harmonic_spectrum_percent"):
        _typ(harmonic_spectrum_percent={5: 3.0})
    assert "harmonic_spectrum_percent" not in _typ().to_dict()


# ---------------------------------------------------------------------------
# Pole obecne niepoprawne — __post_init__ odrzuca jawnie
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("wartosc", [0.0, -1.0, -0.01])
def test_droop_p_f_niedodatni_jest_odrzucony(wartosc: float) -> None:
    with pytest.raises(ValueError, match="droop_p_f_percent"):
        _typ(droop_p_f_percent=wartosc)


@pytest.mark.parametrize("wartosc", [0.0, -1.0, -0.01])
def test_droop_q_u_niedodatni_jest_odrzucony(wartosc: float) -> None:
    with pytest.raises(ValueError, match="droop_q_u_percent"):
        _typ(droop_q_u_percent=wartosc)


# ---------------------------------------------------------------------------
# KLASA — cała opublikowana lista katalogu: PIN 0 (do czasu OD-17)
# ---------------------------------------------------------------------------


def test_zadna_opublikowana_pozycja_katalogu_nie_ma_widma_ani_droopu() -> None:
    """PIN 0: żaden ze 176 opublikowanych typów przekształtników (pomiar
    `get_all_converter_types()` 2026-09-23) nie deklaruje statyzmów GFM ani nie niesie
    skasowanego klucza widma, bo REPO nie ma żadnej realnej karty producenta z tymi
    danymi — podanie liczby bez źródła byłoby fabrykacją, którą karta W2-C usunęła z
    `solver_input/v126_contracts.py`. Rośnie wyłącznie wtedy, gdy do repo trafia
    policzalna karta producenta (karta OD-17); widmo — wyłącznie jako karta widmowa
    z wyciągiem dokumentu (`network_model/catalog/karty_widmowe/`)."""
    rekordy = get_all_converter_types()
    assert len(rekordy) == 176, "pomiar bazowy 2026-09-23 — zmiana liczby to inny katalog"
    z_widmem = [r["id"] for r in rekordy if "harmonic_spectrum_percent" in r["params"]]
    z_droop = [
        r["id"]
        for r in rekordy
        if r["params"].get("droop_p_f_percent") or r["params"].get("droop_q_u_percent")
    ]
    assert z_widmem == [], f"pozycje ze skasowanym kluczem widma: {z_widmem}"
    assert z_droop == [], f"pozycje z droop bez pokrycia źródłem: {z_droop}"
