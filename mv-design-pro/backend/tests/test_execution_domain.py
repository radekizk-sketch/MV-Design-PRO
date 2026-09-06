"""
Tests for PR-14: Execution Domain Models (StudyCase → Run → ResultSet)

Test categories:
- test_study_case_crud — CRUD on domain models
- test_run_blocked_when_not_ready — readiness gating
- test_run_hash_determinism — solver_input_hash determinism
- test_resultset_structure_snapshot — ResultSet shape invariants

INVARIANTS UNDER TEST:
- ZERO randomness in hash computation
- Identical ENM → identical hash
- Frozen dataclass immutability
- Status lifecycle enforcement
- Deterministic signature computation
"""

from __future__ import annotations

import copy
from uuid import uuid4

import pytest
from domain.execution import (
    ElementResult,
    ExecutionAnalysisType,
    ResultSet,
    Run,
    RunStatus,
    build_result_set,
    compute_result_signature,
    compute_solver_input_hash,
    new_run,
)

# =============================================================================
# Fixtures
# =============================================================================

MOCK_STUDY_CASE_ID = uuid4()
MOCK_PROJECT_ID = uuid4()


def _sample_solver_input() -> dict:
    """Create a realistic solver input for testing."""
    return {
        "buses": [
            {"ref_id": "bus-1", "name": "Bus 1", "voltage_level_kv": 15.0},
            {"ref_id": "bus-2", "name": "Bus 2", "voltage_level_kv": 15.0},
        ],
        "branches": [
            {
                "ref_id": "branch-1",
                "branch_type": "LINE",
                "from_bus_ref": "bus-1",
                "to_bus_ref": "bus-2",
                "r_ohm_per_km": 0.162,
                "x_ohm_per_km": 0.079,
                "length_km": 5.0,
            },
        ],
        "transformers": [],
        "inverter_sources": [],
        "switches": [],
        "c_factor_max": 1.10,
        "base_mva": 100.0,
    }


def _sample_element_results() -> list[ElementResult]:
    """Create sample element results."""
    return [
        ElementResult(
            element_ref="bus-2",
            element_type="Bus",
            values={"ikss_ka": 12.5, "ip_ka": 25.0, "ith_ka": 13.1},
        ),
        ElementResult(
            element_ref="bus-1",
            element_type="Bus",
            values={"ikss_ka": 15.0, "ip_ka": 30.0, "ith_ka": 15.5},
        ),
    ]


# =============================================================================
# test_study_case_crud
# =============================================================================


class TestRunCrud:
    """Test Run domain model CRUD operations."""

    def test_new_run_creates_pending(self):
        """new_run() creates a Run in PENDING status."""
        run = new_run(
            study_case_id=MOCK_STUDY_CASE_ID,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input_hash="abc123",
        )
        assert run.status == RunStatus.PENDING
        assert run.study_case_id == MOCK_STUDY_CASE_ID
        assert run.analysis_type == ExecutionAnalysisType.SC_3F
        assert run.solver_input_hash == "abc123"
        assert run.started_at is None
        assert run.finished_at is None
        assert run.error_message is None

    def test_run_is_frozen(self):
        """Run is a frozen dataclass — no in-place mutation."""
        run = new_run(
            study_case_id=MOCK_STUDY_CASE_ID,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input_hash="abc123",
        )
        with pytest.raises(AttributeError):
            run.status = RunStatus.RUNNING  # type: ignore[misc]

    def test_run_mark_running(self):
        """mark_running() creates a new Run with RUNNING status."""
        run = new_run(
            study_case_id=MOCK_STUDY_CASE_ID,
            analysis_type=ExecutionAnalysisType.LOAD_FLOW,
            solver_input_hash="def456",
        )
        running = run.mark_running()
        assert running.status == RunStatus.RUNNING
        assert running.started_at is not None
        assert running.id == run.id  # Same run ID
        # Original unchanged
        assert run.status == RunStatus.PENDING

    def test_run_mark_done(self):
        """mark_done() creates a new Run with DONE status."""
        run = new_run(
            study_case_id=MOCK_STUDY_CASE_ID,
            analysis_type=ExecutionAnalysisType.SC_1F,
            solver_input_hash="ghi789",
        )
        done = run.mark_running().mark_done()
        assert done.status == RunStatus.DONE
        assert done.finished_at is not None

    def test_run_mark_failed(self):
        """mark_failed() creates a new Run with FAILED status and error."""
        run = new_run(
            study_case_id=MOCK_STUDY_CASE_ID,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input_hash="jkl012",
        )
        failed = run.mark_failed("Brak węzła odniesienia")
        assert failed.status == RunStatus.FAILED
        assert failed.error_message == "Brak węzła odniesienia"
        assert failed.finished_at is not None

    def test_run_to_dict(self):
        """to_dict() serializes all fields correctly."""
        run = new_run(
            study_case_id=MOCK_STUDY_CASE_ID,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input_hash="hash123",
        )
        d = run.to_dict()
        assert d["id"] == str(run.id)
        assert d["study_case_id"] == str(MOCK_STUDY_CASE_ID)
        assert d["analysis_type"] == "SC_3F"
        assert d["solver_input_hash"] == "hash123"
        assert d["status"] == "PENDING"
        assert d["started_at"] is None
        assert d["finished_at"] is None
        assert d["error_message"] is None

    def test_run_from_dict_roundtrip(self):
        """from_dict(to_dict()) roundtrip preserves all fields."""
        run = new_run(
            study_case_id=MOCK_STUDY_CASE_ID,
            analysis_type=ExecutionAnalysisType.LOAD_FLOW,
            solver_input_hash="roundtrip",
        )
        run = run.mark_running().mark_done()
        restored = Run.from_dict(run.to_dict())
        assert restored.id == run.id
        assert restored.study_case_id == run.study_case_id
        assert restored.analysis_type == run.analysis_type
        assert restored.solver_input_hash == run.solver_input_hash
        assert restored.status == run.status

    def test_all_analysis_types(self):
        """All ExecutionAnalysisType values can be used."""
        for at in ExecutionAnalysisType:
            run = new_run(
                study_case_id=MOCK_STUDY_CASE_ID,
                analysis_type=at,
                solver_input_hash="test",
            )
            assert run.analysis_type == at
            d = run.to_dict()
            assert d["analysis_type"] == at.value


# =============================================================================
# test_run_hash_determinism
# =============================================================================


class TestRunHashDeterminism:
    """Test deterministic hash computation for solver input."""

    def test_identical_input_same_hash(self):
        """Two identical solver inputs produce the same hash."""
        input_a = _sample_solver_input()
        input_b = copy.deepcopy(input_a)
        hash_a = compute_solver_input_hash(input_a)
        hash_b = compute_solver_input_hash(input_b)
        assert hash_a == hash_b

    def test_different_input_different_hash(self):
        """Changing one parameter changes the hash."""
        input_a = _sample_solver_input()
        input_b = copy.deepcopy(input_a)
        input_b["c_factor_max"] = 1.05
        hash_a = compute_solver_input_hash(input_a)
        hash_b = compute_solver_input_hash(input_b)
        assert hash_a != hash_b

    def test_key_order_does_not_affect_hash(self):
        """Dict key order doesn't affect the hash (canonical sorting)."""
        input_a = {"z_key": 1, "a_key": 2, "m_key": 3}
        input_b = {"a_key": 2, "m_key": 3, "z_key": 1}
        hash_a = compute_solver_input_hash(input_a)
        hash_b = compute_solver_input_hash(input_b)
        assert hash_a == hash_b

    def test_list_order_in_buses_is_canonical(self):
        """Buses list is sorted by ref_id for determinism."""
        input_a = _sample_solver_input()
        input_b = copy.deepcopy(input_a)
        # Reverse the buses list
        input_b["buses"] = list(reversed(input_b["buses"]))
        hash_a = compute_solver_input_hash(input_a)
        hash_b = compute_solver_input_hash(input_b)
        assert hash_a == hash_b

    def test_list_order_in_branches_is_canonical(self):
        """Branches list is sorted by ref_id for determinism."""
        input_a = {
            "branches": [
                {"ref_id": "b2", "r": 0.1},
                {"ref_id": "b1", "r": 0.2},
            ]
        }
        input_b = {
            "branches": [
                {"ref_id": "b1", "r": 0.2},
                {"ref_id": "b2", "r": 0.1},
            ]
        }
        hash_a = compute_solver_input_hash(input_a)
        hash_b = compute_solver_input_hash(input_b)
        assert hash_a == hash_b

    def test_hash_is_sha256(self):
        """Hash is a valid SHA-256 hex string."""
        h = compute_solver_input_hash({"test": True})
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_empty_input_deterministic(self):
        """Empty input produces a deterministic hash."""
        h1 = compute_solver_input_hash({})
        h2 = compute_solver_input_hash({})
        assert h1 == h2
        assert len(h1) == 64

    def test_nested_dict_order_independence(self):
        """Nested dicts are also sorted canonically."""
        input_a = {"outer": {"z": 1, "a": 2}, "base_mva": 100}
        input_b = {"base_mva": 100, "outer": {"a": 2, "z": 1}}
        assert compute_solver_input_hash(input_a) == compute_solver_input_hash(input_b)

    def test_non_deterministic_list_preserved(self):
        """Non-deterministic lists (not in key set) maintain order."""
        input_a = {"options": [1, 2, 3]}
        input_b = {"options": [3, 2, 1]}
        hash_a = compute_solver_input_hash(input_a)
        hash_b = compute_solver_input_hash(input_b)
        # Different order in non-deterministic key → different hash
        assert hash_a != hash_b


# =============================================================================
# test_resultset_structure_snapshot
# =============================================================================


class TestResultSetStructure:
    """Test ResultSet structure and deterministic signature."""

    def test_build_result_set_sorts_elements(self):
        """build_result_set sorts element_results by element_ref."""
        results = _sample_element_results()  # bus-2 first, then bus-1
        rs = build_result_set(
            run_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={"is_valid": True},
            readiness_snapshot={"ready": True},
            element_results=results,
            global_results={"total_ikss_ka": 27.5},
        )
        refs = [er.element_ref for er in rs.element_results]
        assert refs == ["bus-1", "bus-2"]  # Sorted

    def test_deterministic_signature_computed(self):
        """build_result_set computes a non-empty signature."""
        rs = build_result_set(
            run_id=uuid4(),
            analysis_type=ExecutionAnalysisType.LOAD_FLOW,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={"converged": True},
        )
        assert rs.deterministic_signature != ""
        assert len(rs.deterministic_signature) == 64

    def test_identical_results_same_signature(self):
        """Two identical result sets produce the same signature."""
        run_id = uuid4()
        kwargs = {
            "run_id": run_id,
            "analysis_type": ExecutionAnalysisType.SC_3F,
            "validation_snapshot": {"is_valid": True},
            "readiness_snapshot": {"ready": True},
            "element_results": _sample_element_results(),
            "global_results": {"total_ikss_ka": 27.5},
        }
        rs1 = build_result_set(**kwargs)
        rs2 = build_result_set(**kwargs)
        assert rs1.deterministic_signature == rs2.deterministic_signature

    def test_different_results_different_signature(self):
        """Different results produce different signatures."""
        run_id = uuid4()
        rs1 = build_result_set(
            run_id=run_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[
                ElementResult(
                    element_ref="bus-1",
                    element_type="Bus",
                    values={"ikss_ka": 12.5},
                )
            ],
            global_results={},
        )
        rs2 = build_result_set(
            run_id=run_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[
                ElementResult(
                    element_ref="bus-1",
                    element_type="Bus",
                    values={"ikss_ka": 13.0},  # Different value
                )
            ],
            global_results={},
        )
        assert rs1.deterministic_signature != rs2.deterministic_signature

    def test_resultset_is_frozen(self):
        """ResultSet is a frozen dataclass — no in-place mutation."""
        rs = build_result_set(
            run_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={},
        )
        with pytest.raises(AttributeError):
            rs.deterministic_signature = "tampered"  # type: ignore[misc]

    def test_resultset_to_dict(self):
        """to_dict() serializes all fields correctly."""
        run_id = uuid4()
        rs = build_result_set(
            run_id=run_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={"is_valid": True},
            readiness_snapshot={"ready": True},
            element_results=_sample_element_results(),
            global_results={"total_ikss_ka": 27.5},
        )
        d = rs.to_dict()
        assert d["run_id"] == str(run_id)
        assert d["analysis_type"] == "SC_3F"
        assert d["validation_snapshot"] == {"is_valid": True}
        assert d["readiness_snapshot"] == {"ready": True}
        assert len(d["element_results"]) == 2
        assert d["global_results"] == {"total_ikss_ka": 27.5}
        assert d["deterministic_signature"] != ""

    def test_resultset_from_dict_roundtrip(self):
        """from_dict(to_dict()) roundtrip preserves all fields."""
        run_id = uuid4()
        rs = build_result_set(
            run_id=run_id,
            analysis_type=ExecutionAnalysisType.LOAD_FLOW,
            validation_snapshot={"converged": True},
            readiness_snapshot={"ready": True},
            element_results=[
                ElementResult("bus-1", "Bus", {"u_pu": 0.98}),
            ],
            global_results={"total_losses_mw": 0.05},
        )
        restored = ResultSet.from_dict(rs.to_dict())
        assert restored.run_id == rs.run_id
        assert restored.analysis_type == rs.analysis_type
        assert restored.deterministic_signature == rs.deterministic_signature
        assert len(restored.element_results) == 1
        assert restored.element_results[0].element_ref == "bus-1"

    def test_element_result_is_frozen(self):
        """ElementResult is a frozen dataclass."""
        er = ElementResult(
            element_ref="bus-1",
            element_type="Bus",
            values={"ikss_ka": 12.5},
        )
        with pytest.raises(AttributeError):
            er.element_ref = "bus-2"  # type: ignore[misc]

    def test_element_result_to_dict(self):
        """ElementResult.to_dict() serializes correctly."""
        er = ElementResult(
            element_ref="bus-1",
            element_type="Bus",
            values={"ikss_ka": 12.5, "ip_ka": 25.0},
        )
        d = er.to_dict()
        assert d == {
            "element_ref": "bus-1",
            "element_type": "Bus",
            "values": {"ikss_ka": 12.5, "ip_ka": 25.0},
        }


# =============================================================================
# test_compute_result_signature
# =============================================================================


class TestComputeResultSignature:
    """Test result signature computation."""

    def test_same_data_same_signature(self):
        data = {"a": 1, "b": [1, 2, 3]}
        assert compute_result_signature(data) == compute_result_signature(data)

    def test_dict_key_order_irrelevant(self):
        data_a = {"b": 2, "a": 1}
        data_b = {"a": 1, "b": 2}
        assert compute_result_signature(data_a) == compute_result_signature(data_b)

    def test_different_data_different_signature(self):
        data_a = {"a": 1}
        data_b = {"a": 2}
        assert compute_result_signature(data_a) != compute_result_signature(data_b)
