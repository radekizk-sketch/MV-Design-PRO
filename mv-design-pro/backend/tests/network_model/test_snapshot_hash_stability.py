"""
Tests for deterministic snapshot hashing and canonical JSON serialization.

Verifies:
- Determinism: same data -> same hash regardless of insertion order
- Stability: permutation of elements in lists does not change hash
- Canonical JSON: keys sorted, lists sorted by id, consistent floats
- Delta overlay: structural diff between snapshots
"""

from __future__ import annotations

import json

from domain.study_case_delta import (
    DeltaOverlay,
    DeltaOverlayToken,
    FieldChange,
    compute_delta,
)
from network_model.core.branch import BranchType, LineBranch
from network_model.core.canonical_hash import (
    _canonicalize_value,
    canonical_json_from_dict,
    snapshot_hash,
    verify_hash,
)
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.snapshot import (
    NetworkSnapshot,
    create_network_snapshot,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_node(node_id: str, name: str, voltage: float = 15.0) -> Node:
    """Create a PQ node with deterministic parameters."""
    return Node(
        id=node_id,
        name=name,
        node_type=NodeType.PQ,
        voltage_level=voltage,
        active_power=1.0,
        reactive_power=0.5,
    )


def _make_slack_node(node_id: str, name: str, voltage: float = 110.0) -> Node:
    """Create a SLACK node with deterministic parameters."""
    return Node(
        id=node_id,
        name=name,
        node_type=NodeType.SLACK,
        voltage_level=voltage,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )


def _make_branch(
    branch_id: str,
    name: str,
    from_id: str,
    to_id: str,
) -> LineBranch:
    """Create a line branch with deterministic parameters."""
    return LineBranch(
        id=branch_id,
        name=name,
        branch_type=BranchType.LINE,
        from_node_id=from_id,
        to_node_id=to_id,
        r_ohm_per_km=0.32,
        x_ohm_per_km=0.39,
        b_us_per_km=3.5,
        length_km=10.0,
        rated_current_a=300.0,
    )


def _make_graph_with_nodes(node_ids: list[str], model_id: str = "model-1") -> NetworkGraph:
    """
    Create a graph with given node IDs.

    First node is SLACK, rest are PQ.
    """
    graph = NetworkGraph(network_model_id=model_id)
    for i, nid in enumerate(node_ids):
        if i == 0:
            graph.add_node(_make_slack_node(nid, f"Node-{nid}"))
        else:
            graph.add_node(_make_node(nid, f"Node-{nid}"))
    return graph


def _make_snapshot(
    graph: NetworkGraph,
    snapshot_id: str = "snap-1",
    network_model_id: str = "model-1",
) -> NetworkSnapshot:
    """Create a snapshot with deterministic metadata."""
    return create_network_snapshot(
        graph,
        snapshot_id=snapshot_id,
        created_at="2026-01-01T00:00:00+00:00",
        network_model_id=network_model_id,
    )


# ---------------------------------------------------------------------------
# Test: canonical_json sorted keys
# ---------------------------------------------------------------------------


class TestCanonicalJsonSortedKeys:
    def test_dict_keys_are_sorted(self):
        """Dict keys must appear in alphabetical order."""
        data = {"zebra": 1, "alpha": 2, "middle": 3}
        result = canonical_json_from_dict(data)
        parsed = json.loads(result)
        assert list(parsed.keys()) == ["alpha", "middle", "zebra"]

    def test_nested_dict_keys_are_sorted(self):
        """Nested dict keys must also be sorted."""
        data = {"b": {"z": 1, "a": 2}, "a": {"y": 3, "x": 4}}
        result = canonical_json_from_dict(data)
        parsed = json.loads(result)
        assert list(parsed.keys()) == ["a", "b"]
        assert list(parsed["a"].keys()) == ["x", "y"]
        assert list(parsed["b"].keys()) == ["a", "z"]

    def test_no_whitespace_in_output(self):
        """Canonical JSON must have no whitespace."""
        data = {"key": "value", "number": 42}
        result = canonical_json_from_dict(data)
        assert " " not in result
        assert "\n" not in result
        assert "\t" not in result


# ---------------------------------------------------------------------------
# Test: canonical_json sorted lists
# ---------------------------------------------------------------------------


class TestCanonicalJsonSortedLists:
    def test_list_of_dicts_sorted_by_id(self):
        """Lists of dicts with 'id' field are sorted by id."""
        data = {
            "items": [
                {"id": "c", "value": 3},
                {"id": "a", "value": 1},
                {"id": "b", "value": 2},
            ]
        }
        result = canonical_json_from_dict(data)
        parsed = json.loads(result)
        ids = [item["id"] for item in parsed["items"]]
        assert ids == ["a", "b", "c"]

    def test_list_without_id_preserves_order(self):
        """Lists of non-dict items preserve original order."""
        data = {"values": [3, 1, 2]}
        result = canonical_json_from_dict(data)
        parsed = json.loads(result)
        assert parsed["values"] == [3, 1, 2]

    def test_list_of_dicts_without_id_preserves_order(self):
        """Lists of dicts without 'id' field preserve original order."""
        data = {"items": [{"name": "c"}, {"name": "a"}]}
        result = canonical_json_from_dict(data)
        parsed = json.loads(result)
        names = [item["name"] for item in parsed["items"]]
        assert names == ["c", "a"]


# ---------------------------------------------------------------------------
# Test: float precision
# ---------------------------------------------------------------------------


class TestFloatPrecision:
    def test_float_rounded_to_6_decimals(self):
        """Floats are rounded to 6 decimal places."""
        result = _canonicalize_value(1.23456789)
        assert result == 1.234568

    def test_integer_floats_become_int(self):
        """Float values that are integers become int."""
        result = _canonicalize_value(5.0)
        assert result == 5
        assert isinstance(result, int)

    def test_complex_number_serialization(self):
        """Complex numbers serialize as {im, re} dict."""
        result = _canonicalize_value(complex(1.5, 2.5))
        assert result == {"re": 1.5, "im": 2.5}

    def test_complex_sorted_keys(self):
        """Complex number dict has alphabetically sorted keys (im before re)."""
        result = _canonicalize_value(complex(1.0, 2.0))
        assert list(result.keys()) == ["im", "re"]


# ---------------------------------------------------------------------------
# Test: same data same hash
# ---------------------------------------------------------------------------


class TestSameDataSameHash:
    def test_identical_graphs_same_hash(self):
        """Two identical graphs must produce identical hashes."""
        graph1 = _make_graph_with_nodes(["n1", "n2"])
        graph2 = _make_graph_with_nodes(["n1", "n2"])

        snap1 = _make_snapshot(graph1)
        snap2 = _make_snapshot(graph2)

        assert snapshot_hash(snap1) == snapshot_hash(snap2)

    def test_same_snapshot_hashed_twice(self):
        """Hashing the same snapshot twice must give same result."""
        graph = _make_graph_with_nodes(["n1"])
        snap = _make_snapshot(graph)

        h1 = snapshot_hash(snap)
        h2 = snapshot_hash(snap)
        assert h1 == h2

    def test_hash_is_sha256_hex(self):
        """Hash must be 64-character lowercase hex string."""
        graph = _make_graph_with_nodes(["n1"])
        snap = _make_snapshot(graph)
        h = snapshot_hash(snap)

        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


# ---------------------------------------------------------------------------
# Test: permuted elements same hash
# ---------------------------------------------------------------------------


class TestPermutedElementsSameHash:
    def test_node_insertion_order_irrelevant(self):
        """Adding nodes in different order must produce same hash."""
        graph1 = NetworkGraph(network_model_id="model-1")
        graph1.add_node(_make_slack_node("n1", "Node-1"))
        graph1.add_node(_make_node("n2", "Node-2"))
        graph1.add_node(_make_node("n3", "Node-3"))

        graph2 = NetworkGraph(network_model_id="model-1")
        graph2.add_node(_make_node("n3", "Node-3"))
        graph2.add_node(_make_node("n2", "Node-2"))
        graph2.add_node(_make_slack_node("n1", "Node-1"))

        snap1 = _make_snapshot(graph1)
        snap2 = _make_snapshot(graph2)

        assert snapshot_hash(snap1) == snapshot_hash(snap2)

    def test_branch_insertion_order_irrelevant(self):
        """Adding branches in different order must produce same hash."""
        graph1 = NetworkGraph(network_model_id="model-1")
        graph1.add_node(_make_slack_node("n1", "Node-1"))
        graph1.add_node(_make_node("n2", "Node-2"))
        graph1.add_node(_make_node("n3", "Node-3"))
        graph1.add_branch(_make_branch("b1", "Branch-1", "n1", "n2"))
        graph1.add_branch(_make_branch("b2", "Branch-2", "n2", "n3"))

        graph2 = NetworkGraph(network_model_id="model-1")
        graph2.add_node(_make_slack_node("n1", "Node-1"))
        graph2.add_node(_make_node("n2", "Node-2"))
        graph2.add_node(_make_node("n3", "Node-3"))
        graph2.add_branch(_make_branch("b2", "Branch-2", "n2", "n3"))
        graph2.add_branch(_make_branch("b1", "Branch-1", "n1", "n2"))

        snap1 = _make_snapshot(graph1)
        snap2 = _make_snapshot(graph2)

        assert snapshot_hash(snap1) == snapshot_hash(snap2)


# ---------------------------------------------------------------------------
# Test: different data different hash
# ---------------------------------------------------------------------------


class TestDifferentDataDifferentHash:
    def test_different_node_name_different_hash(self):
        """Changing a node name must change the hash."""
        graph1 = NetworkGraph(network_model_id="model-1")
        graph1.add_node(_make_slack_node("n1", "Name-A"))

        graph2 = NetworkGraph(network_model_id="model-1")
        graph2.add_node(_make_slack_node("n1", "Name-B"))

        snap1 = _make_snapshot(graph1)
        snap2 = _make_snapshot(graph2)

        assert snapshot_hash(snap1) != snapshot_hash(snap2)

    def test_extra_node_different_hash(self):
        """Adding an extra node must change the hash."""
        graph1 = _make_graph_with_nodes(["n1"])
        graph2 = _make_graph_with_nodes(["n1", "n2"])

        snap1 = _make_snapshot(graph1)
        snap2 = _make_snapshot(graph2)

        assert snapshot_hash(snap1) != snapshot_hash(snap2)

    def test_different_voltage_different_hash(self):
        """Changing voltage level must change the hash."""
        graph1 = NetworkGraph(network_model_id="model-1")
        graph1.add_node(_make_slack_node("n1", "Node", voltage=110.0))

        graph2 = NetworkGraph(network_model_id="model-1")
        graph2.add_node(_make_slack_node("n1", "Node", voltage=220.0))

        snap1 = _make_snapshot(graph1)
        snap2 = _make_snapshot(graph2)

        assert snapshot_hash(snap1) != snapshot_hash(snap2)


# ---------------------------------------------------------------------------
# Test: verify_hash
# ---------------------------------------------------------------------------


class TestVerifyHash:
    def test_verify_correct_hash(self):
        """verify_hash returns True for matching hash."""
        graph = _make_graph_with_nodes(["n1"])
        snap = _make_snapshot(graph)
        h = snapshot_hash(snap)
        assert verify_hash(snap, h) is True

    def test_verify_wrong_hash(self):
        """verify_hash returns False for non-matching hash."""
        graph = _make_graph_with_nodes(["n1"])
        snap = _make_snapshot(graph)
        assert verify_hash(snap, "0" * 64) is False


# ---------------------------------------------------------------------------
# Test: delta overlay computation
# ---------------------------------------------------------------------------


class TestDeltaOverlayComputation:
    def test_identical_snapshots_empty_delta(self):
        """Two identical snapshots produce empty delta."""
        graph = _make_graph_with_nodes(["n1", "n2"])
        snap_a = _make_snapshot(graph, snapshot_id="snap-a")
        snap_b = _make_snapshot(graph, snapshot_id="snap-b")

        delta = compute_delta(snap_a, snap_b)

        assert delta.is_empty
        assert delta.total_changes == 0
        assert len(delta.added_elements) == 0
        assert len(delta.removed_elements) == 0
        assert len(delta.modified_elements) == 0

    def test_added_node_detected(self):
        """Node added in snapshot B is detected."""
        graph_a = _make_graph_with_nodes(["n1"])
        graph_b = _make_graph_with_nodes(["n1", "n2"])

        snap_a = _make_snapshot(graph_a, snapshot_id="snap-a")
        snap_b = _make_snapshot(graph_b, snapshot_id="snap-b")

        delta = compute_delta(snap_a, snap_b)

        assert "n2" in delta.added_elements
        assert delta.token_for("n2") == DeltaOverlayToken.ADDED

    def test_removed_node_detected(self):
        """Node removed from snapshot B is detected."""
        graph_a = _make_graph_with_nodes(["n1", "n2"])
        graph_b = _make_graph_with_nodes(["n1"])

        snap_a = _make_snapshot(graph_a, snapshot_id="snap-a")
        snap_b = _make_snapshot(graph_b, snapshot_id="snap-b")

        delta = compute_delta(snap_a, snap_b)

        assert "n2" in delta.removed_elements
        assert delta.token_for("n2") == DeltaOverlayToken.REMOVED

    def test_modified_node_detected(self):
        """Node with changed fields is detected as modified."""
        graph_a = NetworkGraph(network_model_id="model-1")
        graph_a.add_node(_make_slack_node("n1", "Original-Name"))

        graph_b = NetworkGraph(network_model_id="model-1")
        graph_b.add_node(_make_slack_node("n1", "Changed-Name"))

        snap_a = _make_snapshot(graph_a, snapshot_id="snap-a")
        snap_b = _make_snapshot(graph_b, snapshot_id="snap-b")

        delta = compute_delta(snap_a, snap_b)

        assert len(delta.modified_elements) > 0
        assert delta.token_for("n1") == DeltaOverlayToken.MODIFIED

        name_changes = [
            fc
            for fc in delta.modified_elements
            if fc.element_id == "n1" and fc.field_name == "name"
        ]
        assert len(name_changes) == 1
        assert name_changes[0].old_value == "Original-Name"
        assert name_changes[0].new_value == "Changed-Name"

    def test_unchanged_node_token(self):
        """Unchanged node returns UNCHANGED token."""
        graph = _make_graph_with_nodes(["n1", "n2"])
        snap_a = _make_snapshot(graph, snapshot_id="snap-a")
        snap_b = _make_snapshot(graph, snapshot_id="snap-b")

        delta = compute_delta(snap_a, snap_b)
        assert delta.token_for("n1") == DeltaOverlayToken.UNCHANGED
        assert delta.token_for("nonexistent") == DeltaOverlayToken.UNCHANGED

    def test_delta_to_dict(self):
        """DeltaOverlay.to_dict produces serializable output."""
        delta = DeltaOverlay(
            added_elements=("e1",),
            removed_elements=("e2",),
            modified_elements=(FieldChange("e3", "name", "old", "new"),),
        )
        d = delta.to_dict()
        assert d["added_elements"] == ["e1"]
        assert d["removed_elements"] == ["e2"]
        assert len(d["modified_elements"]) == 1
        assert d["modified_elements"][0]["element_id"] == "e3"


# ---------------------------------------------------------------------------
# Test: delta overlay symmetry
# ---------------------------------------------------------------------------


class TestDeltaOverlaySymmetry:
    def test_added_and_removed_swap_on_reversal(self):
        """Swapping A and B swaps added and removed sets."""
        graph_a = _make_graph_with_nodes(["n1"])
        graph_b = _make_graph_with_nodes(["n1", "n2"])

        snap_a = _make_snapshot(graph_a, snapshot_id="snap-a")
        snap_b = _make_snapshot(graph_b, snapshot_id="snap-b")

        delta_ab = compute_delta(snap_a, snap_b)
        delta_ba = compute_delta(snap_b, snap_a)

        # What is added in A->B should be removed in B->A
        assert set(delta_ab.added_elements) == set(delta_ba.removed_elements)
        assert set(delta_ab.removed_elements) == set(delta_ba.added_elements)

    def test_modified_fields_reverse_old_new(self):
        """Swapping A and B swaps old_value and new_value in modifications."""
        graph_a = NetworkGraph(network_model_id="model-1")
        graph_a.add_node(_make_slack_node("n1", "Name-A"))

        graph_b = NetworkGraph(network_model_id="model-1")
        graph_b.add_node(_make_slack_node("n1", "Name-B"))

        snap_a = _make_snapshot(graph_a, snapshot_id="snap-a")
        snap_b = _make_snapshot(graph_b, snapshot_id="snap-b")

        delta_ab = compute_delta(snap_a, snap_b)
        delta_ba = compute_delta(snap_b, snap_a)

        # Same number of modifications in both directions
        assert len(delta_ab.modified_elements) == len(delta_ba.modified_elements)

        # For each modified field, old/new values are swapped
        for fc_ab in delta_ab.modified_elements:
            matching = [
                fc
                for fc in delta_ba.modified_elements
                if fc.element_id == fc_ab.element_id and fc.field_name == fc_ab.field_name
            ]
            assert len(matching) == 1
            fc_ba = matching[0]
            assert fc_ab.old_value == fc_ba.new_value
            assert fc_ab.new_value == fc_ba.old_value

    def test_identical_snapshots_symmetric(self):
        """Identical snapshots produce empty delta in both directions."""
        graph = _make_graph_with_nodes(["n1"])
        snap_a = _make_snapshot(graph, snapshot_id="snap-a")
        snap_b = _make_snapshot(graph, snapshot_id="snap-b")

        delta_ab = compute_delta(snap_a, snap_b)
        delta_ba = compute_delta(snap_b, snap_a)

        assert delta_ab.is_empty
        assert delta_ba.is_empty
