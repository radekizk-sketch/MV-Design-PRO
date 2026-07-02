"""Solver FRT/HVRT RMS time-domain — kontrakty domeny + adapter + silnik.

Symulacja czasowo-domeny dla zakłóceń napięciowych (LVRT 0–80% Un + HVRT
110–130% Un wg krzywej profilu). Adapter ``FrtHvrtSolverAdapter`` deleguje do
silnika numerycznego ``engine.run_frt_hvrt`` zwracającego realne trajektorie
V/Iq/P, margines do krzywej i czas odzysku mocy czynnej.
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
