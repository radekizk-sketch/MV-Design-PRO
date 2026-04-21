from analysis.power_flow import PowerFlowOptions, PowerFlowSolver
from analysis.power_flow.analysis import assemble_power_flow_result
from analysis.power_flow.types import PowerFlowInput, PQSpec, SlackSpec
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver


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


def test_power_flow_solver_layer_parity() -> None:
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("A"))
    graph.add_node(_make_pq_node("B"))
    _add_line(graph, "L1", "A", "B")

    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=2.0, q_mvar=1.0)],
        options=PowerFlowOptions(max_iter=25),
    )

    analysis_result = PowerFlowSolver().solve(pf_input)
    physics_solution = PowerFlowNewtonSolver().solve(pf_input)

    assembled = assemble_power_flow_result(
        converged=physics_solution.converged,
        iterations=physics_solution.iterations,
        max_mismatch=physics_solution.max_mismatch,
        node_voltage=physics_solution.node_voltage,
        node_u_mag=physics_solution.node_u_mag,
        node_angle=physics_solution.node_angle,
        node_voltage_kv=physics_solution.node_voltage_kv,
        branch_current=physics_solution.branch_current,
        branch_s_from=physics_solution.branch_s_from,
        branch_s_to=physics_solution.branch_s_to,
        branch_current_ka=physics_solution.branch_current_ka,
        branch_s_from_mva=physics_solution.branch_s_from_mva,
        branch_s_to_mva=physics_solution.branch_s_to_mva,
        losses_total=physics_solution.losses_total,
        slack_power=physics_solution.slack_power,
        sum_pq_spec=physics_solution.sum_pq_spec,
        branch_flow_note=physics_solution.branch_flow_note,
        missing_voltage_base_nodes=physics_solution.missing_voltage_base_nodes,
        pf_input=pf_input,
        graph=graph,
        options=pf_input.options,
        validation_warnings=physics_solution.validation_warnings,
        validation_errors=physics_solution.validation_errors,
        slack_island_nodes=physics_solution.slack_island_nodes,
        not_solved_nodes=physics_solution.not_solved_nodes,
        ybus_trace=physics_solution.ybus_trace,
        nr_trace=physics_solution.nr_trace,
        applied_taps=physics_solution.applied_taps,
        applied_shunts=physics_solution.applied_shunts,
        pv_to_pq_switches=physics_solution.pv_to_pq_switches,
    )

    assert analysis_result.to_dict() == assembled.to_dict()
