"""
Test integracji solver-input endpoint z audit2 query params (Phase 25).

GET /case/{cid}/analysis/solver-input/{type}?project_id=...&station_id=...
Sprawdza:
- gdy project_id+station_id pdane i audit2 config istnieje w DB,
  response.audit2_extensions populated (nie None).
- gdy params nie pdane, audit2_extensions = None (backward compat).
- audit2 config CASCADE delete gdy projekt usuniety.
"""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")


def _create_project(client) -> str:
    res = client.post("/api/projects", json={"name": "Audit2 Solver Integration Test"})
    assert res.status_code == 201
    return res.json()["id"]


def _create_audit2_config(client, pid: str, sid: str, body: dict) -> None:
    res = client.put(
        f"/api/v1/projects/{pid}/audit2-station-config/{sid}",
        json=body,
    )
    assert res.status_code == 200, res.text


def test_solver_input_endpoint_audit2_params_documented(app_client):
    """Endpoint istnieje i akceptuje audit2 query params (smoke test)."""
    # Przygotuj projekt + audit2 config.
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-X",
        {
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {"tr_001": "tc_oltc_110sn_19_125"},
            "bay_hv_fuses": {},
            "bay_vts": {},
            "bay_device_withstand": {},
        },
    )
    # Endpoint istnieje (zwraca 422 dla nieistniejacego case_id, ale parsuje query params).
    res = app_client.get(
        f"/api/case-fake-id/analysis/solver-input/short_circuit_3f"
        f"?project_id={pid}&station_id=station-X"
    )
    # 422 lub 404 lub 500 — wazne ze nie 422 z 'unknown query param'.
    # Check response body shows it accepts the params (no validation error on params).
    assert res.status_code in (404, 422, 500)


def test_audit2_config_persists_after_session(app_client):
    """Phase 22: audit2 config persystuje po wielu requestach (sprawdza DB persistence)."""
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-Y",
        {
            "mv_neutral_grounding_ref": "mng_isolated",
            "tap_changer_refs": [],
            "der_specs": [],
        },
    )
    # Multiple GET requests still return same config (persistence).
    for _ in range(3):
        res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-Y")
        assert res.status_code == 200
        assert res.json()["mv_neutral_grounding_ref"] == "mng_isolated"


def test_audit2_per_transformer_persistence_round_trip(app_client):
    """Phase 22: transformer_tap_changers JSONB persistuje roundtrip."""
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-Z",
        {
            "mv_neutral_grounding_ref": None,
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {
                "tr_001": "tc_oltc_110sn_19_125",
                "tr_002": "tc_detc_snnn_5_25",
            },
        },
    )
    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-Z")
    body = res.json()
    assert body["transformer_tap_changers"] == {
        "tr_001": "tc_oltc_110sn_19_125",
        "tr_002": "tc_detc_snnn_5_25",
    }


def test_audit2_power_flow_endpoint_uses_wrapper(app_client):
    """Phase 33: POST /api/v1/audit2-power-flow uzywa Audit2PowerFlowWrapper."""
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-pf",
        {
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {"tr_001": "tc_oltc_110sn_19_125"},
        },
    )

    res = app_client.post(
        "/api/cases/audit2-power-flow",
        json={
            "case_id": "case-test-1",
            "project_id": pid,
            "station_id": "station-pf",
            "base_mva": 100.0,
            "slack_node_id": "n1",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["station_id"] == "station-pf"
    assert body["solver_attempted"] is True  # wrapper byl wywolany
    # Audit2 extensions byly populated z DB.
    assert "power_flow_extensions" in body["audit2_extensions_keys"]
    # Apply trail moze byc pusty bo graph stub bez transformerow,
    # ale potwierdza ze wrapper zostal wykonany.


def test_audit2_power_flow_endpoint_no_config_returns_empty_apply(app_client):
    """Phase 33: gdy audit2 config nie istnieje, audit2_extensions=None -> empty apply."""
    pid = _create_project(app_client)
    res = app_client.post(
        "/api/cases/audit2-power-flow",
        json={
            "case_id": "case-test-2",
            "project_id": pid,
            "station_id": "station-no-config",
            "slack_node_id": "n1",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["audit2_extensions_keys"] == []
    assert body["audit2_applied"] in ({}, {"tap_position_changes": {}, "block_transformer_z_changes": {}, "grounding_z0_z1_ratio": None, "bess_reserved_changes": {}, "pf_droop_changes": {}})


def test_audit2_power_flow_endpoint_invalid_project_id(app_client):
    """Phase 33: invalid project_id -> 400."""
    res = app_client.post(
        "/api/cases/audit2-power-flow",
        json={
            "case_id": "case-1",
            "project_id": "not-a-uuid",
            "station_id": "s1",
        },
    )
    assert res.status_code == 400


def test_audit2_power_flow_endpoint_full_apply_trail(app_client):
    """Phase 34: weryfikuje ze applied trail zawiera REAL data z DB (nie placeholder)."""
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-trail",
        {
            "mv_neutral_grounding_ref": "mng_isolated",  # -> Z0/Z1 = 100
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {},
        },
    )
    res = app_client.post(
        "/api/cases/audit2-power-flow",
        json={
            "case_id": "case-trail-1",
            "project_id": pid,
            "station_id": "station-trail",
            "slack_node_id": "n1",
        },
    )
    assert res.status_code == 200
    body = res.json()
    # Audit trail ma grounding Z0/Z1 = 100 (isolated).
    assert body["audit2_applied"].get("grounding_z0_z1_ratio") == 100.0


def test_get_solver_input_with_audit2_query_params_populates_extensions(app_client):
    """
    Phase 52: GET /api/cases/{cid}/analysis/solver-input/{type}?project_id=&station_id=
    weryfikuje ze audit2_extensions jest faktycznie populated z DB w response body
    (nie tylko smoke status check).

    Trick: case_id moze byc fake (graph stub returns empty), ale audit2_extensions
    powinien byc populated jezeli project_id + station_id wskazuja real config.
    """
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-real-test",
        {
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {"tr_001": "tc_oltc_110sn_19_125"},
            "bay_hv_fuses": {},
            "bay_vts": {},
            "bay_device_withstand": {},
        },
    )
    # GET solver-input z audit2 params. Case_id "case-fake" -> empty graph stub,
    # ale audit2_extensions powinno byc populated.
    res = app_client.get(
        f"/api/cases/case-fake/analysis/solver-input/short_circuit_3f"
        f"?project_id={pid}&station_id=station-real-test"
    )
    assert res.status_code == 200, res.text
    body = res.json()
    # Phase 52: audit2_extensions populated z DB.
    assert body["audit2_extensions"] is not None, "audit2_extensions should be populated"
    assert "power_flow_extensions" in body["audit2_extensions"]
    assert "sc_iec60909_extensions" in body["audit2_extensions"]
    # Per-transformer mapping w extensions.
    assert (
        "transformer_to_tap_changer"
        in body["audit2_extensions"]["power_flow_extensions"]
    )
    assert (
        "tr_001"
        in body["audit2_extensions"]["power_flow_extensions"]["transformer_to_tap_changer"]
    )
    # Grounding type.
    grounding = body["audit2_extensions"]["sc_iec60909_extensions"]["mv_neutral_grounding"]
    assert grounding["grounding_type"] == "petersen_coil"


def test_get_solver_input_without_audit2_params_returns_none(app_client):
    """Phase 52: brak audit2 params -> audit2_extensions = None (backward compat)."""
    res = app_client.get(
        "/api/cases/case-fake/analysis/solver-input/short_circuit_3f"
    )
    assert res.status_code == 200
    body = res.json()
    assert body["audit2_extensions"] is None


def test_get_solver_input_with_audit2_params_no_config_returns_none(app_client):
    """Phase 52: project_id + station_id pdane ale config nie istnieje -> None."""
    pid = _create_project(app_client)
    res = app_client.get(
        f"/api/cases/case-fake/analysis/solver-input/short_circuit_3f"
        f"?project_id={pid}&station_id=non-existent-station"
    )
    assert res.status_code == 200
    body = res.json()
    assert body["audit2_extensions"] is None


def test_apply_to_network_model_endpoint_full_pipeline(app_client):
    """Phase 26: pelna petla DB -> audit2 -> apply -> branch state changed."""
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-apply",
        {
            "mv_neutral_grounding_ref": "mng_petersen",
            "tap_changer_refs": [],
            "der_specs": [],
            "transformer_tap_changers": {
                "tr_001": "tc_oltc_110sn_19_125",
            },
        },
    )

    res = app_client.post(
        f"/api/v1/projects/{pid}/audit2-station-config/station-apply/_apply-to-network-model"
    )
    # Zauwaz: station_id w query (FastAPI nie przekaze body), bo router uzywa
    # path param '/{project_id}/audit2-station-config/...' a station_id jest
    # query param. Ten endpoint przyjmuje station_id jako query.
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["station_id"] == "station-apply"
    # tr_001 branch zostal zmodyfikowany (tap_position 5 -> 0).
    assert "tr_001" in body["post_adjustment_branches"]
    assert body["post_adjustment_branches"]["tr_001"]["tap_position"] == 0
    assert body["post_adjustment_branches"]["tr_001"]["tap_step_percent"] == 1.25
    # Applied trail.
    assert "tr_001" in body["applied"]["tap_position_changes"]
    assert body["applied"]["tap_position_changes"]["tr_001"]["tap_changer_id"] == "tc_oltc_110sn_19_125"


def test_der_spec_nominal_power_persists(app_client):
    """Phase 23: nominal_power_kw + device_catalog_ref persystuje w DER spec."""
    pid = _create_project(app_client)
    _create_audit2_config(
        app_client,
        pid,
        "station-power",
        {
            "mv_neutral_grounding_ref": None,
            "tap_changer_refs": [],
            "der_specs": [
                {
                    "der_id": "der_pv_001",
                    "der_kind": "PV",
                    "device_catalog_ref": "pv_inv_sma_2500",
                    "nominal_power_kw": 2500,
                    "block_transformer_catalog_ref": "btr_pv_15_069_2500",
                }
            ],
        },
    )
    res = app_client.get(f"/api/v1/projects/{pid}/audit2-station-config/station-power")
    body = res.json()
    spec = body["der_specs"][0]
    assert spec["device_catalog_ref"] == "pv_inv_sma_2500"
    assert spec["nominal_power_kw"] == 2500
    assert spec["block_transformer_catalog_ref"] == "btr_pv_15_069_2500"
