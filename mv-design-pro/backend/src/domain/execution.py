"""
Execution Layer Domain Models — PR-14: StudyCase → Run → ResultSet

CANONICAL ALIGNMENT:
- Solver NEVER called directly from UI
- Every result tied to a deterministic run_id
- SLD overlays (future PR) consume ResultSet exclusively
- Multi-run, comparison, audit-ready architecture

DOMAIN ENTITIES:
- RunStatus: PENDING → RUNNING → DONE | FAILED
- ExecutionAnalysisType: SC_3F, SC_1F, LOAD_FLOW
- Run: Immutable calculation execution record
- ResultSet: Immutable calculation results tied to a Run
- ElementResult: Per-element typed result

INVARIANTS:
- Run is IMMUTABLE after creation (frozen dataclass)
- ResultSet is IMMUTABLE (frozen dataclass)
- solver_input_hash = SHA-256 of canonical builder output
- ZERO randomness: identical ENM → identical hash → identical result
- deterministic_signature = SHA-256 of sorted result JSON
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class RunStatus(StrEnum):
    """Run lifecycle status."""

    PENDING = "PENDING"
    RUNNING = "RUNNING"
    DONE = "DONE"
    FAILED = "FAILED"


class ExecutionAnalysisType(StrEnum):
    """Analysis types supported by the execution layer."""

    SC_3F = "SC_3F"
    SC_1F = "SC_1F"
    SC_2F = "SC_2F"
    SC_2F_G = "SC_2F_G"
    LOAD_FLOW = "LOAD_FLOW"
    PHASE_STATE_SN = "PHASE_STATE_SN"
    DYNAMIC_STABILITY = "DYNAMIC_STABILITY"
    SOURCE_COMPLIANCE = "SOURCE_COMPLIANCE"
    PROTECTION = "PROTECTION"


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Run:
    """
    Run — a concrete calculation execution (PR-14).

    INVARIANTS:
    - Immutable after creation (frozen dataclass)
    - solver_input_hash is SHA-256 of canonical solver-input JSON
    - Uniquely identifies: study_case_id + analysis_type + solver_input_hash
    - status tracks lifecycle: PENDING → RUNNING → DONE | FAILED
    """

    id: UUID
    study_case_id: UUID
    analysis_type: ExecutionAnalysisType
    solver_input_hash: str
    status: RunStatus = RunStatus.PENDING
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_message: str | None = None

    def with_status(
        self,
        status: RunStatus,
        *,
        started_at: datetime | None = None,
        finished_at: datetime | None = None,
        error_message: str | None = None,
    ) -> Run:
        """Create new Run with updated status (immutable transition)."""
        return Run(
            id=self.id,
            study_case_id=self.study_case_id,
            analysis_type=self.analysis_type,
            solver_input_hash=self.solver_input_hash,
            status=status,
            started_at=started_at or self.started_at,
            finished_at=finished_at or self.finished_at,
            error_message=error_message or self.error_message,
        )

    def mark_running(self) -> Run:
        """Transition to RUNNING status."""
        return self.with_status(
            RunStatus.RUNNING,
            started_at=datetime.now(UTC),
        )

    def mark_done(self) -> Run:
        """Transition to DONE status."""
        return self.with_status(
            RunStatus.DONE,
            finished_at=datetime.now(UTC),
        )

    def mark_failed(self, error_message: str) -> Run:
        """Transition to FAILED status."""
        return self.with_status(
            RunStatus.FAILED,
            finished_at=datetime.now(UTC),
            error_message=error_message,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses."""
        return {
            "id": str(self.id),
            "study_case_id": str(self.study_case_id),
            "analysis_type": self.analysis_type.value,
            "solver_input_hash": self.solver_input_hash,
            "status": self.status.value,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "error_message": self.error_message,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Run:
        """Deserialize from dictionary."""
        return cls(
            id=UUID(data["id"]),
            study_case_id=UUID(data["study_case_id"]),
            analysis_type=ExecutionAnalysisType(data["analysis_type"]),
            solver_input_hash=data["solver_input_hash"],
            status=RunStatus(data["status"]),
            started_at=(
                datetime.fromisoformat(data["started_at"]) if data.get("started_at") else None
            ),
            finished_at=(
                datetime.fromisoformat(data["finished_at"]) if data.get("finished_at") else None
            ),
            error_message=data.get("error_message"),
        )


# ---------------------------------------------------------------------------
# ElementResult
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ElementResult:
    """
    Per-element typed result.

    Maps element_ref → analysis-specific result data.
    Immutable, deterministic.

    V12S-011: element_ref_id (additive, Optional) carries the stable ENM ref_id
    so the FE can resolve results without a UUID reverse-lookup.
    """

    element_ref: str
    element_type: str
    values: dict[str, Any] = field(default_factory=dict)
    # V12S-011: stable ENM ref_id, populated by result_mapping layer (None for legacy rows)
    element_ref_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "element_ref": self.element_ref,
            "element_type": self.element_type,
            "values": self.values,
        }
        if self.element_ref_id is not None:
            result["element_ref_id"] = self.element_ref_id
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ElementResult:
        return cls(
            element_ref=data["element_ref"],
            element_type=data["element_type"],
            values=data.get("values", {}),
            element_ref_id=data.get("element_ref_id"),
        )


# ---------------------------------------------------------------------------
# ResultSet
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ResultSet:
    """
    ResultSet — immutable calculation results tied to a Run (PR-14).

    INVARIANTS:
    - Immutable (frozen dataclass)
    - run_id is BINDING — ResultSet belongs to exactly one Run
    - deterministic_signature = SHA-256 of canonical result JSON
    - validation_snapshot captures validation state at run time
    - readiness_snapshot captures readiness state at run time
    - element_results maps element_ref → typed result
    - global_results stores analysis-wide summary values
    """

    run_id: UUID
    analysis_type: ExecutionAnalysisType
    validation_snapshot: dict[str, Any] = field(default_factory=dict)
    readiness_snapshot: dict[str, Any] = field(default_factory=dict)
    element_results: tuple[ElementResult, ...] = field(default_factory=tuple)
    global_results: dict[str, Any] = field(default_factory=dict)
    deterministic_signature: str = ""
    # PR-19: Fault scenario reference (additive, v1.1 — no contract break)
    fault_scenario_id: str | None = None
    fault_type: str | None = None
    fault_location: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses."""
        result: dict[str, Any] = {
            "run_id": str(self.run_id),
            "analysis_type": self.analysis_type.value,
            "validation_snapshot": self.validation_snapshot,
            "readiness_snapshot": self.readiness_snapshot,
            "element_results": [er.to_dict() for er in self.element_results],
            "global_results": self.global_results,
            "deterministic_signature": self.deterministic_signature,
        }
        # PR-19 fields (only included when set)
        if self.fault_scenario_id is not None:
            result["fault_scenario_id"] = self.fault_scenario_id
        if self.fault_type is not None:
            result["fault_type"] = self.fault_type
        if self.fault_location is not None:
            result["fault_location"] = self.fault_location
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ResultSet:
        """Deserialize from dictionary."""
        return cls(
            run_id=UUID(data["run_id"]),
            analysis_type=ExecutionAnalysisType(data["analysis_type"]),
            validation_snapshot=data.get("validation_snapshot", {}),
            readiness_snapshot=data.get("readiness_snapshot", {}),
            element_results=tuple(
                ElementResult.from_dict(er) for er in data.get("element_results", [])
            ),
            global_results=data.get("global_results", {}),
            deterministic_signature=data.get("deterministic_signature", ""),
            fault_scenario_id=data.get("fault_scenario_id"),
            fault_type=data.get("fault_type"),
            fault_location=data.get("fault_location"),
        )


# ---------------------------------------------------------------------------
# Factory Functions
# ---------------------------------------------------------------------------


def new_run(
    study_case_id: UUID,
    analysis_type: ExecutionAnalysisType,
    solver_input_hash: str,
) -> Run:
    """Create a new Run in PENDING status."""
    return Run(
        id=uuid4(),
        study_case_id=study_case_id,
        analysis_type=analysis_type,
        solver_input_hash=solver_input_hash,
        status=RunStatus.PENDING,
    )


def compute_solver_input_hash(solver_input_json: dict[str, Any]) -> str:
    """
    Compute deterministic SHA-256 hash of solver input.

    INVARIANT: Identical solver input → identical hash.

    Process:
    1. Recursively sort all dict keys
    2. Sort deterministic list keys by stable key
    3. Serialize to canonical JSON (sorted, compact separators)
    4. SHA-256 the UTF-8 bytes
    """
    canonical = _canonicalize(solver_input_json)
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def compute_result_signature(result_data: dict[str, Any]) -> str:
    """
    Compute deterministic SHA-256 signature of result data.

    Used to verify result reproducibility.
    """
    canonical = _canonicalize(result_data)
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_result_set(
    *,
    run_id: UUID,
    analysis_type: ExecutionAnalysisType,
    validation_snapshot: dict[str, Any],
    readiness_snapshot: dict[str, Any],
    element_results: list[ElementResult],
    global_results: dict[str, Any],
    fault_scenario_id: str | None = None,
    fault_type: str | None = None,
    fault_location: dict[str, Any] | None = None,
) -> ResultSet:
    """
    Build a ResultSet with computed deterministic signature.

    Sorts element_results by element_ref for determinism.
    PR-19: Optionally includes fault scenario reference fields.
    """
    sorted_results = tuple(sorted(element_results, key=lambda er: er.element_ref))

    # Build signature from canonical representation
    sig_data = {
        "run_id": str(run_id),
        "analysis_type": analysis_type.value,
        "element_results": [er.to_dict() for er in sorted_results],
        "global_results": global_results,
    }
    signature = compute_result_signature(sig_data)

    return ResultSet(
        run_id=run_id,
        analysis_type=analysis_type,
        validation_snapshot=validation_snapshot,
        readiness_snapshot=readiness_snapshot,
        element_results=sorted_results,
        global_results=global_results,
        deterministic_signature=signature,
        fault_scenario_id=fault_scenario_id,
        fault_type=fault_type,
        fault_location=fault_location,
    )


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------

_DETERMINISTIC_LIST_KEYS = {
    "buses",
    "branches",
    "transformers",
    "inverter_sources",
    "switches",
    "element_results",
    "nodes",
    "relay_results",
    "test_points",
    "target_ref_mapping",
    "margin_points",
    "pairs",
}


def _canonicalize(value: Any, *, current_key: str | None = None) -> Any:
    """Recursively canonicalize a JSON-like structure for deterministic hashing."""
    if isinstance(value, dict):
        return {key: _canonicalize(value[key], current_key=key) for key in sorted(value.keys())}
    if isinstance(value, list):
        items = [_canonicalize(item, current_key=current_key) for item in value]
        if current_key in _DETERMINISTIC_LIST_KEYS:
            return sorted(items, key=_stable_sort_key)
        return items
    return value


def _stable_sort_key(item: Any) -> str:
    """Stable sort key for deterministic list ordering."""
    if isinstance(item, dict):
        for key in (
            "ref_id",
            "id",
            "element_ref",
            "node_id",
            "branch_id",
            "relay_id",
            "point_id",
            "pair_id",
        ):
            if key in item and item[key] is not None:
                return str(item[key])
    return str(item)
