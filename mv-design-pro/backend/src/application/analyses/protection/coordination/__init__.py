"""
Protection Coordination Analysis Module — FIX-12

Provides overcurrent protection coordination analysis that:
- Consumes Power Flow results (operating currents)
- Consumes Short Circuit results (fault currents)
- Evaluates protection device settings
- Produces coordination results with PASS/MARGINAL/FAIL verdicts

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Interprets solver results, no physics calculations
- WHITE BOX: Full trace of all calculations
- 100% Polish labels
- Deterministic output
"""

from .analyzer import OvercurrentCoordinationAnalyzer
from .models import (
    CoordinationAnalysisResult,
    CoordinationConfig,
    CoordinationInput,
)

__all__ = [
    "OvercurrentCoordinationAnalyzer",
    "CoordinationInput",
    "CoordinationConfig",
    "CoordinationAnalysisResult",
]
