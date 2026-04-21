"""Load Flow NR CI guardians — Krok II planu 10/10.

Wymagane scenariusze:
- radial,
- ring,
- wieloźródłowa,
- identyczny Snapshot -> identyczny wynik + identyczny trace.
"""

from __future__ import annotations

import copy
import hashlib
import json
import sys
from pathlib import Path

backend_src = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(backend_src))

from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers import PowerFlowNewtonSolver
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    SlackSpec,
)


def _sha(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _serialize_solution(solution) -> dict:
    return {
        "converged": solution.converged,
        "iterations": solution.iterations,
        "max_mismatch": float(solution.max_mismatch),
        "node_u_mag": {k: float(v) for k, v in sorted(solution.node_u_mag.items())},
        "node_angle": {k: float(v) for k, v in sorted(solution.node_angle.items())},
        "slack_power": {
            "re": float(solution.slack_power.real),
            "im": float(solution.slack_power.imag),
        },
        "losses_total": {
            "re": float(solution.losses_total.real),
            "im": float(solution.losses_total.imag),
        },
    }


def _serialize_trace(solution) -> list[dict]:
    return solution.nr_trace


def _line(branch_id: str, from_id: str, to_id: str, *, in_service: bool = True) -> LineBranch:
    return LineBranch(
        id=branch_id,
        name=branch_id,
        branch_type=BranchType.LINE,
        from_node_id=from_id,
        to_node_id=to_id,
        in_service=in_service,
        length_km=5.0,
        r_ohm_per_km=0.08,
        x_ohm_per_km=0.32,
        b_us_per_km=3.0,
    )


def _node(node_id: str, node_type: NodeType, *, voltage_level: float = 15.0) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=node_type,
        voltage_level=voltage_level,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
        active_power=0.0,
        reactive_power=0.0,
    )


def _base_options() -> PowerFlowOptions:
    return PowerFlowOptions(
        tolerance=1e-8,
        max_iter=40,
        damping=1.0,
        flat_start=True,
        validate=False,
        trace_level="full",
    )


def _run(input_data: PowerFlowInput):
    return PowerFlowNewtonSolver().solve(input_data)


def test_lf_nr_radial_reference_case() -> None:
    graph = NetworkGraph()
    graph.add_node(_node("slack", NodeType.SLACK))
    graph.add_node(_node("n1", NodeType.PQ))
    graph.add_node(_node("n2", NodeType.PQ))
    graph.add_node(_node("n3", NodeType.PQ))

    graph.add_branch(_line("l1", "slack", "n1"))
    graph.add_branch(_line("l2", "n1", "n2"))
    graph.add_branch(_line("l3", "n2", "n3"))

    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        slack=SlackSpec(node_id="slack", u_pu=1.0, angle_rad=0.0),
        pq=[
            PQSpec("n1", p_mw=-2.0, q_mvar=-1.0),
            PQSpec("n2", p_mw=-2.5, q_mvar=-1.2),
            PQSpec("n3", p_mw=-1.5, q_mvar=-0.8),
        ],
        options=_base_options(),
    )

    result = _run(pf_input)
    assert result.converged is True
    assert result.iterations <= 40


def test_lf_nr_ring_reference_case() -> None:
    graph = NetworkGraph()
    for node_id, node_type in [
        ("slack", NodeType.SLACK),
        ("r1", NodeType.PQ),
        ("r2", NodeType.PQ),
        ("r3", NodeType.PQ),
    ]:
        graph.add_node(_node(node_id, node_type))

    graph.add_branch(_line("lr1", "slack", "r1"))
    graph.add_branch(_line("lr2", "r1", "r2"))
    graph.add_branch(_line("lr3", "r2", "r3"))
    graph.add_branch(_line("lr4", "r3", "slack"))  # domknięcie ringu

    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        slack=SlackSpec(node_id="slack", u_pu=1.0, angle_rad=0.0),
        pq=[
            PQSpec("r1", p_mw=-1.0, q_mvar=-0.4),
            PQSpec("r2", p_mw=-1.4, q_mvar=-0.6),
            PQSpec("r3", p_mw=-1.1, q_mvar=-0.5),
        ],
        options=_base_options(),
    )

    result = _run(pf_input)
    assert result.converged is True


def test_lf_nr_multisource_reference_case() -> None:
    graph = NetworkGraph()
    for node_id, node_type in [
        ("slack", NodeType.SLACK),
        ("pv_a", NodeType.PV),
        ("pv_b", NodeType.PV),
        ("load", NodeType.PQ),
    ]:
        graph.add_node(_node(node_id, node_type))

    graph.add_branch(_line("m1", "slack", "pv_a"))
    graph.add_branch(_line("m2", "pv_a", "load"))
    graph.add_branch(_line("m3", "slack", "pv_b"))
    graph.add_branch(_line("m4", "pv_b", "load", in_service=False))  # stan łącznika: odłączony tor

    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        slack=SlackSpec(node_id="slack", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec("load", p_mw=-3.0, q_mvar=-1.3)],
        pv=[
            PVSpec(node_id="pv_a", p_mw=1.2, u_pu=1.0, q_min_mvar=-1.5, q_max_mvar=1.5),
            PVSpec(node_id="pv_b", p_mw=0.8, u_pu=1.0, q_min_mvar=-1.0, q_max_mvar=1.0),
        ],
        options=_base_options(),
    )

    result = _run(pf_input)
    assert result.converged is True


def test_lf_nr_repeatability_trace_identity() -> None:
    graph = NetworkGraph()
    graph.add_node(_node("slack", NodeType.SLACK))
    graph.add_node(_node("n1", NodeType.PQ))
    graph.add_node(_node("n2", NodeType.PQ))
    graph.add_branch(_line("l1", "slack", "n1"))
    graph.add_branch(_line("l2", "n1", "n2"))

    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        slack=SlackSpec(node_id="slack", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec("n1", p_mw=-2.0, q_mvar=-1.0), PQSpec("n2", p_mw=-2.0, q_mvar=-1.0)],
        options=_base_options(),
    )

    run1 = _run(copy.deepcopy(pf_input))
    run2 = _run(copy.deepcopy(pf_input))

    result_hash_1 = _sha(_serialize_solution(run1))
    result_hash_2 = _sha(_serialize_solution(run2))
    trace_hash_1 = _sha({"trace": _serialize_trace(run1)})
    trace_hash_2 = _sha({"trace": _serialize_trace(run2)})

    assert run1.converged is True and run2.converged is True
    assert result_hash_1 == result_hash_2
    assert trace_hash_1 == trace_hash_2
