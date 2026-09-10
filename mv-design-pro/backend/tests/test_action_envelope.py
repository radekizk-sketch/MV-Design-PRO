from network_model.core import (
    ActionEnvelope,
    NetworkGraph,
    Node,
    NodeType,
    create_network_snapshot,
    validate_action_envelope,
)
from network_model.core.branch import Branch
from network_model.core.inverter import InverterSource

NETWORK_MODEL_ID = "model-1"


def _build_snapshot() -> tuple[NetworkGraph, str]:
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
    graph.add_node(
        Node(
            id="node-2",
            name="Node 2",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    graph.add_branch(
        Branch.from_dict(
            {
                "id": "branch-1",
                "name": "Line 1",
                "branch_type": "LINE",
                "from_node_id": "node-1",
                "to_node_id": "node-2",
                "r_ohm_per_km": 0.206,
                "x_ohm_per_km": 0.118,
                "length_km": 2.5,
                "rated_current_a": 300.0,
            }
        )
    )
    graph.add_inverter_source(
        InverterSource(
            id="inv-1",
            name="Inv 1",
            node_id="node-1",
            in_rated_a=5.0,
        )
    )
    snapshot = create_network_snapshot(
        graph,
        snapshot_id="snap-1",
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )
    return graph, snapshot.meta.snapshot_id


def _base_envelope(**overrides: object) -> ActionEnvelope:
    payload = {"node_type": "PQ", "active_power": 1.0, "reactive_power": 0.5}
    data = {
        "action_id": "action-1",
        "parent_snapshot_id": "snap-1",
        "action_type": "create_node",
        "payload": payload,
        "created_at": "2024-01-01T00:00:00+00:00",
        "actor": "api",
        "schema_version": "v1",
    }
    data.update(overrides)
    return ActionEnvelope.from_dict(data)


def test_valid_envelope_passes_validation() -> None:
    graph, snapshot_id = _build_snapshot()
    snapshot = create_network_snapshot(
        graph,
        snapshot_id=snapshot_id,
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )
    envelope = _base_envelope(parent_snapshot_id=snapshot_id)

    result = validate_action_envelope(envelope, snapshot)

    assert result.status == "accepted"
    assert result.errors == []
    assert result.action_id == envelope.action_id


def test_missing_required_fields_rejected() -> None:
    graph, snapshot_id = _build_snapshot()
    snapshot = create_network_snapshot(
        graph,
        snapshot_id=snapshot_id,
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )
    envelope = ActionEnvelope(
        action_id=None,  # type: ignore[arg-type]
        parent_snapshot_id=snapshot_id,
        action_type="create_node",
        payload={},
        created_at="2024-01-01T00:00:00+00:00",
    )

    result = validate_action_envelope(envelope, snapshot)

    assert result.status == "rejected"
    assert "missing_field" in [issue.code for issue in result.errors]


def test_unknown_action_type_rejected() -> None:
    graph, snapshot_id = _build_snapshot()
    snapshot = create_network_snapshot(
        graph,
        snapshot_id=snapshot_id,
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )
    envelope = _base_envelope(action_type="unknown_action")

    result = validate_action_envelope(envelope, snapshot)

    assert result.status == "rejected"
    assert result.errors[0].code == "unknown_action_type"


def test_missing_payload_keys_rejected() -> None:
    graph, snapshot_id = _build_snapshot()
    snapshot = create_network_snapshot(
        graph,
        snapshot_id=snapshot_id,
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )
    envelope = _base_envelope(payload={"node_type": "PQ"})

    result = validate_action_envelope(envelope, snapshot)

    assert result.status == "rejected"
    assert [issue.path for issue in result.errors] == [
        "payload.active_power",
        "payload.reactive_power",
    ]


def test_referential_integrity_errors_rejected() -> None:
    graph, snapshot_id = _build_snapshot()
    snapshot = create_network_snapshot(
        graph,
        snapshot_id=snapshot_id,
        created_at="2024-01-01T00:00:00+00:00",
        network_model_id=NETWORK_MODEL_ID,
    )
    envelope = _base_envelope(
        action_type="set_in_service",
        payload={"entity_id": "missing-entity", "in_service": True},
    )

    result = validate_action_envelope(envelope, snapshot)

    assert result.status == "rejected"
    assert result.errors[0].code == "unknown_entity"


def test_create_branch_cable_without_catalog_ref_rejected() -> None:
    """V12S-009: kabel SN bez catalog_ref → catalog_ref_missing."""
    graph, snapshot_id = _build_snapshot()
    snapshot = create_network_snapshot(
        graph, snapshot_id=snapshot_id, created_at="2024-01-01T00:00:00+00:00"
    )
    envelope = _base_envelope(
        action_type="create_branch",
        payload={
            "from_node_id": "node-1",
            "to_node_id": "node-2",
            "branch_kind": "cable",
        },
    )

    result = validate_action_envelope(envelope, snapshot)
    assert result.status == "rejected"
    codes = [issue.code for issue in result.errors]
    assert "catalog_ref_missing" in codes


def test_create_branch_cable_with_catalog_ref_accepted() -> None:
    """V12S-009: kabel z catalog_ref przechodzi gate katalogowy."""
    graph, snapshot_id = _build_snapshot()
    snapshot = create_network_snapshot(
        graph, snapshot_id=snapshot_id, created_at="2024-01-01T00:00:00+00:00"
    )
    envelope = _base_envelope(
        action_type="create_branch",
        payload={
            "from_node_id": "node-1",
            "to_node_id": "node-2",
            "branch_kind": "cable",
            "catalog_ref": "CAT-CAB-YAKY-240",
        },
    )

    result = validate_action_envelope(envelope, snapshot)
    catalog_errors = [i for i in result.errors if i.code == "catalog_ref_missing"]
    assert catalog_errors == []


def test_create_branch_cable_draft_bypass_accepted() -> None:
    """V12S-009: draft=True tworzy LogicalSketch bez catalog_ref."""
    graph, snapshot_id = _build_snapshot()
    snapshot = create_network_snapshot(
        graph, snapshot_id=snapshot_id, created_at="2024-01-01T00:00:00+00:00"
    )
    envelope = _base_envelope(
        action_type="create_branch",
        payload={
            "from_node_id": "node-1",
            "to_node_id": "node-2",
            "branch_kind": "cable",
            "draft": True,
        },
    )

    result = validate_action_envelope(envelope, snapshot)
    catalog_errors = [i for i in result.errors if i.code == "catalog_ref_missing"]
    assert catalog_errors == []


def test_create_branch_line_overhead_without_catalog_rejected() -> None:
    """V12S-009: linia napowietrzna bez catalog_ref → odrzucenie."""
    graph, snapshot_id = _build_snapshot()
    snapshot = create_network_snapshot(
        graph, snapshot_id=snapshot_id, created_at="2024-01-01T00:00:00+00:00"
    )
    envelope = _base_envelope(
        action_type="create_branch",
        payload={
            "from_node_id": "node-1",
            "to_node_id": "node-2",
            "branch_kind": "line_overhead",
        },
    )

    result = validate_action_envelope(envelope, snapshot)
    codes = [issue.code for issue in result.errors]
    assert "catalog_ref_missing" in codes


def test_validator_is_deterministic() -> None:
    graph, snapshot_id = _build_snapshot()
    snapshot = create_network_snapshot(
        graph, snapshot_id=snapshot_id, created_at="2024-01-01T00:00:00+00:00"
    )
    envelope = _base_envelope(
        action_type="create_branch",
        payload={"from_node_id": "missing-a", "to_node_id": "missing-b"},
    )

    result_first = validate_action_envelope(envelope, snapshot)
    result_second = validate_action_envelope(envelope, snapshot)

    first_errors = [issue.to_dict() for issue in result_first.errors]
    second_errors = [issue.to_dict() for issue in result_second.errors]
    assert first_errors == second_errors
