"""Solver FRT/HVRT RMS time-domain (PR-16) — kontrakty domeny + adapter API.

Symulacja czasowo-domeny dla zakłóceń napięciowych (LVRT 0–80% Un + HVRT
110–130% Un wg krzywej profilu). Wymaga eksperckiej implementacji ~18 osobodni.
"""

from src.network_model.solvers.frt_hvrt.contracts import (
    FrtHvrtResult,
    FrtHvrtSolverAdapter,
    FrtHvrtSolverInput,
    FrtHvrtStatus,
    FrtScenario,
)

__all__ = [
    "FrtHvrtResult",
    "FrtHvrtSolverAdapter",
    "FrtHvrtSolverInput",
    "FrtHvrtStatus",
    "FrtScenario",
]
