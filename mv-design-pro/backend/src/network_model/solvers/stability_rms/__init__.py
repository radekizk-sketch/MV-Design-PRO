"""Solver stabilności RMS (PR-15) — kontrakty domeny + adapter API.

Numeryczne solvery RMS time-domain dla stabilności małosygnałowej i
czasowo-domeny wymagają eksperckiej implementacji (Newton-Raphson dynamic +
8 modeli: synchronous 6-rzędowy, AVR IEEE T1/T2/AC4A/ST5B, governor
TGOV1/GAST/IEEE-G1, PSS, induction motor, wind type 1-4, PV inverter,
BESS PCS) — to ~42 osobodni eksperta solver.

Ten moduł dostarcza:
- StabilityResult API (frozen — zgodnie z AGENTS.md §2.6)
- StabilitySolverInput contract (walidacja wejść)
- StabilitySolverAdapter z statusem `no_module` gdy brak solver-RMS

Zgodnie z briefem §0 pkt 6 — istniejące solvery nie są zmieniane.
Schemat + walidacja + UI + adapter są gotowe do podpięcia solvera w
PR-15-impl (osobna sesja eksperta solver).
"""

from src.network_model.solvers.stability_rms.contracts import (
    DynamicModelKind,
    StabilityResult,
    StabilitySolverAdapter,
    StabilitySolverInput,
    StabilityStatus,
)

__all__ = [
    "DynamicModelKind",
    "StabilityResult",
    "StabilitySolverAdapter",
    "StabilitySolverInput",
    "StabilityStatus",
]
