from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CABLE_ID = "cable-tfk-yakxs-3x120"
ALT_CABLE_ID = "cable-base-xlpe-al-3c-240"
TRAFO_ID = "tr-sn-nn-15-04-630kva-dyn11"
CABLE_BINDING = {
    "catalog_namespace": "KABEL_SN",
    "catalog_item_id": CABLE_ID,
    "catalog_item_version": "2024.1",
}
ALT_CABLE_BINDING = {
    "catalog_namespace": "KABEL_SN",
    "catalog_item_id": ALT_CABLE_ID,
    "catalog_item_version": "2024.1",
}
TRAFO_BINDING = {
    "catalog_namespace": "TRAFO_SN_NN",
    "catalog_item_id": TRAFO_ID,
    "catalog_item_version": "2024.1",
}
SOURCE_ID = "src-gpz-15kv-250mva-rx010"
SOURCE_BINDING = {
    "catalog_namespace": "ZRODLO_SN",
    "catalog_item_id": SOURCE_ID,
    "catalog_item_version": "2024.1",
}


def _empty_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="flex-sequences", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def _apply(snapshot: dict, op_name: str, payload: dict) -> dict:
    result = execute_domain_operation(snapshot, op_name, payload)
    assert result.get("error") is None, f"{op_name} failed: {result.get('error')}"
    return result["snapshot"]


def _build_source_plus_segments(segment_lengths_m: list[int]) -> dict:
    snapshot = _empty_enm()
    snapshot = _apply(
        snapshot,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": SOURCE_ID,
            "catalog_binding": SOURCE_BINDING,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    for idx, length in enumerate(segment_lengths_m):
        snapshot = _apply(
            snapshot,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": length,
                    "name": f"Odcinek {idx + 1}",
                    "catalog_ref": CABLE_ID,
                    "catalog_binding": CABLE_BINDING,
                },
                "catalog_binding": CABLE_BINDING,
            },
        )
    return snapshot


def _last_trunk_segment(snapshot: dict) -> str:
    corridors = snapshot.get("corridors", [])
    assert corridors, "Brak korytarza trunk"
    ordered = corridors[0].get("ordered_segment_refs", [])
    assert ordered, "Brak segmentow trunk"
    return ordered[-1]


def test_sequence_continue_continue_insert_station_then_branch():
    snapshot = _build_source_plus_segments([220, 240])
    target_segment = _last_trunk_segment(snapshot)

    snapshot = _apply(
        snapshot,
        "insert_station_on_segment_sn",
        {
            "segment_ref": target_segment,
            # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "station_type": "B",
            "insert_at": {"ratio": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "transformer": {
                "create": True,
                "transformer_catalog_ref": TRAFO_ID,
                "catalog_binding": TRAFO_BINDING,
            },
            "catalog_binding": TRAFO_BINDING,
        },
    )

    created_transformer = next(
        transformer
        for transformer in snapshot.get("transformers", [])
        if transformer.get("catalog_ref") == TRAFO_ID
    )
    assert created_transformer["catalog_namespace"] == "TRAFO_SN_NN"
    assert created_transformer["source_mode"] == "KATALOG"
    assert created_transformer["parameter_source"] == "CATALOG"
    assert created_transformer["meta"]["catalog_item_version"] == "2024.1"

    station_bus_ref = next(
        bus["ref_id"] for bus in snapshot.get("buses", []) if "sn_bus" in bus.get("ref_id", "")
    )

    snapshot = _apply(
        snapshot,
        "start_branch_segment_sn",
        {
            "from_bus_ref": station_bus_ref,
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 150,
                "catalog_ref": CABLE_ID,
                "catalog_binding": CABLE_BINDING,
            },
            "catalog_binding": CABLE_BINDING,
        },
    )

    assert len(snapshot.get("branches", [])) >= 3
    created_branch = snapshot["branches"][-1]
    assert created_branch["catalog_ref"] == CABLE_ID
    assert created_branch["catalog_namespace"] == "KABEL_SN"
    assert created_branch["meta"]["catalog_item_version"] == "2024.1"


def test_sequence_edit_delete_continue_trunk():
    snapshot = _build_source_plus_segments([200, 210])
    trunk_segment_ref = _last_trunk_segment(snapshot)

    snapshot = _apply(
        snapshot,
        "update_element_parameters",
        {
            "element_ref": trunk_segment_ref,
            "parameters": {
                "length_km": 0.333,
                "status": "closed",
            },
        },
    )

    snapshot = _apply(
        snapshot,
        "delete_element",
        {
            "element_ref": trunk_segment_ref,
        },
    )

    snapshot = _apply(
        snapshot,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 190,
                "catalog_ref": CABLE_ID,
                "catalog_binding": CABLE_BINDING,
            },
            "catalog_binding": CABLE_BINDING,
        },
    )

    assert len(snapshot.get("branches", [])) >= 2
    assert snapshot["branches"][-1]["meta"]["catalog_item_version"] == "2024.1"


def test_sequence_reject_clear_and_reassign_catalog_keeps_snapshot_contract_valid():
    snapshot = _build_source_plus_segments([200, 210])
    target_segment_ref = snapshot["corridors"][0]["ordered_segment_refs"][0]

    clear_result = execute_domain_operation(
        snapshot,
        "assign_catalog_to_element",
        {
            "element_ref": target_segment_ref,
            "catalog_item_id": None,
            "catalog_namespace": "KABEL_SN",
        },
    )
    assert clear_result.get("error_code") == "catalog.clear_forbidden"
    assert clear_result.get("snapshot") is None

    preserved_segment = next(
        branch
        for branch in snapshot.get("branches", [])
        if branch.get("ref_id") == target_segment_ref
    )
    assert preserved_segment["catalog_ref"] == CABLE_ID
    assert preserved_segment.get("catalog_namespace") == "KABEL_SN"
    assert preserved_segment.get("source_mode") == "KATALOG"
    assert preserved_segment.get("materialized_params", {}).get("catalog_item_id") == CABLE_ID

    snapshot = _apply(
        snapshot,
        "assign_catalog_to_element",
        {
            "element_ref": target_segment_ref,
            "catalog_item_id": ALT_CABLE_ID,
            "catalog_namespace": ALT_CABLE_BINDING["catalog_namespace"],
            "catalog_item_version": "2024.1",
            "source_mode": "KATALOG",
        },
    )

    rebound_segment = next(
        branch
        for branch in snapshot.get("branches", [])
        if branch.get("ref_id") == target_segment_ref
    )
    assert rebound_segment["catalog_ref"] == ALT_CABLE_ID
    assert rebound_segment.get("parameter_source") == "CATALOG"
    assert rebound_segment.get("catalog_namespace") == "KABEL_SN"
    assert rebound_segment.get("source_mode") == "KATALOG"
    assert rebound_segment.get("meta", {}).get("catalog_item_version") == "2024.1"
    assert rebound_segment.get("materialized_params", {}).get("catalog_item_id") == ALT_CABLE_ID


def test_sequence_reassign_catalog_accepts_binding_only_contract():
    snapshot = _build_source_plus_segments([180])
    target_segment_ref = snapshot["corridors"][0]["ordered_segment_refs"][0]

    snapshot = _apply(
        snapshot,
        "assign_catalog_to_element",
        {
            "element_ref": target_segment_ref,
            "catalog_binding": ALT_CABLE_BINDING,
            "source_mode": "KATALOG",
        },
    )

    rebound_segment = next(
        branch
        for branch in snapshot.get("branches", [])
        if branch.get("ref_id") == target_segment_ref
    )
    assert rebound_segment["catalog_ref"] == ALT_CABLE_ID
    assert rebound_segment.get("catalog_namespace") == "KABEL_SN"
    assert rebound_segment.get("meta", {}).get("catalog_item_version") == "2024.1"
    assert rebound_segment.get("materialized_params", {}).get("catalog_item_id") == ALT_CABLE_ID
