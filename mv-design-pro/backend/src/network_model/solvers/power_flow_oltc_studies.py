"""OLTC studies — solver-layer orchestration built on the FROZEN power flow.

Three dedicated OLTC study engines that repeatedly solve the load flow (they do
not compute any power-system quantity themselves — the FROZEN solver does):

- ``sweep_tap_positions``       — §9 sensitivity: LF at each fixed tap position.
- ``run_annual_oltc_profile``   — §8 annual profile: OLTC loop per time step.
- ``optimize_tap_positions``    — §17 optimization: OLTC as a decision variable.

All engines are deterministic (fixed iteration order, exhaustive/greedy search,
no randomness) and WHITE BOX (every evaluated point is returned). They restore
the transformer tap state they mutate, so a study never leaves the model changed.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field, replace
from typing import Any

from network_model.core.branch import TransformerBranch
from network_model.solvers.power_flow_oltc import solve_with_oltc
from network_model.solvers.power_flow_types import PowerFlowInput

SolveOnce = Callable[[PowerFlowInput], Any]


def _find_transformer(graph: Any, branch_id: str) -> TransformerBranch:
    branch = graph.branches.get(branch_id)
    if not isinstance(branch, TransformerBranch):
        raise ValueError(f"Branch '{branch_id}' is not a transformer")
    return branch


def _losses_mw(solution: Any, base_mva: float) -> float:
    losses = getattr(solution, "losses_total", 0.0 + 0.0j)
    return float(getattr(losses, "real", 0.0)) * base_mva


def _set_position(trafo: TransformerBranch, position: int) -> None:
    """Fix the transformer tap to ``position`` (via tap changer if present)."""
    if trafo.tap_changer is not None:
        trafo.tap_changer = replace(trafo.tap_changer, current_position=position)
    else:
        trafo.tap_position = position


def _current_position(trafo: TransformerBranch) -> int:
    if trafo.tap_changer is not None:
        return trafo.tap_changer.current_position
    return trafo.tap_position


# ---------------------------------------------------------------------------
# §9 — Tap-position sensitivity sweep
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TapSweepPoint:
    position: int
    tap_ratio: float
    converged: bool
    controlled_bus_kv: float | None
    losses_mw: float
    min_bus_kv: float | None
    max_bus_kv: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "position": self.position,
            "tap_ratio": self.tap_ratio,
            "converged": self.converged,
            "controlled_bus_kv": self.controlled_bus_kv,
            "losses_mw": self.losses_mw,
            "min_bus_kv": self.min_bus_kv,
            "max_bus_kv": self.max_bus_kv,
        }


@dataclass(frozen=True)
class TapSweepResult:
    branch_id: str
    controlled_bus_id: str | None
    points: list[TapSweepPoint]

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_id": self.branch_id,
            "controlled_bus_id": self.controlled_bus_id,
            "points": [p.to_dict() for p in self.points],
        }


def default_sweep_positions(trafo: TransformerBranch) -> list[int]:
    """Full-range sweep positions for a transformer (min..max, or a small band)."""
    tc = trafo.tap_changer
    if tc is not None and tc.max_position > tc.min_position:
        return list(range(tc.min_position, tc.max_position + 1))
    return [-2, -1, 0, 1, 2]


def sweep_tap_positions(
    pf_input: PowerFlowInput,
    solve_once: SolveOnce,
    *,
    branch_id: str,
    positions: Sequence[int] | None = None,
    controlled_bus_id: str | None = None,
) -> TapSweepResult:
    """§9: solve the LF at each fixed tap position and record V/losses.

    The transformer tap state is restored afterwards.
    """
    graph = pf_input.typed_graph()
    trafo = _find_transformer(graph, branch_id)
    controlled = (
        controlled_bus_id
        or (trafo.tap_changer.controlled_bus_id if trafo.tap_changer else None)
        or trafo.to_node_id
    )
    sweep = list(positions) if positions is not None else default_sweep_positions(trafo)

    original_tc = trafo.tap_changer
    original_pos = trafo.tap_position
    points: list[TapSweepPoint] = []
    try:
        for position in sweep:
            _set_position(trafo, position)
            solution = solve_once(pf_input)
            v_map = getattr(solution, "node_voltage_kv", {}) or {}
            finite = [v for v in v_map.values() if v == v]  # drop NaN
            points.append(
                TapSweepPoint(
                    position=position,
                    tap_ratio=trafo.get_tap_ratio(),
                    converged=bool(getattr(solution, "converged", False)),
                    controlled_bus_kv=v_map.get(controlled),
                    losses_mw=_losses_mw(solution, pf_input.base_mva),
                    min_bus_kv=min(finite) if finite else None,
                    max_bus_kv=max(finite) if finite else None,
                )
            )
    finally:
        trafo.tap_changer = original_tc
        trafo.tap_position = original_pos

    return TapSweepResult(branch_id=branch_id, controlled_bus_id=controlled, points=points)


# ---------------------------------------------------------------------------
# §8 — Annual (time-series) OLTC profile
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AnnualProfileStep:
    index: int
    label: str
    load_scale: float
    positions: dict[str, int]
    switch_count: int
    controlled_bus_kv: dict[str, float]
    within_deadband: dict[str, bool]

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "label": self.label,
            "load_scale": self.load_scale,
            "positions": dict(self.positions),
            "switch_count": self.switch_count,
            "controlled_bus_kv": dict(self.controlled_bus_kv),
            "within_deadband": dict(self.within_deadband),
        }


@dataclass(frozen=True)
class AnnualProfileResult:
    steps: list[AnnualProfileStep]
    total_switch_count: int
    steps_outside_deadband: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "steps": [s.to_dict() for s in self.steps],
            "total_switch_count": self.total_switch_count,
            "steps_outside_deadband": self.steps_outside_deadband,
        }


@dataclass(frozen=True)
class ProfilePoint:
    label: str
    load_scale: float


def _scaled_pq(pf_input: PowerFlowInput, scale: float) -> PowerFlowInput:
    scaled = [
        replace(spec, p_mw=spec.p_mw * scale, q_mvar=spec.q_mvar * scale) for spec in pf_input.pq
    ]
    return replace(pf_input, pq=scaled)


def run_annual_oltc_profile(
    pf_input: PowerFlowInput,
    solve_once: SolveOnce,
    profile: Sequence[ProfilePoint],
) -> AnnualProfileResult:
    """§8: run the OLTC control loop for each time step of a load profile.

    Each step scales the base PQ demand by ``load_scale`` and runs the automatic
    OLTC loop; the converged positions carry over to the next step (as a real
    regulator would), and per-step switch counts / dead-band status are recorded.
    The transformer tap state is restored afterwards.
    """
    graph = pf_input.typed_graph()
    regulators = [
        b
        for b in graph.branches.values()
        if isinstance(b, TransformerBranch) and b.tap_changer is not None
    ]
    saved = {reg.id: reg.tap_changer for reg in regulators}

    steps: list[AnnualProfileStep] = []
    total_switches = 0
    outside = 0
    try:
        for index, point in enumerate(profile):
            step_input = _scaled_pq(pf_input, point.load_scale)
            solution, trace = solve_with_oltc(step_input, solve_once)

            positions = {reg.id: _current_position(reg) for reg in regulators}
            v_map = getattr(solution, "node_voltage_kv", {}) or {}
            controlled_kv: dict[str, float] = {}
            within: dict[str, bool] = {}
            step_switches = int(trace["total_switch_count"]) if trace else 0
            for reg in regulators:
                tc = reg.tap_changer
                bus = tc.controlled_bus_id or reg.to_node_id
                v = v_map.get(bus)
                if v is not None:
                    controlled_kv[reg.id] = v
                    if tc.voltage_setpoint_kv is not None:
                        half = (tc.deadband_kv or 0.0) / 2.0
                        within[reg.id] = abs(v - tc.voltage_setpoint_kv) <= half

            total_switches += step_switches
            if within and not all(within.values()):
                outside += 1
            steps.append(
                AnnualProfileStep(
                    index=index,
                    label=point.label,
                    load_scale=point.load_scale,
                    positions=positions,
                    switch_count=step_switches,
                    controlled_bus_kv=controlled_kv,
                    within_deadband=within,
                )
            )
    finally:
        for reg in regulators:
            reg.tap_changer = saved[reg.id]

    return AnnualProfileResult(
        steps=steps,
        total_switch_count=total_switches,
        steps_outside_deadband=outside,
    )


# ---------------------------------------------------------------------------
# §17 — OLTC optimization (tap position as a decision variable)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OptimizationCandidate:
    position: int
    converged: bool
    losses_mw: float
    controlled_bus_kv: float | None
    voltage_deviation_kv: float | None
    objective_value: float
    feasible: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "position": self.position,
            "converged": self.converged,
            "losses_mw": self.losses_mw,
            "controlled_bus_kv": self.controlled_bus_kv,
            "voltage_deviation_kv": self.voltage_deviation_kv,
            "objective_value": self.objective_value,
            "feasible": self.feasible,
        }


@dataclass(frozen=True)
class OptimizationResult:
    branch_id: str
    objective: str
    best_position: int | None
    initial_position: int
    switch_count: int
    candidates: list[OptimizationCandidate] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_id": self.branch_id,
            "objective": self.objective,
            "best_position": self.best_position,
            "initial_position": self.initial_position,
            "switch_count": self.switch_count,
            "candidates": [c.to_dict() for c in self.candidates],
        }


def optimize_tap_positions(
    pf_input: PowerFlowInput,
    solve_once: SolveOnce,
    *,
    branch_id: str,
    objective: str = "minimize_losses",
    target_kv: float | None = None,
    controlled_bus_id: str | None = None,
    positions: Sequence[int] | None = None,
    switch_penalty_mw_per_step: float = 0.0,
) -> OptimizationResult:
    """§17: choose the tap position optimally by exact enumeration.

    The decision space is a single integer per transformer over a small range, so
    exhaustive enumeration is exact (not a heuristic). Objectives:
      - ``minimize_losses``  — least active losses (optionally + switching penalty),
      - ``maintain_voltage`` — controlled-bus voltage closest to ``target_kv``,
      - ``minimize_switching`` — fewest tap moves that keep V within the target band.

    The transformer tap state is restored afterwards.
    """
    graph = pf_input.typed_graph()
    trafo = _find_transformer(graph, branch_id)
    controlled = (
        controlled_bus_id
        or (trafo.tap_changer.controlled_bus_id if trafo.tap_changer else None)
        or trafo.to_node_id
    )
    initial = _current_position(trafo)
    candidates_positions = (
        list(positions) if positions is not None else default_sweep_positions(trafo)
    )

    original_tc = trafo.tap_changer
    original_pos = trafo.tap_position
    candidates: list[OptimizationCandidate] = []
    try:
        for position in candidates_positions:
            _set_position(trafo, position)
            solution = solve_once(pf_input)
            converged = bool(getattr(solution, "converged", False))
            v_map = getattr(solution, "node_voltage_kv", {}) or {}
            v_ctrl = v_map.get(controlled)
            losses = _losses_mw(solution, pf_input.base_mva)
            deviation = None if (v_ctrl is None or target_kv is None) else abs(v_ctrl - target_kv)

            if objective == "maintain_voltage":
                obj = deviation if deviation is not None else float("inf")
                feasible = converged and deviation is not None
            elif objective == "minimize_switching":
                obj = float(abs(position - initial))
                # Feasible only if voltage stays acceptable near the target.
                feasible = converged and (
                    deviation is None or target_kv is None or deviation <= 1e-9 + 0.05 * target_kv
                )
            else:  # minimize_losses (default)
                obj = losses + switch_penalty_mw_per_step * abs(position - initial)
                feasible = converged

            candidates.append(
                OptimizationCandidate(
                    position=position,
                    converged=converged,
                    losses_mw=losses,
                    controlled_bus_kv=v_ctrl,
                    voltage_deviation_kv=deviation,
                    objective_value=float(obj),
                    feasible=feasible,
                )
            )
    finally:
        trafo.tap_changer = original_tc
        trafo.tap_position = original_pos

    feasible = [c for c in candidates if c.feasible]
    pool = feasible if feasible else [c for c in candidates if c.converged]
    # Deterministic tie-break: lowest objective, then position closest to initial,
    # then lowest position.
    best = min(
        pool,
        key=lambda c: (c.objective_value, abs(c.position - initial), c.position),
        default=None,
    )
    best_pos = best.position if best is not None else None
    return OptimizationResult(
        branch_id=branch_id,
        objective=objective,
        best_position=best_pos,
        initial_position=initial,
        switch_count=abs(best_pos - initial) if best_pos is not None else 0,
        candidates=candidates,
    )
