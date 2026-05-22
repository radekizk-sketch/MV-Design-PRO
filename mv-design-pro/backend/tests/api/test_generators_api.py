from __future__ import annotations

from uuid import uuid4

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


def _seed_station_enm(case_id: str, *, transformer_sn_mva: float = 0.63) -> None:
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
                    "sn_mva": transformer_sn_mva,
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
            "power_mw": 0.0,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
        },
    )

    assert response.status_code == 422


def test_create_der_generator_rejects_source_above_transformer_capacity(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV za duży dla transformatora",
            "nc_rfg_module": "A",
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["detail"]["code"] == "converter.transformer_capacity_exceeded"


def test_create_der_generator_materializes_catalog_block_transformer(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 1.0,
            "connection_variant": "dedicated",
            "catalog_ref": "pv_inv_system_1000",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
            "source_name": "PV 1000 z transformatorem dedykowanym",
            "nc_rfg_module": "B",
        },
    )

    assert response.status_code == 201
    snapshot = response.json()["snapshot"]
    generator = snapshot["generators"][0]
    assert generator["connection_variant"] == "block_transformer"
    assert generator["catalog_ref"] == "pv_inv_system_1000"
    assert generator["blocking_transformer_ref"]

    block_transformer = next(
        item
        for item in snapshot["transformers"]
        if item["ref_id"] == generator["blocking_transformer_ref"]
    )
    assert block_transformer["catalog_ref"] == "btr_pv_15_069_1250"
    assert block_transformer["sn_mva"] == 1.25
    assert block_transformer["ulv_kv"] == 0.69

    generator_bus = next(
        item for item in snapshot["buses"] if item["ref_id"] == generator["bus_ref"]
    )
    assert generator_bus["voltage_kv"] == 0.69
    assert generator["bus_ref"] == block_transformer["lv_bus_ref"]


def test_create_der_generator_prefers_explicit_block_transformer_catalog(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.8)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 1.0,
            "connection_variant": "nn_side",
            "catalog_ref": "pv_inv_system_1000",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
            "source_name": "PV 1000 przez transformator katalogowy",
            "nc_rfg_module": "B",
        },
    )

    assert response.status_code == 201
    generator = response.json()["snapshot"]["generators"][0]
    assert generator["connection_variant"] == "block_transformer"
    assert generator["blocking_transformer_ref"]


def test_create_der_generator_accepts_materialized_enm_without_study_case(app_client) -> None:
    """Browser-built networks may start from ENM domain ops before DB case hydration."""
    project_id = str(uuid4())
    case_id = str(uuid4())
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
            "nc_rfg_module": "B",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["snapshot"]["generators"][0]["station_ref"] == "station/1"
