"""Indeks kart i peryferiów producenta; nie stanowi testu poprawności schematu wtórnego."""
from __future__ import annotations

from network_model.catalog.elektrometal_etango_family import (
    list_etango_expansion_peripherals,
)


def test_e2tango_expansions_have_unique_ids_and_official_provenance() -> None:
    index = list_etango_expansion_peripherals()
    assert index["stan_na"] == "2026-10-31"
    assert len(index["karty_rozszerzen"]) == 25
    assert len(index["karty_pomiarowe_wybierane_przy_zamowieniu"]) == 13
    assert len(index["peryferia"]) == 11
    assert len(index["reguly_i_niejasnosci"]) == 15
    assert {row["id"]: len(row["sloty"]) for row in index["jednostki_centralne"]} == {
        "J6": 6, "J10": 10, "J14": 14,
    }

    for key, identifier in [
        ("karty_rozszerzen", "kod"),
        ("karty_pomiarowe_wybierane_przy_zamowieniu", "kod"),
        ("peryferia", "id"),
        ("reguly_i_niejasnosci", "id"),
    ]:
        ids = [row[identifier] for row in index[key]]
        assert len(ids) == len(set(ids)), f"Powielone ID: {key}"

    sources = index["zrodla"]
    assert sources["s600"]["id"] == "K-3.2.25"
    assert sources["s600"]["revision"] == "04/2026"
    assert all(source["url"].startswith("https://") for source in sources.values())
    for key in (
        "karty_rozszerzen",
        "karty_pomiarowe_wybierane_przy_zamowieniu",
        "peryferia",
    ):
        for row in index[key]:
            assert set(row["zrodla"]) <= set(sources)
            assert row["zrodla"]


def test_e2tango_expansions_separate_availability_from_installed_equipment() -> None:
    index = list_etango_expansion_peripherals()
    cards = {row["kod"]: row for row in index["karty_rozszerzen"]}
    assert all(
        row["status"] == "DOSTEPNY_DO_WYBORU_NIE_ZAINSTALOWANY"
        for row in cards.values()
    )
    assert cards["PSU2"]["sloty_zajmowane"] == 2
    assert cards["ARP"]["wymaga"] == ["ARC"]
    assert cards["603I"]["modele_potwierdzone"] == ["250"]
    assert cards["6O3I"]["modele_potwierdzone"] == ["450"]
    assert cards["603I"]["slot_staly"] == cards["6O3I"]["slot_staly"] == "A"
    assert "250" not in cards["ARC"]["modele_potwierdzone"]
    assert "450" in cards["ARC"]["modele_potwierdzone"]
    assert cards["TRR"]["modele_potwierdzone"] == ["600", "800", "1000", "1200"]

    measurements = index["karty_pomiarowe_wybierane_przy_zamowieniu"]
    assert all(row["rola"] == "WYBOR_W_FORMULARZU_NIE_KARTA_SLOTOWA"
               for row in measurements)
    assert "E2TANGO_FER" in {row["id"] for row in index["peryferia"]}
    assert "E2ECHO_BD" in {row["id"] for row in index["peryferia"]}
    assert "E2TANGO_FER" not in cards


def test_e2tango_expansion_conflicts_are_preserved_not_silently_resolved() -> None:
    index = list_etango_expansion_peripherals()
    rules = {row["id"]: row for row in index["reguly_i_niejasnosci"]}
    assert rules["R-TVRR"]["status"] == "SPRZECZNOSC_W_JEDNYM_WYDANIU"
    assert "tylko F" in rules["R-TVRR"]["opis"]
    assert rules["R-250-ARC"]["status"] == "SPRZECZNOSC_WEWNATRZ_DOKUMENTU"
    assert rules["R-450-NAMES"]["status"] == "ROZBIEZNOSC_NAZEWNICTWA"
    assert rules["R-61850-CAM"]["status"] == "POTWIERDZONE"
    assert rules["R-FER"]["status"] == "POTWIERDZONE"

    for code in ("TV", "TRR"):
        card = next(row for row in index["karty_rozszerzen"] if row["kod"] == code)
        assert card["wymaga_potwierdzenia_lokalizacji_w_konfiguracji"] is True
    assert "BRAK_ZWERYFIKOWANEJ_MACIERZY" in index["bramka_projektowa"]


def test_e2tango_expansion_index_read_has_no_shared_mutable_state() -> None:
    one = list_etango_expansion_peripherals()
    one["karty_rozszerzen"][0]["kod"] = "FAKE"
    two = list_etango_expansion_peripherals()
    assert two["karty_rozszerzen"][0]["kod"] != "FAKE"
