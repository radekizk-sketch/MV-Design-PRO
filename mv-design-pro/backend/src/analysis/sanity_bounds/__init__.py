"""Sanity-bounds (warstwa interpretacji, K-08 / DEF-01).

Ocena wiarygodności wyników solverów wobec twardych granic fizycznych — łapie
absurdy zanim trafią do pakietu OSD. NIE liczy fizyki (Z15).
"""

from analysis.sanity_bounds.short_circuit_bounds import (
    CREDIBLE,
    INCOMPLETE,
    OUT_OF_RANGE,
    ShortCircuitSanityVerdict,
    evaluate_short_circuit_current,
)

__all__ = [
    "CREDIBLE",
    "INCOMPLETE",
    "OUT_OF_RANGE",
    "ShortCircuitSanityVerdict",
    "evaluate_short_circuit_current",
]
