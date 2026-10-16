"""Short-Circuit IEC 60909 CI guardians — Krok III planu 10/10.

Wymagane scenariusze:
- 3F / 1F / 2F,
- kontrola współczynnika c,
- I_th i I_dyn (Ip) obowiązkowe,
- deterministyczny white-box trace.
"""

from __future__ import annotations

import copy
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

backend_src = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(backend_src))

from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.voltage_factor import c_for_node
from network_model.core.ybus import AdmittanceMatrixBuilder
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

# c_max węzłów 15 kV (pasmo SN) z jedynego źródła tabeli 1 IEC 60909-0 — martwa stała
# solvera C_MAX skasowana kartą WSPOLCZYNNIK-C-JEDEN-NOSNIK (ta sama wartość 1,10).
C_MAX = c_for_node(15.0, "MAX", tolerancja_nn=None)


def _json_default(value):
    if isinstance(value, complex):
        return {"re": float(value.real), "im": float(value.imag)}
    if hasattr(value, "item"):
        return value.item()
    raise TypeError(f"Unsupported type for canonical JSON: {type(value)!r}")


def _sha(data: dict | list) -> str:
    payload = json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=_json_default,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _build_sc_graph() -> NetworkGraph:
    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="slack",
            name="Slack",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="fault_bus",
            name="FaultBus",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )

    graph.add_branch(
        LineBranch(
            id="line_1",
            name="Line 1",
            branch_type=BranchType.LINE,
            from_node_id="slack",
            to_node_id="fault_bus",
            in_service=True,
            length_km=2.0,
            r_ohm_per_km=0.08,
            x_ohm_per_km=0.32,
            b_us_per_km=1.0,
            rated_current_a=300.0,
        )
    )
    return graph


def _z0_bus_for_graph(graph: NetworkGraph) -> np.ndarray:
    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build()
    n = y_bus.shape[0]
    # Stabilna, diagonalna macierz Z0 (dodatnia, odwracalna) dla testu 1F.
    return np.eye(n, dtype=complex) * complex(0.4, 0.8)


def _count_c_factor_occurrences(trace: list[dict]) -> int:
    count = 0
    for step in trace:
        inputs = step.get("inputs") or {}
        if "c_factor" in inputs:
            count += 1
    return count


def test_sc_iec60909_3f_1f_2f_guardians() -> None:
    graph = _build_sc_graph()
    z0_bus = _z0_bus_for_graph(graph)

    r3 = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="fault_bus",
        c_factor=C_MAX,
        tk_s=1.0,
    )
    r1 = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graph,
        fault_node_id="fault_bus",
        c_factor=C_MAX,
        tk_s=1.0,
        z0_bus=z0_bus,
    )
    r2 = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
        graph=graph,
        fault_node_id="fault_bus",
        c_factor=C_MAX,
        tk_s=1.0,
    )

    assert r3.short_circuit_type.value == "3F"
    assert r1.short_circuit_type.value == "1F"
    assert r2.short_circuit_type.value == "2F"

    for result in (r3, r1, r2):
        # c-factor obowiązkowy
        assert result.c_factor == C_MAX
        # I_th i I_dyn(Ip) obowiązkowe
        assert result.ith_a > 0
        assert result.ip_a > 0
        # trace obowiązkowy
        assert isinstance(result.white_box_trace, list)
        assert len(result.white_box_trace) >= 6
        # c ma wystąpić dokładnie raz w trace
        assert _count_c_factor_occurrences(result.white_box_trace) == 1


def test_sc_iec60909_factor_c_control() -> None:
    graph = _build_sc_graph()

    low = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="fault_bus",
        c_factor=0.95,
        tk_s=1.0,
    )
    high = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="fault_bus",
        c_factor=1.10,
        tk_s=1.0,
    )

    assert high.ikss_a > low.ikss_a
    assert high.c_factor > low.c_factor


def test_sc_iec60909_trace_determinism_identity() -> None:
    graph = _build_sc_graph()

    run_a = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=copy.deepcopy(graph),
        fault_node_id="fault_bus",
        c_factor=C_MAX,
        tk_s=1.0,
    )
    run_b = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=copy.deepcopy(graph),
        fault_node_id="fault_bus",
        c_factor=C_MAX,
        tk_s=1.0,
    )

    hash_result_a = _sha(run_a.to_dict())
    hash_result_b = _sha(run_b.to_dict())
    hash_trace_a = _sha(run_a.white_box_trace)
    hash_trace_b = _sha(run_b.white_box_trace)

    assert hash_result_a == hash_result_b
    assert hash_trace_a == hash_trace_b
