"""Przekładniki rynku PL: konkretne wyroby vs nieprzypisywalne rodziny."""
from __future__ import annotations

from math import isclose, sqrt

from api.catalog import list_instrument_transformer_families
from network_model.catalog.mv_ct_vt_other_pl import (
    get_zwarpol_jsgo_ct_types,
    get_ritz_ves_vt_types,
)
from network_model.catalog.mv_instrument_manufacturer_families_pl import (
    get_all_instrument_transformer_manufacturer_families_pl,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CTType, VTType


def test_zwarpol_2_wykonania_z_osobnymi_rdzeniami_0p625a() -> None:
    items = get_zwarpol_jsgo_ct_types()
    assert len(items) == 2
    repo = get_default_mv_catalog()
    for x in items:
        p = x["params"]
        assert x["id"] in repo.ct_types
        assert p["manufacturer"] == "ZWARPOL"
        assert p["ratio_primary_a"] == 1500.0
        assert p["core_count"] == 2
        assert p["catalog_status"] == "REFERENCYJNY_V1"
        assert p["verification_status"] == "CZESCIOWO_ZWERYFIKOWANY"
        assert "zwarpol.com" in p["source_reference"]
        assert "ith_ka_1s" not in p and "um_kv" not in p and "rct_ohm" not in p
        obj = repo.ct_types[x["id"]]
        assert obj.to_dict()["secondary_cores"] == p["secondary_cores"]
        assert CTType.from_dict(obj.to_dict()).to_dict() == obj.to_dict()
    p1 = items[0]["params"]
    assert [w["accuracy_class"] for w in p1["secondary_cores"]] == ["0.2S", "5P20"]
    assert [w["burden_va"] for w in p1["secondary_cores"]] == [30.0, 120.0]
    assert p1["secondary_cores"][0]["fs"] == 5.0
    assert "fs" not in p1["secondary_cores"][1]
    p2 = items[1]["params"]
    assert [w["secondary_a"] for w in p2["secondary_cores"]] == [5.0, 0.625]
    assert [w["accuracy_class"] for w in p2["secondary_cores"]] == ["5P10", "5P150"]
    assert "fs_safety_factor" not in p2
    assert all("fs" not in w for w in p2["secondary_cores"])


def test_ritz_ves_6_konfiguracji_z_tabeli_bez_3u0_z_domyslu() -> None:
    records = get_ritz_ves_vt_types()
    assert len(records) == 6
    repo = get_default_mv_catalog()
    for x in records:
        p = x["params"]
        assert x["id"] in repo.vt_types
        assert p["manufacturer"] == "RITZ"
        assert p["has_residual_winding"] is None
        assert p["rated_voltage_factor"] if "rated_voltage_factor" in p else True
        assert p["um_kv"] in (12.0, 17.5, 24.0)
        assert p["burden_va"] == (20.0 if p["accuracy_class"] == "0.2" else 50.0)
        assert p["catalog_status"] == "REFERENCYJNY_V1"
        assert len(p["secondary_windings"]) == 1
        assert p["secondary_windings"][0]["connection"] == "TO_CONFIRM"
        assert isclose(p["ratio_primary_v"] / p["ratio_secondary_v"],
                       round(p["ratio_primary_v"] / p["ratio_secondary_v"]), abs_tol=1e-7)
        obj = repo.vt_types[x["id"]]
        assert VTType.from_dict(obj.to_dict()).to_dict() == obj.to_dict()
        assert obj.to_dict()["secondary_windings"] == p["secondary_windings"]
    ids = {i["id"] for i in records}
    assert len(ids) == 6


def test_rodziny_innych_producentow_oddzielne_od_ct_vt_i_nieprzypisywalne() -> None:
    families = get_all_instrument_transformer_manufacturer_families_pl()
    assert families == list_instrument_transformer_families()
    manufacturers = {r["manufacturer"] for r in families}
    assert {"KPB Intra", "RITZ", "Arteche", "ALCE Elektrik", "ESITAS",
            "PLESSE", "ZWARPOL", "TESAR Polska", "KONČAR",
            "POLCONTACT WARSZAWA"} <= manufacturers
    ids = [r["id"] for r in families]
    assert len(ids) == len(set(ids))
    repo = get_default_mv_catalog()
    assert not set(ids) & (set(repo.ct_types) | set(repo.vt_types))
    assert len(families) >= 50
    for family in families:
        assert family["record_kind"] == "MANUFACTURER_FAMILY_NOT_SKU"
        assert family["catalog_status"] == "REFERENCYJNY_V1"
        assert family["source_reference"].startswith(("KPB", "RITZ", "ZELAP", "ELMOR", "ALCE",
                "ASTAT", "PFIFFNER", "PLESSE", "ZWARPOL", "Łukasiewicz", "SPIE",
                "ZOE", "TESAR", "KONČAR", "POLCONTACT"))
    tesar = [r for r in families if r["manufacturer"] == "TESAR Polska"]
    assert {r["model_family"] for r in tesar} == {"AD11", "FD11"}
    kpb_ctso = next(r for r in families if r["manufacturer"] == "KPB Intra" and r["model_family"] == "CTSO 25")
    assert kpb_ctso["primary_a_min"] == 5
    assert kpb_ctso["primary_a_max"] == 600
    assert kpb_ctso["ith_range_ka"] == [2, 80]
    polcontact = next(r for r in families if r["manufacturer"] == "POLCONTACT WARSZAWA")
    assert polcontact["model_family"] == "JK24 D60"
    assert "FS10" in polcontact["verification_note"]
