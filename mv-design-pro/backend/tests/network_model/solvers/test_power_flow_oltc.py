"""OLTC control-loop tests (V12K-045, OLTC F2).

Exercises the deterministic automatic voltage-regulation loop around the FROZEN
Newton-Raphson solver:
- no automatic OLTC -> single solve, trace None (determinism preserved),
- OLTC below setpoint -> steps toward the setpoint, ONE tap per iteration,
  converges into the dead band, WHITE BOX decisions recorded,
- unreachable setpoint -> stops at the position limit,
- deterministic (same input -> identical final positions and decisions),
- line-drop compensation shifts the regulation voltage.
"""

from __future__ import annotations

import pytest
from network_model.core.branch import (
    BranchType,
    LineDropCompensation,
    TapChanger,
    TransformerBranch,
)
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver
from network_model.solvers.power_flow_oltc import solve_with_oltc
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)


def _solve_once(pf_input: PowerFlowInput):
    return PowerFlowNewtonSolver().solve(pf_input)


def _build_input(
    tap_changer: TapChanger | None,
    *,
    load_mw: float = 10.0,
    load_mvar: float = 5.0,
    slack_u_pu: float = 0.95,
):
    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="HV",
            name="HV",
            node_type=NodeType.SLACK,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="LV",
            name="LV",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_branch(
        TransformerBranch(
            id="TR1",
            name="TR1",
            branch_type=BranchType.TRANSFORMER,
            from_node_id="HV",
            to_node_id="LV",
            rated_power_mva=25.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=15.0,
            uk_percent=12.0,
            pk_kw=120.0,
            i0_percent=0.0,
            p0_kw=0.0,
            vector_group="YNd11",
            tap_changer=tap_changer,
        )
    )
    return PowerFlowInput(
        graph=graph,
        base_mva=25.0,
        slack=SlackSpec(node_id="HV", u_pu=slack_u_pu, angle_rad=0.0),
        pq=[PQSpec(node_id="LV", p_mw=load_mw, q_mvar=load_mvar)],
        options=PowerFlowOptions(max_iter=50),
    )


def _oltc(**overrides) -> TapChanger:
    base = {
        "regulation_type": "OLTC",
        "regulated_winding": "HV",
        "neutral_position": 0,
        "current_position": 0,
        "min_position": -9,
        "max_position": 9,
        "step_percent": 1.25,
        "control_mode": "AUTOMATIC",
        "voltage_setpoint_kv": 15.0,
        "deadband_kv": 0.2,
        "controlled_bus_id": "LV",
    }
    base.update(overrides)
    return TapChanger(**base)


class TestNoRegulator:
    def test_no_tap_changer_single_solve_trace_none(self):
        pf_input = _build_input(None)
        solution, trace = solve_with_oltc(pf_input, _solve_once)
        assert trace is None
        # Identical to a plain single solve.
        plain = _solve_once(_build_input(None))
        assert solution.node_voltage_kv["LV"] == pytest.approx(plain.node_voltage_kv["LV"])

    def test_manual_oltc_is_not_regulated(self):
        pf_input = _build_input(_oltc(control_mode="MANUAL"))
        _solution, trace = solve_with_oltc(pf_input, _solve_once)
        assert trace is None


class TestRegulationLoop:
    def test_raises_low_voltage_into_deadband(self):
        pf_input = _build_input(_oltc())
        # Baseline (no regulation) LV voltage is below the 15.0 kV setpoint.
        baseline = _solve_once(_build_input(None)).node_voltage_kv["LV"]
        assert baseline < 15.0 - 0.1

        solution, trace = solve_with_oltc(pf_input, _solve_once)
        assert trace is not None
        assert trace["converged"] is True
        u_final = solution.node_voltage_kv["LV"]
        assert abs(u_final - 15.0) <= 0.2 / 2 + 1e-6

    def test_steps_down_for_hv_regulation(self):
        # HV-regulated, controlled bus on LV side, voltage too low -> position < 0.
        pf_input = _build_input(_oltc())
        _solution, trace = solve_with_oltc(pf_input, _solve_once)
        final_pos = trace["final_positions"]["TR1"]
        assert final_pos < 0

    def test_one_tap_per_iteration(self):
        pf_input = _build_input(_oltc())
        _solution, trace = solve_with_oltc(pf_input, _solve_once)
        for iteration in trace["iterations"]:
            for decision in iteration["decisions"]:
                delta = abs(decision["position_after"] - decision["position_before"])
                assert delta <= 1

    def test_switch_count_matches_position_travel(self):
        pf_input = _build_input(_oltc())
        _solution, trace = solve_with_oltc(pf_input, _solve_once)
        final = trace["final_positions"]["TR1"]
        initial = trace["initial_positions"]["TR1"]
        # Monotone descent -> switch count equals the position travel.
        assert trace["switch_counts"]["TR1"] == abs(final - initial)
        assert trace["total_switch_count"] == trace["switch_counts"]["TR1"]

    def test_deterministic(self):
        s1, t1 = solve_with_oltc(_build_input(_oltc()), _solve_once)
        s2, t2 = solve_with_oltc(_build_input(_oltc()), _solve_once)
        assert t1["final_positions"] == t2["final_positions"]
        assert s1.node_voltage_kv["LV"] == pytest.approx(s2.node_voltage_kv["LV"])
        # Decision reasons/positions identical.
        assert [d["reason"] for it in t1["iterations"] for d in it["decisions"]] == [
            d["reason"] for it in t2["iterations"] for d in it["decisions"]
        ]

    def test_within_deadband_no_movement(self):
        # Setpoint at the baseline voltage with a wide dead band -> no steps.
        baseline = _solve_once(_build_input(None)).node_voltage_kv["LV"]
        pf_input = _build_input(_oltc(voltage_setpoint_kv=baseline, deadband_kv=2.0))
        _solution, trace = solve_with_oltc(pf_input, _solve_once)
        assert trace["final_positions"]["TR1"] == 0
        first_iter = trace["iterations"][0]["decisions"][0]
        assert first_iter["reason"] == "within_deadband"


class TestBrakDanychRegulatora:
    """Brak danej regulatora = brak podstawy do decyzji, NIE pasmo zerowe.

    Podstawienie `(deadband_kv or 0.0)` czynilo kazda niezerowa odchylke
    naruszeniem: petla krecila zaczepem az do blokady oscylacji i licznik laczen
    rosl na pasmie, ktorego nikt nie zadeklarowal (przeglad fali 2026-08-01, P10).
    """

    def test_bez_pasma_w_modelu_regulator_nie_rusza_zaczepu(self):
        pf_input = _build_input(_oltc(deadband_kv=None))
        _solution, trace = solve_with_oltc(pf_input, _solve_once)
        assert trace["final_positions"]["TR1"] == 0
        assert trace["switch_counts"]["TR1"] == 0
        assert trace["total_switch_count"] == 0
        powody = {d["reason"] for it in trace["iterations"] for d in it["decisions"]}
        assert powody == {"no_deadband"}

    def test_pasmo_zerowe_ZADEKLAROWANE_dalej_reguluje(self):
        # Rozroznienie, ktore znosi cala klase defektu: 0,0 kV to JAWNA dana modelu
        # (regulator ma trafic dokladnie w nastawe), a None to BRAK danej. Gdyby
        # naprawa myliła te dwa stany, ten przypadek przestalby regulowac.
        pf_input = _build_input(_oltc(deadband_kv=0.0))
        _solution, trace = solve_with_oltc(pf_input, _solve_once)
        assert trace["total_switch_count"] > 0
        assert trace["final_positions"]["TR1"] < 0
        powody = {d["reason"] for it in trace["iterations"] for d in it["decisions"]}
        assert "no_deadband" not in powody

    def test_slad_niesie_brak_pasma_jako_dana_wejsciowa(self):
        # WHITE BOX: inzynier musi widziec w sladzie, ze pasma NIE BYLO — bez tego
        # „0 przelaczen" czyta sie jak werdykt „nie trzeba bylo regulowac".
        pf_input = _build_input(_oltc(deadband_kv=None))
        _solution, trace = solve_with_oltc(pf_input, _solve_once)
        assert trace["regulators"][0]["deadband_kv"] is None
        assert trace["iterations"][0]["decisions"][0]["deadband_kv"] is None


class TestLimits:
    def test_unreachable_setpoint_stops_at_limit(self):
        # Very high setpoint -> regulator drives to the minimum position (raising
        # LV voltage on an HV-regulated unit) and then reports limit_reached.
        pf_input = _build_input(_oltc(voltage_setpoint_kv=30.0, deadband_kv=0.2))
        _solution, trace = solve_with_oltc(pf_input, _solve_once)
        assert trace["final_positions"]["TR1"] == -9
        reasons = [d["reason"] for it in trace["iterations"] for d in it["decisions"]]
        assert "limit_reached" in reasons


class TestLineDropCompensation:
    def test_ldc_lowers_regulation_voltage_under_load(self):
        # With load flowing, LDC makes the regulator see a lower voltage than the
        # busbar, so it regulates to a higher busbar voltage than without LDC.
        no_ldc = _oltc()
        with_ldc = _oltc(
            line_drop_compensation=LineDropCompensation(enabled=True, r_ohm=2.0, x_ohm=4.0)
        )
        s_plain, t_plain = solve_with_oltc(_build_input(no_ldc), _solve_once)
        s_ldc, t_ldc = solve_with_oltc(_build_input(with_ldc), _solve_once)
        # LDC compensates a drop -> busbar target is pushed higher (position more
        # negative or equal for HV regulation).
        assert t_ldc["final_positions"]["TR1"] <= t_plain["final_positions"]["TR1"]
