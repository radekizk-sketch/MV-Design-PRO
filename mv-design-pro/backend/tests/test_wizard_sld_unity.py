"""
Wizard/SLD Unity Verification Tests — Phase 6.

CANONICAL ALIGNMENT:
- SYSTEM_SPEC.md § 3: Single NetworkModel per project
- SYSTEM_SPEC.md § 4: Wizard and SLD edit THE SAME model
- ARCHITECTURE.md: Layer boundaries (Solver vs Analysis vs Presentation)

These tests verify the ARCHITECTURE INVARIANTS:
1. ONE NetworkModel per project (singleton)
2. Wizard edits the model -> SLD reflects it (via projection)
3. SLD edits the model -> Wizard reflects it (same graph object)
4. No shadow data stores
5. Model mutation invalidates case results
6. NetworkValidator blocks solver on invalid model
7. Deterministic graph build

NOTE: These are architecture-level tests using direct model construction.
No database or HTTP mocking is required.
"""

import sys
from pathlib import Path
from uuid import UUID

import pytest

# Add backend/src to path for imports
backend_src = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(backend_src))

from application.network_model import (
    MultipleNetworkModelsError,
    build_network_graph,
    network_model_id_for_project,
)
from application.network_model.identity import ensure_snapshot_matches_project
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType
from network_model.core.snapshot import create_network_snapshot
from network_model.core.switch import Switch, SwitchState, SwitchType
from network_model.sld_projection import SldBusElement, project_snapshot_to_sld
from network_model.validation import NetworkValidator, validate_network

# =============================================================================
# Helper functions for creating test objects
# =============================================================================


def create_slack_node(
    node_id: str = "slack-1",
    name: str = "GPZ Centrum",
    voltage_level: float = 110.0,
    voltage_magnitude: float = 1.0,
    voltage_angle: float = 0.0,
) -> Node:
    """Create a valid SLACK node for tests."""
    return Node(
        id=node_id,
        name=name,
        node_type=NodeType.SLACK,
        voltage_level=voltage_level,
        voltage_magnitude=voltage_magnitude,
        voltage_angle=voltage_angle,
    )


def create_pq_node(
    node_id: str = "pq-1",
    name: str = "Stacja SN-1",
    voltage_level: float = 20.0,
    active_power: float = 5.0,
    reactive_power: float = 2.0,
) -> Node:
    """Create a valid PQ node for tests."""
    return Node(
        id=node_id,
        name=name,
        node_type=NodeType.PQ,
        voltage_level=voltage_level,
        active_power=active_power,
        reactive_power=reactive_power,
    )


def create_line_branch(
    branch_id: str = "line-1",
    name: str = "Linia SN-1",
    from_node_id: str = "slack-1",
    to_node_id: str = "pq-1",
    r_ohm_per_km: float = 0.1,
    x_ohm_per_km: float = 0.4,
    b_us_per_km: float = 3.4,
    length_km: float = 10.0,
    rated_current_a: float = 300.0,
) -> LineBranch:
    """Create a valid LINE branch for tests."""
    return LineBranch(
        id=branch_id,
        name=name,
        branch_type=BranchType.LINE,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        r_ohm_per_km=r_ohm_per_km,
        x_ohm_per_km=x_ohm_per_km,
        b_us_per_km=b_us_per_km,
        length_km=length_km,
        rated_current_a=rated_current_a,
    )


def create_simple_network(network_model_id: str = "project-001") -> NetworkGraph:
    """Create a minimal valid network: SLACK -- LINE -- PQ."""
    graph = NetworkGraph(network_model_id=network_model_id)
    graph.add_node(create_slack_node())
    graph.add_node(create_pq_node())
    graph.add_branch(create_line_branch())
    return graph


# =============================================================================
# Test 1: Single Model per Project
# =============================================================================


class TestSingleModelPerProject:
    """Verify that ONE NetworkModel ID is derived per project (singleton rule)."""

    def test_single_model_per_project(self) -> None:
        """network_model_id_for_project returns deterministic ID from project UUID."""
        project_id = UUID("12345678-1234-1234-1234-123456789abc")

        model_id = network_model_id_for_project(project_id)

        assert model_id is not None
        assert isinstance(model_id, str)
        assert len(model_id) > 0

    def test_same_project_same_model_id(self) -> None:
        """The same project UUID always returns the same model ID."""
        project_id = UUID("aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee")

        id_1 = network_model_id_for_project(project_id)
        id_2 = network_model_id_for_project(project_id)

        assert id_1 == id_2

    def test_different_projects_different_model_ids(self) -> None:
        """Different project UUIDs return different model IDs."""
        project_a = UUID("aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee")
        project_b = UUID("bbbb2222-cccc-dddd-eeee-ffffffffffff")

        id_a = network_model_id_for_project(project_a)
        id_b = network_model_id_for_project(project_b)

        assert id_a != id_b

    def test_snapshot_must_match_project(self) -> None:
        """ensure_snapshot_matches_project raises when snapshot has wrong model ID."""
        project_id = UUID("12345678-1234-1234-1234-123456789abc")
        network_model_id_for_project(project_id)

        # Create snapshot with wrong model ID
        graph = NetworkGraph(network_model_id="wrong-model-id")
        graph.add_node(create_slack_node())
        snapshot = create_network_snapshot(graph)

        with pytest.raises(MultipleNetworkModelsError):
            ensure_snapshot_matches_project(snapshot, project_id)

    def test_snapshot_matches_project_when_correct(self) -> None:
        """ensure_snapshot_matches_project passes when model ID matches."""
        project_id = UUID("12345678-1234-1234-1234-123456789abc")
        expected_model_id = network_model_id_for_project(project_id)

        graph = NetworkGraph(network_model_id=expected_model_id)
        graph.add_node(create_slack_node())
        snapshot = create_network_snapshot(graph)

        # Should not raise
        ensure_snapshot_matches_project(snapshot, project_id)


# =============================================================================
# Test 2: Wizard Edit Reflected in Graph
# =============================================================================


class TestWizardEditReflectedInGraph:
    """Verify that adding elements via wizard-style operations appears in the graph."""

    def test_wizard_edit_reflected_in_graph(self) -> None:
        """Adding a node to the graph is immediately visible."""
        graph = NetworkGraph(network_model_id="project-001")

        # Wizard-style operation: add a SLACK node
        slack = create_slack_node()
        graph.add_node(slack)

        # Graph immediately reflects the change
        assert "slack-1" in graph.nodes
        assert graph.nodes["slack-1"].name == "GPZ Centrum"
        assert graph.nodes["slack-1"].node_type == NodeType.SLACK

    def test_wizard_add_branch_reflected(self) -> None:
        """Adding a branch is immediately visible and creates a topological edge."""
        graph = create_simple_network()

        assert "line-1" in graph.branches
        assert graph.branches["line-1"].from_node_id == "slack-1"
        assert graph.branches["line-1"].to_node_id == "pq-1"

        # Topological connection exists
        assert graph.is_connected()

    def test_wizard_remove_node_reflected(self) -> None:
        """Removing a node removes it and connected branches from the graph."""
        graph = create_simple_network()
        assert "pq-1" in graph.nodes
        assert "line-1" in graph.branches

        graph.remove_node("pq-1")

        assert "pq-1" not in graph.nodes
        # Branch connected to pq-1 must also be removed
        assert "line-1" not in graph.branches


# =============================================================================
# Test 3: No Shadow Data Stores
# =============================================================================


class TestNoShadowDataStores:
    """Verify that network_model_id_for_project returns the same ID on multiple calls."""

    def test_no_shadow_data_stores(self) -> None:
        """Multiple calls to network_model_id_for_project return same ID (no duplication)."""
        project_id = UUID("11111111-2222-3333-4444-555555555555")

        results = [network_model_id_for_project(project_id) for _ in range(100)]

        # All results must be identical — no shadow store creating alternatives
        assert len(set(results)) == 1

    def test_graph_object_identity_preserved(self) -> None:
        """When Wizard and SLD reference the same graph, mutations are shared."""
        # Simulates the architecture: ONE graph object shared between Wizard and SLD
        shared_graph = NetworkGraph(network_model_id="project-001")

        # Wizard reference
        wizard_view = shared_graph
        # SLD reference
        sld_view = shared_graph

        # Wizard adds a node
        wizard_view.add_node(create_slack_node())

        # SLD sees it immediately (same object)
        assert "slack-1" in sld_view.nodes
        assert sld_view.nodes["slack-1"].name == "GPZ Centrum"

        # SLD adds another node
        sld_view.add_node(create_pq_node())

        # Wizard sees it immediately
        assert "pq-1" in wizard_view.nodes
        assert wizard_view.nodes["pq-1"].name == "Stacja SN-1"


# =============================================================================
# Test 4: Model Mutation Invalidates Case Results
# =============================================================================


class TestModelMutationInvalidatesCaseResults:
    """
    Verify the architecture rule that model changes invalidate case results.

    Per SYSTEM_SPEC.md: Case stores ONLY calculation parameters.
    Case CANNOT mutate NetworkModel. Model changes invalidate ALL case results.
    This is implemented via snapshot fingerprinting.
    """

    def test_model_mutation_changes_fingerprint(self) -> None:
        """Modifying the network produces a different snapshot fingerprint."""
        graph = create_simple_network()
        snapshot_before = create_network_snapshot(graph)
        fingerprint_before = snapshot_before.meta.fingerprint

        # Create a new graph with an additional node (model mutation)
        graph_after = create_simple_network()
        graph_after.add_node(create_pq_node(node_id="pq-2", name="Stacja SN-2"))
        graph_after.add_branch(
            create_line_branch(
                branch_id="line-2",
                name="Linia SN-2",
                from_node_id="slack-1",
                to_node_id="pq-2",
            )
        )
        snapshot_after = create_network_snapshot(graph_after)
        fingerprint_after = snapshot_after.meta.fingerprint

        # Fingerprints must differ → results invalidation is detectable
        assert fingerprint_before != fingerprint_after

    def test_identical_model_same_fingerprint(self) -> None:
        """Identical network state produces the same fingerprint (determinism)."""
        graph_a = create_simple_network()
        graph_b = create_simple_network()

        snapshot_a = create_network_snapshot(graph_a)
        snapshot_b = create_network_snapshot(graph_b)

        assert snapshot_a.meta.fingerprint == snapshot_b.meta.fingerprint


# =============================================================================
# Test 5: Validation Blocks Solver on Invalid Model
# =============================================================================


class TestValidationBlocksSolverOnInvalidModel:
    """
    Verify that NetworkValidator blocks solver execution on invalid models.

    Per ARCHITECTURE: Validation is a pre-check layer (Application Layer).
    If validation fails (ERROR-level issues), solver execution is BLOCKED.
    """

    def test_empty_network_blocked(self) -> None:
        """An empty network fails validation with ERROR."""
        graph = NetworkGraph(network_model_id="project-001")
        report = validate_network(graph)

        assert not report.is_valid
        error_codes = [issue.code for issue in report.errors]
        assert "network.empty" in error_codes

    def test_no_slack_blocked(self) -> None:
        """A network without SLACK node fails validation."""
        graph = NetworkGraph(network_model_id="project-001")
        graph.add_node(create_pq_node("pq-1"))
        graph.add_node(create_pq_node("pq-2", name="Stacja SN-2"))
        graph.add_branch(
            create_line_branch(
                from_node_id="pq-1",
                to_node_id="pq-2",
            )
        )

        report = validate_network(graph)

        assert not report.is_valid
        error_codes = [issue.code for issue in report.errors]
        assert "network.no_slack" in error_codes

    def test_disconnected_network_blocked(self) -> None:
        """A disconnected network fails validation with ERROR."""
        graph = NetworkGraph(network_model_id="project-001")
        graph.add_node(create_slack_node("slack-1"))
        graph.add_node(create_pq_node("pq-1"))
        # No branch connecting them → disconnected

        report = validate_network(graph)

        assert not report.is_valid
        error_codes = [issue.code for issue in report.errors]
        assert "network.disconnected" in error_codes

    def test_valid_network_passes(self) -> None:
        """A valid connected network passes validation."""
        graph = create_simple_network()
        report = validate_network(graph)

        assert report.is_valid
        assert len(report.errors) == 0

    def test_validator_does_no_physics(self) -> None:
        """
        Validator is NOT a solver — it does no physics calculations.

        This verifies the architecture boundary: NetworkValidator only checks
        structural validity, never computes power flow or short circuit.
        """
        validator = NetworkValidator()

        # Validation returns a report with issues, NOT calculation results
        graph = create_simple_network()
        report = validator.validate(graph)

        # Report has structural diagnostics only
        assert hasattr(report, "is_valid")
        assert hasattr(report, "errors")
        assert hasattr(report, "warnings")
        # No physics attributes
        assert not hasattr(report, "voltages")
        assert not hasattr(report, "currents")
        assert not hasattr(report, "power_flow")


# =============================================================================
# Test 6: Wizard/SLD Round-Trip Node Creation
# =============================================================================


class TestWizardSldRoundTripNodeCreation:
    """
    Verify that creating a node in the model shows up in SLD projection.

    Per sld_rules.md § A.1: Bijection — each model element has exactly
    one SLD symbol, and each SLD symbol maps to exactly one model element.
    """

    def test_wizard_sld_round_trip_node_creation(self) -> None:
        """Create a node, build snapshot, project to SLD, verify bus symbol exists."""
        graph = NetworkGraph(network_model_id="project-001")

        # Wizard adds a SLACK node
        graph.add_node(create_slack_node("slack-1", name="GPZ Centrum"))

        # Create snapshot (immutable state capture)
        snapshot = create_network_snapshot(graph)

        # Project snapshot to SLD
        sld = project_snapshot_to_sld(snapshot)

        # SLD must contain a bus element for our node
        bus_elements = [
            e for e in sld.elements if isinstance(e, SldBusElement) and e.node_id == "slack-1"
        ]
        assert len(bus_elements) == 1
        assert bus_elements[0].node_id == "slack-1"
        assert bus_elements[0].element_type == "bus"

    def test_sld_reflects_all_model_elements(self) -> None:
        """SLD projection contains a symbol for every model element."""
        graph = create_simple_network()
        snapshot = create_network_snapshot(graph)
        sld = project_snapshot_to_sld(snapshot)

        # Extract element identities from SLD
        sld_identities = {e.identity for e in sld.elements}

        # Every node must be in the SLD
        for node_id in graph.nodes:
            assert node_id in sld_identities, f"Node '{node_id}' missing from SLD projection"

        # Every active branch must be in the SLD
        for branch_id, branch in graph.branches.items():
            if getattr(branch, "in_service", True):
                assert (
                    branch_id in sld_identities
                ), f"Branch '{branch_id}' missing from SLD projection"

    def test_sld_bijection_no_extra_elements(self) -> None:
        """SLD has no extra elements beyond what the model contains."""
        graph = create_simple_network()
        snapshot = create_network_snapshot(graph)
        sld = project_snapshot_to_sld(snapshot)

        # Count elements in model
        model_elements = set(graph.nodes.keys()) | set(graph.branches.keys())
        # Count elements in SLD
        sld_identities = {e.identity for e in sld.elements}

        # SLD should not have MORE elements than the model
        extra = sld_identities - model_elements
        assert len(extra) == 0, f"SLD has extra elements not in model: {extra}"


# =============================================================================
# Test 7: Deterministic Graph Build
# =============================================================================


class TestDeterministicGraphBuild:
    """
    Verify that building the graph twice from the same data produces the same result.

    Per SYSTEM_SPEC.md: same input = same output (determinism invariant).
    """

    def test_deterministic_graph_build(self) -> None:
        """Two graphs built identically have the same nodes and branches."""
        graph_a = create_simple_network()
        graph_b = create_simple_network()

        # Same nodes
        assert set(graph_a.nodes.keys()) == set(graph_b.nodes.keys())
        # Same branches
        assert set(graph_a.branches.keys()) == set(graph_b.branches.keys())
        # Same connectivity
        assert graph_a.is_connected() == graph_b.is_connected()
        # Same islands
        assert graph_a.find_islands() == graph_b.find_islands()

    def test_deterministic_sld_projection(self) -> None:
        """Two SLD projections from identical graphs produce identical output."""
        graph_a = create_simple_network()
        graph_b = create_simple_network()

        snapshot_a = create_network_snapshot(graph_a)
        snapshot_b = create_network_snapshot(graph_b)

        sld_a = project_snapshot_to_sld(snapshot_a)
        sld_b = project_snapshot_to_sld(snapshot_b)

        # Element order is deterministic (sorted by type, then identity)
        assert len(sld_a.elements) == len(sld_b.elements)
        for elem_a, elem_b in zip(sld_a.elements, sld_b.elements, strict=False):
            assert elem_a.element_type == elem_b.element_type
            assert elem_a.identity == elem_b.identity

    def test_deterministic_validation(self) -> None:
        """Two validations of identical graphs produce identical reports."""
        graph_a = create_simple_network()
        graph_b = create_simple_network()

        report_a = validate_network(graph_a)
        report_b = validate_network(graph_b)

        assert report_a.is_valid == report_b.is_valid
        assert len(report_a.errors) == len(report_b.errors)
        assert len(report_a.warnings) == len(report_b.warnings)

    def test_deterministic_fingerprint(self) -> None:
        """Two snapshots of identical graphs produce the same fingerprint."""
        graph_a = create_simple_network()
        graph_b = create_simple_network()

        snapshot_a = create_network_snapshot(graph_a)
        snapshot_b = create_network_snapshot(graph_b)

        assert snapshot_a.meta.fingerprint == snapshot_b.meta.fingerprint

    def test_build_network_graph_deterministic(self) -> None:
        """build_network_graph from the same input data yields identical graphs."""
        node_dicts = [
            {
                "id": "slack-1",
                "name": "GPZ",
                "node_type": "SLACK",
                "voltage_level": 110.0,
                "voltage_magnitude": 1.0,
                "voltage_angle": 0.0,
            },
            {
                "id": "pq-1",
                "name": "Stacja",
                "node_type": "PQ",
                "voltage_level": 20.0,
                "active_power": 5.0,
                "reactive_power": 2.0,
            },
        ]
        branch_dicts = [
            {
                "id": "line-1",
                "name": "Linia",
                "branch_type": "LINE",
                "from_node_id": "slack-1",
                "to_node_id": "pq-1",
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.4,
                "b_us_per_km": 3.4,
                "length_km": 10.0,
                "rated_current_a": 300.0,
            },
        ]

        def identity_builder(data: dict) -> dict:
            return data

        graph_a = build_network_graph(
            nodes=node_dicts,
            branches=branch_dicts,
            switching_states={},
            node_payload_builder=identity_builder,
            branch_payload_builder=identity_builder,
            network_model_id="project-001",
        )
        graph_b = build_network_graph(
            nodes=node_dicts,
            branches=branch_dicts,
            switching_states={},
            node_payload_builder=identity_builder,
            branch_payload_builder=identity_builder,
            network_model_id="project-001",
        )

        assert set(graph_a.nodes.keys()) == set(graph_b.nodes.keys())
        assert set(graph_a.branches.keys()) == set(graph_b.branches.keys())
        assert graph_a.is_connected() == graph_b.is_connected()


# =============================================================================
# Additional: Switch and Inverter Source Unity
# =============================================================================


class TestSwitchAndInverterUnity:
    """Verify that switches and inverter sources work through the unified model."""

    def test_switch_in_sld_projection(self) -> None:
        """Switches added to the model appear in SLD projection."""
        graph = NetworkGraph(network_model_id="project-001")
        graph.add_node(create_slack_node("bus-a", voltage_level=20.0))
        graph.add_node(create_pq_node("bus-b", voltage_level=20.0))
        graph.add_switch(
            Switch(
                id="sw-1",
                name="Wyłącznik Q1",
                switch_type=SwitchType.BREAKER,
                from_node_id="bus-a",
                to_node_id="bus-b",
                state=SwitchState.CLOSED,
            )
        )

        snapshot = create_network_snapshot(graph)
        sld = project_snapshot_to_sld(snapshot)

        sld_identities = {e.identity for e in sld.elements}
        assert "sw-1" in sld_identities

    def test_inverter_source_in_sld_projection(self) -> None:
        """Inverter sources added to the model appear in SLD projection."""
        graph = NetworkGraph(network_model_id="project-001")
        graph.add_node(create_slack_node("bus-a"))

        graph.add_inverter_source(
            InverterSource(
                id="pv-1",
                name="PV Farma 1",
                node_id="bus-a",
                in_rated_a=100.0,
                k_sc=1.1,
            )
        )

        snapshot = create_network_snapshot(graph)
        sld = project_snapshot_to_sld(snapshot)

        sld_identities = {e.identity for e in sld.elements}
        assert "pv-1" in sld_identities
