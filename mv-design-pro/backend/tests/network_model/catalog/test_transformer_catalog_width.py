from __future__ import annotations

from network_model.catalog.mv_transformer_catalog import (
    get_all_transformer_types,
    get_transformer_catalog_quality_summary,
    get_transformer_catalog_statistics,
)

# K30-18: Polish manufacturer expansion (WZL, ZPUE Trafo, Energen, Trafocomp).
# Base 176 + 16 Polish = 192 total transformers.
EXPECTED_TOTAL = 192
EXPECTED_VERIFIED = 50  # 34 z baseline + 16 z polish expansion


def test_transformer_catalog_has_industrial_series_width() -> None:
    stats = get_transformer_catalog_statistics()
    all_types = get_all_transformer_types()

    assert stats["liczba_transformatorow_ogolem"] == EXPECTED_TOTAL
    assert stats["liczba_wn_sn"] == 10
    assert stats["liczba_sn_nn"] == EXPECTED_TOTAL - 10
    assert stats["grupy_polaczen"] == ["Dyn11", "Yd11"]
    assert stats["statusy_weryfikacji"] == ["REFERENCYJNY", "ZWERYFIKOWANY"]
    assert stats["statusy_katalogowe"] == ["PRODUKCYJNY_V1", "REFERENCYJNY_V1"]
    assert len({item["params"]["rated_power_mva"] for item in all_types}) >= 16
    # K30-18: 4 baseline + 4 Polish (WZL, ZPUE Trafo, Energen, Trafocomp) = 8
    assert len({item["params"]["manufacturer"] for item in all_types}) >= 8


def test_transformer_catalog_has_explicit_quality_metadata() -> None:
    summary = get_transformer_catalog_quality_summary()
    all_types = get_all_transformer_types()

    assert summary["liczba_transformatorow_ogolem"] == len(all_types)
    assert summary["liczba_zweryfikowanych"] == EXPECTED_VERIFIED
    assert summary["liczba_nieweryfikowanych"] == 0
    assert summary["statusy_weryfikacji"] == ["REFERENCYJNY", "ZWERYFIKOWANY"]
    assert summary["statusy_katalogowe"] == ["PRODUKCYJNY_V1", "REFERENCYJNY_V1"]
    assert summary["contract_version"] == "2.0"
    for item in all_types:
        params = item["params"]
        assert params["verification_status"] in {"REFERENCYJNY", "ZWERYFIKOWANY"}
        assert params["catalog_status"] in {"PRODUKCYJNY_V1", "REFERENCYJNY_V1"}
        assert params["source_reference"].strip()
        assert params["contract_version"] == "2.0"


def test_polish_ptpire_manufacturers_present() -> None:
    """K30-18: WZL Kędzierzyn-Koźle, ZPUE Trafo, Energen, Trafocomp."""
    all_types = get_all_transformer_types()
    manufacturers = {t["params"]["manufacturer"] for t in all_types}
    assert "WZL Kędzierzyn-Koźle" in manufacturers
    assert "ZPUE Trafo Włoszczowa" in manufacturers
    assert "Energen Polska" in manufacturers
    assert "Trafocomp" in manufacturers


def test_polish_ptpire_entries_marked_certified() -> None:
    """K30-18: Polish entries must have ptpire_certified=True flag."""
    all_types = get_all_transformer_types()
    polish_entries = [
        t
        for t in all_types
        if t["params"].get("manufacturer")
        in {
            "WZL Kędzierzyn-Koźle",
            "ZPUE Trafo Włoszczowa",
            "Energen Polska",
            "Trafocomp",
        }
    ]
    assert len(polish_entries) >= 16, f"Expected ≥16 Polish entries, got {len(polish_entries)}"
    for entry in polish_entries:
        assert (
            entry["params"].get("ptpire_certified") is True
        ), f"Polish entry {entry['id']} missing ptpire_certified flag"
