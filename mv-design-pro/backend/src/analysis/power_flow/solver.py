"""Deprecated adapter for the Newton-Raphson power flow solver."""

from __future__ import annotations

from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver

from .analysis import assemble_power_flow_result
from .result import PowerFlowResult
from .types import PowerFlowInput


class PowerFlowSolver:
    """Deprecated: use network_model.solvers.power_flow_newton.PowerFlowNewtonSolver."""

    def solve(self, pf_input: PowerFlowInput) -> PowerFlowResult:
        graph = pf_input.typed_graph()
        options = pf_input.options
        solution = PowerFlowNewtonSolver().solve(pf_input)

        return assemble_power_flow_result(
            converged=solution.converged,
            iterations=solution.iterations,
            max_mismatch=solution.max_mismatch,
            node_voltage=solution.node_voltage,
            node_u_mag=solution.node_u_mag,
            node_angle=solution.node_angle,
            node_voltage_kv=solution.node_voltage_kv,
            branch_current=solution.branch_current,
            branch_s_from=solution.branch_s_from,
            branch_s_to=solution.branch_s_to,
            branch_current_ka=solution.branch_current_ka,
            branch_s_from_mva=solution.branch_s_from_mva,
            branch_s_to_mva=solution.branch_s_to_mva,
            losses_total=solution.losses_total,
            slack_power=solution.slack_power,
            sum_pq_spec=solution.sum_pq_spec,
            branch_flow_note=solution.branch_flow_note,
            missing_voltage_base_nodes=solution.missing_voltage_base_nodes,
            pf_input=pf_input,
            graph=graph,
            options=options,
            validation_warnings=solution.validation_warnings,
            validation_errors=solution.validation_errors,
            slack_island_nodes=solution.slack_island_nodes,
            not_solved_nodes=solution.not_solved_nodes,
            ybus_trace=solution.ybus_trace,
            nr_trace=solution.nr_trace,
            applied_taps=solution.applied_taps,
            applied_shunts=solution.applied_shunts,
            pv_to_pq_switches=solution.pv_to_pq_switches,
        )


def solve_power_flow(pf_input: PowerFlowInput) -> PowerFlowResult:
    return PowerFlowSolver().solve(pf_input)
