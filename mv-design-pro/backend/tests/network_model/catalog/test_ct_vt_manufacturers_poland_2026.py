"""Nowi producenci w Polsce: rodzina≠zamawialny CT, a rozpoznany SKU ESITAS≠wariant domyślny."""
from __future__ import annotations

from math import isclose, sqrt

from api.catalog import list_instrument_transformer_families
from network_model.catalog.mv_instrument_manufacturer_families_pl import (
    get_all_instrument_transformer_manufacturer_families_pl,
)
from network_model.catalog.mv_vt_esitas_verified import get_all_esitas_vt_confirmed_sku
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import VTType


def test_49_rodzin_12_producentow_z_wiarygodnym_zrodlem() -> None:
    items = get_all_instrument_transformer_manufacturer_families_pl()
    assert len(items) == 49
    assert list_instrument_transformer_families() == items
    assert len({r["id"] for r in items}) == 49
    assert {item["manufacturer"] for item in items} == {
        "KPB Intra", "RITZ", "Arteche", "ALCE Elektrik", "ESITAS",
        "PLESSE", "ZWARPOL", "PFIFFNER", "MBS",
        "Łukasiewicz-ITR", "SPIE Energotest", "ZELISKO",
    }
    for record in items:
        assert record["record_kind"] == "MANUFACTURER_FAMILY_NOT_SKU"
        assert record["catalog_status"] == "REFERENCYJNY_V1"
        assert record["verification_status"] == "CZESCIOWO_ZWERYFIKOWANY"
        assert "https://" in record["source_reference"]
        assert record["voltage_domain"] in ("SN", "nN")
        assert record["transformer_kind"] in (
            "CT", "VT", "CT_SENSOR", "VT_SENSOR", "ZERO_SEQUENCE",
        )
        assert not any(key in record for key in (
            "ratio_primary_a", "ratio_secondary_a",
            "ratio_primary_v", "ratio_secondary_v",
            "ith_ka_1s", "rct_ohm", "accuracy_class", "burden_va",
        ))
        assert record["id"] not in get_default_mv_catalog().ct_types
        assert record["id"] not in get_default_mv_catalog().vt_types


def test_kpb_ct_prawidlowy_zakres_vs_fikcyjne_wykonanie() -> None:
    families = get_all_instrument_transformer_manufacturer_families_pl()
    item = next(x for x in families if x["manufacturer"] == "KPB Intra" and x["model_family"] == "CTS 17.SW")
    assert item["um_kv"] == 17.5
    assert item["primary_a_min"] == 5
    assert item["primary_a_max"] == 3200
    assert item["secondary_current_options_a"] == [1, 5]
    assert item["core_count_max"] == 3
    assert "0.2S" in item["accuracy_options"]
    assert item["ith_range_ka"] == [2, 80]
    assert "5P" in item["accuracy_options"]
    # Nie wyprowadzamy ALF z samej nazwy klasy 5P (to rodzina).
    assert "secondary_cores" not in item
    assert "accuracy_limit_factor" not in item


def test_vts25_resztkowe_jest_opcja_a_nie_zawsze_obecna() -> None:
    families = get_all_instrument_transformer_manufacturer_families_pl()
    vt = next(x for x in families if x["manufacturer"] == "KPB Intra" and x["model_family"] == "VTS 25")
    assert vt["residual_capability"] is True
    assert vt["core_count_max"] == 4
    assert "secondary_windings" not in vt
    assert "has_residual_winding" not in vt
    assert vt["um_kv"] == 25.0


def test_esitas_trzy_numery_z_polskiej_oferty_roundtrip_bez_fv_uzwojenia_resztkowego() -> None:
    types = get_all_esitas_vt_confirmed_sku()
    repo = get_default_mv_catalog()
    assert len(types) == 3
    assert len({item["id"] for item in types}) == 3
    for item in types:
        data = item["params"]
        assert data["manufacturer"] == "ESITAS"
        assert data["accuracy_class"] == "0.2"
        assert data["burden_va"] == 10
        assert data["has_residual_winding"] is None
        assert data["secondary_windings"][0]["burden_va_min"] == 0.0
        assert data["secondary_windings"][0]["burden_va_max"] == 10.0
        assert data.get("rated_voltage_factor") is None
        assert data.get("voltage_factor_duration_s") is None
        assert isclose(data["ratio_secondary_v"], 100 / sqrt(3))
        assert data["um_kv"] in (17.5, 24.0)
        assert data["verification_status"] == "CZESCIOWO_ZWERYFIKOWANY"
        assert "astat.pl" in data["source_reference"]
        assert item["id"] in repo.vt_types
        d = repo.vt_types[item["id"]].to_dict()
        assert VTType.from_dict(d).to_dict() == d
    assert len(repo.ct_types) == 68
    assert len(repo.vt_types) == 31


def test_rodziny_sensorow_niskomocowych_nie_sa_klasycznymi_ct() -> None:
    families = get_all_instrument_transformer_manufacturer_families_pl()
    itr = [x for x in families if x["manufacturer"] == "Łukasiewicz-ITR"]
    assert len(itr) == 6
    assert {x["model_family"] for x in itr} == {
        "CR", "CRR", "UR56", "UR66", "UR90", "URW"
    }
    assert {x["transformer_kind"] for x in itr} == {"CT_SENSOR", "VT_SENSOR"}
    assert next(x for x in itr if x["model_family"] == "CRR")["mounting"] == "SPLIT_RING"
    assert all("1A/5A" in x["verification_note"] or "100V" in x["verification_note"] for x in itr)
    assert not any("ratio_secondary_a" in x or "ratio_secondary_v" in x for x in itr)
    earth = next(x for x in families if x["manufacturer"] == "SPIE Energotest")
    assert earth["model_family"] == "I0"
    assert earth["transformer_kind"] == "ZERO_SEQUENCE"
    assert earth["mounting"] == "RING"
    zelisko = next(x for x in families if x["manufacturer"] == "ZELISKO")
    assert zelisko["transformer_kind"] == "VT_SENSOR"
