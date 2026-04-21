"""FIX-11b: E2E Determinism Tests for Power Flow Workflow (NR/GS/FDLF).

Ten modul testuje deterministycznosc wynikow Power Flow dla wszystkich trzech
metod: Newton-Raphson, Gauss-Seidel, Fast-Decoupled Load Flow.

Scenariusze testowe:
1. Ten sam input -> 2x uruchomienie -> identyczny wynik PF (struktury)
2. Ten sam input -> 2x uruchomienie -> identyczny trace
3. Petla po metodach: newton-raphson, gauss-seidel, fast-decoupled

Wymagania:
- converged == True
- porownanie wynikow JSON-serializable
- porownanie trace: identyczne listy wpisow po stabilnym sortowaniu kluczy

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Testy nie modyfikuja solvera, tylko weryfikuja deterministycznosc
- WHITE BOX: Sprawdza deterministycznosc trace
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from typing import Any

import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_fast_decoupled import (
    FastDecoupledOptions,
    solve_power_flow_fast_decoupled,
)
from network_model.solvers.power_flow_gauss_seidel import (
    GaussSeidelOptions,
    solve_power_flow_gauss_seidel,
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

# =============================================================================
# Test Network Fixtures
# =============================================================================


def _make_slack_node(node_id: str, voltage_kv: float = 10.0) -> Node:
    """Tworzy wezel bilansujacy (SLACK)."""
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.SLACK,
        voltage_level=voltage_kv,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )


def _make_pq_node(node_id: str, voltage_kv: float = 10.0) -> Node:
    """Tworzy wezel obciazeniowy (PQ)."""
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.PQ,
        voltage_level=voltage_kv,
        active_power=0.0,
        reactive_power=0.0,
    )


def _make_pv_node(node_id: str, voltage_kv: float = 10.0) -> Node:
    """Tworzy wezel generatorowy (PV)."""
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
    """Dodaje linie do grafu."""
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


def _create_simple_two_bus_network() -> NetworkGraph:
    """Tworzy prosta siec 2-wezlowa: SLACK -- LINE -- PQ."""
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("BUS_A"))
    graph.add_node(_make_pq_node("BUS_B"))
    _add_line(graph, "LINE_AB", "BUS_A", "BUS_B")
    return graph


def _create_three_bus_ring_network() -> NetworkGraph:
    """Tworzy siec 3-wezlowa z piersceniem: A -- B -- C -- A."""
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("BUS_A"))
    graph.add_node(_make_pq_node("BUS_B"))
    graph.add_node(_make_pq_node("BUS_C"))
    _add_line(graph, "LINE_AB", "BUS_A", "BUS_B")
    _add_line(graph, "LINE_BC", "BUS_B", "BUS_C")
    _add_line(graph, "LINE_CA", "BUS_C", "BUS_A")  # Ring closure
    return graph


def _create_three_bus_pv_network() -> NetworkGraph:
    """Tworzy siec 3-wezlowa z wezlem PV: SLACK -- PV -- PQ."""
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("BUS_A"))
    graph.add_node(_make_pv_node("BUS_B"))
    graph.add_node(_make_pq_node("BUS_C"))
    _add_line(graph, "LINE_AB", "BUS_A", "BUS_B")
    _add_line(graph, "LINE_BC", "BUS_B", "BUS_C")
    return graph


def _create_pf_input_simple(graph: NetworkGraph) -> PowerFlowInput:
    """Tworzy PowerFlowInput dla prostej sieci 2-wezlowej."""
    return PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="BUS_A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="BUS_B", p_mw=2.0, q_mvar=1.0)],
        options=PowerFlowOptions(max_iter=100, tolerance=1e-8, trace_level="full"),
    )


def _create_pf_input_ring(graph: NetworkGraph) -> PowerFlowInput:
    """Tworzy PowerFlowInput dla sieci piersceniowej."""
    return PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="BUS_A", u_pu=1.0, angle_rad=0.0),
        pq=[
            PQSpec(node_id="BUS_B", p_mw=1.5, q_mvar=0.8),
            PQSpec(node_id="BUS_C", p_mw=1.0, q_mvar=0.5),
        ],
        options=PowerFlowOptions(max_iter=100, tolerance=1e-8, trace_level="full"),
    )


def _create_pf_input_pv(graph: NetworkGraph) -> PowerFlowInput:
    """Tworzy PowerFlowInput dla sieci z wezlem PV."""
    return PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="BUS_A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="BUS_C", p_mw=1.5, q_mvar=0.6)],
        pv=[
            PVSpec(
                node_id="BUS_B",
                p_mw=-1.0,
                u_pu=1.02,
                q_min_mvar=-5.0,
                q_max_mvar=5.0,
            )
        ],
        options=PowerFlowOptions(max_iter=100, tolerance=1e-6, trace_level="full"),
    )


# =============================================================================
# Serialization Helpers
# =============================================================================


def _complex_to_dict(c: complex) -> dict[str, float]:
    """Konwertuje complex na dict."""
    return {"re": float(c.real), "im": float(c.imag)}


def _serialize_result(solution: PowerFlowNewtonSolution) -> str:
    """Serializuje wynik do kanonicznego JSON (deterministycznego)."""
    result = {
        "converged": solution.converged,
        "iterations": solution.iterations,
        "max_mismatch": float(solution.max_mismatch),
        "solver_method": solution.solver_method,
        "node_voltage": {k: _complex_to_dict(v) for k, v in sorted(solution.node_voltage.items())},
        "node_u_mag": {k: float(v) for k, v in sorted(solution.node_u_mag.items())},
        "node_angle": {k: float(v) for k, v in sorted(solution.node_angle.items())},
        "losses_total": _complex_to_dict(solution.losses_total),
        "slack_power": _complex_to_dict(solution.slack_power),
    }
    return json.dumps(result, sort_keys=True, separators=(",", ":"))


def _serialize_trace(trace: list[dict[str, Any]]) -> str:
    """Serializuje trace do kanonicznego JSON (deterministycznego)."""
    return json.dumps(trace, sort_keys=True, separators=(",", ":"))


def _compute_hash(data: str) -> str:
    """Oblicza SHA-256 hash danych."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


# =============================================================================
# Solver Wrappers for Uniform Interface
# =============================================================================

SolverFunc = Callable[[PowerFlowInput], PowerFlowNewtonSolution]


def _solve_newton_raphson(pf_input: PowerFlowInput) -> PowerFlowNewtonSolution:
    """Wrapper dla Newton-Raphson."""
    return solve_power_flow_physics(pf_input)


def _solve_gauss_seidel(pf_input: PowerFlowInput) -> PowerFlowNewtonSolution:
    """Wrapper dla Gauss-Seidel."""
    gs_options = GaussSeidelOptions(acceleration_factor=1.0)
    return solve_power_flow_gauss_seidel(pf_input, gs_options)


def _solve_fast_decoupled(pf_input: PowerFlowInput) -> PowerFlowNewtonSolution:
    """Wrapper dla Fast-Decoupled (XB)."""
    fd_options = FastDecoupledOptions(method="XB")
    return solve_power_flow_fast_decoupled(pf_input, fd_options)


SOLVER_METHODS: list[tuple[str, SolverFunc]] = [
    ("newton-raphson", _solve_newton_raphson),
    ("gauss-seidel", _solve_gauss_seidel),
    ("fast-decoupled", _solve_fast_decoupled),
]


# =============================================================================
# E2E Test Classes
# =============================================================================


class TestPFDeterminismAllMethods:
    """E2E: Deterministycznosc wynikow PF dla wszystkich metod."""

    @pytest.mark.parametrize("method_name,solver_func", SOLVER_METHODS)
    def test_two_bus_same_result_twice(self, method_name: str, solver_func: SolverFunc) -> None:
        """2x wykonanie na tej samej sieci 2-wezlowej -> identyczny wynik."""
        graph = _create_simple_two_bus_network()
        pf_input = _create_pf_input_simple(graph)

        # Run 1
        result_1 = solver_func(pf_input)
        json_1 = _serialize_result(result_1)
        hash_1 = _compute_hash(json_1)

        # Run 2
        result_2 = solver_func(pf_input)
        json_2 = _serialize_result(result_2)
        hash_2 = _compute_hash(json_2)

        # Assertions
        assert result_1.converged is True, f"{method_name}: nie zbiezne (run 1)"
        assert result_2.converged is True, f"{method_name}: nie zbiezne (run 2)"
        assert hash_1 == hash_2, (
            f"{method_name}: wyniki nie sa identyczne\n" f"Hash 1: {hash_1}\nHash 2: {hash_2}"
        )

    @pytest.mark.parametrize("method_name,solver_func", SOLVER_METHODS)
    def test_ring_network_same_result_twice(
        self, method_name: str, solver_func: SolverFunc
    ) -> None:
        """2x wykonanie na sieci piersceniowej -> identyczny wynik."""
        graph = _create_three_bus_ring_network()
        pf_input = _create_pf_input_ring(graph)

        result_1 = solver_func(pf_input)
        json_1 = _serialize_result(result_1)
        hash_1 = _compute_hash(json_1)

        result_2 = solver_func(pf_input)
        json_2 = _serialize_result(result_2)
        hash_2 = _compute_hash(json_2)

        assert result_1.converged is True, f"{method_name}: nie zbiezne (run 1)"
        assert result_2.converged is True, f"{method_name}: nie zbiezne (run 2)"
        assert hash_1 == hash_2, f"{method_name}: wyniki rozne dla sieci ring"

    @pytest.mark.parametrize("method_name,solver_func", SOLVER_METHODS)
    def test_pv_network_same_result_twice(self, method_name: str, solver_func: SolverFunc) -> None:
        """2x wykonanie na sieci z wezlem PV -> identyczny wynik."""
        graph = _create_three_bus_pv_network()
        pf_input = _create_pf_input_pv(graph)

        result_1 = solver_func(pf_input)
        json_1 = _serialize_result(result_1)
        hash_1 = _compute_hash(json_1)

        result_2 = solver_func(pf_input)
        json_2 = _serialize_result(result_2)
        hash_2 = _compute_hash(json_2)

        assert result_1.converged is True, f"{method_name}: nie zbiezne (run 1)"
        assert result_2.converged is True, f"{method_name}: nie zbiezne (run 2)"
        assert hash_1 == hash_2, f"{method_name}: wyniki rozne dla sieci PV"


class TestPFTraceDeterminism:
    """E2E: Deterministycznosc trace dla wszystkich metod."""

    @pytest.mark.parametrize("method_name,solver_func", SOLVER_METHODS)
    def test_trace_identical_twice(self, method_name: str, solver_func: SolverFunc) -> None:
        """2x wykonanie -> identyczny trace."""
        graph = _create_simple_two_bus_network()
        pf_input = _create_pf_input_simple(graph)

        result_1 = solver_func(pf_input)
        trace_json_1 = _serialize_trace(result_1.nr_trace)
        trace_hash_1 = _compute_hash(trace_json_1)

        result_2 = solver_func(pf_input)
        trace_json_2 = _serialize_trace(result_2.nr_trace)
        trace_hash_2 = _compute_hash(trace_json_2)

        assert trace_hash_1 == trace_hash_2, (
            f"{method_name}: trace nie identyczny\n"
            f"Hash 1: {trace_hash_1}\nHash 2: {trace_hash_2}"
        )
        assert len(result_1.nr_trace) == len(
            result_2.nr_trace
        ), f"{method_name}: rozna liczba iteracji w trace"

    @pytest.mark.parametrize("method_name,solver_func", SOLVER_METHODS)
    def test_init_state_identical_twice(self, method_name: str, solver_func: SolverFunc) -> None:
        """2x wykonanie -> identyczny init_state."""
        graph = _create_simple_two_bus_network()
        pf_input = _create_pf_input_simple(graph)

        result_1 = solver_func(pf_input)
        result_2 = solver_func(pf_input)

        init_json_1 = json.dumps(result_1.init_state, sort_keys=True)
        init_json_2 = json.dumps(result_2.init_state, sort_keys=True)

        assert init_json_1 == init_json_2, f"{method_name}: init_state nie identyczny"


class TestPFMultipleRunsDeterminism:
    """E2E: Deterministycznosc przy wielokrotnych uruchomieniach."""

    @pytest.mark.parametrize("method_name,solver_func", SOLVER_METHODS)
    def test_ten_runs_identical(self, method_name: str, solver_func: SolverFunc) -> None:
        """10x wykonanie -> wszystkie wyniki identyczne."""
        graph = _create_three_bus_ring_network()
        pf_input = _create_pf_input_ring(graph)

        hashes: list[str] = []
        for i in range(10):
            result = solver_func(pf_input)
            assert result.converged is True, f"{method_name}: run {i} nie zbiezny"
            json_str = _serialize_result(result)
            hashes.append(_compute_hash(json_str))

        unique_hashes = set(hashes)
        assert (
            len(unique_hashes) == 1
        ), f"{method_name}: wykryto {len(unique_hashes)} roznych wynikow w 10 uruchomieniach"


class TestPFConvergenceAllMethods:
    """E2E: Zbieznosc wszystkich metod dla roznych topologii."""

    @pytest.mark.parametrize("method_name,solver_func", SOLVER_METHODS)
    def test_all_methods_converge_two_bus(self, method_name: str, solver_func: SolverFunc) -> None:
        """Wszystkie metody zbiegaja dla sieci 2-wezlowej."""
        graph = _create_simple_two_bus_network()
        pf_input = _create_pf_input_simple(graph)

        result = solver_func(pf_input)

        assert result.converged is True, f"{method_name}: nie zbieglo"
        assert result.iterations < 50, f"{method_name}: zbyt duzo iteracji ({result.iterations})"
        assert (
            result.max_mismatch < 1e-6
        ), f"{method_name}: zbyt duzy mismatch ({result.max_mismatch})"

    @pytest.mark.parametrize("method_name,solver_func", SOLVER_METHODS)
    def test_all_methods_converge_ring(self, method_name: str, solver_func: SolverFunc) -> None:
        """Wszystkie metody zbiegaja dla sieci pierscienowej."""
        graph = _create_three_bus_ring_network()
        pf_input = _create_pf_input_ring(graph)

        result = solver_func(pf_input)

        assert result.converged is True, f"{method_name}: nie zbieglo (ring)"
        assert (
            result.iterations < 100
        ), f"{method_name}: zbyt duzo iteracji dla ring ({result.iterations})"

    @pytest.mark.parametrize("method_name,solver_func", SOLVER_METHODS)
    def test_all_methods_converge_pv(self, method_name: str, solver_func: SolverFunc) -> None:
        """Wszystkie metody zbiegaja dla sieci z wezlem PV."""
        graph = _create_three_bus_pv_network()
        pf_input = _create_pf_input_pv(graph)

        result = solver_func(pf_input)

        assert result.converged is True, f"{method_name}: nie zbieglo (PV)"
        # Sprawdz, czy napiecie na wezle PV jest bliskie zadanemu
        assert (
            abs(result.node_u_mag["BUS_B"] - 1.02) < 0.02
        ), f"{method_name}: napiecie PV odbieglo od setpoint"


class TestPFSolverMethodField:
    """E2E: Sprawdzenie poprawnosci pola solver_method."""

    def test_newton_raphson_method_field(self) -> None:
        """Newton-Raphson ma solver_method='newton-raphson'."""
        graph = _create_simple_two_bus_network()
        pf_input = _create_pf_input_simple(graph)

        result = _solve_newton_raphson(pf_input)

        assert result.solver_method == "newton-raphson"

    def test_gauss_seidel_method_field(self) -> None:
        """Gauss-Seidel ma solver_method='gauss-seidel'."""
        graph = _create_simple_two_bus_network()
        pf_input = _create_pf_input_simple(graph)

        result = _solve_gauss_seidel(pf_input)

        assert result.solver_method == "gauss-seidel"

    def test_fast_decoupled_method_field(self) -> None:
        """Fast-Decoupled ma solver_method='fast-decoupled'."""
        graph = _create_simple_two_bus_network()
        pf_input = _create_pf_input_simple(graph)

        result = _solve_fast_decoupled(pf_input)

        assert result.solver_method == "fast-decoupled"


class TestPFResultParity:
    """E2E: Paritet wynikow miedzy metodami (tolerancja numeryczna)."""

    def test_all_methods_give_similar_voltages(self) -> None:
        """Wszystkie metody daja podobne napiecia (tolerancja 1e-3)."""
        graph = _create_three_bus_ring_network()
        pf_input = _create_pf_input_ring(graph)

        result_nr = _solve_newton_raphson(pf_input)
        result_gs = _solve_gauss_seidel(pf_input)
        result_fd = _solve_fast_decoupled(pf_input)

        assert result_nr.converged and result_gs.converged and result_fd.converged

        for node_id in ["BUS_A", "BUS_B", "BUS_C"]:
            v_nr = result_nr.node_u_mag[node_id]
            v_gs = result_gs.node_u_mag[node_id]
            v_fd = result_fd.node_u_mag[node_id]

            assert (
                abs(v_nr - v_gs) < 1e-3
            ), f"NR vs GS: roznica napiecia na {node_id}: {abs(v_nr - v_gs)}"
            assert (
                abs(v_nr - v_fd) < 1e-3
            ), f"NR vs FD: roznica napiecia na {node_id}: {abs(v_nr - v_fd)}"

    def test_all_methods_give_similar_losses(self) -> None:
        """Wszystkie metody daja podobne straty (tolerancja 1e-3)."""
        graph = _create_three_bus_ring_network()
        pf_input = _create_pf_input_ring(graph)

        result_nr = _solve_newton_raphson(pf_input)
        result_gs = _solve_gauss_seidel(pf_input)
        result_fd = _solve_fast_decoupled(pf_input)

        losses_nr = result_nr.losses_total.real
        losses_gs = result_gs.losses_total.real
        losses_fd = result_fd.losses_total.real

        assert (
            abs(losses_nr - losses_gs) < 1e-3
        ), f"NR vs GS: roznica strat: {abs(losses_nr - losses_gs)}"
        assert (
            abs(losses_nr - losses_fd) < 1e-3
        ), f"NR vs FD: roznica strat: {abs(losses_nr - losses_fd)}"
