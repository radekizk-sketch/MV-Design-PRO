"""Rozstrzyganie rodzaju elementu po identyfikatorze (karta F-K4 faza 3).

Kontrakt: rodzaj bierze się WYŁĄCZNIE ze snapshotu ENM. Identyfikator nieznany
nie dostaje rodzaju domyślnego — bez tego pętla decyzji prowadziłaby w nikąd,
a zgadywanie rodzaju z kształtu identyfikatora byłoby fabrykacją.
"""

from __future__ import annotations

from enm.element_kind import (
    RODZAJ_GALAZ_LINIOWA,
    RODZAJ_GENERATOR,
    RODZAJ_ODBIOR,
    RODZAJ_SZYNA,
    RODZAJ_TRANSFORMATOR,
    RODZAJ_ZRODLO,
    rodzaj_elementu,
    zbuduj_indeks_rodzajow,
)

SNAPSHOT = {
    "buses": [{"ref_id": "bus-1"}, {"ref_id": "bus-2"}],
    "branches": [{"ref_id": "line-1"}],
    "transformers": [{"ref_id": "tr-1"}],
    "sources": [{"ref_id": "src-1"}],
    "generators": [{"ref_id": "gen-1"}],
    "loads": [{"ref_id": "load-1"}],
}


def test_kazda_kolekcja_modelu_ma_wlasny_rodzaj() -> None:
    indeks = zbuduj_indeks_rodzajow(SNAPSHOT)

    assert indeks["bus-1"] == RODZAJ_SZYNA
    assert indeks["line-1"] == RODZAJ_GALAZ_LINIOWA
    assert indeks["tr-1"] == RODZAJ_TRANSFORMATOR
    assert indeks["src-1"] == RODZAJ_ZRODLO
    assert indeks["gen-1"] == RODZAJ_GENERATOR
    assert indeks["load-1"] == RODZAJ_ODBIOR


def test_nieznany_identyfikator_nie_dostaje_rodzaju_domyslnego() -> None:
    assert rodzaj_elementu("czegos-takiego-nie-ma", SNAPSHOT) is None


def test_brak_identyfikatora_i_brak_snapshotu_daja_brak_rozstrzygniecia() -> None:
    assert rodzaj_elementu(None, SNAPSHOT) is None
    assert rodzaj_elementu("", SNAPSHOT) is None
    assert rodzaj_elementu("bus-1", None) is None
    assert zbuduj_indeks_rodzajow(None) == {}


def test_wpisy_bez_ref_id_i_nie_mapy_sa_pomijane_bez_wyjatku() -> None:
    """Starsze albo uszkodzone snapshoty nie moga wywalic widoku wynikow."""
    indeks = zbuduj_indeks_rodzajow(
        {"buses": [{"name": "bez ref"}, "nie-mapa", {"ref_id": "bus-9"}]}
    )

    assert indeks == {"bus-9": RODZAJ_SZYNA}


def test_indeks_mozna_podac_zamiast_snapshotu() -> None:
    """Widok pyta o kilka identyfikatorow — indeks buduje sie raz."""
    indeks = zbuduj_indeks_rodzajow(SNAPSHOT)

    assert rodzaj_elementu("tr-1", indeks=indeks) == RODZAJ_TRANSFORMATOR
    assert rodzaj_elementu("bus-2", indeks=indeks) == RODZAJ_SZYNA
