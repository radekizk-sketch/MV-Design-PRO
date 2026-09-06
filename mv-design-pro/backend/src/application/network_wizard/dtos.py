from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from domain.validation import ValidationReport


@dataclass(frozen=True)
class NodePayload:
    name: str
    node_type: str
    base_kv: float
    attrs: dict[str, Any] = field(default_factory=dict)
    id: UUID | None = None


@dataclass(frozen=True)
class BusPayload:
    name: str
    bus_type: str
    base_kv: float
    attrs: dict[str, Any] = field(default_factory=dict)
    id: UUID | None = None

    @property
    def node_type(self) -> str:
        return self.bus_type


@dataclass(frozen=True)
class BranchPayload:
    name: str
    branch_type: str
    from_node_id: UUID
    to_node_id: UUID
    in_service: bool = True
    params: dict[str, Any] = field(default_factory=dict)
    id: UUID | None = None


@dataclass(frozen=True)
class LoadPayload:
    name: str
    node_id: UUID
    payload: dict[str, Any]
    in_service: bool = True
    id: UUID | None = None


@dataclass(frozen=True)
class CasePayload:
    name: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class SourcePayload:
    name: str
    node_id: UUID
    source_type: str
    payload: dict[str, Any] = field(default_factory=dict)
    in_service: bool = True
    type_ref: UUID | None = None
    id: UUID | None = None


@dataclass(frozen=True)
class InverterSetpoint:
    p_mw: float
    q_mvar: float | None = None
    cosphi: float | None = None
    mode: str = "PQ"


@dataclass(frozen=True)
class ConverterSetpoint:
    p_mw: float
    q_mvar: float | None = None
    cosphi: float | None = None
    mode: str = "PQ"


@dataclass(frozen=True)
class GroundingPayload:
    grounding_type: str
    params: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class LimitsPayload:
    voltage_limits: dict[str, Any] = field(default_factory=dict)
    thermal_limits: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class TypePayload:
    name: str
    params: dict[str, Any]
    id: UUID | None = None


@dataclass(frozen=True)
class SwitchingStatePayload:
    element_id: UUID
    element_type: str
    in_service: bool


@dataclass(frozen=True)
class FaultSpecPayload:
    fault_type: str
    node_id: UUID | None = None
    branch_id: UUID | None = None
    position_percent: float | None = None
    cmax: float | None = None
    cmin: float | None = None


@dataclass(frozen=True)
class ImportReport:
    created: dict[str, int] = field(default_factory=dict)
    updated: dict[str, int] = field(default_factory=dict)
    skipped: dict[str, int] = field(default_factory=dict)
    errors: tuple[str, ...] = ()
    validation: ValidationReport | None = None
