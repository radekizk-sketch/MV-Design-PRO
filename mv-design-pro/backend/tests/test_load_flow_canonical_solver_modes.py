from enm.canonical_analysis import _solve_power_flow_with_method
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)


def _input() -> tuple[PowerFlowInput, PowerFlowOptions]:
    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="A",
            name="A",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="B",
            name="B",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_branch(
        LineBranch(
            id="L1",
            name="L1",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="B",
            r_ohm_per_km=0.2,
            x_ohm_per_km=0.4,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=300.0,
        )
    )
    options = PowerFlowOptions(max_iter=80, tolerance=1e-6, trace_level="full")
    return (
        PowerFlowInput(
            graph=graph,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=1.0, q_mvar=0.4)],
            options=options,
        ),
        options,
    )


def test_canonical_load_flow_supports_nr_gs_and_fd_modes() -> None:
    for requested, expected in [
        ("newton-raphson", "newton-raphson"),
        ("gauss-seidel", "gauss-seidel"),
        ("fast-decoupled", "fast-decoupled"),
    ]:
        pf_input, options = _input()
        result = _solve_power_flow_with_method(
            pf_input,
            options,
            {"fd_method": "XB"},
            requested,
        )

        assert result.solver_method == expected
        assert result.nr_trace
        assert result.converged is True
