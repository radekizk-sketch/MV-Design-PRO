"""
Study Case Domain Model — P10 FULL MAX

CANONICAL ALIGNMENT:
- P10 FULL MAX: Study Cases / Variants (industrial-grade)
- StudyCase = configuration entity, NOT domain entity
- One Project = One NetworkModel (invariant)
- Case NEVER mutates NetworkModel

RESULT STATUS LIFECYCLE:
- NONE: No calculations performed
- FRESH: Results are current (calculated after last model/config change)
- OUTDATED: Results need recalculation

INVALIDATION RULES:
- NetworkModel change → ALL cases become OUTDATED
- Case config change → ONLY that case becomes OUTDATED
- Case clone → New case has status NONE (no results copied)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID, uuid4


class StudyCaseResultStatus(str, Enum):
    """Result status for a study case (industrial-grade)."""

    NONE = "NONE"  # No calculations performed
    FRESH = "FRESH"  # Results are current
    OUTDATED = "OUTDATED"  # Results need recalculation


StudyCaseResultStatusLiteral = Literal["NONE", "FRESH", "OUTDATED"]


@dataclass(frozen=True)
class StudyCaseConfig:
    """
    Study case calculation configuration.

    Contains ONLY calculation parameters, NOT network topology.
    Immutable — changes create new config instances.
    """

    # Short-circuit analysis parameters
    c_factor_max: float = 1.10  # Voltage factor for max short-circuit (IEC 60909)
    c_factor_min: float = 0.95  # Voltage factor for min short-circuit

    # Power flow parameters
    base_mva: float = 100.0  # Base MVA for per-unit calculations
    max_iterations: int = 50  # Max Newton-Raphson iterations
    tolerance: float = 1e-6  # Convergence tolerance

    # Analysis options
    include_motor_contribution: bool = True
    include_inverter_contribution: bool = True
    thermal_time_seconds: float = 1.0  # Time for thermal current calculation

    # Operator profile (NC RfG / IRiESD per OSD)
    # Determines: FRT curves, Q-U envelope, cos φ(P) profile, ramp rate, dead band,
    # frequency response thresholds. Loaded from backend/src/catalog/profiles/nc_rfg/
    # {operator_profile_id}.yaml. Supported: pse | energa | tauron | enea | pge.
    # Default: "enea" — per /goal V12K (ENEA Operator pierwszy w priorytecie).
    operator_profile_id: str = "enea"

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for storage."""
        return {
            "c_factor_max": self.c_factor_max,
            "c_factor_min": self.c_factor_min,
            "base_mva": self.base_mva,
            "max_iterations": self.max_iterations,
            "tolerance": self.tolerance,
            "include_motor_contribution": self.include_motor_contribution,
            "include_inverter_contribution": self.include_inverter_contribution,
            "thermal_time_seconds": self.thermal_time_seconds,
            "operator_profile_id": self.operator_profile_id,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StudyCaseConfig:
        """Deserialize from dictionary."""
        return cls(
            c_factor_max=data.get("c_factor_max", 1.10),
            c_factor_min=data.get("c_factor_min", 0.95),
            base_mva=data.get("base_mva", 100.0),
            max_iterations=data.get("max_iterations", 50),
            tolerance=data.get("tolerance", 1e-6),
            include_motor_contribution=data.get("include_motor_contribution", True),
            include_inverter_contribution=data.get("include_inverter_contribution", True),
            thermal_time_seconds=data.get("thermal_time_seconds", 1.0),
            operator_profile_id=data.get("operator_profile_id", "enea"),
        )


@dataclass(frozen=True)
class StudyCaseResult:
    """
    Result reference for a study case.

    Contains metadata about the result, not the result itself.
    Actual results are stored in AnalysisRun.
    """

    analysis_run_id: UUID
    analysis_type: str
    calculated_at: datetime
    input_hash: str  # Hash of input for cache invalidation

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "analysis_run_id": str(self.analysis_run_id),
            "analysis_type": self.analysis_type,
            "calculated_at": self.calculated_at.isoformat(),
            "input_hash": self.input_hash,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StudyCaseResult:
        """Deserialize from dictionary."""
        return cls(
            analysis_run_id=UUID(data["analysis_run_id"]),
            analysis_type=data["analysis_type"],
            calculated_at=datetime.fromisoformat(data["calculated_at"]),
            input_hash=data["input_hash"],
        )


@dataclass(frozen=True)
class ProtectionConfig:
    """
    Protection configuration for study case (P14c).

    Contains reference to ProtectionSettingTemplate and optional overrides.
    NO calculations, NO solver logic - just configuration data.

    INVARIANTS:
    - Case stores reference (template_ref + fingerprint), NOT copied data
    - Overrides are optional (values + units)
    - library_manifest_ref tracks source library for auditability
    - bound_at is timestamp when template was bound to case

    Attributes:
        template_ref: ID of ProtectionSettingTemplate from catalog.
        template_fingerprint: Fingerprint of the template at bind time (for audit).
        library_manifest_ref: Reference to library manifest (library_id + revision).
        overrides: Optional overrides for setting fields (dict[field_name, value]).
        bound_at: Timestamp when template was bound to this case.
    """

    template_ref: str | None = None
    template_fingerprint: str | None = None
    library_manifest_ref: dict[str, Any] | None = None
    overrides: dict[str, Any] = field(default_factory=dict)
    bound_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for storage."""
        return {
            "template_ref": self.template_ref,
            "template_fingerprint": self.template_fingerprint,
            "library_manifest_ref": self.library_manifest_ref,
            "overrides": self.overrides or {},
            "bound_at": self.bound_at.isoformat() if self.bound_at else None,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionConfig:
        """Deserialize from dictionary."""
        return cls(
            template_ref=data.get("template_ref"),
            template_fingerprint=data.get("template_fingerprint"),
            library_manifest_ref=data.get("library_manifest_ref"),
            overrides=data.get("overrides") or {},
            bound_at=datetime.fromisoformat(data["bound_at"]) if data.get("bound_at") else None,
        )


@dataclass(frozen=True)
class StudyCase:
    """
    Study Case entity — configuration for calculations (P10a).

    INVARIANTS:
    - StudyCase is a configuration entity, NOT a domain entity
    - Never mutates NetworkModel
    - Contains only calculation parameters
    - Results belong to the case, not to the model
    - Exactly one case can be active per project

    P10a ADDITIONS:
    - network_snapshot_id: Reference to the snapshot this case was configured against
    - When NetworkModel changes (new snapshot), result_status becomes OUTDATED
    """

    id: UUID
    project_id: UUID
    name: str
    description: str = ""

    # P10a: Reference to the network snapshot this case is bound to
    # When model changes (new snapshot_id), results become OUTDATED
    network_snapshot_id: str | None = None

    # Configuration (calculation parameters only)
    config: StudyCaseConfig = field(default_factory=StudyCaseConfig)

    # P14c: Protection configuration (reference to template + overrides)
    protection_config: ProtectionConfig = field(default_factory=ProtectionConfig)

    # Result status lifecycle
    result_status: StudyCaseResultStatus = StudyCaseResultStatus.NONE

    # Active case indicator (exactly one per project)
    is_active: bool = False

    # Result references (not the results themselves)
    result_refs: tuple[StudyCaseResult, ...] = field(default_factory=tuple)

    # Audit metadata
    revision: int = 1
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    # For backward compatibility with study_payload field
    study_payload: dict[str, Any] = field(default_factory=dict)

    @property
    def results_valid(self) -> bool:
        """
        Explicit flag: are this case's results valid for use?

        Returns True ONLY when result_status == FRESH.
        NONE means no results exist, OUTDATED means results are stale.
        UI/API MUST check this before allowing result access or export.
        """
        return self.result_status == StudyCaseResultStatus.FRESH

    def with_updated_config(self, config: StudyCaseConfig) -> StudyCase:
        """
        Create a new StudyCase with updated config.
        Marks result_status as OUTDATED since config changed.
        """
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=config,
            protection_config=self.protection_config,
            result_status=(
                StudyCaseResultStatus.OUTDATED
                if self.result_status == StudyCaseResultStatus.FRESH
                else self.result_status
            ),
            is_active=self.is_active,
            result_refs=self.result_refs,
            revision=self.revision + 1,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=config.to_dict(),
        )

    def with_protection_config(self, protection_config: ProtectionConfig) -> StudyCase:
        """
        Create a new StudyCase with updated protection config (P14c).
        Marks result_status as OUTDATED if config changed (since protection may affect results).
        """
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=protection_config,
            result_status=(
                StudyCaseResultStatus.OUTDATED
                if self.result_status == StudyCaseResultStatus.FRESH
                else self.result_status
            ),
            is_active=self.is_active,
            result_refs=self.result_refs,
            revision=self.revision + 1,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=self.study_payload,
        )

    def with_name(self, name: str) -> StudyCase:
        """Create a new StudyCase with updated name."""
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            result_status=self.result_status,
            is_active=self.is_active,
            result_refs=self.result_refs,
            revision=self.revision + 1,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=self.study_payload,
        )

    def with_description(self, description: str) -> StudyCase:
        """Create a new StudyCase with updated description."""
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            result_status=self.result_status,
            is_active=self.is_active,
            result_refs=self.result_refs,
            revision=self.revision + 1,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=self.study_payload,
        )

    def mark_as_active(self) -> StudyCase:
        """Mark this case as active."""
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            result_status=self.result_status,
            is_active=True,
            result_refs=self.result_refs,
            revision=self.revision,
            created_at=self.created_at,
            updated_at=self.updated_at,
            study_payload=self.study_payload,
        )

    def mark_as_inactive(self) -> StudyCase:
        """Mark this case as inactive."""
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            result_status=self.result_status,
            is_active=False,
            result_refs=self.result_refs,
            revision=self.revision,
            created_at=self.created_at,
            updated_at=self.updated_at,
            study_payload=self.study_payload,
        )

    def mark_as_outdated(self) -> StudyCase:
        """
        Mark results as OUTDATED.
        Called when NetworkModel or config changes.
        """
        if self.result_status == StudyCaseResultStatus.NONE:
            return self  # No results to invalidate
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            result_status=StudyCaseResultStatus.OUTDATED,
            is_active=self.is_active,
            result_refs=self.result_refs,
            revision=self.revision,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=self.study_payload,
        )

    def mark_as_fresh(self, result_ref: StudyCaseResult) -> StudyCase:
        """
        Mark results as FRESH after successful calculation.
        Adds result reference to the case.
        """
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            result_status=StudyCaseResultStatus.FRESH,
            is_active=self.is_active,
            result_refs=(*self.result_refs, result_ref),
            revision=self.revision,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=self.study_payload,
        )

    def with_network_snapshot_id(self, network_snapshot_id: str) -> StudyCase:
        """
        P10a: Bind this case to a new network snapshot.

        INVALIDATION RULE (industrial-grade):
        - If snapshot changes AND case has FRESH results → mark as OUTDATED
        - If snapshot changes AND case has NONE results → keep NONE
        """
        # Determine if results should be invalidated
        new_status = self.result_status
        if self.network_snapshot_id != network_snapshot_id:
            if self.result_status == StudyCaseResultStatus.FRESH:
                new_status = StudyCaseResultStatus.OUTDATED

        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            result_status=new_status,
            is_active=self.is_active,
            result_refs=self.result_refs,
            revision=self.revision + 1,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=self.study_payload,
        )

    def clone(self, new_name: str | None = None) -> StudyCase:
        """
        Clone this case with new ID.

        CLONING RULES (canonical-style):
        - Configuration is copied (including protection_config)
        - network_snapshot_id is copied (same snapshot binding)
        - Results are NOT copied (status = NONE)
        - New case is NOT active
        """
        now = datetime.now(UTC)
        return StudyCase(
            id=uuid4(),
            project_id=self.project_id,
            name=new_name or f"{self.name} (kopia)",
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,  # P10a: Copy snapshot binding
            config=self.config,
            protection_config=self.protection_config,  # P14c: Copy protection config
            result_status=StudyCaseResultStatus.NONE,  # No results for clone
            is_active=False,  # Clone is not active
            result_refs=(),  # No results for clone
            revision=1,
            created_at=now,
            updated_at=now,
            study_payload=self.study_payload,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses."""
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "name": self.name,
            "description": self.description,
            "network_snapshot_id": self.network_snapshot_id,  # P10a
            "config": self.config.to_dict(),
            "protection_config": self.protection_config.to_dict(),  # P14c
            "result_status": self.result_status.value,
            "results_valid": self.results_valid,  # PR-4: explicit validity flag
            "is_active": self.is_active,
            "result_refs": [ref.to_dict() for ref in self.result_refs],
            "revision": self.revision,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StudyCase:
        """Deserialize from dictionary."""
        config = StudyCaseConfig.from_dict(data.get("config", {}))
        protection_config = ProtectionConfig.from_dict(data.get("protection_config", {}))  # P14c
        result_refs = tuple(StudyCaseResult.from_dict(ref) for ref in data.get("result_refs", []))
        return cls(
            id=UUID(data["id"]),
            project_id=UUID(data["project_id"]),
            name=data["name"],
            description=data.get("description", ""),
            network_snapshot_id=data.get("network_snapshot_id"),  # P10a
            config=config,
            protection_config=protection_config,  # P14c
            result_status=StudyCaseResultStatus(data.get("result_status", "NONE")),
            is_active=data.get("is_active", False),
            result_refs=result_refs,
            revision=data.get("revision", 1),
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
            updated_at=(
                datetime.fromisoformat(data["updated_at"])
                if "updated_at" in data
                else datetime.now(UTC)
            ),
            study_payload=config.to_dict(),
        )


def new_study_case(
    project_id: UUID,
    name: str,
    description: str = "",
    config: StudyCaseConfig | None = None,
    is_active: bool = False,
    network_snapshot_id: str | None = None,
) -> StudyCase:
    """
    Factory function to create a new StudyCase (P10a + P14c).

    Args:
        project_id: ID of the project this case belongs to
        name: Case name (displayed in UI)
        description: Optional description
        config: Calculation configuration (defaults to standard values)
        is_active: Whether this case should be active
        network_snapshot_id: P10a - Snapshot this case is bound to

    Returns:
        New StudyCase instance with status NONE
    """
    cfg = config or StudyCaseConfig()
    now = datetime.now(UTC)
    return StudyCase(
        id=uuid4(),
        project_id=project_id,
        name=name,
        description=description,
        network_snapshot_id=network_snapshot_id,
        config=cfg,
        protection_config=ProtectionConfig(),  # P14c: Empty protection config by default
        result_status=StudyCaseResultStatus.NONE,
        is_active=is_active,
        result_refs=(),
        revision=1,
        created_at=now,
        updated_at=now,
        study_payload=cfg.to_dict(),
    )


@dataclass(frozen=True)
class StudyCaseComparison:
    """
    Comparison between two study cases.

    P10: Case Compare view — 100% read-only, no mutations.
    """

    case_a_id: UUID
    case_b_id: UUID
    case_a_name: str
    case_b_name: str

    # Configuration differences
    config_differences: tuple[tuple[str, Any, Any], ...]

    # Status comparison
    status_a: StudyCaseResultStatus
    status_b: StudyCaseResultStatus

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses."""
        return {
            "case_a_id": str(self.case_a_id),
            "case_b_id": str(self.case_b_id),
            "case_a_name": self.case_a_name,
            "case_b_name": self.case_b_name,
            "config_differences": [
                {"field": field, "value_a": val_a, "value_b": val_b}
                for field, val_a, val_b in self.config_differences
            ],
            "status_a": self.status_a.value,
            "status_b": self.status_b.value,
        }


def compare_study_cases(case_a: StudyCase, case_b: StudyCase) -> StudyCaseComparison:
    """
    Compare two study cases.

    Returns a StudyCaseComparison with all configuration differences.
    This is a read-only operation — no mutations allowed.
    """
    config_a = case_a.config.to_dict()
    config_b = case_b.config.to_dict()

    # Find all differences
    differences: list[tuple[str, Any, Any]] = []
    all_keys = set(config_a.keys()) | set(config_b.keys())

    for key in sorted(all_keys):
        val_a = config_a.get(key)
        val_b = config_b.get(key)
        if val_a != val_b:
            differences.append((key, val_a, val_b))

    return StudyCaseComparison(
        case_a_id=case_a.id,
        case_b_id=case_b.id,
        case_a_name=case_a.name,
        case_b_name=case_b.name,
        config_differences=tuple(differences),
        status_a=case_a.result_status,
        status_b=case_b.result_status,
    )
