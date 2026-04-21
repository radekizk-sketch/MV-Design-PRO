from __future__ import annotations

import copy
import hashlib
import json

import pytest
from enm.domain_operations import execute_domain_operation


def _hash_snapshot(snapshot: dict) -> str:
    payload = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _enm_with_catalog_bound_assets() -> dict:
    return {
        "header": {"name": "Catalog Guard Update Test", "revision": 1, "defaults": {}},
        "buses": [
            {"ref_id": "bus/hv", "name": "HV", "voltage_kv": 15.0, "type": "bus"},
            {"ref_id": "bus/mid", "name": "MID", "voltage_kv": 15.0, "type": "bus"},
            {"ref_id": "bus/lv", "name": "LV", "voltage_kv": 0.4, "type": "bus"},
        ],
        "branches": [
            {
                "ref_id": "br/cable-1",
                "type": "cable",
                "name": "Cable 1",
                "from_bus_ref": "bus/hv",
                "to_bus_ref": "bus/mid",
                "length_km": 0.1,
                "r_ohm_per_km": 0.32,
                "x_ohm_per_km": 0.08,
                "catalog_ref": "cable-tfk-yakxs-3x120",
                "source_mode": "KATALOG",
                "catalog_namespace": "KABEL_SN",
            },
            {
                "ref_id": "br/switch-1",
                "type": "switch",
                "name": "Switch 1",
                "from_bus_ref": "bus/mid",
                "to_bus_ref": "bus/lv",
                "status": "closed",
                "catalog_ref": "sw-ls-schneider-rm6-17kv-400a",
                "source_mode": "KATALOG",
                "catalog_namespace": "APARAT_SN",
            },
        ],
        "transformers": [
            {
                "ref_id": "tr/1",
                "name": "TR1",
                "hv_bus_ref": "bus/mid",
                "lv_bus_ref": "bus/lv",
                "sn_mva": 0.63,
                "uhv_kv": 15.0,
                "ulv_kv": 0.4,
                "uk_percent": 6.0,
                "pk_kw": 8.5,
                "catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
                "source_mode": "KATALOG",
                "catalog_namespace": "TRAFO_SN_NN",
            }
        ],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


@pytest.mark.parametrize(
    ("element_ref", "catalog_ref_value"),
    [
        ("br/cable-1", None),
        ("br/cable-1", ""),
        ("tr/1", None),
        ("tr/1", ""),
        ("br/switch-1", None),
        ("br/switch-1", ""),
    ],
)
def test_update_element_parameters_blocks_catalog_ref_removal_with_stable_snapshot(
    element_ref: str,
    catalog_ref_value: str | None,
) -> None:
    enm = _enm_with_catalog_bound_assets()
    before_hash = _hash_snapshot(enm)
    before_copy = copy.deepcopy(enm)

    result = execute_domain_operation(
        enm_dict=enm,
        op_name="update_element_parameters",
        payload={
            "element_ref": element_ref,
            "parameters": {"catalog_ref": catalog_ref_value},
        },
    )

    after_hash = _hash_snapshot(enm)
    assert result.get("error_code") == "catalog.ref_required"
    assert result.get("snapshot") is None
    assert before_hash == after_hash
    assert enm == before_copy
