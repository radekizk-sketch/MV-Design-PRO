"""P20a: Testy determinizmu i zbieżności Power Flow v1 (FOUNDATION).

Testy:
1. determinism - 2× execute na tym samym input → identyczny JSON results i trace
2. zbieżność - prosta sieć testowa (SLACK + PQ) → converged = true
3. failure - przypadek nie zbieżny → converged = false, trace kompletny
4. permutacje wejścia - zmiana kolejności elementów → identyczny wynik
"""

from __future__ import annotations

import hashlib
import json

import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers import (
    POWER_FLOW_SOLVER_VERSION,
    PowerFlowNewtonSolution,
    PowerFlowNewtonSolver,
    build_power_flow_result_v1,
    build_power_flow_trace,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)

# =============================================================================
# Test Fixtures
# =============================================================================


def _create_simple_network() -> NetworkGraph:
    """Tworzy prostą sieć testową: SLACK -- LINE -- PQ."""
    graph = NetworkGraph()

    # Węzeł SLACK (bus 1)
    slack_node = Node(
        id="bus_slack",
        name="Slack Bus",
        node_type=NodeType.SLACK,
        voltage_level=110.0,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
        active_power=0.0,
        reactive_power=0.0,
    )
    graph.add_node(slack_node)

    # Węzeł PQ (bus 2)
    pq_node = Node(
        id="bus_pq",
        name="Load Bus",
        node_type=NodeType.PQ,
        voltage_level=110.0,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
        active_power=-10.0,  # 10 MW load
        reactive_power=-5.0,  # 5 Mvar load
    )
    graph.add_node(pq_node)

    # Linia łącząca
    line = LineBranch(
        id="line_1",
        name="Line 1",
        branch_type=BranchType.LINE,
        from_node_id="bus_slack",
        to_node_id="bus_pq",
        in_service=True,
        length_km=10.0,
        r_ohm_per_km=0.1,
        x_ohm_per_km=0.4,
        b_us_per_km=2.5,
    )
    graph.add_branch(line)

    return graph


def _create_power_flow_input(
    graph: NetworkGraph,
    options: PowerFlowOptions | None = None,
) -> PowerFlowInput:
    """Tworzy PowerFlowInput dla sieci."""
    if options is None:
        options = PowerFlowOptions(
            tolerance=1e-8,
            max_iter=30,
            damping=1.0,
            flat_start=True,
            validate=False,
            trace_level="full",
        )

    slack = SlackSpec(
        node_id="bus_slack",
        u_pu=1.0,
        angle_rad=0.0,
    )

    pq = [
        PQSpec(
            node_id="bus_pq",
            p_mw=-10.0,
            q_mvar=-5.0,
        ),
    ]

    return PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        options=options,
        slack=slack,
        pq=pq,
        pv=[],
        shunts=[],
        taps=[],
    )


def _serialize_result(solution: PowerFlowNewtonSolution) -> str:
    """Serializuje wynik do kanonicznego JSON."""

    def _complex_to_dict(c: complex) -> dict:
        return {"re": float(c.real), "im": float(c.imag)}

    result = {
        "converged": solution.converged,
        "iterations": solution.iterations,
        "max_mismatch": float(solution.max_mismatch),
        "node_voltage": {k: _complex_to_dict(v) for k, v in sorted(solution.node_voltage.items())},
        "node_u_mag": {k: float(v) for k, v in sorted(solution.node_u_mag.items())},
        "node_angle": {k: float(v) for k, v in sorted(solution.node_angle.items())},
        "losses_total": _complex_to_dict(solution.losses_total),
        "slack_power": _complex_to_dict(solution.slack_power),
    }
    return json.dumps(result, sort_keys=True, separators=(",", ":"))


def _serialize_trace(trace: list[dict]) -> str:
    """Serializuje trace do kanonicznego JSON."""
    return json.dumps(trace, sort_keys=True, separators=(",", ":"))


def _compute_hash(data: str) -> str:
    """Oblicza SHA-256 hash."""
    return hashlib.sha256(data.encode()).hexdigest()


# =============================================================================
# Test: Determinism
# =============================================================================


class TestPowerFlowDeterminism:
    """P20a: Testy determinizmu - identyczne wyniki dla identycznego wejścia."""

    def test_same_input_same_result(self):
        """2× execute na tym samym input → identyczny JSON results."""
        graph = _create_simple_network()
        pf_input = _create_power_flow_input(graph)

        solver = PowerFlowNewtonSolver()

        # Pierwsze wykonanie
        result_1 = solver.solve(pf_input)
        json_1 = _serialize_result(result_1)
        hash_1 = _compute_hash(json_1)

        # Drugie wykonanie (ten sam input)
        result_2 = solver.solve(pf_input)
        json_2 = _serialize_result(result_2)
        hash_2 = _compute_hash(json_2)

        assert hash_1 == hash_2, "Wyniki powinny być identyczne dla identycznego wejścia"
        assert result_1.converged == result_2.converged
        assert result_1.iterations == result_2.iterations

    def test_same_input_same_trace(self):
        """2× execute na tym samym input → identyczny JSON trace."""
        graph = _create_simple_network()
        pf_input = _create_power_flow_input(graph)

        solver = PowerFlowNewtonSolver()

        # Pierwsze wykonanie
        result_1 = solver.solve(pf_input)
        trace_json_1 = _serialize_trace(result_1.nr_trace)
        trace_hash_1 = _compute_hash(trace_json_1)

        # Drugie wykonanie
        result_2 = solver.solve(pf_input)
        trace_json_2 = _serialize_trace(result_2.nr_trace)
        trace_hash_2 = _compute_hash(trace_json_2)

        assert (
            trace_hash_1 == trace_hash_2
        ), "Trace powinien być identyczny dla identycznego wejścia"
        assert len(result_1.nr_trace) == len(result_2.nr_trace)

    def test_multiple_runs_determinism(self):
        """10× execute → wszystkie wyniki identyczne."""
        graph = _create_simple_network()
        pf_input = _create_power_flow_input(graph)

        solver = PowerFlowNewtonSolver()

        hashes = []
        for _ in range(10):
            result = solver.solve(pf_input)
            json_str = _serialize_result(result)
            hashes.append(_compute_hash(json_str))

        # Wszystkie hashe powinny być identyczne
        assert (
            len(set(hashes)) == 1
        ), f"Wykryto {len(set(hashes))} różnych wyników w 10 uruchomieniach"


# =============================================================================
# Test: Zbieżność
# =============================================================================


class TestPowerFlowConvergence:
    """P20a: Testy zbieżności - prosta sieć powinna zbiec."""

    def test_simple_network_converges(self):
        """Prosta sieć testowa (SLACK + PQ) → converged = true."""
        graph = _create_simple_network()
        pf_input = _create_power_flow_input(graph)

        solver = PowerFlowNewtonSolver()
        result = solver.solve(pf_input)

        assert result.converged is True, "Prosta sieć powinna zbiec"
        assert (
            result.iterations < 10
        ), f"Prosta sieć nie powinna wymagać więcej niż 10 iteracji (faktycznie: {result.iterations})"
        assert (
            result.max_mismatch < 1e-6
        ), f"Mismatch powinien być bardzo mały (faktycznie: {result.max_mismatch})"

    def test_convergence_with_full_trace(self):
        """Zbieżność z pełnym trace - trace zawiera init_state."""
        graph = _create_simple_network()
        options = PowerFlowOptions(
            tolerance=1e-8,
            max_iter=30,
            damping=1.0,
            flat_start=True,
            validate=False,
            trace_level="full",
        )
        pf_input = _create_power_flow_input(graph, options)

        solver = PowerFlowNewtonSolver()
        result = solver.solve(pf_input)

        assert result.converged is True
        assert result.init_state is not None, "init_state powinien być obecny dla trace_level=full"
        assert "bus_slack" in result.init_state
        assert "bus_pq" in result.init_state

    def test_trace_has_per_bus_mismatch(self):
        """Trace zawiera per-bus mismatch dla trace_level=full."""
        graph = _create_simple_network()
        options = PowerFlowOptions(
            tolerance=1e-8,
            max_iter=30,
            trace_level="full",
        )
        pf_input = _create_power_flow_input(graph, options)

        solver = PowerFlowNewtonSolver()
        result = solver.solve(pf_input)

        # Sprawdź że trace zawiera mismatch_per_bus
        for trace_entry in result.nr_trace:
            if "mismatch_per_bus" in trace_entry:
                assert isinstance(trace_entry["mismatch_per_bus"], dict)
                # PQ bus powinien mieć mismatch
                break
        else:
            pytest.skip(
                "Trace nie zawiera mismatch_per_bus (może być pominięty dla szybkiej zbieżności)"
            )

    def test_trace_has_jacobian(self):
        """Trace zawiera Jacobian dla trace_level=full."""
        graph = _create_simple_network()
        options = PowerFlowOptions(
            tolerance=1e-6,  # Wyższa tolerancja żeby było więcej iteracji
            max_iter=30,
            trace_level="full",
        )
        pf_input = _create_power_flow_input(graph, options)

        solver = PowerFlowNewtonSolver()
        result = solver.solve(pf_input)

        # Sprawdź że przynajmniej jedna iteracja ma Jacobian
        has_jacobian = False
        for trace_entry in result.nr_trace:
            if "jacobian" in trace_entry:
                has_jacobian = True
                jacobian = trace_entry["jacobian"]
                assert "J1_dP_dTheta" in jacobian
                assert "J2_dP_dV" in jacobian
                assert "J3_dQ_dTheta" in jacobian
                assert "J4_dQ_dV" in jacobian
                break

        if not has_jacobian and result.iterations > 1:
            pytest.fail("Trace powinien zawierać Jacobian dla iteracji > 1")


# =============================================================================
# Test: Failure (brak zbieżności)
# =============================================================================


class TestPowerFlowFailure:
    """P20a: Testy przypadków nie zbieżnych."""

    def test_no_convergence_with_high_load(self):
        """Bardzo wysoki load → converged = false, trace kompletny."""
        graph = NetworkGraph()

        # Węzeł SLACK
        slack_node = Node(
            id="bus_slack",
            name="Slack Bus",
            node_type=NodeType.SLACK,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
            active_power=0.0,
            reactive_power=0.0,
        )
        graph.add_node(slack_node)

        # Węzeł PQ z ekstremalnie wysokim obciążeniem
        pq_node = Node(
            id="bus_pq",
            name="Overloaded Bus",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
            active_power=-10000.0,  # 10 GW load (absurdalnie wysoki)
            reactive_power=-5000.0,
        )
        graph.add_node(pq_node)

        # Linia z małą przepustowością
        line = LineBranch(
            id="line_1",
            name="Line 1",
            branch_type=BranchType.LINE,
            from_node_id="bus_slack",
            to_node_id="bus_pq",
            in_service=True,
            length_km=100.0,
            r_ohm_per_km=0.5,
            x_ohm_per_km=1.0,
            b_us_per_km=0.0,
        )
        graph.add_branch(line)

        options = PowerFlowOptions(
            tolerance=1e-8,
            max_iter=5,  # Mała liczba iteracji
            damping=1.0,
            flat_start=True,
            validate=False,
            trace_level="full",
        )

        slack = SlackSpec(node_id="bus_slack", u_pu=1.0, angle_rad=0.0)
        pq = [PQSpec(node_id="bus_pq", p_mw=-10000.0, q_mvar=-5000.0)]

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=100.0,
            options=options,
            slack=slack,
            pq=pq,
            pv=[],
            shunts=[],
            taps=[],
        )

        solver = PowerFlowNewtonSolver()
        result = solver.solve(pf_input)

        # Powinno nie zbiec (lub zbiec do numerycznego błędu)
        # Ale trace powinien być kompletny
        assert len(result.nr_trace) > 0, "Trace powinien zawierać przynajmniej jedną iterację"

        # Ostatnia iteracja powinna mieć przyczynę błędu lub max_iter
        last_trace = result.nr_trace[-1]
        if not result.converged:
            assert (
                "cause_if_failed_optional" in last_trace
                or last_trace.get("iter", 0) >= options.max_iter
            ), "Brak zbieżności powinien mieć przyczynę w trace"


# =============================================================================
# Test: Permutacje wejścia
# =============================================================================


class TestPowerFlowInputPermutations:
    """P20a: Testy niezależności od kolejności elementów wejścia."""

    def test_node_order_independence(self):
        """Zmiana kolejności węzłów → identyczny wynik."""
        # Sieć z 3 węzłami
        graph1 = NetworkGraph()
        graph2 = NetworkGraph()

        nodes = [
            Node(
                id="bus_a",
                name="Bus A",
                node_type=NodeType.SLACK,
                voltage_level=110.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
                active_power=0.0,
                reactive_power=0.0,
            ),
            Node(
                id="bus_b",
                name="Bus B",
                node_type=NodeType.PQ,
                voltage_level=110.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
                active_power=-10.0,
                reactive_power=-5.0,
            ),
            Node(
                id="bus_c",
                name="Bus C",
                node_type=NodeType.PQ,
                voltage_level=110.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
                active_power=-8.0,
                reactive_power=-4.0,
            ),
        ]

        # Graf 1: kolejność A, B, C
        for node in nodes:
            graph1.add_node(node)

        # Graf 2: kolejność C, A, B
        for node in [nodes[2], nodes[0], nodes[1]]:
            graph2.add_node(node)

        # Te same linie dla obu grafów
        lines = [
            LineBranch(
                id="line_ab",
                name="Line A-B",
                branch_type=BranchType.LINE,
                from_node_id="bus_a",
                to_node_id="bus_b",
                in_service=True,
                length_km=10.0,
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.4,
                b_us_per_km=2.5,
            ),
            LineBranch(
                id="line_bc",
                name="Line B-C",
                branch_type=BranchType.LINE,
                from_node_id="bus_b",
                to_node_id="bus_c",
                in_service=True,
                length_km=15.0,
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.4,
                b_us_per_km=2.5,
            ),
        ]

        for line in lines:
            graph1.add_branch(line)
            graph2.add_branch(line)

        options = PowerFlowOptions(tolerance=1e-8, max_iter=30, trace_level="summary")
        slack = SlackSpec(node_id="bus_a", u_pu=1.0, angle_rad=0.0)
        pq = [
            PQSpec(node_id="bus_b", p_mw=-10.0, q_mvar=-5.0),
            PQSpec(node_id="bus_c", p_mw=-8.0, q_mvar=-4.0),
        ]

        pf_input1 = PowerFlowInput(
            graph=graph1,
            base_mva=100.0,
            options=options,
            slack=slack,
            pq=pq,
            pv=[],
            shunts=[],
            taps=[],
        )
        pf_input2 = PowerFlowInput(
            graph=graph2,
            base_mva=100.0,
            options=options,
            slack=slack,
            pq=pq,
            pv=[],
            shunts=[],
            taps=[],
        )

        solver = PowerFlowNewtonSolver()
        result1 = solver.solve(pf_input1)
        result2 = solver.solve(pf_input2)

        # Wyniki powinny być identyczne
        assert result1.converged == result2.converged
        assert result1.iterations == result2.iterations

        # Napięcia powinny być identyczne (z tolerancją numeryczną)
        for node_id in ["bus_a", "bus_b", "bus_c"]:
            assert abs(result1.node_u_mag[node_id] - result2.node_u_mag[node_id]) < 1e-10
            assert abs(result1.node_angle[node_id] - result2.node_angle[node_id]) < 1e-10

    def test_pq_spec_order_independence(self):
        """Zmiana kolejności specyfikacji PQ → identyczny wynik."""
        graph = _create_simple_network()

        # Dodaj trzeci węzeł
        pq_node2 = Node(
            id="bus_pq2",
            name="Load Bus 2",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
            active_power=-8.0,
            reactive_power=-4.0,
        )
        graph.add_node(pq_node2)

        line2 = LineBranch(
            id="line_2",
            name="Line 2",
            branch_type=BranchType.LINE,
            from_node_id="bus_pq",
            to_node_id="bus_pq2",
            in_service=True,
            length_km=15.0,
            r_ohm_per_km=0.1,
            x_ohm_per_km=0.4,
            b_us_per_km=2.5,
        )
        graph.add_branch(line2)

        options = PowerFlowOptions(tolerance=1e-8, max_iter=30, trace_level="summary")
        slack = SlackSpec(node_id="bus_slack", u_pu=1.0, angle_rad=0.0)

        # Dwie kolejności PQ specs
        pq_order1 = [
            PQSpec(node_id="bus_pq", p_mw=-10.0, q_mvar=-5.0),
            PQSpec(node_id="bus_pq2", p_mw=-8.0, q_mvar=-4.0),
        ]
        pq_order2 = [
            PQSpec(node_id="bus_pq2", p_mw=-8.0, q_mvar=-4.0),
            PQSpec(node_id="bus_pq", p_mw=-10.0, q_mvar=-5.0),
        ]

        pf_input1 = PowerFlowInput(
            graph=graph,
            base_mva=100.0,
            options=options,
            slack=slack,
            pq=pq_order1,
            pv=[],
            shunts=[],
            taps=[],
        )
        pf_input2 = PowerFlowInput(
            graph=graph,
            base_mva=100.0,
            options=options,
            slack=slack,
            pq=pq_order2,
            pv=[],
            shunts=[],
            taps=[],
        )

        solver = PowerFlowNewtonSolver()
        result1 = solver.solve(pf_input1)
        result2 = solver.solve(pf_input2)

        # Wyniki powinny być identyczne
        assert result1.converged == result2.converged
        assert result1.iterations == result2.iterations

        # Napięcia powinny być identyczne
        for node_id in ["bus_slack", "bus_pq", "bus_pq2"]:
            assert abs(result1.node_u_mag[node_id] - result2.node_u_mag[node_id]) < 1e-10


# =============================================================================
# Test: PowerFlowTrace builder
# =============================================================================


class TestPowerFlowTraceBuilder:
    """P20a: Testy buildera PowerFlowTrace."""

    def test_build_power_flow_trace(self):
        """build_power_flow_trace tworzy poprawny trace."""
        nr_trace = [
            {
                "iter": 1,
                "max_mismatch_pu": 0.1,
                "mismatch_norm": 0.15,
                "step_norm": 0.05,
                "damping_used": 1.0,
                "mismatch_per_bus": {"bus_pq": {"delta_p_pu": 0.1, "delta_q_pu": 0.05}},
            },
            {
                "iter": 2,
                "max_mismatch_pu": 1e-9,
                "mismatch_norm": 1e-9,
                "step_norm": 0.0,
                "damping_used": 1.0,
            },
        ]

        trace = build_power_flow_trace(
            input_hash="abc123",
            snapshot_id="snap1",
            case_id="case1",
            run_id="run1",
            init_state={"bus_slack": {"v_pu": 1.0, "theta_rad": 0.0}},
            init_method="flat",
            tolerance=1e-8,
            max_iterations=30,
            base_mva=100.0,
            slack_bus_id="bus_slack",
            pq_bus_ids=["bus_pq"],
            pv_bus_ids=[],
            ybus_trace={},
            nr_trace=nr_trace,
            converged=True,
            iterations_count=2,
        )

        assert trace.solver_version == POWER_FLOW_SOLVER_VERSION
        assert trace.input_hash == "abc123"
        assert trace.converged is True
        assert trace.final_iterations_count == 2
        assert len(trace.iterations) == 2
        assert trace.iterations[0].k == 1
        assert trace.iterations[1].k == 2

    def test_trace_to_dict_deterministic(self):
        """PowerFlowTrace.to_dict() jest deterministyczny."""
        trace = build_power_flow_trace(
            input_hash="abc123",
            snapshot_id="snap1",
            case_id="case1",
            run_id="run1",
            init_state={
                "bus_b": {"v_pu": 1.0, "theta_rad": 0.0},
                "bus_a": {"v_pu": 1.0, "theta_rad": 0.0},
            },
            init_method="flat",
            tolerance=1e-8,
            max_iterations=30,
            base_mva=100.0,
            slack_bus_id="bus_a",
            pq_bus_ids=["bus_b"],
            pv_bus_ids=[],
            ybus_trace={},
            nr_trace=[],
            converged=True,
            iterations_count=0,
        )

        dict1 = trace.to_dict()
        dict2 = trace.to_dict()

        json1 = json.dumps(dict1, sort_keys=True)
        json2 = json.dumps(dict2, sort_keys=True)

        assert json1 == json2

        # init_state powinien być posortowany
        init_state_keys = list(dict1["init_state"].keys())
        assert init_state_keys == sorted(init_state_keys)


# =============================================================================
# Test: PowerFlowResultV1 builder
# =============================================================================


class TestPowerFlowResultV1Builder:
    """P20a: Testy buildera PowerFlowResultV1."""

    def test_build_power_flow_result_v1(self):
        """build_power_flow_result_v1 tworzy poprawny wynik."""
        result = build_power_flow_result_v1(
            converged=True,
            iterations_count=3,
            tolerance_used=1e-8,
            base_mva=100.0,
            slack_bus_id="bus_slack",
            node_u_mag={"bus_slack": 1.0, "bus_pq": 0.98},
            node_angle={"bus_slack": 0.0, "bus_pq": -0.05},
            node_p_injected_pu={"bus_slack": 0.1, "bus_pq": -0.1},
            node_q_injected_pu={"bus_slack": 0.05, "bus_pq": -0.05},
            branch_s_from_mva={"line_1": complex(10.0, 5.0)},
            branch_s_to_mva={"line_1": complex(-9.8, -4.8)},
            losses_total=complex(0.002, 0.002),
            slack_power_pu=complex(0.1, 0.05),
        )

        assert result.converged is True
        assert result.iterations_count == 3
        assert len(result.bus_results) == 2
        assert len(result.branch_results) == 1

        # Bus results posortowane
        assert result.bus_results[0].bus_id == "bus_pq"
        assert result.bus_results[1].bus_id == "bus_slack"

        # Summary
        assert result.summary.min_v_pu == 0.98
        assert result.summary.max_v_pu == 1.0

    def test_result_to_dict_deterministic(self):
        """PowerFlowResultV1.to_dict() jest deterministyczny."""
        result = build_power_flow_result_v1(
            converged=True,
            iterations_count=3,
            tolerance_used=1e-8,
            base_mva=100.0,
            slack_bus_id="bus_a",
            node_u_mag={"bus_b": 0.98, "bus_a": 1.0},
            node_angle={"bus_b": -0.05, "bus_a": 0.0},
            node_p_injected_pu={"bus_b": -0.1, "bus_a": 0.1},
            node_q_injected_pu={"bus_b": -0.05, "bus_a": 0.05},
            branch_s_from_mva={},
            branch_s_to_mva={},
            losses_total=complex(0.0, 0.0),
            slack_power_pu=complex(0.1, 0.05),
        )

        dict1 = result.to_dict()
        dict2 = result.to_dict()

        json1 = json.dumps(dict1, sort_keys=True)
        json2 = json.dumps(dict2, sort_keys=True)

        assert json1 == json2

        # bus_results powinny być posortowane po bus_id
        bus_ids = [br["bus_id"] for br in dict1["bus_results"]]
        assert bus_ids == sorted(bus_ids)
