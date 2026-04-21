"""
Line Overcurrent Setting Models — FIX-12D

Input, output, and intermediate models for I>> setting analysis.

CANONICAL ALIGNMENT:
- Frozen dataclasses for immutability
- Deterministic serialization
- Polish labels

METHODOLOGY COEFFICIENTS (from lecture materials):
- kb (selectivity): 1.1 - 1.3 typical, accounts for CT errors and relay tolerance
- kc (sensitivity): 1.2 - 1.5 typical, ensures reliable trip for min fault
- kbth (thermal): 0.8 - 1.0 typical, safety margin for thermal capacity

THERMAL CAPACITY:
- Ithn: rated short-time current for 1s [A]
- jthn: rated short-time current density [A/mm²]
- Ithdop = Ithn / sqrt(tk) or Ithdop = s * jthn / sqrt(tk)
  where tk is total fault duration including SPZ cycles
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any

# =============================================================================
# ENUMS
# =============================================================================


class ConductorMaterial(str, Enum):
    """Conductor/cable material type."""

    COPPER = "COPPER"  # Miedź
    ALUMINUM = "ALUMINUM"  # Aluminium
    ACSR = "ACSR"  # Aluminium-stalowy (AFL)
    XLPE_CU = "XLPE_CU"  # Kabel XLPE miedziany
    XLPE_AL = "XLPE_AL"  # Kabel XLPE aluminiowy


# Short-time current density [A/mm²] for 1s - from IEC/PN standards
MATERIAL_JTHN: dict[ConductorMaterial, float] = {
    ConductorMaterial.COPPER: 143.0,  # Cu cables
    ConductorMaterial.ALUMINUM: 94.0,  # Al cables
    ConductorMaterial.ACSR: 88.0,  # ACSR overhead lines
    ConductorMaterial.XLPE_CU: 143.0,  # XLPE Cu
    ConductorMaterial.XLPE_AL: 94.0,  # XLPE Al
}

# Polish labels for conductor materials
MATERIAL_LABELS_PL: dict[str, str] = {
    "COPPER": "Miedź",
    "ALUMINUM": "Aluminium",
    "ACSR": "Aluminium-stalowy (AFL)",
    "XLPE_CU": "Kabel XLPE miedziany",
    "XLPE_AL": "Kabel XLPE aluminiowy",
}


class SPZMode(str, Enum):
    """SPZ (Auto-reclosing) mode."""

    DISABLED = "DISABLED"  # SPZ wyłączone
    SINGLE = "SINGLE"  # SPZ jednokrotne (1x)
    DOUBLE = "DOUBLE"  # SPZ dwukrotne (2x)


SPZ_MODE_LABELS_PL: dict[str, str] = {
    "DISABLED": "SPZ wyłączone",
    "SINGLE": "SPZ jednokrotne (1x)",
    "DOUBLE": "SPZ dwukrotne (2x)",
}


class GenerationSourceType(str, Enum):
    """Type of local generation source (for E-L mode)."""

    SYNCHRONOUS = "SYNCHRONOUS"  # Generator synchroniczny
    ASYNCHRONOUS = "ASYNCHRONOUS"  # Generator asynchroniczny
    INVERTER = "INVERTER"  # Falownik (PV, BESS)


GENERATION_SOURCE_LABELS_PL: dict[str, str] = {
    "SYNCHRONOUS": "Generator synchroniczny",
    "ASYNCHRONOUS": "Generator asynchroniczny",
    "INVERTER": "Źródło falownikowe (PV/BESS)",
}


class LineOvercurrentVerdict(str, Enum):
    """Verdict for I>> setting analysis."""

    PASS = "PASS"  # Zgodne
    MARGINAL = "MARGINAL"  # Graniczne
    FAIL = "FAIL"  # Niezgodne
    ERROR = "ERROR"  # Błąd analizy


VERDICT_LABELS_PL: dict[str, str] = {
    "PASS": "Zgodne",
    "MARGINAL": "Graniczne",
    "FAIL": "Niezgodne",
    "ERROR": "Błąd analizy",
}


# =============================================================================
# INPUT DATA STRUCTURES
# =============================================================================


@dataclass(frozen=True)
class ConductorData:
    """
    Conductor/cable data for thermal capacity calculation.

    Attributes:
        material: Conductor material type
        cross_section_mm2: Cross-section area [mm²]
        ithn_a: Rated short-time current for 1s [A] (if known)
        jthn_a_mm2: Rated short-time current density [A/mm²] (if known)
        theta_b_deg: Initial temperature [°C]
        theta_k_deg: Final (short-circuit) temperature [°C]
    """

    material: ConductorMaterial
    cross_section_mm2: float
    ithn_a: float | None = None  # Ithn given directly
    jthn_a_mm2: float | None = None  # jthn given directly
    theta_b_deg: float = 40.0  # Initial temperature (operating)
    theta_k_deg: float = 250.0  # Final temperature (short-circuit for XLPE)

    def get_ithn(self) -> float:
        """
        Get or calculate Ithn [A].

        If ithn_a is provided, return it directly.
        Otherwise calculate from cross-section and material.
        """
        if self.ithn_a is not None:
            return self.ithn_a

        # Use provided jthn or material default
        jthn = self.jthn_a_mm2 if self.jthn_a_mm2 else MATERIAL_JTHN.get(self.material, 94.0)
        return self.cross_section_mm2 * jthn

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "material": self.material.value,
            "material_pl": MATERIAL_LABELS_PL.get(self.material.value, self.material.value),
            "cross_section_mm2": self.cross_section_mm2,
            "ithn_a": self.ithn_a,
            "jthn_a_mm2": self.jthn_a_mm2,
            "theta_b_deg": self.theta_b_deg,
            "theta_k_deg": self.theta_k_deg,
            "computed_ithn_a": self.get_ithn(),
        }


@dataclass(frozen=True)
class SPZConfig:
    """
    SPZ (Auto-reclosing) configuration.

    Attributes:
        mode: SPZ mode (disabled/single/double)
        t_dead_1_s: First dead time [s]
        t_dead_2_s: Second dead time [s] (only for double SPZ)
        t_fault_max_s: Maximum single fault duration [s]
    """

    mode: SPZMode = SPZMode.DISABLED
    t_dead_1_s: float = 0.5  # First dead time
    t_dead_2_s: float = 15.0  # Second dead time (longer)
    t_fault_max_s: float = 0.5  # Max fault duration per cycle

    def get_total_fault_time_s(self, breaker_time_s: float = 0.05) -> float:
        """
        Calculate total fault duration including SPZ cycles.

        Args:
            breaker_time_s: Circuit breaker operating time [s]

        Returns:
            Total fault time tk [s]
        """
        if self.mode == SPZMode.DISABLED:
            # Single trip: fault time + breaker time
            return self.t_fault_max_s + breaker_time_s

        if self.mode == SPZMode.SINGLE:
            # 2 fault cycles: initial + after SPZ
            return 2 * (self.t_fault_max_s + breaker_time_s)

        if self.mode == SPZMode.DOUBLE:
            # 3 fault cycles: initial + after 1st SPZ + after 2nd SPZ
            return 3 * (self.t_fault_max_s + breaker_time_s)

        return self.t_fault_max_s + breaker_time_s

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "mode": self.mode.value,
            "mode_pl": SPZ_MODE_LABELS_PL.get(self.mode.value, self.mode.value),
            "t_dead_1_s": self.t_dead_1_s,
            "t_dead_2_s": self.t_dead_2_s,
            "t_fault_max_s": self.t_fault_max_s,
        }


@dataclass(frozen=True)
class LocalGenerationConfig:
    """
    Local generation (E-L) mode configuration.

    For networks with local generation sources (PV, wind, CHP, etc.)
    that contribute to fault currents.

    Attributes:
        enabled: Whether E-L mode is active
        source_type: Type of generation source
        ik_contribution_max_a: Max fault current contribution from E-L [A]
        ik_contribution_min_a: Min fault current contribution from E-L [A]
        zsz_blocking_risk: Check for busbar protection blocking risk
    """

    enabled: bool = False
    source_type: GenerationSourceType | None = None
    ik_contribution_max_a: float = 0.0
    ik_contribution_min_a: float = 0.0
    zsz_blocking_risk: bool = False  # Check for ZSZ blocking

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "enabled": self.enabled,
            "source_type": self.source_type.value if self.source_type else None,
            "source_type_pl": (
                GENERATION_SOURCE_LABELS_PL.get(self.source_type.value, self.source_type.value)
                if self.source_type
                else None
            ),
            "ik_contribution_max_a": self.ik_contribution_max_a,
            "ik_contribution_min_a": self.ik_contribution_min_a,
            "zsz_blocking_risk": self.zsz_blocking_risk,
        }


@dataclass(frozen=True)
class LineOvercurrentSettingInput:
    """
    Complete input for I>> setting analysis.

    Attributes:
        line_id: Line/branch identifier
        line_name: Human-readable line name
        ct_ratio: CT ratio (primary/secondary), e.g. 400/5 → 80
        conductor: Conductor/cable data for thermal calculation
        spz_config: SPZ configuration
        local_generation: Local generation (E-L) configuration

        # Fault currents from SC solver (NOT calculated here!)
        ik_max_busbars_a: Max fault current at supply busbars [A]
        ik_min_busbars_a: Min fault current at supply busbars [A]
        ik_max_next_protection_a: Max fault at next downstream protection [A]
        ik_min_2f_busbars_a: Min 2-phase fault at busbars [A] (for sensitivity)

        # Timing parameters
        t_nast_1_s: Protection stage 1 (I>) time [s]
        t_nast_2_s: Protection stage 2 (I>>) time [s] - usually 0
        t_breaker_s: Circuit breaker operating time [s]

        # Methodology coefficients (with defaults from lecture)
        kb: Selectivity coefficient (1.1 - 1.3)
        kc: Sensitivity coefficient (1.2 - 1.5)
        kbth: Thermal coefficient (0.8 - 1.0)
    """

    line_id: str
    line_name: str
    ct_ratio: float  # θi - CT transformation ratio

    # Conductor data
    conductor: ConductorData

    # SPZ configuration
    spz_config: SPZConfig = field(default_factory=SPZConfig)

    # Local generation (E-L) mode
    local_generation: LocalGenerationConfig = field(default_factory=LocalGenerationConfig)

    # Fault currents (from SC solver results - NOT CALCULATED HERE)
    ik_max_busbars_a: float = 0.0  # I''k max at supply busbars
    ik_min_busbars_a: float = 0.0  # I''k min at supply busbars
    ik_max_next_protection_a: float = 0.0  # I''k max at next protection point
    ik_min_2f_busbars_a: float | None = None  # I''k min 2-phase at busbars

    # Timing parameters
    t_nast_1_s: float = 0.5  # I> time (time-delayed)
    t_nast_2_s: float = 0.0  # I>> time (instantaneous or short)
    t_breaker_s: float = 0.05  # Breaker operating time

    # Methodology coefficients (defaults from lecture materials)
    kb: float = 1.2  # Selectivity coefficient
    kc: float = 1.5  # Sensitivity coefficient
    kbth: float = 0.9  # Thermal coefficient

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "line_id": self.line_id,
            "line_name": self.line_name,
            "ct_ratio": self.ct_ratio,
            "conductor": self.conductor.to_dict(),
            "spz_config": self.spz_config.to_dict(),
            "local_generation": self.local_generation.to_dict(),
            "ik_max_busbars_a": self.ik_max_busbars_a,
            "ik_min_busbars_a": self.ik_min_busbars_a,
            "ik_max_next_protection_a": self.ik_max_next_protection_a,
            "ik_min_2f_busbars_a": self.ik_min_2f_busbars_a,
            "t_nast_1_s": self.t_nast_1_s,
            "t_nast_2_s": self.t_nast_2_s,
            "t_breaker_s": self.t_breaker_s,
            "kb": self.kb,
            "kc": self.kc,
            "kbth": self.kbth,
        }


# =============================================================================
# CRITERION RESULTS
# =============================================================================


@dataclass(frozen=True)
class SelectivityCriterionResult:
    """
    Result of selectivity criterion (I>> selektywność).

    Criterion: I_nast >= kb * Ikmax(next_protection) / θi

    Attributes:
        i_min_secondary_a: Minimum setting (secondary) [A]
        i_min_primary_a: Minimum setting (primary) [A]
        ik_max_next_a: Max fault at next protection [A]
        kb_used: Selectivity coefficient used
        ct_ratio: CT ratio used
        verdict: PASS/MARGINAL/FAIL
        notes_pl: Polish explanation
    """

    i_min_secondary_a: float  # I_nast_min on relay side
    i_min_primary_a: float  # I_nast_min on line side
    ik_max_next_a: float
    kb_used: float
    ct_ratio: float
    verdict: LineOvercurrentVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "criterion": "selectivity",
            "criterion_pl": "Selektywność I>>",
            "i_min_secondary_a": self.i_min_secondary_a,
            "i_min_primary_a": self.i_min_primary_a,
            "ik_max_next_a": self.ik_max_next_a,
            "kb_used": self.kb_used,
            "ct_ratio": self.ct_ratio,
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }


@dataclass(frozen=True)
class SensitivityCriterionResult:
    """
    Result of sensitivity criterion (I>> czułość).

    Criterion: Ikmin(busbars) / θi >= kc * I_nast

    Attributes:
        i_max_secondary_a: Maximum setting (secondary) [A]
        i_max_primary_a: Maximum setting (primary) [A]
        ik_min_busbars_a: Min fault at busbars [A]
        kc_used: Sensitivity coefficient used
        ct_ratio: CT ratio used
        verdict: PASS/MARGINAL/FAIL
        notes_pl: Polish explanation
    """

    i_max_secondary_a: float  # I_nast_max on relay side
    i_max_primary_a: float  # I_nast_max on line side
    ik_min_busbars_a: float
    kc_used: float
    ct_ratio: float
    verdict: LineOvercurrentVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "criterion": "sensitivity",
            "criterion_pl": "Czułość I>>",
            "i_max_secondary_a": self.i_max_secondary_a,
            "i_max_primary_a": self.i_max_primary_a,
            "ik_min_busbars_a": self.ik_min_busbars_a,
            "kc_used": self.kc_used,
            "ct_ratio": self.ct_ratio,
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }


@dataclass(frozen=True)
class ThermalCriterionResult:
    """
    Result of thermal criterion (I>> cieplne).

    Criterion: I_nast <= kbth * Ithdop / θi
    where Ithdop = Ithn / sqrt(tk)

    Attributes:
        i_max_secondary_a: Maximum setting (secondary) [A]
        i_max_primary_a: Maximum setting (primary) [A]
        ithn_a: Rated short-time current 1s [A]
        ithdop_a: Permissible thermal current [A]
        tk_s: Total fault duration [s]
        kbth_used: Thermal coefficient used
        ct_ratio: CT ratio used
        verdict: PASS/MARGINAL/FAIL
        notes_pl: Polish explanation
    """

    i_max_secondary_a: float  # I_nast_max on relay side
    i_max_primary_a: float  # I_nast_max on line side
    ithn_a: float
    ithdop_a: float
    tk_s: float
    kbth_used: float
    ct_ratio: float
    verdict: LineOvercurrentVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "criterion": "thermal",
            "criterion_pl": "Wytrzymałość cieplna",
            "i_max_secondary_a": self.i_max_secondary_a,
            "i_max_primary_a": self.i_max_primary_a,
            "ithn_a": self.ithn_a,
            "ithdop_a": self.ithdop_a,
            "tk_s": self.tk_s,
            "kbth_used": self.kbth_used,
            "ct_ratio": self.ct_ratio,
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }


@dataclass(frozen=True)
class SPZBlockingResult:
    """
    Result of SPZ blocking analysis from I>>.

    Determines if SPZ should be blocked when I>> operates.

    Attributes:
        spz_allowed: Whether SPZ is allowed for this I>> setting
        blocking_reason_pl: Reason for blocking (if blocked)
        i_threshold_a: Current threshold for SPZ decision [A]
        i_fault_start_a: Fault current at line start [A]
        tk_single_s: Single fault duration [s]
        verdict: PASS (SPZ allowed) / FAIL (SPZ blocked)
        notes_pl: Polish explanation
    """

    spz_allowed: bool
    blocking_reason_pl: str | None
    i_threshold_a: float
    i_fault_start_a: float
    tk_single_s: float
    verdict: LineOvercurrentVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "criterion": "spz_blocking",
            "criterion_pl": "Blokada SPZ od I>>",
            "spz_allowed": self.spz_allowed,
            "blocking_reason_pl": self.blocking_reason_pl,
            "i_threshold_a": self.i_threshold_a,
            "i_fault_start_a": self.i_fault_start_a,
            "tk_single_s": self.tk_single_s,
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }


@dataclass(frozen=True)
class LocalGenerationDiagnostic:
    """
    Diagnostic for local generation (E-L) mode.

    Reports fault current contributions and ZSZ blocking risk.

    Attributes:
        el_mode_active: Whether E-L mode is active
        source_type: Type of generation source
        ik_system_contribution_a: System contribution to fault [A]
        ik_el_contribution_a: E-L contribution to fault [A]
        ik_total_seen_a: Total fault current seen by protection [A]
        zsz_blocking_risk: Risk of unwanted ZSZ blocking
        zsz_blocking_notes_pl: Notes about ZSZ blocking
        recommendations_pl: Recommendations (Polish)
        verdict: PASS/MARGINAL/FAIL
        notes_pl: Polish explanation
    """

    el_mode_active: bool
    source_type: GenerationSourceType | None
    ik_system_contribution_a: float
    ik_el_contribution_a: float
    ik_total_seen_a: float
    zsz_blocking_risk: bool
    zsz_blocking_notes_pl: str | None
    recommendations_pl: tuple[str, ...]
    verdict: LineOvercurrentVerdict
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "criterion": "local_generation",
            "criterion_pl": "Tryb sieci z generacją lokalną (E-L)",
            "el_mode_active": self.el_mode_active,
            "source_type": self.source_type.value if self.source_type else None,
            "source_type_pl": (
                GENERATION_SOURCE_LABELS_PL.get(self.source_type.value, self.source_type.value)
                if self.source_type
                else None
            ),
            "ik_system_contribution_a": self.ik_system_contribution_a,
            "ik_el_contribution_a": self.ik_el_contribution_a,
            "ik_total_seen_a": self.ik_total_seen_a,
            "zsz_blocking_risk": self.zsz_blocking_risk,
            "zsz_blocking_notes_pl": self.zsz_blocking_notes_pl,
            "recommendations_pl": list(self.recommendations_pl),
            "verdict": self.verdict.value,
            "verdict_pl": VERDICT_LABELS_PL.get(self.verdict.value, self.verdict.value),
            "notes_pl": self.notes_pl,
        }


# =============================================================================
# OUTPUT DATA STRUCTURES
# =============================================================================


@dataclass(frozen=True)
class SettingWindow:
    """
    Allowable setting window for I>>.

    Attributes:
        i_min_secondary_a: Minimum setting (secondary) [A]
        i_max_secondary_a: Maximum setting (secondary) [A]
        i_min_primary_a: Minimum setting (primary) [A]
        i_max_primary_a: Maximum setting (primary) [A]
        window_valid: Whether window is valid (max > min)
        limiting_criterion_min: What limits the minimum
        limiting_criterion_max: What limits the maximum
    """

    i_min_secondary_a: float
    i_max_secondary_a: float
    i_min_primary_a: float
    i_max_primary_a: float
    window_valid: bool
    limiting_criterion_min: str  # "selectivity"
    limiting_criterion_max: str  # "sensitivity" or "thermal"

    def get_window_width_secondary(self) -> float:
        """Get window width in secondary current [A]."""
        return self.i_max_secondary_a - self.i_min_secondary_a

    def get_recommended_setting_secondary(self) -> float:
        """Get recommended setting (middle of window) [A]."""
        if not self.window_valid:
            return self.i_min_secondary_a
        return (self.i_min_secondary_a + self.i_max_secondary_a) / 2

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "i_min_secondary_a": self.i_min_secondary_a,
            "i_max_secondary_a": self.i_max_secondary_a,
            "i_min_primary_a": self.i_min_primary_a,
            "i_max_primary_a": self.i_max_primary_a,
            "window_valid": self.window_valid,
            "window_width_secondary_a": self.get_window_width_secondary(),
            "recommended_setting_secondary_a": self.get_recommended_setting_secondary(),
            "limiting_criterion_min": self.limiting_criterion_min,
            "limiting_criterion_max": self.limiting_criterion_max,
        }


@dataclass(frozen=True)
class LineOvercurrentSettingResult:
    """
    Complete I>> setting analysis result.

    Contains all criterion results, setting window, and recommendations.

    Attributes:
        run_id: Analysis run ID
        line_id: Line/branch identifier
        line_name: Human-readable line name
        input_data: Original input data
        selectivity: Selectivity criterion result
        sensitivity: Sensitivity criterion result
        thermal: Thermal criterion result
        spz_blocking: SPZ blocking result (if SPZ enabled)
        local_generation: Local generation diagnostic (if E-L enabled)
        setting_window: Allowable setting window
        overall_verdict: Combined verdict
        recommendations_pl: Polish recommendations
        trace_steps: White-box trace
        created_at: Timestamp
    """

    run_id: str
    line_id: str
    line_name: str
    input_data: dict[str, Any]  # Serialized input
    selectivity: SelectivityCriterionResult
    sensitivity: SensitivityCriterionResult
    thermal: ThermalCriterionResult
    spz_blocking: SPZBlockingResult | None
    local_generation: LocalGenerationDiagnostic | None
    setting_window: SettingWindow
    overall_verdict: LineOvercurrentVerdict
    recommendations_pl: tuple[str, ...]
    trace_steps: tuple[dict[str, Any], ...]
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "run_id": self.run_id,
            "line_id": self.line_id,
            "line_name": self.line_name,
            "input_data": self.input_data,
            "criteria_results": {
                "selectivity": self.selectivity.to_dict(),
                "sensitivity": self.sensitivity.to_dict(),
                "thermal": self.thermal.to_dict(),
                "spz_blocking": self.spz_blocking.to_dict() if self.spz_blocking else None,
                "local_generation": (
                    self.local_generation.to_dict() if self.local_generation else None
                ),
            },
            "setting_window": self.setting_window.to_dict(),
            "overall_verdict": self.overall_verdict.value,
            "overall_verdict_pl": VERDICT_LABELS_PL.get(
                self.overall_verdict.value, self.overall_verdict.value
            ),
            "recommendations_pl": list(self.recommendations_pl),
            "trace_steps": list(self.trace_steps),
            "created_at": self.created_at.isoformat(),
        }
