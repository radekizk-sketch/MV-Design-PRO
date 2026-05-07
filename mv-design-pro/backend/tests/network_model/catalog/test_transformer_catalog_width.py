from __future__ import annotations

from network_model.catalog.mv_transformer_catalog import (
    get_all_transformer_types,
    get_transformer_catalog_quality_summary,
    get_transformer_catalog_statistics,
)


def test_transformer_catalog_has_industrial_series_width() -> None:
    stats = get_transformer_catalog_statistics()
    all_types = get_all_transformer_types()

    assert stats["liczba_transformatorow_ogolem"] == 176
    assert stats["liczba_wn_sn"] == 10
    assert stats["liczba_sn_nn"] == 166
    assert stats["grupy_polaczen"] == ["Dyn11", "Yd11"]
    assert stats["statusy_weryfikacji"] == ["REFERENCYJNY", "ZWERYFIKOWANY"]
    assert stats["statusy_katalogowe"] == ["PRODUKCYJNY_V1", "REFERENCYJNY_V1"]
    assert len({item["params"]["rated_power_mva"] for item in all_types}) >= 16
    assert len({item["params"]["manufacturer"] for item in all_types}) == 4


def test_transformer_catalog_has_explicit_quality_metadata() -> None:
    summary = get_transformer_catalog_quality_summary()
    all_types = get_all_transformer_types()

    assert summary["liczba_transformatorow_ogolem"] == len(all_types)
    assert summary["liczba_zweryfikowanych"] == 34
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
