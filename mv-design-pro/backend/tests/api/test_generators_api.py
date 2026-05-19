from __future__ import annotations

import pytest

pytest.importorskip("fastapi")


def _create_project_and_case(app_client) -> tuple[str, str]:
    project_resp = app_client.post("/api/projects", json={"name": "Projekt DER"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    case_resp = app_client.post(
        "/api/study-cases",
        json={"project_id": project_id, "name": "Przypadek DER"},
    )
    assert case_resp.status_code == 201
    return project_id, case_resp.json()["id"]


def _seed_station_enm(case_id: str) -> None:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    enm = EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "Model DER",
                "defaults": {"frequency_hz": 50.0, "unit_system": "SI", "sn_nominal_kv": 15.0},
            },
            "buses": [
                {
                    "ref_id": "station/1/sn_bus",
                    "name": "Szyna SN",
                    "voltage_kv": 15.0,
                    "tags": [],
                    "meta": {},
                },
                {
                    "ref_id": "station/1/nn_bus",
                    "name": "Szyna nN",
                    "voltage_kv": 0.4,
                    "tags": [],
                    "meta": {},
                },
            ],
            "branches": [],
            "sources": [],
            "loads": [],
            "transformers": [
                {
                    "ref_id": "station/1/tr",
                    "name": "Transformator SN/nN",
                    "hv_bus_ref": "station/1/sn_bus",
                    "lv_bus_ref": "station/1/nn_bus",
                    "sn_mva": 0.63,
                    "uhv_kv": 15.0,
                    "ulv_kv": 0.4,
                    "uk_percent": 6.0,
                    "pk_kw": 6.5,
                    "tags": [],
                    "meta": {},
                }
            ],
            "generators": [],
            "substations": [
                {
                    "ref_id": "station/1",
                    "name": "Stacja 1",
                    "station_type": "mv_lv",
                    "bus_refs": ["station/1/sn_bus", "station/1/nn_bus"],
                    "transformer_refs": ["station/1/tr"],
                    "tags": [],
                    "meta": {},
                }
            ],
            "bays": [],
            "junctions": [],
            "corridors": [],
            "measurements": [],
            "protection_assignments": [],
            "branch_points": [],
        }
    )
    set_enm(case_id, enm)


def test_create_der_generator_persists_in_case_enm(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "A",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["error"] is None if "error" in payload else True
    assert payload["changes"]["created_element_ids"]

    generators = payload["snapshot"]["generators"]
    assert len(generators) == 1
    generator = generators[0]
    assert generator["station_ref"] == "station/1"
    assert generator["bus_ref"] == "station/1/nn_bus"
    assert generator["gen_type"] == "pv_inverter"
    assert generator["p_mw"] == 0.5
    assert generator["catalog_ref"] == "conv-pv-nn-0p5mw-0p4kv"
    assert generator["connection_variant"] == "nn_side"

    persisted = app_client.get(f"/api/cases/{case_id}/enm")
    assert persisted.status_code == 200
    assert persisted.json()["generators"][0]["ref_id"] == generator["ref_id"]


def test_create_der_generator_rejects_power_outside_drawer_contract(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.05,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
        },
    )

    assert response.status_code == 422
