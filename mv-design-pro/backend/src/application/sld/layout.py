"""
SLD Auto-Layout Algorithm.

PowerFactory Alignment (per sld_rules.md § F.6, CANONICAL_COMPLIANCE.md):
- Deterministic: Same input → identical layout
- BFS-based hierarchical positioning from BoundaryNode/root
- Switches affect topology when CLOSED and in_service
- All elements visible (in_service=False → gray/dashed but still positioned)

Layout modes:
- horizontal (default): X=depth, Y=spread — legacy mode
- vertical (vertical=True): X=spread, Y=depth — SLD top-down mode
  Source at top, feeders descending, loads/stations at bottom.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable
from uuid import UUID, uuid5

from domain.sld import (
    SldAnnotation,
    SldBranchSymbol,
    SldDiagram,
    SldNodeSymbol,
    SldSwitchSymbol,
)


def build_auto_layout_diagram(
    *,
    project_id: UUID,
    name: str,
    nodes: Iterable[dict],
    branches: Iterable[dict],
    connection_node_id: UUID | None,
    diagram_id: UUID | None = None,
    x_spacing: float = 200.0,
    y_spacing: float = 120.0,
    annotations: Iterable[dict] | None = None,
    switches: Iterable[dict] | None = None,
    vertical: bool = False,
) -> SldDiagram:
    """
    Build deterministic auto-layout SLD diagram.

    Per sld_rules.md § F.6 (Deterministic Display):
    - Same input → identical output
    - Elements sorted by ID before processing
    - in_service=False elements are positioned but visually grayed

    Per sld_rules.md § D.2 (Switch States):
    - CLOSED switches contribute to topology (adjacency)
    - OPEN switches do not connect nodes in layout
    - Both are visible in SLD with appropriate symbols
    """
    nodes = list(nodes)
    branches = list(branches)
    switches_list = list(switches) if switches else []

    # Deterministic sorting by ID (per sld_rules.md § F.6)
    nodes.sort(key=lambda item: str(item["id"]))
    branches.sort(
        key=lambda item: (
            str(item.get("from_node_id")),
            str(item.get("to_node_id")),
            str(item.get("id")),
        )
    )
    switches_list.sort(
        key=lambda item: (
            str(item.get("from_node_id")),
            str(item.get("to_node_id")),
            str(item.get("id")),
        )
    )

    diagram_uuid = diagram_id or uuid5(project_id, f"sld:{name}")
    node_ids = [node["id"] for node in nodes]
    node_in_service = {node["id"]: node.get("in_service", True) for node in nodes}
    adjacency: dict[UUID, set[UUID]] = {node_id: set() for node_id in node_ids}

    # Build adjacency from branches (in_service only for layout)
    for branch in branches:
        if not branch.get("in_service", True):
            continue
        from_node_id = branch["from_node_id"]
        to_node_id = branch["to_node_id"]
        if from_node_id in adjacency and to_node_id in adjacency:
            adjacency[from_node_id].add(to_node_id)
            adjacency[to_node_id].add(from_node_id)

    # Build adjacency from switches (CLOSED + in_service only for layout)
    # Per ui_canonical_parity.md § C.3: Switch.OPEN interrupts topology
    for switch in switches_list:
        if not switch.get("in_service", True):
            continue
        if switch.get("state", "CLOSED") != "CLOSED":
            continue
        from_node_id = switch["from_node_id"]
        to_node_id = switch["to_node_id"]
        if from_node_id in adjacency and to_node_id in adjacency:
            adjacency[from_node_id].add(to_node_id)
            adjacency[to_node_id].add(from_node_id)

    positions = _layout_positions(
        adjacency,
        node_ids,
        connection_node_id,
        x_spacing=x_spacing,
        y_spacing=y_spacing,
        vertical=vertical,
    )

    # Create node symbols with in_service state
    node_symbols = []
    for node_id in _sorted_ids(node_ids):
        x, y = positions.get(node_id, (0.0, 0.0))
        node_symbols.append(
            SldNodeSymbol(
                id=_symbol_uuid(diagram_uuid, "node", node_id),
                node_id=node_id,
                x=x,
                y=y,
                label=_label_for_node(node_id, nodes),
                in_service=node_in_service.get(node_id, True),
            )
        )

    # Create branch symbols with in_service state
    branch_symbols = []
    for branch in branches:
        from_node_id = branch["from_node_id"]
        to_node_id = branch["to_node_id"]
        from_pos = positions.get(from_node_id, (0.0, 0.0))
        to_pos = positions.get(to_node_id, (0.0, 0.0))
        branch_symbols.append(
            SldBranchSymbol(
                id=_symbol_uuid(diagram_uuid, "branch", branch["id"]),
                branch_id=branch["id"],
                from_node_id=from_node_id,
                to_node_id=to_node_id,
                points=(from_pos, to_pos),
                in_service=branch.get("in_service", True),
            )
        )

    # Create switch symbols with type and state (per sld_rules.md § A.2, § D.2)
    # Position at midpoint between connected nodes
    switch_symbols = []
    for switch in switches_list:
        from_node_id = switch["from_node_id"]
        to_node_id = switch["to_node_id"]
        from_pos = positions.get(from_node_id, (0.0, 0.0))
        to_pos = positions.get(to_node_id, (0.0, 0.0))
        mid_x = (from_pos[0] + to_pos[0]) / 2
        mid_y = (from_pos[1] + to_pos[1]) / 2
        switch_symbols.append(
            SldSwitchSymbol(
                id=_symbol_uuid(diagram_uuid, "switch", switch["id"]),
                switch_id=switch["id"],
                from_node_id=from_node_id,
                to_node_id=to_node_id,
                switch_type=switch.get("switch_type", "BREAKER"),
                state=switch.get("state", "CLOSED"),
                x=mid_x,
                y=mid_y,
                label=switch.get("name"),
                in_service=switch.get("in_service", True),
            )
        )

    annotation_symbols = []
    if annotations:
        for annotation in annotations:
            annotation_id = annotation.get("id") or uuid5(
                diagram_uuid,
                f"annotation:{annotation.get('text','')}:{annotation.get('x')}:{annotation.get('y')}",
            )
            annotation_symbols.append(
                SldAnnotation(
                    id=UUID(str(annotation_id)),
                    text=str(annotation.get("text", "")),
                    x=float(annotation.get("x", 0.0)),
                    y=float(annotation.get("y", 0.0)),
                )
            )

    return SldDiagram(
        id=diagram_uuid,
        project_id=project_id,
        name=name,
        nodes=tuple(node_symbols),
        branches=tuple(branch_symbols),
        switches=tuple(switch_symbols),
        annotations=tuple(annotation_symbols),
        dirty_flag=False,
    )


def _layout_positions(
    adjacency: dict[UUID, set[UUID]],
    node_ids: Iterable[UUID],
    connection_node_id: UUID | None,
    *,
    x_spacing: float,
    y_spacing: float,
    vertical: bool = False,
) -> dict[UUID, tuple[float, float]]:
    ordered_ids = list(_sorted_ids(node_ids))
    visited: set[UUID] = set()
    components: list[dict[UUID, int]] = []

    if connection_node_id in adjacency:
        components.append(_bfs_levels(adjacency, connection_node_id, visited))

    for node_id in ordered_ids:
        if node_id not in visited:
            components.append(_bfs_levels(adjacency, node_id, visited))

    positions: dict[UUID, tuple[float, float]] = {}
    current_offset = 0.0
    for levels in components:
        if not levels:
            continue
        level_map: dict[int, list[UUID]] = {}
        for node_id, level in levels.items():
            level_map.setdefault(level, []).append(node_id)
        max_count = max(len(nodes) for nodes in level_map.values())
        for level in sorted(level_map):
            level_nodes = sorted(level_map[level], key=lambda item: str(item))
            for index, node_id in enumerate(level_nodes):
                if vertical:
                    # SLD mode: Y=depth (top→bottom), X=spread (left→right)
                    positions[node_id] = (
                        current_offset + index * x_spacing,
                        level * y_spacing,
                    )
                else:
                    # Legacy mode: X=depth, Y=spread
                    positions[node_id] = (
                        level * x_spacing,
                        current_offset + index * y_spacing,
                    )
        if vertical:
            current_offset += max_count * x_spacing + x_spacing
        else:
            current_offset += max_count * y_spacing + y_spacing
    return positions


def _bfs_levels(
    adjacency: dict[UUID, set[UUID]],
    start_node: UUID,
    visited: set[UUID],
) -> dict[UUID, int]:
    levels: dict[UUID, int] = {start_node: 0}
    queue: deque[UUID] = deque([start_node])
    visited.add(start_node)

    while queue:
        current = queue.popleft()
        neighbors = sorted(adjacency.get(current, set()), key=lambda item: str(item))
        for neighbor in neighbors:
            if neighbor in visited:
                continue
            visited.add(neighbor)
            levels[neighbor] = levels[current] + 1
            queue.append(neighbor)
    return levels


def _sorted_ids(node_ids: Iterable[UUID]) -> list[UUID]:
    return sorted(node_ids, key=lambda item: str(item))


def _label_for_node(node_id: UUID, nodes: Iterable[dict]) -> str | None:
    for node in nodes:
        if node.get("id") == node_id:
            return node.get("name")
    return None


def _symbol_uuid(diagram_id: UUID, prefix: str, entity_id: UUID) -> UUID:
    return uuid5(diagram_id, f"{prefix}:{entity_id}")
