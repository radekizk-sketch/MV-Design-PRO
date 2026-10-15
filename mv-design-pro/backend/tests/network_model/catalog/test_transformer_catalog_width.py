from __future__ import annotations

from network_model.catalog.mv_transformer_catalog import (
    ZNACZNIK_PRZEKROCZENIA_TIER2,
    get_all_transformer_types,
    get_transformer_catalog_quality_summary,
    get_transformer_catalog_statistics,
)

# Pomiar 2026-10-15 (karta KATALOG-KOMPLETNY-PROWENIENCJA): 10 WN/SN + 24 SN/nN jednostek
# istniejacych + 16 pozycji polskich producentow (deklarowane) + 48 normatywnych 0,4 kV
# Tier 2 + 126 normatywnych blokowych (9 mocy × 2 napiecia SN × 7 napiec nN; druga czesc
# karty doklada 0,48 kV dla Tesla Megapack 2 XL: 108 + 18) + 1 karta producenta = 225. Dawne 50
# „ZWERYFIKOWANYCH" nie mialo dolaczonego dokumentu i przekraczalo pulap strat Tier 2 —
# sa NIEWERYFIKOWANY; ZWERYFIKOWANY ma wylacznie pozycja z karta producenta (1).
EXPECTED_TOTAL = 225
EXPECTED_VERIFIED = 1
EXPECTED_UNVERIFIED = 50


def test_transformer_catalog_has_industrial_series_width() -> None:
    stats = get_transformer_catalog_statistics()
    all_types = get_all_transformer_types()

    assert stats["liczba_transformatorow_ogolem"] == EXPECTED_TOTAL
    assert stats["liczba_wn_sn"] == 10
    assert stats["liczba_sn_nn"] == EXPECTED_TOTAL - 10
    assert stats["grupy_polaczen"] == ["Dyn11", "Yd11"]
    assert stats["statusy_weryfikacji"] == ["NIEWERYFIKOWANY", "REFERENCYJNY", "ZWERYFIKOWANY"]
    assert stats["statusy_katalogowe"] == ["PRODUKCYJNY_V1", "REFERENCYJNY_V1"]
    assert len({item["params"]["rated_power_mva"] for item in all_types}) >= 16
    # Producenci: ZREW, ABB, Trafo Zywiec, Siemens + 4 polskich (WZL, ZPUE, Energen,
    # Trafocomp). Pozycje normatywne nie maja producenta (klucz pominiety).
    assert (
        len({p["manufacturer"] for p in (i["params"] for i in all_types) if "manufacturer" in p})
        >= 8
    )
    assert all(
        "manufacturer" not in item["params"]
        for item in all_types
        if item["params"]["verification_status"] == "REFERENCYJNY"
    )


def test_transformer_catalog_has_explicit_quality_metadata() -> None:
    summary = get_transformer_catalog_quality_summary()
    all_types = get_all_transformer_types()

    assert summary["liczba_transformatorow_ogolem"] == len(all_types)
    assert summary["liczba_zweryfikowanych"] == EXPECTED_VERIFIED
    assert summary["liczba_nieweryfikowanych"] == EXPECTED_UNVERIFIED
    assert summary["statusy_weryfikacji"] == ["NIEWERYFIKOWANY", "REFERENCYJNY", "ZWERYFIKOWANY"]
    assert summary["statusy_katalogowe"] == ["PRODUKCYJNY_V1", "REFERENCYJNY_V1"]
    assert summary["contract_version"] == "2.0"
    for item in all_types:
        params = item["params"]
        assert params["verification_status"] in {"NIEWERYFIKOWANY", "REFERENCYJNY", "ZWERYFIKOWANY"}
        assert params["catalog_status"] in {"PRODUKCYJNY_V1", "REFERENCYJNY_V1"}
        assert params["source_reference"].strip()
        assert params["contract_version"] == "2.0"


def test_polish_ptpire_manufacturers_present() -> None:
    """K30-18: WZL Kędzierzyn-Koźle, ZPUE Trafo, Energen, Trafocomp."""
    all_types = get_all_transformer_types()
    manufacturers = {t["params"].get("manufacturer") for t in all_types}
    assert "WZL Kędzierzyn-Koźle" in manufacturers
    assert "ZPUE Trafo Włoszczowa" in manufacturers
    assert "Energen Polska" in manufacturers
    assert "Trafocomp" in manufacturers


def test_polish_entries_are_declared_unverified_without_certificate_flag() -> None:
    """K30-18 + karta KATALOG-KOMPLETNY-PROWENIENCJA: pozycje polskich producentow sa
    deklaracjami bez dolaczonego dokumentu — NIEWERYFIKOWANY, znacznik przekroczenia
    pulapu Tier 2 w nocie (pomiar: kazda przekracza) i BEZ flagi certyfikatu PTPiREE
    (dawna flaga `ptpire_certified=True` nie miala dokumentu, ktory by ja potwierdzal)."""
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
        params = entry["params"]
        assert "ptpire_certified" not in params, entry["id"]
        assert params["verification_status"] == "NIEWERYFIKOWANY", entry["id"]
        assert params["source_reference"].startswith("Deklarowane: "), entry["id"]
        assert ZNACZNIK_PRZEKROCZENIA_TIER2 in params["verification_note"], entry["id"]
