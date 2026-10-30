from __future__ import annotations

from network_model.catalog.mv_cable_line_catalog import (
    TEMP_OPERATING_XLPE_C,
    ZRODLO_KABLI_POLSKICH_DEKLAROWANE,
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
    """K30-22: 55 baseline + 8 Polish PN-HD 620 S2 (YHAKXS + YHKXS) = 63.

    Osiem pozycji polskich producentów ma źródło wyłącznie deklarowane (dokument
    nie jest w repozytorium), więc jest NIEWERYFIKOWANY / REFERENCYJNY_V1 i nie
    liczy się do kabli produkcyjnych: 62 − 8 = 54.
    """
    stats = get_catalog_statistics()
    summary = get_cable_catalog_quality_summary()

    # +6 aktualnych kabli NKT ENEA 2026; 4 stare etykiety operatora
    # nie sa juz bezpodstawnie oznaczone jako PRODUKCYJNY_V1.
    assert stats["liczba_kabli_ogolem"] == 82
    assert stats["liczba_kabli_produkcyjnych"] == 69
    assert summary["liczba_kabli_produkcyjnych"] == 69
    assert summary["liczba_kabli_testowych"] == 1
    # K30-22: + POLISH family (YHAKXS, YHKXS)
    assert "POLISH" in summary["rodziny_kabli"] or any(
        f.startswith("POLISH") or "YHAKXS" in f or "YHKXS" in f for f in summary["rodziny_kabli"]
    ), f"Polish PN-HD family missing: {summary['rodziny_kabli']}"
    # Cross-sections: baseline + 50, 95 (new)
    assert 50 in summary["przekroje_kabli_mm2"]
    assert 95 in summary["przekroje_kabli_mm2"]
    # 33 + 8 Polish 1C = 41
    assert summary["liczba_typow_1z"] == 60
    assert summary["liczba_typow_3z"] == 22
    assert "NKT_ENEA_2026" in summary["rodziny_kabli"]
    assert summary["statusy_weryfikacji"] == [
        "CZESCIOWO_ZWERYFIKOWANY",
        "NIEWERYFIKOWANY",
        "REFERENCYJNY",
        "ZWERYFIKOWANY",
    ]
    assert summary["statusy_katalogowe"] == ["PRODUKCYJNY_V1", "REFERENCYJNY_V1", "TESTOWY"]


def test_polish_pn_hd_620_cables_present() -> None:
    """K30-22: YHAKXS Al + YHKXS Cu single-core MV cables.

    Flaga certyfikatu PTPiREE wymaga dokumentu; źródło tych pozycji jest tylko
    deklarowane, więc flagi nie ma, a status to NIEWERYFIKOWANY.
    """
    cables = get_all_cable_types()
    polish_cables = [c for c in cables if c["id"].startswith("cable-polish-")]
    assert len(polish_cables) == 8
    yhakxs = [c for c in polish_cables if "yhakxs" in c["id"]]
    yhkxs = [c for c in polish_cables if "yhkxs" in c["id"]]
    assert len(yhakxs) == 5  # 50/95/120/150/240 Al
    assert len(yhkxs) == 3  # 95/150/240 Cu
    for c in polish_cables:
        params = c["params"]
        assert "ptpire_certified" not in params
        assert params["standard"] == "PN-HD 620 S2"
        assert params["source_reference"] == ZRODLO_KABLI_POLSKICH_DEKLAROWANE
        assert params["verification_status"] == "NIEWERYFIKOWANY"
        assert params["catalog_status"] == "REFERENCYJNY_V1"




def test_standard_enea_2026_kable_sn_z_kart_nkt_sa_zgodne_z_tablica_3() -> None:
    """ENEA 03.2026 pkt 4.2.2 tab. 3 + NKT CTL00109 rev. 4, s. 2-3.

    Parametry Iz sa wazne WYLACZNIE dla warunkow odniesienia NKT.
    120/25 i NA2XS2Y nie figuruja w tab. 3 ENEA (pozostaja historyczne).
    """
    expected = {
        70: (0.443, 190.0, 260.0, 6600.0),
        150: (0.206, 250.0, 398.0, 14200.0),
        240: (0.125, 290.0, 523.0, 22700.0),
    }
    records = [
        item for item in get_all_cable_types()
        if item["id"].startswith("cable-enea-2026-nkt-")
    ]
    assert len(records) == 6
    assert {int(item["params"]["cross_section_mm2"]) for item in records} == set(expected)
    assert {item["params"]["trade_name"].split(" ")[0] for item in records} == {
        "XUHAKXS1", "XRUHAKXS1"
    }
    for item in records:
        p = item["params"]
        section = int(p["cross_section_mm2"])
        r, c, iz, ith = expected[section]
        assert p["manufacturer"] == "NKT"
        rodzina = p["trade_name"].split(" ")[0]
        assert p["trade_name"] == f"{rodzina} 1x{section}/25"
        assert p["r_ohm_per_km"] == r
        assert p["c_nf_per_km"] == c
        assert p["rated_current_a"] == iz
        assert p["ith_1s_a"] == ith
        assert p["return_conductor_ith_1s_a"] == 5000.0
        assert p["return_conductor_cross_section_mm2"] == 25.0
        assert p["r0_ohm_per_km"] > 0
        assert p["x0_ohm_per_km"] > 0
        assert "03.2026" in p["source_reference"]
        assert ("CTL00109" if rodzina == "XRUHAKXS1" else "CTL00352") in p["source_reference"]
        assert p["catalog_status"] == "PRODUKCYJNY_V1"
        assert "gruntu 20" in p["verification_note"]

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
        if item["id"].startswith("cable-enea-operator-"):
            assert params["catalog_status"] == "REFERENCYJNY_V1"
            assert params["verification_status"] == "REFERENCYJNY"
            assert "NIE występuje" in params["verification_note"]
            assert "ENEA Operator standard" not in item["name"]
            continue
        if params["source_reference"] == ZRODLO_KABLI_POLSKICH_DEKLAROWANE:
            assert params["catalog_status"] == "REFERENCYJNY_V1"
            assert params["verification_status"] == "NIEWERYFIKOWANY"
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
