"""
Testy diff rewizji ENM (v4.2).

Porównanie techniczne snapshotów na poziomie encji i parametrów.
"""

from __future__ import annotations

from diagnostics.diff import DiffChangeType, compute_enm_diff
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.snapshot import create_network_snapshot


def _make_graph_a() -> NetworkGraph:
    """Base graph for diff testing."""
    g = NetworkGraph(network_model_id="test-model")
    g.add_node(
        Node(
            id="bus-1",
            name="Szyna A",
            node_type=NodeType.SLACK,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="bus-2",
            name="Szyna B",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            active_power=10.0,
            reactive_power=5.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="line-1",
            name="Linia L1",
            branch_type=BranchType.LINE,
            from_node_id="bus-1",
            to_node_id="bus-2",
            r_ohm_per_km=0.12,
            x_ohm_per_km=0.39,
            length_km=10.0,
            rated_current_a=400.0,
        )
    )
    return g


def _make_graph_b_modified() -> NetworkGraph:
    """Modified graph: bus-2 renamed + line-1 length changed."""
    g = NetworkGraph(network_model_id="test-model")
    g.add_node(
        Node(
            id="bus-1",
            name="Szyna A",
            node_type=NodeType.SLACK,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="bus-2",
            name="Szyna B (zmieniona)",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            active_power=15.0,
            reactive_power=7.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="line-1",
            name="Linia L1",
            branch_type=BranchType.LINE,
            from_node_id="bus-1",
            to_node_id="bus-2",
            r_ohm_per_km=0.12,
            x_ohm_per_km=0.39,
            length_km=15.0,  # changed
            rated_current_a=400.0,
        )
    )
    return g


def _make_graph_c_added() -> NetworkGraph:
    """Graph with extra node and branch added."""
    g = _make_graph_a()
    g.add_node(
        Node(
            id="bus-3",
            name="Szyna C",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="line-2",
            name="Linia L2",
            branch_type=BranchType.LINE,
            from_node_id="bus-2",
            to_node_id="bus-3",
            r_ohm_per_km=0.1,
            x_ohm_per_km=0.3,
            length_km=8.0,
            rated_current_a=350.0,
        )
    )
    return g


class TestEnmDiff:
    def test_identical_snapshots(self):
        g = _make_graph_a()
        snap_a = create_network_snapshot(g, snapshot_id="snap-a")
        snap_b = create_network_snapshot(g, snapshot_id="snap-b")
        diff = compute_enm_diff(snap_a, snap_b)
        assert diff.is_identical is True
        assert len(diff.changes) == 0
        assert diff.summary["total"] == 0

    def test_modified_entities(self):
        g_a = _make_graph_a()
        g_b = _make_graph_b_modified()
        snap_a = create_network_snapshot(g_a, snapshot_id="snap-a")
        snap_b = create_network_snapshot(g_b, snapshot_id="snap-b")
        diff = compute_enm_diff(snap_a, snap_b)
        assert diff.is_identical is False
        assert diff.summary["modified"] > 0
        # bus-2 was modified (name, active_power, reactive_power)
        bus2_changes = [
            c
            for c in diff.changes
            if c.entity_id == "bus-2" and c.change_type == DiffChangeType.MODIFIED
        ]
        assert len(bus2_changes) == 1
        field_names = {fc.field_name for fc in bus2_changes[0].field_changes}
        assert "name" in field_names
        assert "active_power" in field_names

    def test_added_entities(self):
        g_a = _make_graph_a()
        g_c = _make_graph_c_added()
        snap_a = create_network_snapshot(g_a, snapshot_id="snap-a")
        snap_c = create_network_snapshot(g_c, snapshot_id="snap-c")
        diff = compute_enm_diff(snap_a, snap_c)
        assert diff.is_identical is False
        assert diff.summary["added"] == 2  # bus-3 + line-2
        added_ids = {c.entity_id for c in diff.changes if c.change_type == DiffChangeType.ADDED}
        assert "bus-3" in added_ids
        assert "line-2" in added_ids

    def test_removed_entities(self):
        g_a = _make_graph_c_added()
        g_b = _make_graph_a()
        snap_a = create_network_snapshot(g_a, snapshot_id="snap-a")
        snap_b = create_network_snapshot(g_b, snapshot_id="snap-b")
        diff = compute_enm_diff(snap_a, snap_b)
        assert diff.summary["removed"] == 2  # bus-3 + line-2
        removed_ids = {c.entity_id for c in diff.changes if c.change_type == DiffChangeType.REMOVED}
        assert "bus-3" in removed_ids
        assert "line-2" in removed_ids

    def test_diff_deterministic(self):
        """Same inputs produce same output."""
        g_a = _make_graph_a()
        g_b = _make_graph_b_modified()
        snap_a = create_network_snapshot(g_a, snapshot_id="snap-a")
        snap_b = create_network_snapshot(g_b, snapshot_id="snap-b")
        diff_1 = compute_enm_diff(snap_a, snap_b)
        diff_2 = compute_enm_diff(snap_a, snap_b)
        assert diff_1.to_dict() == diff_2.to_dict()

    def test_diff_to_dict(self):
        g = _make_graph_a()
        snap_a = create_network_snapshot(g, snapshot_id="snap-a")
        snap_b = create_network_snapshot(g, snapshot_id="snap-b")
        diff = compute_enm_diff(snap_a, snap_b)
        d = diff.to_dict()
        assert "from_snapshot_id" in d
        assert "to_snapshot_id" in d
        assert "is_identical" in d
        assert "changes" in d
        assert "summary" in d

    def test_fingerprints_in_diff(self):
        g_a = _make_graph_a()
        g_b = _make_graph_b_modified()
        snap_a = create_network_snapshot(g_a, snapshot_id="snap-a")
        snap_b = create_network_snapshot(g_b, snapshot_id="snap-b")
        diff = compute_enm_diff(snap_a, snap_b)
        assert diff.from_fingerprint != diff.to_fingerprint
        assert len(diff.from_fingerprint) == 64  # SHA-256 hex
        assert len(diff.to_fingerprint) == 64
