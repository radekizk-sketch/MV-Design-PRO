from __future__ import annotations

from collections import Counter

from network_model.catalog.mv_switch_catalog import (
    get_all_switch_equipment_types,
    get_switch_catalog_statistics,
)


def test_switchgear_catalog_has_industrial_series_width() -> None:
    """K30-22: 36 baseline + 12 Polish (ZPUE Rotoblok + Elektrometal E2 Alpha) = 48; karta
    GPZ-H5-APARATURA: + 4 pozycje WYMAGAŃ standardu ENEA (odłączniki trójpołożeniowe SN
    630/1250/2000 A i uziemnik pola SN 24 kV 16 kA/3 s, `mv_wymagania_enea_catalog`) = 52."""
    stats = get_switch_catalog_statistics()
    all_types = get_all_switch_equipment_types()

    assert stats["liczba_aparatury_ogolem"] == 52
    # CB: 12 baseline + 8 Polish (4 ZPUE + 4 Elektrometal) = 20
    assert stats["liczba_wylacznikow"] == 20
    # LS: 7 baseline + 2 ZPUE NAL = 9
    assert stats["liczba_rozlacznikow"] == 9
    # DS: 4 baseline + 2 Elektrometal = 6
    assert stats["liczba_odlacznikow"] == 6
    assert stats["liczba_reklozerow"] == 4
    assert stats["liczba_bezpiecznikow"] == 7
    # ES: 2 generyczne + 1 wymaganie ENEA; DS_ES: 3 wymagania ENEA (630/1250/2000 A).
    assert stats["liczba_uziemnikow"] == 3
    assert stats["liczba_odlacznikow_trojpolozeniowych"] == 3
    assert stats["rodzaje"] == [
        "CIRCUIT_BREAKER",
        "DISCONNECTOR",
        "DISCONNECTOR_EARTH_SWITCH",
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
        "WYMAGANIE_STANDARDU_V1",
    ]
    # 33 pozycje bazowe zweryfikowane; 12 polskich ma źródło wyłącznie deklarowane
    # (dokument nie jest w repozytorium), więc są NIEWERYFIKOWANY.
    assert stats["liczba_zweryfikowanych"] == 33
    assert stats["liczba_czesciowo_zweryfikowanych"] == 3
    assert stats["liczba_nieweryfikowanych"] == 12
    # Wartości odniesienia = 4 pozycje wymagań standardu ENEA (progi wymagań, nie wyrób).
    assert stats["liczba_referencyjnych"] == 4
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
        assert params["catalog_status"] in {
            "PRODUKCYJNY_V1",
            "REFERENCYJNY_V1",
            "WYMAGANIE_STANDARDU_V1",
        }
        # Para predykatów z JEDNEGO źródła (karta GPZ-H5-APARATURA): pozycja wymagania
        # standardu ⇔ wartości odniesienia bez producenta, ze źródłem w standardzie ENEA.
        wymaganie = params["catalog_status"] == "WYMAGANIE_STANDARDU_V1"
        assert wymaganie == (params["verification_status"] == "REFERENCYJNY"), item["id"]
        if wymaganie:
            assert params["manufacturer"] is None, item["id"]
            assert params["source_reference"].startswith("ENEA Operator"), item["id"]
        assert params["contract_version"] == "2.0"
        assert isinstance(params["source_reference"], str)
        assert params["source_reference"].strip()
        if params["catalog_status"] == "PRODUKCYJNY_V1":
            assert params["verification_status"] == "ZWERYFIKOWANY"
        if params["verification_status"] == "NIEWERYFIKOWANY":
            assert params["source_reference"].startswith("Deklarowane: ")
            assert params["catalog_status"] == "REFERENCYJNY_V1"
