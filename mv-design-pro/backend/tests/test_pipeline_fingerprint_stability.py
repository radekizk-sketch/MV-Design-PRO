"""
Pipeline fingerprint stability — GAP-5 z test architect audit.

Reference:
- CLAUDE.md § Core Rules §7: "Same input MUST produce identical output. SHA-256
  fingerprints must be stable."
- Test architect audyt (background agent) GAP-5

PROBLEM (z audytu):
- backend/tests/test_solver_input_determinism.py testuje TYLKO `build_solver_input`
  (payload-level determinism).
- backend/tests/test_short_circuit_iec60909.py testuje TYLKO solver (graph-level).
- BRAK testu fingerprint-stability dla całego pipeline:
  `build_solver_input` → `compute_3ph_short_circuit` → `result.to_dict()`.

Ten plik dostarcza brakujący test E2E determinism.
"""

import hashlib
import json

from domain.study_case import StudyCaseConfig
from network_model.catalog.repository import CatalogRepository
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType
from network_model.solvers.fault_loop_iec60364 import (
    FaultLoopInput,
    LoopImpedanceComponent,
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
)
from solver_input.builder import build_solver_input
from solver_input.contracts import SolverAnalysisType


def _make_test_network() -> NetworkGraph:
    g = NetworkGraph(network_model_id="fingerprint-test-network")
    g.add_node(
        Node(
            id="slack_bus",
            name="Slack",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="load_bus",
            name="Load",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    g.add_branch(
        LineBranch(
            id="line_test",
            name="Line Test",
            branch_type=BranchType.LINE,
            from_node_id="slack_bus",
            to_node_id="load_bus",
            r_ohm_per_km=0.420,
            x_ohm_per_km=0.377,
            b_us_per_km=2.84,
            length_km=2.0,
            rated_current_a=210.0,
            type_ref="lt-afl70",
        )
    )
    g.add_switch(
        Switch(
            id="cb_main",
            name="Q01",
            switch_type=SwitchType.BREAKER,
            from_node_id="slack_bus",
            to_node_id="load_bus",
            state=SwitchState.CLOSED,
        )
    )
    return g


def _make_test_catalog() -> CatalogRepository:
    return CatalogRepository.from_records(
        line_types=[
            {
                "id": "lt-afl70",
                "name": "AFL-6 70mm2",
                "params": {
                    "r_ohm_per_km": 0.420,
                    "x_ohm_per_km": 0.377,
                    "b_us_per_km": 2.84,
                    "rated_current_a": 210.0,
                },
            }
        ],
        cable_types=[],
        transformer_types=[],
    )


def _hash_canonical_json(data: dict) -> str:
    """Compute SHA-256 of canonical JSON (sorted keys, no whitespace variance)."""
    serialized = json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class TestSolverInputFingerprintStability:
    """build_solver_input → identical SHA-256 across multiple runs."""

    def test_sc3f_payload_fingerprint_stable(self) -> None:
        """SHA-256(payload) identyczne dla 5 wywołań."""
        graph = _make_test_network()
        catalog = _make_test_catalog()
        config = StudyCaseConfig()

        hashes = []
        for _ in range(5):
            env = build_solver_input(
                graph=graph,
                catalog=catalog,
                case_id="case-fp",
                enm_revision="rev-1",
                analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
                config=config,
            )
            hashes.append(_hash_canonical_json(env.payload))

        # All 5 hashes MUST be identical
        assert len(set(hashes)) == 1, f"Fingerprint drift: {hashes}"

    def test_sc3f_payload_fingerprint_changes_with_config(self) -> None:
        """Zmiana StudyCaseConfig.c_factor_max → różny fingerprint."""
        graph = _make_test_network()
        catalog = _make_test_catalog()

        env_a = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-fp",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            config=StudyCaseConfig(c_factor_max=1.10),
        )
        env_b = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-fp",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            config=StudyCaseConfig(c_factor_max=1.05),
        )
        hash_a = _hash_canonical_json(env_a.payload)
        hash_b = _hash_canonical_json(env_b.payload)
        assert hash_a != hash_b, "Different c_factor should produce different payload"

    def test_simplified_sc_fingerprint_changes_with_sk(self) -> None:
        """Zmiana sc_simplified_sk_mva → różny fingerprint (P0.9 backend integration)."""
        graph = _make_test_network()
        catalog = _make_test_catalog()

        env_a = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-fp",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            config=StudyCaseConfig(
                sc_input_mode="simplified",
                sc_simplified_sk_mva=250.0,
            ),
        )
        env_b = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-fp",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            config=StudyCaseConfig(
                sc_input_mode="simplified",
                sc_simplified_sk_mva=400.0,
            ),
        )
        hash_a = _hash_canonical_json(env_a.payload)
        hash_b = _hash_canonical_json(env_b.payload)
        assert hash_a != hash_b


class TestSolverFingerprintStability:
    """compute_3ph_short_circuit → identyczne result JSON dla tego samego graph."""

    def test_sc3f_solver_result_fingerprint_stable(self) -> None:
        graph = _make_test_network()
        hashes = []
        for _ in range(5):
            result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
                graph=graph,
                fault_node_id="load_bus",
                c_factor=1.0,
                tk_s=1.0,
                tb_s=0.1,
                include_branch_contributions=False,
            )
            # to_dict() exists per ShortCircuitResult contract
            result_dict = result.to_dict()
            # Remove timestamp-like volatile keys if present
            volatile = {"run_id", "computed_at", "timestamp"}
            cleaned = {k: v for k, v in result_dict.items() if k not in volatile}
            hashes.append(_hash_canonical_json(cleaned))

        assert len(set(hashes)) == 1, f"Solver fingerprint drift: {hashes}"


class TestFaultLoopFingerprintStability:
    """P0.5 fault_loop solver — fingerprint stability."""

    def test_fault_loop_result_fingerprint_stable(self) -> None:
        data = FaultLoopInput(
            fault_node_id="bus_lv",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent(label="Kabel L", r_ohm=0.0157, x_ohm=0.0023),
            return_conductor=LoopImpedanceComponent(label="Przewód PE", r_ohm=0.0157, x_ohm=0.0023),
            transformer_impedance=LoopImpedanceComponent(
                label="TR SN/NN", r_ohm=0.005, x_ohm=0.015
            ),
            network_type=NetworkType.TN_S,
            protection_arrangement=ProtectionArrangement.PE,
        )

        hashes = []
        for _ in range(5):
            result = compute_fault_loop(data)
            hashes.append(_hash_canonical_json(result.to_dict()))

        assert len(set(hashes)) == 1, f"Fault loop fingerprint drift: {hashes}"

    def test_fault_loop_different_inputs_different_hashes(self) -> None:
        """Defensive: różne komponenty → różne hashe (sanity check)."""
        base_kwargs = {
            "fault_node_id": "bus_lv",
            "u_nom_v": 230.0,
            "return_conductor": LoopImpedanceComponent(label="PE", r_ohm=0.01, x_ohm=0.001),
            "transformer_impedance": LoopImpedanceComponent(label="TR", r_ohm=0.005, x_ohm=0.015),
            "network_type": NetworkType.TN_S,
            "protection_arrangement": ProtectionArrangement.PE,
        }
        data_a = FaultLoopInput(
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=0.01, x_ohm=0.001),
            **base_kwargs,
        )
        data_b = FaultLoopInput(
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=0.02, x_ohm=0.002),
            **base_kwargs,
        )
        hash_a = _hash_canonical_json(compute_fault_loop(data_a).to_dict())
        hash_b = _hash_canonical_json(compute_fault_loop(data_b).to_dict())
        assert hash_a != hash_b


class TestE2EFingerprintStability:
    """Full pipeline: build_solver_input → solver → result hash."""

    def test_e2e_sc3f_pipeline_fingerprint_stable(self) -> None:
        """5x: build → solve → hash identical (CLAUDE.md §7 Determinism)."""
        graph = _make_test_network()
        catalog = _make_test_catalog()
        config = StudyCaseConfig()

        pipeline_hashes = []
        for _ in range(5):
            # Step 1: build payload
            env = build_solver_input(
                graph=graph,
                catalog=catalog,
                case_id="e2e-fp",
                enm_revision="rev-1",
                analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
                config=config,
            )
            # Step 2: solve via graph (solver consumes graph, not payload yet)
            result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
                graph=graph,
                fault_node_id="load_bus",
                c_factor=config.c_factor_max,
                tk_s=1.0,
                tb_s=0.1,
                include_branch_contributions=False,
            )
            # Step 3: hash combined (payload + result)
            combined = {
                "payload_hash": _hash_canonical_json(env.payload),
                "result_hash": _hash_canonical_json(
                    {
                        k: v
                        for k, v in result.to_dict().items()
                        if k not in {"run_id", "computed_at", "timestamp"}
                    }
                ),
            }
            pipeline_hashes.append(_hash_canonical_json(combined))

        assert len(set(pipeline_hashes)) == 1, f"E2E pipeline fingerprint drift: {pipeline_hashes}"
