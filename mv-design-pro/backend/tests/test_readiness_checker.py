"""Regression tests for network_model.catalog.readiness_checker.

V10 invariant:
- Empty network must be blocked.
- Network without a source must be blocked.
- Readiness flags must reflect that block.
"""

from __future__ import annotations

from network_model.catalog.readiness_checker import check_snapshot_readiness
from network_model.core import NetworkGraph, Node, NodeType, create_network_snapshot


def _make_snapshot(graph: NetworkGraph, snapshot_id: str) -> object:
    return create_network_snapshot(
        graph,
        network_model_id="NM_READINESS",
        snapshot_id=snapshot_id,
        created_at="2026-04-11T12:00:00Z",
    )


def _make_pq_node(node_id: str) -> Node:
    return Node(
        id=node_id,
        name=f"Węzeł {node_id}",
        node_type=NodeType.PQ,
        voltage_level=15.0,
        active_power=0.0,
        reactive_power=0.0,
    )


def _make_source_node(node_id: str = "GPZ_001") -> Node:
    return Node(
        id=node_id,
        name="GPZ",
        node_type=NodeType.SLACK,
        voltage_level=15.0,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )


def test_empty_snapshot_is_blocked_and_not_ready() -> None:
    graph = NetworkGraph(network_model_id="NM_READINESS")
    snapshot = _make_snapshot(graph, "SNAP_EMPTY")

    profile = check_snapshot_readiness(snapshot)
    codes = {issue.code for issue in profile.issues}

    assert "source.grid_supply_missing" in codes
    assert "trunk.segment_missing" in codes
    assert profile.sld_ready is False
    assert profile.short_circuit_ready is False
    assert profile.load_flow_ready is False
    assert profile.protection_ready is False


def test_snapshot_without_source_is_blocked_and_not_ready() -> None:
    graph = NetworkGraph(network_model_id="NM_READINESS")
    graph.add_node(_make_pq_node("BUS_001"))
    snapshot = _make_snapshot(graph, "SNAP_NO_SOURCE")

    profile = check_snapshot_readiness(snapshot)
    codes = {issue.code for issue in profile.issues}

    assert "source.grid_supply_missing" in codes
    assert "trunk.segment_missing" in codes
    assert profile.sld_ready is False
    assert profile.short_circuit_ready is False
    assert profile.load_flow_ready is False
    assert profile.protection_ready is False
