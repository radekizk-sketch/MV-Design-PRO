from __future__ import annotations

from network_model.catalog.mv_cable_line_catalog import (
    TEMP_OPERATING_XLPE_C,
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
    """K30-22: 55 baseline + 8 Polish PN-HD 620 S2 (YHAKXS + YHKXS) = 63."""
    stats = get_catalog_statistics()
    summary = get_cable_catalog_quality_summary()

    assert stats["liczba_kabli_ogolem"] == 63
    assert stats["liczba_kabli_produkcyjnych"] == 62
    assert summary["liczba_kabli_produkcyjnych"] == 62
    assert summary["liczba_kabli_testowych"] == 1
    # K30-22: + POLISH family (YHAKXS, YHKXS)
    assert "POLISH" in summary["rodziny_kabli"] or any(
        f.startswith("POLISH") or "YHAKXS" in f or "YHKXS" in f for f in summary["rodziny_kabli"]
    ), f"Polish PN-HD family missing: {summary['rodziny_kabli']}"
    # Cross-sections: baseline + 50, 95 (new)
    assert 50 in summary["przekroje_kabli_mm2"]
    assert 95 in summary["przekroje_kabli_mm2"]
    # 33 + 8 Polish 1C = 41
    assert summary["liczba_typow_1z"] == 41
    assert summary["liczba_typow_3z"] == 22
    assert summary["statusy_weryfikacji"] == [
        "CZESCIOWO_ZWERYFIKOWANY",
        "REFERENCYJNY",
        "ZWERYFIKOWANY",
    ]
    assert summary["statusy_katalogowe"] == ["PRODUKCYJNY_V1", "TESTOWY"]


def test_polish_pn_hd_620_cables_present() -> None:
    """K30-22: YHAKXS Al + YHKXS Cu single-core MV cables."""
    cables = get_all_cable_types()
    polish_cables = [c for c in cables if c["id"].startswith("cable-polish-")]
    assert len(polish_cables) == 8
    yhakxs = [c for c in polish_cables if "yhakxs" in c["id"]]
    yhkxs = [c for c in polish_cables if "yhkxs" in c["id"]]
    assert len(yhakxs) == 5  # 50/95/120/150/240 Al
    assert len(yhkxs) == 3  # 95/150/240 Cu
    for c in polish_cables:
        params = c["params"]
        assert params.get("ptpire_certified") is True
        assert params["standard"] == "PN-HD 620 S2"


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


def test_kazdy_typ_kablowy_niesie_pare_temperatur_do_kryterium_cieplnego() -> None:
    """V12K-225: bez PARY temperatur kryterium IEC 60949 nie ma czego podstawic.

    Osiem typow polskich (YHAKXS/YHKXS) podawalo tylko temperature zwarciowa, a
    temperatura robocza „istniala" wylacznie jako domyslna wartosc dataclassy
    `CableType.max_temperature_c = 90.0` — sciezka rekordowa zglaszala brak, sciezka
    obiektowa go maskowala. Ten test pilnuje, zeby kolejny dodany typ nie wrocil do
    tego stanu: brak temperatury w REKORDZIE oznacza kryterium bez werdyktu.
    """
    bez_pary: list[str] = []
    for item in get_all_cable_types():
        params = item["params"]
        if params.get("max_temperature_c") is None or (
            params.get("short_circuit_temperature_c") is None
        ):
            bez_pary.append(str(item["id"]))

    assert bez_pary == [], (
        "typy kablowe bez pary temperatur (kryterium cieplne bez werdyktu): " f"{bez_pary}"
    )


def test_temperatura_robocza_izolacji_usieciowanej_jest_jednoglosna() -> None:
    """Kontrola SPOJNOSCI, nie wartosci: stala TEMP_OPERATING_XLPE_C ma sens tylko
    wtedy, gdy katalog nie ma dla tej izolacji drugiej temperatury roboczej. Gdyby
    pojawil sie typ XLPE z inna theta_b, nazwana stala przestala by byc prawda o
    katalogu i uzupelnienie osmiu rekordow trzeba by przemyslec na nowo.
    """
    temperatury_usieciowane = {
        params["max_temperature_c"]
        for params in (item["params"] for item in get_all_cable_types())
        if params.get("insulation_type") in {"XLPE", "EPR"}
    }

    assert temperatury_usieciowane == {TEMP_OPERATING_XLPE_C}
