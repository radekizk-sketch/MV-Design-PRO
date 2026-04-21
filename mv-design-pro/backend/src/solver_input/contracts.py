"""
Canonical solver-input contracts (Pydantic v2).

Defines the versioned, deterministic envelope and payload schemas
for all supported analysis types. These schemas constitute a LOCKED
contract — changes require an explicit version bump.

Contract version: 1.0
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Contract version
# ---------------------------------------------------------------------------

SOLVER_INPUT_CONTRACT_VERSION = "1.0"


# ---------------------------------------------------------------------------
# Analysis type
# ---------------------------------------------------------------------------


class SolverAnalysisType(str, Enum):
    """Analysis types supported by the solver-input contract."""

    SHORT_CIRCUIT_3F = "short_circuit_3f"
    SHORT_CIRCUIT_1F = "short_circuit_1f"
    LOAD_FLOW = "load_flow"
    PROTECTION = "protection"


# ---------------------------------------------------------------------------
# Eligibility
# ---------------------------------------------------------------------------


class SolverInputIssueSeverity(str, Enum):
    BLOCKER = "BLOCKER"
    WARNING = "WARNING"
    INFO = "INFO"


class SolverInputIssue(BaseModel):
    """Issue found during solver-input generation."""

    code: str = Field(..., description="Stable machine code (e.g. E-D01, SI-001)")
    severity: SolverInputIssueSeverity
    message: str = Field(..., description="Technical description")
    element_ref: str | None = Field(default=None, description="Affected element ref_id")
    field_path: str | None = Field(default=None, description="Affected field path")

    model_config = {"frozen": True}


class EligibilityResult(BaseModel):
    """Eligibility assessment for a single analysis type."""

    eligible: bool
    blockers: list[SolverInputIssue] = Field(default_factory=list)
    warnings: list[SolverInputIssue] = Field(default_factory=list)
    infos: list[SolverInputIssue] = Field(default_factory=list)

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Provenance (Pydantic mirror of provenance.py for API serialization)
# ---------------------------------------------------------------------------


class ProvenanceEntrySchema(BaseModel):
    """Provenance trace entry for API responses."""

    element_ref: str
    field_path: str
    source_kind: str  # CATALOG / OVERRIDE / DERIVED / DEFAULT_FORBIDDEN
    source_ref: dict[str, Any] = Field(default_factory=dict)
    value_hash: str = ""
    unit: str | None = None
    note: str | None = None

    model_config = {"frozen": True}


class ProvenanceSummarySchema(BaseModel):
    """Aggregated provenance summary for API responses."""

    catalog_refs_used: list[str] = Field(default_factory=list)
    overrides_used_count: int = 0
    overrides_used_refs: list[str] = Field(default_factory=list)
    derived_fields_count: int = 0

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Payload element schemas (solver-facing, strict)
# ---------------------------------------------------------------------------


class BusPayload(BaseModel):
    """Bus/node entry in solver-input payload."""

    ref_id: str
    name: str
    node_type: str  # SLACK / PQ / PV
    voltage_level_kv: float
    voltage_magnitude_pu: float | None = None
    voltage_angle_rad: float | None = None
    active_power_mw: float | None = None
    reactive_power_mvar: float | None = None

    model_config = {"frozen": True}


class BranchPayload(BaseModel):
    """Line/cable branch entry in solver-input payload."""

    ref_id: str
    name: str
    branch_type: str  # LINE / CABLE
    from_bus_ref: str
    to_bus_ref: str
    r_ohm_per_km: float
    x_ohm_per_km: float
    b_us_per_km: float
    length_km: float
    rated_current_a: float
    in_service: bool = True
    catalog_ref: str | None = None

    model_config = {"frozen": True}


class TransformerPayload(BaseModel):
    """Transformer entry in solver-input payload."""

    ref_id: str
    name: str
    from_bus_ref: str
    to_bus_ref: str
    rated_power_mva: float
    voltage_hv_kv: float
    voltage_lv_kv: float
    uk_percent: float
    pk_kw: float
    i0_percent: float
    p0_kw: float
    vector_group: str
    tap_position: int
    tap_step_percent: float
    in_service: bool = True
    catalog_ref: str | None = None

    model_config = {"frozen": True}


class InverterSourcePayload(BaseModel):
    """Inverter-based DER source entry in solver-input payload."""

    ref_id: str
    name: str
    bus_ref: str
    converter_kind: str | None = None  # PV / WIND / BESS
    in_rated_a: float
    k_sc: float
    contributes_negative_sequence: bool = False
    contributes_zero_sequence: bool = False
    in_service: bool = True
    catalog_ref: str | None = None

    model_config = {"frozen": True}


class SwitchPayload(BaseModel):
    """Switch entry in solver-input payload (topology only)."""

    ref_id: str
    name: str
    switch_type: str  # BREAKER / DISCONNECTOR / LOAD_SWITCH / ...
    from_bus_ref: str
    to_bus_ref: str
    state: str  # OPEN / CLOSED
    in_service: bool = True

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Analysis-specific payload wrappers
# ---------------------------------------------------------------------------


class ShortCircuitPayload(BaseModel):
    """Payload for short-circuit analysis (3F or 1F)."""

    buses: list[BusPayload] = Field(default_factory=list)
    branches: list[BranchPayload] = Field(default_factory=list)
    transformers: list[TransformerPayload] = Field(default_factory=list)
    inverter_sources: list[InverterSourcePayload] = Field(default_factory=list)
    switches: list[SwitchPayload] = Field(default_factory=list)
    c_factor: float = 1.10
    thermal_time_seconds: float = 1.0
    include_inverter_contribution: bool = True

    model_config = {"frozen": True}


class LoadFlowPayload(BaseModel):
    """Payload for load-flow (power-flow) analysis."""

    buses: list[BusPayload] = Field(default_factory=list)
    branches: list[BranchPayload] = Field(default_factory=list)
    transformers: list[TransformerPayload] = Field(default_factory=list)
    inverter_sources: list[InverterSourcePayload] = Field(default_factory=list)
    switches: list[SwitchPayload] = Field(default_factory=list)
    base_mva: float = 100.0
    max_iterations: int = 50
    tolerance: float = 1e-6

    model_config = {"frozen": True}


class ProtectionPayload(BaseModel):
    """Stub payload for protection analysis (not implemented in PR-12)."""

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Envelope (top-level container)
# ---------------------------------------------------------------------------


class SolverInputEnvelope(BaseModel):
    """
    Canonical solver-input envelope.

    This is the top-level container returned by the solver-input builder
    and the API endpoint. It wraps the analysis-specific payload with
    eligibility, provenance, and versioning metadata.
    """

    solver_input_version: str = SOLVER_INPUT_CONTRACT_VERSION
    case_id: str
    enm_revision: str
    analysis_type: SolverAnalysisType
    eligibility: EligibilityResult
    provenance_summary: ProvenanceSummarySchema = Field(default_factory=ProvenanceSummarySchema)
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Analysis-specific payload (strict schema per analysis_type)",
    )
    trace: list[ProvenanceEntrySchema] = Field(
        default_factory=list,
        description="Per-field provenance trace entries",
    )

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Eligibility map (multi-analysis)
# ---------------------------------------------------------------------------


class AnalysisEligibilityEntry(BaseModel):
    """Eligibility status for one analysis type."""

    analysis_type: SolverAnalysisType
    eligible: bool
    blockers: list[SolverInputIssue] = Field(default_factory=list)
    warnings: list[SolverInputIssue] = Field(default_factory=list)

    model_config = {"frozen": True}


class EligibilityMap(BaseModel):
    """Map of analysis types to eligibility status (returned by eligibility endpoint)."""

    entries: list[AnalysisEligibilityEntry] = Field(default_factory=list)

    model_config = {"frozen": True}
