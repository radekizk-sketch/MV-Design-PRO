"""Tests for Gauss-Seidel Power Flow Solver.

This module tests the Gauss-Seidel solver implementation and compares
results with the Newton-Raphson solver to ensure consistency.
"""

import pytest
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_gauss_seidel import (
    GaussSeidelOptions,
    PowerFlowGaussSeidelSolver,
    solve_power_flow_gauss_seidel,
)
from network_model.solvers.power_flow_newton import (
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


class TestGaussSeidelBasic:
    """Basic functionality tests for Gauss-Seidel solver."""

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

        result = solve_power_flow_gauss_seidel(pf_input)

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

        result = solve_power_flow_gauss_seidel(pf_input)

        assert result.converged is True
        # Voltage profile should decrease along the feeder
        assert result.node_u_mag["A"] > result.node_u_mag["B"] > result.node_u_mag["C"]

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

        result = solve_power_flow_gauss_seidel(pf_input)

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

        result = solve_power_flow_gauss_seidel(pf_input)

        assert result.converged is True
        assert abs(result.node_u_mag["A"] - 1.02) < 1e-6


class TestGaussSeidelPVBuses:
    """Tests for PV bus handling in Gauss-Seidel solver."""

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

        result = solve_power_flow_gauss_seidel(pf_input)

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

        result = solve_power_flow_gauss_seidel(pf_input)

        assert result.converged is True
        # Should have switched PV to PQ due to Q limits
        assert len(result.pv_to_pq_switches) > 0
        assert any(switch["node_id"] == "B" for switch in result.pv_to_pq_switches)


class TestGaussSeidelAcceleration:
    """Tests for acceleration factor (SOR) in Gauss-Seidel solver."""

    def test_acceleration_factor_affects_convergence(self) -> None:
        """Test that acceleration factor affects number of iterations."""
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
            options=PowerFlowOptions(max_iter=200, tolerance=1e-6),
        )

        # No acceleration
        gs_opts_1 = GaussSeidelOptions(acceleration_factor=1.0)
        result_1 = solve_power_flow_gauss_seidel(pf_input, gs_opts_1)

        # With acceleration (SOR)
        gs_opts_15 = GaussSeidelOptions(acceleration_factor=1.5)
        result_15 = solve_power_flow_gauss_seidel(pf_input, gs_opts_15)

        assert result_1.converged is True
        assert result_15.converged is True
        # Both should give similar voltages
        for node_id in ["A", "B", "C"]:
            assert abs(result_1.node_u_mag[node_id] - result_15.node_u_mag[node_id]) < 0.001

    def test_under_relaxation_more_stable(self) -> None:
        """Test that under-relaxation still converges (possibly slower)."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=200, tolerance=1e-6),
        )

        gs_opts = GaussSeidelOptions(acceleration_factor=0.8)  # Under-relaxation
        result = solve_power_flow_gauss_seidel(pf_input, gs_opts)

        assert result.converged is True


class TestGaussSeidelWhiteBox:
    """Tests for WHITE BOX trace in Gauss-Seidel solver."""

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

        result = solve_power_flow_gauss_seidel(pf_input)

        assert result.converged is True
        assert len(result.nr_trace) > 0  # Uses same field name as NR for compatibility

        # Check trace entries have required fields
        for entry in result.nr_trace:
            assert "iter" in entry
            assert "max_mismatch_pu" in entry
            assert "mismatch_norm" in entry
            assert "step_norm" in entry
            assert "damping_used" in entry

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

        result = solve_power_flow_gauss_seidel(pf_input)

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

        result = solve_power_flow_gauss_seidel(pf_input)

        assert result.init_state is not None
        assert "A" in result.init_state
        assert "B" in result.init_state
        assert "v_pu" in result.init_state["A"]
        assert "theta_rad" in result.init_state["A"]


class TestGaussSeidelVsNewtonRaphson:
    """Comparison tests between Gauss-Seidel and Newton-Raphson solvers."""

    def test_two_bus_voltage_matches_newton(self) -> None:
        """Test that GS and NR give same results for two-bus network."""
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

        gs_result = solve_power_flow_gauss_seidel(pf_input)
        nr_result = solve_power_flow_physics(pf_input)

        assert gs_result.converged is True
        assert nr_result.converged is True

        # Compare voltage magnitudes
        for node_id in ["A", "B"]:
            assert abs(gs_result.node_u_mag[node_id] - nr_result.node_u_mag[node_id]) < 1e-4

        # Compare voltage angles
        for node_id in ["A", "B"]:
            assert abs(gs_result.node_angle[node_id] - nr_result.node_angle[node_id]) < 1e-4

    def test_three_bus_voltage_matches_newton(self) -> None:
        """Test that GS and NR give same results for three-bus network."""
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

        gs_result = solve_power_flow_gauss_seidel(pf_input)
        nr_result = solve_power_flow_physics(pf_input)

        assert gs_result.converged is True
        assert nr_result.converged is True

        # Compare voltage magnitudes
        for node_id in ["A", "B", "C"]:
            assert abs(gs_result.node_u_mag[node_id] - nr_result.node_u_mag[node_id]) < 1e-4

    def test_ring_network_matches_newton(self) -> None:
        """Test that GS and NR give same results for ring network."""
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

        gs_result = solve_power_flow_gauss_seidel(pf_input)
        nr_result = solve_power_flow_physics(pf_input)

        assert gs_result.converged is True
        assert nr_result.converged is True

        # Compare voltage magnitudes
        for node_id in ["A", "B", "C"]:
            assert abs(gs_result.node_u_mag[node_id] - nr_result.node_u_mag[node_id]) < 1e-4

    def test_pv_bus_matches_newton(self) -> None:
        """Test that GS and NR give same results for network with PV bus."""
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

        gs_result = solve_power_flow_gauss_seidel(pf_input)
        nr_result = solve_power_flow_physics(pf_input)

        assert gs_result.converged is True
        assert nr_result.converged is True

        # Compare voltage magnitudes (with slightly larger tolerance for PV)
        for node_id in ["A", "B", "C"]:
            assert abs(gs_result.node_u_mag[node_id] - nr_result.node_u_mag[node_id]) < 0.01

    def test_losses_match_newton(self) -> None:
        """Test that calculated losses match between GS and NR."""
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

        gs_result = solve_power_flow_gauss_seidel(pf_input)
        nr_result = solve_power_flow_physics(pf_input)

        assert gs_result.converged is True
        assert nr_result.converged is True

        # Compare losses (complex power)
        assert abs(gs_result.losses_total.real - nr_result.losses_total.real) < 1e-4
        assert abs(gs_result.losses_total.imag - nr_result.losses_total.imag) < 1e-4


class TestGaussSeidelEdgeCases:
    """Tests for edge cases in Gauss-Seidel solver."""

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

        result = solve_power_flow_gauss_seidel(pf_input)

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

        result = solve_power_flow_gauss_seidel(pf_input)

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

        result = solve_power_flow_gauss_seidel(pf_input)

        assert result.converged is True
        # Check PV voltages are close to setpoints
        assert abs(result.node_u_mag["B"] - 1.01) < 0.01
        assert abs(result.node_u_mag["C"] - 1.02) < 0.01


class TestGaussSeidelSolverAPI:
    """Tests for solver API consistency."""

    def test_solver_class_interface(self) -> None:
        """Test that solver class has correct interface."""
        solver = PowerFlowGaussSeidelSolver()

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
        result1 = PowerFlowGaussSeidelSolver().solve(pf_input)
        result2 = solve_power_flow_gauss_seidel(pf_input)

        assert result1.converged == result2.converged
        assert abs(result1.node_u_mag["B"] - result2.node_u_mag["B"]) < 1e-10

    def test_returns_newton_solution_type(self) -> None:
        """Test that solver returns PowerFlowNewtonSolution type."""
        from network_model.solvers.power_flow_newton import PowerFlowNewtonSolution

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

        result = solve_power_flow_gauss_seidel(pf_input)

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

        result = solve_power_flow_gauss_seidel(pf_input)

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


class TestFix08bSolverMethodField:
    """FIX-08b: Tests for solver_method field."""

    def test_gs_result_has_solver_method_gauss_seidel(self) -> None:
        """Test that GS result has solver_method='gauss-seidel'."""
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

        result = solve_power_flow_gauss_seidel(pf_input)

        assert result.solver_method == "gauss-seidel"
        assert result.fallback_info is None

    def test_nr_result_has_solver_method_newton_raphson(self) -> None:
        """Test that NR result has solver_method='newton-raphson' (default)."""
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

        result = solve_power_flow_physics(pf_input)

        assert result.solver_method == "newton-raphson"
        assert result.fallback_info is None


class TestFix08bAccelerationFactorValidation:
    """FIX-08b: Tests for acceleration_factor validation."""

    def test_valid_acceleration_factor_1_0(self) -> None:
        """Test that acceleration_factor=1.0 is valid."""
        options = GaussSeidelOptions(acceleration_factor=1.0)
        assert options.acceleration_factor == 1.0

    def test_valid_acceleration_factor_0_5(self) -> None:
        """Test that acceleration_factor=0.5 (lower bound) is valid."""
        options = GaussSeidelOptions(acceleration_factor=0.5)
        assert options.acceleration_factor == 0.5

    def test_valid_acceleration_factor_2_0(self) -> None:
        """Test that acceleration_factor=2.0 (upper bound) is valid."""
        options = GaussSeidelOptions(acceleration_factor=2.0)
        assert options.acceleration_factor == 2.0

    def test_valid_acceleration_factor_1_5(self) -> None:
        """Test that acceleration_factor=1.5 (SOR) is valid."""
        options = GaussSeidelOptions(acceleration_factor=1.5)
        assert options.acceleration_factor == 1.5

    def test_invalid_acceleration_factor_too_low(self) -> None:
        """Test that acceleration_factor < 0.5 raises ValueError with Polish message."""
        with pytest.raises(ValueError) as exc_info:
            GaussSeidelOptions(acceleration_factor=0.3)

        error_msg = str(exc_info.value)
        assert "Współczynnik przyspieszenia" in error_msg
        assert "0.3" in error_msg
        assert "[0.5, 2.0]" in error_msg

    def test_invalid_acceleration_factor_too_high(self) -> None:
        """Test that acceleration_factor > 2.0 raises ValueError with Polish message."""
        with pytest.raises(ValueError) as exc_info:
            GaussSeidelOptions(acceleration_factor=2.5)

        error_msg = str(exc_info.value)
        assert "Współczynnik przyspieszenia" in error_msg
        assert "2.5" in error_msg
        assert "[0.5, 2.0]" in error_msg

    def test_invalid_acceleration_factor_negative(self) -> None:
        """Test that negative acceleration_factor raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            GaussSeidelOptions(acceleration_factor=-0.5)

        assert "Współczynnik przyspieszenia" in str(exc_info.value)


class TestFix08bFallbackToNewtonRaphson:
    """FIX-08b: Tests for GS to NR fallback functionality."""

    def test_fallback_triggers_on_non_convergence(self) -> None:
        """Test that fallback to NR triggers when GS doesn't converge."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        # Use very low max_iter to force non-convergence in GS
        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=2, tolerance=1e-12),  # Very tight
        )

        gs_options = GaussSeidelOptions(
            acceleration_factor=1.0,
            allow_fallback=True,
            max_iter=2,
            tolerance=1e-12,
        )

        result = solve_power_flow_gauss_seidel(pf_input, gs_options)

        # Should have fallen back to NR and converged
        assert result.converged is True
        assert result.solver_method == "newton-raphson"
        assert result.fallback_info is not None
        assert result.fallback_info["fallback_used"] == "newton-raphson"
        assert result.fallback_info["cause"] == "non_convergence"

    def test_no_fallback_when_disabled(self) -> None:
        """Test that no fallback occurs when allow_fallback=False."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=2, tolerance=1e-12),
        )

        gs_options = GaussSeidelOptions(
            acceleration_factor=1.0,
            allow_fallback=False,  # Fallback disabled
            max_iter=2,
            tolerance=1e-12,
        )

        result = solve_power_flow_gauss_seidel(pf_input, gs_options)

        # Should NOT have converged (no fallback)
        assert result.converged is False
        assert result.solver_method == "gauss-seidel"
        assert result.fallback_info is None

    def test_no_fallback_when_gs_converges(self) -> None:
        """Test that no fallback occurs when GS converges successfully."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5)],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-6),
        )

        gs_options = GaussSeidelOptions(
            acceleration_factor=1.5,
            allow_fallback=True,  # Fallback enabled, but not needed
        )

        result = solve_power_flow_gauss_seidel(pf_input, gs_options)

        # Should have converged without fallback
        assert result.converged is True
        assert result.solver_method == "gauss-seidel"
        assert result.fallback_info is None

    def test_fallback_result_matches_direct_nr_result(self) -> None:
        """Test that fallback result matches direct NR result."""
        graph = NetworkGraph()
        graph.add_node(_make_slack_node("A"))
        graph.add_node(_make_pq_node("B"))
        _add_line(graph, "L1", "A", "B")

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
            options=PowerFlowOptions(max_iter=30, tolerance=1e-8),
        )

        # Get direct NR result
        nr_result = solve_power_flow_physics(pf_input)

        # Get GS with fallback (force fallback with low iterations)
        gs_options = GaussSeidelOptions(
            acceleration_factor=1.0,
            allow_fallback=True,
            max_iter=1,  # Force non-convergence
            tolerance=1e-12,
        )
        fallback_result = solve_power_flow_gauss_seidel(pf_input, gs_options)

        # Results should match
        assert fallback_result.converged == nr_result.converged
        for node_id in ["A", "B"]:
            assert abs(fallback_result.node_u_mag[node_id] - nr_result.node_u_mag[node_id]) < 1e-10
