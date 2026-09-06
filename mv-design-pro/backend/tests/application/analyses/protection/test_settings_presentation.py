"""Karta F-K5 (dlug V12K-189): prezentacja nastaw, w tym NIEDOSTEPNYCH.

Decyzja wlasciciela: „nastawa bez danych powinna byc niedostepna". Kalkulator robi to
od V12K-189; te testy pilnuja drugiej polowy — ze brak nastawy dojdzie do projektanta
jako STAN z powodem i akcja naprawcza, a nie jako puste pole.
"""

from __future__ import annotations

from application.analyses.protection.overcurrent.settings_presentation import (
    KOMUNIKAT_NIEDOSTEPNA,
    STAN_DOSTEPNA,
    STAN_NIEDOSTEPNA,
    zbuduj_prezentacje_nastaw,
)
from domain.canonical_operations import READINESS_CODES

_KOMPLETNE = {
    "curve": "IEC_NI",
    "i_pickup_51_a": 120.0,
    "tms_51": 0.2,
    "i_inst_50_a": 800.0,
    "i_pickup_51n_a": 60.0,
    "tms_51n": 0.3,
    "i_inst_50n_a": 300.0,
    "readiness_codes": (),
    "is_complete": True,
}

# Realny przypadek z V12K-189: sam bieg 3F, wiec nastawy zalezne od pradu zwarciowego
# (I>> 50 oraz oba stopnie ziemnozwarciowe) sa niewyznaczalne.
_BEZ_PRADU_ZWARCIOWEGO = {
    **_KOMPLETNE,
    "i_inst_50_a": None,
    "i_pickup_51n_a": None,
    "i_inst_50n_a": None,
    "readiness_codes": ("protection.fault_current_missing",),
    "is_complete": False,
}


def test_kompletny_zestaw_ma_wszystkie_pozycje_dostepne() -> None:
    widok = zbuduj_prezentacje_nastaw(_KOMPLETNE)

    assert widok["kompletne"] is True
    assert widok["brakujace"] == []
    assert [p["stan"] for p in widok["pozycje"]] == [STAN_DOSTEPNA] * 4
    assert [p["wartosc"] for p in widok["pozycje"]] == [120.0, 800.0, 60.0, 300.0]
    # Pozycja dostepna nie niesie nawigacji naprawczej — nie ma czego naprawiac.
    assert all(p["fix_navigation"] is None for p in widok["pozycje"])
    assert widok["podsumowanie_pl"].startswith("Wszystkie nastawy")


def test_niedostepna_nastawa_ma_stan_powod_i_akcje_naprawcza() -> None:
    widok = zbuduj_prezentacje_nastaw(_BEZ_PRADU_ZWARCIOWEGO)

    assert widok["kompletne"] is False
    assert widok["brakujace"] == ["i_inst_50_a", "i_pickup_51n_a", "i_inst_50n_a"]

    po_kluczu = {p["klucz"]: p for p in widok["pozycje"]}
    # I> (51) liczy sie od pradu znamionowego pola — ten jest, wiec nastawa zostaje.
    assert po_kluczu["i_pickup_51_a"]["stan"] == STAN_DOSTEPNA

    brak = po_kluczu["i_inst_50_a"]
    assert brak["stan"] == STAN_NIEDOSTEPNA
    assert brak["wartosc"] is None
    assert brak["komunikat_pl"] == KOMUNIKAT_NIEDOSTEPNA
    # Powod i nawigacja z KANONICZNEGO rejestru — nie z wlasnego tekstu tego modulu.
    spec = READINESS_CODES["protection.fault_current_missing"]
    assert brak["powod_pl"] == spec.message_pl
    assert brak["fix_navigation"] == spec.fix_navigation
    assert "3 z 4" in widok["podsumowanie_pl"]


def test_brak_pradu_znamionowego_dotyczy_tylko_nastawy_rozruchowej() -> None:
    """Odwzorowanie kod -> nastawa: projektant ma wiedziec, co dokladnie uzupelnic.

    Bez rozdzielenia kodow kazda brakujaca pozycja dostalaby oba powody i instrukcja
    „uruchom analize zwarciowa" pojawilaby sie przy nastawie, ktora zwarcia nie potrzebuje.
    """
    nastawy = {
        **_KOMPLETNE,
        "i_pickup_51_a": None,
        "readiness_codes": ("protection.nominal_current_missing",),
        "is_complete": False,
    }

    widok = zbuduj_prezentacje_nastaw(nastawy)
    po_kluczu = {p["klucz"]: p for p in widok["pozycje"]}
    spec = READINESS_CODES["protection.nominal_current_missing"]
    assert po_kluczu["i_pickup_51_a"]["fix_navigation"] == spec.fix_navigation
    assert po_kluczu["i_pickup_51_a"]["powod_pl"] == spec.message_pl
    assert po_kluczu["i_inst_50_a"]["stan"] == STAN_DOSTEPNA


def test_brak_nastawy_bez_kodu_gotowosci_mowi_o_tym_wprost() -> None:
    """Brak przyczyny jest sam w sobie informacja — nie wolno jej zmyslic.

    Gdyby modul dobral „najbardziej prawdopodobny" powod, projektant poszedlby naprawiac
    nie to, co trzeba, a rozjazd kontraktu (jak ten wykryty w V12K-189) zostalby ukryty.
    """
    nastawy = {**_KOMPLETNE, "i_inst_50_a": None, "readiness_codes": (), "is_complete": False}

    widok = zbuduj_prezentacje_nastaw(nastawy)
    pozycja = next(p for p in widok["pozycje"] if p["klucz"] == "i_inst_50_a")
    assert pozycja["stan"] == STAN_NIEDOSTEPNA
    assert pozycja["fix_navigation"] is None
    assert "nie podala powodu" in pozycja["powod_pl"]


def test_prezentacja_jest_deterministyczna_i_ma_stala_kolejnosc() -> None:
    assert zbuduj_prezentacje_nastaw(_BEZ_PRADU_ZWARCIOWEGO) == zbuduj_prezentacje_nastaw(
        _BEZ_PRADU_ZWARCIOWEGO
    )
    assert [p["klucz"] for p in zbuduj_prezentacje_nastaw(_KOMPLETNE)["pozycje"]] == [
        "i_pickup_51_a",
        "i_inst_50_a",
        "i_pickup_51n_a",
        "i_inst_50n_a",
    ]


def test_zadna_niedostepna_nastawa_nie_dostaje_wartosci_domyslnej() -> None:
    """Niezmiennik V12K-189 w warstwie prezentacji: brak zostaje brakiem."""
    wszystkie_brakuja = {
        **_KOMPLETNE,
        "i_pickup_51_a": None,
        "i_inst_50_a": None,
        "i_pickup_51n_a": None,
        "i_inst_50n_a": None,
        "readiness_codes": (
            "protection.nominal_current_missing",
            "protection.fault_current_missing",
        ),
        "is_complete": False,
    }

    widok = zbuduj_prezentacje_nastaw(wszystkie_brakuja)
    assert all(p["wartosc"] is None for p in widok["pozycje"])
    assert all(p["stan"] == STAN_NIEDOSTEPNA for p in widok["pozycje"])
    assert widok["brakujace"] == [
        "i_pickup_51_a",
        "i_inst_50_a",
        "i_pickup_51n_a",
        "i_inst_50n_a",
    ]
    assert "4 z 4" in widok["podsumowanie_pl"]
