"""
Network Wizard Schema — Pydantic v2 models for wizard API.

Supports the network creation wizard (K1–K10) with:
- ENM validation (readiness gates)
- Step completion tracking
- Analysis readiness matrix

BINDING: Polish labels, no project codenames.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class StepStatus(str, Enum):
    """Status jednego kroku kreatora."""

    EMPTY = "empty"
    PARTIAL = "partial"
    COMPLETE = "complete"
    ERROR = "error"


class IssueSeverity(str, Enum):
    """Priorytet problemu walidacji."""

    BLOCKER = "BLOCKER"
    IMPORTANT = "IMPORTANT"
    INFO = "INFO"


class WizardIssue(BaseModel):
    """Pojedynczy problem walidacji kreatora."""

    code: str = Field(..., description="Kod problemu (np. K2_NO_SOURCE)")
    severity: IssueSeverity
    message_pl: str = Field(..., description="Komunikat po polsku")
    element_ref: str | None = Field(default=None, description="ref_id elementu")
    wizard_step_hint: str | None = Field(default=None, description="Krok kreatora (K1-K10)")
    suggested_fix: str | None = Field(default=None, description="Sugestia naprawy")


class StepState(BaseModel):
    """Stan jednego kroku kreatora."""

    step_id: str = Field(..., description="Identyfikator kroku (K1-K10)")
    status: StepStatus
    completion_percent: int = Field(ge=0, le=100, description="Procent ukończenia (0-100)")
    issues: list[WizardIssue] = Field(default_factory=list)


class AnalysisReadiness(BaseModel):
    """Gotowość jednej analizy."""

    available: bool = Field(..., description="Czy analiza jest dostępna")
    missing_requirements: list[str] = Field(
        default_factory=list, description="Brakujące wymagania (PL)"
    )


class ReadinessMatrix(BaseModel):
    """Macierz gotowości analiz."""

    short_circuit_3f: AnalysisReadiness
    short_circuit_1f: AnalysisReadiness
    load_flow: AnalysisReadiness


class ElementCounts(BaseModel):
    """Liczba elementów w modelu."""

    buses: int = 0
    sources: int = 0
    transformers: int = 0
    branches: int = 0
    loads: int = 0
    generators: int = 0


class WizardStateResponse(BaseModel):
    """Pełny stan kreatora sieci — odpowiedź API."""

    steps: list[StepState]
    overall_status: str = Field(..., description="empty | incomplete | ready | blocked")
    readiness_matrix: ReadinessMatrix
    element_counts: ElementCounts


class WizardStepRequest(BaseModel):
    """Żądanie aktualizacji kroku kreatora."""

    step_id: str = Field(..., description="K1-K10")
    data: dict[str, Any] = Field(default_factory=dict, description="Dane kroku")


# ---------------------------------------------------------------------------
# ENM sub-schemas for wizard payloads
# ---------------------------------------------------------------------------


class BusPayload(BaseModel):
    """Szyna — payload kreatora."""

    ref_id: str
    name: str
    voltage_kv: float = Field(gt=0)
    phase_system: str = "3ph"
    tags: list[str] = Field(default_factory=list)


class SourcePayload(BaseModel):
    """Źródło zasilania — payload kreatora."""

    ref_id: str
    name: str
    bus_ref: str
    model: str = "short_circuit_power"
    sk3_mva: float | None = None
    rx_ratio: float | None = None
    r_ohm: float | None = None
    x_ohm: float | None = None


class BranchPayload(BaseModel):
    """Gałąź (linia/kabel) — payload kreatora."""

    ref_id: str
    name: str
    branch_type: str = "line_overhead"
    from_bus_ref: str
    to_bus_ref: str
    length_km: float = Field(ge=0)
    r_ohm_per_km: float = Field(ge=0)
    x_ohm_per_km: float = Field(ge=0)
    r0_ohm_per_km: float | None = None
    x0_ohm_per_km: float | None = None


class TransformerPayload(BaseModel):
    """Transformator — payload kreatora."""

    ref_id: str
    name: str
    hv_bus_ref: str
    lv_bus_ref: str
    sn_mva: float = Field(gt=0)
    uhv_kv: float = Field(gt=0)
    ulv_kv: float = Field(gt=0)
    uk_percent: float = Field(gt=0, le=100)
    pk_kw: float = Field(ge=0)


class LoadPayload(BaseModel):
    """Odbiór — payload kreatora."""

    ref_id: str
    name: str
    bus_ref: str
    p_mw: float
    q_mvar: float
    model: str = "pq"


class GeneratorPayload(BaseModel):
    """Generator / OZE — payload kreatora.

    PV/BESS WYMAGA jawnego connection_variant:
    - 'nn_side': po stronie nN stacji (przez transformator stacji SN/nN)
    - 'block_transformer': przez transformator blokowy do SN
    Brak connection_variant dla PV/BESS → FixAction generator.connection_variant_missing.
    """

    ref_id: str
    name: str
    bus_ref: str
    p_mw: float
    q_mvar: float | None = None
    gen_type: str | None = None
    catalog_ref: str | None = None
    connection_variant: str | None = None
    blocking_transformer_ref: str | None = None
    station_ref: str | None = None


# ---------------------------------------------------------------------------
# Step controller response schemas
# ---------------------------------------------------------------------------


class ApplyStepResponse(BaseModel):
    """Odpowiedź z atomowego zastosowania kroku kreatora."""

    success: bool = Field(..., description="Czy krok został zastosowany pomyślnie")
    step_id: str = Field(..., description="Krok (K1-K10)")
    precondition_issues: list[WizardIssue] = Field(default_factory=list)
    postcondition_issues: list[WizardIssue] = Field(default_factory=list)
    can_proceed: bool = Field(
        default=False, description="Czy przejście do następnego kroku jest dozwolone"
    )
    current_step: str = Field(default="K1")
    next_step: str | None = Field(default=None)
    revision: int = Field(default=0, description="Rewizja ENM po zastosowaniu")
    wizard_state: WizardStateResponse | None = Field(
        default=None, description="Pełny stan kreatora po zastosowaniu"
    )


class CanProceedResponse(BaseModel):
    """Odpowiedź na zapytanie o możliwość przejścia."""

    allowed: bool
    from_step: str
    to_step: str
    blocking_issues: list[WizardIssue] = Field(default_factory=list)
