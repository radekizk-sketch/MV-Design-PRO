"""
Audit2 Power Flow Wrapper (Phase 30).

Cienka warstwa nad PowerFlowNewtonSolver — wywoluje
`apply_audit2_to_network_model` przed `solve()` jesli `pf_input.audit2_extensions`
ustawione. Zwraca solver result + audit trail.

Zasady:
- NOT-A-SOLVER: ten modul nie robi physics, tylko orchestracja apply + solve.
- Frozen Result API: solver dostaje normalny PowerFlowInput (po apply graph
  jest zmodyfikowany), zwraca normalny PowerFlowNewtonSolution.
- Audit trail: zwracany razem z result jako dict (enrichment).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from network_model.solvers.power_flow_newton import (
    PowerFlowNewtonSolution,
    PowerFlowNewtonSolver,
)
from network_model.solvers.power_flow_types import PowerFlowInput
from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model


@dataclass(frozen=True)
class Audit2PowerFlowResult:
    """Wynik PF + audit trail."""

    solution: PowerFlowNewtonSolution
    applied_audit2: dict[str, Any]


def solve_power_flow_with_audit2(pf_input: PowerFlowInput) -> Audit2PowerFlowResult:
    """
    Phase 30: orchestrates apply_audit2 + solve.

    1. Aplikuje audit2_extensions do pf_input.graph (mutuje branch.tap_position
       et al. zgodnie z catalog'iem).
    2. Wywoluje PowerFlowNewtonSolver.solve(pf_input) — solver dziala
       na zaadaptowanej sieci.
    3. Zwraca solution + applied audit trail (do logowania, raportu).

    NOT-A-SOLVER: wrapper nie robi physics, tylko coordinates apply + solve.
    """
    applied: dict[str, Any] = {}
    if pf_input.audit2_extensions is not None:
        applied = apply_audit2_to_network_model(
            graph=pf_input.graph, audit2_extensions=pf_input.audit2_extensions
        )

    solver = PowerFlowNewtonSolver()
    solution = solver.solve(pf_input)

    return Audit2PowerFlowResult(solution=solution, applied_audit2=applied)
