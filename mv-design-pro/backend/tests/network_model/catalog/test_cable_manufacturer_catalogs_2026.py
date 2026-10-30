"""Pełne rodziny kabli NKT i TFK — producent, proweniencja, model odbiorcy.

Ograniczenie ENEA (tab. 3) stosuje się podczas walidacji sieci OSD,
NIE na etapie globalnego odczytu katalogu i projektowania instalacji klienta.
"""
from __future__ import annotations

import math

from network_model.catalog.lv_cable_nkt import get_all_nkt_lv_cable_types
from network_model.catalog.mv_cable_tfk_full import get_all_tfk_1220_cable_types, get_all_tfk_1830_cable_types
from network_model.catalog.mv_cable_line_catalog import (
    CABLE_NKT_PELNY_ODBIORCA_TYPES,
    get_all_cable_types,
)
from network_model.catalog.repository import get_default_mv_catalog


def test_nkt_sn_zachowuje_16_wariantow_12_20_i_dobor_odbiorcy() -> None:
    ids = {r["id"] for r in get_all_cable_types()}
    nkt_pozostale = CABLE_NKT_PELNY_ODBIORCA_TYPES
    nkt_enea = [
        i for i in ids if i.startswith("cable-enea-2026-nkt-xruhakxs1-")
    ]
    assert len(nkt_pozostale) == 13
    assert len(nkt_enea) == 3
    assert {i["id"] for i in nkt_pozostale}.issubset(ids)
    assert "cable-nkt-xruhakxs1-120-50-12-20" in ids
    assert "cable-nkt-xruhakxs1-630-50-12-20" in ids
    assert "cable-nkt-xruhakxs1-50-16-12-20" in ids
    for item in nkt_pozostale:
        p = item["params"]
        for pole in ("r_ohm_per_km", "x_ohm_per_km", "c_nf_per_km",
                     "rated_current_a", "ith_1s_a", "return_conductor_ith_1s_a"):
            assert math.isfinite(p[pole]) and p[pole] > 0, (item["id"], pole)
        assert "CTL00109" in p["source_reference"]
        assert "instalacji odbiorcy" in p["verification_note"]
        assert "ENEA" not in p["standard"]


def test_tfk_sn_12_20_27_wierszy_producenta_bez_mieszania_serii() -> None:
    records = get_all_tfk_1220_cable_types()
    assert len(records) == 27  # 13 Al + 14 Cu z oficjalnego TFK 2025
    ids = {i["id"] for i in records}
    assert len(ids) == 27
    repo = get_default_mv_catalog()
    for r in records:
        p = r["params"]
        assert r["id"] in repo.cable_types
        assert p["manufacturer"] == "TELE-FONIKA Kable"
        assert "tele-fonika.com/" in p["source_reference"]
        assert p["conductor_material"] in {"AL", "CU"}
        assert p["return_conductor_material"] == "CU"
        assert p["return_conductor_cross_section_mm2"] in {16, 25, 35, 50}
        for key in (
            "r_ohm_per_km", "x_ohm_per_km", "c_nf_per_km", "rated_current_a",
            "ith_1s_a", "return_conductor_ith_1s_a",
            "return_conductor_r_ohm_per_km_20c",
        ):
            assert isinstance(p[key], float) and math.isfinite(p[key]) and p[key] > 0, (
                r["id"], key, p.get(key)
            )
    assert next(x for x in records if x["id"] == "cable-tfk-2025-xruhakxs-240-50-12-20")["params"]["rated_current_a"] == 523
    assert next(x for x in records if x["id"] == "cable-tfk-2025-xruhkxs-240-50-12-20")["params"]["rated_current_a"] == 666




def test_tfk_sn_18_30_27_wierszy_z_osobnej_tabeli_2025() -> None:
    """Nie wolno kopiować parametrów 12/20 kV do typu 18/30 kV."""
    typy = get_all_tfk_1830_cable_types()
    assert len(typy) == 27
    repo = get_default_mv_catalog()
    for record in typy:
        p = record["params"]
        assert record["id"] in repo.cable_types
        assert record["id"].endswith("-18-30")
        assert p["voltage_rating_kv"] == 30.0
        assert "18/30(36)" in p["source_reference"]
        assert "tele-fonika.com" in p["source_reference"]
        assert all(
            math.isfinite(p[key]) and p[key] > 0
            for key in ("r_ohm_per_km", "x_ohm_per_km", "c_nf_per_km",
                        "rated_current_a", "ith_1s_a",
                        "return_conductor_r_ohm_per_km_20c",
                        "return_conductor_ith_1s_a")
        )
    al_240 = next(t for t in typy if t["id"] == "cable-tfk-2025-xruhakxs-240-50-18-30")
    cu_240 = next(t for t in typy if t["id"] == "cable-tfk-2025-xruhkxs-240-50-18-30")
    assert al_240["params"]["c_nf_per_km"] == 210.0
    assert al_240["params"]["rated_current_a"] == 518.0
    assert cu_240["params"]["c_nf_per_km"] == 210.0
    assert cu_240["params"]["rated_current_a"] == 661.0


def test_nkt_nn_37_roznych_pelnych_kabli_4_5_zyl_i_pen_bez_al10() -> None:
    nkt = get_all_nkt_lv_cable_types()
    assert len(nkt) == 37
    assert len({i["id"] for i in nkt}) == 37
    assert not any("nkt-yakxs-4x10" in i["id"] for i in nkt)
    assert sum(x["params"]["conductor_material"] == "CU" for x in nkt) == 19
    assert sum(x["params"]["conductor_material"] == "AL" for x in nkt) == 18
    repo = get_default_mv_catalog()
    for r in nkt:
        p = r["params"]
        assert r["id"] in repo.lv_cable_types
        assert "elektrykasklep.pl/file" in p["source_reference"]
        assert p["number_of_cores"] in (4, 5)
        assert p["core_functions"] == ("3L+PEN" if p["number_of_cores"] == 4 else "3L+N+PE")
        if p["core_functions"] == "3L+PEN" and p["conductor_material"] == "AL":
            assert p["cross_section_mm2"] >= 16
        for key in (
            "u_n_kv", "r_ohm_per_km", "x_ohm_per_km", "i_max_a",
            "cross_section_mm2", "return_conductor_cross_section_mm2",
            "return_conductor_r_ohm_per_km_20c", "return_conductor_x_ohm_per_km",
            "ith_1s_a", "jth_1s_a_per_mm2", "max_temperature_c",
            "short_circuit_temperature_c",
        ):
            assert isinstance(p[key], (int, float)) and math.isfinite(p[key]) and p[key] > 0, (
                r["id"], key, p.get(key)
            )


def test_catalog_no_enforced_enea_scope_for_customer_side() -> None:
    repo = get_default_mv_catalog()
    cable_ids = set(repo.cable_types)
    assert "cable-nkt-xruhakxs1-630-50-12-20" in cable_ids
    assert "cable-tfk-2025-xruhkxs-1000-50-12-20" in cable_ids
    assert "cable-tfk-2025-xruhakxs-1000-50-12-20" in cable_ids
    assert "cable-enea-2026-nkt-xruhakxs1-240-25" in cable_ids
