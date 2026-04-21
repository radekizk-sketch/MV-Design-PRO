"""
Tests for Results Workspace Projection — PR-22

INVARIANTS VERIFIED:
- Determinism: same input → same hash
- Sorting: lexicographic descending by started_at
- No physics: pure data aggregation
- Content hash stability
- latest_done_run_id correctness
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from application.read_models.results_workspace_projection import (
    build_workspace_projection,
    map_batch_to_summary,
    map_run_to_summary,
)
from domain.batch_job import BatchJob, BatchJobStatus
from domain.execution import ExecutionAnalysisType, Run, RunStatus

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_run(
    run_id: UUID | None = None,
    study_case_id: UUID | None = None,
    analysis_type: ExecutionAnalysisType = ExecutionAnalysisType.SC_3F,
    status: RunStatus = RunStatus.DONE,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
    solver_input_hash: str = "abc123",
) -> Run:
    """Create a test Run. Uses started_at as ordering proxy (Run has no created_at)."""
    return Run(
        id=run_id or uuid4(),
        study_case_id=study_case_id or uuid4(),
        analysis_type=analysis_type,
        solver_input_hash=solver_input_hash,
        status=status,
        started_at=started_at or datetime(2025, 1, 15, 10, 0, 0, tzinfo=UTC),
        finished_at=finished_at,
    )


def _make_batch(
    batch_id: UUID | None = None,
    study_case_id: UUID | None = None,
    analysis_type: ExecutionAnalysisType = ExecutionAnalysisType.SC_3F,
    status: BatchJobStatus = BatchJobStatus.DONE,
    created_at: datetime | None = None,
    scenario_ids: tuple[UUID, ...] | None = None,
    run_ids: tuple[UUID, ...] = (),
) -> BatchJob:
    """Create a test BatchJob. scenario_ids must be UUIDs per domain model."""
    if scenario_ids is None:
        scenario_ids = (uuid4(), uuid4())
    return BatchJob(
        batch_id=batch_id or uuid4(),
        study_case_id=study_case_id or uuid4(),
        analysis_type=analysis_type,
        scenario_ids=scenario_ids,
        batch_input_hash="batch_hash_123",
        status=status,
        created_at=created_at or datetime(2025, 1, 15, 10, 0, 0, tzinfo=UTC),
        run_ids=run_ids,
        result_set_ids=(),
        errors=(),
    )


def _make_comparison(
    comparison_id: str = "cmp-1",
    analysis_type: str = "SC_3F",
    created_at: str = "2025-01-15T10:00:00+00:00",
) -> dict:
    return {
        "comparison_id": comparison_id,
        "analysis_type": analysis_type,
        "base_scenario_id": "scenario_a",
        "other_scenario_id": "scenario_b",
        "input_hash": "cmp_hash_123",
        "created_at": created_at,
    }


# ---------------------------------------------------------------------------
# Tests: map_run_to_summary
# ---------------------------------------------------------------------------


class TestMapRunToSummary:
    def test_maps_done_run(self) -> None:
        run = _make_run(status=RunStatus.DONE)
        summary = map_run_to_summary(run)

        assert summary.run_id == str(run.id)
        assert summary.analysis_type == "SC_3F"
        assert summary.status == "DONE"
        assert summary.solver_input_hash == "abc123"

    def test_maps_failed_run(self) -> None:
        run = _make_run(status=RunStatus.FAILED)
        summary = map_run_to_summary(run)
        assert summary.status == "FAILED"

    def test_maps_pending_run(self) -> None:
        run = _make_run(status=RunStatus.PENDING)
        summary = map_run_to_summary(run)
        assert summary.status == "PENDING"

    def test_to_dict_roundtrip(self) -> None:
        run = _make_run()
        summary = map_run_to_summary(run)
        d = summary.to_dict()
        assert d["run_id"] == summary.run_id
        assert d["status"] == "DONE"
        assert d["analysis_type"] == "SC_3F"

    def test_uses_started_at_as_created_at(self) -> None:
        ts = datetime(2025, 3, 1, 12, 0, 0, tzinfo=UTC)
        run = _make_run(started_at=ts)
        summary = map_run_to_summary(run)
        assert summary.created_at == ts.isoformat()


# ---------------------------------------------------------------------------
# Tests: map_batch_to_summary
# ---------------------------------------------------------------------------


class TestMapBatchToSummary:
    def test_maps_done_batch(self) -> None:
        sids = (uuid4(), uuid4(), uuid4())
        batch = _make_batch(scenario_ids=sids)
        summary = map_batch_to_summary(batch)

        assert summary.batch_id == str(batch.batch_id)
        assert summary.analysis_type == "SC_3F"
        assert summary.status == "DONE"
        assert summary.scenario_count == 3
        assert summary.run_count == 0

    def test_to_dict_roundtrip(self) -> None:
        batch = _make_batch()
        summary = map_batch_to_summary(batch)
        d = summary.to_dict()
        assert d["batch_id"] == summary.batch_id
        assert d["scenario_count"] == 2


# ---------------------------------------------------------------------------
# Tests: build_workspace_projection
# ---------------------------------------------------------------------------


class TestBuildWorkspaceProjection:
    def test_empty_case(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])

        assert proj.study_case_id == str(case_id)
        assert proj.runs == ()
        assert proj.batches == ()
        assert proj.comparisons == ()
        assert proj.latest_done_run_id is None
        assert len(proj.deterministic_hash) == 64  # SHA-256

    def test_runs_sorted_descending(self) -> None:
        case_id = uuid4()
        r1 = _make_run(
            study_case_id=case_id,
            started_at=datetime(2025, 1, 10, tzinfo=UTC),
        )
        r2 = _make_run(
            study_case_id=case_id,
            started_at=datetime(2025, 1, 20, tzinfo=UTC),
        )

        proj = build_workspace_projection(case_id, [r1, r2], [], [])

        # r2 (Jan 20) should come first (newest)
        assert proj.runs[0].created_at > proj.runs[1].created_at

    def test_latest_done_run_id(self) -> None:
        case_id = uuid4()
        r1 = _make_run(
            study_case_id=case_id,
            status=RunStatus.DONE,
            started_at=datetime(2025, 1, 10, tzinfo=UTC),
        )
        r2 = _make_run(
            study_case_id=case_id,
            status=RunStatus.DONE,
            started_at=datetime(2025, 1, 20, tzinfo=UTC),
        )
        r3 = _make_run(
            study_case_id=case_id,
            status=RunStatus.FAILED,
            started_at=datetime(2025, 1, 25, tzinfo=UTC),
        )

        proj = build_workspace_projection(case_id, [r1, r2, r3], [], [])

        # Latest DONE run is r2 (Jan 20)
        assert proj.latest_done_run_id == str(r2.id)

    def test_latest_done_run_id_none_when_no_done(self) -> None:
        case_id = uuid4()
        r1 = _make_run(status=RunStatus.PENDING)

        proj = build_workspace_projection(case_id, [r1], [], [])
        assert proj.latest_done_run_id is None

    def test_deterministic_hash_stability(self) -> None:
        """Same input must produce same hash — core invariant."""
        case_id = uuid4()
        r1 = _make_run(
            run_id=UUID("00000000-0000-0000-0000-000000000001"),
            study_case_id=case_id,
            solver_input_hash="hash_a",
            started_at=datetime(2025, 1, 15, 10, 0, 0, tzinfo=UTC),
        )

        proj_a = build_workspace_projection(case_id, [r1], [], [])
        proj_b = build_workspace_projection(case_id, [r1], [], [])

        assert proj_a.deterministic_hash == proj_b.deterministic_hash
        assert len(proj_a.deterministic_hash) == 64

    def test_different_input_different_hash(self) -> None:
        case_id = uuid4()
        r1 = _make_run(solver_input_hash="hash_a")
        r2 = _make_run(solver_input_hash="hash_b")

        proj_a = build_workspace_projection(case_id, [r1], [], [])
        proj_b = build_workspace_projection(case_id, [r2], [], [])

        assert proj_a.deterministic_hash != proj_b.deterministic_hash

    def test_with_batches(self) -> None:
        case_id = uuid4()
        b = _make_batch(study_case_id=case_id)

        proj = build_workspace_projection(case_id, [], [b], [])

        assert len(proj.batches) == 1
        assert proj.batches[0].batch_id == str(b.batch_id)

    def test_with_comparisons(self) -> None:
        case_id = uuid4()
        cmp = _make_comparison()

        proj = build_workspace_projection(case_id, [], [], [cmp])

        assert len(proj.comparisons) == 1
        assert proj.comparisons[0].comparison_id == "cmp-1"

    def test_full_projection(self) -> None:
        case_id = uuid4()
        r = _make_run(study_case_id=case_id)
        b = _make_batch(study_case_id=case_id)
        cmp = _make_comparison()

        proj = build_workspace_projection(case_id, [r], [b], [cmp])

        assert len(proj.runs) == 1
        assert len(proj.batches) == 1
        assert len(proj.comparisons) == 1
        assert proj.latest_done_run_id == str(r.id)

    def test_to_dict_structure(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()

        assert "study_case_id" in d
        assert "runs" in d
        assert "batches" in d
        assert "comparisons" in d
        assert "latest_done_run_id" in d
        assert "deterministic_hash" in d
        assert "content_hash" in d
        assert "source_run_ids" in d
        assert "source_batch_ids" in d
        assert "source_comparison_ids" in d
        assert "metadata" in d
        assert isinstance(d["runs"], list)
        assert isinstance(d["batches"], list)
        assert isinstance(d["comparisons"], list)
        assert isinstance(d["source_run_ids"], list)
        assert isinstance(d["source_batch_ids"], list)
        assert isinstance(d["source_comparison_ids"], list)
        assert isinstance(d["metadata"], dict)


# ---------------------------------------------------------------------------
# Tests: No solver input changes
# ---------------------------------------------------------------------------


class TestNoSolverChanges:
    """Verify projection does not touch solver data."""

    def test_projection_does_not_modify_run(self) -> None:
        run = _make_run()
        original_hash = run.solver_input_hash

        map_run_to_summary(run)

        assert run.solver_input_hash == original_hash

    def test_projection_does_not_modify_batch(self) -> None:
        batch = _make_batch()
        original_hash = batch.batch_input_hash

        map_batch_to_summary(batch)

        assert batch.batch_input_hash == original_hash
