from analysis.power_flow import (
    BusVoltageLimitSpec,
    PowerFlowInput,
    PowerFlowOptions,
    PowerFlowSolver,
    PQSpec,
    PVSpec,
    ShuntSpec,
    SlackSpec,
    TransformerTapSpec,
)
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType


def _assert_basic_trace(result: object) -> None:
    trace = result.white_box_trace
    for key in ("ybus", "nr_iterations", "power_balance", "islands", "v2_feature_flags"):
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


def _add_transformer(graph: NetworkGraph, branch_id: str, from_node: str, to_node: str) -> None:
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


def test_pv_stays_pv_when_q_within_limits() -> None:
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
        options=PowerFlowOptions(max_iter=30),
    )

    result = PowerFlowSolver().solve(pf_input)

    assert result.converged is True
    assert result.iterations <= pf_input.options.max_iter
    assert result.pv_to_pq_switches == []
    assert result.white_box_trace["v2_feature_flags"]["pv_enabled"] is True
    assert all(
        not entry.get("pv_to_pq_optional") for entry in result.white_box_trace["nr_iterations"]
    )
    _assert_basic_trace(result)


def test_pv_q_limits_trigger_pv_to_pq_switch() -> None:
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
                q_min_mvar=-0.1,
                q_max_mvar=0.1,
            )
        ],
        options=PowerFlowOptions(max_iter=30),
    )

    result = PowerFlowSolver().solve(pf_input)

    assert result.converged is True
    assert result.iterations <= pf_input.options.max_iter
    assert any(switch["node_id"] == "B" for switch in result.pv_to_pq_switches)
    assert any(entry.get("pv_to_pq_optional") for entry in result.white_box_trace["nr_iterations"])
    assert result.white_box_trace["v2_feature_flags"]["pv_enabled"] is True
    _assert_basic_trace(result)


def test_transformer_tap_ratio_changes_secondary_voltage() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    _add_transformer(graph, "T1", "A", "B")

    base_input = PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
        options=PowerFlowOptions(max_iter=25),
    )
    base_result = PowerFlowSolver().solve(base_input)

    tap_input = PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
        taps=[TransformerTapSpec(branch_id="T1", tap_ratio=1.1)],
        options=PowerFlowOptions(max_iter=25),
    )
    tap_result = PowerFlowSolver().solve(tap_input)

    assert tap_result.converged is True
    assert tap_result.iterations <= tap_input.options.max_iter
    assert tap_result.node_u_mag_pu["B"] < base_result.node_u_mag_pu["B"]
    assert tap_result.white_box_trace["applied_taps"]
    _assert_basic_trace(tap_result)


def test_shunt_increases_voltage_magnitude() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    _add_line(graph, "L1", "A", "B")

    base_input = PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
        options=PowerFlowOptions(max_iter=25),
    )
    base_result = PowerFlowSolver().solve(base_input)

    shunt_input = PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
        shunts=[ShuntSpec(node_id="B", b_pu=0.2)],
        options=PowerFlowOptions(max_iter=25),
    )
    shunt_result = PowerFlowSolver().solve(shunt_input)

    assert shunt_result.converged is True
    assert shunt_result.iterations <= shunt_input.options.max_iter
    assert shunt_result.node_u_mag_pu["B"] > base_result.node_u_mag_pu["B"]
    assert shunt_result.white_box_trace["applied_shunts"]
    _assert_basic_trace(shunt_result)


def test_voltage_limit_violation_ranking() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    _add_line(graph, "L1", "A", "B")

    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=3.0, q_mvar=1.5)],
        bus_limits=[BusVoltageLimitSpec(node_id="B", u_min_pu=1.02, u_max_pu=1.1)],
        options=PowerFlowOptions(max_iter=25),
    )
    result = PowerFlowSolver().solve(pf_input)

    assert result.converged is True
    assert result.iterations <= pf_input.options.max_iter
    assert result.violations
    violation = result.violations[0]
    for key in ("type", "id", "value", "limit", "severity", "direction"):
        assert key in violation
    assert violation["type"] == "bus_voltage"
    assert result.violations[0]["severity"] >= result.violations[-1]["severity"]
    _assert_basic_trace(result)


def test_non_convergence_returns_best_effort_and_cause() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    _add_line(graph, "L1", "A", "B")

    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=20.0, q_mvar=10.0)],
        options=PowerFlowOptions(max_iter=5, damping=0.0),
    )
    result = PowerFlowSolver().solve(pf_input)

    assert result.converged is False
    assert result.iterations <= pf_input.options.max_iter
    assert result.node_voltage_pu
    assert result.white_box_trace["nr_iterations"]
    assert result.white_box_trace["nr_iterations"][-1]["cause_if_failed_optional"]
    assert result.white_box_trace["nr_iterations"][-1]["max_mismatch_pu"] >= 0.0
    _assert_basic_trace(result)


def test_v2_regression_with_basic_slack_pq_case() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    _add_line(graph, "L1", "A", "B")

    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=1.0, q_mvar=0.3)],
        options=PowerFlowOptions(max_iter=25),
    )
    result = PowerFlowSolver().solve(pf_input)

    assert result.converged is True
    assert result.iterations <= pf_input.options.max_iter
    assert result.white_box_trace["v2_feature_flags"]["pv_enabled"] is False
    _assert_basic_trace(result)
