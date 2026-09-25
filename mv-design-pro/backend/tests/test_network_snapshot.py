from network_model.core import (
    InverterSource,
    NetworkGraph,
    Node,
    NodeType,
    Switch,
    SwitchState,
    create_network_snapshot,
)
from network_model.core.branch import Branch
from network_model.core.snapshot import NetworkSnapshot

NETWORK_MODEL_ID = "model-1"


def _build_graph() -> NetworkGraph:
    graph = NetworkGraph(network_model_id=NETWORK_MODEL_ID)
    graph.add_node(
        Node(
            id="node-b",
            name="Node B",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    graph.add_node(
        Node(
            id="node-a",
            name="Node A",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_branch(
        Branch.from_dict(
            {
                "id": "branch-2",
                "name": "Line 2",
                "branch_type": "LINE",
                "from_node_id": "node-b",
                "to_node_id": "node-a",
                "r_ohm_per_km": 0.206,
                "x_ohm_per_km": 0.118,
                "length_km": 2.5,
                "rated_current_a": 300.0,
            }
        )
    )
    graph.add_branch(
        Branch.from_dict(
            {
                "id": "branch-1",
                "name": "Line 1",
                "branch_type": "LINE",
                "from_node_id": "node-a",
                "to_node_id": "node-b",
                "r_ohm_per_km": 0.206,
                "x_ohm_per_km": 0.118,
                "length_km": 2.5,
                "rated_current_a": 300.0,
            }
        )
    )
    graph.add_inverter_source(
        InverterSource(
            id="inv-2",
            name="Inv 2",
            node_id="node-b",
            in_rated_a=10.0,
        )
    )
    graph.add_inverter_source(
        InverterSource(
            id="inv-1",
            name="Inv 1",
            node_id="node-a",
            in_rated_a=5.0,
        )
    )
    graph.add_switch(
        Switch(
            id="sw-1",
            name="Switch 1",
            from_node_id="node-a",
            to_node_id="node-b",
            state=SwitchState.CLOSED,
        )
    )
    return graph


def test_snapshot_roundtrip_preserves_identity_and_ordering() -> None:
    graph = _build_graph()
    snapshot = create_network_snapshot(
        graph,
        snapshot_id="snap-1",
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )

    payload = snapshot.to_dict()
    assert [node["id"] for node in payload["graph"]["nodes"]] == ["node-a", "node-b"]
    assert [branch["id"] for branch in payload["graph"]["branches"]] == [
        "branch-1",
        "branch-2",
    ]
    assert [source["id"] for source in payload["graph"]["inverter_sources"]] == [
        "inv-1",
        "inv-2",
    ]
    assert [switch["id"] for switch in payload["graph"]["switches"]] == ["sw-1"]

    restored = NetworkSnapshot.from_dict(payload)
    assert restored.meta.snapshot_id == snapshot.meta.snapshot_id
    assert list(restored.graph.nodes.keys()) == ["node-a", "node-b"]
    assert list(restored.graph.branches.keys()) == ["branch-1", "branch-2"]
    assert list(restored.graph.inverter_sources.keys()) == ["inv-1", "inv-2"]
    assert list(restored.graph.switches.keys()) == ["sw-1"]
    assert restored.to_dict() == payload


def test_snapshot_lineage_creates_new_snapshot_id() -> None:
    graph = _build_graph()
    base_snapshot = create_network_snapshot(
        graph,
        snapshot_id="base-snap",
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )
    derived_snapshot = create_network_snapshot(
        graph,
        parent_snapshot=base_snapshot,
        network_model_id=NETWORK_MODEL_ID,
    )

    assert derived_snapshot.meta.snapshot_id != base_snapshot.meta.snapshot_id
    assert derived_snapshot.meta.parent_snapshot_id == base_snapshot.meta.snapshot_id
    assert base_snapshot.meta.parent_snapshot_id is None
