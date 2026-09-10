"""
Protection Comparison Domain Model — P15b SELECTIVITY (A/B)

CANONICAL ALIGNMENT:
- P15b: Protection Selectivity Comparison (A/B)
- Consumes: Two ProtectionAnalysisRun results (must be FINISHED)
- Produces: ProtectionComparisonResult + ProtectionComparisonTrace (deterministic)

INVARIANTS (BINDING):
1. READ-ONLY: Zero physics calculations, zero state mutations
2. SAME PROJECT: Both runs must belong to the same project
3. FINISHED ONLY: Both runs must be FINISHED status
4. DETERMINISTIC: Same inputs → identical outputs

NOT IN SCOPE:
- IEC 60255 selectivity coordination
- Zones, grading, time discrimination
- Normative interpretation (only factual comparison)
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum, StrEnum
from typing import Any

# =============================================================================
# ENUMS AND TYPES
# =============================================================================


class StateChange(StrEnum):
    """
    Protection state change between Run A and Run B.

    Describes how the trip state changed for a given element/fault pair.
    """

    NO_CHANGE = "NO_CHANGE"  # Same state in both runs
    TRIP_TO_NO_TRIP = "TRIP_TO_NO_TRIP"  # Was TRIPS in A, NO_TRIP in B (REGRESSION)
    NO_TRIP_TO_TRIP = "NO_TRIP_TO_TRIP"  # Was NO_TRIP in A, TRIPS in B (IMPROVEMENT)
    INVALID_CHANGE = "INVALID_CHANGE"  # One or both states are INVALID


class IssueCode(StrEnum):
    """
    Issue codes for protection comparison ranking.

    Technical, factual issue classification without normative interpretation.
    """

    TRIP_LOST = "TRIP_LOST"  # Device no longer trips (was TRIPS, now NO_TRIP)
    TRIP_GAINED = "TRIP_GAINED"  # Device now trips (was NO_TRIP, now TRIPS)
    DELAY_INCREASED = "DELAY_INCREASED"  # Trip time increased significantly
    DELAY_DECREASED = "DELAY_DECREASED"  # Trip time decreased significantly
    INVALID_STATE = "INVALID_STATE"  # Invalid evaluation state in one or both
    MARGIN_DECREASED = "MARGIN_DECREASED"  # Safety margin decreased
    MARGIN_INCREASED = "MARGIN_INCREASED"  # Safety margin increased


class IssueSeverity(int, Enum):
    """
    Issue severity scale (1–5).

    1 = Informational (no action required)
    2 = Minor (review recommended)
    3 = Moderate (attention required)
    4 = Major (action required)
    5 = Critical (immediate action required)
    """

    INFORMATIONAL = 1
    MINOR = 2
    MODERATE = 3
    MAJOR = 4
    CRITICAL = 5


# Issue severity mapping (deterministic)
ISSUE_SEVERITY_MAP: dict[IssueCode, IssueSeverity] = {
    IssueCode.TRIP_LOST: IssueSeverity.CRITICAL,
    IssueCode.INVALID_STATE: IssueSeverity.MAJOR,
    IssueCode.DELAY_INCREASED: IssueSeverity.MODERATE,
    IssueCode.MARGIN_DECREASED: IssueSeverity.MODERATE,
    IssueCode.TRIP_GAINED: IssueSeverity.MINOR,
    IssueCode.DELAY_DECREASED: IssueSeverity.MINOR,
    IssueCode.MARGIN_INCREASED: IssueSeverity.INFORMATIONAL,
}

# Polish descriptions for issues (deterministic)
ISSUE_DESCRIPTIONS_PL: dict[IssueCode, str] = {
    IssueCode.TRIP_LOST: "Utrata zadziałania zabezpieczenia",
    IssueCode.TRIP_GAINED: "Pojawienie się zadziałania zabezpieczenia",
    IssueCode.DELAY_INCREASED: "Wydłużenie czasu zadziałania",
    IssueCode.DELAY_DECREASED: "Skrócenie czasu zadziałania",
    IssueCode.INVALID_STATE: "Nieprawidłowy stan ewaluacji",
    IssueCode.MARGIN_DECREASED: "Zmniejszenie marginesu bezpieczeństwa",
    IssueCode.MARGIN_INCREASED: "Zwiększenie marginesu bezpieczeństwa",
}


# =============================================================================
# COMPARISON ROW (PER ELEMENT/FAULT)
# =============================================================================


@dataclass(frozen=True)
class ProtectionComparisonRow:
    """
    Single row in protection comparison — one (element, fault) pair.

    Compares the evaluation from Run A with Run B.

    Attributes:
        protected_element_ref: ID of protected element (bus/branch)
        fault_target_id: ID of fault location
        device_id_a: Device ID in Run A
        device_id_b: Device ID in Run B (may differ if device renamed)
        trip_state_a: Trip state from Run A (TRIPS/NO_TRIP/INVALID)
        trip_state_b: Trip state from Run B
        t_trip_s_a: Trip time from Run A [s] (None if NO_TRIP/INVALID)
        t_trip_s_b: Trip time from Run B [s]
        i_fault_a_a: Fault current from Run A [A] (None if element not evaluated in Run A)
        i_fault_a_b: Fault current from Run B [A] (None if element not evaluated in Run B)
        delta_t_s: Time difference (B - A) [s] (None if not both TRIPS)
        delta_i_fault_a: Current difference (B - A) [A] (None if either side not evaluated)
        margin_percent_a: Margin from Run A [%]
        margin_percent_b: Margin from Run B [%]
        state_change: Classification of state change

    FAB-E (E1): i_fault_a_a/i_fault_a_b/delta_i_fault_a to ``| None`` — element
    nieobecny w run A LUB run B (eval_a/eval_b brak) daje None, nigdy
    fabrykowane 0.0 A, co wyglądałoby jak realny zanik prądu zwarciowego.
    """

    protected_element_ref: str
    fault_target_id: str
    device_id_a: str
    device_id_b: str
    trip_state_a: str
    trip_state_b: str
    t_trip_s_a: float | None
    t_trip_s_b: float | None
    i_fault_a_a: float | None
    i_fault_a_b: float | None
    delta_t_s: float | None
    delta_i_fault_a: float | None
    margin_percent_a: float | None
    margin_percent_b: float | None
    state_change: StateChange

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "protected_element_ref": self.protected_element_ref,
            "fault_target_id": self.fault_target_id,
            "device_id_a": self.device_id_a,
            "device_id_b": self.device_id_b,
            "trip_state_a": self.trip_state_a,
            "trip_state_b": self.trip_state_b,
            "t_trip_s_a": self.t_trip_s_a,
            "t_trip_s_b": self.t_trip_s_b,
            "i_fault_a_a": self.i_fault_a_a,
            "i_fault_a_b": self.i_fault_a_b,
            "delta_t_s": self.delta_t_s,
            "delta_i_fault_a": self.delta_i_fault_a,
            "margin_percent_a": self.margin_percent_a,
            "margin_percent_b": self.margin_percent_b,
            "state_change": self.state_change.value,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionComparisonRow:
        """Deserialize from dict."""
        return cls(
            protected_element_ref=str(data["protected_element_ref"]),
            fault_target_id=str(data["fault_target_id"]),
            device_id_a=str(data["device_id_a"]),
            device_id_b=str(data["device_id_b"]),
            trip_state_a=str(data["trip_state_a"]),
            trip_state_b=str(data["trip_state_b"]),
            t_trip_s_a=float(data["t_trip_s_a"]) if data.get("t_trip_s_a") is not None else None,
            t_trip_s_b=float(data["t_trip_s_b"]) if data.get("t_trip_s_b") is not None else None,
            i_fault_a_a=(
                float(data["i_fault_a_a"]) if data.get("i_fault_a_a") is not None else None
            ),
            i_fault_a_b=(
                float(data["i_fault_a_b"]) if data.get("i_fault_a_b") is not None else None
            ),
            delta_t_s=float(data["delta_t_s"]) if data.get("delta_t_s") is not None else None,
            delta_i_fault_a=(
                float(data["delta_i_fault_a"]) if data.get("delta_i_fault_a") is not None else None
            ),
            margin_percent_a=(
                float(data["margin_percent_a"])
                if data.get("margin_percent_a") is not None
                else None
            ),
            margin_percent_b=(
                float(data["margin_percent_b"])
                if data.get("margin_percent_b") is not None
                else None
            ),
            state_change=StateChange(data["state_change"]),
        )


# =============================================================================
# RANKING ISSUE
# =============================================================================


@dataclass(frozen=True)
class RankingIssue:
    """
    Single issue in the protection comparison ranking.

    Issues are sorted deterministically by severity (DESC), then issue_code, then element_ref.

    Attributes:
        issue_code: Type of issue (TRIP_LOST, DELAY_INCREASED, etc.)
        severity: Severity level (1–5)
        element_ref: Protected element reference
        fault_target_id: Fault location ID
        description_pl: Polish technical description
        evidence_refs: Indices of rows supporting this issue
    """

    issue_code: IssueCode
    severity: IssueSeverity
    element_ref: str
    fault_target_id: str
    description_pl: str
    evidence_refs: tuple[int, ...]  # Indices into rows

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "issue_code": self.issue_code.value,
            "severity": self.severity.value,
            "element_ref": self.element_ref,
            "fault_target_id": self.fault_target_id,
            "description_pl": self.description_pl,
            "evidence_refs": list(self.evidence_refs),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RankingIssue:
        """Deserialize from dict."""
        return cls(
            issue_code=IssueCode(data["issue_code"]),
            severity=IssueSeverity(data["severity"]),
            element_ref=str(data["element_ref"]),
            fault_target_id=str(data["fault_target_id"]),
            description_pl=str(data["description_pl"]),
            evidence_refs=tuple(data.get("evidence_refs", [])),
        )


# =============================================================================
# COMPARISON SUMMARY
# =============================================================================


@dataclass(frozen=True)
class ProtectionComparisonSummary:
    """
    Summary statistics for protection comparison.
    """

    total_rows: int
    no_change_count: int
    trip_to_no_trip_count: int
    no_trip_to_trip_count: int
    invalid_change_count: int
    total_issues: int
    critical_issues: int
    major_issues: int
    moderate_issues: int
    minor_issues: int

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "total_rows": self.total_rows,
            "no_change_count": self.no_change_count,
            "trip_to_no_trip_count": self.trip_to_no_trip_count,
            "no_trip_to_trip_count": self.no_trip_to_trip_count,
            "invalid_change_count": self.invalid_change_count,
            "total_issues": self.total_issues,
            "critical_issues": self.critical_issues,
            "major_issues": self.major_issues,
            "moderate_issues": self.moderate_issues,
            "minor_issues": self.minor_issues,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionComparisonSummary:
        """Deserialize from dict."""
        return cls(
            total_rows=int(data["total_rows"]),
            no_change_count=int(data["no_change_count"]),
            trip_to_no_trip_count=int(data["trip_to_no_trip_count"]),
            no_trip_to_trip_count=int(data["no_trip_to_trip_count"]),
            invalid_change_count=int(data["invalid_change_count"]),
            total_issues=int(data["total_issues"]),
            critical_issues=int(data["critical_issues"]),
            major_issues=int(data["major_issues"]),
            moderate_issues=int(data["moderate_issues"]),
            minor_issues=int(data["minor_issues"]),
        )


# =============================================================================
# COMPARISON RESULT
# =============================================================================


@dataclass(frozen=True)
class ProtectionComparisonResult:
    """
    Complete protection comparison result.

    P15b: Main output of the comparison service.

    Attributes:
        comparison_id: Unique comparison identifier
        run_a_id: First protection run ID
        run_b_id: Second protection run ID
        project_id: Common project ID (validated)
        rows: Tuple of comparison rows (sorted deterministically)
        ranking: Tuple of ranking issues (sorted by severity DESC)
        summary: Summary statistics
        input_hash: SHA-256 hash of inputs for caching
        provenance_a: proweniencja biegu A (B1: `RunProvenance.to_dict()` —
            snapshot_hash/input_hash/koperta biegu R1)
        provenance_b: proweniencja biegu B — jak wyżej
        created_at: Comparison timestamp
    """

    comparison_id: str
    run_a_id: str
    run_b_id: str
    project_id: str
    rows: tuple[ProtectionComparisonRow, ...]
    ranking: tuple[RankingIssue, ...]
    summary: ProtectionComparisonSummary
    input_hash: str
    provenance_a: dict[str, Any] = field(default_factory=dict)
    provenance_b: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "comparison_id": self.comparison_id,
            "run_a_id": self.run_a_id,
            "run_b_id": self.run_b_id,
            "project_id": self.project_id,
            "rows": [r.to_dict() for r in self.rows],
            "ranking": [i.to_dict() for i in self.ranking],
            "summary": self.summary.to_dict(),
            "input_hash": self.input_hash,
            "provenance_a": self.provenance_a,
            "provenance_b": self.provenance_b,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionComparisonResult:
        """Deserialize from dict."""
        return cls(
            comparison_id=str(data["comparison_id"]),
            run_a_id=str(data["run_a_id"]),
            run_b_id=str(data["run_b_id"]),
            project_id=str(data["project_id"]),
            rows=tuple(ProtectionComparisonRow.from_dict(r) for r in data.get("rows", [])),
            ranking=tuple(RankingIssue.from_dict(i) for i in data.get("ranking", [])),
            summary=ProtectionComparisonSummary.from_dict(data["summary"]),
            input_hash=str(data["input_hash"]),
            provenance_a=data.get("provenance_a", {}),
            provenance_b=data.get("provenance_b", {}),
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
        )


# =============================================================================
# COMPARISON TRACE
# =============================================================================


@dataclass(frozen=True)
class ProtectionComparisonTraceStep:
    """
    Single step in the protection comparison trace.

    Records intermediate operations for audit purposes.
    """

    step: str
    description_pl: str
    inputs: dict[str, Any]
    outputs: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "step": self.step,
            "description_pl": self.description_pl,
            "inputs": self.inputs,
            "outputs": self.outputs,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionComparisonTraceStep:
        """Deserialize from dict."""
        return cls(
            step=str(data["step"]),
            description_pl=str(data.get("description_pl", "")),
            inputs=data.get("inputs", {}),
            outputs=data.get("outputs", {}),
        )


@dataclass(frozen=True)
class ProtectionComparisonTrace:
    """
    Complete audit trace for protection comparison.

    P15b: Records all inputs, intermediate calculations, and final outputs.

    Attributes:
        comparison_id: ID of the comparison
        run_a_id: First protection run ID
        run_b_id: Second protection run ID
        library_fingerprint_a: Library fingerprint from Run A
        library_fingerprint_b: Library fingerprint from Run B
        steps: Sequence of comparison steps
        created_at: Trace creation timestamp
    """

    comparison_id: str
    run_a_id: str
    run_b_id: str
    library_fingerprint_a: str | None
    library_fingerprint_b: str | None
    steps: tuple[ProtectionComparisonTraceStep, ...]
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "comparison_id": self.comparison_id,
            "run_a_id": self.run_a_id,
            "run_b_id": self.run_b_id,
            "library_fingerprint_a": self.library_fingerprint_a,
            "library_fingerprint_b": self.library_fingerprint_b,
            "steps": [s.to_dict() for s in self.steps],
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionComparisonTrace:
        """Deserialize from dict."""
        return cls(
            comparison_id=str(data["comparison_id"]),
            run_a_id=str(data["run_a_id"]),
            run_b_id=str(data["run_b_id"]),
            library_fingerprint_a=data.get("library_fingerprint_a"),
            library_fingerprint_b=data.get("library_fingerprint_b"),
            steps=tuple(ProtectionComparisonTraceStep.from_dict(s) for s in data.get("steps", [])),
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
        )


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
#
# CV-3.3-B: `ProtectionComparisonStatus` + `ProtectionComparison` (byt trwałości
# dla cache'a R3 `study_results`) usunięte — porównanie jest odtąd BEZSTANOWE
# (żadna trwałość poza dwoma biegami R1, które i tak są append-only): ten sam
# `comparison_id` zawsze przelicza się identycznie (patrz
# `application/protection_comparison/service.py`).


def compute_comparison_input_hash(run_a_id: str, run_b_id: str) -> str:
    """
    Compute deterministic input hash for comparison caching.

    Args:
        run_a_id: First protection run ID
        run_b_id: Second protection run ID

    Returns:
        SHA-256 hash string
    """
    canonical_input = json.dumps(
        {
            "run_a_id": str(run_a_id),
            "run_b_id": str(run_b_id),
        },
        sort_keys=True,
    )
    return hashlib.sha256(canonical_input.encode()).hexdigest()


# =============================================================================
# ERRORS
# =============================================================================


class ProtectionComparisonError(Exception):
    """Base exception for protection comparison errors."""

    pass


class ProtectionRunNotFoundError(ProtectionComparisonError):
    """Raised when a protection run is not found."""

    def __init__(self, run_id: str):
        self.run_id = run_id
        super().__init__(f"Protection run nie znaleziony: {run_id}")


class ProtectionRunWrongTypeError(ProtectionComparisonError):
    """CV-3.3-B: bieg R1 istnieje, ale nie jest biegiem zabezpieczeń.

    Osobny błąd od `ProtectionRunNotFoundError` — 422, nie 404: bieg NAPRAWDĘ
    istnieje, tylko porównanie zabezpieczeń nie może go zinterpretować (inny
    rodzaj analizy). Router mapuje to na `422 Unprocessable Entity`.
    """

    def __init__(self, run_id: str, analysis_type: str):
        self.run_id = run_id
        self.analysis_type = analysis_type
        super().__init__(f"Bieg {run_id} nie jest biegiem zabezpieczeń (rodzaj: {analysis_type})")


class ProtectionRunNotFinishedError(ProtectionComparisonError):
    """Raised when a protection run is not finished."""

    def __init__(self, run_id: str, status: str):
        self.run_id = run_id
        self.status = status
        super().__init__(f"Protection run nie zakończony (status: {status}): {run_id}")


class ProtectionProjectMismatchError(ProtectionComparisonError):
    """Raised when runs belong to different projects."""

    def __init__(self, run_a_project: str, run_b_project: str):
        self.run_a_project = run_a_project
        self.run_b_project = run_b_project
        super().__init__(f"Runs należą do różnych projektów: {run_a_project} vs {run_b_project}")


class ProtectionComparisonNotFoundError(ProtectionComparisonError):
    """Raised when a comparison is not found."""

    def __init__(self, comparison_id: str):
        self.comparison_id = comparison_id
        super().__init__(f"Protection comparison nie znalezione: {comparison_id}")
