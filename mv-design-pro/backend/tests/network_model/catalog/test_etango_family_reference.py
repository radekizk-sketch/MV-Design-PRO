"""Regresja pełnej rodziny e²TANGO: 17 źródeł ≠ 17 typów przekaźników pola SN."""
from __future__ import annotations

from network_model.catalog.elektrometal_etango_family import (
    get_etango_sn_catalog_additions,
    list_etango_family_references,
)
from network_model.catalog.mv_auxiliary_catalog import get_all_protection_device_types


def test_full_family_index_has_official_sources_and_clear_classification() -> None:
    family = list_etango_family_references()
    assert len(family) == 17
    ids = [entry["id"] for entry in family]
    assert ids == sorted(ids)
    assert len(ids) == len(set(ids))
    assert sum(entry["kategoria"] == "SPECJALIZOWANY_ZESPOL_WN" for entry in family) == 5
    assert sum(entry["kategoria"] == "PROFIL_AUTOMATYKI" for entry in family) == 1
    assert all(
        entry["zrodlo"]["url"].startswith("https://elektrometal-energetyka.pl/")
        for entry in family
    )
    for entry in family:
        assert entry["funkcje_publikowane"] is not None
        assert entry["aktywnie_wlaczone_funkcje"] is None
        assert entry["nastawy"] is None
        assert entry["przekladnia_ct"] is None
        assert "NIE_AKTYWNA_KONFIGURACJA" in entry["status_funkcji"]


def test_detector_hv_and_automation_not_offered_as_sn_relay() -> None:
    additions = get_etango_sn_catalog_additions()
    assert {row["id"] for row in additions} == {
        "EM_E2TANGO_100",
        "EM_E2TANGO_150",
        "EM_E2TANGO_200",
        "EM_E2TANGO_400",
        "EM_E2TANGO_600",
        "EM_E2TANGO_800",
        "EM_E2TANGO_1000",
        "EM_E2TANGO_1200",
    }
    canonical = {row["id"]: row for row in get_all_protection_device_types()}
    for entry in additions:
        assert entry["id"] in canonical
        params = canonical[entry["id"]]["params"]
        assert params["rated_current_a"] is None
        assert params["analytical_library_ref"] is None
        assert params["verification_status"] == "CZESCIOWO_ZWERYFIKOWANY"
        assert params["catalog_status"] == "REFERENCYJNY_V1"
        assert params["source_reference"]
    for identyfikator in (
        "EM_E2TANGO_50",
        "EM_E2TANGO_2000_ODL",
        "EM_E2TANGO_2000_TRR",
        "EM_E2TANGO_2000_STP",
        "EM_E2TANGO_2000_ARN",
        "EM_E2TANGO_2000_LRR",
        "EM_E2TANGO_SZR_PPZ",
    ):
        assert identyfikator not in canonical


def test_family_contains_real_variants_without_inventing_SKUs() -> None:
    family = {row["id"]: row for row in list_etango_family_references()}
    assert set(family["EM_E2TANGO_150"]["wykonania_wg_zrodla"]) == {
        "M", "L", "G", "LG"
    }
    assert family["EM_E2TANGO_250"]["wykonania_wg_zrodla"] == ["S", "U"]
    assert "RCUxR" in family["EM_E2TANGO_50"]["wykonania_wg_zrodla"]
    assert "87T" in family["EM_E2TANGO_2000_TRR"]["funkcje_publikowane"]
    assert "87T" in family["EM_E2TANGO_800"]["funkcje_publikowane"]
    assert family["EM_E2TANGO_800"]["aktywnie_wlaczone_funkcje"] is None


def test_family_read_does_not_allow_external_mutation() -> None:
    first = list_etango_family_references()
    first[0]["zrodlo"]["url"] = "https://example.invalid"
    first[0]["funkcje_publikowane"].append("NIEPRAWDZIWE")
    second = list_etango_family_references()
    assert second[0]["zrodlo"]["url"].startswith("https://elektrometal-energetyka.pl/")
    assert "NIEPRAWDZIWE" not in second[0]["funkcje_publikowane"]
