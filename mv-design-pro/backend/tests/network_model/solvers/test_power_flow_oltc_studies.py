"""OLTC study engines (V12K-045): sweep §9, annual profile §8, optimization §17.

All engines drive the FROZEN solver repeatedly, are deterministic, and must
restore the transformer tap state they mutate.
"""

from __future__ import annotations

from network_model.core.branch import TransformerBranch
from network_model.solvers.power_flow_oltc_studies import (
    ProfilePoint,
    optimize_tap_positions,
    run_annual_oltc_profile,
    sweep_tap_positions,
)

from tests.network_model.solvers.test_power_flow_oltc import _build_input, _oltc, _solve_once


def _trafo_id(pf_input) -> str:
    graph = pf_input.typed_graph()
    return next(b.id for b in graph.branches.values() if isinstance(b, TransformerBranch))


class TestSweep:
    def test_sweep_covers_full_range_and_restores_state(self):
        pf_input = _build_input(_oltc(current_position=0))
        trafo_id = _trafo_id(pf_input)
        result = sweep_tap_positions(pf_input, _solve_once, branch_id=trafo_id)
        assert [p.position for p in result.points] == list(range(-9, 10))
        assert all(p.converged for p in result.points)
        # State restored to the original position after the sweep.
        graph = pf_input.typed_graph()
        trafo = graph.branches[trafo_id]
        assert trafo.tap_changer.current_position == 0

    def test_sweep_voltage_monotonic_in_position(self):
        # HV-regulated: stepping the position DOWN raises the LV busbar, so the
        # controlled-bus voltage decreases monotonically as position increases.
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        result = sweep_tap_positions(pf_input, _solve_once, branch_id=trafo_id)
        vs = [p.controlled_bus_kv for p in result.points]
        assert all(a >= b - 1e-9 for a, b in zip(vs, vs[1:], strict=False))

    def test_sweep_explicit_positions(self):
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        result = sweep_tap_positions(
            pf_input, _solve_once, branch_id=trafo_id, positions=[-4, 0, 4]
        )
        assert [p.position for p in result.points] == [-4, 0, 4]


class TestAnnualProfile:
    def test_profile_tracks_positions_switches_and_deadband(self):
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        profile = [
            ProfilePoint(label="noc", load_scale=0.3),
            ProfilePoint(label="dzień", load_scale=1.0),
            ProfilePoint(label="szczyt", load_scale=1.6),
        ]
        result = run_annual_oltc_profile(pf_input, _solve_once, profile)
        assert len(result.steps) == 3
        assert result.total_switch_count == sum(s.switch_count for s in result.steps)
        # Heavier load needs the tap driven further down (more negative position).
        pos_light = result.steps[0].positions[trafo_id]
        pos_heavy = result.steps[2].positions[trafo_id]
        assert pos_heavy <= pos_light
        # Every step reports the controlled busbar voltage.
        assert all(trafo_id in s.controlled_bus_kv for s in result.steps)
        # State restored.
        graph = pf_input.typed_graph()
        assert graph.branches[trafo_id].tap_changer.current_position == 0

    def test_profile_deterministic(self):
        profile = [ProfilePoint(label="a", load_scale=0.5), ProfilePoint(label="b", load_scale=1.4)]
        r1 = run_annual_oltc_profile(_build_input(_oltc()), _solve_once, profile)
        r2 = run_annual_oltc_profile(_build_input(_oltc()), _solve_once, profile)
        assert [s.positions for s in r1.steps] == [s.positions for s in r2.steps]
        assert r1.total_switch_count == r2.total_switch_count


class TestOptimization:
    def test_minimize_losses_picks_converged_position_and_restores(self):
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        result = optimize_tap_positions(
            pf_input, _solve_once, branch_id=trafo_id, objective="minimize_losses"
        )
        assert result.best_position is not None
        best = min((c for c in result.candidates if c.converged), key=lambda c: c.losses_mw)
        assert result.best_position == best.position
        graph = pf_input.typed_graph()
        assert graph.branches[trafo_id].tap_changer.current_position == 0

    def test_maintain_voltage_targets_setpoint(self):
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=trafo_id,
            objective="maintain_voltage",
            target_kv=15.0,
        )
        assert result.best_position is not None
        # The chosen position minimizes |V_controlled - target|.
        best = min(
            (c for c in result.candidates if c.voltage_deviation_kv is not None),
            key=lambda c: c.voltage_deviation_kv,
        )
        assert result.best_position == best.position

    def test_minimize_switching_prefers_initial_when_feasible(self):
        # Wide voltage tolerance -> staying put (0 switches) is feasible and optimal.
        pf_input = _build_input(_oltc(current_position=0))
        trafo_id = _trafo_id(pf_input)
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=trafo_id,
            objective="minimize_switching",
            target_kv=14.0,
        )
        assert result.best_position == 0
        assert result.switch_count == 0

    def test_optimization_deterministic(self):
        r1 = optimize_tap_positions(
            _build_input(_oltc()),
            _solve_once,
            branch_id=_trafo_id(_build_input(_oltc())),
            objective="minimize_losses",
        )
        pf2 = _build_input(_oltc())
        r2 = optimize_tap_positions(
            pf2, _solve_once, branch_id=_trafo_id(pf2), objective="minimize_losses"
        )
        assert r1.best_position == r2.best_position
