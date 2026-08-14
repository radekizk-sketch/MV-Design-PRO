"""
Protection Analysis Domain Model — P15a FOUNDATION

CANONICAL ALIGNMENT:
- Protection Analysis = interpretation layer, NOT a solver
- Consumes: SC results + ProtectionCase config + Protection Library
- Produces: ProtectionResult + ProtectionTrace (deterministic, auditable)

INVARIANTS:
- Zero physics calculations (only interprets solver results)
- Deterministic: same inputs → same outputs
- Frozen/immutable data structures for auditability
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID, uuid4

# =============================================================================
# ENUMS AND TYPES
# =============================================================================


class TripState(StrEnum):
    """Protection device trip evaluation state."""

    TRIPS = "TRIPS"  # Device will trip for given fault current
    NO_TRIP = "NO_TRIP"  # Device will NOT trip (current below pickup)
    INVALID = "INVALID"  # Evaluation could not complete (missing data, unsupported curve)


class ProtectionRunStatus(StrEnum):
    """Status of a protection analysis run."""

    CREATED = "CREATED"
    RUNNING = "RUNNING"
    FINISHED = "FINISHED"
    FAILED = "FAILED"


ProtectionRunStatusLiteral = Literal["CREATED", "RUNNING", "FINISHED", "FAILED"]


# =============================================================================
# EVALUATION RESULT TYPES
# =============================================================================


@dataclass(frozen=True)
class ProtectionEvaluation:
    """
    Single protection device evaluation against a fault.

    This is the core output of the protection evaluation engine.
    One evaluation per (device, fault_target) pair.

    Attributes:
        device_id: ID of protection device instance
        device_type_ref: Reference to ProtectionDeviceType from library
        protected_element_ref: ID of protected element (bus_id or branch_id)
        fault_target_id: ID of the fault location (node/bus where fault occurred)
        i_fault_a: Fault current magnitude [A] from SC result
        i_pickup_a: Pickup current setting [A] (resolved from template+overrides)
        t_trip_s: Calculated trip time [s] (None if NO_TRIP or INVALID)
        trip_state: Evaluation result (TRIPS/NO_TRIP/INVALID)
        curve_ref: Reference to ProtectionCurve used
        curve_kind: Kind of curve (inverse, definite_time, etc.)
        margin_percent: Safety margin as percentage (i_fault/i_pickup - 1) * 100
        notes_pl: Deterministic Polish notes explaining the result
    """

    device_id: str
    device_type_ref: str | None
    protected_element_ref: str
    fault_target_id: str
    i_fault_a: float
    i_pickup_a: float
    t_trip_s: float | None
    trip_state: TripState
    curve_ref: str | None
    curve_kind: str | None
    margin_percent: float | None
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "device_id": self.device_id,
            "device_type_ref": self.device_type_ref,
            "protected_element_ref": self.protected_element_ref,
            "fault_target_id": self.fault_target_id,
            "i_fault_a": self.i_fault_a,
            "i_pickup_a": self.i_pickup_a,
            "t_trip_s": self.t_trip_s,
            "trip_state": self.trip_state.value,
            "curve_ref": self.curve_ref,
            "curve_kind": self.curve_kind,
            "margin_percent": self.margin_percent,
            "notes_pl": self.notes_pl,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionEvaluation:
        """Deserialize from dict."""
        return cls(
            device_id=str(data["device_id"]),
            device_type_ref=data.get("device_type_ref"),
            protected_element_ref=str(data["protected_element_ref"]),
            fault_target_id=str(data["fault_target_id"]),
            i_fault_a=float(data["i_fault_a"]),
            i_pickup_a=float(data["i_pickup_a"]),
            t_trip_s=float(data["t_trip_s"]) if data.get("t_trip_s") is not None else None,
            trip_state=TripState(data["trip_state"]),
            curve_ref=data.get("curve_ref"),
            curve_kind=data.get("curve_kind"),
            margin_percent=(
                float(data["margin_percent"]) if data.get("margin_percent") is not None else None
            ),
            notes_pl=str(data.get("notes_pl", "")),
        )


@dataclass(frozen=True)
class ProtectionResultSummary:
    """
    Summary statistics for protection analysis result.

    Provides quick overview without iterating through all evaluations.
    """

    total_evaluations: int
    trips_count: int
    no_trip_count: int
    invalid_count: int
    min_trip_time_s: float | None
    max_trip_time_s: float | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "total_evaluations": self.total_evaluations,
            "trips_count": self.trips_count,
            "no_trip_count": self.no_trip_count,
            "invalid_count": self.invalid_count,
            "min_trip_time_s": self.min_trip_time_s,
            "max_trip_time_s": self.max_trip_time_s,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionResultSummary:
        """Deserialize from dict."""
        return cls(
            total_evaluations=int(data["total_evaluations"]),
            trips_count=int(data["trips_count"]),
            no_trip_count=int(data["no_trip_count"]),
            invalid_count=int(data["invalid_count"]),
            min_trip_time_s=(
                float(data["min_trip_time_s"]) if data.get("min_trip_time_s") is not None else None
            ),
            max_trip_time_s=(
                float(data["max_trip_time_s"]) if data.get("max_trip_time_s") is not None else None
            ),
        )


@dataclass(frozen=True)
class ProtectionResult:
    """
    Complete protection analysis result.

    This is the main output of the protection analysis run.
    Contains all evaluations and summary statistics.

    Attributes:
        run_id: ID of the protection analysis run
        sc_run_id: ID of the source short-circuit run
        protection_case_id: ID of the protection case (StudyCase.id)
        template_ref: Reference to ProtectionSettingTemplate used
        template_fingerprint: Fingerprint of template at analysis time
        library_manifest_ref: Reference to protection library manifest
        evaluations: Tuple of all device evaluations
        summary: Summary statistics
        created_at: Timestamp when result was created
    """

    run_id: str
    sc_run_id: str
    protection_case_id: str
    template_ref: str | None
    template_fingerprint: str | None
    library_manifest_ref: dict[str, Any] | None
    evaluations: tuple[ProtectionEvaluation, ...]
    summary: ProtectionResultSummary
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "run_id": self.run_id,
            "sc_run_id": self.sc_run_id,
            "protection_case_id": self.protection_case_id,
            "template_ref": self.template_ref,
            "template_fingerprint": self.template_fingerprint,
            "library_manifest_ref": self.library_manifest_ref,
            "evaluations": [e.to_dict() for e in self.evaluations],
            "summary": self.summary.to_dict(),
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionResult:
        """Deserialize from dict."""
        evaluations = tuple(ProtectionEvaluation.from_dict(e) for e in data.get("evaluations", []))
        return cls(
            run_id=str(data["run_id"]),
            sc_run_id=str(data["sc_run_id"]),
            protection_case_id=str(data["protection_case_id"]),
            template_ref=data.get("template_ref"),
            template_fingerprint=data.get("template_fingerprint"),
            library_manifest_ref=data.get("library_manifest_ref"),
            evaluations=evaluations,
            summary=ProtectionResultSummary.from_dict(data["summary"]),
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
        )


# =============================================================================
# TRACE TYPES (WHITE-BOX AUDIT)
# =============================================================================


@dataclass(frozen=True)
class ProtectionTraceStep:
    """
    Single step in the protection evaluation trace.

    Records intermediate values for audit purposes.
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
    def from_dict(cls, data: dict[str, Any]) -> ProtectionTraceStep:
        """Deserialize from dict."""
        return cls(
            step=str(data["step"]),
            description_pl=str(data.get("description_pl", "")),
            inputs=data.get("inputs", {}),
            outputs=data.get("outputs", {}),
        )


@dataclass(frozen=True)
class ProtectionTrace:
    """
    Complete audit trace for protection analysis.

    Records all inputs, intermediate calculations, and final outputs.
    Enables full reproducibility and audit.

    Attributes:
        run_id: ID of the protection analysis run
        sc_run_id: Source short-circuit run ID
        snapshot_id: Network snapshot ID at analysis time
        template_ref: Template used for settings
        overrides: Overrides applied to template
        steps: Sequence of calculation steps
        created_at: Timestamp when trace was created
    """

    run_id: str
    sc_run_id: str
    snapshot_id: str | None
    template_ref: str | None
    overrides: dict[str, Any]
    steps: tuple[ProtectionTraceStep, ...]
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "run_id": self.run_id,
            "sc_run_id": self.sc_run_id,
            "snapshot_id": self.snapshot_id,
            "template_ref": self.template_ref,
            "overrides": self.overrides,
            "steps": [s.to_dict() for s in self.steps],
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionTrace:
        """Deserialize from dict."""
        steps = tuple(ProtectionTraceStep.from_dict(s) for s in data.get("steps", []))
        return cls(
            run_id=str(data["run_id"]),
            sc_run_id=str(data["sc_run_id"]),
            snapshot_id=data.get("snapshot_id"),
            template_ref=data.get("template_ref"),
            overrides=data.get("overrides", {}),
            steps=steps,
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
        )


# =============================================================================
# RUN ENTITY
# =============================================================================


@dataclass(frozen=True)
class ProtectionAnalysisRun:
    """
    Protection analysis run entity.

    Tracks the lifecycle of a protection analysis from creation to completion.
    Analogous to AnalysisRun but specific to protection analysis.

    Attributes:
        id: Unique run identifier (UUID)
        project_id: Parent project ID
        sc_run_id: Source short-circuit run ID (must exist and be FINISHED)
        protection_case_id: Protection case ID (StudyCase with ProtectionConfig)
        status: Run lifecycle status
        input_hash: SHA-256 hash of canonical input for deduplication
        input_snapshot: Canonical input data
        result_summary: Summary of results (after FINISHED)
        trace_json: Full trace data (after FINISHED)
        error_message: Error details (after FAILED)
        created_at: Creation timestamp
        started_at: Execution start timestamp
        finished_at: Completion timestamp
        network_snapshot_hash: KOTWICA swiezosci — odcisk modelu przypadku
            zabezpieczen w chwili utworzenia biegu (K-S). `None` dla biegow
            zapisanych zanim odcisk zaczal byc utrwalany oraz dla przypadku bez
            materializowanego modelu; taki bieg NIE MOZE meldowac sie jako
            aktualny (patrz `application/result_freshness.py`).
        sc_network_snapshot_hash: KOTWICA swiezysci wejscia — odcisk modelu, na
            ktorym policzono bieg zwarciowy bedacy zrodlem wynikow. `None`, gdy
            bieg zwarciowy nie niesie odcisku (kanal inny niz kanoniczny).

    Pola kotwic sa ADDYTYWNE: nie wchodza do `input_hash` (tozsamosc wejscia
    pinuje juz `sc_run_id` + konfiguracja przypadku), wiec odciski istniejacych
    biegow pozostaja bajtowo takie same.
    """

    id: UUID
    project_id: UUID
    sc_run_id: str
    protection_case_id: UUID
    status: ProtectionRunStatus
    input_hash: str = ""
    input_snapshot: dict[str, Any] = field(default_factory=dict)
    result_summary: dict[str, Any] = field(default_factory=dict)
    trace_json: dict[str, Any] | None = None
    error_message: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = None
    finished_at: datetime | None = None
    network_snapshot_hash: str | None = None
    sc_network_snapshot_hash: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "sc_run_id": self.sc_run_id,
            "protection_case_id": str(self.protection_case_id),
            "status": self.status.value,
            "input_hash": self.input_hash,
            "input_snapshot": self.input_snapshot,
            "result_summary": self.result_summary,
            "trace_json": self.trace_json,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "network_snapshot_hash": self.network_snapshot_hash,
            "sc_network_snapshot_hash": self.sc_network_snapshot_hash,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionAnalysisRun:
        """Deserialize from dict.

        Brak kluczy kotwic (bieg zapisany przed K-S) daje `None` — uczciwy brak
        wiedzy o modelu, NIE domniemana aktualnosc.
        """
        return cls(
            id=UUID(data["id"]),
            project_id=UUID(data["project_id"]),
            sc_run_id=str(data["sc_run_id"]),
            protection_case_id=UUID(data["protection_case_id"]),
            status=ProtectionRunStatus(data["status"]),
            input_hash=data.get("input_hash", ""),
            input_snapshot=data.get("input_snapshot", {}),
            result_summary=data.get("result_summary", {}),
            trace_json=data.get("trace_json"),
            error_message=data.get("error_message"),
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
            started_at=(
                datetime.fromisoformat(data["started_at"]) if data.get("started_at") else None
            ),
            finished_at=(
                datetime.fromisoformat(data["finished_at"]) if data.get("finished_at") else None
            ),
            network_snapshot_hash=data.get("network_snapshot_hash"),
            sc_network_snapshot_hash=data.get("sc_network_snapshot_hash"),
        )


def new_protection_analysis_run(
    *,
    project_id: UUID,
    sc_run_id: str,
    protection_case_id: UUID,
    input_snapshot: dict[str, Any],
    input_hash: str,
    network_snapshot_hash: str | None = None,
    sc_network_snapshot_hash: str | None = None,
) -> ProtectionAnalysisRun:
    """
    Factory function to create a new ProtectionAnalysisRun.

    Args:
        project_id: ID of the project
        sc_run_id: ID of the source short-circuit run
        protection_case_id: ID of the protection case (StudyCase)
        input_snapshot: Canonical input data for determinism
        input_hash: SHA-256 hash of input for deduplication
        network_snapshot_hash: Odcisk modelu przypadku w chwili utworzenia biegu
        sc_network_snapshot_hash: Odcisk modelu biegu zwarciowego (zrodla wynikow)

    Returns:
        New ProtectionAnalysisRun in CREATED status
    """
    return ProtectionAnalysisRun(
        id=uuid4(),
        project_id=project_id,
        sc_run_id=sc_run_id,
        protection_case_id=protection_case_id,
        status=ProtectionRunStatus.CREATED,
        input_hash=input_hash,
        input_snapshot=input_snapshot,
        network_snapshot_hash=network_snapshot_hash,
        sc_network_snapshot_hash=sc_network_snapshot_hash,
    )


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def compute_result_summary(
    evaluations: tuple[ProtectionEvaluation, ...],
) -> ProtectionResultSummary:
    """
    Compute summary statistics from evaluations.

    Args:
        evaluations: Tuple of protection evaluations

    Returns:
        ProtectionResultSummary with computed statistics
    """
    trips_count = sum(1 for e in evaluations if e.trip_state == TripState.TRIPS)
    no_trip_count = sum(1 for e in evaluations if e.trip_state == TripState.NO_TRIP)
    invalid_count = sum(1 for e in evaluations if e.trip_state == TripState.INVALID)

    trip_times = [e.t_trip_s for e in evaluations if e.t_trip_s is not None]
    min_trip_time = min(trip_times) if trip_times else None
    max_trip_time = max(trip_times) if trip_times else None

    return ProtectionResultSummary(
        total_evaluations=len(evaluations),
        trips_count=trips_count,
        no_trip_count=no_trip_count,
        invalid_count=invalid_count,
        min_trip_time_s=min_trip_time,
        max_trip_time_s=max_trip_time,
    )
