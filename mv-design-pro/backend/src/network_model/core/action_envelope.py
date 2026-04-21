"""
Action envelope types and deterministic validation for snapshot-based edits.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .graph import NetworkGraph
from .node import NodeType
from .snapshot import NetworkSnapshot

ActionId = str
ParentSnapshotId = str
EntityId = str

ACTION_TYPES = (
    "create_node",
    "create_branch",
    "set_in_service",
)

ACTION_REQUIRED_PAYLOAD_KEYS = {
    "create_node": ["node_type"],
    "create_branch": ["from_node_id", "to_node_id", "branch_kind"],
    "set_in_service": ["entity_id", "in_service"],
}

NODE_TYPE_REQUIRED_PAYLOAD_KEYS = {
    NodeType.SLACK.value: ["voltage_magnitude", "voltage_angle"],
    NodeType.PQ.value: ["active_power", "reactive_power"],
    NodeType.PV.value: ["active_power", "voltage_magnitude"],
}


@dataclass(frozen=True)
class ActionEnvelope:
    action_id: ActionId
    parent_snapshot_id: ParentSnapshotId
    action_type: str
    payload: dict[str, Any]
    created_at: str
    status: str | None = None
    actor: str | None = None
    schema_version: str | int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "action_id": self.action_id,
            "parent_snapshot_id": self.parent_snapshot_id,
            "action_type": self.action_type,
            "payload": self.payload,
            "created_at": self.created_at,
            "status": self.status,
            "actor": self.actor,
            "schema_version": self.schema_version,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ActionEnvelope:
        return cls(
            action_id=str(data["action_id"]),
            parent_snapshot_id=str(data["parent_snapshot_id"]),
            action_type=str(data["action_type"]),
            payload=dict(data.get("payload", {})),
            created_at=str(data["created_at"]),
            status=data.get("status"),
            actor=data.get("actor"),
            schema_version=data.get("schema_version"),
        )


@dataclass(frozen=True)
class ActionIssue:
    code: str
    message: str
    path: str

    def to_dict(self) -> dict[str, str]:
        return {
            "code": self.code,
            "message": self.message,
            "path": self.path,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ActionIssue:
        return cls(
            code=str(data["code"]),
            message=str(data["message"]),
            path=str(data["path"]),
        )


@dataclass(frozen=True)
class ActionResult:
    status: str
    action_id: ActionId
    parent_snapshot_id: ParentSnapshotId
    errors: list[ActionIssue] = field(default_factory=list)
    warnings: list[ActionIssue] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "action_id": self.action_id,
            "parent_snapshot_id": self.parent_snapshot_id,
            "errors": [issue.to_dict() for issue in self.errors],
            "warnings": [issue.to_dict() for issue in self.warnings],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ActionResult:
        return cls(
            status=str(data["status"]),
            action_id=str(data["action_id"]),
            parent_snapshot_id=str(data["parent_snapshot_id"]),
            errors=[ActionIssue.from_dict(err) for err in data.get("errors", [])],
            warnings=[ActionIssue.from_dict(warn) for warn in data.get("warnings", [])],
        )


@dataclass(frozen=True)
class BatchActionResult:
    status: str
    parent_snapshot_id: ParentSnapshotId
    action_results: list[ActionResult]
    new_snapshot_id: str | None = None
    errors: list[ActionIssue] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "parent_snapshot_id": self.parent_snapshot_id,
            "new_snapshot_id": self.new_snapshot_id,
            "action_results": [result.to_dict() for result in self.action_results],
            "errors": [issue.to_dict() for issue in self.errors],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BatchActionResult:
        return cls(
            status=str(data["status"]),
            parent_snapshot_id=str(data["parent_snapshot_id"]),
            new_snapshot_id=data.get("new_snapshot_id"),
            action_results=[
                ActionResult.from_dict(result) for result in data.get("action_results", [])
            ],
            errors=[ActionIssue.from_dict(err) for err in data.get("errors", [])],
        )


def validate_action_envelope(envelope: ActionEnvelope, snapshot: NetworkSnapshot) -> ActionResult:
    errors: list[ActionIssue] = []

    _validate_envelope_fields(envelope, errors)

    if isinstance(envelope.action_type, str) and envelope.action_type not in ACTION_TYPES:
        errors.append(
            ActionIssue(
                code="unknown_action_type",
                message=(
                    "Unrecognized action_type. " f"Expected one of: {', '.join(ACTION_TYPES)}."
                ),
                path="action_type",
            )
        )

    if isinstance(envelope.payload, dict) and envelope.action_type in ACTION_TYPES:
        _validate_payload_required_keys(envelope.action_type, envelope.payload, errors)
        _validate_payload_values(envelope.action_type, envelope.payload, errors)
        _validate_referential_integrity(envelope.action_type, envelope.payload, snapshot, errors)

    status = "accepted" if not errors else "rejected"
    return ActionResult(
        status=status,
        action_id=envelope.action_id,
        parent_snapshot_id=envelope.parent_snapshot_id,
        errors=errors,
        warnings=[],
    )


def _validate_envelope_fields(envelope: ActionEnvelope, errors: list[ActionIssue]) -> None:
    required_fields = [
        ("action_id", envelope.action_id, str),
        ("parent_snapshot_id", envelope.parent_snapshot_id, str),
        ("action_type", envelope.action_type, str),
        ("payload", envelope.payload, dict),
        ("created_at", envelope.created_at, str),
    ]

    for field_name, value, expected_type in required_fields:
        if value is None:
            errors.append(
                ActionIssue(
                    code="missing_field",
                    message=f"Missing required field: {field_name}.",
                    path=field_name,
                )
            )
            continue
        if not isinstance(value, expected_type):
            errors.append(
                ActionIssue(
                    code="invalid_type",
                    message=(f"Expected {field_name} to be {expected_type.__name__}."),
                    path=field_name,
                )
            )

    if envelope.actor is not None and not isinstance(envelope.actor, str):
        errors.append(
            ActionIssue(
                code="invalid_type",
                message="Expected actor to be a string.",
                path="actor",
            )
        )

    if envelope.schema_version is not None and not isinstance(envelope.schema_version, str | int):
        errors.append(
            ActionIssue(
                code="invalid_type",
                message="Expected schema_version to be a string or int.",
                path="schema_version",
            )
        )


def _validate_payload_required_keys(
    action_type: str,
    payload: dict[str, Any],
    errors: list[ActionIssue],
) -> None:
    required_keys = ACTION_REQUIRED_PAYLOAD_KEYS.get(action_type, [])
    for key in required_keys:
        if key not in payload:
            errors.append(
                ActionIssue(
                    code="missing_payload_key",
                    message=f"Missing required payload key: {key}.",
                    path=f"payload.{key}",
                )
            )

    if action_type == "create_node" and "node_type" in payload:
        node_type_value = payload["node_type"]
        if not isinstance(node_type_value, str):
            errors.append(
                ActionIssue(
                    code="invalid_type",
                    message="node_type must be a string.",
                    path="payload.node_type",
                )
            )
            return
        if node_type_value not in NODE_TYPE_REQUIRED_PAYLOAD_KEYS:
            errors.append(
                ActionIssue(
                    code="invalid_value",
                    message=(
                        "node_type must be one of: "
                        f"{', '.join(NODE_TYPE_REQUIRED_PAYLOAD_KEYS.keys())}."
                    ),
                    path="payload.node_type",
                )
            )
            return
        for key in NODE_TYPE_REQUIRED_PAYLOAD_KEYS[node_type_value]:
            if key not in payload:
                errors.append(
                    ActionIssue(
                        code="missing_payload_key",
                        message=f"Missing required payload key: {key}.",
                        path=f"payload.{key}",
                    )
                )


def _validate_payload_values(
    action_type: str,
    payload: dict[str, Any],
    errors: list[ActionIssue],
) -> None:
    if action_type == "create_branch" and "branch_kind" in payload:
        branch_kind = payload["branch_kind"]
        if not isinstance(branch_kind, str):
            errors.append(
                ActionIssue(
                    code="invalid_type",
                    message="branch_kind must be a string.",
                    path="payload.branch_kind",
                )
            )

    if action_type == "set_in_service" and "in_service" in payload:
        if not isinstance(payload["in_service"], bool):
            errors.append(
                ActionIssue(
                    code="invalid_type",
                    message="in_service must be a boolean.",
                    path="payload.in_service",
                )
            )


def _validate_referential_integrity(
    action_type: str,
    payload: dict[str, Any],
    snapshot: NetworkSnapshot,
    errors: list[ActionIssue],
) -> None:
    graph = snapshot.graph

    if action_type == "set_in_service":
        entity_id = payload.get("entity_id")
        if isinstance(entity_id, str) and entity_id not in _entity_ids(graph):
            errors.append(
                ActionIssue(
                    code="unknown_entity",
                    message=f"Entity '{entity_id}' does not exist in snapshot.",
                    path="payload.entity_id",
                )
            )

    if action_type == "create_branch":
        from_node_id = payload.get("from_node_id")
        to_node_id = payload.get("to_node_id")
        if isinstance(from_node_id, str) and from_node_id not in graph.nodes:
            errors.append(
                ActionIssue(
                    code="unknown_node",
                    message=(f"from_node_id '{from_node_id}' does not exist in snapshot."),
                    path="payload.from_node_id",
                )
            )
        if isinstance(to_node_id, str) and to_node_id not in graph.nodes:
            errors.append(
                ActionIssue(
                    code="unknown_node",
                    message=f"to_node_id '{to_node_id}' does not exist in snapshot.",
                    path="payload.to_node_id",
                )
            )


def _entity_ids(graph: NetworkGraph) -> set[str]:
    return set(graph.branches) | set(graph.inverter_sources)
