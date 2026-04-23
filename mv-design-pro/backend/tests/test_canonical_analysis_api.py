from __future__ import annotations

from uuid import uuid4

import pytest
from api.main import app
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_payload, gpz_source_record


def _reset_backend_state() -> None:
    from api.execution_runs import get_engine
    from api.power_flow_runs import _interpretation_cache
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    engine = get_engine()
    engine._runs.clear()
    engine._result_sets.clear()
    engine._study_cases.clear()
    engine._case_runs.clear()
    _interpretation_cache.clear()
    reset_canonical_runs()
    reset_enm_store()


def _seed_power_flow_enm(client: TestClient, case_id: str) -> None:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Power Flow Canonical",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000301",
                        "ref_id": "bus-main",
                        "name": "Szyna glowna",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000302",
                        "ref_id": "bus-load",
                        "name": "Szyna odbioru",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000303",
                        "ref_id": "branch-load",
                        "name": "Kabel odbioru",
                        "tags": [],
                        "meta": {},
                        "type": "cable",
                        "from_bus_ref": "bus-main",
                        "to_bus_ref": "bus-load",
                        "status": "closed",
                        "catalog_ref": "KABEL_SN_TEST",
                        "parameter_source": "CATALOG",
                        "length_km": 0.5,
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.073,
                        "b_siemens_per_km": 2.6e-07,
                        "rating": {"in_a": 270.0},
                    }
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000304",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-main",
                            voltage_kv=15.0,
                            sk3_mva=250.0,
                            rx_ratio=0.10,
                        ),
                    }
                ],
                "loads": [
                    {
                        "id": "00000000-0000-0000-0000-000000000305",
                        "ref_id": "load-1",
                        "name": "Odbior SN",
                        "tags": [],
                        "meta": {},
                        "bus_ref": "bus-load",
                        "p_mw": 1.2,
                        "q_mvar": 0.35,
                        "catalog_ref": "LOAD_TEST",
                        "parameter_source": "OVERRIDE",
                    }
                ],
                "transformers": [],
                "generators": [],
                "substations": [],
                "bays": [],
                "junctions": [],
                "corridors": [],
                "measurements": [],
                "protection_assignments": [],
                "branch_points": [],
            }
        ),
    )


@pytest.fixture
def client() -> TestClient:
    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def test_domain_operation_snapshot_feeds_analysis_result_and_trace(client: TestClient) -> None:
    case_id = str(uuid4())

    domain_op = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "add_grid_source_sn",
                "payload": gpz_payload(voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.10),
            }
        },
    )
    assert domain_op.status_code == 200
    op_payload = domain_op.json()
    snapshot = op_payload["snapshot"]
    snapshot_hash = snapshot["header"]["hash_sha256"]
    assert snapshot["sources"]

    readiness_response = client.get(f"/api/cases/{case_id}/enm/readiness")
    assert readiness_response.status_code == 200
    readiness_payload = readiness_response.json()

    create_run = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )
    assert create_run.status_code == 201
    run_payload = create_run.json()
    run_id = run_payload["id"]
    input_hash = run_payload["solver_input_hash"]

    execute_run = client.post(f"/api/execution/runs/{run_id}/execute")
    assert execute_run.status_code == 200
    assert execute_run.json()["status"] == "DONE"

    execution_results = client.get(f"/api/execution/runs/{run_id}/results")
    assert execution_results.status_code == 200
    execution_payload = execution_results.json()
    assert execution_payload["validation_snapshot"] == readiness_payload["validation"]
    assert execution_payload["readiness_snapshot"] == readiness_payload["readiness"]

    results_index = client.get(f"/api/analysis-runs/{run_id}/results/index")
    assert results_index.status_code == 200
    index_payload = results_index.json()
    assert index_payload["run_header"]["snapshot_id"] == snapshot_hash
    assert index_payload["run_header"]["input_hash"] == input_hash
    assert index_payload["analysis_case_context"]["case_ref"] == case_id
    assert index_payload["analysis_case_context"]["rodzaj_przypadku"] == "ZWARCIOWY_MAKS"
    assert index_payload["analysis_case_context"]["completeness"] == "complete"
    assert index_payload["analysis_case_context"]["proof_pack_ref"].startswith("proof-pack:")
    assert (
        index_payload["analysis_case_context"]["reproducibility"]["results_contract_version"]
        == "V12.5"
    )
    assert index_payload["run_header"]["analysis_case_context"]["snapshot_ref"] == snapshot_hash
    assert index_payload["proof_pack_ref"].startswith("proof-pack:")
    assert index_payload["export_artifact"]["export_kind"] == "json"
    assert index_payload["export_artifact"]["proof_pack_ref"].startswith("proof-pack:")
    assert index_payload["export_policy"]["carries_analysis_case_context"] is True
    assert index_payload["export_policy"]["carries_proof_pack_ref"] is True

    detail_response = client.get(f"/api/analysis-runs/{run_id}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["id"] == run_id
    assert detail_payload["proof_pack_ref"].startswith("proof-pack:")
    assert detail_payload["export_artifact"]["export_kind"] == "json"
    assert detail_payload["export_artifact"]["proof_pack_ref"].startswith("proof-pack:")
    assert detail_payload["export_policy"]["carries_analysis_case_context"] is True
    assert detail_payload["input_metadata"]["analysis_case_context"]["proof_pack_ref"].startswith(
        "proof-pack:"
    )

    short_circuit = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit")
    assert short_circuit.status_code == 200
    short_circuit_payload = short_circuit.json()
    assert short_circuit_payload["run_id"] == run_id
    assert short_circuit_payload["analysis_case_context"]["case_ref"] == case_id
    assert short_circuit_payload["rows"]
    assert all("element_id" in row for row in short_circuit_payload["rows"])

    trace_details = client.get(f"/api/analysis-runs/{run_id}/results/trace")
    assert trace_details.status_code == 200
    trace_payload = trace_details.json()
    assert trace_payload["run_id"] == run_id
    assert trace_payload["snapshot_id"] == snapshot_hash
    assert trace_payload["input_hash"] == input_hash
    assert trace_payload["analysis_case_context"]["quality_gate"] in {"G1", "G2", "G3", "G4"}
    assert trace_payload["white_box_trace"]
    assert "selection_index" in trace_payload
    assert trace_payload["selection_index"]
    assert "catalog_context" in trace_payload
    assert isinstance(trace_payload["catalog_context"], list)
    assert any("element_id" in step for step in trace_payload["white_box_trace"])
    assert any("primary_element_ref" in step for step in trace_payload["white_box_trace"])
    assert any("related_elements" in step for step in trace_payload["white_box_trace"])

    trace_view = client.get(f"/api/analysis-runs/{run_id}/trace")
    assert trace_view.status_code == 200
    assert trace_view.json()["trace"] == trace_payload["white_box_trace"]

    snapshot_view = client.get(f"/api/analysis-runs/{run_id}/snapshot")
    assert snapshot_view.status_code == 200
    snapshot_payload = snapshot_view.json()
    assert snapshot_payload["run_id"] == run_id
    assert snapshot_payload["snapshot_id"] == snapshot_hash
    assert snapshot_payload["snapshot"]["header"]["hash_sha256"] == snapshot_hash

    assert client.get(f"/analysis-runs/{run_id}/results/index").status_code == 404
    assert client.get(f"/analysis-runs/{run_id}").status_code == 404
    assert client.get(f"/analysis-runs/{run_id}/results/short-circuit").status_code == 404
    assert client.get(f"/analysis-runs/{run_id}/results/trace").status_code == 404
    assert client.get(f"/analysis-runs/{run_id}/trace").status_code == 404
    assert client.get(f"/analysis-runs/{run_id}/snapshot").status_code == 404


def test_analysis_creation_requires_canonical_enm_snapshot(client: TestClient) -> None:
    case_id = str(uuid4())

    response = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )

    assert response.status_code == 409
    assert (
        "model" in response.json()["detail"].lower()
        or "analiza" in response.json()["detail"].lower()
    )


def test_power_flow_read_and_export_endpoints_use_canonical_run(client: TestClient) -> None:
    case_id = str(uuid4())
    _seed_power_flow_enm(client, case_id)

    run_response = client.post(f"/api/cases/{case_id}/runs/power-flow")
    assert run_response.status_code == 200
    run_payload = run_response.json()
    run_id = run_payload["run_id"]

    header_response = client.get(f"/power-flow-runs/{run_id}")
    assert header_response.status_code == 200
    header_payload = header_response.json()
    assert header_payload["id"] == run_id
    assert header_payload["input_hash"] == run_payload["input_hash"]
    assert header_payload["input_metadata"]["snapshot_hash"] == run_payload["enm_hash"]
    assert header_payload["analysis_case_context"]["rodzaj_przypadku"] == "ROZPLYW_MAX_OBC"
    assert header_payload["analysis_case_context"]["completeness"] == "complete"
    assert (
        header_payload["analysis_case_context"]["reproducibility"]["solver_family"]
        == "power_flow_newton"
    )
    assert (
        header_payload["input_metadata"]["analysis_case_context"]["snapshot_ref"]
        == run_payload["enm_hash"]
    )
    assert header_payload["proof_pack_ref"].startswith("proof-pack:")
    assert header_payload["export_artifact"]["export_kind"] == "json"
    assert header_payload["export_artifact"]["proof_pack_ref"].startswith("proof-pack:")
    assert header_payload["export_policy"]["carries_analysis_case_context"] is True
    assert header_payload["export_policy"]["carries_proof_pack_ref"] is True

    result_response = client.get(f"/power-flow-runs/{run_id}/results")
    assert result_response.status_code == 200
    result_payload = result_response.json()
    assert result_payload["converged"] is True
    assert result_payload["bus_results"]
    assert result_payload["branch_results"]

    trace_response = client.get(f"/power-flow-runs/{run_id}/trace")
    assert trace_response.status_code == 200
    trace_payload = trace_response.json()
    assert trace_payload["iterations"]
    assert trace_payload["run_id"] == run_id
    assert trace_payload["snapshot_id"] == run_payload["enm_hash"]
    assert "catalog_context" in trace_payload
    assert any(entry["element_id"] == "branch-load" for entry in trace_payload["catalog_context"])

    bus_results_response = client.get(f"/api/analysis-runs/{run_id}/results/buses")
    assert bus_results_response.status_code == 200
    bus_results_payload = bus_results_response.json()
    assert bus_results_payload["analysis_case_context"]["case_ref"] == case_id
    assert {"bus-load", "bus-main"}.issubset(
        {row["element_id"] for row in bus_results_payload["rows"]}
    )

    branch_results_response = client.get(f"/api/analysis-runs/{run_id}/results/branches")
    assert branch_results_response.status_code == 200
    branch_results_payload = branch_results_response.json()
    assert branch_results_payload["analysis_case_context"]["rodzaj_przypadku"] == "ROZPLYW_MAX_OBC"
    assert "branch-load" in {row["element_id"] for row in branch_results_payload["rows"]}

    export_response = client.get(f"/power-flow-runs/{run_id}/export/json")
    assert export_response.status_code == 200
    export_payload = export_response.json()
    assert export_payload["analysis_case_context"]["case_ref"] == case_id
    assert export_payload["export_artifact"]["export_kind"] == "json"
    assert export_payload["export_artifact"]["completeness_status"] == "complete"
    assert export_payload["export_policy"]["carries_analysis_case_context"] is True
    assert export_payload["metadata"]["run_id"] == run_id
    assert export_payload["metadata"]["snapshot_hash"] == run_payload["enm_hash"]
    assert export_payload["metadata"]["proof_pack_ref"].startswith("proof-pack:")
    assert (
        export_payload["metadata"]["reproducibility"]["quality_gate_policy_version"]
        == "v12_5_quality_gate"
    )
    assert export_payload["trace_summary"]["input_hash"] == run_payload["input_hash"]
    assert export_payload["trace_summary"]["converged"] is True
    assert export_payload["metadata"]["catalog_context_count"] >= 2
    assert any(entry["element_id"] == "branch-load" for entry in export_payload["catalog_context"])
    assert any(entry["element_id"] == "src-grid" for entry in export_payload["catalog_context"])
    assert {"bus-load", "bus-main"}.issubset(
        {row["element_id"] for row in export_payload["bus_results"]["rows"]}
    )
    assert "branch-load" in {row["element_id"] for row in export_payload["branch_results"]["rows"]}
    assert export_payload["white_box_trace"]


def test_canonical_run_persists_outside_process_memory(client: TestClient) -> None:
    case_id = str(uuid4())
    _seed_power_flow_enm(client, case_id)

    from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
    from infrastructure.persistence.repositories.canonical_run_repository import (
        canonical_run_repository_scope,
    )

    run = create_run(case_id=case_id, analysis_type="PF")

    with canonical_run_repository_scope() as repository:
        stored_created = repository.get(run.id)

    assert stored_created is not None
    assert stored_created.status == "CREATED"
    assert stored_created.case_id == case_id
    assert stored_created.input_hash == run.input_hash

    execute_run(run.id)

    with canonical_run_repository_scope() as repository:
        stored_finished = repository.get(run.id)

    assert stored_finished is not None
    assert stored_finished.status == "FINISHED"
    assert stored_finished.raw_result is not None
    assert stored_finished.power_flow_trace is not None

    reset_canonical_runs()

    with canonical_run_repository_scope() as repository:
        assert repository.get(run.id) is None


def test_legacy_snapshot_and_analysis_index_routes_are_disabled_in_main_app(
    client: TestClient,
) -> None:
    case_id = str(uuid4())

    assert client.get("/snapshots/snap-1").status_code == 404
    assert client.get(f"/cases/{case_id}/snapshot").status_code == 404
    assert client.post(f"/cases/{case_id}/actions/batch", json={"actions": []}).status_code == 404
    assert client.get("/analysis-runs/design_synth.connection_study/run-1").status_code == 404
    assert client.get("/analysis-runs").status_code == 404
