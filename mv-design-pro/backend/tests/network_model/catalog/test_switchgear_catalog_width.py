from __future__ import annotations

from collections import Counter

from network_model.catalog.mv_switch_catalog import (
    get_all_switch_equipment_types,
    get_switch_catalog_statistics,
)


def test_switchgear_catalog_has_industrial_series_width() -> None:
    """K30-22: 36 baseline + 12 Polish (ZPUE Rotoblok + Elektrometal E2 Alpha) = 48."""
    stats = get_switch_catalog_statistics()
    all_types = get_all_switch_equipment_types()

    assert stats["liczba_aparatury_ogolem"] == 48
    # CB: 12 baseline + 8 Polish (4 ZPUE + 4 Elektrometal) = 20
    assert stats["liczba_wylacznikow"] == 20
    # LS: 7 baseline + 2 ZPUE NAL = 9
    assert stats["liczba_rozlacznikow"] == 9
    # DS: 4 baseline + 2 Elektrometal = 6
    assert stats["liczba_odlacznikow"] == 6
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
    # K30-22: + ZPUE Włoszczowa + Elektrometal (Polish PTPiRE manufacturers)
    assert "ZPUE Włoszczowa" in stats["producenci"]
    assert "Elektrometal" in stats["producenci"]
    assert "ABB" in stats["producenci"]
    assert "Siemens" in stats["producenci"]
    assert stats["statusy_weryfikacji"] == [
        "CZESCIOWO_ZWERYFIKOWANY",
        "ZWERYFIKOWANY",
    ]
    assert stats["statusy_katalogowe"] == [
        "PRODUKCYJNY_V1",
        "REFERENCYJNY_V1",
    ]
    # 33 baseline + 12 Polish all verified = 45
    assert stats["liczba_zweryfikowanych"] == 45
    assert stats["liczba_czesciowo_zweryfikowanych"] == 3
    assert stats["liczba_nieweryfikowanych"] == 0
    assert stats["liczba_referencyjnych"] == 0
    assert len({item["params"]["un_kv"] for item in all_types}) == 4
    # 7 baseline + 2 Polish = 9 manufacturers
    assert (
        len(
            {
                item["params"]["manufacturer"]
                for item in all_types
                if item["params"].get("manufacturer")
            }
        )
        == 9
    )
    assert Counter(item["params"]["equipment_kind"] for item in all_types)["CIRCUIT_BREAKER"] == 20


def test_polish_ptpire_apparatus_marked_certified() -> None:
    """K30-22: ZPUE + Elektrometal entries must have ptpire_certified=True."""
    polish = [
        t for t in get_all_switch_equipment_types()
        if t["params"].get("manufacturer") in {"ZPUE Włoszczowa", "Elektrometal"}
    ]
    assert len(polish) == 12, f"Expected 12 Polish apparatus, got {len(polish)}"
    for item in polish:
        assert item["params"].get("ptpire_certified") is True


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
