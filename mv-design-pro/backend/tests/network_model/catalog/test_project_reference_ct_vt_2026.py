"""Przekładniki dokładnie z projektów WIOSKA i TRANSPAK.

Nie generuj kartezjańskich kombinacji klas/VA/przekładni! Nie wolno
przypisać jednego FS5 do rdzenia 5P10 ani pomylić liczby rdzeni z taps.
"""
from __future__ import annotations

from math import isclose, sqrt

from network_model.catalog.mv_ct_vt_project_references import (
    get_all_project_reference_ct_types,
    get_all_project_reference_vt_types,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CTType, VTType


def test_ct_4_udokumentowane_konfiguracje_bez_fikcyjnych_zaczepow() -> None:
    ct = get_all_project_reference_ct_types()
    assert len(ct) == 4
    assert len({row["id"] for row in ct}) == 4
    repo = get_default_mv_catalog()
    assert len(repo.ct_types) == 107
    for row in ct:
        p = row["params"]
        assert row["id"] in repo.ct_types
        assert p["catalog_status"] == "REFERENCYJNY_V1"
        assert p["verification_status"] == "REFERENCYJNY"
        assert p["source_reference"].startswith("PROJEKT_DOSTARCZONY")
        assert "primary_taps_a" not in p
        assert p["core_count"] == len(p["secondary_cores"])
        assert p["ratio_primary_a"] > 0 and p["ratio_secondary_a"] == 5
        assert all(core["secondary_a"] == 5.0 for core in p["secondary_cores"])
        result = repo.ct_types[row["id"]].to_dict()
        assert "primary_taps_a" not in result
        assert result["secondary_cores"] == p["secondary_cores"]
        assert CTType.from_dict(result).to_dict() == result


def test_wioska_tesar_3_rdzenie_40_5_5_5_i_cztery_uzwojenia_vt() -> None:
    repo = get_default_mv_catalog()
    ct = repo.ct_types["ct-projekt-wioska-tesar-ad11-40-5-5-5"].to_dict()
    assert ct["ratio_primary_a"] == 40.0
    assert ct["core_count"] == 3
    assert [x["burden_va"] for x in ct["secondary_cores"]] == [5.0] * 3
    assert [x["accuracy_class"] for x in ct["secondary_cores"]] == ["0.2S"] * 3
    assert [x["consumer"] for x in ct["secondary_cores"]] == ["UP", "ND45", "e2TANGO"]
    assert ct["fs_safety_factor"] == 5.0
    assert ct["ith_ka_1s"] == 6.0 and ct["idyn_ka_peak"] == 10.0
    # Przenosimy dokładny zapis z projektu, nie zastępujemy normowym 15 kA.
    assert ct["idyn_ka_peak"] < 2.5 * ct["ith_ka_1s"]

    vt_items = get_all_project_reference_vt_types()
    assert len(vt_items) == 1
    vt = repo.vt_types[vt_items[0]["id"]].to_dict()
    assert vt["manufacturer"] == "TESAR"
    assert vt["has_residual_winding"] is True
    assert isclose(vt["ratio_primary_v"], 15000 / sqrt(3))
    assert isclose(vt["ratio_secondary_v"], 100 / sqrt(3))
    windings = vt["secondary_windings"]
    assert len(windings) == 4
    assert [w["accuracy_class"] for w in windings] == ["0.2", "0.2", "0.2", "3P"]
    assert [w["burden_va_max"] for w in windings] == [7.5, 5.0, 5.0, 5.0]
    assert windings[3]["role"] == "RESIDUAL_3U0"
    assert isclose(windings[3]["rated_voltage_v"], 100 / 3)
    assert windings[3]["connection"] == "OPEN_DELTA_THREE_PHASE_BANK"
    assert windings[2]["role"] == "LOCAL_OR_PROTECTION"
    assert VTType.from_dict(vt).to_dict() == vt
    assert len(repo.vt_types) == 38


def test_transpak_dwa_rozne_200_5_i_mbs_250_5() -> None:
    repo = get_default_mv_catalog()
    impa = repo.ct_types["ct-projekt-transpak-impa-200-5-0p5-5va"].to_dict()
    sigma = repo.ct_types["ct-projekt-transpak-sigma-s40-200-5-02s-2p5va"].to_dict()
    mbs = repo.ct_types["ct-projekt-transpak-mbs-sask416-250-5-5p10"].to_dict()
    assert impa["ratio_primary_a"] == sigma["ratio_primary_a"] == 200.0
    assert impa["accuracy_class"] == "0.5"
    assert sigma["accuracy_class"] == "0.2S"
    assert impa["burden_va"] == 5.0
    assert sigma["burden_va"] == 2.5
    assert impa["fs_safety_factor"] == sigma["fs_safety_factor"] == 5.0
    assert impa["ith_ka_1s"] == sigma["ith_ka_1s"] == 12.0
    assert "DEMONTAŻU" in impa["verification_note"]
    assert "2,077VA" in sigma["verification_note"]
    assert mbs["ratio_primary_a"] == 250.0
    assert mbs["accuracy_class"] == "5P10"
    assert mbs["burden_va"] == 2.5
    assert mbs["secondary_cores"][0]["alf"] == 10
    assert mbs["secondary_cores"][0]["role"] == "PROTECTION"
    assert mbs["fs_safety_factor"] is None
    assert "fs" not in mbs["secondary_cores"][0]
    assert mbs["ith_ka_1s"] is None
    for x in (impa, sigma, mbs):
        assert "primary_taps_a" not in x


def test_opus_aktywne_zaczepy_nie_sa_narzucone_katalogiem() -> None:
    ct = get_all_project_reference_ct_types()
    assert all("active_primary_tap_a" not in row["params"] for row in ct)
    assert all("primary_taps_a" not in row["params"] for row in ct)
    # Jednozakresowy 200/5 nie może zamienić się w 200-400/5 od UI.
    ids = {row["id"] for row in ct}
    assert "ct-projekt-transpak-sigma-s40-200-5-02s-2p5va" in ids
    assert not any("200-400" in row["id"] for row in ct)
