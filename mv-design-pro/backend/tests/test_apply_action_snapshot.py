from network_model.core import (
    ActionEnvelope,
    NetworkGraph,
    Node,
    NodeType,
    apply_action_to_snapshot,
    create_network_snapshot,
)

NETWORK_MODEL_ID = "model-1"


def test_create_node_creates_new_snapshot_and_preserves_parent() -> None:
    graph = NetworkGraph(network_model_id=NETWORK_MODEL_ID)
    graph.add_node(
        Node(
            id="node-1",
            name="Node 1",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    snapshot = create_network_snapshot(
        graph,
        snapshot_id="snap-1",
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )
    parent_payload = snapshot.to_dict()

    action = ActionEnvelope(
        action_id="action-1",
        parent_snapshot_id=snapshot.meta.snapshot_id,
        action_type="create_node",
        payload={
            "id": "node-2",
            "name": "Node 2",
            "node_type": "PQ",
            "voltage_level": 15.0,
            "active_power": 1.0,
            "reactive_power": 0.5,
        },
        created_at="2024-01-02T00:00:00+00:00",
        status="accepted",
    )

    new_snapshot = apply_action_to_snapshot(snapshot, action)

    assert new_snapshot.meta.snapshot_id == action.action_id
    assert new_snapshot.meta.parent_snapshot_id == snapshot.meta.snapshot_id
    assert "node-2" in new_snapshot.graph.nodes
    assert snapshot.to_dict() == parent_payload


def test_snapshot_serialization_is_deterministic() -> None:
    graph = NetworkGraph(network_model_id=NETWORK_MODEL_ID)
    graph.add_node(
        Node(
            id="node-1",
            name="Node 1",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    snapshot = create_network_snapshot(
        graph,
        snapshot_id="snap-1",
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )
    action = ActionEnvelope(
        action_id="action-1",
        parent_snapshot_id=snapshot.meta.snapshot_id,
        action_type="create_node",
        payload={
            "id": "node-2",
            "name": "Node 2",
            "node_type": "PQ",
            "voltage_level": 15.0,
            "active_power": 1.0,
            "reactive_power": 0.5,
        },
        created_at="2024-01-02T00:00:00+00:00",
        status="accepted",
    )
    new_snapshot = apply_action_to_snapshot(snapshot, action)

    payload_first = new_snapshot.to_dict()
    payload_second = new_snapshot.to_dict()

    assert payload_first == payload_second
    assert [node["id"] for node in payload_first["graph"]["nodes"]] == [
        "node-1",
        "node-2",
    ]


def test_two_actions_create_snapshot_chain() -> None:
    graph = NetworkGraph(network_model_id=NETWORK_MODEL_ID)
    graph.add_node(
        Node(
            id="node-1",
            name="Node 1",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    snapshot = create_network_snapshot(
        graph,
        snapshot_id="snap-1",
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )
    action_node = ActionEnvelope(
        action_id="action-1",
        parent_snapshot_id=snapshot.meta.snapshot_id,
        action_type="create_node",
        payload={
            "id": "node-2",
            "name": "Node 2",
            "node_type": "PQ",
            "voltage_level": 15.0,
            "active_power": 1.0,
            "reactive_power": 0.5,
        },
        created_at="2024-01-02T00:00:00+00:00",
        status="accepted",
    )
    snapshot_one = apply_action_to_snapshot(snapshot, action_node)

    action_branch = ActionEnvelope(
        action_id="action-2",
        parent_snapshot_id=snapshot_one.meta.snapshot_id,
        action_type="create_branch",
        payload={
            "id": "branch-1",
            "name": "Line 1",
            "branch_kind": "LINE",
            "from_node_id": "node-1",
            "to_node_id": "node-2",
            "r_ohm_per_km": 0.206,
            "x_ohm_per_km": 0.118,
            "length_km": 2.5,
            "rated_current_a": 300.0,
        },
        created_at="2024-01-03T00:00:00+00:00",
        status="accepted",
    )
    snapshot_two = apply_action_to_snapshot(snapshot_one, action_branch)

    assert snapshot_one.meta.parent_snapshot_id == snapshot.meta.snapshot_id
    assert snapshot_two.meta.parent_snapshot_id == snapshot_one.meta.snapshot_id
    assert "branch-1" in snapshot_two.graph.branches


def test_snapshot_actions_preserve_network_model_id() -> None:
    graph = NetworkGraph(network_model_id=NETWORK_MODEL_ID)
    graph.add_node(
        Node(
            id="node-1",
            name="Node 1",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    snapshot = create_network_snapshot(
        graph,
        snapshot_id="snap-1",
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )
    action = ActionEnvelope(
        action_id="action-1",
        parent_snapshot_id=snapshot.meta.snapshot_id,
        action_type="create_node",
        payload={
            "id": "node-2",
            "name": "Node 2",
            "node_type": "PQ",
            "voltage_level": 15.0,
            "active_power": 0.0,
            "reactive_power": 0.0,
        },
        created_at="2024-01-02T00:00:00+00:00",
        status="accepted",
    )

    new_snapshot = apply_action_to_snapshot(snapshot, action)

    assert new_snapshot.meta.network_model_id == NETWORK_MODEL_ID
