"""Rozpływ mocy — typ wyniku interpretacji (`PowerFlowResult`) i kontrakt wejścia solvera.

Pakiet nie liczy i nie wywołuje fizyki: obliczenie rozpływu należy wyłącznie do solverów
`network_model/solvers/**` wołanych przez bieg kanoniczny (`enm/canonical_analysis.py`).
Dawny adapter `PowerFlowSolver`/`solve_power_flow` (wywołanie solvera NR w warstwie
interpretacji) skasowany kartą TORY-TYLKO-W-TESTACH (2026-09-30) — nie miał konsumenta
w produkcie; bramka wskrzeszenia: `scripts/legacy_public_path_guard.py`.
"""

from .result import PowerFlowResult
from .types import (
    BranchLimitSpec,
    BusVoltageLimitSpec,
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    ShuntSpec,
    SlackSpec,
    TransformerTapSpec,
)

__all__ = [
    "PowerFlowInput",
    "PowerFlowOptions",
    "PowerFlowResult",
    "SlackSpec",
    "PQSpec",
    "PVSpec",
    "ShuntSpec",
    "TransformerTapSpec",
    "BusVoltageLimitSpec",
    "BranchLimitSpec",
]
