"""Tests for Case-Bound Runs API endpoints."""

from uuid import uuid4

import pytest
from api.case_runs import (
    CaseRunAnalysisType,
    CaseRunStatus,
    FaultType,
    LoadFlowSolver,
    ProtectionMethod,
    _case_runs_store,
    _compute_input_hash,
    _store_run,
    router,
)


@pytest.fixture(autouse=True)
def _clear_store():
    """Clear in-memory store before each test."""
    _case_runs_store.clear()
    yield
    _case_runs_store.clear()


class TestEnums:
    """Tests for API enum values."""

    def test_fault_types(self):
        assert FaultType.THREE_PHASE.value == "3F"
        assert FaultType.SINGLE_PHASE.value == "1F"
        assert FaultType.TWO_PHASE.value == "2F"
        assert FaultType.TWO_PHASE_GROUND.value == "2F+G"

    def test_loadflow_solvers(self):
        assert LoadFlowSolver.NEWTON.value == "newton"
        assert LoadFlowSolver.GAUSS_SEIDEL.value == "gauss_seidel"
        assert LoadFlowSolver.FAST_DECOUPLED.value == "fast_decoupled"

    def test_protection_methods(self):
        assert ProtectionMethod.HOPPEL.value == "hoppel"

    def test_run_status_values(self):
        assert CaseRunStatus.CREATED.value == "CREATED"
        assert CaseRunStatus.VALIDATED.value == "VALIDATED"
        assert CaseRunStatus.RUNNING.value == "RUNNING"
        assert CaseRunStatus.FINISHED.value == "FINISHED"
        assert CaseRunStatus.FAILED.value == "FAILED"

    def test_analysis_types(self):
        assert CaseRunAnalysisType.SHORT_CIRCUIT.value == "short_circuit"
        assert CaseRunAnalysisType.LOADFLOW.value == "loadflow"
        assert CaseRunAnalysisType.PROTECTION_SETTINGS.value == "protection_settings"


class TestInputHash:
    """Tests for deterministic input hashing."""

    def test_same_input_same_hash(self):
        params = {"a": 1, "b": "hello"}
        h1 = _compute_input_hash(params)
        h2 = _compute_input_hash(params)
        assert h1 == h2

    def test_different_input_different_hash(self):
        h1 = _compute_input_hash({"a": 1})
        h2 = _compute_input_hash({"a": 2})
        assert h1 != h2

    def test_hash_is_deterministic_regardless_of_key_order(self):
        h1 = _compute_input_hash({"b": 2, "a": 1})
        h2 = _compute_input_hash({"a": 1, "b": 2})
        assert h1 == h2

    def test_hash_length(self):
        h = _compute_input_hash({"x": 42})
        assert len(h) == 16


class TestStoreRun:
    """Tests for in-memory run storage."""

    def test_store_creates_run(self):
        case_id = uuid4()
        record = _store_run(
            case_id=case_id,
            analysis_type=CaseRunAnalysisType.SHORT_CIRCUIT,
            input_params={"fault_type": "3F"},
        )
        assert record["case_id"] == str(case_id)
        assert record["analysis_type"] == "short_circuit"
        assert record["status"] == "CREATED"
        assert record["id"] in _case_runs_store

    def test_store_multiple_runs(self):
        case_id = uuid4()
        r1 = _store_run(case_id, CaseRunAnalysisType.SHORT_CIRCUIT, {})
        r2 = _store_run(case_id, CaseRunAnalysisType.LOADFLOW, {})
        assert r1["id"] != r2["id"]
        assert len(_case_runs_store) == 2

    def test_run_has_timestamps(self):
        case_id = uuid4()
        record = _store_run(case_id, CaseRunAnalysisType.SHORT_CIRCUIT, {})
        assert record["created_at"] is not None
        assert record["started_at"] is None
        assert record["finished_at"] is None

    def test_run_has_input_hash(self):
        case_id = uuid4()
        params = {"fault_type": "3F", "c_factor": 1.1}
        record = _store_run(case_id, CaseRunAnalysisType.SHORT_CIRCUIT, params)
        assert len(record["input_hash"]) == 16


class TestRouterConfiguration:
    """Tests for router configuration."""

    def test_router_has_prefix(self):
        assert router.prefix == "/api"

    def test_router_has_tag(self):
        assert "case-runs" in router.tags

    def test_routes_exist(self):
        route_paths = [r.path for r in router.routes]
        # Routes include the /api prefix from the router
        assert "/api/cases/{case_id}/runs/short-circuit" in route_paths
        assert "/api/cases/{case_id}/runs/loadflow" in route_paths
        assert "/api/cases/{case_id}/runs/protection-settings" in route_paths
        assert "/api/cases/{case_id}/runs" in route_paths
        assert "/api/runs/{run_id}" in route_paths
        assert "/api/runs/{run_id}/trace" in route_paths
        assert "/api/runs/{run_id}/proof-pack" in route_paths
