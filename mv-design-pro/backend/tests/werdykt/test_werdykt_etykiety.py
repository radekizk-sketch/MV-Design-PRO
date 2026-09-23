"""Słownik etykiet statusu i semantyki koloru (§9) — jedyne mapowanie w produkcie.

Intencja: tabela §9 jest przypięta wiersz po wierszu; ``SPELNIA`` bez określonej kompletności
dowodu nie ma etykiety; dla pozostałych statusów etykieta nie zależy od kompletności (iloczyn
status × kompletność); słownik wystawiany w API ma stałą kolejność i kształt; KAŻDY rekord
katalogu K i W niesie etykietę równą etykiecie słownika, a para ``SPELNIA`` + ``NIEPELNY`` na
poziomie wymagania nie daje się zbudować.
"""

from __future__ import annotations

import itertools
from typing import get_args

import pytest
from pydantic import ValidationError
from werdykt import (
    SLOWNIK_ETYKIET,
    Etykieta,
    KompletnoscDowodu,
    OcenaKryterium,
    SemantykaKoloru,
    StatusWerdyktu,
    WynikWymagania,
    etykieta,
)

from tests.werdykt import fabryki as f

STATUSY: tuple[StatusWerdyktu, ...] = get_args(StatusWerdyktu)
KOMPLETNOSCI: tuple[KompletnoscDowodu | None, ...] = (*get_args(KompletnoscDowodu), None)

TABELA_PARAGRAF_9: list[tuple[StatusWerdyktu, KompletnoscDowodu | None, str, SemantykaKoloru]] = [
    ("SPELNIA", "PELNY", "Kryterium spełnione", "pozytywna"),
    ("SPELNIA", "NIEPELNY", "Kryterium spełnione — dowód niepełny", "ostrzegawcza"),
    ("NIE_SPELNIA", None, "Kryterium naruszone", "negatywna"),
    ("NIEJEDNOZNACZNY", None, "Wynik niejednoznaczny — wymaga weryfikacji", "ostrzegawcza"),
    ("NIE_OCENIONO", None, "Ocena niewykonana", "neutralna"),
    ("BRAK_DOWODU", None, "Brak wystarczającego dowodu", "ostrzegawcza"),
    ("BRAK_PODSTAWY", None, "Brak zweryfikowanej podstawy wymagania", "ostrzegawcza"),
    ("NIE_DOTYCZY", None, "Nie dotyczy", "neutralna"),
]


@pytest.mark.parametrize("status, kompletnosc, tekst, semantyka", TABELA_PARAGRAF_9)
def test_etykieta_wg_tabeli_paragrafu_9(
    status: StatusWerdyktu,
    kompletnosc: KompletnoscDowodu | None,
    tekst: str,
    semantyka: SemantykaKoloru,
) -> None:
    assert etykieta(status, kompletnosc) == Etykieta(etykieta_pl=tekst, semantyka=semantyka)


@pytest.mark.parametrize("kompletnosc", [None, "NIE_DOTYCZY"])
def test_spelnia_wymaga_okreslonej_kompletnosci(kompletnosc: KompletnoscDowodu | None) -> None:
    with pytest.raises(ValueError, match="PELNY albo NIEPELNY"):
        etykieta("SPELNIA", kompletnosc)


@pytest.mark.parametrize(
    "status, kompletnosc",
    [(s, k) for s, k in itertools.product(STATUSY, KOMPLETNOSCI) if s != "SPELNIA"],
)
def test_etykieta_poza_spelnia_nie_zalezy_od_kompletnosci(
    status: StatusWerdyktu, kompletnosc: KompletnoscDowodu | None
) -> None:
    assert etykieta(status, kompletnosc) == etykieta(status, None)


def test_slownik_etykiet_do_api_w_stalej_kolejnosci() -> None:
    assert [
        (p.status, p.kompletnosc, p.etykieta_pl, p.semantyka) for p in SLOWNIK_ETYKIET
    ] == TABELA_PARAGRAF_9
    assert {p.status for p in SLOWNIK_ETYKIET} == set(STATUSY)
    assert {p.semantyka for p in SLOWNIK_ETYKIET} == set(get_args(SemantykaKoloru))
    assert [p.model_dump(mode="json") for p in SLOWNIK_ETYKIET][0] == {
        "status": "SPELNIA",
        "kompletnosc": "PELNY",
        "etykieta_pl": "Kryterium spełnione",
        "semantyka": "pozytywna",
    }
    with pytest.raises(ValidationError, match="frozen"):
        SLOWNIK_ETYKIET[0].__setattr__("etykieta_pl", "Spełnia")


@pytest.mark.parametrize(
    "nazwa, rekord",
    f.rekordy_k() + f.rekordy_w(),
    ids=[n for n, _ in f.rekordy_k() + f.rekordy_w()],
)
def test_kazdy_rekord_niesie_etykiete_slownika(
    nazwa: str, rekord: OcenaKryterium | WynikWymagania
) -> None:
    kompletnosc = None if rekord.kompletnosc_dowodu == "NIE_DOTYCZY" else rekord.kompletnosc_dowodu
    assert rekord.etykieta == etykieta(rekord.status_maszynowy, kompletnosc)


def test_kryterium_spelnione_z_dowodem_niepelnym_jest_ostrzegawcze() -> None:
    rekord = f.ocena(dowod_oceny=f.dowod(stan_danych="UNVALIDATED_INPUT"))
    assert (rekord.status_maszynowy, rekord.kompletnosc_dowodu) == ("SPELNIA", "NIEPELNY")
    assert rekord.etykieta == Etykieta(
        etykieta_pl="Kryterium spełnione — dowód niepełny", semantyka="ostrzegawcza"
    )


def test_wymaganie_spelnione_z_dowodem_niepelnym_nie_daje_sie_zbudowac() -> None:
    rekord = f.wymaganie([f.ocena(dowod_oceny=f.dowod(stan_danych="UNVALIDATED_INPUT"))])
    assert rekord.status_maszynowy == "BRAK_DOWODU"
    dane = rekord.model_dump(mode="json")
    dane["status_maszynowy"] = "SPELNIA"
    dane["etykieta"] = etykieta("SPELNIA", "NIEPELNY").model_dump(mode="json")
    with pytest.raises(ValidationError, match="status"):
        WynikWymagania.model_validate(dane)
