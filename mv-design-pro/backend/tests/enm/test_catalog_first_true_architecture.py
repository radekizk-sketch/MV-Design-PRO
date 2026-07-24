from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.validator import ENMValidator

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
        {"segment_id": seg_id, "catalog_ref": "SLUP-ODG-12"},
    )
    assert resp.get("error") in (None, "")
    branch_points = resp["snapshot"].get("branch_points", [])
    assert any(bp.get("branch_point_type") == "branch_pole" for bp in branch_points)
    line_run = resp["snapshot"]["line_runs"][0]
    line_run_segments = [item["segment_ref"] for item in line_run["segments"]]
    assert seg_id not in line_run_segments
    assert f"{seg_id}_L_branch_pole" in line_run_segments
    assert f"{seg_id}_R_branch_pole" in line_run_segments
    assert [item["order"] for item in line_run["segments"]] == list(
        range(1, len(line_run_segments) + 1)
    )


def test_continue_trunk_segment_accepts_explicit_zero_sequence_data() -> None:
    s0 = _empty_enm()
    s1 = execute_domain_operation(
        s0,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": CATALOG_ZRODLO_SN},
    )["snapshot"]
    resp = execute_domain_operation(
        s1,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 600,
                "catalog_ref": CATALOG_KABEL_SN,
                "zero_sequence": {"r0_ohm_per_km": 0.74, "x0_ohm_per_km": 0.31},
            },
        },
    )
    assert resp.get("error") in (None, "")
    branch = next(branch for branch in resp["snapshot"]["branches"] if branch["type"] == "cable")
    assert branch["r0_ohm_per_km"] == 0.74
    assert branch["x0_ohm_per_km"] == 0.31


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
    zksn = next(bp for bp in branch_points if bp.get("branch_point_type") == "zksn")
    assert zksn["switch_state"] == "closed"
    blocker_codes = {b.get("code") for b in resp.get("readiness", {}).get("blockers", [])}
    assert "branch_point.switch_state_missing" not in blocker_codes


def test_reject_insert_zksn_on_overhead_line() -> None:
    snapshot, seg_id = _seed_with_segment("LINIA_NAPOWIETRZNA")
    resp = execute_domain_operation(
        snapshot,
        "insert_zksn_on_segment_sn",
        {"segment_id": seg_id, "catalog_ref": "ZKSN-2P"},
    )
    assert resp.get("error_code") == "branch_point.invalid_parent_medium"


def test_refresh_snapshot_completes_legacy_zksn_switch_state() -> None:
    snapshot, seg_id = _seed_with_segment("KABEL")
    legacy = execute_domain_operation(
        snapshot,
        "insert_zksn_on_segment_sn",
        {"segment_id": seg_id, "catalog_ref": "ZKSN-2P", "branch_ports_count": 2},
    )["snapshot"]
    legacy["branch_points"][0].pop("switch_state", None)

    refreshed = execute_domain_operation(legacy, "refresh_snapshot", {})
    zksn = next(
        bp for bp in refreshed["snapshot"]["branch_points"] if bp["branch_point_type"] == "zksn"
    )
    blocker_codes = {b.get("code") for b in refreshed.get("readiness", {}).get("blockers", [])}

    assert zksn["switch_state"] == "closed"
    assert "branch_point.switch_state_missing" not in blocker_codes


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


def test_start_branch_segment_accepts_explicit_zero_sequence_data() -> None:
    snapshot, seg_id = _seed_with_segment("LINIA_NAPOWIETRZNA")
    s1 = execute_domain_operation(
        snapshot,
        "insert_branch_pole_on_segment_sn",
        {"segment_id": seg_id, "catalog_ref": "SĹUP-ODG-12", "switch_state": "closed"},
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
                "zero_sequence": {"r0_ohm_per_km": 1.11, "x0_ohm_per_km": 1.37},
            },
        },
    )
    assert resp.get("error") in (None, "")
    branch_ref = next(
        ref for ref in resp["changes"]["created_element_ids"] if ref.startswith("seg/")
    )
    branch = next(
        branch for branch in resp["snapshot"]["branches"] if branch["ref_id"] == branch_ref
    )
    assert branch["r0_ohm_per_km"] == 1.11
    assert branch["x0_ohm_per_km"] == 1.37


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


def test_branch_point_ports_are_electrically_connected_to_main_node() -> None:
    snapshot, seg_id = _seed_with_segment("KABEL")
    resp = execute_domain_operation(
        snapshot,
        "insert_zksn_on_segment_sn",
        {
            "segment_id": seg_id,
            "catalog_ref": "ZKSN-2P",
            "branch_ports_count": 2,
            "switch_state": "closed",
        },
    )
    assert resp.get("error") in (None, "")

    snap = resp["snapshot"]
    zksn = next(bp for bp in snap["branch_points"] if bp["branch_point_type"] == "zksn")
    branch_ports = set(zksn["ports"]["BRANCH"])
    connectors = [
        branch
        for branch in snap["branches"]
        if "branch_point_internal_connector" in (branch.get("tags") or [])
    ]

    assert len(connectors) == 2
    assert {branch["to_bus_ref"] for branch in connectors} == branch_ports
    assert {branch["from_bus_ref"] for branch in connectors} == {zksn["bus_ref"]}

    issues = ENMValidator().validate(EnergyNetworkModel.model_validate(snap)).issues
    assert "E003" not in {issue.code for issue in issues}


def test_branch_point_split_preserves_zero_sequence_segment_data() -> None:
    snapshot, seg_id = _seed_with_segment("LINIA_NAPOWIETRZNA")
    for branch in snapshot["branches"]:
        if branch["ref_id"] == seg_id:
            branch["r0_ohm_per_km"] = 1.08
            branch["x0_ohm_per_km"] = 1.42
            break

    resp = execute_domain_operation(
        snapshot,
        "insert_branch_pole_on_segment_sn",
        {
            "segment_id": seg_id,
            "catalog_ref": "SĹUP-ODG-12",
            "switch_state": "closed",
        },
    )
    assert resp.get("error") in (None, "")

    split_segments = [
        branch
        for branch in resp["snapshot"]["branches"]
        if branch["ref_id"].startswith(f"{seg_id}_") and branch["type"] == "line_overhead"
    ]
    assert len(split_segments) == 2
    assert all(branch.get("r0_ohm_per_km") == 1.08 for branch in split_segments)
    assert all(branch.get("x0_ohm_per_km") == 1.42 for branch in split_segments)
