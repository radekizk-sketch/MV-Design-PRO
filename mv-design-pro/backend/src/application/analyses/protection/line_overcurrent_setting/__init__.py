"""
Line Overcurrent Setting Analysis (I>> for MV Lines) — FIX-12D

CANONICAL ALIGNMENT:
- SYSTEM_SPEC.md: Analysis layer (NOT-A-SOLVER)
- ARCHITECTURE.md: Interpretation layer

NOT-A-SOLVER RULE (BINDING):
    This module is an ANALYSIS/INTERPRETATION layer component.
    It does NOT perform any physics calculations (no IEC 60909 computing).
    All physics data (fault currents) comes from Short Circuit solver results.
    This module ONLY interprets pre-computed results to determine I>> settings.

WHITE BOX:
    Full trace of all evaluation steps is recorded.
    Every intermediate value is exposed for audit.

DETERMINISM:
    Same inputs → identical outputs.
    No randomness, no timestamps in calculations.

METHODOLOGY (from lecture materials):
    1. Selectivity criterion: I_nast >= kb * Ikmax(next_protection) / θi
    2. Sensitivity criterion: Ikmin(busbars) / θi >= kc * I_nast
    3. Thermal criterion: I_nast <= kbth * Ithdop / θi
       where Ithdop = Ithn / sqrt(tk) or Ithdop = s * jthn / sqrt(tk)
    4. SPZ blocking logic based on current thresholds and fault duration
"""

from .analyzer import LineOvercurrentSettingAnalyzer
from .models import (
    # Data classes
    ConductorData,
    # Enums
    ConductorMaterial,
    GenerationSourceType,
    LineOvercurrentSettingInput,
    LineOvercurrentSettingResult,
    LineOvercurrentVerdict,
    LocalGenerationConfig,
    LocalGenerationDiagnostic,
    SelectivityCriterionResult,
    SensitivityCriterionResult,
    SettingWindow,
    SPZBlockingResult,
    SPZConfig,
    SPZMode,
    ThermalCriterionResult,
)
from .spz_lookup import (
    SPZ_THRESHOLD_TABLE_DEFAULT,
    SPZLookupTable,
    get_spz_blocking_decision,
)

__all__ = [
    # Enums
    "ConductorMaterial",
    "SPZMode",
    "GenerationSourceType",
    "LineOvercurrentVerdict",
    # Data classes
    "ConductorData",
    "SPZConfig",
    "LocalGenerationConfig",
    "LineOvercurrentSettingInput",
    "SelectivityCriterionResult",
    "SensitivityCriterionResult",
    "ThermalCriterionResult",
    "SPZBlockingResult",
    "LocalGenerationDiagnostic",
    "SettingWindow",
    "LineOvercurrentSettingResult",
    # SPZ lookup
    "SPZLookupTable",
    "SPZ_THRESHOLD_TABLE_DEFAULT",
    "get_spz_blocking_decision",
    # Analyzer
    "LineOvercurrentSettingAnalyzer",
]
