"""
SLD Data Transfer Objects.

PowerFactory Alignment (per sld_rules.md, wizard_screens.md, ui_canonical_parity.md):
- Operating modes: MODEL_EDIT, CASE_CONFIG, RESULT_VIEW
- Result freshness: NONE, FRESH, OUTDATED
- Visual states: in_service (gray when False)
- Switch states: OPEN/CLOSED with type variants
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any
from uuid import UUID


class SldOperatingMode(StrEnum):
    """
    SLD operating mode (per wizard_screens.md § 1.2, sld_rules.md § C).

    MODEL_EDIT: Full topology editing allowed
    CASE_CONFIG: Read-only model, case configuration only
    RESULT_VIEW: Read-only, results overlay active
    """

    MODEL_EDIT = "MODEL_EDIT"
    CASE_CONFIG = "CASE_CONFIG"
    RESULT_VIEW = "RESULT_VIEW"


class SldResultStatus(StrEnum):
    """
    Result freshness status (per ui_canonical_parity.md § B.2).

    NONE: Never computed
    FRESH: Results current with model
    OUTDATED: Model changed since computation
    """

    NONE = "NONE"
    FRESH = "FRESH"
    OUTDATED = "OUTDATED"


@dataclass(frozen=True)
class SldNodeSymbolDTO:
    """Bus/node symbol with position and overlay."""

    id: UUID
    node_id: UUID
    x: float
    y: float
    label: str | None = None
    in_service: bool = True  # Visual state: gray/dashed if False
    overlay: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "node_id": str(self.node_id),
            "x": self.x,
            "y": self.y,
            "label": self.label,
            "in_service": self.in_service,
            "overlay": self.overlay,
        }


@dataclass(frozen=True)
class SldBranchSymbolDTO:
    """Line/cable/transformer branch symbol with position and overlay."""

    id: UUID
    branch_id: UUID
    from_node_id: UUID
    to_node_id: UUID
    points: tuple[tuple[float, float], ...] = ()
    in_service: bool = True  # Visual state: gray/dashed if False
    overlay: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "branch_id": str(self.branch_id),
            "from_node_id": str(self.from_node_id),
            "to_node_id": str(self.to_node_id),
            "points": [{"x": x, "y": y} for x, y in self.points],
            "in_service": self.in_service,
            "overlay": self.overlay,
        }


@dataclass(frozen=True)
class SldSwitchSymbolDTO:
    """
    Switch symbol with type and state (per sld_rules.md § A.2, § D.2).

    PowerFactory Alignment:
    - switch_type: BREAKER, DISCONNECTOR, LOAD_SWITCH, FUSE
    - state: OPEN (disconnected symbol) or CLOSED (connected symbol)
    - in_service: False = gray/dashed (excluded from calculations)

    Bijection: Each SldSwitchSymbolDTO corresponds to exactly ONE Switch.
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
    overlay: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
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
            "overlay": self.overlay,
        }


@dataclass(frozen=True)
class SldAnnotationDTO:
    """Text annotation (pure presentation, no electrical semantics)."""

    id: UUID
    text: str
    x: float
    y: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "text": self.text,
            "x": self.x,
            "y": self.y,
        }


@dataclass(frozen=True)
class SldDiagramDTO:
    """
    Complete SLD diagram with mode and result status.

    PowerFactory Alignment (per sld_rules.md § C, ui_canonical_parity.md § B):
    - mode: Controls allowed actions (MODEL_EDIT, CASE_CONFIG, RESULT_VIEW)
    - result_status: Controls overlay visibility (NONE, FRESH, OUTDATED)

    Action gating by mode:
    - MODEL_EDIT: drag, delete, create, connect ALLOWED
    - CASE_CONFIG: properties READ-ONLY, no topology changes
    - RESULT_VIEW: all BLOCKED except view-only context menu
    """

    id: UUID
    name: str
    nodes: tuple[SldNodeSymbolDTO, ...] = ()
    branches: tuple[SldBranchSymbolDTO, ...] = ()
    switches: tuple[SldSwitchSymbolDTO, ...] = ()
    annotations: tuple[SldAnnotationDTO, ...] = ()
    dirty_flag: bool = False
    mode: SldOperatingMode = SldOperatingMode.MODEL_EDIT
    result_status: SldResultStatus = SldResultStatus.NONE

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "name": self.name,
            "nodes": [node.to_dict() for node in self.nodes],
            "branches": [branch.to_dict() for branch in self.branches],
            "switches": [switch.to_dict() for switch in self.switches],
            "annotations": [annotation.to_dict() for annotation in self.annotations],
            "dirty_flag": self.dirty_flag,
            "mode": self.mode.value,
            "result_status": self.result_status.value,
        }
