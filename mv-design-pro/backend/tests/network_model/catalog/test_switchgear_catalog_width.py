from __future__ import annotations

from collections import Counter

from network_model.catalog.mv_switch_catalog import (
    get_all_switch_equipment_types,
    get_switch_catalog_statistics,
)


def test_switchgear_catalog_has_industrial_series_width() -> None:
    """K30-22: 36 baseline + 12 Polish (ZPUE Rotoblok + Elektrometal E2 Alpha) = 48.

    Karta KATALOG-APARATURA-WN (pomiar 2026-10-22, decyzja właściciela: 110 kV to granica
    zasilania GPZ): + 2 typy minimalne łączników topologii 110 kV — wyłącznik i odłącznik
    (status REFERENCYJNY, bez producenta, bez danych wytrzymałościowych) = 50.

    Karta UX-04/POLE-LINIOWE-WZORZEC (2026-10-28): + 2 rozłączniki próżniowe typu ogólnego
    bez gazów fluorowanych (12 kV i 24 kV) — jedyne rozłączniki dopuszczone w polu
    projektowanym (rozporządzenie (UE) 2024/573, art. 13 ust. 9) = 52."""
    stats = get_switch_catalog_statistics()
    all_types = get_all_switch_equipment_types()

    assert stats["liczba_aparatury_ogolem"] == 52
    # CB: 12 baseline + 8 Polish (4 ZPUE + 4 Elektrometal) + 1 typ minimalny 110 kV = 21
    assert stats["liczba_wylacznikow"] == 21
    # LS: 7 baseline + 2 ZPUE NAL + 2 próżniowe typu ogólnego = 11
    assert stats["liczba_rozlacznikow"] == 11
    # DS: 4 baseline + 2 Elektrometal + 1 typ minimalny 110 kV = 7
    assert stats["liczba_odlacznikow"] == 7
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
        "NIEWERYFIKOWANY",
        "REFERENCYJNY",
        "ZWERYFIKOWANY",
    ]
    assert stats["statusy_katalogowe"] == [
        "PRODUKCYJNY_V1",
        "REFERENCYJNY_V1",
    ]
    # 33 pozycje bazowe zweryfikowane; 12 polskich ma źródło wyłącznie deklarowane
    # (dokument nie jest w repozytorium), więc są NIEWERYFIKOWANY.
    assert stats["liczba_zweryfikowanych"] == 33
    assert stats["liczba_czesciowo_zweryfikowanych"] == 3
    assert stats["liczba_nieweryfikowanych"] == 12
    # 2 typy minimalne 110 kV + 2 rozłączniki próżniowe typu ogólnego (UX-04).
    assert stats["liczba_referencyjnych"] == 4
    assert len({item["params"]["un_kv"] for item in all_types}) == 5  # + 123 kV (U_m sieci 110 kV)
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
    assert Counter(item["params"]["equipment_kind"] for item in all_types)["CIRCUIT_BREAKER"] == 21


def test_polish_apparatus_declared_without_certificate_flag() -> None:
    """K30-22: ZPUE + Elektrometal — źródło deklarowane, bez dokumentu w repozytorium.

    Flaga certyfikatu PTPiREE wymaga dokumentu (reguła przypięta dla wszystkich
    katalogów w test_katalog_proweniencja_kompletnosc), więc jej nie ma,
    a status to NIEWERYFIKOWANY / REFERENCYJNY_V1.
    """
    polish = [
        t
        for t in get_all_switch_equipment_types()
        if t["params"].get("manufacturer") in {"ZPUE Włoszczowa", "Elektrometal"}
    ]
    assert len(polish) == 12, f"Expected 12 Polish apparatus, got {len(polish)}"
    for item in polish:
        params = item["params"]
        assert "ptpire_certified" not in params
        assert params["source_reference"].startswith("Deklarowane: ")
        assert params["verification_status"] == "NIEWERYFIKOWANY"
        assert params["catalog_status"] == "REFERENCYJNY_V1"


def test_switchgear_catalog_has_explicit_quality_metadata() -> None:
    for item in get_all_switch_equipment_types():
        params = item["params"]
        assert params["verification_status"] in {
            "ZWERYFIKOWANY",
            "CZESCIOWO_ZWERYFIKOWANY",
            "NIEWERYFIKOWANY",
            "REFERENCYJNY",
        }
        # Karta KATALOG-APARATURA-WN: REFERENCYJNY wyłącznie typ minimalny łącznika 110 kV —
        # bez producenta, z jakością ESTIMATED każdego pola danych.
        if params["verification_status"] == "REFERENCYJNY":
            assert params["manufacturer"] is None
            assert params["card_field_status"]
            assert all(
                wpis["quality"] == "ESTIMATED" for wpis in params["card_field_status"].values()
            )
        assert params["catalog_status"] in {
            "PRODUKCYJNY_V1",
            "REFERENCYJNY_V1",
        }
        assert params["contract_version"] == "2.0"
        assert isinstance(params["source_reference"], str)
        assert params["source_reference"].strip()
        if params["catalog_status"] == "PRODUKCYJNY_V1":
            assert params["verification_status"] == "ZWERYFIKOWANY"
        if params["verification_status"] == "NIEWERYFIKOWANY":
            assert params["source_reference"].startswith("Deklarowane: ")
            assert params["catalog_status"] == "REFERENCYJNY_V1"
