"""
Canonical solver-input contracts (Pydantic v2).

Defines the versioned, deterministic envelope and payload schemas
for all supported analysis types. These schemas constitute a LOCKED
contract — changes require an explicit version bump.

Contract version: 1.0
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Contract version
# ---------------------------------------------------------------------------

#: 1.1 (karta FAB-D2, D2): TransformerPayload.i0_percent/p0_kw/vector_group
#: stają się Optional — brak danej w katalogu/instancji nie jest już
#: fabrykowany jako 0.0/"Dyn11". Zmiana addytywna (typ pola, nie kształt
#: kontraktu) — istniejące payloady z jawną wartością serializują się identycznie.
SOLVER_INPUT_CONTRACT_VERSION = "1.1"


# ---------------------------------------------------------------------------
# Analysis type
# ---------------------------------------------------------------------------


class SolverAnalysisType(StrEnum):
    """Analysis types supported by the solver-input contract."""

    SHORT_CIRCUIT_3F = "short_circuit_3f"
    SHORT_CIRCUIT_1F = "short_circuit_1f"
    LOAD_FLOW = "load_flow"
    PROTECTION = "protection"


# ---------------------------------------------------------------------------
# Eligibility
# ---------------------------------------------------------------------------


class SolverInputIssueSeverity(StrEnum):
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
    # Karta P0.3: c PER PASMO (IEC 60909-0 Table 1) for THIS bus's own voltage
    # band, for the payload's scenario — <=1 kV -> 1.05/0.95, >1 kV -> 1.10/1.00
    # (network_model.core.voltage_factor.c_for_node). Informational only: this
    # preview payload is not tied to one fault node, so every bus carries the
    # c that WOULD apply if a fault were placed here.
    c_factor_iec60909: float | None = None

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
    # `None` = dana nieznana w katalogu/instancji (karta FAB-D2, D2) — gałąź
    # magnesująca transformatora nieuwzględniona w tym wejściu (WARNING
    # `transformer.no_load_params_missing`, ślad White Box niesie założenie).
    i0_percent: float | None
    p0_kw: float | None
    # `None` = grupa połączeń nieznana — BLOCKER `transformer.vector_group_missing`
    # dla analiz zależnych od składowej zerowej (SHORT_CIRCUIT_1F).
    vector_group: str | None
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


class SimplifiedGridSource(BaseModel):
    """
    Simplified grid Thevenin source per /goal V12K (P0.9 — toggle uproszczony).

    Used when StudyCaseConfig.sc_input_mode == 'simplified'. Projektant
    deklaruje moc zwarciową S″k oraz stosunek R/X po stronie SN, zamiast
    pełnego modelu strony 110 kV + TR + GPZ.

    Solver IEC 60909 oblicza Z_thevenin z S″k:
        |Z| = c × U_n² / S″k
        X = |Z| × sqrt(1 / (1 + (R/X)²))
        R = X × (R/X)

    Status: SCHEMA delivered. Solver consumption (rewiring IEC 60909 to
    consume this when present) deferred do follow-up sprint.

    Reference:
    - docs/sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md Krok 3 (tryb uproszczony)
    - docs/audit/ENGINEER_WORKFLOW_AUDIT.md § 3.1
    """

    sk_mva: float = Field(..., gt=0.0, description="Moc zwarciowa S″k po stronie SN [MVA]")
    r_x_ratio: float = Field(
        default=0.1, ge=0.0, description="Stosunek R/X po stronie SN (typowo 0.1 dla SN)"
    )

    model_config = {"frozen": True}


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
    # P0.9 V12K: simplified grid source (used when sc_input_mode == 'simplified').
    # Optional — None means solver uses full 110 kV + TR model from buses/branches.
    simplified_grid_source: SimplifiedGridSource | None = None
    # Karta P0.3: SHORT_CIRCUIT_MIN as a scenario, not a separate analysis_type
    # (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3). "MAX" -> Ik''max/Ip/Ith (default,
    # backward compatible); "MIN" -> Ik''min with per-bus c (see BusPayload.
    # c_factor_iec60909) and R_theta line/cable temperature correction applied
    # at execution time (application.solvers.lv_temperature_correction).
    scenario: Literal["MAX", "MIN"] = "MAX"

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
    # Phase 12: audit2 extensions — additive (nie zmienia frozen Result API).
    # Solvery moga je czytac aby uwzglednic tap-changer settings, BESS modes,
    # block-trafo Z, MV grounding type. Brak (None) = solver dziala jak dotychczas.
    audit2_extensions: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Audit2 extensions: {sc_iec60909_extensions, power_flow_extensions, "
            "protection_extensions} — additive, optional"
        ),
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
