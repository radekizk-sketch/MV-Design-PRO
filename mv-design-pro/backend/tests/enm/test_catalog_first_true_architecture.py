from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_KABEL_SN = "cable-tfk-yakxs-3x120"
CATALOG_LINIA_SN = "line-base-al-st-50"
CATALOG_LINIA_ODG = "line-base-al-st-70"
CATALOG_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"


def _empty_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="test_branch_points_sn", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def _seed_with_segment(rodzaj: str = "LINIA_NAPOWIETRZNA") -> tuple[dict, str]:
    catalog_ref = CATALOG_KABEL_SN if rodzaj == "KABEL" else CATALOG_LINIA_SN
    s0 = _empty_enm()
    s1 = execute_domain_operation(
        s0,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": CATALOG_ZRODLO_SN},
    )["snapshot"]
    s2 = execute_domain_operation(
        s1,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": rodzaj,
                "dlugosc_m": 600,
                "catalog_ref": catalog_ref,
            },
        },
    )["snapshot"]
    seg_id = next(b["ref_id"] for b in s2["branches"] if b["type"] in ("line_overhead", "cable"))
    return s2, seg_id


def test_insert_branch_pole_on_overhead_line() -> None:
    snapshot, seg_id = _seed_with_segment("LINIA_NAPOWIETRZNA")
    resp = execute_domain_operation(
        snapshot,
        "insert_branch_pole_on_segment_sn",
        {"segment_id": seg_id, "catalog_ref": "SŁUP-ODG-12"},
    )
    assert resp.get("error") in (None, "")
    branch_points = resp["snapshot"].get("branch_points", [])
    assert any(bp.get("branch_point_type") == "branch_pole" for bp in branch_points)


def test_reject_insert_branch_pole_on_cable() -> None:
    snapshot, seg_id = _seed_with_segment("KABEL")
    resp = execute_domain_operation(
        snapshot,
        "insert_branch_pole_on_segment_sn",
        {"segment_id": seg_id, "catalog_ref": "SŁUP-ODG-12"},
    )
    assert resp.get("error_code") == "branch_point.invalid_parent_medium"


def test_insert_zksn_on_cable() -> None:
    snapshot, seg_id = _seed_with_segment("KABEL")
    resp = execute_domain_operation(
        snapshot,
        "insert_zksn_on_segment_sn",
        {"segment_id": seg_id, "catalog_ref": "ZKSN-2P"},
    )
    assert resp.get("error") in (None, "")
    branch_points = resp["snapshot"].get("branch_points", [])
    assert any(bp.get("branch_point_type") == "zksn" for bp in branch_points)
    blocker_codes = {b.get("code") for b in resp.get("readiness", {}).get("blockers", [])}
    assert "branch_point.switch_state_missing" in blocker_codes


def test_reject_insert_zksn_on_overhead_line() -> None:
    snapshot, seg_id = _seed_with_segment("LINIA_NAPOWIETRZNA")
    resp = execute_domain_operation(
        snapshot,
        "insert_zksn_on_segment_sn",
        {"segment_id": seg_id, "catalog_ref": "ZKSN-2P"},
    )
    assert resp.get("error_code") == "branch_point.invalid_parent_medium"


def test_branch_from_branch_pole_branch_port() -> None:
    snapshot, seg_id = _seed_with_segment("LINIA_NAPOWIETRZNA")
    s1 = execute_domain_operation(
        snapshot,
        "insert_branch_pole_on_segment_sn",
        {"segment_id": seg_id, "catalog_ref": "SŁUP-ODG-12"},
    )["snapshot"]
    bp = next(bp for bp in s1["branch_points"] if bp["branch_point_type"] == "branch_pole")

    resp = execute_domain_operation(
        s1,
        "start_branch_segment_sn",
        {
            "from_ref": f"{bp['ref_id']}.BRANCH",
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA",
                "dlugosc_m": 100,
                "catalog_ref": CATALOG_LINIA_ODG,
            },
        },
    )
    assert resp.get("error") in (None, "")
    assert resp["changes"]["created_element_ids"]


def test_branch_from_zksn_branch_1_port() -> None:
    snapshot, seg_id = _seed_with_segment("KABEL")
    s1 = execute_domain_operation(
        snapshot,
        "insert_zksn_on_segment_sn",
        {"segment_id": seg_id, "catalog_ref": "ZKSN-2P", "branch_ports_count": 2},
    )["snapshot"]
    zksn = next(bp for bp in s1["branch_points"] if bp["branch_point_type"] == "zksn")

    resp = execute_domain_operation(
        s1,
        "start_branch_segment_sn",
        {
            "from_ref": f"{zksn['ref_id']}.BRANCH_1",
            "segment": {"rodzaj": "KABEL", "dlugosc_m": 80, "catalog_ref": CATALOG_KABEL_SN},
        },
    )
    assert resp.get("error") in (None, "")
    updated = next(bp for bp in resp["snapshot"]["branch_points"] if bp["ref_id"] == zksn["ref_id"])
    assert updated.get("branch_occupied", {}).get("BRANCH_1")
