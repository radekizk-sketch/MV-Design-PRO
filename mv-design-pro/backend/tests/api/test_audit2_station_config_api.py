"""
Testy API persystencji audit2 station config (Punkt 3 Phase 2).

CRUD endpoints:
  GET  /api/v1/projects/{pid}/audit2-station-config — lista
  GET  /api/v1/projects/{pid}/audit2-station-config/{sid} — jeden
  PUT  /api/v1/projects/{pid}/audit2-station-config/{sid} — UPSERT
  DELETE /api/v1/projects/{pid}/audit2-station-config/{sid} — usun
"""

from __future__ import annotations

from uuid import uuid4

import pytest

pytest.importorskip("fastapi")


def _create_project(client) -> str:
    res = client.post("/api/projects", json={"name": "Audit2 Test Project"})
    assert res.status_code == 201
    return res.json()["id"]


def test_get_returns_404_when_no_config(app_client):
    pid = _create_project(app_client)
    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-001")
    assert res.status_code == 404


def test_list_returns_empty_when_no_configs(app_client):
    pid = _create_project(app_client)
    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config")
    assert res.status_code == 200
    assert res.json() == []


def test_put_creates_new_config(app_client):
    pid = _create_project(app_client)
    body = {
        "mv_neutral_grounding_ref": "mng_petersen",
        "tap_changer_refs": ["tc_oltc_110sn_19_125"],
        "der_specs": [
            {
                "der_id": "der_001",
                "der_kind": "PV",
                "block_transformer_catalog_ref": "btr_pv_15_069_2500",
                "pf_curve_ref": "pf_pse_b",
            }
        ],
    }
    res = app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-001",
        json=body,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["mv_neutral_grounding_ref"] == "mng_petersen"
    assert data["tap_changer_refs"] == ["tc_oltc_110sn_19_125"]
    assert len(data["der_specs"]) == 1
    assert data["der_specs"][0]["der_id"] == "der_001"


def test_put_upserts_existing_config(app_client):
    pid = _create_project(app_client)
    # 1. Initial PUT
    res = app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-002",
        json={"mv_neutral_grounding_ref": "mng_isolated", "tap_changer_refs": [], "der_specs": []},
    )
    assert res.status_code == 200
    initial_id = res.json()["id"]

    # 2. Second PUT — should UPDATE, not create new.
    res2 = app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-002",
        json={"mv_neutral_grounding_ref": "mng_petersen", "tap_changer_refs": [], "der_specs": []},
    )
    assert res2.status_code == 200
    # ID nie zmienia sie po update
    assert res2.json()["id"] == initial_id
    assert res2.json()["mv_neutral_grounding_ref"] == "mng_petersen"


def test_get_after_put_returns_config(app_client):
    pid = _create_project(app_client)
    body = {
        "mv_neutral_grounding_ref": "mng_resistor_low",
        "tap_changer_refs": ["tc_detc_snnn_5_25"],
        "der_specs": [
            {
                "der_id": "der_bess_001",
                "der_kind": "BESS",
                "bess_operation_mode_refs": ["mode_fcr_n", "mode_voltage_support"],
            }
        ],
    }
    app_client.put(f"/api/v1/projects/{pid}/audit2-station-config/station-003", json=body)

    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-003")
    assert res.status_code == 200
    data = res.json()
    assert data["mv_neutral_grounding_ref"] == "mng_resistor_low"
    assert data["der_specs"][0]["bess_operation_mode_refs"] == ["mode_fcr_n", "mode_voltage_support"]


def test_list_returns_multiple_stations(app_client):
    pid = _create_project(app_client)
    for sid in ["station-A", "station-B", "station-C"]:
        app_client.put(
            f"/api/v1/projects/{pid}/audit2-station-config/{sid}",
            json={"mv_neutral_grounding_ref": "mng_petersen", "tap_changer_refs": [], "der_specs": []},
        )

    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 3
    sids = [r["station_id"] for r in data]
    assert sids == ["station-A", "station-B", "station-C"]  # sorted


def test_delete_removes_config(app_client):
    pid = _create_project(app_client)
    app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-D",
        json={"mv_neutral_grounding_ref": None, "tap_changer_refs": [], "der_specs": []},
    )
    # Delete
    res = app_client.delete(f"/api/v1/projects/{pid}/audit2-station-config/station-D")
    assert res.status_code == 204

    # Subsequent GET zwraca 404
    res2 = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-D")
    assert res2.status_code == 404


def test_delete_404_when_no_config(app_client):
    pid = _create_project(app_client)
    res = app_client.delete(f"/api/v1/projects/{pid}/audit2-station-config/nonexistent")
    assert res.status_code == 404


def test_isolation_between_projects(app_client):
    """Configs jednego projektu nie sa widoczne w innym."""
    pid1 = _create_project(app_client)
    pid2 = _create_project(app_client)
    app_client.put(
        f"/api/v1/projects/{pid1}/audit2-station-config/station-X",
        json={"mv_neutral_grounding_ref": "mng_petersen", "tap_changer_refs": [], "der_specs": []},
    )

    # Project 1 widzi config
    res1 = app_client.get(f"/api/v1/projects/{pid1}/audit2-station-config")
    assert len(res1.json()) == 1

    # Project 2 nic nie widzi
    res2 = app_client.get(f"/api/v1/projects/{pid2}/audit2-station-config")
    assert res2.json() == []


def test_persistence_round_trip_complex_der_spec(app_client):
    """JSONB der_specs zachowuje wszystkie pola po round-tripie."""
    pid = _create_project(app_client)
    der_specs = [
        {
            "der_id": "der_001",
            "der_kind": "PV",
            "bess_operation_mode_refs": None,
            "block_transformer_catalog_ref": "btr_pv_15_069_2500",
            "pf_curve_ref": "pf_pse_b",
        },
        {
            "der_id": "der_002",
            "der_kind": "BESS",
            "bess_operation_mode_refs": ["mode_fcr_n", "mode_voltage_support"],
            "block_transformer_catalog_ref": "btr_bess_15_04_1600",
            "pf_curve_ref": None,
        },
    ]
    app_client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/station-rt",
        json={
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": ["tc_oltc_110sn_19_125"],
            "der_specs": der_specs,
        },
    )
    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-rt")
    data = res.json()
    assert len(data["der_specs"]) == 2
    bess = next(s for s in data["der_specs"] if s["der_id"] == "der_002")
    assert sorted(bess["bess_operation_mode_refs"]) == ["mode_fcr_n", "mode_voltage_support"]
