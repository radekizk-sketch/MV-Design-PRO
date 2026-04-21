"""
Tests for PR-20: Deterministic Batch Execution & Comparison

Test categories:
- test_batch_hash_determinism — batch_input_hash is stable
- test_scenario_order_independence — sorting produces same hash
- test_sequential_execution_order — scenarios execute in sorted order
- test_comparison_delta_math — delta computation correctness
- test_input_hash_stability — comparison input_hash is stable
- test_cross_analysis_rejected — mismatched analysis types rejected
- test_cross_study_case_rejected — mismatched study cases rejected

INVARIANTS UNDER TEST:
- ZERO randomness in hash computation
- ZERO parallelism (sequential only)
- ZERO partial success (any failure → FAILED)
- Deterministic ordering
- Mathematical correctness of deltas
- Golden fixture: 3 scenarios SC_3F, batch DONE, comparison correct
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from application.batch_execution_service import (
    BatchExecutionService,
    BatchNotFoundError,
    BatchNotPendingError,
)
from application.execution_engine.errors import StudyCaseNotFoundError
from application.execution_engine.service import ExecutionEngineService
from application.sc_comparison_service import (
    AnalysisTypeMismatchError,
    RunNotDoneError,
    ScComparisonService,
    StudyCaseMismatchError,
)
from domain.batch_job import (
    BatchJob,
    BatchJobStatus,
    compute_batch_input_hash,
    new_batch_job,
)
from domain.execution import (
    ElementResult,
    ExecutionAnalysisType,
    RunStatus,
    build_result_set,
)
from domain.sc_comparison import (
    NumericDelta,
    ShortCircuitComparison,
    build_comparison,
    compute_comparison_input_hash,
    compute_numeric_delta,
)
from domain.study_case import StudyCaseConfig, new_study_case

# =============================================================================
# Fixtures
# =============================================================================

MOCK_PROJECT_ID = uuid4()


def _make_engine_with_case() -> tuple[ExecutionEngineService, UUID]:
    """Create an engine with a registered study case."""
    engine = ExecutionEngineService()
    case = new_study_case(
        project_id=MOCK_PROJECT_ID,
        name="Batch test case",
        config=StudyCaseConfig(),
    )
    engine.register_study_case(case)
    return engine, case.id


def _sample_solver_input(variant: int = 0) -> dict:
    """Create a sample solver input with optional variant."""
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
                "r_ohm_per_km": 0.162 + variant * 0.01,
                "x_ohm_per_km": 0.079,
                "length_km": 5.0,
            },
        ],
        "c_factor_max": 1.10,
        "base_mva": 100.0,
        "expected_results": {
            "ikss_a": 1000.0 + variant * 100,
            "ip_a": 2000.0 + variant * 200,
            "ith_a": 1100.0 + variant * 110,
            "sk_mva": 50.0 + variant * 5,
            "kappa": 1.5 + variant * 0.1,
            "zkk_ohm": 0.5 + variant * 0.05,
        },
    }


# =============================================================================
# test_batch_hash_determinism
# =============================================================================


class TestBatchHashDeterminism:
    """Test that batch_input_hash is deterministic."""

    def test_identical_inputs_same_hash(self):
        """Two identical batch inputs produce the same hash."""
        scenario_ids = (uuid4(), uuid4())
        sorted_ids = tuple(sorted(scenario_ids, key=str))
        hashes = ("hash_a", "hash_b")

        h1 = compute_batch_input_hash(ExecutionAnalysisType.SC_3F, sorted_ids, hashes)
        h2 = compute_batch_input_hash(ExecutionAnalysisType.SC_3F, sorted_ids, hashes)
        assert h1 == h2

    def test_different_analysis_type_different_hash(self):
        """Different analysis types produce different hashes."""
        scenario_ids = (uuid4(),)
        hashes = ("hash_a",)

        h1 = compute_batch_input_hash(ExecutionAnalysisType.SC_3F, scenario_ids, hashes)
        h2 = compute_batch_input_hash(ExecutionAnalysisType.SC_1F, scenario_ids, hashes)
        assert h1 != h2

    def test_different_content_hash_different_batch_hash(self):
        """Different content hashes produce different batch hashes."""
        sid = uuid4()
        h1 = compute_batch_input_hash(ExecutionAnalysisType.SC_3F, (sid,), ("hash_a",))
        h2 = compute_batch_input_hash(ExecutionAnalysisType.SC_3F, (sid,), ("hash_b",))
        assert h1 != h2

    def test_hash_is_sha256(self):
        """Batch input hash is a valid SHA-256 hex string."""
        h = compute_batch_input_hash(ExecutionAnalysisType.SC_3F, (uuid4(),), ("h",))
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_new_batch_job_hash_stable(self):
        """new_batch_job produces stable hash for same inputs."""
        sid1 = uuid4()
        sid2 = uuid4()
        ids = [sid1, sid2]
        hashes = ["h1", "h2"]

        b1 = new_batch_job(
            study_case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=list(ids),
            scenario_content_hashes=list(hashes),
        )
        b2 = new_batch_job(
            study_case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=list(ids),
            scenario_content_hashes=list(hashes),
        )
        assert b1.batch_input_hash == b2.batch_input_hash


# =============================================================================
# test_scenario_order_independence
# =============================================================================


class TestScenarioOrderIndependence:
    """Test that scenario ordering is deterministic regardless of input order."""

    def test_scenario_ids_sorted_in_batch(self):
        """new_batch_job sorts scenario_ids lexicographically."""
        sid_a = uuid4()
        sid_b = uuid4()
        batch = new_batch_job(
            study_case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[sid_b, sid_a],
            scenario_content_hashes=["hb", "ha"],
        )
        expected = tuple(sorted([sid_a, sid_b], key=str))
        assert batch.scenario_ids == expected

    def test_reversed_order_same_hash(self):
        """Reversed scenario order produces the same batch hash."""
        sid_a = uuid4()
        sid_b = uuid4()

        b1 = new_batch_job(
            study_case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[sid_a, sid_b],
            scenario_content_hashes=["ha", "hb"],
        )
        b2 = new_batch_job(
            study_case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[sid_b, sid_a],
            scenario_content_hashes=["hb", "ha"],
        )
        assert b1.batch_input_hash == b2.batch_input_hash

    def test_no_duplicate_scenario_ids(self):
        """new_batch_job rejects duplicate scenario_ids."""
        sid = uuid4()
        with pytest.raises(ValueError, match="duplikaty"):
            new_batch_job(
                study_case_id=uuid4(),
                analysis_type=ExecutionAnalysisType.SC_3F,
                scenario_ids=[sid, sid],
                scenario_content_hashes=["h1", "h2"],
            )

    def test_mismatched_lengths_rejected(self):
        """new_batch_job rejects mismatched scenario_ids and hashes lengths."""
        with pytest.raises(ValueError, match="długość"):
            new_batch_job(
                study_case_id=uuid4(),
                analysis_type=ExecutionAnalysisType.SC_3F,
                scenario_ids=[uuid4(), uuid4()],
                scenario_content_hashes=["h1"],
            )


# =============================================================================
# test_sequential_execution_order
# =============================================================================


class TestSequentialExecutionOrder:
    """Test that batch execution is sequential and deterministic."""

    def test_batch_creates_in_pending(self):
        """create_batch_job creates a PENDING batch."""
        engine, case_id = _make_engine_with_case()
        service = BatchExecutionService(engine)

        batch = service.create_batch_job(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[uuid4(), uuid4()],
            scenario_content_hashes=["h1", "h2"],
            solver_inputs=[_sample_solver_input(0), _sample_solver_input(1)],
        )
        assert batch.status == BatchJobStatus.PENDING

    def test_batch_execution_produces_done(self):
        """Successful batch execution produces DONE status."""
        engine, case_id = _make_engine_with_case()
        service = BatchExecutionService(engine)

        sid1, sid2 = uuid4(), uuid4()
        batch = service.create_batch_job(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[sid1, sid2],
            scenario_content_hashes=["h1", "h2"],
            solver_inputs=[_sample_solver_input(0), _sample_solver_input(1)],
        )

        result = service.execute_batch(batch.batch_id)
        assert result.status == BatchJobStatus.DONE
        assert len(result.run_ids) == 2
        assert len(result.result_set_ids) == 2
        assert len(result.errors) == 0

    def test_batch_execution_creates_runs_per_scenario(self):
        """Each scenario produces exactly one Run."""
        engine, case_id = _make_engine_with_case()
        service = BatchExecutionService(engine)

        sids = [uuid4(), uuid4(), uuid4()]
        batch = service.create_batch_job(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=sids,
            scenario_content_hashes=["h1", "h2", "h3"],
            solver_inputs=[
                _sample_solver_input(0),
                _sample_solver_input(1),
                _sample_solver_input(2),
            ],
        )

        result = service.execute_batch(batch.batch_id)
        assert len(result.run_ids) == 3

        # Verify each run is DONE
        for run_id in result.run_ids:
            run = engine.get_run(run_id)
            assert run.status == RunStatus.DONE

    def test_double_execution_rejected(self):
        """Executing an already-executed batch raises error."""
        engine, case_id = _make_engine_with_case()
        service = BatchExecutionService(engine)

        batch = service.create_batch_job(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[uuid4()],
            scenario_content_hashes=["h1"],
            solver_inputs=[_sample_solver_input()],
        )
        service.execute_batch(batch.batch_id)

        with pytest.raises(BatchNotPendingError):
            service.execute_batch(batch.batch_id)

    def test_batch_not_found(self):
        """Getting a nonexistent batch raises error."""
        engine, case_id = _make_engine_with_case()
        service = BatchExecutionService(engine)

        with pytest.raises(BatchNotFoundError):
            service.get_batch(uuid4())

    def test_list_batches_newest_first(self):
        """list_batches returns batches newest first."""
        engine, case_id = _make_engine_with_case()
        service = BatchExecutionService(engine)

        b1 = service.create_batch_job(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[uuid4()],
            scenario_content_hashes=["h1"],
            solver_inputs=[_sample_solver_input()],
        )
        b2 = service.create_batch_job(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[uuid4()],
            scenario_content_hashes=["h2"],
            solver_inputs=[_sample_solver_input(1)],
        )

        batches = service.list_batches(case_id)
        assert len(batches) == 2
        assert batches[0].batch_id == b2.batch_id
        assert batches[1].batch_id == b1.batch_id

    def test_study_case_not_found_rejected(self):
        """Creating batch for nonexistent study case raises error."""
        engine, _ = _make_engine_with_case()
        service = BatchExecutionService(engine)

        with pytest.raises(StudyCaseNotFoundError):
            service.create_batch_job(
                study_case_id=uuid4(),
                analysis_type=ExecutionAnalysisType.SC_3F,
                scenario_ids=[uuid4()],
                scenario_content_hashes=["h1"],
                solver_inputs=[_sample_solver_input()],
            )


# =============================================================================
# test_comparison_delta_math
# =============================================================================


class TestComparisonDeltaMath:
    """Test mathematical correctness of delta computations."""

    def test_numeric_delta_basic(self):
        """compute_numeric_delta computes correct abs and rel."""
        delta = compute_numeric_delta(100.0, 120.0)
        assert delta.base == 100.0
        assert delta.other == 120.0
        assert delta.abs == pytest.approx(20.0)
        assert delta.rel == pytest.approx(0.2)

    def test_numeric_delta_negative(self):
        """Negative delta when other < base."""
        delta = compute_numeric_delta(100.0, 80.0)
        assert delta.abs == pytest.approx(-20.0)
        assert delta.rel == pytest.approx(-0.2)

    def test_numeric_delta_zero_base(self):
        """rel is None when base == 0."""
        delta = compute_numeric_delta(0.0, 50.0)
        assert delta.abs == pytest.approx(50.0)
        assert delta.rel is None

    def test_numeric_delta_both_zero(self):
        """Both zero: abs=0, rel=None."""
        delta = compute_numeric_delta(0.0, 0.0)
        assert delta.abs == pytest.approx(0.0)
        assert delta.rel is None

    def test_numeric_delta_identical(self):
        """Identical values: abs=0, rel=0."""
        delta = compute_numeric_delta(42.5, 42.5)
        assert delta.abs == pytest.approx(0.0)
        assert delta.rel == pytest.approx(0.0)

    def test_numeric_delta_to_dict_roundtrip(self):
        """NumericDelta serialization roundtrip."""
        delta = compute_numeric_delta(100.0, 120.0)
        restored = NumericDelta.from_dict(delta.to_dict())
        assert restored.base == delta.base
        assert restored.other == delta.other
        assert restored.abs == delta.abs
        assert restored.rel == delta.rel

    def test_build_comparison_global_deltas(self):
        """build_comparison computes correct global deltas."""
        run_id_base = uuid4()
        run_id_other = uuid4()
        case_id = uuid4()

        base_rs = build_result_set(
            run_id=run_id_base,
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={
                "ikss_a": 1000.0,
                "ip_a": 2000.0,
                "ith_a": 1100.0,
                "sk_mva": 50.0,
                "kappa": 1.5,
                "zkk_ohm": 0.5,
            },
        )
        other_rs = build_result_set(
            run_id=run_id_other,
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={
                "ikss_a": 1200.0,
                "ip_a": 2400.0,
                "ith_a": 1320.0,
                "sk_mva": 60.0,
                "kappa": 1.8,
                "zkk_ohm": 0.6,
            },
        )

        comparison = build_comparison(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            base_scenario_id=uuid4(),
            other_scenario_id=uuid4(),
            base_result_set=base_rs,
            other_result_set=other_rs,
        )

        assert "ikss_a" in comparison.deltas_global
        assert comparison.deltas_global["ikss_a"].abs == pytest.approx(200.0)
        assert comparison.deltas_global["ikss_a"].rel == pytest.approx(0.2)

        assert "ip_a" in comparison.deltas_global
        assert comparison.deltas_global["ip_a"].abs == pytest.approx(400.0)
        assert comparison.deltas_global["ip_a"].rel == pytest.approx(0.2)

        assert "sk_mva" in comparison.deltas_global
        assert comparison.deltas_global["sk_mva"].abs == pytest.approx(10.0)
        assert comparison.deltas_global["sk_mva"].rel == pytest.approx(0.2)

    def test_build_comparison_element_deltas(self):
        """build_comparison computes per-element deltas."""
        run_id_base = uuid4()
        run_id_other = uuid4()

        base_rs = build_result_set(
            run_id=run_id_base,
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[
                ElementResult("src-1", "Source", {"ikss_a": 500.0, "ip_a": 1000.0}),
                ElementResult("branch-1", "Branch", {"i_a": 300.0}),
            ],
            global_results={},
        )
        other_rs = build_result_set(
            run_id=run_id_other,
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[
                ElementResult("src-1", "Source", {"ikss_a": 600.0, "ip_a": 1200.0}),
                ElementResult("branch-1", "Branch", {"i_a": 360.0}),
            ],
            global_results={},
        )

        comparison = build_comparison(
            study_case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            base_scenario_id=uuid4(),
            other_scenario_id=uuid4(),
            base_result_set=base_rs,
            other_result_set=other_rs,
        )

        assert len(comparison.deltas_by_source) >= 1
        assert len(comparison.deltas_by_branch) >= 1

        # Check source delta
        src_delta = comparison.deltas_by_source[0]
        assert src_delta["element_ref"] == "src-1"
        assert src_delta["deltas"]["ikss_a"]["abs"] == pytest.approx(100.0)

        # Check branch delta
        br_delta = comparison.deltas_by_branch[0]
        assert br_delta["element_ref"] == "branch-1"
        assert br_delta["deltas"]["i_a"]["abs"] == pytest.approx(60.0)

    def test_comparison_missing_key_skipped(self):
        """Keys present in only one ResultSet are skipped in global deltas."""
        base_rs = build_result_set(
            run_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={"ikss_a": 1000.0},
        )
        other_rs = build_result_set(
            run_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={"ikss_a": 1200.0, "ib_a": 500.0},
        )

        comparison = build_comparison(
            study_case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            base_scenario_id=uuid4(),
            other_scenario_id=uuid4(),
            base_result_set=base_rs,
            other_result_set=other_rs,
        )

        # ikss_a present in both → delta computed
        assert "ikss_a" in comparison.deltas_global
        # ib_a present only in other → no delta
        assert "ib_a" not in comparison.deltas_global


# =============================================================================
# test_input_hash_stability
# =============================================================================


class TestInputHashStability:
    """Test that comparison input_hash is stable."""

    def test_same_inputs_same_hash(self):
        """Identical inputs produce the same comparison hash."""
        h1 = compute_comparison_input_hash("sig_base", "sig_other", ExecutionAnalysisType.SC_3F)
        h2 = compute_comparison_input_hash("sig_base", "sig_other", ExecutionAnalysisType.SC_3F)
        assert h1 == h2

    def test_different_signatures_different_hash(self):
        """Different signatures produce different hashes."""
        h1 = compute_comparison_input_hash("sig_a", "sig_b", ExecutionAnalysisType.SC_3F)
        h2 = compute_comparison_input_hash("sig_a", "sig_c", ExecutionAnalysisType.SC_3F)
        assert h1 != h2

    def test_comparison_hash_is_sha256(self):
        """Comparison input hash is valid SHA-256."""
        h = compute_comparison_input_hash("a", "b", ExecutionAnalysisType.SC_3F)
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_comparison_to_dict_roundtrip(self):
        """ShortCircuitComparison serialization roundtrip."""
        base_rs = build_result_set(
            run_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={"ikss_a": 1000.0, "ip_a": 2000.0},
        )
        other_rs = build_result_set(
            run_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={"ikss_a": 1200.0, "ip_a": 2400.0},
        )

        comparison = build_comparison(
            study_case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            base_scenario_id=uuid4(),
            other_scenario_id=uuid4(),
            base_result_set=base_rs,
            other_result_set=other_rs,
        )

        d = comparison.to_dict()
        restored = ShortCircuitComparison.from_dict(d)
        assert restored.comparison_id == comparison.comparison_id
        assert restored.input_hash == comparison.input_hash
        assert restored.analysis_type == comparison.analysis_type


# =============================================================================
# test_cross_analysis_rejected
# =============================================================================


class TestCrossAnalysisRejected:
    """Test that mismatched analysis types are rejected."""

    def test_comparison_rejects_cross_analysis(self):
        """ScComparisonService rejects runs with different analysis types."""
        engine, case_id = _make_engine_with_case()
        service = ScComparisonService(engine)

        # Create two runs with different analysis types
        run_a = engine.create_run(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(0),
        )
        run_b = engine.create_run(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_1F,
            solver_input=_sample_solver_input(1),
        )

        # Complete both
        engine.start_run(run_a.id)
        engine.complete_run(
            run_a.id,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={"ikss_a": 1000.0},
        )
        engine.start_run(run_b.id)
        engine.complete_run(
            run_b.id,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={"ikss_a": 1200.0},
        )

        with pytest.raises(AnalysisTypeMismatchError):
            service.compute_comparison(
                study_case_id=case_id,
                base_run_id=run_a.id,
                other_run_id=run_b.id,
                base_scenario_id=uuid4(),
                other_scenario_id=uuid4(),
            )


# =============================================================================
# test_cross_study_case_rejected
# =============================================================================


class TestCrossStudyCaseRejected:
    """Test that mismatched study cases are rejected."""

    def test_comparison_rejects_cross_study_case(self):
        """ScComparisonService rejects runs from different study cases."""
        engine = ExecutionEngineService()

        case_a = new_study_case(
            project_id=MOCK_PROJECT_ID,
            name="Case A",
            config=StudyCaseConfig(),
        )
        case_b = new_study_case(
            project_id=MOCK_PROJECT_ID,
            name="Case B",
            config=StudyCaseConfig(),
        )
        engine.register_study_case(case_a)
        engine.register_study_case(case_b)

        service = ScComparisonService(engine)

        # Create runs in different study cases
        run_a = engine.create_run(
            study_case_id=case_a.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(0),
        )
        run_b = engine.create_run(
            study_case_id=case_b.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(1),
        )

        # Complete both
        engine.start_run(run_a.id)
        engine.complete_run(
            run_a.id,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={"ikss_a": 1000.0},
        )
        engine.start_run(run_b.id)
        engine.complete_run(
            run_b.id,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={"ikss_a": 1200.0},
        )

        with pytest.raises(StudyCaseMismatchError):
            service.compute_comparison(
                study_case_id=case_a.id,
                base_run_id=run_a.id,
                other_run_id=run_b.id,
                base_scenario_id=uuid4(),
                other_scenario_id=uuid4(),
            )

    def test_comparison_rejects_wrong_study_case_id(self):
        """Comparison rejects when passed study_case_id doesn't match runs."""
        engine, case_id = _make_engine_with_case()
        service = ScComparisonService(engine)

        run_a = engine.create_run(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(0),
        )
        run_b = engine.create_run(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(1),
        )

        engine.start_run(run_a.id)
        engine.complete_run(
            run_a.id,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={},
        )
        engine.start_run(run_b.id)
        engine.complete_run(
            run_b.id,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={},
        )

        wrong_case_id = uuid4()
        with pytest.raises(StudyCaseMismatchError):
            service.compute_comparison(
                study_case_id=wrong_case_id,
                base_run_id=run_a.id,
                other_run_id=run_b.id,
                base_scenario_id=uuid4(),
                other_scenario_id=uuid4(),
            )


# =============================================================================
# test_run_not_done_rejected
# =============================================================================


class TestRunNotDoneRejected:
    """Test that non-DONE runs are rejected for comparison."""

    def test_pending_run_rejected(self):
        """Comparison rejects PENDING run."""
        engine, case_id = _make_engine_with_case()
        service = ScComparisonService(engine)

        run_a = engine.create_run(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(0),
        )
        run_b = engine.create_run(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(1),
        )

        # Only complete run_b
        engine.start_run(run_b.id)
        engine.complete_run(
            run_b.id,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={},
        )

        with pytest.raises(RunNotDoneError):
            service.compute_comparison(
                study_case_id=case_id,
                base_run_id=run_a.id,
                other_run_id=run_b.id,
                base_scenario_id=uuid4(),
                other_scenario_id=uuid4(),
            )

    def test_failed_run_rejected(self):
        """Comparison rejects FAILED run."""
        engine, case_id = _make_engine_with_case()
        service = ScComparisonService(engine)

        run_a = engine.create_run(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(0),
        )
        run_b = engine.create_run(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input=_sample_solver_input(1),
        )

        engine.start_run(run_a.id)
        engine.fail_run(run_a.id, "Solver error")

        engine.start_run(run_b.id)
        engine.complete_run(
            run_b.id,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={},
        )

        with pytest.raises(RunNotDoneError):
            service.compute_comparison(
                study_case_id=case_id,
                base_run_id=run_a.id,
                other_run_id=run_b.id,
                base_scenario_id=uuid4(),
                other_scenario_id=uuid4(),
            )


# =============================================================================
# Golden Fixture: 3 scenarios SC_3F, batch DONE, comparison correct
# =============================================================================


class TestGoldenFixture:
    """
    Golden fixture test: End-to-end batch + comparison workflow.

    3 SC_3F scenarios → batch DONE → comparison between scenario 0 and 1.
    """

    def test_golden_3_scenarios_batch_and_comparison(self):
        """Full golden fixture: 3 scenarios, batch DONE, comparison correct."""
        engine, case_id = _make_engine_with_case()
        batch_service = BatchExecutionService(engine)
        comparison_service = ScComparisonService(engine)

        # 3 scenarios with known solver inputs
        sid0, sid1, sid2 = uuid4(), uuid4(), uuid4()
        si0 = _sample_solver_input(0)
        si1 = _sample_solver_input(1)
        si2 = _sample_solver_input(2)

        # Create and execute batch
        batch = batch_service.create_batch_job(
            study_case_id=case_id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[sid0, sid1, sid2],
            scenario_content_hashes=["ch0", "ch1", "ch2"],
            solver_inputs=[si0, si1, si2],
        )

        assert batch.status == BatchJobStatus.PENDING
        assert len(batch.scenario_ids) == 3

        # Execute
        done_batch = batch_service.execute_batch(batch.batch_id)
        assert done_batch.status == BatchJobStatus.DONE
        assert len(done_batch.run_ids) == 3
        assert len(done_batch.result_set_ids) == 3
        assert len(done_batch.errors) == 0

        # Verify all runs are DONE
        for run_id in done_batch.run_ids:
            run = engine.get_run(run_id)
            assert run.status == RunStatus.DONE

        # Get first two run IDs for comparison
        run_id_0 = done_batch.run_ids[0]
        run_id_1 = done_batch.run_ids[1]

        # Retrieve scenario IDs in sorted order (they map to runs in order)
        sorted_sids = done_batch.scenario_ids

        # Create comparison
        comparison = comparison_service.compute_comparison(
            study_case_id=case_id,
            base_run_id=run_id_0,
            other_run_id=run_id_1,
            base_scenario_id=sorted_sids[0],
            other_scenario_id=sorted_sids[1],
        )

        assert isinstance(comparison, ShortCircuitComparison)
        assert comparison.study_case_id == case_id
        assert comparison.analysis_type == ExecutionAnalysisType.SC_3F
        assert len(comparison.input_hash) == 64

        # Verify hash stability
        h1 = comparison.input_hash
        comparison2 = comparison_service.compute_comparison(
            study_case_id=case_id,
            base_run_id=run_id_0,
            other_run_id=run_id_1,
            base_scenario_id=sorted_sids[0],
            other_scenario_id=sorted_sids[1],
        )
        assert comparison2.input_hash == h1

    def test_golden_batch_hash_determinism(self):
        """Golden fixture: batch hash is deterministic across creations."""
        engine, case_id = _make_engine_with_case()
        service = BatchExecutionService(engine)

        sid0, sid1, sid2 = uuid4(), uuid4(), uuid4()
        kwargs = {
            "study_case_id": case_id,
            "analysis_type": ExecutionAnalysisType.SC_3F,
            "scenario_ids": [sid0, sid1, sid2],
            "scenario_content_hashes": ["ch0", "ch1", "ch2"],
            "solver_inputs": [
                _sample_solver_input(0),
                _sample_solver_input(1),
                _sample_solver_input(2),
            ],
        }

        b1 = service.create_batch_job(**kwargs)
        b2 = service.create_batch_job(**kwargs)

        assert b1.batch_input_hash == b2.batch_input_hash
        assert b1.batch_id != b2.batch_id  # Different batch IDs


# =============================================================================
# BatchJob Domain Model Tests
# =============================================================================


class TestBatchJobDomain:
    """Test BatchJob domain model immutability and serialization."""

    def test_batch_job_is_frozen(self):
        """BatchJob is a frozen dataclass."""
        batch = new_batch_job(
            study_case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[uuid4()],
            scenario_content_hashes=["h1"],
        )
        with pytest.raises(AttributeError):
            batch.status = BatchJobStatus.RUNNING  # type: ignore[misc]

    def test_batch_job_to_dict_roundtrip(self):
        """to_dict → from_dict roundtrip preserves all fields."""
        batch = new_batch_job(
            study_case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[uuid4(), uuid4()],
            scenario_content_hashes=["h1", "h2"],
        )
        d = batch.to_dict()
        restored = BatchJob.from_dict(d)
        assert restored.batch_id == batch.batch_id
        assert restored.study_case_id == batch.study_case_id
        assert restored.analysis_type == batch.analysis_type
        assert restored.scenario_ids == batch.scenario_ids
        assert restored.status == batch.status
        assert restored.batch_input_hash == batch.batch_input_hash

    def test_batch_job_status_transitions(self):
        """BatchJob status transitions produce new instances."""
        batch = new_batch_job(
            study_case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=[uuid4()],
            scenario_content_hashes=["h1"],
        )
        assert batch.status == BatchJobStatus.PENDING

        running = batch.mark_running()
        assert running.status == BatchJobStatus.RUNNING
        assert batch.status == BatchJobStatus.PENDING  # Original unchanged

        rid = uuid4()
        done = running.mark_done(run_ids=(rid,), result_set_ids=(rid,))
        assert done.status == BatchJobStatus.DONE
        assert done.run_ids == (rid,)

        failed = running.mark_failed(errors=("test error",))
        assert failed.status == BatchJobStatus.FAILED
        assert failed.errors == ("test error",)


# =============================================================================
# API Tests
# =============================================================================


class TestBatchExecutionAPI:
    """Test that removed batch/comparison endpoints stay unavailable in production."""

    @pytest.fixture
    def client(self):
        """Fresh TestClient with clean state."""
        import api.batch_execution as batch_mod
        from api.main import app
        from fastapi.testclient import TestClient

        # Reset singletons
        batch_mod._batch_service = None
        batch_mod._comparison_service = None

        return TestClient(app)

    @pytest.fixture
    def engine(self):
        """Get and reset execution engine."""
        from api.execution_runs import get_engine

        eng = get_engine()
        eng._runs.clear()
        eng._result_sets.clear()
        eng._study_cases.clear()
        eng._case_runs.clear()
        return eng

    @pytest.fixture
    def registered_case(self, engine):
        """Register a study case and return its ID."""
        case = new_study_case(
            project_id=MOCK_PROJECT_ID,
            name="API test case",
            config=StudyCaseConfig(),
        )
        engine.register_study_case(case)
        return case.id

    def test_create_batch_api(self, client, engine, registered_case):
        """Batch creation endpoint is no longer mounted in the production app."""
        resp = client.post(
            f"/api/execution/study-cases/{registered_case}/batches",
            json={
                "analysis_type": "SC_3F",
                "scenarios": [
                    {
                        "scenario_id": str(uuid4()),
                        "content_hash": "ch1",
                        "solver_input": {"test": True},
                    },
                ],
            },
        )
        assert resp.status_code == 404

    def test_create_batch_invalid_case(self, client, engine):
        """Removed batch creation endpoint stays unavailable for any case_id."""
        resp = client.post(
            f"/api/execution/study-cases/{uuid4()}/batches",
            json={
                "analysis_type": "SC_3F",
                "scenarios": [
                    {
                        "scenario_id": str(uuid4()),
                        "content_hash": "ch1",
                        "solver_input": {},
                    },
                ],
            },
        )
        assert resp.status_code == 404

    def test_execute_batch_api(self, client, engine, registered_case):
        """Batch execute endpoint is no longer mounted in the production app."""
        exec_resp = client.post(f"/api/execution/batches/{uuid4()}/execute")
        assert exec_resp.status_code == 404

    def test_list_batches_api(self, client, engine, registered_case):
        """Batch listing endpoint is no longer mounted in the production app."""
        resp = client.get(f"/api/execution/study-cases/{registered_case}/batches")
        assert resp.status_code == 404

    def test_get_batch_api(self, client, engine, registered_case):
        """Batch read endpoint is no longer mounted in the production app."""
        resp = client.get(f"/api/execution/batches/{uuid4()}")
        assert resp.status_code == 404

    def test_get_batch_not_found(self, client, engine):
        """Removed batch read endpoint still returns 404."""
        resp = client.get(f"/api/execution/batches/{uuid4()}")
        assert resp.status_code == 404

    def test_comparison_api_workflow(self, client, engine, registered_case):
        """Removed comparison endpoints stay unavailable in the production app."""
        resp = client.post(
            f"/api/execution/study-cases/{registered_case}/comparisons",
            json={
                "base_run_id": str(uuid4()),
                "other_run_id": str(uuid4()),
                "base_scenario_id": str(uuid4()),
                "other_scenario_id": str(uuid4()),
            },
        )
        assert resp.status_code == 404
        get_resp = client.get(f"/api/execution/comparisons/{uuid4()}")
        assert get_resp.status_code == 404
