from __future__ import annotations

import json

from infrastructure.persistence.db import (
    create_engine_from_url,
    create_session_factory,
    init_db,
)
from infrastructure.persistence.models import _canonicalize
from infrastructure.persistence.repositories import SnapshotRepository
from network_model.core import BranchType, NetworkGraph, Node, NodeType
from network_model.core.branch import LineBranch
from network_model.core.snapshot import NetworkSnapshot, SnapshotMeta, create_network_snapshot
from sqlalchemy import text
from sqlalchemy.orm import Session

NETWORK_MODEL_ID = "model-1"


def _setup_session() -> Session:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    return session_factory()


def _build_snapshot(*, snapshot_id: str, parent_snapshot_id: str | None = None) -> NetworkSnapshot:
    graph = NetworkGraph(network_model_id=NETWORK_MODEL_ID)
    node_a = Node(
        id="node-a",
        name="Bus A",
        node_type=NodeType.PQ,
        voltage_level=15.0,
        active_power=1.0,
        reactive_power=0.5,
    )
    node_b = Node(
        id="node-b",
        name="Bus B",
        node_type=NodeType.PQ,
        voltage_level=15.0,
        active_power=2.0,
        reactive_power=1.0,
    )
    graph.add_node(node_a)
    graph.add_node(node_b)
    graph.add_branch(
        LineBranch(
            id="branch-1",
            name="Line 1",
            branch_type=BranchType.LINE,
            from_node_id=node_a.id,
            to_node_id=node_b.id,
            in_service=True,
            r_ohm_per_km=0.206,
            x_ohm_per_km=0.118,
            length_km=2.5,
            rated_current_a=300.0,
        )
    )
    # NOTE: connection_node_id was removed from NetworkGraph.
    # BoundaryNode – węzeł przyłączenia is interpretation, not model property.
    meta = SnapshotMeta.create(
        snapshot_id=snapshot_id,
        parent_snapshot_id=parent_snapshot_id,
        schema_version="1.0",
        network_model_id=NETWORK_MODEL_ID,
    )
    return NetworkSnapshot(meta=meta, graph=graph)


def test_snapshot_repository_roundtrip_and_immutability() -> None:
    session = _setup_session()
    repo = SnapshotRepository(session)
    snapshot = _build_snapshot(snapshot_id="snap-1")

    repo.add_snapshot(snapshot)
    snapshot.graph.add_node(
        Node(
            id="node-c",
            name="Bus C",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.5,
            reactive_power=0.2,
        )
    )

    loaded = repo.get_snapshot("snap-1")

    assert loaded is not None
    assert loaded.meta.snapshot_id == "snap-1"
    assert loaded.meta.parent_snapshot_id is None
    # connection_node_id no longer stored in NetworkGraph
    assert "node-c" not in loaded.graph.nodes
    session.close()


def test_snapshot_lineage_lists_parent_chain() -> None:
    session = _setup_session()
    repo = SnapshotRepository(session)
    root = _build_snapshot(snapshot_id="root")
    child = create_network_snapshot(
        root.graph,
        parent_snapshot=root,
        snapshot_id="child",
        schema_version="1.0",
        network_model_id=NETWORK_MODEL_ID,
    )

    repo.add_snapshot(root)
    repo.add_snapshot(child)

    lineage = repo.list_lineage("child")

    assert [meta.snapshot_id for meta in lineage] == ["root", "child"]
    assert lineage[1].parent_snapshot_id == "root"
    session.close()


def test_snapshot_json_is_deterministic_and_json_safe() -> None:
    session = _setup_session()
    repo = SnapshotRepository(session)
    snapshot = _build_snapshot(snapshot_id="snap-json")
    snapshot.graph.nodes["node-a"].active_power = {1.0, 2.0}

    repo.add_snapshot(snapshot)

    raw_payload = session.execute(
        text("SELECT snapshot_json FROM network_snapshots WHERE snapshot_id = :sid"),
        {"sid": "snap-json"},
    ).scalar_one()

    expected = json.dumps(_canonicalize(snapshot.to_dict()), sort_keys=True, separators=(",", ":"))
    assert raw_payload == expected
    session.close()
