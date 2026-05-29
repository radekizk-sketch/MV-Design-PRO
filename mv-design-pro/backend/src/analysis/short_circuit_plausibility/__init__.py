"""Short-circuit Ik'' plausibility guard (D-14, interpretation layer).

Per-voltage-level absurdity barrier for the initial symmetrical short-circuit
current. Flags physically impossible values (e.g. 116 kA on a 15 kV MV bus)
without modifying any solver result.
"""

from analysis.short_circuit_plausibility.guard import (
    VOLTAGE_BANDS,
    VoltageBand,
    evaluate_ikss_plausibility,
)
from analysis.short_circuit_plausibility.models import (
    PlausibilityViolation,
    ShortCircuitPlausibilityVerdict,
)

__all__ = [
    "VOLTAGE_BANDS",
    "VoltageBand",
    "evaluate_ikss_plausibility",
    "PlausibilityViolation",
    "ShortCircuitPlausibilityVerdict",
]
