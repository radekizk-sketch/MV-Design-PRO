"""Shunt capacitor bank (KOMPENSATOR_SN) rating preview — WHITE BOX, first principles.

Standalone, deterministic preview of a fixed shunt capacitor bank from its rated
values alone (rated reactive power and rated voltage). NO network context is used
here — the actual voltage-rise / reactive coverage in the model comes from the
full power-flow run (see canonical_analysis `_build_shunt_specs_from_snapshot`,
which maps this element onto the solver shunt mechanism as +jB).

First principles (three-phase bank rated Q at line voltage U):
    B  = Q / U²                 capacitive susceptance [S]  (from Q = B·U²)
    I_c = Q / (√3 · U)          rated line current [A]

These are exact algebraic identities, not heuristics; the values are auditable.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

_FORMULA_REF = "B = Q / U² ; I_c = Q / (√3·U)"


@dataclass(frozen=True)
class ShuntCompensatorPreviewInput:
    rated_mvar: float
    rated_kv: float


@dataclass(frozen=True)
class ShuntCompensatorPreviewResult:
    rated_mvar: float
    rated_kv: float
    reactive_power_var: float
    susceptance_siemens: float
    rated_current_a: float
    formula_ref: str


def compute_shunt_compensator_preview(
    data: ShuntCompensatorPreviewInput,
) -> ShuntCompensatorPreviewResult:
    if data.rated_mvar <= 0.0:
        raise ValueError("rated_mvar musi być dodatnie.")
    if data.rated_kv <= 0.0:
        raise ValueError("rated_kv musi być dodatnie.")

    q_var = data.rated_mvar * 1_000_000.0
    u_v = data.rated_kv * 1_000.0
    susceptance_siemens = q_var / (u_v * u_v)
    rated_current_a = q_var / (math.sqrt(3.0) * u_v)

    return ShuntCompensatorPreviewResult(
        rated_mvar=data.rated_mvar,
        rated_kv=data.rated_kv,
        reactive_power_var=q_var,
        susceptance_siemens=susceptance_siemens,
        rated_current_a=rated_current_a,
        formula_ref=_FORMULA_REF,
    )
