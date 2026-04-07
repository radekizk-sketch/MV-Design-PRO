from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from api.main import app
from enm.canonical_analysis import CanonicalRun, build_extended_trace


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
                        "ref_id": "src-grid",
                        "name": "Zasilanie GPZ",
                        "tags": [],
                        "meta": {},
                        "bus_ref": "bus-main",
                        "model": "short_circuit_power",
                        "sk3_mva": 250.0,
                        "rx_ratio": 0.1,
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
                "payload": {"voltage_kv": 15.0, "sk3_mva": 250.0, "rx_ratio": 0.1},
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

    short_circuit = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit")
    assert short_circuit.status_code == 200
    short_circuit_payload = short_circuit.json()
    assert short_circuit_payload["run_id"] == run_id
    assert short_circuit_payload["rows"]

    run_snapshot_response = client.get(f"/api/analysis-runs/{run_id}/snapshot")
    assert run_snapshot_response.status_code == 200
    run_snapshot_payload = run_snapshot_response.json()
    assert run_snapshot_payload["header"]["hash_sha256"] == snapshot_hash
    assert run_snapshot_payload["sources"]

    trace_details = client.get(f"/api/analysis-runs/{run_id}/results/trace")
    assert trace_details.status_code == 200
    trace_payload = trace_details.json()
    assert trace_payload["run_id"] == run_id
    assert trace_payload["snapshot_id"] == snapshot_hash
    assert trace_payload["input_hash"] == input_hash
    assert trace_payload["trace_contract_version"] == "1.0"
    assert trace_payload["selection_index"]
    assert trace_payload["white_box_trace"]
    first_target_id = short_circuit_payload["rows"][0]["target_id"]
    assert trace_payload["selection_index"][first_target_id]["element_type"] == "Bus"
    assert trace_payload["selection_index"][first_target_id]["step_indices"]
    first_trace_step = trace_payload["white_box_trace"][0]
    assert first_trace_step["step_key"] == (first_trace_step.get("key") or "trace-step-1")
    assert first_trace_step["related_elements"]
    assert first_trace_step["primary_element_ref"] == first_target_id
    assert first_trace_step["primary_element_type"] == "Bus"
    assert any(link["role"] == "CEL_ANALIZY" for link in first_trace_step["related_elements"])
    assert all(link["element_ref"] in trace_payload["selection_index"] for link in first_trace_step["related_elements"])

    trace_view = client.get(f"/api/analysis-runs/{run_id}/trace")
    assert trace_view.status_code == 200
    legacy_trace = trace_view.json()["trace"]
    assert len(legacy_trace) == len(trace_payload["white_box_trace"])
    assert legacy_trace[0]["target_id"] == first_trace_step["target_id"]


def test_analysis_creation_requires_canonical_enm_snapshot(client: TestClient) -> None:
    case_id = str(uuid4())

    response = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )

    assert response.status_code == 409
    assert "model" in response.json()["detail"].lower() or "analiza" in response.json()["detail"].lower()


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

    canonical_index_response = client.get(f"/api/analysis-runs/{run_id}/results/index")
    assert canonical_index_response.status_code == 200
    canonical_index_payload = canonical_index_response.json()
    assert canonical_index_payload["run_header"]["snapshot_id"] == run_payload["enm_hash"]
    assert canonical_index_payload["run_header"]["input_hash"] == run_payload["input_hash"]

    canonical_trace_response = client.get(f"/api/analysis-runs/{run_id}/results/trace")
    assert canonical_trace_response.status_code == 200
    canonical_trace_payload = canonical_trace_response.json()
    assert canonical_trace_payload["snapshot_id"] == run_payload["enm_hash"]
    assert canonical_trace_payload["input_hash"] == run_payload["input_hash"]
    assert canonical_trace_payload["trace_contract_version"] == "1.0"
    assert set(canonical_trace_payload["selection_index"]) == {"branch-load", "bus-load", "bus-main"}
    assert canonical_trace_payload["selection_index"]["bus-main"]["element_type"] == "Bus"
    assert canonical_trace_payload["selection_index"]["bus-load"]["element_type"] == "Bus"
    assert canonical_trace_payload["selection_index"]["branch-load"]["element_type"] == "LineBranch"
    assert canonical_trace_payload["selection_index"]["bus-main"]["step_indices"]
    assert canonical_trace_payload["selection_index"]["branch-load"]["step_indices"]
    final_step = canonical_trace_payload["white_box_trace"][-1]
    assert final_step["related_elements"]
    assert final_step["primary_element_ref"] in canonical_trace_payload["selection_index"]
    assert final_step["primary_element_type"] in {"Bus", "LineBranch"}
    assert {link["element_ref"] for link in final_step["related_elements"]} == {"branch-load", "bus-load", "bus-main"}

    export_response = client.get(f"/power-flow-runs/{run_id}/export/json")
    assert export_response.status_code == 200
    export_payload = export_response.json()
    assert export_payload["metadata"]["run_id"] == run_id
    assert export_payload["metadata"]["snapshot_hash"] == run_payload["enm_hash"]
    assert export_payload["trace_summary"]["input_hash"] == run_payload["input_hash"]
    assert export_payload["trace_summary"]["converged"] is True


def test_build_extended_trace_contract_lifts_nested_refs_into_selection_index() -> None:
    run = CanonicalRun(
        id=uuid4(),
        case_id="case-trace",
        project_id="project-trace",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime.now(timezone.utc),
        snapshot_hash="snap-trace",
        input_hash="input-trace",
        snapshot={
            "buses": [
                {"ref_id": "bus-main"},
                {"ref_id": "bus-load"},
            ],
            "branches": [
                {"ref_id": "branch-load", "type": "cable"},
            ],
        },
        validation={},
        readiness={},
        white_box_trace=[
            {
                "title": "Krok kontraktu",
                "inputs": {"fault_node_id": "bus-main"},
                "result": {"bus_ids": ["bus-load"]},
                "metadata": {"branch_ids": ["branch-load"]},
            }
        ],
    )

    trace_payload = build_extended_trace(run)

    assert trace_payload["trace_contract_version"] == "1.0"
    assert trace_payload["selection_index"]["bus-main"]["element_type"] == "Bus"
    assert trace_payload["selection_index"]["bus-main"]["step_indices"] == [0]
    assert trace_payload["selection_index"]["bus-load"]["element_type"] == "Bus"
    assert trace_payload["selection_index"]["bus-load"]["step_indices"] == [0]
    assert trace_payload["selection_index"]["branch-load"]["element_type"] == "LineBranch"
    assert trace_payload["selection_index"]["branch-load"]["step_indices"] == [0]

    step = trace_payload["white_box_trace"][0]
    assert step["step_key"] == "trace-step-1"
    assert step["related_elements"]
    assert step["primary_element_ref"] in trace_payload["selection_index"]
    assert step["primary_element_type"] in {"Bus", "LineBranch"}
    assert {link["element_ref"] for link in step["related_elements"]} >= {
        "bus-main",
        "bus-load",
        "branch-load",
    }


def test_legacy_snapshot_and_analysis_index_routes_are_disabled_in_main_app(client: TestClient) -> None:
    case_id = str(uuid4())

    assert client.get("/snapshots/snap-1").status_code == 404
    assert client.get(f"/cases/{case_id}/snapshot").status_code == 404
    assert client.post(f"/cases/{case_id}/actions/batch", json={"actions": []}).status_code == 404
    assert client.get("/api/analysis-runs/design_synth.connection_study/run-1").status_code == 404
    assert client.get("/api/analysis-runs").status_code == 404
