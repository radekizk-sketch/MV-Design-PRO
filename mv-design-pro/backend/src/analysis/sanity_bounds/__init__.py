"""Sanity-bounds (warstwa interpretacji, K-08 / DEF-01).

Ocena wiarygodności wyników solverów wobec twardych granic fizycznych — łapie
absurdy zanim trafią do pakietu OSD. NIE liczy fizyki (Z15).
"""

from analysis.sanity_bounds.power_flow_bounds import (
    DOMYSLNY_PROG_STRAT_PROCENT,
    NORMA_NAPIECIA_PL,
    PASMO_NAPIECIA_PROCENT,
    UZASADNIENIE_PROGU_STRAT_PL,
    BranchLoadingSanityVerdict,
    NetworkLossesSanityVerdict,
    VoltageBandSanityVerdict,
    evaluate_branch_loading,
    evaluate_bus_voltage,
    evaluate_network_losses,
)
from analysis.sanity_bounds.short_circuit_bounds import (
    CREDIBLE,
    INCOMPLETE,
    OUT_OF_RANGE,
    ShortCircuitSanityVerdict,
    evaluate_short_circuit_current,
)

__all__ = [
    "CREDIBLE",
    "DOMYSLNY_PROG_STRAT_PROCENT",
    "INCOMPLETE",
    "NORMA_NAPIECIA_PL",
    "OUT_OF_RANGE",
    "PASMO_NAPIECIA_PROCENT",
    "UZASADNIENIE_PROGU_STRAT_PL",
    "BranchLoadingSanityVerdict",
    "NetworkLossesSanityVerdict",
    "ShortCircuitSanityVerdict",
    "VoltageBandSanityVerdict",
    "evaluate_branch_loading",
    "evaluate_bus_voltage",
    "evaluate_network_losses",
    "evaluate_short_circuit_current",
]
