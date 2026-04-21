from __future__ import annotations

from collections import Counter

from network_model.catalog.mv_switch_catalog import (
    get_all_switch_equipment_types,
    get_switch_catalog_statistics,
)


def test_switchgear_catalog_has_industrial_series_width() -> None:
    stats = get_switch_catalog_statistics()
    all_types = get_all_switch_equipment_types()

    assert stats["liczba_aparatury_ogolem"] == 36
    assert stats["liczba_wylacznikow"] == 12
    assert stats["liczba_rozlacznikow"] == 7
    assert stats["liczba_odlacznikow"] == 4
    assert stats["liczba_reklozerow"] == 4
    assert stats["liczba_bezpiecznikow"] == 7
    assert stats["liczba_uziemnikow"] == 2
    assert stats["rodzaje"] == [
        "CIRCUIT_BREAKER",
        "DISCONNECTOR",
        "EARTH_SWITCH",
        "FUSE",
        "LOAD_SWITCH",
        "RECLOSER",
    ]
    assert stats["producenci"] == [
        "ABB",
        "ETI",
        "Eaton",
        "Elpo",
        "NOJA Power",
        "Schneider Electric",
        "Siemens",
    ]
    assert stats["statusy_weryfikacji"] == [
        "CZESCIOWO_ZWERYFIKOWANY",
        "ZWERYFIKOWANY",
    ]
    assert stats["statusy_katalogowe"] == [
        "PRODUKCYJNY_V1",
        "REFERENCYJNY_V1",
    ]
    assert stats["liczba_zweryfikowanych"] == 33
    assert stats["liczba_czesciowo_zweryfikowanych"] == 3
    assert stats["liczba_nieweryfikowanych"] == 0
    assert stats["liczba_referencyjnych"] == 0
    assert len({item["params"]["un_kv"] for item in all_types}) == 4
    assert (
        len(
            {
                item["params"]["manufacturer"]
                for item in all_types
                if item["params"].get("manufacturer")
            }
        )
        == 7
    )
    assert Counter(item["params"]["equipment_kind"] for item in all_types)["CIRCUIT_BREAKER"] == 12


def test_switchgear_catalog_has_explicit_quality_metadata() -> None:
    for item in get_all_switch_equipment_types():
        params = item["params"]
        assert params["verification_status"] in {
            "ZWERYFIKOWANY",
            "CZESCIOWO_ZWERYFIKOWANY",
        }
        assert params["catalog_status"] in {
            "PRODUKCYJNY_V1",
            "REFERENCYJNY_V1",
        }
        assert params["contract_version"] == "2.0"
        assert isinstance(params["source_reference"], str)
        assert params["source_reference"].strip()
        if params["catalog_status"] == "PRODUKCYJNY_V1":
            assert params["verification_status"] == "ZWERYFIKOWANY"
