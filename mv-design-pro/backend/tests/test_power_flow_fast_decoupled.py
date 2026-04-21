"""Tests for Fast-Decoupled Load Flow (FDLF) Solver.

This module tests the FDLF solver implementation and compares
results with the Newton-Raphson solver to ensure consistency.

FIX-09: FDLF solver with WHITE-BOX trace support.
"""

import json

import pytest
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_fast_decoupled import (
    FastDecoupledOptions,
    PowerFlowFastDecoupledSolver,
    solve_power_flow_fast_decoupled,
)
from network_model.solvers.power_flow_newton import (
    PowerFlowNewtonSolution,
    solve_power_flow_physics,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    SlackSpec,
)


def _make_slack_node(node_id: str, voltage_kv: float = 10.0) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.SLACK,
        voltage_level=voltage_kv,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )


def _make_pq_node(node_id: str, voltage_kv: float = 10.0) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.PQ,
        voltage_level=voltage_kv,
        active_power=0.0,
        reactive_power=0.0,
    )


def _make_pv_node(node_id: str, voltage_kv: float = 10.0) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.PV,
        voltage_level=voltage_kv,
        voltage_magnitude=1.0,
        active_power=0.0,
        reactive_power=0.0,
    )


def _add_line(
    graph: NetworkGraph,
    branch_id: str,
    from_node: str,
    to_node: str,
    r_ohm_per_km: float = 0.4,
    x_ohm_per_km: float = 0.8,
    length_km: float = 1.0,
) -> None:
    graph.add_branch(
        LineBranch(
            id=branch_id,
            name=branch_id,
            branch_type=BranchType.LINE,
            from_node_id=from_node,
            to_node_id=to_node,
            r_ohm_per_km=r_ohm_per_km,
            x_ohm_per_km=x_ohm_per_km,
            b_us_per_km=0.0,
            length_km=length_km,
            rated_current_a=300.0,
        )
    )


def _add_transformer(
    graph: NetworkGraph,
    branch_id: str,
    from_node: str,
    to_node: str,
) -> None:
    graph.add_branch(
        TransformerBranch(
            id=branch_id,
            name=branch_id,
            branch_type=BranchType.TRANSFORMER,
            from_node_id=from_node,
            to_node_id=to_node,
            rated_power_mva=10.0,
            voltage_hv_kv=10.0,
            voltage_lv_kv=10.0,
            uk_percent=8.0,
            pk_kw=30.0,
            i0_percent=0.0,
            p0_kw=0.0,
            vector_group="Dyn11",
            tap_position=0,
            tap_step_percent=2.5,
        )
    )


class TestFastDecoupledBasic:
    """Basic functionality tests for Fast-Decoupled solver."""

    def test_two_bus_converges(self) -> None:
        """Test that a simple two-bus network converges."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True
        assert result.node_u_mag["B"] < result.node_u_mag["A"]  # Voltage drops under load

    def test_three_bus_radial_converges(self) -> None:
        """Test that a three-bus radial network converges."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        graph.add_node(_make_pq_node("C"))
        _add_line(graph, "L1", "A", "B")
        _add_line(graph, "L2", "B", "C")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[
                PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5),
                PQSpec(node_id="C", p_mw=0.8, q_mvar=0.3),
            ],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True
        # Voltage profile should decrease along the feeder
        assert result.node_u_mag["A"] > result.node_u_mag["B"] > result.node_u_mag["C"]

    def test_ring_network_converges(self) -> None:
        """Test that a ring network converges."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        graph.add_node(_make_pq_node("C"))
        _add_line(graph, "L1", "A", "B")
        _add_line(graph, "L2", "B", "C")
        _add_line(graph, "L3", "C", "A")  # Ring closure

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[
                PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5),
                PQSpec(node_id="C", p_mw=0.8, q_mvar=0.3),
            ],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True

    def test_no_load_returns_flat_voltage(self) -> None:
        """Test that network with no load maintains flat voltage profile."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=0.0, q_mvar=0.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True
        assert abs(result.node_u_mag["A"] - 1.0) < 1e-6
        assert abs(result.node_u_mag["B"] - 1.0) < 1e-6

    def test_slack_only_network(self) -> None:
        """Test that a network with only slack bus works."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.02, angle_rad=0.0),
            pq=[],
            options=PowerFlowOptions(max_iter=10),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True
        assert abs(result.node_u_mag["A"] - 1.02) < 1e-6


class TestFastDecoupledPVBuses:
    """Tests for PV bus handling in Fast-Decoupled solver."""

    def test_pv_bus_maintains_voltage_setpoint(self) -> None:
        """Test that PV bus maintains its voltage setpoint."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pv_node("B"))
        graph.add_node(_make_pq_node("C"))
        _add_line(graph, "L1", "A", "B")
        _add_line(graph, "L2", "B", "C")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="C", p_mw=1.0, q_mvar=0.4)],
            pv=[
                PVSpec(
                    node_id="B",
                    p_mw=-1.0,  # Generation
                    u_pu=1.02,
                    q_min_mvar=-5.0,
                    q_max_mvar=5.0,
                )
            ],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True
        assert abs(result.node_u_mag["B"] - 1.02) < 0.01  # Within 1% of setpoint

    def test_pv_to_pq_switch_on_q_limit(self) -> None:
        """Test that PV bus switches to PQ when Q limit is exceeded."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pv_node("B"))
        graph.add_node(_make_pq_node("C"))
        _add_line(graph, "L1", "A", "B")
        _add_line(graph, "L2", "B", "C")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="C", p_mw=2.5, q_mvar=1.2)],
            pv=[
                PVSpec(
                    node_id="B",
                    p_mw=-1.0,
                    u_pu=1.05,
                    q_min_mvar=-0.1,  # Very tight limits
                    q_max_mvar=0.1,
                )
            ],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True
        # Should have switched PV to PQ due to Q limits
        assert len(result.pv_to_pq_switches) > 0
        assert any(switch["node_id"] == "B" for switch in result.pv_to_pq_switches)


class TestFastDecoupledOptions:
    """Tests for FastDecoupledOptions validation."""

    def test_default_options(self) -> None:
        """Test default options are valid."""
        options = FastDecoupledOptions()
        assert options.method == "XB"
        assert options.rebuild_matrices_every == 0
        assert options.angle_damping == 1.0
        assert options.voltage_damping == 1.0

    def test_xb_method_valid(self) -> None:
        """Test XB method is valid."""
        options = FastDecoupledOptions(method="XB")
        assert options.method == "XB"

    def test_bx_method_valid(self) -> None:
        """Test BX method is valid."""
        options = FastDecoupledOptions(method="BX")
        assert options.method == "BX"

    def test_positive_angle_damping_valid(self) -> None:
        """Test positive angle_damping is valid."""
        options = FastDecoupledOptions(angle_damping=0.8)
        assert options.angle_damping == 0.8

    def test_positive_voltage_damping_valid(self) -> None:
        """Test positive voltage_damping is valid."""
        options = FastDecoupledOptions(voltage_damping=0.9)
        assert options.voltage_damping == 0.9

    def test_invalid_angle_damping_zero(self) -> None:
        """Test that angle_damping=0 raises ValueError with Polish message."""
        with pytest.raises(ValueError) as exc_info:
            FastDecoupledOptions(angle_damping=0.0)

        error_msg = str(exc_info.value)
        assert "Współczynnik tłumienia kąta" in error_msg
        assert "0.0" in error_msg

    def test_invalid_angle_damping_negative(self) -> None:
        """Test that negative angle_damping raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            FastDecoupledOptions(angle_damping=-0.5)

        assert "Współczynnik tłumienia kąta" in str(exc_info.value)

    def test_invalid_voltage_damping_zero(self) -> None:
        """Test that voltage_damping=0 raises ValueError with Polish message."""
        with pytest.raises(ValueError) as exc_info:
            FastDecoupledOptions(voltage_damping=0.0)

        error_msg = str(exc_info.value)
        assert "Współczynnik tłumienia napięcia" in error_msg
        assert "0.0" in error_msg

    def test_invalid_voltage_damping_negative(self) -> None:
        """Test that negative voltage_damping raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            FastDecoupledOptions(voltage_damping=-0.5)

        assert "Współczynnik tłumienia napięcia" in str(exc_info.value)

    def test_invalid_rebuild_matrices_every_negative(self) -> None:
        """Test that negative rebuild_matrices_every raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            FastDecoupledOptions(rebuild_matrices_every=-1)

        assert "rebuild_matrices_every" in str(exc_info.value)

    def test_rebuild_matrices_every_zero_valid(self) -> None:
        """Test that rebuild_matrices_every=0 is valid."""
        options = FastDecoupledOptions(rebuild_matrices_every=0)
        assert options.rebuild_matrices_every == 0

    def test_rebuild_matrices_every_positive_valid(self) -> None:
        """Test that positive rebuild_matrices_every is valid."""
        options = FastDecoupledOptions(rebuild_matrices_every=5)
        assert options.rebuild_matrices_every == 5


class TestFastDecoupledMethods:
    """Tests for XB vs BX method variants."""

    def test_xb_method_converges(self) -> None:
        """Test that XB method converges."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        fd_options = FastDecoupledOptions(method="XB")
        result = solve_power_flow_fast_decoupled(pf_input, fd_options)

        assert result.converged is True

    def test_bx_method_converges(self) -> None:
        """Test that BX method converges."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        fd_options = FastDecoupledOptions(method="BX")
        result = solve_power_flow_fast_decoupled(pf_input, fd_options)

        assert result.converged is True

    def test_xb_and_bx_give_similar_results(self) -> None:
        """Test that XB and BX methods give similar results."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        graph.add_node(_make_pq_node("C"))
        _add_line(graph, "L1", "A", "B")
        _add_line(graph, "L2", "B", "C")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[
                PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5),
                PQSpec(node_id="C", p_mw=0.8, q_mvar=0.3),
            ],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        result_xb = solve_power_flow_fast_decoupled(pf_input, FastDecoupledOptions(method="XB"))
        result_bx = solve_power_flow_fast_decoupled(pf_input, FastDecoupledOptions(method="BX"))

        assert result_xb.converged is True
        assert result_bx.converged is True

        # Results should be very similar
        for node_id in ["A", "B", "C"]:
            assert abs(result_xb.node_u_mag[node_id] - result_bx.node_u_mag[node_id]) < 0.001


class TestFastDecoupledWhiteBox:
    """Tests for WHITE BOX trace in Fast-Decoupled solver."""

    def test_trace_contains_iterations(self) -> None:
        """Test that trace contains iteration information."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6, trace_level="full"),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True
        assert len(result.nr_trace) > 0

        # Check trace entries have required fields
        for entry in result.nr_trace:
            assert "solver_method" in entry
            assert entry["solver_method"] == "fast-decoupled"
            assert "iter" in entry
            assert "max_mismatch_pu" in entry
            assert "mismatch_norm" in entry
            assert "step_norm" in entry
            assert "angle_damping_used" in entry
            assert "voltage_damping_used" in entry

    def test_full_trace_has_state_next(self) -> None:
        """Test that full trace includes state information."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6, trace_level="full"),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True
        # Check that full trace has state_next
        has_state_next = any("state_next" in entry for entry in result.nr_trace)
        assert has_state_next

    def test_init_state_recorded(self) -> None:
        """Test that initial state is recorded for full trace."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6, trace_level="full"),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.init_state is not None
        assert "A" in result.init_state
        assert "B" in result.init_state
        assert "v_pu" in result.init_state["A"]
        assert "theta_rad" in result.init_state["A"]

    def test_solver_method_field_is_fast_decoupled(self) -> None:
        """Test that solver_method field is 'fast-decoupled'."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5)],
            options=PowerFlowOptions(max_iter=100),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.solver_method == "fast-decoupled"


class TestFastDecoupledVsNewtonRaphson:
    """Comparison tests between Fast-Decoupled and Newton-Raphson solvers."""

    def test_two_bus_voltage_matches_newton(self) -> None:
        """Test that FDLF and NR give same results for two-bus network."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-8),
        )

        fd_result = solve_power_flow_fast_decoupled(pf_input)
        nr_result = solve_power_flow_physics(pf_input)

        assert fd_result.converged is True
        assert nr_result.converged is True

        # Compare voltage magnitudes
        for node_id in ["A", "B"]:
            assert abs(fd_result.node_u_mag[node_id] - nr_result.node_u_mag[node_id]) < 1e-3

        # Compare voltage angles
        for node_id in ["A", "B"]:
            assert abs(fd_result.node_angle[node_id] - nr_result.node_angle[node_id]) < 1e-3

    def test_three_bus_voltage_matches_newton(self) -> None:
        """Test that FDLF and NR give same results for three-bus network."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        graph.add_node(_make_pq_node("C"))
        _add_line(graph, "L1", "A", "B")
        _add_line(graph, "L2", "B", "C")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[
                PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5),
                PQSpec(node_id="C", p_mw=0.8, q_mvar=0.3),
            ],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-8),
        )

        fd_result = solve_power_flow_fast_decoupled(pf_input)
        nr_result = solve_power_flow_physics(pf_input)

        assert fd_result.converged is True
        assert nr_result.converged is True

        # Compare voltage magnitudes
        for node_id in ["A", "B", "C"]:
            assert abs(fd_result.node_u_mag[node_id] - nr_result.node_u_mag[node_id]) < 1e-3

    def test_ring_network_matches_newton(self) -> None:
        """Test that FDLF and NR give same results for ring network."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        graph.add_node(_make_pq_node("C"))
        _add_line(graph, "L1", "A", "B")
        _add_line(graph, "L2", "B", "C")
        _add_line(graph, "L3", "C", "A")  # Ring closure

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[
                PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5),
                PQSpec(node_id="C", p_mw=0.8, q_mvar=0.3),
            ],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-8),
        )

        fd_result = solve_power_flow_fast_decoupled(pf_input)
        nr_result = solve_power_flow_physics(pf_input)

        assert fd_result.converged is True
        assert nr_result.converged is True

        # Compare voltage magnitudes
        for node_id in ["A", "B", "C"]:
            assert abs(fd_result.node_u_mag[node_id] - nr_result.node_u_mag[node_id]) < 1e-3

    def test_pv_bus_matches_newton(self) -> None:
        """Test that FDLF and NR give same results for network with PV bus."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pv_node("B"))
        graph.add_node(_make_pq_node("C"))
        _add_line(graph, "L1", "A", "B")
        _add_line(graph, "L2", "B", "C")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="C", p_mw=1.0, q_mvar=0.4)],
            pv=[
                PVSpec(
                    node_id="B",
                    p_mw=-1.0,
                    u_pu=1.02,
                    q_min_mvar=-5.0,
                    q_max_mvar=5.0,
                )
            ],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        fd_result = solve_power_flow_fast_decoupled(pf_input)
        nr_result = solve_power_flow_physics(pf_input)

        assert fd_result.converged is True
        assert nr_result.converged is True

        # Compare voltage magnitudes (with slightly larger tolerance for PV)
        for node_id in ["A", "B", "C"]:
            assert abs(fd_result.node_u_mag[node_id] - nr_result.node_u_mag[node_id]) < 1e-3

    def test_losses_match_newton(self) -> None:
        """Test that calculated losses match between FDLF and NR."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-8),
        )

        fd_result = solve_power_flow_fast_decoupled(pf_input)
        nr_result = solve_power_flow_physics(pf_input)

        assert fd_result.converged is True
        assert nr_result.converged is True

        # Compare losses (complex power)
        assert abs(fd_result.losses_total.real - nr_result.losses_total.real) < 1e-3
        assert abs(fd_result.losses_total.imag - nr_result.losses_total.imag) < 1e-3


class TestFastDecoupledDeterminism:
    """Tests for deterministic behavior of Fast-Decoupled solver."""

    def test_determinism_same_results(self) -> None:
        """Test that two runs produce identical results."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        graph.add_node(_make_pq_node("C"))
        _add_line(graph, "L1", "A", "B")
        _add_line(graph, "L2", "B", "C")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[
                PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5),
                PQSpec(node_id="C", p_mw=0.8, q_mvar=0.3),
            ],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6, trace_level="full"),
        )

        # Run twice
        result1 = solve_power_flow_fast_decoupled(pf_input)
        result2 = solve_power_flow_fast_decoupled(pf_input)

        # Check all result fields are identical
        assert result1.converged == result2.converged
        assert result1.iterations == result2.iterations
        assert result1.max_mismatch == result2.max_mismatch

        # Check voltages are identical
        for node_id in ["A", "B", "C"]:
            assert result1.node_u_mag[node_id] == result2.node_u_mag[node_id]
            assert result1.node_angle[node_id] == result2.node_angle[node_id]

    def test_determinism_identical_trace(self) -> None:
        """Test that two runs produce identical trace (JSON comparison)."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6, trace_level="full"),
        )

        # Run twice
        result1 = solve_power_flow_fast_decoupled(pf_input)
        result2 = solve_power_flow_fast_decoupled(pf_input)

        # Compare traces as JSON (deterministic comparison)
        trace1_json = json.dumps(result1.nr_trace, sort_keys=True)
        trace2_json = json.dumps(result2.nr_trace, sort_keys=True)

        assert trace1_json == trace2_json

    def test_determinism_init_state_identical(self) -> None:
        """Test that initial state is identical between runs."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6, trace_level="full"),
        )

        # Run twice
        result1 = solve_power_flow_fast_decoupled(pf_input)
        result2 = solve_power_flow_fast_decoupled(pf_input)

        # Compare init_state as JSON
        init1_json = json.dumps(result1.init_state, sort_keys=True)
        init2_json = json.dumps(result2.init_state, sort_keys=True)

        assert init1_json == init2_json


class TestFastDecoupledEdgeCases:
    """Tests for edge cases in Fast-Decoupled solver."""

    def test_high_impedance_line_converges(self) -> None:
        """Test convergence with high impedance line."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B", r_ohm_per_km=2.0, x_ohm_per_km=4.0, length_km=10.0)

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=0.5, q_mvar=0.2)],
            options=PowerFlowOptions(max_iter=200, tolerance=1e-6),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True

    def test_transformer_network_converges(self) -> None:
        """Test convergence with transformer."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_transformer(graph, "T1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True

    def test_multiple_pv_buses(self) -> None:
        """Test network with multiple PV buses."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pv_node("B"))
        graph.add_node(_make_pv_node("C"))
        graph.add_node(_make_pq_node("D"))
        _add_line(graph, "L1", "A", "B")
        _add_line(graph, "L2", "A", "C")
        _add_line(graph, "L3", "B", "D")
        _add_line(graph, "L4", "C", "D")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="D", p_mw=2.0, q_mvar=1.0)],
            pv=[
                PVSpec(
                    node_id="B",
                    p_mw=-0.5,
                    u_pu=1.01,
                    q_min_mvar=-3.0,
                    q_max_mvar=3.0,
                ),
                PVSpec(
                    node_id="C",
                    p_mw=-0.5,
                    u_pu=1.02,
                    q_min_mvar=-3.0,
                    q_max_mvar=3.0,
                ),
            ],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert result.converged is True
        # Check PV voltages are close to setpoints
        assert abs(result.node_u_mag["B"] - 1.01) < 0.01
        assert abs(result.node_u_mag["C"] - 1.02) < 0.01


class TestFastDecoupledSolverAPI:
    """Tests for solver API consistency."""

    def test_solver_class_interface(self) -> None:
        """Test that solver class has correct interface."""
        solver = PowerFlowFastDecoupledSolver()

        assert hasattr(solver, "solve")
        assert callable(solver.solve)

    def test_convenience_function(self) -> None:
        """Test convenience function works."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5)],
            options=PowerFlowOptions(max_iter=100),
        )

        # Both methods should work
        result1 = PowerFlowFastDecoupledSolver().solve(pf_input)
        result2 = solve_power_flow_fast_decoupled(pf_input)

        assert result1.converged == result2.converged
        assert abs(result1.node_u_mag["B"] - result2.node_u_mag["B"]) < 1e-10

    def test_returns_newton_solution_type(self) -> None:
        """Test that solver returns PowerFlowNewtonSolution type."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5)],
            options=PowerFlowOptions(max_iter=100),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        assert isinstance(result, PowerFlowNewtonSolution)

    def test_result_has_all_expected_fields(self) -> None:
        """Test that result has all expected fields."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5)],
            options=PowerFlowOptions(max_iter=100),
        )

        result = solve_power_flow_fast_decoupled(pf_input)

        # Check required fields
        assert hasattr(result, "converged")
        assert hasattr(result, "iterations")
        assert hasattr(result, "max_mismatch")
        assert hasattr(result, "node_voltage")
        assert hasattr(result, "node_u_mag")
        assert hasattr(result, "node_angle")
        assert hasattr(result, "branch_current")
        assert hasattr(result, "branch_s_from")
        assert hasattr(result, "branch_s_to")
        assert hasattr(result, "losses_total")
        assert hasattr(result, "slack_power")
        assert hasattr(result, "ybus_trace")
        assert hasattr(result, "nr_trace")
        assert hasattr(result, "pv_to_pq_switches")
        assert hasattr(result, "solver_method")
        assert result.solver_method == "fast-decoupled"


class TestFastDecoupledDamping:
    """Tests for damping parameters in Fast-Decoupled solver."""

    def test_angle_damping_affects_convergence(self) -> None:
        """Test that angle_damping affects convergence behavior."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        # With full damping (no damping)
        result_full = solve_power_flow_fast_decoupled(
            pf_input, FastDecoupledOptions(angle_damping=1.0)
        )

        # With reduced damping (more conservative)
        result_damped = solve_power_flow_fast_decoupled(
            pf_input, FastDecoupledOptions(angle_damping=0.8)
        )

        assert result_full.converged is True
        assert result_damped.converged is True

        # Both should give similar final results
        assert abs(result_full.node_u_mag["B"] - result_damped.node_u_mag["B"]) < 0.001

    def test_voltage_damping_affects_convergence(self) -> None:
        """Test that voltage_damping affects convergence behavior."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        # With full damping (no damping)
        result_full = solve_power_flow_fast_decoupled(
            pf_input, FastDecoupledOptions(voltage_damping=1.0)
        )

        # With reduced damping (more conservative)
        result_damped = solve_power_flow_fast_decoupled(
            pf_input, FastDecoupledOptions(voltage_damping=0.8)
        )

        assert result_full.converged is True
        assert result_damped.converged is True

        # Both should give similar final results
        assert abs(result_full.node_u_mag["B"] - result_damped.node_u_mag["B"]) < 0.001
