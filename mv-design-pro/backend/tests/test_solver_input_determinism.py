"""
Test determinism of solver-input generation.

INVARIANT: Identical ENM + identical catalog → identical solver-input JSON (hash).
"""

import hashlib
import json

from domain.study_case import StudyCaseConfig
from network_model.catalog.repository import CatalogRepository
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from solver_input.builder import build_solver_input
from solver_input.contracts import SolverAnalysisType


def _make_test_network() -> NetworkGraph:
    """Build a small deterministic test network."""
    g = NetworkGraph(network_model_id="test-net-001")

    # SLACK node (grid supply)
    g.add_node(
        Node(
            id="bus_slack",
            name="GPZ Slack",
            node_type=NodeType.SLACK,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )

    # PQ nodes
    g.add_node(
        Node(
            id="bus_sn",
            name="SN Bus",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    g.add_node(
        Node(
            id="bus_load",
            name="Load Bus",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=2.0,
            reactive_power=0.8,
        )
    )

    # Transformer
    g.add_branch(
        TransformerBranch(
            id="trafo_1",
            name="TR 25MVA",
            branch_type=BranchType.TRANSFORMER,
            from_node_id="bus_slack",
            to_node_id="bus_sn",
            rated_power_mva=25.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=15.0,
            uk_percent=11.5,
            pk_kw=150.0,
            i0_percent=0.35,
            p0_kw=25.0,
            vector_group="Yd11",
        )
    )

    # Line
    g.add_branch(
        LineBranch(
            id="line_1",
            name="AFL-70 Segment 1",
            branch_type=BranchType.LINE,
            from_node_id="bus_sn",
            to_node_id="bus_load",
            r_ohm_per_km=0.420,
            x_ohm_per_km=0.377,
            b_us_per_km=2.84,
            length_km=3.5,
            rated_current_a=210.0,
        )
    )

    return g


def _make_empty_catalog() -> CatalogRepository:
    """Build an empty catalog for determinism testing."""
    return CatalogRepository.from_records(
        line_types=[],
        cable_types=[],
        transformer_types=[],
    )


def _envelope_to_stable_json(envelope) -> str:
    """Serialize envelope to stable JSON string for hashing."""
    data = envelope.model_dump(mode="json")
    return json.dumps(data, sort_keys=True, separators=(",", ":"))


def _compute_hash(json_str: str) -> str:
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


class TestSolverInputDeterminism:
    """Determinism: same ENM → identical solver-input JSON."""

    def test_short_circuit_3f_deterministic(self):
        """Two invocations with identical input produce identical output."""
        graph = _make_test_network()
        catalog = _make_empty_catalog()
        config = StudyCaseConfig()

        env1 = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-001",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            config=config,
        )
        env2 = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-001",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            config=config,
        )

        json1 = _envelope_to_stable_json(env1)
        json2 = _envelope_to_stable_json(env2)

        assert json1 == json2, "Solver-input not deterministic for SC_3F"
        assert _compute_hash(json1) == _compute_hash(json2)

    def test_load_flow_deterministic(self):
        """Load-flow solver-input is deterministic."""
        graph = _make_test_network()
        catalog = _make_empty_catalog()
        config = StudyCaseConfig()

        env1 = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-002",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.LOAD_FLOW,
            config=config,
        )
        env2 = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-002",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.LOAD_FLOW,
            config=config,
        )

        json1 = _envelope_to_stable_json(env1)
        json2 = _envelope_to_stable_json(env2)

        assert json1 == json2, "Solver-input not deterministic for LOAD_FLOW"

    def test_different_case_id_produces_different_output(self):
        """Different case_id → different output (sanity)."""
        graph = _make_test_network()
        catalog = _make_empty_catalog()

        env1 = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-A",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )
        env2 = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-B",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )

        json1 = _envelope_to_stable_json(env1)
        json2 = _envelope_to_stable_json(env2)

        assert json1 != json2, "Different case_id should produce different output"

    def test_version_is_1_0(self):
        """Envelope version is locked to 1.0."""
        graph = _make_test_network()
        catalog = _make_empty_catalog()

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-ver",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )
        assert env.solver_input_version == "1.0"

    def test_bus_order_deterministic(self):
        """Buses are sorted by ref_id regardless of insertion order."""
        g1 = NetworkGraph()
        g1.add_node(
            Node(
                id="z_bus",
                name="Z",
                node_type=NodeType.SLACK,
                voltage_level=15.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g1.add_node(
            Node(
                id="a_bus",
                name="A",
                node_type=NodeType.PQ,
                voltage_level=15.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        g1.add_node(
            Node(
                id="m_bus",
                name="M",
                node_type=NodeType.PQ,
                voltage_level=15.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )

        g2 = NetworkGraph()
        g2.add_node(
            Node(
                id="m_bus",
                name="M",
                node_type=NodeType.PQ,
                voltage_level=15.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        g2.add_node(
            Node(
                id="a_bus",
                name="A",
                node_type=NodeType.PQ,
                voltage_level=15.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        g2.add_node(
            Node(
                id="z_bus",
                name="Z",
                node_type=NodeType.SLACK,
                voltage_level=15.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )

        catalog = _make_empty_catalog()

        env1 = build_solver_input(
            graph=g1,
            catalog=catalog,
            case_id="c",
            enm_revision="r",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )
        env2 = build_solver_input(
            graph=g2,
            catalog=catalog,
            case_id="c",
            enm_revision="r",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
        )

        # Extract bus ref_ids from both payloads
        buses1 = [b["ref_id"] for b in env1.payload.get("buses", [])]
        buses2 = [b["ref_id"] for b in env2.payload.get("buses", [])]

        assert buses1 == buses2, "Bus order should be deterministic by ref_id"
        assert buses1 == ["a_bus", "m_bus", "z_bus"]

    def test_protection_stub_returns_empty_payload(self):
        """Protection analysis type returns stub with eligible=false."""
        graph = _make_test_network()
        catalog = _make_empty_catalog()

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-prot",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.PROTECTION,
        )
        assert env.eligibility.eligible is False
        assert env.payload == {}
        assert any(b.code == "SI-100" for b in env.eligibility.blockers)
