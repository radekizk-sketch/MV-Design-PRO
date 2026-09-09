"""`ConverterType` — widmo harmonicznych i statyzmy GFM (karta W2-C).

Trzy pola opcjonalne dodane do kontraktu katalogu przekształtników, ZERO wartości
domyślnych: `harmonic_spectrum_percent`, `droop_p_f_percent`, `droop_q_u_percent`.
Klasa testu (reguła KLASA §2): {pole obecne poprawne · pole obecne niepoprawne ·
pole nieobecne} × {to_dict/from_dict round-trip} × {cała opublikowana lista 168
pozycji — PIN 0, do czasu OD-17 (karta z realną kartą producenta)}.
"""

from __future__ import annotations

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
    assert typ.harmonic_spectrum_percent is None
    assert typ.droop_p_f_percent is None
    assert typ.droop_q_u_percent is None
    slownik = typ.to_dict()
    assert "harmonic_spectrum_percent" not in slownik
    assert "droop_p_f_percent" not in slownik
    assert "droop_q_u_percent" not in slownik


# ---------------------------------------------------------------------------
# Pole obecne poprawne — round-trip to_dict/from_dict
# ---------------------------------------------------------------------------


def test_widmo_i_droop_round_trip_to_dict_from_dict() -> None:
    typ = _typ(
        control_mode="GRID_FORMING",
        harmonic_spectrum_percent={5: 4.5, 7: 2.1, 11: 1.0},
        droop_p_f_percent=4.0,
        droop_q_u_percent=3.0,
    )
    slownik = typ.to_dict()
    # JSON nie zna kluczy całkowitych — to_dict stringuje klucze widma.
    assert slownik["harmonic_spectrum_percent"] == {"5": 4.5, "7": 2.1, "11": 1.0}
    assert slownik["droop_p_f_percent"] == pytest.approx(4.0)
    assert slownik["droop_q_u_percent"] == pytest.approx(3.0)

    odtworzony = ConverterType.from_dict(slownik)
    assert odtworzony.harmonic_spectrum_percent == {5: 4.5, 7: 2.1, 11: 1.0}
    assert odtworzony.droop_p_f_percent == pytest.approx(4.0)
    assert odtworzony.droop_q_u_percent == pytest.approx(3.0)


def test_typy_bez_nowych_pol_sa_bajtowo_identyczne_po_round_tripie() -> None:
    """Kontrola dwustronna: pozycja BEZ nowych pól zostaje bajtowo identyczna
    (byte-identical round-trip, ADR-011 §5b) — dodanie pola nie rusza
    istniejących opublikowanych typów."""
    typ = _typ()
    odtworzony = ConverterType.from_dict(typ.to_dict())
    assert odtworzony.to_dict() == typ.to_dict()
    assert odtworzony.harmonic_spectrum_percent is None
    assert odtworzony.droop_p_f_percent is None
    assert odtworzony.droop_q_u_percent is None


# ---------------------------------------------------------------------------
# Pole obecne niepoprawne — __post_init__ odrzuca jawnie
# ---------------------------------------------------------------------------


def test_widmo_puste_jest_odrzucone() -> None:
    with pytest.raises(ValueError, match="nie moze byc puste"):
        _typ(harmonic_spectrum_percent={})


@pytest.mark.parametrize("rzad", [1, 0, -5, 51, 100])
def test_widmo_z_rzedem_poza_2_50_jest_odrzucone(rzad: int) -> None:
    with pytest.raises(ValueError, match="2..50"):
        _typ(harmonic_spectrum_percent={rzad: 3.0})


@pytest.mark.parametrize("procent", [-0.1, 100.1, 250.0])
def test_widmo_z_procentem_poza_0_100_jest_odrzucone(procent: float) -> None:
    with pytest.raises(ValueError, match="0..100"):
        _typ(harmonic_spectrum_percent={5: procent})


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
    """PIN 0: żaden z 168 opublikowanych typów przekształtników nie deklaruje
    widma harmonicznych ani statyzmów GFM, bo REPO nie niesie żadnej realnej
    karty producenta z tymi danymi (`ConverterType.harmonic_spectrum_percent`
    docstring) — podanie liczby bez źródła byłoby dokładnie tą fabrykacją, którą
    ta karta usuwa z `solver_input/v126_contracts.py`. Rośnie wyłącznie wtedy,
    gdy do repo trafia policzalna karta producenta (karta OD-17) — zmiana tego
    pinu bez takiego źródła jest naruszeniem tej samej reguły."""
    rekordy = get_all_converter_types()
    assert (
        len(rekordy) >= 100
    ), "pomiar bazowy (168 na dzień karty W2-C) — spadek poniżej sugeruje inny katalog"
    z_widmem = [r["id"] for r in rekordy if r["params"].get("harmonic_spectrum_percent")]
    z_droop = [
        r["id"]
        for r in rekordy
        if r["params"].get("droop_p_f_percent") or r["params"].get("droop_q_u_percent")
    ]
    assert z_widmem == [], f"pozycje z widmem bez pokrycia źródłem: {z_widmem}"
    assert z_droop == [], f"pozycje z droop bez pokrycia źródłem: {z_droop}"
