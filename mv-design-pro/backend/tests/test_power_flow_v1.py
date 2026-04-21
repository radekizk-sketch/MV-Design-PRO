import pytest
from analysis.power_flow import PowerFlowOptions, PowerFlowSolver
from analysis.power_flow.types import PowerFlowInput, PQSpec, SlackSpec
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType


def _assert_basic_trace(result: object) -> None:
    trace = result.white_box_trace
    for key in ("ybus", "nr_iterations", "power_balance", "islands"):
        assert key in trace


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


def _add_line(graph: NetworkGraph, branch_id: str, from_node: str, to_node: str) -> None:
    graph.add_branch(
        LineBranch(
            id=branch_id,
            name=branch_id,
            branch_type=BranchType.LINE,
            from_node_id=from_node,
            to_node_id=to_node,
            r_ohm_per_km=0.4,
            x_ohm_per_km=0.8,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=300.0,
        )
    )


def _solve_power_flow(graph: NetworkGraph, pq_specs: list[PQSpec]) -> PowerFlowInput:
    return PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=pq_specs,
        options=PowerFlowOptions(max_iter=25),
    )


def test_two_bus_converges_and_voltage_drops() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    _add_line(graph, "L1", "A", "B")

    pf_input = _solve_power_flow(graph, [PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)])
    result = PowerFlowSolver().solve(pf_input)

    assert result.converged is True
    assert abs(result.node_voltage_pu["B"]) < abs(result.node_voltage_pu["A"])
    assert result.iterations <= pf_input.options.max_iter
    _assert_basic_trace(result)


def test_three_bus_radial_voltage_profile() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    graph.add_node(_make_pq_node("C"))
    _add_line(graph, "L1", "A", "B")
    _add_line(graph, "L2", "B", "C")

    pf_input = _solve_power_flow(
        graph,
        [
            PQSpec(node_id="B", p_mw=1.0, q_mvar=0.5),
            PQSpec(node_id="C", p_mw=0.8, q_mvar=0.3),
        ],
    )
    result = PowerFlowSolver().solve(pf_input)

    v_slack = abs(result.node_voltage_pu["A"])
    v_b = abs(result.node_voltage_pu["B"])
    v_c = abs(result.node_voltage_pu["C"])

    assert result.converged is True
    assert result.iterations <= pf_input.options.max_iter
    assert v_c <= v_b <= v_slack + 1e-12
    _assert_basic_trace(result)


def test_three_bus_mesh_converges() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    graph.add_node(_make_pq_node("C"))
    _add_line(graph, "L1", "A", "B")
    _add_line(graph, "L2", "B", "C")
    _add_line(graph, "L3", "A", "C")

    pf_input = _solve_power_flow(
        graph,
        [
            PQSpec(node_id="B", p_mw=1.2, q_mvar=0.4),
            PQSpec(node_id="C", p_mw=0.9, q_mvar=0.3),
        ],
    )
    result = PowerFlowSolver().solve(pf_input)

    assert result.converged is True
    assert result.iterations <= pf_input.options.max_iter
    _assert_basic_trace(result)


def test_duplicate_pq_spec_validation() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    _add_line(graph, "L1", "A", "B")

    pf_input = _solve_power_flow(
        graph,
        [
            PQSpec(node_id="B", p_mw=1.0, q_mvar=0.2),
            PQSpec(node_id="B", p_mw=0.5, q_mvar=0.1),
        ],
    )

    with pytest.raises(ValueError):
        PowerFlowSolver().solve(pf_input)


def test_island_without_slack_is_reported() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    graph.add_node(_make_pq_node("C"))
    graph.add_node(_make_pq_node("D"))

    _add_line(graph, "L1", "A", "B")
    _add_line(graph, "L2", "C", "D")

    pf_input = _solve_power_flow(
        graph,
        [
            PQSpec(node_id="B", p_mw=1.0, q_mvar=0.2),
            PQSpec(node_id="C", p_mw=0.5, q_mvar=0.1),
        ],
    )
    result = PowerFlowSolver().solve(pf_input)

    assert result.converged is True
    assert result.iterations <= pf_input.options.max_iter
    assert "C" in result.white_box_trace["islands"]["not_solved_island_nodes"]
    assert "D" in result.white_box_trace["islands"]["not_solved_island_nodes"]
    assert "C" not in result.node_voltage_pu
    assert "D" not in result.node_voltage_pu
    _assert_basic_trace(result)


def test_power_flow_results_are_deterministic() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    _add_line(graph, "L1", "A", "B")

    pf_input = _solve_power_flow(graph, [PQSpec(node_id="B", p_mw=1.5, q_mvar=0.7)])

    result1 = PowerFlowSolver().solve(pf_input)
    result2 = PowerFlowSolver().solve(pf_input)

    assert result1.converged is True
    assert result1.iterations <= pf_input.options.max_iter
    _assert_basic_trace(result1)
    assert result1.to_dict() == result2.to_dict()
    serialized_voltage = result1.to_dict()["node_voltage_pu"]["A"]
    assert set(serialized_voltage.keys()) == {"re", "im"}
