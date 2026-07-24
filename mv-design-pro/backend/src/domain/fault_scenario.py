"""
Fault Scenario Domain Model — PR-19 + PR-24

Canonical, deterministic model of a short-circuit fault scenario
as a first-class domain object.

INVARIANTS:
- FaultScenario is IMMUTABLE (frozen dataclass)
- content_hash = SHA-256 of canonical JSON (sorted keys)
- SC_1F requires z0_bus_data (not None)
- location_type="BRANCH" requires position in (0,1)
- location_type="BUS" requires position = None
- ZERO auto-completion — missing data means upstream gating failed
- ZERO randomness — identical input → identical content_hash

PR-24 EXTENSIONS:
- name (PL, required) — user-facing scenario name
- fault_impedance_type — metallic fault (METALLIC) as enum
- created_at, updated_at — controlled by application layer (deterministic)
- with_updates() — copy-on-write for immutable updates
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID, uuid4

from domain.execution import ExecutionAnalysisType

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class FaultType(StrEnum):
    """Short-circuit fault types (IEC 60909)."""

    SC_3F = "SC_3F"
    SC_2F = "SC_2F"
    SC_1F = "SC_1F"


class FaultImpedanceType(StrEnum):
    """Fault impedance type (v1: metallic only). Kept for backward compatibility."""

    METALLIC = "METALLIC"


class FaultMode(StrEnum):
    """Fault mode (v2): metallic or through impedance.

    METALLIC — zero-impedance fault (Zf = 0)
    IMPEDANCE — fault through explicit impedance Zf (user-provided, no defaults)
    """

    METALLIC = "METALLIC"
    IMPEDANCE = "IMPEDANCE"


# Mapping FaultType → ExecutionAnalysisType
FAULT_TYPE_TO_ANALYSIS: dict[FaultType, ExecutionAnalysisType] = {
    FaultType.SC_3F: ExecutionAnalysisType.SC_3F,
    FaultType.SC_2F: ExecutionAnalysisType.SC_2F,
    FaultType.SC_1F: ExecutionAnalysisType.SC_1F,
}


# ---------------------------------------------------------------------------
# Value Objects
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FaultImpedance:
    """
    Fault impedance Zf — explicit R + X in Ohms.

    Canonical API format: {r_ohm: float, x_ohm: float}
    Required when fault_mode = IMPEDANCE.
    Forbidden when fault_mode = METALLIC.
    No defaults. No auto-completion.
    """

    r_ohm: float
    x_ohm: float

    def to_dict(self) -> dict[str, Any]:
        return {"r_ohm": self.r_ohm, "x_ohm": self.x_ohm}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FaultImpedance:
        return cls(r_ohm=data["r_ohm"], x_ohm=data["x_ohm"])


@dataclass(frozen=True)
class FaultLocation:
    """
    Location of a fault in the network.

    v1 types (backward-compatible):
    - location_type="BUS" → position must be None
    - location_type="BRANCH" → position must be in (0.0, 1.0)

    v2 types (PR-25):
    - location_type="NODE" → position must be None (equivalent to BUS)
    - location_type="BRANCH_POINT" → position (alpha) must be in [0.0, 1.0]
    """

    element_ref: str
    location_type: Literal["BUS", "BRANCH", "NODE", "BRANCH_POINT"]
    position: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "element_ref": self.element_ref,
            "location_type": self.location_type,
            "position": self.position,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FaultLocation:
        return cls(
            element_ref=data["element_ref"],
            location_type=data["location_type"],
            position=data.get("position"),
        )


@dataclass(frozen=True)
class ShortCircuitConfig:
    """
    Short-circuit calculation configuration.

    Extracted from StudyCaseConfig — only SC-relevant parameters.
    Immutable, deterministic.
    """

    c_factor: float = 1.10
    thermal_time_seconds: float = 1.0
    include_branch_contributions: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "c_factor": self.c_factor,
            "thermal_time_seconds": self.thermal_time_seconds,
            "include_branch_contributions": self.include_branch_contributions,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ShortCircuitConfig:
        return cls(
            c_factor=data.get("c_factor", 1.10),
            thermal_time_seconds=data.get("thermal_time_seconds", 1.0),
            include_branch_contributions=data.get("include_branch_contributions", False),
        )


# ---------------------------------------------------------------------------
# Sentinel for copy-on-write (distinguishes "not passed" from "passed None")
# ---------------------------------------------------------------------------


class _SentinelType:
    """Internal sentinel — not part of public API."""

    pass


_SENTINEL: object = _SentinelType()


# ---------------------------------------------------------------------------
# FaultScenario (Aggregate Root)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FaultScenario:
    """
    Fault Scenario — a canonical, deterministic definition of a short-circuit
    fault scenario as a first-class domain object (PR-19 + PR-24).

    INVARIANTS:
    - Immutable (frozen dataclass)
    - content_hash = SHA-256 of canonical JSON (sorted keys)
    - SC_1F → z0_bus_data is required
    - location validated at construction
    - ZERO auto-completion
    - ZERO randomness

    PR-24 ADDITIONS:
    - name: User-facing Polish name (required)
    - fault_impedance_type: METALLIC (v1)
    - created_at, updated_at: Application-controlled timestamps
    - with_updates(): Copy-on-write for immutable transitions

    PR-25 ADDITIONS (v2):
    - fault_mode: METALLIC | IMPEDANCE (replaces conceptual role of fault_impedance_type)
    - fault_impedance: Explicit Zf {r_ohm, x_ohm} (required for IMPEDANCE, forbidden for METALLIC)
    - arc_params: Reserved for future arc modeling (unsupported in v2 → deterministic error)
    """

    scenario_id: UUID
    study_case_id: UUID
    name: str
    fault_type: FaultType
    location: FaultLocation
    config: ShortCircuitConfig
    fault_impedance_type: FaultImpedanceType = FaultImpedanceType.METALLIC
    fault_mode: FaultMode = FaultMode.METALLIC
    fault_impedance: FaultImpedance | None = None
    arc_params: dict[str, Any] | None = None
    z0_bus_data: dict[str, Any] | None = None
    created_at: str = ""
    updated_at: str = ""
    content_hash: str = ""

    @property
    def analysis_type(self) -> ExecutionAnalysisType:
        """Derived analysis type from fault_type."""
        return FAULT_TYPE_TO_ANALYSIS[self.fault_type]

    def with_updates(
        self,
        *,
        name: str | None = None,
        fault_type: FaultType | None = None,
        location: FaultLocation | None = None,
        config: ShortCircuitConfig | None = None,
        fault_impedance_type: FaultImpedanceType | None = None,
        fault_mode: FaultMode | None = None,
        fault_impedance: Any = _SENTINEL,
        arc_params: Any = _SENTINEL,
        z0_bus_data: Any = _SENTINEL,
        updated_at: str | None = None,
    ) -> FaultScenario:
        """Create a copy with updated fields (copy-on-write, immutable)."""
        return FaultScenario(
            scenario_id=self.scenario_id,
            study_case_id=self.study_case_id,
            name=name if name is not None else self.name,
            fault_type=fault_type if fault_type is not None else self.fault_type,
            location=location if location is not None else self.location,
            config=config if config is not None else self.config,
            fault_impedance_type=(
                fault_impedance_type
                if fault_impedance_type is not None
                else self.fault_impedance_type
            ),
            fault_mode=(fault_mode if fault_mode is not None else self.fault_mode),
            fault_impedance=(
                fault_impedance
                if not isinstance(fault_impedance, _SentinelType)
                else self.fault_impedance
            ),
            arc_params=(
                arc_params if not isinstance(arc_params, _SentinelType) else self.arc_params
            ),
            z0_bus_data=(
                z0_bus_data if not isinstance(z0_bus_data, _SentinelType) else self.z0_bus_data
            ),
            created_at=self.created_at,
            updated_at=updated_at if updated_at is not None else self.updated_at,
            content_hash="",  # Will be recomputed by service
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses."""
        return {
            "scenario_id": str(self.scenario_id),
            "study_case_id": str(self.study_case_id),
            "name": self.name,
            "analysis_type": self.analysis_type.value,
            "fault_type": self.fault_type.value,
            "location": self.location.to_dict(),
            "config": self.config.to_dict(),
            "fault_impedance_type": self.fault_impedance_type.value,
            "fault_mode": self.fault_mode.value,
            "fault_impedance": (self.fault_impedance.to_dict() if self.fault_impedance else None),
            "arc_params": self.arc_params,
            "z0_bus_data": self.z0_bus_data,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "content_hash": self.content_hash,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FaultScenario:
        """Deserialize from dictionary (backward-compatible with v1)."""
        fi_raw = data.get("fault_impedance")
        fault_impedance = FaultImpedance.from_dict(fi_raw) if fi_raw else None

        return cls(
            scenario_id=UUID(data["scenario_id"]),
            study_case_id=UUID(data["study_case_id"]),
            name=data.get("name", ""),
            fault_type=FaultType(data["fault_type"]),
            location=FaultLocation.from_dict(data["location"]),
            config=ShortCircuitConfig.from_dict(data.get("config", {})),
            fault_impedance_type=FaultImpedanceType(data.get("fault_impedance_type", "METALLIC")),
            fault_mode=FaultMode(data.get("fault_mode", "METALLIC")),
            fault_impedance=fault_impedance,
            arc_params=data.get("arc_params"),
            z0_bus_data=data.get("z0_bus_data"),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            content_hash=data.get("content_hash", ""),
        )


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


class FaultScenarioValidationError(Exception):
    """Raised when FaultScenario invariants are violated."""

    pass


def validate_fault_scenario(scenario: FaultScenario) -> None:
    """
    Validate FaultScenario invariants. Raises on violation.

    v1 Rules:
    - name is required (non-empty)
    - SC_1F requires z0_bus_data
    - location_type="BRANCH" requires position in (0,1)
    - location_type="BUS" requires position = None
    - c_factor > 0
    - thermal_time_seconds > 0

    v2 Rules (PR-25):
    - location_type="NODE" → position must be None
    - location_type="BRANCH_POINT" → position (alpha) must be in [0,1]
    - fault_mode=METALLIC → fault_impedance must be None
    - fault_mode=IMPEDANCE → fault_impedance is required
    - arc_params must be None (unsupported in v2)
    """
    if not scenario.name or not scenario.name.strip():
        raise FaultScenarioValidationError("Nazwa scenariusza jest wymagana")

    loc = scenario.location

    if not loc.element_ref or not loc.element_ref.strip():
        raise FaultScenarioValidationError(
            "Identyfikator węzła zwarcia (element_ref) jest wymagany"
        )

    # v1 location rules (BUS, BRANCH)
    if loc.location_type == "BUS" and loc.position is not None:
        raise FaultScenarioValidationError(
            "Lokalizacja BUS nie może mieć pozycji (position musi być None)"
        )

    if loc.location_type == "BRANCH":
        if loc.position is None:
            raise FaultScenarioValidationError("Lokalizacja BRANCH wymaga pozycji (position)")
        if not (0.0 < loc.position < 1.0):
            raise FaultScenarioValidationError(
                f"Pozycja na gałęzi musi być w zakresie (0, 1), otrzymano: {loc.position}"
            )

    # v2 location rules (NODE, BRANCH_POINT) — PR-25
    if loc.location_type == "NODE" and loc.position is not None:
        raise FaultScenarioValidationError(
            "Lokalizacja NODE nie może mieć pozycji (position musi być None)"
        )

    if loc.location_type == "BRANCH_POINT":
        if loc.position is None:
            raise FaultScenarioValidationError(
                "Lokalizacja BRANCH_POINT wymaga parametru alpha (position)"
            )
        if not (0.0 <= loc.position <= 1.0):
            raise FaultScenarioValidationError(
                f"Parametr alpha musi być w zakresie [0, 1], otrzymano: {loc.position}"
            )

    # v2 fault mode rules — PR-25
    if scenario.fault_mode == FaultMode.METALLIC and scenario.fault_impedance is not None:
        raise FaultScenarioValidationError(
            "Tryb metaliczny (METALLIC) nie dopuszcza impedancji zwarcia (fault_impedance)"
        )

    if scenario.fault_mode == FaultMode.IMPEDANCE and scenario.fault_impedance is None:
        raise FaultScenarioValidationError(
            "Tryb impedancyjny (IMPEDANCE) wymaga jawnej impedancji zwarcia (fault_impedance)"
        )

    # v2 arc_params — unsupported, deterministic rejection — PR-25
    if scenario.arc_params is not None:
        raise FaultScenarioValidationError(
            "Parametry łuku (arc_params) nie są obsługiwane w bieżącej wersji"
        )

    if scenario.fault_type == FaultType.SC_1F and scenario.z0_bus_data is None:
        raise FaultScenarioValidationError(
            "Zwarcie jednofazowe (SC_1F) wymaga danych impedancji zerowej (z0_bus_data)"
        )

    if scenario.config.c_factor <= 0:
        raise FaultScenarioValidationError("Współczynnik napięciowy c_factor musi być > 0")

    if scenario.config.thermal_time_seconds <= 0:
        raise FaultScenarioValidationError("Czas cieplny thermal_time_seconds musi być > 0")


# ---------------------------------------------------------------------------
# Factory Functions
# ---------------------------------------------------------------------------


def compute_scenario_content_hash(scenario: FaultScenario) -> str:
    """
    Compute deterministic SHA-256 of scenario content.

    Hash covers: name, fault_type, location, config, fault_impedance_type,
    fault_mode, fault_impedance, arc_params, z0_bus_data, analysis_type.
    Sorted keys for determinism. Compact separators. UTF-8 encoding.
    """
    content = {
        "analysis_type": scenario.analysis_type.value,
        "arc_params": scenario.arc_params,
        "config": scenario.config.to_dict(),
        "fault_impedance": (
            scenario.fault_impedance.to_dict() if scenario.fault_impedance else None
        ),
        "fault_impedance_type": scenario.fault_impedance_type.value,
        "fault_mode": scenario.fault_mode.value,
        "fault_type": scenario.fault_type.value,
        "location": scenario.location.to_dict(),
        "name": scenario.name,
        "z0_bus_data": scenario.z0_bus_data,
    }
    payload = json.dumps(content, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _now_utc_iso() -> str:
    """Deterministic UTC timestamp as ISO string."""
    return datetime.now(UTC).isoformat()


def new_fault_scenario(
    *,
    study_case_id: UUID,
    name: str,
    fault_type: FaultType,
    location: FaultLocation,
    config: ShortCircuitConfig | None = None,
    fault_impedance_type: FaultImpedanceType = FaultImpedanceType.METALLIC,
    fault_mode: FaultMode = FaultMode.METALLIC,
    fault_impedance: FaultImpedance | None = None,
    arc_params: dict[str, Any] | None = None,
    z0_bus_data: dict[str, Any] | None = None,
) -> FaultScenario:
    """
    Create a new FaultScenario with computed content_hash.

    Validates invariants before returning.

    Args:
        study_case_id: UUID of the parent study case.
        name: User-facing Polish name (required).
        fault_type: SC_3F, SC_2F, or SC_1F.
        location: Fault location (bus/branch/node/branch_point).
        config: Short-circuit config (defaults to standard).
        fault_impedance_type: METALLIC (v1 default, backward-compat).
        fault_mode: METALLIC or IMPEDANCE (v2).
        fault_impedance: Explicit Zf (required for IMPEDANCE, forbidden for METALLIC).
        arc_params: Reserved — unsupported in v2 (must be None).
        z0_bus_data: Zero-sequence impedance data (required for SC_1F).

    Returns:
        Validated FaultScenario with computed content_hash.

    Raises:
        FaultScenarioValidationError: If invariants are violated.
    """
    cfg = config if config is not None else ShortCircuitConfig()
    now = _now_utc_iso()

    # Build scenario without hash first
    scenario = FaultScenario(
        scenario_id=uuid4(),
        study_case_id=study_case_id,
        name=name,
        fault_type=fault_type,
        location=location,
        config=cfg,
        fault_impedance_type=fault_impedance_type,
        fault_mode=fault_mode,
        fault_impedance=fault_impedance,
        arc_params=arc_params,
        z0_bus_data=z0_bus_data,
        created_at=now,
        updated_at=now,
        content_hash="",  # Placeholder
    )

    # Validate invariants
    validate_fault_scenario(scenario)

    # Compute content hash
    content_hash = compute_scenario_content_hash(scenario)

    # Return with hash (frozen → need new instance)
    return FaultScenario(
        scenario_id=scenario.scenario_id,
        study_case_id=scenario.study_case_id,
        name=scenario.name,
        fault_type=scenario.fault_type,
        location=scenario.location,
        config=scenario.config,
        fault_impedance_type=scenario.fault_impedance_type,
        fault_mode=scenario.fault_mode,
        fault_impedance=scenario.fault_impedance,
        arc_params=scenario.arc_params,
        z0_bus_data=scenario.z0_bus_data,
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
        content_hash=content_hash,
    )
