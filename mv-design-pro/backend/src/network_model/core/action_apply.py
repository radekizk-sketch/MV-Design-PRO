"""
Deterministic application of accepted ActionEnvelope edits to NetworkSnapshot.
"""

from __future__ import annotations

from dataclasses import replace

from .action_envelope import ActionEnvelope
from .branch import Branch, BranchType
from .graph import NetworkGraph
from .node import Node
from .snapshot import NetworkSnapshot, SnapshotMeta


def apply_action_to_snapshot(
    snapshot: NetworkSnapshot,
    action: ActionEnvelope,
) -> NetworkSnapshot:
    if action.status != "accepted":
        raise RuntimeError("ActionEnvelope must be accepted before applying.")

    graph = _clone_graph(snapshot)

    if action.action_type == "create_node":
        node = _node_from_action(action)
        graph.add_node(node)
    elif action.action_type == "create_branch":
        branch = _branch_from_action(action)
        graph.add_branch(branch)
    elif action.action_type == "set_in_service":
        _apply_in_service(graph, action)
    else:
        raise RuntimeError(f"Unsupported action_type: {action.action_type}")

    meta = SnapshotMeta.create(
        snapshot_id=str(action.action_id),
        parent_snapshot_id=snapshot.meta.snapshot_id,
        created_at=str(action.created_at),
        schema_version=snapshot.meta.schema_version,
        network_model_id=snapshot.meta.network_model_id,
    )
    return NetworkSnapshot(meta=meta, graph=graph)


def _clone_graph(snapshot: NetworkSnapshot) -> NetworkGraph:
    cloned_snapshot = NetworkSnapshot.from_dict(snapshot.to_dict())
    return cloned_snapshot.graph


def _node_from_action(action: ActionEnvelope) -> Node:
    payload = dict(action.payload)
    node_id = payload.pop("node_id", None) or payload.get("id")
    if node_id is None:
        node_id = f"node-{action.action_id}"
    payload["id"] = str(node_id)
    return Node.from_dict(payload)


def _branch_from_action(action: ActionEnvelope) -> Branch:
    payload = dict(action.payload)
    branch_id = payload.pop("branch_id", None) or payload.get("id")
    if branch_id is None:
        branch_id = f"branch-{action.action_id}"
    branch_kind = payload.get("branch_kind", "LINE")
    payload["id"] = str(branch_id)
    payload["branch_type"] = _coerce_branch_type(branch_kind)
    # Nazwa wyłącznie z ładunku akcji — gałąź bez nazwy zostaje bez nazwy (jak węzeł),
    # identyfikator nie jest nazwą (karta #144).
    return Branch.from_dict(payload)


def _coerce_branch_type(branch_kind: str) -> BranchType:
    if isinstance(branch_kind, BranchType):
        return branch_kind
    return BranchType(str(branch_kind))


def _apply_in_service(graph: NetworkGraph, action: ActionEnvelope) -> None:
    payload = action.payload
    entity_id = str(payload.get("entity_id"))
    in_service = bool(payload.get("in_service"))

    if entity_id in graph.branches:
        branch = graph.branches[entity_id]
        graph.branches[entity_id] = replace(branch, in_service=in_service)
        graph._rebuild_graph()
        return

    if entity_id in graph.inverter_sources:
        source = graph.inverter_sources[entity_id]
        graph.inverter_sources[entity_id] = replace(source, in_service=in_service)
        return

    raise RuntimeError(f"Entity '{entity_id}' not found in snapshot graph.")
