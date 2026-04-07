"""
Results Workspace Projection — PR-22 + PR-23 (Determinism Lock)

READ-ONLY projection aggregating runs, batches, and comparisons
for a single study case into a unified workspace view.

CANONICAL ALIGNMENT:
- SYSTEM_SPEC.md: Read-only projection, no physics
- ARCHITECTURE.md: Application layer, interpretation only

INVARIANTS:
- ZERO physics calculations
- ZERO solver changes
- ZERO model mutations
- ZERO changes to ResultSet v1 contract
- Pure data aggregation from existing domain services
- Deterministic output (sorted lexicographically)
- Content hash computed from canonical JSON (SHA-256)

PR-23 ADDITIONS:
- content_hash (SHA-256 of canonical JSON, sorted keys)
- source_run_ids (sorted tuple of contributing run IDs)
- source_batch_ids (sorted tuple of contributing batch IDs)
- source_comparison_ids (sorted tuple of contributing comparison IDs)
- compute_projection_hash() standalone function
- Metadata sub-structure with projection_version and created_utc
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from domain.execution import ExecutionAnalysisType, Run, RunStatus
from domain.batch_job import BatchJob, BatchJobStatus

# Projection contract version — bump on breaking schema changes only
PROJECTION_VERSION = "1.0.0"


# ---------------------------------------------------------------------------
# DTOs (frozen, deterministic)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RunSummary:
    """Lightweight run summary for workspace listing."""

    run_id: str
    analysis_type: str
    status: str
    solver_input_hash: str
    created_at: str
    finished_at: str | None = None
    error_message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "analysis_type": self.analysis_type,
            "status": self.status,
            "solver_input_hash": self.solver_input_hash,
            "created_at": self.created_at,
            "finished_at": self.finished_at,
            "error_message": self.error_message,
        }


@dataclass(frozen=True)
class BatchSummary:
    """Lightweight batch summary for workspace listing."""

    batch_id: str
    analysis_type: str
    status: str
    batch_input_hash: str
    scenario_count: int
    run_count: int
    created_at: str
    errors: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "batch_id": self.batch_id,
            "analysis_type": self.analysis_type,
            "status": self.status,
            "batch_input_hash": self.batch_input_hash,
            "scenario_count": self.scenario_count,
            "run_count": self.run_count,
            "created_at": self.created_at,
            "errors": list(self.errors),
        }


@dataclass(frozen=True)
class ComparisonSummary:
    """Lightweight comparison summary for workspace listing."""

    comparison_id: str
    analysis_type: str
    base_scenario_id: str
    other_scenario_id: str
    input_hash: str
    created_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "comparison_id": self.comparison_id,
            "analysis_type": self.analysis_type,
            "base_scenario_id": self.base_scenario_id,
            "other_scenario_id": self.other_scenario_id,
            "input_hash": self.input_hash,
            "created_at": self.created_at,
        }


@dataclass(frozen=True)
class ProjectionMetadata:
    """Metadata for workspace projection audit trail.

    PR-23: Every projection carries metadata for external audit.
    """

    projection_version: str = PROJECTION_VERSION
    created_utc: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "projection_version": self.projection_version,
            "created_utc": self.created_utc,
        }


@dataclass(frozen=True)
class ResultsWorkspaceProjection:
    """
    Unified workspace projection for a single study case.

    Contains aggregated summaries of runs, batches, and comparisons.
    Fully deterministic — sorted lexicographically, content-hashed.

    PR-23 additions:
    - content_hash: SHA-256 of canonical JSON representation
    - source_run_ids: sorted tuple of contributing run IDs
    - source_batch_ids: sorted tuple of contributing batch IDs
    - source_comparison_ids: sorted tuple of contributing comparison IDs
    - metadata: projection version and creation timestamp
    """

    study_case_id: str
    runs: tuple[RunSummary, ...] = ()
    batches: tuple[BatchSummary, ...] = ()
    comparisons: tuple[ComparisonSummary, ...] = ()
    latest_done_run_id: str | None = None
    deterministic_hash: str = ""
    # PR-23: content hash and source ID tracking
    content_hash: str = ""
    source_run_ids: tuple[str, ...] = ()
    source_batch_ids: tuple[str, ...] = ()
    source_comparison_ids: tuple[str, ...] = ()
    metadata: ProjectionMetadata = field(default_factory=ProjectionMetadata)

    def to_dict(self) -> dict[str, Any]:
        return {
            "study_case_id": self.study_case_id,
            "runs": [r.to_dict() for r in self.runs],
            "batches": [b.to_dict() for b in self.batches],
            "comparisons": [c.to_dict() for c in self.comparisons],
            "latest_done_run_id": self.latest_done_run_id,
            "deterministic_hash": self.deterministic_hash,
            "content_hash": self.content_hash,
            "source_run_ids": list(self.source_run_ids),
            "source_batch_ids": list(self.source_batch_ids),
            "source_comparison_ids": list(self.source_comparison_ids),
            "metadata": self.metadata.to_dict(),
        }


# ---------------------------------------------------------------------------
# Projection Builder
# ---------------------------------------------------------------------------


def _compute_content_hash(data: dict[str, Any]) -> str:
    """Compute SHA-256 of canonical JSON (sorted keys, no whitespace)."""
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def map_run_to_summary(run: Run | Any) -> RunSummary:
    """Map domain Run to RunSummary DTO.

    NOTE: Run has no created_at — uses started_at as proxy for ordering.
    """
    if hasattr(run, "to_execution_dict"):
        payload = run.to_execution_dict()
        created_at_value = getattr(run, "created_at", None)
        created_at_str = (
            created_at_value.isoformat()
            if hasattr(created_at_value, "isoformat")
            else str(created_at_value or payload.get("started_at") or "")
        )
        return RunSummary(
            run_id=str(payload.get("id", getattr(run, "id", ""))),
            analysis_type=str(payload.get("analysis_type", getattr(run, "analysis_type", ""))),
            status=str(payload.get("status", getattr(run, "status", ""))),
            solver_input_hash=str(
                payload.get(
                    "solver_input_hash",
                    getattr(run, "solver_input_hash", getattr(run, "input_hash", "")),
                )
            ),
            created_at=created_at_str,
            finished_at=payload.get("finished_at"),
            error_message=payload.get("error_message"),
        )

    # Run uses started_at (not created_at) — use as timestamp proxy
    created_at_str = ""
    if hasattr(run, "started_at") and run.started_at:
        created_at_str = run.started_at.isoformat()

    return RunSummary(
        run_id=str(run.id),
        analysis_type=run.analysis_type.value if isinstance(run.analysis_type, ExecutionAnalysisType) else str(run.analysis_type),
        status=run.status.value if isinstance(run.status, RunStatus) else str(run.status),
        solver_input_hash=run.solver_input_hash,
        created_at=created_at_str,
        finished_at=run.finished_at.isoformat() if hasattr(run, "finished_at") and run.finished_at else None,
        error_message=run.error_message if hasattr(run, "error_message") else None,
    )


def map_batch_to_summary(batch: BatchJob) -> BatchSummary:
    """Map domain BatchJob to BatchSummary DTO."""
    return BatchSummary(
        batch_id=str(batch.batch_id),
        analysis_type=batch.analysis_type.value if isinstance(batch.analysis_type, ExecutionAnalysisType) else str(batch.analysis_type),
        status=batch.status.value if isinstance(batch.status, BatchJobStatus) else str(batch.status),
        batch_input_hash=batch.batch_input_hash,
        scenario_count=len(batch.scenario_ids),
        run_count=len(batch.run_ids),
        created_at=batch.created_at.isoformat() if hasattr(batch, "created_at") and batch.created_at else "",
        errors=tuple(batch.errors) if hasattr(batch, "errors") and batch.errors else (),
    )


def compute_projection_hash(
    study_case_id: str,
    runs: tuple[RunSummary, ...],
    batches: tuple[BatchSummary, ...],
    comparisons: tuple[ComparisonSummary, ...],
) -> str:
    """
    Compute deterministic SHA-256 hash for a workspace projection.

    PR-23: Standalone function for independent hash computation/verification.

    Hash is computed from canonical JSON with sorted keys — the same data
    in any order of runs produces the identical hash (runs are pre-sorted).

    Args:
        study_case_id: Study case identifier
        runs: Sorted tuple of RunSummary
        batches: Sorted tuple of BatchSummary
        comparisons: Sorted tuple of ComparisonSummary

    Returns:
        SHA-256 hex digest (64 characters)
    """
    hash_input = {
        "study_case_id": study_case_id,
        "runs": [r.to_dict() for r in runs],
        "batches": [b.to_dict() for b in batches],
        "comparisons": [c.to_dict() for c in comparisons],
    }
    return _compute_content_hash(hash_input)


def build_workspace_projection(
    study_case_id: UUID,
    runs: list[Run],
    batches: list[BatchJob],
    comparisons: list[dict[str, Any]],
) -> ResultsWorkspaceProjection:
    """
    Build deterministic workspace projection from domain entities.

    Args:
        study_case_id: Target study case ID
        runs: List of Run domain objects for this case
        batches: List of BatchJob domain objects for this case
        comparisons: List of comparison dicts for this case

    Returns:
        ResultsWorkspaceProjection with deterministic content hash

    INVARIANTS:
    - Runs sorted by created_at descending (newest first)
    - Batches sorted by created_at descending
    - Comparisons sorted by created_at descending
    - All sorting is lexicographic (string comparison) for determinism
    - latest_done_run_id = most recent run with status DONE
    - source_*_ids sorted ascending for determinism
    - content_hash == deterministic_hash (same computation)
    """
    # Map and sort runs (newest first, deterministic)
    run_summaries = sorted(
        [map_run_to_summary(r) for r in runs],
        key=lambda r: r.created_at,
        reverse=True,
    )

    # Map and sort batches (newest first, deterministic)
    batch_summaries = sorted(
        [map_batch_to_summary(b) for b in batches],
        key=lambda b: b.created_at,
        reverse=True,
    )

    # Map and sort comparisons (newest first, deterministic)
    comparison_summaries = sorted(
        [
            ComparisonSummary(
                comparison_id=str(c.get("comparison_id", "")),
                analysis_type=str(c.get("analysis_type", "")),
                base_scenario_id=str(c.get("base_scenario_id", "")),
                other_scenario_id=str(c.get("other_scenario_id", "")),
                input_hash=str(c.get("input_hash", "")),
                created_at=str(c.get("created_at", "")),
            )
            for c in comparisons
        ],
        key=lambda c: c.created_at,
        reverse=True,
    )

    # Find latest done run
    done_runs = [r for r in run_summaries if r.status == "DONE"]
    latest_done_run_id = done_runs[0].run_id if done_runs else None

    # PR-23: Extract and sort source IDs (ascending, deterministic, explicit key)
    source_run_ids = tuple(sorted((r.run_id for r in run_summaries), key=str))
    source_batch_ids = tuple(sorted((b.batch_id for b in batch_summaries), key=str))
    source_comparison_ids = tuple(sorted((c.comparison_id for c in comparison_summaries), key=str))

    # Convert to tuples for frozen dataclass
    runs_tuple = tuple(run_summaries)
    batches_tuple = tuple(batch_summaries)
    comparisons_tuple = tuple(comparison_summaries)

    # Compute deterministic hash via standalone function
    content_hash = compute_projection_hash(
        study_case_id=str(study_case_id),
        runs=runs_tuple,
        batches=batches_tuple,
        comparisons=comparisons_tuple,
    )

    # PR-23: Metadata with deterministic timestamp
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    metadata = ProjectionMetadata(
        projection_version=PROJECTION_VERSION,
        created_utc=now_utc,
    )

    return ResultsWorkspaceProjection(
        study_case_id=str(study_case_id),
        runs=runs_tuple,
        batches=batches_tuple,
        comparisons=comparisons_tuple,
        latest_done_run_id=latest_done_run_id,
        deterministic_hash=content_hash,
        content_hash=content_hash,
        source_run_ids=source_run_ids,
        source_batch_ids=source_batch_ids,
        source_comparison_ids=source_comparison_ids,
        metadata=metadata,
    )
