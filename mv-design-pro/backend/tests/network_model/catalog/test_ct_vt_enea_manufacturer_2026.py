"""Odbiór katalogu CT/VT: wymogi ENEA ≠ fizyczny wyrób; Ferranti ≠ CT fazowy."""
from __future__ import annotations

from math import isclose, isfinite, sqrt

from api.catalog import list_ferranti_types
from network_model.catalog.mv_ferranti_catalog import get_all_ferranti_types
from network_model.catalog.mv_ct_abb_tpu_standard import get_abb_tpu6_standard_types
from network_model.catalog.mv_instrument_transformers_full import (
    get_all_enea_ct_profiles,
    get_all_enea_vt_profiles,
    get_all_abb_udz_vt_profiles,
    get_abb_tpu_nameplate_example,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CTType, VTType


def test_enea_36_ct_wymagania_5a_5b_5c_5d_z_rdzeniami() -> None:
    items = get_all_enea_ct_profiles()
    assert len(items) == 36
    assert len({x["id"] for x in items}) == 36
    repo = get_default_mv_catalog()
    for item in items:
        p = item["params"]
        assert item["id"] in repo.ct_types
        assert p["verification_status"] == "REFERENCYJNY"
        assert p["catalog_status"] == "REFERENCYJNY_V1"
        assert p["accuracy_class"] == "0.2S"
        assert p["fs_safety_factor"] == 5.0
        assert p["um_kv"] == (0.72 if p["construction"] == "RING_PHASE_CT" else 24.0)
        assert p["core_count"] >= len(p["secondary_cores"]) >= 1
        assert p["secondary_cores"][0]["role"] == "BILLING"
        assert p["secondary_cores"][0]["fs"] == 5.0
        assert p["idyn_ka_peak"] == p["ith_ka_1s"] * 2.5
        assert "załącznik 5 A-F" in p["source_reference"]
        for core in p["secondary_cores"]:
            assert core["role"] in ("BILLING", "LOCAL_METERING")
            assert core["accuracy_class"] in ("0.2S", "0.2")
            assert core["burden_va"] > 0
            assert core["fs"] == 5.0
        obj = repo.ct_types[item["id"]]
        d = obj.to_dict()
        assert d["core_count"] == p["core_count"]
        assert d["secondary_cores"] == p["secondary_cores"]
        assert d["um_kv"] == p["um_kv"]
    assert {x["params"]["construction"] for x in items} == {
        "SUPPORT", "RING_PHASE_CT"
    }
    assert {x["params"]["ith_ka_1s"] for x in items} == {2.0, 8.0, 16.0}


def test_ct_legacy_zostaja_bez_nowych_kluczy_i_roundtrip() -> None:
    repo = get_default_mv_catalog()
    ct = repo.ct_types["ct_50_1_0_5_5va_arteche"]
    d = ct.to_dict()
    assert "secondary_cores" not in d
    assert "um_kv" not in d
    assert "core_count" not in d
    assert CTType.from_dict(d).to_dict() == d


def test_enea_vt_trzy_wtorne_to_nie_dowod_otwartego_trojkata() -> None:
    rows = get_all_enea_vt_profiles()
    assert len(rows) == 6
    repo = get_default_mv_catalog()
    for item in rows:
        p = item["params"]
        assert p["has_residual_winding"] is None
        assert p["accuracy_class"] == "0.2"
        assert p["um_kv"] in (7.2, 24.0)
        assert p["primary_connection"] == "PHASE_EARTH"
        assert len(p["secondary_windings"]) == 3
        assert all(isclose(w["rated_voltage_v"], 100 / sqrt(3))
                   for w in p["secondary_windings"])
        assert all(w.get("connection") != "OPEN_DELTA_THREE_PHASE_BANK"
                   for w in p["secondary_windings"])
        assert "Trzy wtórne napięcia" in p["verification_note"]
        d = repo.vt_types[item["id"]].to_dict()
        assert d["secondary_windings"] == p["secondary_windings"]
        assert VTType.from_dict(d).to_dict() == d


def test_abb_udz24_residual_uzwojenie_100_na_3_oznaczone_odrebnie() -> None:
    items = get_all_abb_udz_vt_profiles()
    assert len(items) == 9
    repo = get_default_mv_catalog()
    for item in items:
        p = item["params"]
        assert p["manufacturer"] == "ABB"
        assert p["um_kv"] == 24.0
        assert p["rated_voltage_factor"] == 1.9
        assert p["voltage_factor_duration_s"] == 28800
        assert isfinite(p["ratio_primary_v"])
        assert p["catalog_status"] == "REFERENCYJNY_V1"
        assert p["verification_status"] == "CZESCIOWO_ZWERYFIKOWANY"
        assert len(p["secondary_windings"]) == (2 if p["has_residual_winding"] else 1)
        if p["has_residual_winding"]:
            winding = p["secondary_windings"][1]
            assert winding["accuracy_class"] == "3P"
            assert winding["connection"] == "OPEN_DELTA_THREE_PHASE_BANK"
            assert isclose(winding["rated_voltage_v"], 100 / 3)
            assert winding["role"] == "RESIDUAL_3U0"
            if p["accuracy_class"] == "0.2":
                assert sum(w["burden_va"] for w in p["secondary_windings"]) <= 50
        assert repo.vt_types[item["id"]].to_dict()["secondary_windings"] == p["secondary_windings"]
        assert VTType.from_dict(repo.vt_types[item["id"]].to_dict()).to_dict() == repo.vt_types[item["id"]].to_dict()


def test_ferranti_ma_odrebne_api_bez_pozornej_przekladni_pradowej() -> None:
    records = get_all_ferranti_types()
    assert records == list_ferranti_types()
    assert len(records) == 5
    assert len({x["id"] for x in records}) == 5
    ids = set(get_default_mv_catalog().ct_types)
    for rec in records:
        assert rec["id"] not in ids
        assert rec["measurement_kind"] == "ZERO_SEQUENCE_3I0"
        assert rec["turns_ratio"] in ("1/470", "1/120")
        assert rec["catalog_status"] == "REFERENCYJNY_V1"
        assert rec["source_reference"].startswith(("Schneider Electric", "ABB"))
        assert "ratio_primary_a" not in rec
        assert "ratio_secondary_a" not in rec
    assert [x["window_diameter_mm"] for x in records if x["manufacturer"] == "Schneider Electric"] == [120, 196, 291]
    assert {x["construction"] for x in records if x["manufacturer"] == "ABB"} == {
        "CLOSED_RING", "SPLIT_RING"
    }
    assert all(rec["thermal_short_circuit_duration_s"] == 5
               for rec in records if rec["manufacturer"] == "ABB")


def test_przekladniki_osobne_licznosci_bez_duplikatow() -> None:
    repo = get_default_mv_catalog()
    # 14 CT z PR #508 +36 ENEA +1 ABB tabliczka +17 ABB standard.
    assert len(repo.ct_types) == 181
    # 13 VT dotychczasowych + 6 ENEA + 9 ABB + 3 ESITAS.
    assert len(repo.vt_types) == 37
    assert len(set(repo.ct_types)) == 181
    assert len(set(repo.vt_types)) == 37


def test_abb_tpu70_63_rzeczywista_tabliczka_z_czterema_rdzeniami() -> None:
    """Dane z rysunku producenta, NIE wymyslony typ zamawialny."""
    sample = get_abb_tpu_nameplate_example()
    assert len(sample) == 1
    row = sample[0]
    p = row["params"]
    assert p["manufacturer"] == "ABB"
    assert p["core_count"] == 4
    assert p["um_kv"] == 36.0
    assert p["ith_ka_1s"] == 16.0
    assert p["idyn_ka_peak"] == 40.0
    assert [c["accuracy_class"] for c in p["secondary_cores"]] == [
        "5P20", "0.2S", "5P40", "0.2S"
    ]
    assert [c["secondary_a"] for c in p["secondary_cores"]] == [1.0, 1.0, 1.0, 5.0]
    assert [c.get("rct_max_ohm") for c in p["secondary_cores"]] == [1.0, None, 2.0, None]
    assert p["catalog_status"] == "REFERENCYJNY_V1"
    assert "1VLM000610" in p["source_reference"]
    assert get_default_mv_catalog().ct_types[row["id"]].to_dict()["secondary_cores"] == p["secondary_cores"]


def test_17_abb_tpu6_rzeczywiste_wiersze_producenta_bez_awansu_na_enea() -> None:
    """TPU 6x.xx 2014: 17 jednoznacznych kombinacji 0,5 FS5 + 5P ALF."""
    types = get_abb_tpu6_standard_types()
    assert len(types) == 17
    assert len({item["id"] for item in types}) == 17
    assert {item["params"]["ratio_primary_a"] for item in types} == {
        20.0, 30.0, 50.0, 100.0, 200.0, 300.0, 400.0,
        500.0, 600.0, 750.0, 1000.0, 1250.0,
        1500.0, 2000.0, 2500.0, 3000.0, 3200.0,
    }
    repo = get_default_mv_catalog()
    for item in types:
        p = item["params"]
        assert item["id"] in repo.ct_types
        assert p["manufacturer"] == "ABB"
        assert p["um_kv"] == 24.0
        assert p["core_count"] == 2
        assert len(p["secondary_cores"]) == 2
        billing, protective = p["secondary_cores"]
        assert billing["accuracy_class"] == "0.5"
        assert billing["fs"] == 5.0
        assert billing["role"] == "METERING"
        assert protective["accuracy_class"].startswith("5P")
        assert protective["alf"] in (10, 15)
        assert "fs" not in protective
        assert p["ith_ka_1s"] > 0
        assert p["idyn_ka_peak"] >= 2.5 * p["ith_ka_1s"] * 0.99
        assert "2014" in p["source_reference"]
        assert "referencyj" in p["catalog_status"].lower()
        assert "Klasa 0,5 nie zastępuje wymogu 0,2S" in p["verification_note"]
        assert repo.ct_types[item["id"]].to_dict()["secondary_cores"] == p["secondary_cores"]
