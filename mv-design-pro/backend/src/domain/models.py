from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from uuid import UUID, uuid4

from domain.project_design_mode import ProjectDesignMode


class ProjectMode(str, Enum):
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
    - active_network_snapshot_id tracks the current state of the network

    LIFECYCLE:
    - Project holds reference to the active network snapshot
    - All StudyCases and Runs reference specific snapshots
    - Changing the network creates a new snapshot, invalidating results

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
    # P10a: Reference to the active (current) network snapshot
    active_network_snapshot_id: str | None = None
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


@dataclass(frozen=True)
class StudyRun:
    """
    Run — a concrete calculation execution (P10a).

    CANONICAL ALIGNMENT:
    - Run is IMMUTABLE after execution (frozen dataclass)
    - Uniquely identifies: project, case, snapshot, solver version
    - Stores input_hash for result caching/deduplication

    INVARIANTS:
    - network_snapshot_id is BINDING — Run is tied to specific snapshot
    - solver_version_hash ensures reproducibility
    - result_state tracks validity: VALID / OUTDATED
    """

    id: UUID
    project_id: UUID
    case_id: UUID
    analysis_type: str
    input_hash: str
    # P10a: BINDING reference to specific network snapshot
    network_snapshot_id: str | None = None
    # P10a: Hash of solver version for reproducibility
    solver_version_hash: str | None = None
    # P10a: Result validity state (VALID, OUTDATED)
    result_state: str = "VALID"
    status: str = "pending"
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    finished_at: datetime | None = None


def new_project(
    name: str,
    description: str | None = None,
    mode: str = "AS-IS",
    voltage_level_kv: float = 15.0,
    frequency_hz: float = 50.0,
    active_network_snapshot_id: str | None = None,
) -> Project:
    """Create a new Project (P10a)."""
    return Project(
        id=uuid4(),
        name=name,
        description=description,
        mode=mode,
        voltage_level_kv=voltage_level_kv,
        frequency_hz=frequency_hz,
        active_network_snapshot_id=active_network_snapshot_id,
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


def new_study_run(
    project_id: UUID,
    case_id: UUID,
    analysis_type: str,
    input_hash: str,
    network_snapshot_id: str | None = None,
    solver_version_hash: str | None = None,
) -> StudyRun:
    """Create a new StudyRun (P10a)."""
    return StudyRun(
        id=uuid4(),
        project_id=project_id,
        case_id=case_id,
        analysis_type=analysis_type,
        input_hash=input_hash,
        network_snapshot_id=network_snapshot_id,
        solver_version_hash=solver_version_hash,
    )
