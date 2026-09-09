from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from domain.project_design_mode import ProjectDesignMode


class ProjectMode(StrEnum):
    """Tryb projektu - AS-IS (weryfikacja) vs TO-BE (projektowanie)."""

    AS_IS = "AS-IS"
    TO_BE = "TO-BE"


@dataclass(frozen=True)
class Project:
    """
    Project — root aggregate for MV-DESIGN-PRO (P10a).

    CANONICAL ALIGNMENT:
    - Project is the top-level container for NetworkModel, StudyCases, and Runs
    - One Project = One NetworkModel (invariant from SYSTEM_SPEC.md)
    - Model sieci projektu żyje w magazynie ENM pod kluczem projektu (W1: bez migawek
      legacy); zmiana modelu podnosi rewizję ENM, a biegi niosą rewizję w kopercie

    Full target schema with:
    - mode: AS-IS (weryfikacja istniejącej sieci) vs TO-BE (projektowanie nowej)
    - voltage_level_kv: Poziom napięcia sieci
    - frequency_hz: Częstotliwość sieci (50 lub 60 Hz)
    - deleted_at: Soft delete (null = aktywny)
    """

    id: UUID
    name: str
    description: str | None = None
    schema_version: str = "1.0"
    # Project mode: AS-IS vs TO-BE
    mode: str = "AS-IS"
    # Network parameters
    voltage_level_kv: float = 15.0
    frequency_hz: float = 50.0
    # BoundaryNode (Point of Common Coupling)
    connection_node_id: UUID | None = None
    connection_description: str | None = None
    # Ownership
    owner_id: UUID | None = None
    # Timestamps
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    # Soft delete
    deleted_at: datetime | None = None


@dataclass(frozen=True)
class Network:
    id: UUID
    project_id: UUID
    name: str
    revision: int = 1
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True)
class OperatingCase:
    id: UUID
    project_id: UUID
    name: str
    case_payload: dict
    project_design_mode: ProjectDesignMode | None = None
    revision: int = 1
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True)
class StudyCase:
    id: UUID
    project_id: UUID
    name: str
    study_payload: dict
    revision: int = 1
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True)
class Scenario:
    id: UUID
    project_id: UUID
    name: str
    metadata: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


def new_project(
    name: str,
    description: str | None = None,
    mode: str = "AS-IS",
    voltage_level_kv: float = 15.0,
    frequency_hz: float = 50.0,
) -> Project:
    """Create a new Project (P10a)."""
    return Project(
        id=uuid4(),
        name=name,
        description=description,
        mode=mode,
        voltage_level_kv=voltage_level_kv,
        frequency_hz=frequency_hz,
    )


def new_network(project_id: UUID, name: str) -> Network:
    return Network(id=uuid4(), project_id=project_id, name=name)


def new_operating_case(
    project_id: UUID,
    name: str,
    case_payload: dict,
    project_design_mode: ProjectDesignMode | None = None,
) -> OperatingCase:
    return OperatingCase(
        id=uuid4(),
        project_id=project_id,
        name=name,
        case_payload=case_payload,
        project_design_mode=project_design_mode,
    )


def new_study_case(project_id: UUID, name: str, study_payload: dict) -> StudyCase:
    return StudyCase(id=uuid4(), project_id=project_id, name=name, study_payload=study_payload)


def new_scenario(project_id: UUID, name: str, metadata: dict | None = None) -> Scenario:
    return Scenario(id=uuid4(), project_id=project_id, name=name, metadata=metadata or {})
