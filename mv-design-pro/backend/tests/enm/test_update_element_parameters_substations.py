from __future__ import annotations

import copy

from enm.domain_operations import execute_domain_operation


def _enm_with_station() -> dict:
    return {
        "header": {"name": "Substation Update Test", "revision": 1, "defaults": {}},
        "buses": [
            {
                "id": "bus/sn",
                "ref_id": "bus/sn",
                "name": "Szyna SN",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "type": "bus",
            },
            {
                "id": "bus/nn",
                "ref_id": "bus/nn",
                "name": "Szyna nN",
                "tags": [],
                "meta": {},
                "voltage_kv": 0.4,
                "type": "bus",
            },
        ],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [
            {
                "id": "st-1",
                "ref_id": "st-1",
                "name": "Stacja bazowa",
                "tags": [],
                "meta": {},
                "station_type": "mv_lv",
                "bus_refs": ["bus/sn", "bus/nn"],
                "transformer_refs": [],
                "entry_point_ref": "bus/sn",
            }
        ],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def test_update_element_parameters_allows_substation_project_data_update() -> None:
    enm = _enm_with_station()
    before = copy.deepcopy(enm)

    result = execute_domain_operation(
        enm_dict=enm,
        op_name="update_element_parameters",
        payload={
            "element_ref": "st-1",
            "parameters": {
                "name": "ST-04 Konarzewo",
                "entry_point_ref": "bus/nn",
                "meta": {"report_name": "Stacja Konarzewo"},
            },
        },
    )

    assert result.get("error_code") is None
    updated = result["snapshot"]["substations"][0]
    assert updated["name"] == "ST-04 Konarzewo"
    assert updated["entry_point_ref"] == "bus/nn"
    assert updated["meta"]["report_name"] == "Stacja Konarzewo"
    assert before["substations"][0]["station_type"] == updated["station_type"]
    assert before["substations"][0]["bus_refs"] == updated["bus_refs"]
    assert result["changes"]["updated_element_ids"] == ["st-1"]
