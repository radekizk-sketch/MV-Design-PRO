"""
SLD Domain Models.

Canonical Alignment (per SYSTEM_SPEC.md § 9, sld_rules.md):
- Bijection: Each symbol corresponds to exactly ONE NetworkModel object
- No helper objects or virtual symbols
- in_service: visual state for grayed/dashed rendering
- Switch: type + state (OPEN/CLOSED)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID, uuid4


@dataclass(frozen=True)
class SldNodeSymbol:
    """Bus/node symbol (bijection: 1 symbol ↔ 1 Bus)."""

    id: UUID
    node_id: UUID
    x: float
    y: float
    label: str | None = None
    in_service: bool = True  # Visual state: gray/dashed if False

    def to_payload(self) -> dict:
        return {
            "id": str(self.id),
            "node_id": str(self.node_id),
            "x": self.x,
            "y": self.y,
            "label": self.label,
            "in_service": self.in_service,
        }


@dataclass(frozen=True)
class SldBranchSymbol:
    """Line/cable/transformer symbol (bijection: 1 symbol ↔ 1 Branch)."""

    id: UUID
    branch_id: UUID
    from_node_id: UUID
    to_node_id: UUID
    points: tuple[tuple[float, float], ...] = field(default_factory=tuple)
    in_service: bool = True  # Visual state: gray/dashed if False

    def to_payload(self) -> dict:
        return {
            "id": str(self.id),
            "branch_id": str(self.branch_id),
            "from_node_id": str(self.from_node_id),
            "to_node_id": str(self.to_node_id),
            "points": [{"x": x, "y": y} for x, y in self.points],
            "in_service": self.in_service,
        }


@dataclass(frozen=True)
class SldSwitchSymbol:
    """
    Switch symbol (bijection: 1 symbol ↔ 1 Switch).

    Canonical Alignment (per SYSTEM_SPEC.md § 2.4, sld_rules.md § A.2, § D.2):
    - switch_type: BREAKER, DISCONNECTOR, LOAD_SWITCH, FUSE
    - state: OPEN (disconnected) or CLOSED (connected)
    - in_service: False = element excluded from calculations but visible (grayed)
    """

    id: UUID
    switch_id: UUID
    from_node_id: UUID
    to_node_id: UUID
    switch_type: str  # BREAKER, DISCONNECTOR, LOAD_SWITCH, FUSE
    state: str  # OPEN or CLOSED
    x: float = 0.0
    y: float = 0.0
    label: str | None = None
    in_service: bool = True

    def to_payload(self) -> dict:
        return {
            "id": str(self.id),
            "switch_id": str(self.switch_id),
            "from_node_id": str(self.from_node_id),
            "to_node_id": str(self.to_node_id),
            "switch_type": self.switch_type,
            "state": self.state,
            "x": self.x,
            "y": self.y,
            "label": self.label,
            "in_service": self.in_service,
        }


@dataclass(frozen=True)
class SldAnnotation:
    id: UUID
    text: str
    x: float
    y: float

    def to_payload(self) -> dict:
        return {
            "id": str(self.id),
            "text": self.text,
            "x": self.x,
            "y": self.y,
        }


@dataclass(frozen=True)
class SldDiagram:
    """
    Complete SLD diagram.

    Bijection Invariant: Total symbols = nodes + branches + switches + sources + loads
    Each symbol corresponds to exactly ONE NetworkModel object.
    No helper or virtual symbols allowed.
    """

    id: UUID
    project_id: UUID
    name: str
    nodes: tuple[SldNodeSymbol, ...] = field(default_factory=tuple)
    branches: tuple[SldBranchSymbol, ...] = field(default_factory=tuple)
    switches: tuple[SldSwitchSymbol, ...] = field(default_factory=tuple)
    annotations: tuple[SldAnnotation, ...] = field(default_factory=tuple)
    dirty_flag: bool = False

    def to_payload(self) -> dict:
        return {
            "version": 1,
            "name": self.name,
            "nodes": [node.to_payload() for node in self.nodes],
            "branches": [branch.to_payload() for branch in self.branches],
            "switches": [switch.to_payload() for switch in self.switches],
            "annotations": [annotation.to_payload() for annotation in self.annotations],
            "dirty_flag": self.dirty_flag,
        }


def new_sld_diagram(project_id: UUID, name: str) -> SldDiagram:
    return SldDiagram(id=uuid4(), project_id=project_id, name=name)
