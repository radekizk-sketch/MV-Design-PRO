"""
Snapshot metadata and serialization helpers for NetworkGraph.

P10a ADDITIONS:
- Deterministic fingerprint (SHA-256 hash of canonical JSON)
- Snapshot is immutable and first-class object
- Fingerprint is used for result invalidation detection
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from .branch import Branch
from .graph import NetworkGraph
from .inverter import InverterSource
from .node import Node
from .switch import Switch


def _canonicalize_value(value: Any) -> Any:
    """
    Recursively canonicalize a value for deterministic JSON serialization.

    P10a: Ensures identical network state produces identical fingerprint.
    """
    if isinstance(value, dict):
        return {key: _canonicalize_value(value[key]) for key in sorted(value.keys())}
    if isinstance(value, list):
        return [_canonicalize_value(item) for item in value]
    if isinstance(value, tuple):
        return [_canonicalize_value(item) for item in value]
    if isinstance(value, set):
        return sorted((_canonicalize_value(item) for item in value), key=str)
    if isinstance(value, float):
        # Normalize floats to avoid precision issues
        if value == int(value):
            return int(value)
        return round(value, 10)
    return value


def compute_fingerprint(data: dict[str, Any]) -> str:
    """
    Compute deterministic SHA-256 fingerprint of canonical JSON.

    P10a: This fingerprint is used to detect network model changes
    and invalidate results accordingly.

    Args:
        data: Dictionary to fingerprint (typically graph data)

    Returns:
        Hex-encoded SHA-256 hash (64 characters)
    """
    canonical = _canonicalize_value(data)
    json_str = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


def runtime_fingerprint(snapshot: NetworkSnapshot) -> str:
    """
    Compute the current fingerprint from graph content.

    This ignores SnapshotMeta.fingerprint to detect in-place mutations.
    """
    return compute_fingerprint(_graph_to_dict(snapshot.graph))


class SnapshotMutationError(RuntimeError):
    """Raised when a NetworkSnapshot is mutated in-place."""


class SnapshotReadOnlyGuard:
    def __init__(self, snapshot: NetworkSnapshot, operation: str) -> None:
        self._snapshot = snapshot
        self._operation = operation
        self._fingerprint_before: str | None = None

    def __enter__(self) -> NetworkSnapshot:
        self._fingerprint_before = runtime_fingerprint(self._snapshot)
        return self._snapshot

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: object | None,
    ) -> None:
        if exc_type is None:
            fingerprint_after = runtime_fingerprint(self._snapshot)
            if fingerprint_after != self._fingerprint_before:
                raise SnapshotMutationError(
                    f"{self._operation} mutated NetworkSnapshot {self._snapshot.meta.snapshot_id}"
                )
        return None


def snapshot_read_only_guard(snapshot: NetworkSnapshot, *, operation: str) -> SnapshotReadOnlyGuard:
    """Create a guard that raises if snapshot graph mutates during an operation."""
    return SnapshotReadOnlyGuard(snapshot, operation=operation)


@dataclass(frozen=True)
class SnapshotMeta:
    """
    Backend-owned metadata for a domain snapshot (P10a).

    P10a ADDITIONS:
    - fingerprint: Deterministic SHA-256 hash of graph content
    - Used for change detection and result invalidation
    """

    snapshot_id: str
    parent_snapshot_id: str | None
    created_at: str
    schema_version: str | None = None
    network_model_id: str | None = None
    # P10a: Deterministic fingerprint of graph content
    fingerprint: str | None = None

    @classmethod
    def create(
        cls,
        *,
        snapshot_id: str | None = None,
        parent_snapshot_id: str | None = None,
        created_at: str | None = None,
        schema_version: str | None = None,
        network_model_id: str | None = None,
        fingerprint: str | None = None,
    ) -> SnapshotMeta:
        minted_snapshot_id = snapshot_id or str(uuid4())
        timestamp = created_at or datetime.now(UTC).isoformat()
        return cls(
            snapshot_id=minted_snapshot_id,
            parent_snapshot_id=parent_snapshot_id,
            created_at=timestamp,
            schema_version=schema_version,
            network_model_id=network_model_id,
            fingerprint=fingerprint,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "snapshot_id": self.snapshot_id,
            "parent_snapshot_id": self.parent_snapshot_id,
            "created_at": self.created_at,
            "schema_version": self.schema_version,
            "network_model_id": self.network_model_id,
            "fingerprint": self.fingerprint,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SnapshotMeta:
        return cls(
            snapshot_id=str(data["snapshot_id"]),
            parent_snapshot_id=data.get("parent_snapshot_id"),
            created_at=str(data["created_at"]),
            schema_version=data.get("schema_version"),
            network_model_id=data.get("network_model_id"),
            fingerprint=data.get("fingerprint"),
        )


@dataclass(frozen=True)
class NetworkSnapshot:
    """
    Immutable view of a network graph snapshot with lineage metadata (P10a).

    P10a FIRST-CLASS OBJECT:
    - Snapshot is immutable (frozen dataclass)
    - Has deterministic fingerprint for change detection
    - Used as binding reference by StudyCase and Run

    Notes:
        NetworkSnapshot is a read-only projection of a single NetworkModel.
        The associated NetworkModel identity is stored in SnapshotMeta.
    """

    meta: SnapshotMeta
    graph: NetworkGraph

    @property
    def fingerprint(self) -> str:
        """
        P10a: Get or compute deterministic fingerprint.

        If fingerprint is stored in meta, return it.
        Otherwise, compute from graph content.
        """
        if self.meta.fingerprint:
            return self.meta.fingerprint
        return compute_fingerprint(_graph_to_dict(self.graph))

    @property
    def snapshot_id(self) -> str:
        """Convenience property for snapshot_id."""
        return self.meta.snapshot_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "meta": self.meta.to_dict(),
            "graph": _graph_to_dict(self.graph),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> NetworkSnapshot:
        meta_data = data.get("meta")
        if meta_data is None:
            meta_data = {
                "snapshot_id": data.get("snapshot_id"),
                "parent_snapshot_id": data.get("parent_snapshot_id"),
                "created_at": data.get("created_at"),
                "schema_version": data.get("schema_version"),
                "network_model_id": data.get("network_model_id"),
                "fingerprint": data.get("fingerprint"),
            }
        meta = SnapshotMeta.from_dict(meta_data)
        graph = _graph_from_dict(data.get("graph", data))
        graph.network_model_id = meta.network_model_id
        return cls(meta=meta, graph=graph)


def create_network_snapshot(
    graph: NetworkGraph,
    *,
    parent_snapshot: NetworkSnapshot | None = None,
    parent_snapshot_id: str | None = None,
    snapshot_id: str | None = None,
    created_at: str | None = None,
    schema_version: str | None = None,
    network_model_id: str | None = None,
) -> NetworkSnapshot:
    """
    Create a new NetworkSnapshot with deterministic fingerprint (P10a).

    P10a: Fingerprint is computed automatically from graph content.
    """
    parent_id = parent_snapshot_id
    if parent_id is None and parent_snapshot is not None:
        parent_id = parent_snapshot.meta.snapshot_id
    resolved_model_id = network_model_id
    if resolved_model_id is None and parent_snapshot is not None:
        resolved_model_id = parent_snapshot.meta.network_model_id
    if resolved_model_id is None:
        resolved_model_id = graph.network_model_id
    if resolved_model_id is None:
        raise ValueError("NetworkModel id is required to create a snapshot.")
    graph.network_model_id = resolved_model_id

    # P10a: Compute deterministic fingerprint
    graph_dict = _graph_to_dict(graph)
    fingerprint = compute_fingerprint(graph_dict)

    meta = SnapshotMeta.create(
        snapshot_id=snapshot_id,
        parent_snapshot_id=parent_id,
        created_at=created_at,
        schema_version=schema_version,
        network_model_id=resolved_model_id,
        fingerprint=fingerprint,
    )
    return NetworkSnapshot(meta=meta, graph=graph)


def _graph_to_dict(graph: NetworkGraph) -> dict[str, Any]:
    nodes = _sorted_by_id(graph.nodes.values())
    branches = _sorted_by_id(graph.branches.values())
    inverters = _sorted_by_id(graph.inverter_sources.values())
    switches = _sorted_by_id(graph.switches.values())
    return {
        "nodes": [node.to_dict() for node in nodes],
        "branches": [branch.to_dict() for branch in branches],
        "inverter_sources": [source.to_dict() for source in inverters],
        "switches": [switch.to_dict() for switch in switches],
    }


def _graph_from_dict(data: dict[str, Any]) -> NetworkGraph:
    graph = NetworkGraph()
    for node_data in data.get("nodes", []):
        graph.add_node(Node.from_dict(node_data))
    for branch_data in data.get("branches", []):
        graph.add_branch(Branch.from_dict(branch_data))
    for source_data in data.get("inverter_sources", []):
        graph.add_inverter_source(InverterSource.from_dict(source_data))
    for switch_data in data.get("switches", []):
        graph.add_switch(Switch.from_dict(switch_data))
    return graph


def _sorted_by_id(values: Iterable[Any]) -> list[Any]:
    return sorted(values, key=lambda item: item.id)
