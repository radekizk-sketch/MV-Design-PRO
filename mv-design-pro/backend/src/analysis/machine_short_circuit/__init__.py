"""Machine short-circuit contribution — analysis/interpretation layer (IEC 60909 §6.6).

Interprets the solver's per-machine SC breakdown for ANY network with rotating
machines. READ-ONLY, deterministic, no physics, frozen-Result-API safe.
"""

from analysis.machine_short_circuit.contribution import (
    MachineContributionFinding,
    MachineContributionInterpretation,
    interpret_machine_contributions,
)

__all__ = [
    "MachineContributionFinding",
    "MachineContributionInterpretation",
    "interpret_machine_contributions",
]
