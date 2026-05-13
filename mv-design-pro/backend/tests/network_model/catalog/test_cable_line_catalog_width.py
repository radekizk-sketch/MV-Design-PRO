from __future__ import annotations

from network_model.catalog.mv_cable_line_catalog import (
    get_all_cable_types,
    get_all_line_types,
    get_cable_catalog_quality_summary,
    get_catalog_statistics,
    get_line_catalog_quality_summary,
)


def test_overhead_line_catalog_has_industrial_series_width() -> None:
    stats = get_catalog_statistics()
    summary = get_line_catalog_quality_summary()

    assert stats["liczba_linii_ogolem"] == 26
    assert stats["liczba_linii_produkcyjnych"] == 25
    assert summary["liczba_linii_produkcyjnych"] == 25
    assert summary["liczba_linii_testowych"] == 1
    assert summary["rodziny_linii"] == ["AAL", "AFL_2", "AFL_6"]
    assert summary["przekroje_linii_mm2"] == [16, 25, 35, 50, 70, 95, 120, 150, 185, 240]
    assert summary["statusy_weryfikacji"] == ["CZESCIOWO_ZWERYFIKOWANY", "REFERENCYJNY"]
    assert summary["statusy_katalogowe"] == ["PRODUKCYJNY_V1", "TESTOWY"]


def test_mv_cable_catalog_has_industrial_series_width() -> None:
    stats = get_catalog_statistics()
    summary = get_cable_catalog_quality_summary()

    assert stats["liczba_kabli_ogolem"] == 55
    assert stats["liczba_kabli_produkcyjnych"] == 54
    assert summary["liczba_kabli_produkcyjnych"] == 54
    assert summary["liczba_kabli_testowych"] == 1
    assert summary["rodziny_kabli"] == [
        "ENEA_OPERATOR",
        "EPR_AL_1C",
        "EPR_AL_3C",
        "EPR_CU_1C",
        "EPR_CU_3C",
        "NKT",
        "TELE_FONIKA",
        "XLPE_AL_1C",
        "XLPE_AL_3C",
        "XLPE_CU_1C",
        "XLPE_CU_3C",
    ]
    assert summary["przekroje_kabli_mm2"] == [70, 120, 150, 185, 240, 300, 400]
    assert summary["liczba_typow_1z"] == 33
    assert summary["liczba_typow_3z"] == 22
    assert summary["statusy_weryfikacji"] == [
        "CZESCIOWO_ZWERYFIKOWANY",
        "REFERENCYJNY",
        "ZWERYFIKOWANY",
    ]
    assert summary["statusy_katalogowe"] == ["PRODUKCYJNY_V1", "TESTOWY"]


def test_overhead_line_records_have_explicit_quality_metadata() -> None:
    summary = get_line_catalog_quality_summary()

    assert summary["contract_version"] == "2.0"
    for item in get_all_line_types():
        params = item["params"]
        assert params["verification_status"]
        assert params["source_reference"].strip()
        assert params["catalog_status"]
        assert params["contract_version"] == "2.0"
        if item["id"] == "line-incomplete-test":
            assert params["catalog_status"] == "TESTOWY"
            assert params["verification_status"] == "REFERENCYJNY"
        else:
            assert params["catalog_status"] == "PRODUKCYJNY_V1"
            assert params["verification_status"] == "CZESCIOWO_ZWERYFIKOWANY"


def test_mv_cable_records_have_explicit_quality_metadata() -> None:
    summary = get_cable_catalog_quality_summary()

    assert summary["contract_version"] == "2.0"
    for item in get_all_cable_types():
        params = item["params"]
        assert params["verification_status"]
        assert params["source_reference"].strip()
        assert params["catalog_status"]
        assert params["contract_version"] == "2.0"
        if item["id"] == "cable-incomplete-test":
            assert params["catalog_status"] == "TESTOWY"
            assert params["verification_status"] == "REFERENCYJNY"
            continue
        assert params["catalog_status"] == "PRODUKCYJNY_V1"
        assert params["verification_status"] in {
            "CZESCIOWO_ZWERYFIKOWANY",
            "ZWERYFIKOWANY",
        }
