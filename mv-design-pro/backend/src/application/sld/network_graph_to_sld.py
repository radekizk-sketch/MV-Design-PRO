"""
NetworkGraph -> SLD Layout Adapter.

Converts domain NetworkGraph (with string IDs) into the dict format
expected by build_auto_layout_diagram (with UUID IDs).

Mapping is deterministic via uuid5 (same graph -> same UUIDs).

PowerFactory Alignment:
- Bijection: 1 SLD symbol <-> 1 NetworkModel object
- Determinism: same graph -> identical payload
- No helper/virtual nodes
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid5

from network_model.core.graph import NetworkGraph

# Fixed namespace UUID for deterministic string -> UUID mapping.
_SLD_NAMESPACE = UUID("a3f12b4c-6d78-9e01-2345-6789abcdef01")


def _to_uuid(string_id: str) -> UUID:
    """Deterministic string -> UUID5 mapping."""
    return uuid5(_SLD_NAMESPACE, string_id)


def convert_graph_to_sld_payload(
    graph: NetworkGraph,
    *,
    project_id: UUID | None = None,
) -> dict[str, Any]:
    """
    Convert NetworkGraph to dict payload for build_auto_layout_diagram.

    All string IDs from the domain model are deterministically mapped
    to UUID5 values using a fixed namespace.

    Args:
        graph: The NetworkGraph to convert.
        project_id: Optional project UUID (auto-generated if None).

    Returns:
        Dict with keys: project_id, nodes, branches, switches, connection_node_id, id_map.
        The id_map maps original string IDs to generated UUIDs for traceability.
    """
    if project_id is None:
        project_id = _to_uuid(graph.network_model_id or "default-project")

    # Build deterministic ID mapping for all elements.
    id_map: dict[str, UUID] = {}
    for nid in sorted(graph.nodes.keys()):
        id_map[nid] = _to_uuid(nid)
    for bid in sorted(graph.branches.keys()):
        id_map[bid] = _to_uuid(bid)
    for sid in sorted(graph.switches.keys()):
        id_map[sid] = _to_uuid(sid)

    # Convert nodes with voltage metadata for tier-aware layout.
    nodes: list[dict[str, Any]] = []
    for node in sorted(graph.nodes.values(), key=lambda n: n.id):
        nodes.append(
            {
                "id": id_map[node.id],
                "name": node.name,
                "node_type": node.node_type.value,
                "voltage_kv": node.voltage_level,
                "in_service": True,
            }
        )

    # Convert branches with type metadata.
    branches: list[dict[str, Any]] = []
    for branch in sorted(graph.branches.values(), key=lambda b: b.id):
        branches.append(
            {
                "id": id_map[branch.id],
                "name": branch.name,
                "branch_type": branch.branch_type.value,
                "from_node_id": id_map[branch.from_node_id],
                "to_node_id": id_map[branch.to_node_id],
                "in_service": branch.in_service,
            }
        )

    # Convert switches preserving type and state.
    switches: list[dict[str, Any]] = []
    for switch in sorted(graph.switches.values(), key=lambda s: s.id):
        switches.append(
            {
                "id": id_map[switch.id],
                "name": switch.name,
                "from_node_id": id_map[switch.from_node_id],
                "to_node_id": id_map[switch.to_node_id],
                "switch_type": switch.switch_type.value,
                "state": switch.state.value,
                "in_service": switch.in_service,
            }
        )

    # Root node = SLACK (infinite bus reference).
    connection_node_id: UUID | None = None
    try:
        slack_node = graph.get_slack_node()
        connection_node_id = id_map[slack_node.id]
    except ValueError:
        pass

    return {
        "project_id": project_id,
        "nodes": nodes,
        "branches": branches,
        "switches": switches,
        "connection_node_id": connection_node_id,
        "id_map": id_map,
    }


def build_sld_from_network_graph(
    graph: NetworkGraph,
    *,
    project_id: UUID | None = None,
    name: str = "SLD",
    x_spacing: float = 200.0,
    y_spacing: float = 150.0,
):
    """
    High-level function: NetworkGraph -> SldDiagram in one step.

    Converts the graph to SLD payload and builds a voltage-tier-aware
    auto-layout diagram with vertical (top-down) SLD orientation.

    Args:
        graph: The NetworkGraph domain model.
        project_id: Optional project UUID.
        name: Diagram name.
        x_spacing: Horizontal spacing between feeder columns [px].
        y_spacing: Vertical spacing between depth levels [px].

    Returns:
        SldDiagram with all elements positioned.
    """
    from application.sld.layout import build_auto_layout_diagram

    payload = convert_graph_to_sld_payload(graph, project_id=project_id)

    return build_auto_layout_diagram(
        project_id=payload["project_id"],
        name=name,
        nodes=payload["nodes"],
        branches=payload["branches"],
        switches=payload["switches"],
        connection_node_id=payload["connection_node_id"],
        x_spacing=x_spacing,
        y_spacing=y_spacing,
        vertical=True,
    )
