"""
P10a Lifecycle Tests — Deterministic Fingerprint and Result Invalidation

TESTS:
1. Fingerprint determinism - same network = same hash
2. Fingerprint changes when network changes
3. StudyCase snapshot binding (status wynikow: WYPROWADZANY, patrz tests/api/test_status_wynikow_przypadku.py)
4. Run invalidation when snapshot changes
5. Project active snapshot tracking
"""

from uuid import uuid4

from domain.models import new_project
from domain.study_case import (
    new_study_case,
)
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.snapshot import (
    NetworkSnapshot,
    _canonicalize_value,
    compute_fingerprint,
    create_network_snapshot,
)


class TestDeterministicFingerprint:
    """Test fingerprint determinism (P10a)."""

    def test_same_network_produces_same_fingerprint(self):
        """Identical networks must produce identical fingerprints."""
        # Create identical graphs
        graph1 = _create_test_graph()
        graph2 = _create_test_graph()

        snapshot1 = create_network_snapshot(
            graph1,
            network_model_id="test-model-1",
        )
        snapshot2 = create_network_snapshot(
            graph2,
            network_model_id="test-model-1",
        )

        assert snapshot1.fingerprint == snapshot2.fingerprint

    def test_different_networks_produce_different_fingerprints(self):
        """Different networks must produce different fingerprints."""
        graph1 = _create_test_graph()
        graph2 = _create_test_graph()

        # Modify graph2
        graph2.add_node(
            Node(
                id="node-extra",
                node_type=NodeType.PQ,
                name="Extra Bus",
                voltage_level=20.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )

        snapshot1 = create_network_snapshot(
            graph1,
            network_model_id="test-model-1",
        )
        snapshot2 = create_network_snapshot(
            graph2,
            network_model_id="test-model-1",
        )

        assert snapshot1.fingerprint != snapshot2.fingerprint

    def test_fingerprint_is_independent_of_creation_order(self):
        """Fingerprint must not depend on element creation order."""
        graph1 = NetworkGraph()
        graph1.network_model_id = "test-model"
        graph1.add_node(
            Node(
                id="node-a",
                node_type=NodeType.PQ,
                name="A",
                voltage_level=20.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        graph1.add_node(
            Node(
                id="node-b",
                node_type=NodeType.PQ,
                name="B",
                voltage_level=20.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )

        graph2 = NetworkGraph()
        graph2.network_model_id = "test-model"
        # Add in reverse order
        graph2.add_node(
            Node(
                id="node-b",
                node_type=NodeType.PQ,
                name="B",
                voltage_level=20.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        graph2.add_node(
            Node(
                id="node-a",
                node_type=NodeType.PQ,
                name="A",
                voltage_level=20.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )

        snapshot1 = create_network_snapshot(graph1, network_model_id="test-model")
        snapshot2 = create_network_snapshot(graph2, network_model_id="test-model")

        assert snapshot1.fingerprint == snapshot2.fingerprint

    def test_fingerprint_stored_in_meta(self):
        """Fingerprint must be stored in SnapshotMeta."""
        graph = _create_test_graph()
        snapshot = create_network_snapshot(graph, network_model_id="test-model")

        assert snapshot.meta.fingerprint is not None
        assert len(snapshot.meta.fingerprint) == 64  # SHA-256 hex

    def test_fingerprint_in_to_dict(self):
        """Fingerprint must be included in to_dict() output."""
        graph = _create_test_graph()
        snapshot = create_network_snapshot(graph, network_model_id="test-model")

        data = snapshot.to_dict()
        assert "fingerprint" in data["meta"]
        assert data["meta"]["fingerprint"] == snapshot.fingerprint

    def test_fingerprint_from_dict_roundtrip(self):
        """Fingerprint must survive serialization roundtrip."""
        graph = _create_test_graph()
        original = create_network_snapshot(graph, network_model_id="test-model")

        data = original.to_dict()
        restored = NetworkSnapshot.from_dict(data)

        assert restored.fingerprint == original.fingerprint


class TestCanonicalizeValue:
    """Test value canonicalization for deterministic JSON."""

    def test_dict_keys_sorted(self):
        """Dict keys must be sorted."""
        data = {"z": 1, "a": 2, "m": 3}
        result = _canonicalize_value(data)
        assert list(result.keys()) == ["a", "m", "z"]

    def test_nested_dicts_sorted(self):
        """Nested dict keys must be sorted."""
        data = {"outer": {"z": 1, "a": 2}}
        result = _canonicalize_value(data)
        assert list(result["outer"].keys()) == ["a", "z"]

    def test_floats_normalized(self):
        """Float values that are integers should be converted."""
        assert _canonicalize_value(1.0) == 1
        assert _canonicalize_value(1.5) == 1.5
        assert _canonicalize_value(1.123456789012) == 1.1234567890  # rounded

    def test_lists_preserved_order(self):
        """Lists must preserve order."""
        data = [3, 1, 2]
        assert _canonicalize_value(data) == [3, 1, 2]


class TestComputeFingerprint:
    """Test compute_fingerprint function."""

    def test_returns_hex_sha256(self):
        """Fingerprint must be 64-char hex (SHA-256)."""
        fp = compute_fingerprint({"test": "data"})
        assert len(fp) == 64
        assert all(c in "0123456789abcdef" for c in fp)

    def test_deterministic(self):
        """Same input must produce same output."""
        data = {"nodes": [{"id": "1"}, {"id": "2"}]}
        fp1 = compute_fingerprint(data)
        fp2 = compute_fingerprint(data)
        assert fp1 == fp2


class TestStudyCaseBezPrzypiecMigawkiLegacy:
    """W1 (2026-09-09): `Project.active_network_snapshot_id`, `StudyCase.network_snapshot_id`
    (+ `with_network_snapshot_id`) i `StudyRun` zeszły razem z legacy persystencją sieci
    (tabele `network_*`); jedyna prawda sieci to ENM w magazynie projektu, a świeżość
    wyniku wynika z koperty rewizji biegu. Dawne klasy TestProjectWithActiveSnapshot /
    TestStudyCaseWithSnapshot / TestStudyRunWithSnapshot usunięte razem z polami;
    zachowana intencja: przypadek nie przechowuje ani statusu wyników, ani przypięcia
    migawki — i klon tego nie przywraca."""

    def test_przypadek_nie_ma_statusu_wynikow_ani_migawki_legacy(self):
        case = new_study_case(project_id=uuid4(), name="Test Case")
        cloned = case.clone("Cloned")

        for obiekt in (case, cloned):
            assert not hasattr(
                obiekt, "result_status"
            ), "przypadek nie moze znowu przechowywac statusu wynikow"
            assert not hasattr(
                obiekt, "network_snapshot_id"
            ), "przypiecie migawki legacy skasowane w W1 nie moze wrocic"
        assert not hasattr(new_project(name="Projekt"), "active_network_snapshot_id")


def _create_test_graph() -> NetworkGraph:
    """Create a simple test network graph with only nodes (sufficient for fingerprint test)."""
    graph = NetworkGraph()
    graph.network_model_id = "test-model"

    # Add nodes - using correct Node API with NodeType and required fields
    graph.add_node(
        Node(
            id="node-1",
            node_type=NodeType.SLACK,
            name="Bus 1",
            voltage_level=20.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="node-2",
            node_type=NodeType.PQ,
            name="Bus 2",
            voltage_level=0.4,
            active_power=0.1,
            reactive_power=0.05,
        )
    )

    # Note: Not adding branches to keep test simple
    # Fingerprint test only needs to verify determinism, not full network structure

    return graph
