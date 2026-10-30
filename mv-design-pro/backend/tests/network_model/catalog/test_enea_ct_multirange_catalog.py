"""Przekładnie ENEA są profilem 50–100/5 lub 200–400/5, nie dwiema SKU.

Testujemy rzeczywisty kontrakt CTType → CatalogRepository (do pobrania
przez Opusa), bez ingerowania w mechanizm aktywnego zaczepu pola/SLD.
"""
from __future__ import annotations

from collections import Counter
from math import isfinite

from network_model.catalog.mv_ct_enea_multirange import (
    ENEA_CT_SN_WIELOPRZEKLADNIOWE,
    get_all_enea_multirange_ct_types,
    get_all_enea_lv_metering_ct_types,
)
from network_model.catalog.mv_instrument_transformers_full import get_all_enea_ct_profiles
from network_model.catalog.mv_instrument_manufacturer_families_pl import (
    get_all_instrument_transformer_manufacturer_families_pl,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CTType


def test_enea_13_wieloprzekladniowych_jeden_aparat_dwa_nominalne_zakresy() -> None:
    items = get_all_enea_multirange_ct_types()
    assert len(items) == 13
    assert len(ENEA_CT_SN_WIELOPRZEKLADNIOWE) == 13
    assert Counter(x["id"].split("-")[3] for x in items) == {
        "5a": 4, "5b": 5, "5c": 3, "5d": 1
    }
    assert len({r["id"] for r in items}) == 13
    repo = get_default_mv_catalog()
    for item in items:
        p = item["params"]
        assert item["id"] in repo.ct_types
        assert p["ratio_primary_a"] == min(p["primary_taps_a"])
        assert p["primary_taps_a"] in ([50.0, 100.0], [200.0, 400.0])
        assert p["ratio_secondary_a"] == 5.0
        assert p["core_count"] >= len(p["secondary_cores"]) >= 1
        assert p["secondary_cores"][0]["role"] == "BILLING"
        assert p["secondary_cores"][0]["fs"] == 5.0
        assert p["secondary_cores"][0]["rated_at_primary_tap_a"] == p["ratio_primary_a"]
        assert p["catalog_status"] == "REFERENCYJNY_V1"
        assert p["verification_status"] == "REFERENCYJNY"
        assert "załącznik 5/A-D" in p["source_reference"] or "załącznik 5/A" in p["source_reference"]
        assert "nie jest" in p["verification_note"].lower() or "nie dwa" in p["verification_note"].lower()
        assert "aktywny zaczep" in p["verification_note"]
        assert "Sposobu przełączania" in p["verification_note"]
        # Katalog opisuje obie opcje, ale nie dokonuje wyboru w projekcie.
        assert "active_primary_tap_a" not in p
        obj = repo.ct_types[item["id"]]
        d = obj.to_dict()
        assert d["primary_taps_a"] == p["primary_taps_a"]
        assert d["core_count"] == p["core_count"]
        assert d["secondary_cores"] == p["secondary_cores"]
        assert CTType.from_dict(d).to_dict() == d
        assert all(isfinite(float(tap)) and tap > 0 for tap in d["primary_taps_a"])


def test_wymagania_mniejszego_zaczepu_i_toroid_072_kv() -> None:
    items = get_all_enea_multirange_ct_types()
    for item in items:
        p = item["params"]
        annex = item["id"].split("-")[3]
        expected_va, expected_ith = {
            "5a": (10.0, 16.0),
            "5b": (5.0, 8.0),
            "5c": (10.0, 16.0),
            "5d": (5.0, 8.0),
        }[annex]
        assert p["burden_va"] == expected_va
        assert p["ith_ka_1s"] == expected_ith
        assert p["um_kv"] == (0.72 if annex in ("5c", "5d") else 24.0)
        if len(p["secondary_cores"]) > 1:
            assert p["secondary_cores"][1]["role"] == "LOCAL_METERING"
            assert p["secondary_cores"][1]["accuracy_class"] == "0.2"
            assert p["secondary_cores"][1]["burden_va"] == 10.0
        assert "dla MNIEJSZEGO zaczepu" in p["verification_note"]


def test_pojedyncze_200_5_400_5_nie_moga_byc_legacy_ani_usuniete() -> None:
    """ENEA ma przełączalne w nowych PPE, lecz istniejące CT mogą być 200/5.

    Np. przetarg ENEA GPZ Kościan 2026: istniejące 4MC 200/5/5 A,
    wymiana na 200-400/5/5/5 A w przebudowywanym polu.
    """
    repo = get_default_mv_catalog()
    single = [
        item for item in get_all_enea_ct_profiles()
        if item["name"].startswith("CT jednozakresowy")
    ]
    assert single
    assert not any("LEGACY" in item["name"] for item in single)
    assert not any("nie wybierać" in item["name"].lower() for item in single)
    assert all(item["id"] in repo.ct_types for item in single)
    assert all("primary_taps_a" not in item["params"] for item in single)
    assert all("Nie deklaruje zgodności z nowym" in item["params"]["verification_note"]
               for item in single)
    assert all("Nie dopisywać zaczepów" in item["params"]["verification_note"]
               for item in single)
    assert all(item["params"]["catalog_status"] == "REFERENCYJNY_V1"
               for item in single)
    assert any("5a-linia" in item["id"] and "-200-" in item["id"] for item in single)
    assert any("5a-linia" in item["id"] and "-400-" in item["id"] for item in single)
    # Prawidłowy aparat jednozakresowy nie dostaje fikcyjnych dodatkowych zaczepów.
    ct = next(item for item in single
              if "5a-linia" in item["id"] and "-200-" in item["id"])
    loaded = repo.ct_types[ct["id"]].to_dict()
    assert loaded["ratio_primary_a"] == 200.0
    assert loaded["ratio_secondary_a"] == 5.0
    assert "primary_taps_a" not in loaded
    assert CTType.from_dict(loaded).to_dict() == loaded



def test_enea_nn_200_400_800_przekladniki_pomiarowe() -> None:
    records = get_all_enea_lv_metering_ct_types()
    assert len(records) == 3
    assert {r["params"]["ratio_primary_a"] for r in records} == {200.0, 400.0, 800.0}
    repo = get_default_mv_catalog()
    for item in records:
        p = item["params"]
        assert item["id"] in repo.ct_types
        assert p["accuracy_class"] == "0.2S"
        assert p["burden_va"] == 5.0
        assert p["fs_safety_factor"] == 5.0
        assert p["secondary_cores"][0]["fs_max"] == 5.0
        assert p["secondary_cores"][0]["extended_current_min_percent"] == 120.0
        assert p["ith_ka_1s"] == 60 * p["ratio_primary_a"] / 1000.0
        assert p["um_kv"] == 0.72
        assert p["construction"] == "LV_BUS_CABLE_METERING_CT"
        assert p["source_reference"].startswith("ENEA Operator")
        assert CTType.from_dict(repo.ct_types[item["id"]].to_dict()).to_dict() == repo.ct_types[item["id"]].to_dict()


def test_kpb_cts25_techniczna_mozliwosc_przelaczenia_nie_oznacza_200_400() -> None:
    families = get_all_instrument_transformer_manufacturer_families_pl()
    kpb = next(x for x in families
               if x["manufacturer"] == "KPB Intra" and x["model_family"] == "CTS 25")
    assert kpb["primary_reconnection_supported"] is True
    assert kpb["secondary_reconnection_supported"] is True
    assert kpb["primary_reconnection_method"] == "TWO_M8_BRIDGES"
    assert kpb["specific_primary_tap_values_verified"] is False
    assert kpb["primary_a_min"] == 5
    assert kpb["primary_a_max"] == 2500
    assert "kpbintra.cz" in kpb["source_reference"]
    assert kpb["id"] not in get_default_mv_catalog().ct_types
    assert not any("primary_taps_a" in kpb for _ in [0])
