"""P20a: PowerFlowTrace - deterministyczny white-box trace dla NR solver.

Ten moduł definiuje struktury dla pełnego śladu iteracji Newton-Raphson,
umożliwiając ręczną weryfikację przebiegu obliczeń.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# P20a: Solver version for trace compatibility
POWER_FLOW_SOLVER_VERSION = "1.0.0"


@dataclass(frozen=True)
class PowerFlowIterationTrace:
    """P20a: Trace pojedynczej iteracji NR.

    Attributes:
        k: Numer iteracji (1-indexed).
        mismatch_per_bus: ΔP, ΔQ per bus w porządku deterministycznym.
        norm_mismatch: Norma wektora mismatch (L2 lub max, jawnie).
        max_mismatch_pu: Maksymalny mismatch w p.u.
        jacobian: Bloki Jacobian (J1..J4) lub pełna macierz.
        delta_state: Δθ, ΔV per bus po rozwiązaniu układu.
        state_next: V, θ per bus po aktualizacji stanu.
        damping_used: Współczynnik tłumienia użyty w tej iteracji.
        step_norm: Norma kroku (L2).
        pv_to_pq_switches: Lista węzłów PV przełączonych na PQ (limit Q).
        cause_if_failed: Przyczyna błędu (jeśli iteracja zakończyła się błędem).
    """

    k: int
    mismatch_per_bus: dict[str, dict[str, float]]  # {bus_id: {delta_p_pu, delta_q_pu}}
    norm_mismatch: float
    max_mismatch_pu: float
    jacobian: dict[str, list[list[float]]] | None = None  # {J1_dP_dTheta, J2_dP_dV, ...}
    delta_state: dict[
        str, dict[str, float]
    ] | None = None  # {bus_id: {delta_theta_rad, delta_v_pu}}
    state_next: dict[str, dict[str, float]] | None = None  # {bus_id: {v_pu, theta_rad}}
    damping_used: float = 1.0
    step_norm: float = 0.0
    pv_to_pq_switches: list[str] | None = None
    cause_if_failed: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do JSON (deterministyczna)."""
        result: dict[str, Any] = {
            "k": self.k,
            "mismatch_per_bus": dict(sorted(self.mismatch_per_bus.items())),
            "norm_mismatch": self.norm_mismatch,
            "max_mismatch_pu": self.max_mismatch_pu,
            "damping_used": self.damping_used,
            "step_norm": self.step_norm,
        }
        if self.jacobian is not None:
            result["jacobian"] = self.jacobian
        if self.delta_state is not None:
            result["delta_state"] = dict(sorted(self.delta_state.items()))
        if self.state_next is not None:
            result["state_next"] = dict(sorted(self.state_next.items()))
        if self.pv_to_pq_switches:
            result["pv_to_pq_switches"] = sorted(self.pv_to_pq_switches)
        if self.cause_if_failed is not None:
            result["cause_if_failed"] = self.cause_if_failed
        return result


@dataclass(frozen=True)
class PowerFlowTrace:
    """P20a: Pełny deterministyczny white-box trace dla Power Flow NR.

    Zawiera wszystkie informacje potrzebne do ręcznej weryfikacji przebiegu
    obliczeń Newton-Raphson.

    Attributes:
        solver_version: Wersja solvera (dla kompatybilności trace).
        input_hash: SHA-256 hash inputu (deterministyczny).
        snapshot_id: ID snapshotu sieci.
        case_id: ID case'a operacyjnego.
        run_id: ID runu analizy.
        init_state: Stan początkowy (V0, θ0) dla wszystkich busów.
        init_method: Metoda inicjalizacji ("flat" lub "last_solution").
        tolerance: Tolerancja zbieżności użyta w obliczeniach.
        max_iterations: Maksymalna liczba iteracji.
        base_mva: Moc bazowa [MVA].
        slack_bus_id: ID węzła bilansującego.
        pq_bus_ids: Lista ID węzłów PQ (deterministycznie posortowana).
        pv_bus_ids: Lista ID węzłów PV (deterministycznie posortowana).
        ybus_trace: Trace budowy macierzy admitancji.
        iterations: Lista trace dla każdej iteracji.
        converged: Czy obliczenia zbiegły.
        final_iterations_count: Liczba wykonanych iteracji.
    """

    solver_version: str
    input_hash: str
    snapshot_id: str | None
    case_id: str | None
    run_id: str | None
    init_state: dict[str, dict[str, float]]  # {bus_id: {v_pu, theta_rad}}
    init_method: str  # "flat" or "last_solution"
    tolerance: float
    max_iterations: int
    base_mva: float
    slack_bus_id: str
    pq_bus_ids: tuple[str, ...]
    pv_bus_ids: tuple[str, ...]
    ybus_trace: dict[str, Any]
    iterations: tuple[PowerFlowIterationTrace, ...]
    converged: bool
    final_iterations_count: int

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do JSON (deterministyczna)."""
        return {
            "solver_version": self.solver_version,
            "input_hash": self.input_hash,
            "snapshot_id": self.snapshot_id,
            "case_id": self.case_id,
            "run_id": self.run_id,
            "init_state": dict(sorted(self.init_state.items())),
            "init_method": self.init_method,
            "tolerance": self.tolerance,
            "max_iterations": self.max_iterations,
            "base_mva": self.base_mva,
            "slack_bus_id": self.slack_bus_id,
            "pq_bus_ids": list(self.pq_bus_ids),
            "pv_bus_ids": list(self.pv_bus_ids),
            "ybus_trace": self.ybus_trace,
            "iterations": [it.to_dict() for it in self.iterations],
            "converged": self.converged,
            "final_iterations_count": self.final_iterations_count,
        }


def build_power_flow_trace(
    *,
    input_hash: str,
    snapshot_id: str | None,
    case_id: str | None,
    run_id: str | None,
    init_state: dict[str, dict[str, float]] | None,
    init_method: str,
    tolerance: float,
    max_iterations: int,
    base_mva: float,
    slack_bus_id: str,
    pq_bus_ids: list[str],
    pv_bus_ids: list[str],
    ybus_trace: dict[str, Any],
    nr_trace: list[dict[str, Any]],
    converged: bool,
    iterations_count: int,
) -> PowerFlowTrace:
    """P20a: Buduje PowerFlowTrace z danych solvera.

    Konwertuje surowe dane trace z solvera NR na strukturę PowerFlowTrace.
    """
    # Konwersja iteracji
    iteration_traces: list[PowerFlowIterationTrace] = []
    for entry in nr_trace:
        iteration_traces.append(
            PowerFlowIterationTrace(
                k=entry.get("iter", 0),
                mismatch_per_bus=entry.get("mismatch_per_bus", {}),
                norm_mismatch=entry.get("mismatch_norm", 0.0),
                max_mismatch_pu=entry.get("max_mismatch_pu", 0.0),
                jacobian=entry.get("jacobian"),
                delta_state=entry.get("delta_state"),
                state_next=entry.get("state_next"),
                damping_used=entry.get("damping_used", 1.0),
                step_norm=entry.get("step_norm", 0.0),
                pv_to_pq_switches=entry.get("pv_to_pq_optional"),
                cause_if_failed=entry.get("cause_if_failed_optional"),
            )
        )

    return PowerFlowTrace(
        solver_version=POWER_FLOW_SOLVER_VERSION,
        input_hash=input_hash,
        snapshot_id=snapshot_id,
        case_id=case_id,
        run_id=run_id,
        init_state=init_state or {},
        init_method=init_method,
        tolerance=tolerance,
        max_iterations=max_iterations,
        base_mva=base_mva,
        slack_bus_id=slack_bus_id,
        pq_bus_ids=tuple(sorted(pq_bus_ids)),
        pv_bus_ids=tuple(sorted(pv_bus_ids)),
        ybus_trace=ybus_trace,
        iterations=tuple(iteration_traces),
        converged=converged,
        final_iterations_count=iterations_count,
    )
