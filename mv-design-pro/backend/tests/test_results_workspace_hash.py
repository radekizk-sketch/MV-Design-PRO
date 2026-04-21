"""
Tests for Results Workspace Hash Determinism — PR-23

INVARIANTS VERIFIED:
- Identical data → identical hash (core determinism)
- Reordering runs → hash unchanged (sort-before-hash)
- Reordering batches → hash unchanged
- Reordering comparisons → hash unchanged
- Single value change → hash changed
- content_hash == deterministic_hash (same computation)
- source_*_ids sorted ascending
- compute_projection_hash() standalone function matches builder
- ProjectionMetadata carries version and timestamp
- Schema contract: all required keys present in to_dict()
- No None in fields where not explicitly allowed
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from application.read_models.results_workspace_projection import (
    PROJECTION_VERSION,
    ProjectionMetadata,
    _compute_content_hash,
    build_workspace_projection,
    compute_projection_hash,
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
# Tests: Hash Determinism (core)
# ---------------------------------------------------------------------------


class TestHashDeterminism:
    """PR-23 §1: Identical data → identical hash."""

    def test_identical_data_identical_hash(self) -> None:
        case_id = uuid4()
        r1 = _make_run(
            run_id=UUID("00000000-0000-0000-0000-000000000001"),
            study_case_id=case_id,
            started_at=datetime(2025, 1, 15, 10, 0, 0, tzinfo=UTC),
        )

        proj_a = build_workspace_projection(case_id, [r1], [], [])
        proj_b = build_workspace_projection(case_id, [r1], [], [])

        assert proj_a.content_hash == proj_b.content_hash
        assert len(proj_a.content_hash) == 64

    def test_content_hash_equals_deterministic_hash(self) -> None:
        case_id = uuid4()
        r1 = _make_run(study_case_id=case_id)
        proj = build_workspace_projection(case_id, [r1], [], [])

        assert proj.content_hash == proj.deterministic_hash

    def test_reorder_runs_hash_unchanged(self) -> None:
        """PR-23 §1.4: Changing order of runs does NOT change hash."""
        case_id = uuid4()
        r1 = _make_run(
            run_id=UUID("00000000-0000-0000-0000-000000000001"),
            study_case_id=case_id,
            started_at=datetime(2025, 1, 10, tzinfo=UTC),
        )
        r2 = _make_run(
            run_id=UUID("00000000-0000-0000-0000-000000000002"),
            study_case_id=case_id,
            started_at=datetime(2025, 1, 20, tzinfo=UTC),
        )

        proj_a = build_workspace_projection(case_id, [r1, r2], [], [])
        proj_b = build_workspace_projection(case_id, [r2, r1], [], [])

        assert proj_a.content_hash == proj_b.content_hash

    def test_reorder_batches_hash_unchanged(self) -> None:
        case_id = uuid4()
        b1 = _make_batch(
            batch_id=UUID("00000000-0000-0000-0000-000000000011"),
            study_case_id=case_id,
            created_at=datetime(2025, 1, 10, tzinfo=UTC),
        )
        b2 = _make_batch(
            batch_id=UUID("00000000-0000-0000-0000-000000000012"),
            study_case_id=case_id,
            created_at=datetime(2025, 1, 20, tzinfo=UTC),
        )

        proj_a = build_workspace_projection(case_id, [], [b1, b2], [])
        proj_b = build_workspace_projection(case_id, [], [b2, b1], [])

        assert proj_a.content_hash == proj_b.content_hash

    def test_reorder_comparisons_hash_unchanged(self) -> None:
        case_id = uuid4()
        c1 = _make_comparison(comparison_id="cmp-A", created_at="2025-01-10T00:00:00+00:00")
        c2 = _make_comparison(comparison_id="cmp-B", created_at="2025-01-20T00:00:00+00:00")

        proj_a = build_workspace_projection(case_id, [], [], [c1, c2])
        proj_b = build_workspace_projection(case_id, [], [], [c2, c1])

        assert proj_a.content_hash == proj_b.content_hash

    def test_single_value_change_hash_changes(self) -> None:
        case_id = uuid4()
        r1 = _make_run(solver_input_hash="hash_a")
        r2 = _make_run(solver_input_hash="hash_b")

        proj_a = build_workspace_projection(case_id, [r1], [], [])
        proj_b = build_workspace_projection(case_id, [r2], [], [])

        assert proj_a.content_hash != proj_b.content_hash

    def test_empty_projection_has_valid_hash(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        assert len(proj.content_hash) == 64
        assert proj.content_hash == proj.deterministic_hash

    def test_hash_is_sha256_hex(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        # SHA-256 hex digest: 64 hex characters
        assert len(proj.content_hash) == 64
        assert all(c in "0123456789abcdef" for c in proj.content_hash)


# ---------------------------------------------------------------------------
# Tests: compute_projection_hash (standalone)
# ---------------------------------------------------------------------------


class TestComputeProjectionHash:
    """PR-23 §1.3: Standalone hash function matches builder."""

    def test_standalone_matches_builder(self) -> None:
        case_id = uuid4()
        r = _make_run(study_case_id=case_id)
        b = _make_batch(study_case_id=case_id)
        c = _make_comparison()

        proj = build_workspace_projection(case_id, [r], [b], [c])

        standalone_hash = compute_projection_hash(
            study_case_id=proj.study_case_id,
            runs=proj.runs,
            batches=proj.batches,
            comparisons=proj.comparisons,
        )

        assert standalone_hash == proj.content_hash

    def test_empty_input_deterministic(self) -> None:
        h1 = compute_projection_hash("case-1", (), (), ())
        h2 = compute_projection_hash("case-1", (), (), ())
        assert h1 == h2
        assert len(h1) == 64

    def test_different_case_id_different_hash(self) -> None:
        h1 = compute_projection_hash("case-1", (), (), ())
        h2 = compute_projection_hash("case-2", (), (), ())
        assert h1 != h2


# ---------------------------------------------------------------------------
# Tests: Source ID tracking (PR-23)
# ---------------------------------------------------------------------------


class TestSourceIds:
    """PR-23 §1.1: source_*_ids sorted ascending."""

    def test_source_run_ids_sorted(self) -> None:
        case_id = uuid4()
        r1 = _make_run(
            run_id=UUID("00000000-0000-0000-0000-000000000003"),
            study_case_id=case_id,
            started_at=datetime(2025, 1, 10, tzinfo=UTC),
        )
        r2 = _make_run(
            run_id=UUID("00000000-0000-0000-0000-000000000001"),
            study_case_id=case_id,
            started_at=datetime(2025, 1, 20, tzinfo=UTC),
        )

        proj = build_workspace_projection(case_id, [r1, r2], [], [])

        # source_run_ids must be sorted ascending
        assert proj.source_run_ids == tuple(sorted(proj.source_run_ids))
        assert len(proj.source_run_ids) == 2

    def test_source_batch_ids_sorted(self) -> None:
        case_id = uuid4()
        b1 = _make_batch(
            batch_id=UUID("00000000-0000-0000-0000-000000000022"),
            study_case_id=case_id,
            created_at=datetime(2025, 1, 10, tzinfo=UTC),
        )
        b2 = _make_batch(
            batch_id=UUID("00000000-0000-0000-0000-000000000011"),
            study_case_id=case_id,
            created_at=datetime(2025, 1, 20, tzinfo=UTC),
        )

        proj = build_workspace_projection(case_id, [], [b1, b2], [])

        assert proj.source_batch_ids == tuple(sorted(proj.source_batch_ids))
        assert len(proj.source_batch_ids) == 2

    def test_source_comparison_ids_sorted(self) -> None:
        case_id = uuid4()
        c1 = _make_comparison(comparison_id="cmp-Z", created_at="2025-01-10T00:00:00+00:00")
        c2 = _make_comparison(comparison_id="cmp-A", created_at="2025-01-20T00:00:00+00:00")

        proj = build_workspace_projection(case_id, [], [], [c1, c2])

        assert proj.source_comparison_ids == tuple(sorted(proj.source_comparison_ids))
        assert len(proj.source_comparison_ids) == 2

    def test_empty_source_ids(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])

        assert proj.source_run_ids == ()
        assert proj.source_batch_ids == ()
        assert proj.source_comparison_ids == ()


# ---------------------------------------------------------------------------
# Tests: ProjectionMetadata
# ---------------------------------------------------------------------------


class TestProjectionMetadata:
    """PR-23: Metadata audit trail."""

    def test_projection_has_metadata(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])

        assert proj.metadata is not None
        assert proj.metadata.projection_version == PROJECTION_VERSION
        assert proj.metadata.created_utc != ""

    def test_metadata_version_matches_constant(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        assert proj.metadata.projection_version == "1.0.0"

    def test_metadata_to_dict(self) -> None:
        meta = ProjectionMetadata(
            projection_version="1.0.0",
            created_utc="2025-01-15T10:00:00Z",
        )
        d = meta.to_dict()
        assert d["projection_version"] == "1.0.0"
        assert d["created_utc"] == "2025-01-15T10:00:00Z"

    def test_metadata_in_projection_to_dict(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()

        assert "metadata" in d
        assert "projection_version" in d["metadata"]
        assert "created_utc" in d["metadata"]


# ---------------------------------------------------------------------------
# Tests: Schema Contract Freeze (PR-23 §2)
# ---------------------------------------------------------------------------


REQUIRED_TOP_LEVEL_KEYS = {
    "study_case_id",
    "runs",
    "batches",
    "comparisons",
    "latest_done_run_id",
    "deterministic_hash",
    "content_hash",
    "source_run_ids",
    "source_batch_ids",
    "source_comparison_ids",
    "metadata",
}


class TestSchemaContractFreeze:
    """PR-23 §2: API contract — exactly these keys, no more, no fewer."""

    def test_to_dict_has_all_required_keys(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()

        assert set(d.keys()) == REQUIRED_TOP_LEVEL_KEYS

    def test_to_dict_no_extra_keys(self) -> None:
        case_id = uuid4()
        r = _make_run(study_case_id=case_id)
        b = _make_batch(study_case_id=case_id)
        c = _make_comparison()

        proj = build_workspace_projection(case_id, [r], [b], [c])
        d = proj.to_dict()

        extra = set(d.keys()) - REQUIRED_TOP_LEVEL_KEYS
        assert extra == set(), f"Unexpected keys: {extra}"

    def test_runs_is_list(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()
        assert isinstance(d["runs"], list)

    def test_batches_is_list(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()
        assert isinstance(d["batches"], list)

    def test_comparisons_is_list(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()
        assert isinstance(d["comparisons"], list)

    def test_source_run_ids_is_list(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()
        assert isinstance(d["source_run_ids"], list)

    def test_source_batch_ids_is_list(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()
        assert isinstance(d["source_batch_ids"], list)

    def test_source_comparison_ids_is_list(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()
        assert isinstance(d["source_comparison_ids"], list)

    def test_metadata_is_dict(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()
        assert isinstance(d["metadata"], dict)

    def test_content_hash_is_string(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()
        assert isinstance(d["content_hash"], str)
        assert len(d["content_hash"]) == 64

    def test_study_case_id_is_string(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()
        assert isinstance(d["study_case_id"], str)

    def test_deterministic_hash_is_string(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()
        assert isinstance(d["deterministic_hash"], str)
        assert len(d["deterministic_hash"]) == 64

    def test_latest_done_run_id_is_string_or_none(self) -> None:
        case_id = uuid4()
        proj = build_workspace_projection(case_id, [], [], [])
        d = proj.to_dict()
        assert d["latest_done_run_id"] is None or isinstance(d["latest_done_run_id"], str)


# ---------------------------------------------------------------------------
# Tests: _compute_content_hash internals
# ---------------------------------------------------------------------------


class TestComputeContentHashInternal:
    """Verify the hash function itself."""

    def test_same_dict_same_hash(self) -> None:
        d = {"a": 1, "b": "hello"}
        assert _compute_content_hash(d) == _compute_content_hash(d)

    def test_key_order_irrelevant(self) -> None:
        """JSON sort_keys=True makes key order irrelevant."""
        d1 = {"b": 2, "a": 1}
        d2 = {"a": 1, "b": 2}
        assert _compute_content_hash(d1) == _compute_content_hash(d2)

    def test_different_values_different_hash(self) -> None:
        d1 = {"a": 1}
        d2 = {"a": 2}
        assert _compute_content_hash(d1) != _compute_content_hash(d2)

    def test_hash_length_is_64(self) -> None:
        h = _compute_content_hash({"test": True})
        assert len(h) == 64

    def test_hash_is_hex(self) -> None:
        h = _compute_content_hash({"test": True})
        assert all(c in "0123456789abcdef" for c in h)
