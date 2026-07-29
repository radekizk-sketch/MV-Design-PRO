"""
Study Case Engine — Deterministic Execution, Versioning, and Delta Overlay

CANONICAL ALIGNMENT:
- StudyCaseEngine orchestrates case lifecycle: create, execute, clone, compare
- StudyCase frozen dataclass with snapshot_ref, scenario_type, operating mode
- StudyCaseRunResult is immutable after execution
- ComparisonResult is a pure function output (no side effects)
- Determinism enforced: same input → same determinism_hash

INVARIANTS:
- Case CANNOT mutate NetworkModel (config entity only)
- snapshot_ref is immutable after case creation
- scenario_type is immutable after case creation
- Results are immutable after execution
- compare_runs is a pure function (no side effects, no mutations)
- Clone creates new case with NONE status, no results copied

RESULT STATUS LIFECYCLE:
- NONE: No calculations performed
- FRESH: Results are current (calculated after last model/config change)
- OUTDATED: Results need recalculation (model or config changed)

WHITE BOX RULE:
- All execution traces are stored in StudyCaseRunResult.white_box_trace
- Every run includes a determinism_hash for reproducibility verification
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Protocol
from uuid import uuid4

# =============================================================================
# Enums
# =============================================================================


class ScenarioType(StrEnum):
    """
    Scenario type for study case calculations.

    Aligned with IEC 60909 fault types and power flow analysis.
    """

    SC_3F = "SC_3F"  # Three-phase short circuit
    SC_1F = "SC_1F"  # Single-phase to ground
    SC_2F = "SC_2F"  # Phase-to-phase short circuit
    LOAD_FLOW = "LOAD_FLOW"  # Power flow analysis
    PROTECTION = "PROTECTION"  # Protection coordination


class OperatingMode(StrEnum):
    """
    Operating mode for study case calculations.

    Defines the network topology state used for calculations.
    """

    NORMAL = "NORMAL"  # Normal operating conditions
    N_1 = "N_1"  # N-1 contingency analysis
    MAINTENANCE = "MAINTENANCE"  # Maintenance outage scenario


class ResultStatus(StrEnum):
    """Result status for a study case (industrial-grade)."""

    NONE = "NONE"  # No calculations performed
    FRESH = "FRESH"  # Results are current
    OUTDATED = "OUTDATED"  # Results need recalculation


class ComparisonVerdict(StrEnum):
    """Verdict from comparing two runs."""

    IDENTICAL = "IDENTICAL"  # No meaningful difference
    MINOR_DIFF = "MINOR_DIFF"  # Small differences within tolerance
    MAJOR_DIFF = "MAJOR_DIFF"  # Significant differences


# =============================================================================
# Configuration (frozen, immutable)
# =============================================================================


@dataclass(frozen=True)
class StudyCaseConfig:
    """
    Study case calculation configuration.

    Contains ONLY calculation parameters, NOT network topology.
    Immutable — changes create new config instances.
    """

    # Short-circuit analysis parameters
    c_factor_max: float = 1.10
    c_factor_min: float = 0.95

    # Power flow parameters
    base_mva: float = 100.0
    max_iterations: int = 50
    tolerance: float = 1e-6

    # Analysis options
    include_motor_contribution: bool = True
    include_inverter_contribution: bool = True
    thermal_time_seconds: float = 1.0

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for storage and hashing."""
        return {
            "c_factor_max": self.c_factor_max,
            "c_factor_min": self.c_factor_min,
            "base_mva": self.base_mva,
            "max_iterations": self.max_iterations,
            "tolerance": self.tolerance,
            "include_motor_contribution": self.include_motor_contribution,
            "include_inverter_contribution": self.include_inverter_contribution,
            "thermal_time_seconds": self.thermal_time_seconds,
        }


# =============================================================================
# StudyCase (frozen, immutable after creation)
# =============================================================================


@dataclass(frozen=True)
class StudyCase:
    """
    Study Case entity — configuration for calculations.

    INVARIANTS:
    - StudyCase is a configuration entity, NOT a domain entity
    - Never mutates NetworkModel
    - Contains only calculation parameters and scenario binding
    - snapshot_ref and scenario_type are immutable after creation
    - Results belong to the case, not to the model
    """

    study_case_id: str
    snapshot_ref: str  # Hash of network snapshot (immutable)
    scenario_type: ScenarioType  # Type of calculation (immutable)
    mode: OperatingMode  # Operating mode
    catalog_version_lock: str  # Catalog version at creation time
    config: StudyCaseConfig  # Calculation parameters
    status: ResultStatus  # Current result status
    created_at: datetime  # Timestamp of creation

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses."""
        return {
            "study_case_id": self.study_case_id,
            "snapshot_ref": self.snapshot_ref,
            "scenario_type": self.scenario_type.value,
            "mode": self.mode.value,
            "catalog_version_lock": self.catalog_version_lock,
            "config": self.config.to_dict(),
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
        }


# =============================================================================
# StudyCaseRunResult (frozen, immutable after execution)
# =============================================================================


@dataclass(frozen=True)
class StudyCaseRunResult:
    """
    Immutable result of a study case execution.

    INVARIANTS:
    - Immutable after execution (frozen dataclass)
    - determinism_hash enables reproducibility verification
    - white_box_trace stores all calculation steps for audit
    - results dict contains the full solver output
    """

    run_id: str
    case_id: str
    snapshot_hash: str
    results: dict[str, Any]
    white_box_trace: tuple[dict[str, Any], ...]
    executed_at: datetime
    determinism_hash: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses."""
        return {
            "run_id": self.run_id,
            "case_id": self.case_id,
            "snapshot_hash": self.snapshot_hash,
            "results": self.results,
            "white_box_trace": list(self.white_box_trace),
            "executed_at": self.executed_at.isoformat(),
            "determinism_hash": self.determinism_hash,
        }


# =============================================================================
# Delta value for comparison (frozen)
# =============================================================================


@dataclass(frozen=True)
class DeltaValue:
    """
    Single metric difference between two runs.

    INVARIANT: Pure numeric comparison, no physics interpretation.
    """

    metric_name: str
    value_a: float
    value_b: float
    abs_diff: float
    rel_diff_pct: float | None  # None if value_a == 0

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "metric_name": self.metric_name,
            "value_a": self.value_a,
            "value_b": self.value_b,
            "abs_diff": self.abs_diff,
            "rel_diff_pct": self.rel_diff_pct,
        }


# =============================================================================
# ComparisonResult (frozen, pure function output)
# =============================================================================


@dataclass(frozen=True)
class ComparisonResult:
    """
    Result of comparing two study case runs.

    INVARIANTS:
    - 100% read-only, no mutations, no side effects
    - Pure function output from compare_runs
    - verdict derived deterministically from delta_values
    """

    run_a_id: str
    run_b_id: str
    delta_values: tuple[DeltaValue, ...]
    verdict: ComparisonVerdict

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses."""
        return {
            "run_a_id": self.run_a_id,
            "run_b_id": self.run_b_id,
            "delta_values": [dv.to_dict() for dv in self.delta_values],
            "verdict": self.verdict.value,
        }


# =============================================================================
# Solver Protocol (dependency inversion)
# =============================================================================


class SolverProtocol(Protocol):
    """
    Protocol for solvers that can be plugged into the engine.

    Solvers MUST:
    - Accept snapshot_ref, scenario_type, mode, and config
    - Return a results dict and a white_box_trace list
    - Be deterministic: same input → same output
    """

    def execute(
        self,
        snapshot_ref: str,
        scenario_type: ScenarioType,
        mode: OperatingMode,
        config: StudyCaseConfig,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """
        Execute solver calculation.

        Returns:
            Tuple of (results_dict, white_box_trace)
        """
        ...


# =============================================================================
# Determinism hash computation
# =============================================================================


def compute_determinism_hash(results: dict[str, Any]) -> str:
    """
    Compute a deterministic hash of solver results.

    Uses canonical JSON serialization (sorted keys, consistent float formatting)
    to ensure same results always produce the same hash.

    Returns:
        64-character hex string (SHA-256)
    """
    canonical = json.dumps(
        _canonicalize_for_hash(results),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _canonicalize_for_hash(value: Any) -> Any:
    """
    Canonicalize a value for deterministic hashing.

    - Dicts: sort keys
    - Floats: round to 10 decimal places
    - Lists/tuples: preserve order, canonicalize elements
    """
    if isinstance(value, dict):
        return {k: _canonicalize_for_hash(v) for k, v in sorted(value.items())}
    elif isinstance(value, list | tuple):
        return [_canonicalize_for_hash(item) for item in value]
    elif isinstance(value, float):
        rounded = round(value, 10)
        if rounded == int(rounded):
            return int(rounded)
        return rounded
    return value


# =============================================================================
# StudyCaseEngine
# =============================================================================


class StudyCaseEngine:
    """
    Engine for study case lifecycle management.

    Responsibilities:
    - create_case: Create a new study case bound to a snapshot
    - execute_case: Run solver and produce immutable results
    - clone_case: Copy case with NONE status, no results
    - compare_runs: Pure function comparing two run results

    INVARIANTS:
    - Case snapshot_ref and scenario_type are immutable after creation
    - Results are immutable after execution
    - compare_runs is a pure function (no side effects)
    - Determinism: same input → same determinism_hash
    """

    def __init__(self, solver: SolverProtocol) -> None:
        """
        Initialize engine with a solver implementation.

        Args:
            solver: Solver that implements SolverProtocol
        """
        self._solver = solver

    def create_case(
        self,
        snapshot_ref: str,
        scenario_type: ScenarioType,
        config: StudyCaseConfig | None = None,
        mode: OperatingMode = OperatingMode.NORMAL,
        catalog_version_lock: str = "1.0.0",
    ) -> StudyCase:
        """
        Create a new study case bound to a network snapshot.

        Args:
            snapshot_ref: Hash of the network snapshot (immutable binding)
            scenario_type: Type of calculation to perform
            config: Calculation configuration (defaults to standard values)
            mode: Operating mode (defaults to NORMAL)
            catalog_version_lock: Catalog version at creation time

        Returns:
            New StudyCase with status NONE
        """
        return StudyCase(
            study_case_id=str(uuid4()),
            snapshot_ref=snapshot_ref,
            scenario_type=scenario_type,
            mode=mode,
            catalog_version_lock=catalog_version_lock,
            config=config or StudyCaseConfig(),
            status=ResultStatus.NONE,
            created_at=datetime.now(UTC),
        )

    def execute_case(self, case: StudyCase) -> StudyCaseRunResult:
        """
        Execute a study case and produce immutable results.

        Calls the solver with the case's configuration and wraps the
        output in an immutable StudyCaseRunResult with determinism hash.

        Args:
            case: StudyCase to execute

        Returns:
            Immutable StudyCaseRunResult with results, trace, and determinism hash
        """
        results, trace = self._solver.execute(
            snapshot_ref=case.snapshot_ref,
            scenario_type=case.scenario_type,
            mode=case.mode,
            config=case.config,
        )

        determinism_hash = compute_determinism_hash(results)

        return StudyCaseRunResult(
            run_id=str(uuid4()),
            case_id=case.study_case_id,
            snapshot_hash=case.snapshot_ref,
            results=results,
            white_box_trace=tuple(trace),
            executed_at=datetime.now(UTC),
            determinism_hash=determinism_hash,
        )

    def clone_case(self, case: StudyCase) -> StudyCase:
        """
        Clone a study case with new ID and NONE status.

        CLONING RULES (canonical-style):
        - Configuration is copied (including mode, scenario_type)
        - snapshot_ref is copied (same snapshot binding)
        - catalog_version_lock is copied
        - Results are NOT copied (status = NONE)
        - New unique study_case_id is assigned

        Args:
            case: Source StudyCase to clone

        Returns:
            New StudyCase with NONE status and no results
        """
        return StudyCase(
            study_case_id=str(uuid4()),
            snapshot_ref=case.snapshot_ref,
            scenario_type=case.scenario_type,
            mode=case.mode,
            catalog_version_lock=case.catalog_version_lock,
            config=case.config,
            status=ResultStatus.NONE,
            created_at=datetime.now(UTC),
        )

    @staticmethod
    def compare_runs(
        run_a: StudyCaseRunResult,
        run_b: StudyCaseRunResult,
        tolerance: float = 1e-9,
        minor_threshold_pct: float = 1.0,
    ) -> ComparisonResult:
        """
        Compare two run results (pure function, no side effects).

        Extracts all numeric metrics from both results, computes absolute
        and relative differences, and determines a verdict.

        Args:
            run_a: First run result
            run_b: Second run result
            tolerance: Absolute tolerance for IDENTICAL verdict
            minor_threshold_pct: Relative threshold for MINOR_DIFF vs MAJOR_DIFF

        Returns:
            ComparisonResult with delta values and verdict

        INVARIANT: This is a pure function — no mutations, no side effects.
        """
        flat_a = _flatten_numeric(run_a.results)
        flat_b = _flatten_numeric(run_b.results)

        all_keys = sorted(set(flat_a.keys()) | set(flat_b.keys()))

        deltas: list[DeltaValue] = []
        for key in all_keys:
            val_a = flat_a.get(key, 0.0)
            val_b = flat_b.get(key, 0.0)
            abs_diff = abs(val_b - val_a)

            if abs(val_a) < tolerance:
                rel_diff_pct = None
            else:
                rel_diff_pct = (abs_diff / abs(val_a)) * 100.0

            deltas.append(
                DeltaValue(
                    metric_name=key,
                    value_a=val_a,
                    value_b=val_b,
                    abs_diff=abs_diff,
                    rel_diff_pct=rel_diff_pct,
                )
            )

        verdict = _determine_verdict(
            deltas, tolerance=tolerance, minor_threshold_pct=minor_threshold_pct
        )

        return ComparisonResult(
            run_a_id=run_a.run_id,
            run_b_id=run_b.run_id,
            delta_values=tuple(deltas),
            verdict=verdict,
        )

    @staticmethod
    def invalidate_case(case: StudyCase) -> StudyCase:
        """
        Mark a case as OUTDATED due to model or config change.

        INVALIDATION RULES:
        - If status is NONE, keep as NONE (no results to invalidate)
        - If status is FRESH, mark as OUTDATED
        - If status is already OUTDATED, no change

        Args:
            case: StudyCase to invalidate

        Returns:
            New StudyCase with OUTDATED status (or unchanged if NONE)
        """
        if case.status == ResultStatus.NONE:
            return case

        return StudyCase(
            study_case_id=case.study_case_id,
            snapshot_ref=case.snapshot_ref,
            scenario_type=case.scenario_type,
            mode=case.mode,
            catalog_version_lock=case.catalog_version_lock,
            config=case.config,
            status=ResultStatus.OUTDATED,
            created_at=case.created_at,
        )


# =============================================================================
# Helper functions (module-private)
# =============================================================================


def _flatten_numeric(
    data: dict[str, Any],
    prefix: str = "",
) -> dict[str, float]:
    """
    Flatten a nested dict, extracting only numeric values.

    Keys are joined with '.' separators. Non-numeric values are skipped.

    Args:
        data: Dictionary to flatten
        prefix: Key prefix for recursion

    Returns:
        Flat dictionary of {dotted_key: float_value}
    """
    result: dict[str, float] = {}
    for key, value in sorted(data.items()):
        full_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, int | float) and not isinstance(value, bool):
            result[full_key] = float(value)
        elif isinstance(value, dict):
            result.update(_flatten_numeric(value, full_key))
    return result


def _determine_verdict(
    deltas: list[DeltaValue],
    tolerance: float = 1e-9,
    minor_threshold_pct: float = 1.0,
) -> ComparisonVerdict:
    """
    Determine comparison verdict from delta values.

    Rules:
    - IDENTICAL: All absolute differences are within tolerance
    - MINOR_DIFF: All relative differences are below minor_threshold_pct
    - MAJOR_DIFF: At least one relative difference exceeds minor_threshold_pct

    Args:
        deltas: List of DeltaValue comparisons
        tolerance: Absolute tolerance for IDENTICAL
        minor_threshold_pct: Percentage threshold for MINOR vs MAJOR

    Returns:
        ComparisonVerdict enum value
    """
    if not deltas:
        return ComparisonVerdict.IDENTICAL

    # Check if all are identical within tolerance
    all_identical = all(dv.abs_diff <= tolerance for dv in deltas)
    if all_identical:
        return ComparisonVerdict.IDENTICAL

    # Check if any has major difference
    for dv in deltas:
        if dv.rel_diff_pct is not None and dv.rel_diff_pct > minor_threshold_pct:
            return ComparisonVerdict.MAJOR_DIFF

    return ComparisonVerdict.MINOR_DIFF
