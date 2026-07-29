"""
Batch Job Domain Model — PR-20: Deterministic Batch Execution

CANONICAL ALIGNMENT:
- Orchestration layer — ZERO solver modifications
- ZERO ResultSet API changes
- ZERO heuristics, ZERO nondeterminism
- Sequential execution only (v1)

DOMAIN ENTITY:
- BatchJobStatus: PENDING → RUNNING → DONE | FAILED
- BatchJob: Immutable batch execution record

INVARIANTS:
- scenario_ids sorted lexicographically (UUID string sort)
- No duplicate scenario_ids
- batch_input_hash = SHA-256(sorted JSON of analysis_type + scenario_ids + content_hashes)
- ZERO randomness
- ZERO parallelism (v1 = SEQUENTIAL)
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from domain.execution import ExecutionAnalysisType


class BatchJobStatus(StrEnum):
    """Batch job lifecycle status."""

    PENDING = "PENDING"
    RUNNING = "RUNNING"
    DONE = "DONE"
    FAILED = "FAILED"


@dataclass(frozen=True)
class BatchJob:
    """
    BatchJob — deterministic batch execution of multiple FaultScenarios (PR-20).

    INVARIANTS:
    - Immutable after creation (frozen dataclass)
    - scenario_ids sorted lexicographically
    - No duplicate scenario_ids
    - batch_input_hash is deterministic SHA-256
    - ZERO parallelism (v1 = sequential)
    """

    batch_id: UUID
    study_case_id: UUID
    analysis_type: ExecutionAnalysisType
    scenario_ids: tuple[UUID, ...]
    created_at: datetime
    status: BatchJobStatus
    batch_input_hash: str
    run_ids: tuple[UUID, ...] = field(default_factory=tuple)
    result_set_ids: tuple[UUID, ...] = field(default_factory=tuple)
    errors: tuple[str, ...] = field(default_factory=tuple)

    def with_status(
        self,
        status: BatchJobStatus,
        *,
        run_ids: tuple[UUID, ...] | None = None,
        result_set_ids: tuple[UUID, ...] | None = None,
        errors: tuple[str, ...] | None = None,
    ) -> BatchJob:
        """Create new BatchJob with updated status (immutable transition)."""
        return BatchJob(
            batch_id=self.batch_id,
            study_case_id=self.study_case_id,
            analysis_type=self.analysis_type,
            scenario_ids=self.scenario_ids,
            created_at=self.created_at,
            status=status,
            batch_input_hash=self.batch_input_hash,
            run_ids=run_ids if run_ids is not None else self.run_ids,
            result_set_ids=result_set_ids if result_set_ids is not None else self.result_set_ids,
            errors=errors if errors is not None else self.errors,
        )

    def mark_running(self) -> BatchJob:
        """Transition to RUNNING status."""
        return self.with_status(BatchJobStatus.RUNNING)

    def mark_done(
        self,
        *,
        run_ids: tuple[UUID, ...],
        result_set_ids: tuple[UUID, ...],
    ) -> BatchJob:
        """Transition to DONE status with collected results."""
        return self.with_status(
            BatchJobStatus.DONE,
            run_ids=run_ids,
            result_set_ids=result_set_ids,
        )

    def mark_failed(
        self,
        *,
        errors: tuple[str, ...],
        run_ids: tuple[UUID, ...] | None = None,
        result_set_ids: tuple[UUID, ...] | None = None,
    ) -> BatchJob:
        """Transition to FAILED status with error details."""
        return self.with_status(
            BatchJobStatus.FAILED,
            run_ids=run_ids if run_ids is not None else self.run_ids,
            result_set_ids=result_set_ids if result_set_ids is not None else self.result_set_ids,
            errors=errors,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses."""
        return {
            "batch_id": str(self.batch_id),
            "study_case_id": str(self.study_case_id),
            "analysis_type": self.analysis_type.value,
            "scenario_ids": [str(sid) for sid in self.scenario_ids],
            "created_at": self.created_at.isoformat(),
            "status": self.status.value,
            "batch_input_hash": self.batch_input_hash,
            "run_ids": [str(rid) for rid in self.run_ids],
            "result_set_ids": [str(rsid) for rsid in self.result_set_ids],
            "errors": list(self.errors),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BatchJob:
        """Deserialize from dictionary."""
        return cls(
            batch_id=UUID(data["batch_id"]),
            study_case_id=UUID(data["study_case_id"]),
            analysis_type=ExecutionAnalysisType(data["analysis_type"]),
            scenario_ids=tuple(UUID(sid) for sid in data["scenario_ids"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            status=BatchJobStatus(data["status"]),
            batch_input_hash=data["batch_input_hash"],
            run_ids=tuple(UUID(rid) for rid in data.get("run_ids", [])),
            result_set_ids=tuple(UUID(rsid) for rsid in data.get("result_set_ids", [])),
            errors=tuple(data.get("errors", [])),
        )


# ---------------------------------------------------------------------------
# Factory Functions
# ---------------------------------------------------------------------------


def compute_batch_input_hash(
    analysis_type: ExecutionAnalysisType,
    scenario_ids: tuple[UUID, ...],
    scenario_content_hashes: tuple[str, ...],
) -> str:
    """
    Compute deterministic SHA-256 hash for batch input.

    INVARIANT: Identical batch parameters -> identical hash.

    Process:
    1. Build canonical JSON with sorted scenario data
    2. SHA-256 the UTF-8 bytes

    Args:
        analysis_type: The analysis type for the batch.
        scenario_ids: Sorted tuple of scenario UUIDs.
        scenario_content_hashes: Content hashes per scenario (same order as scenario_ids).

    Returns:
        SHA-256 hex digest string.
    """
    scenarios = []
    for sid, chash in zip(scenario_ids, scenario_content_hashes, strict=False):
        scenarios.append({"scenario_id": str(sid), "content_hash": chash})
    scenarios.sort(key=lambda s: s["scenario_id"])

    canonical = {
        "analysis_type": analysis_type.value,
        "scenarios": scenarios,
    }
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def new_batch_job(
    study_case_id: UUID,
    analysis_type: ExecutionAnalysisType,
    scenario_ids: list[UUID],
    scenario_content_hashes: list[str],
) -> BatchJob:
    """
    Create a new BatchJob in PENDING status.

    INVARIANTS:
    - scenario_ids sorted lexicographically
    - No duplicate scenario_ids
    - batch_input_hash computed deterministically

    Args:
        study_case_id: The study case this batch belongs to.
        analysis_type: The analysis type for all scenarios.
        scenario_ids: List of scenario UUIDs (will be sorted).
        scenario_content_hashes: Content hashes corresponding to scenario_ids.

    Returns:
        New BatchJob in PENDING status.

    Raises:
        ValueError: If duplicate scenario_ids or mismatched lengths.
    """
    if len(scenario_ids) != len(scenario_content_hashes):
        raise ValueError("scenario_ids i scenario_content_hashes muszą mieć tę samą długość")

    if len(set(scenario_ids)) != len(scenario_ids):
        raise ValueError("scenario_ids zawiera duplikaty")

    # Sort by UUID string for deterministic ordering
    paired = sorted(
        zip(scenario_ids, scenario_content_hashes, strict=False),
        key=lambda p: str(p[0]),
    )
    sorted_ids = tuple(p[0] for p in paired)
    sorted_hashes = tuple(p[1] for p in paired)

    batch_input_hash = compute_batch_input_hash(
        analysis_type=analysis_type,
        scenario_ids=sorted_ids,
        scenario_content_hashes=sorted_hashes,
    )

    return BatchJob(
        batch_id=uuid4(),
        study_case_id=study_case_id,
        analysis_type=analysis_type,
        scenario_ids=sorted_ids,
        created_at=datetime.now(UTC),
        status=BatchJobStatus.PENDING,
        batch_input_hash=batch_input_hash,
    )
