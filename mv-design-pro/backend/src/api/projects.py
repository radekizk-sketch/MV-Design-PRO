"""
Projects API — zarządzanie projektami MV-DESIGN PRO.

Endpointy:
  GET    /api/projects           - lista projektów
  POST   /api/projects           - utwórz projekt
  GET    /api/projects/{id}      - pobierz projekt
  DELETE /api/projects/{id}      - usuń projekt (soft delete)

Persistencja SQLAlchemy z pełnym docelowym schematem:
- mode: AS-IS (weryfikacja) vs TO-BE (projektowanie)
- voltage_level_kv: Poziom napięcia sieci
- frequency_hz: Częstotliwość sieci (50/60 Hz)
- Soft delete (deleted_at)
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID

from api.dependencies import get_uow_factory
from domain.models import new_project
from fastapi import APIRouter, Depends, HTTPException, status
from infrastructure.persistence.unit_of_work import UnitOfWork
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/api/projects", tags=["projects"])


# =============================================================================
# Pydantic Schemas
# =============================================================================


class ProjectMode(StrEnum):
    """Tryb projektu - AS-IS (weryfikacja) vs TO-BE (projektowanie)."""

    AS_IS = "AS-IS"
    TO_BE = "TO-BE"


class ProjectCreate(BaseModel):
    """Request body for POST /api/projects"""

    name: str = Field(..., min_length=1, max_length=255, description="Nazwa projektu")
    description: str | None = Field(None, max_length=1000, description="Opis projektu")
    mode: ProjectMode = Field(default=ProjectMode.AS_IS, description="Tryb projektu")
    voltage_level_kv: float = Field(default=15.0, gt=0, description="Poziom napięcia sieci [kV]")
    frequency_hz: float = Field(default=50.0, description="Częstotliwość sieci [Hz]")

    @field_validator("frequency_hz")
    @classmethod
    def frequency_must_be_valid(cls, v: float) -> float:
        if v not in (50.0, 60.0):
            raise ValueError("Częstotliwość musi wynosić 50.0 lub 60.0 Hz")
        return v

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Nazwa projektu nie może być pusta")
        return v.strip()


class ProjectUpdate(BaseModel):
    """Request body for PATCH /api/projects/{project_id}."""

    name: str | None = Field(None, min_length=1, max_length=255, description="Nazwa projektu")
    description: str | None = Field(None, max_length=1000, description="Opis projektu")
    mode: ProjectMode | None = Field(None, description="Tryb projektu")
    voltage_level_kv: float | None = Field(None, gt=0, description="Poziom napięcia sieci [kV]")
    frequency_hz: float | None = Field(None, description="Częstotliwość sieci [Hz]")

    @field_validator("frequency_hz")
    @classmethod
    def frequency_must_be_valid(cls, v: float | None) -> float | None:
        if v is not None and v not in (50.0, 60.0):
            raise ValueError("Częstotliwość musi wynosić 50.0 lub 60.0 Hz")
        return v

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("Nazwa projektu nie może być pusta")
        return v.strip() if v is not None else None


class ProjectResponse(BaseModel):
    """Response body — pojedynczy projekt"""

    id: UUID
    name: str
    description: str | None = None
    mode: str
    voltage_level_kv: float
    frequency_hz: float
    connection_node_id: UUID | None = None
    connection_description: str | None = None
    owner_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    """Response body — lista projektów"""

    projects: list[ProjectResponse]
    total: int


# =============================================================================
# Exceptions
# =============================================================================


class ProjectNotFoundError(Exception):
    """Projekt nie został znaleziony."""

    def __init__(self, project_id: UUID):
        self.project_id = project_id
        super().__init__(f"Projekt {project_id} nie został znaleziony")


class ProjectHasDependenciesError(Exception):
    """Projekt ma zależne obiekty i nie może być usunięty."""

    def __init__(self, project_id: UUID):
        self.project_id = project_id
        super().__init__(
            f"Projekt {project_id} posiada zależne obiekty "
            f"(warianty/przypadki/obliczenia). Usuń je najpierw."
        )


# =============================================================================
# Endpointy
# =============================================================================


@router.get("", response_model=ProjectListResponse)
def list_projects(
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> ProjectListResponse:
    """
    Zwraca listę wszystkich aktywnych projektów.

    GET /api/projects
    """
    with uow_factory() as uow:
        projects_orm = uow.projects.list_all_orm()
        projects = [
            ProjectResponse(
                id=p.id,
                name=p.name,
                description=p.description,
                mode=p.mode,
                voltage_level_kv=float(p.voltage_level_kv),
                frequency_hz=float(p.frequency_hz),
                connection_node_id=p.connection_node_id,
                connection_description=p.connection_description,
                owner_id=p.owner_id,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
            for p in projects_orm
        ]
        return ProjectListResponse(projects=projects, total=len(projects))


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> ProjectResponse:
    """
    Tworzy nowy projekt.

    POST /api/projects
    """
    with uow_factory() as uow:
        project = new_project(
            name=body.name,
            description=body.description,
            mode=body.mode.value,
            voltage_level_kv=body.voltage_level_kv,
            frequency_hz=body.frequency_hz,
        )
        orm = uow.projects.add(project, commit=False)
        uow.commit()

        return ProjectResponse(
            id=orm.id,
            name=orm.name,
            description=orm.description,
            mode=orm.mode,
            voltage_level_kv=float(orm.voltage_level_kv),
            frequency_hz=float(orm.frequency_hz),
            connection_node_id=orm.connection_node_id,
            connection_description=orm.connection_description,
            owner_id=orm.owner_id,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> ProjectResponse:
    """
    Pobiera projekt po ID.

    GET /api/projects/{project_id}
    """
    with uow_factory() as uow:
        orm = uow.projects.get_orm(project_id)
        if orm is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Projekt nie istnieje: {project_id}",
            )
        return ProjectResponse(
            id=orm.id,
            name=orm.name,
            description=orm.description,
            mode=orm.mode,
            voltage_level_kv=float(orm.voltage_level_kv),
            frequency_hz=float(orm.frequency_hz),
            connection_node_id=orm.connection_node_id,
            connection_description=orm.connection_description,
            owner_id=orm.owner_id,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> ProjectResponse:
    """
    Aktualizuje metadane projektu.

    PATCH /api/projects/{project_id}
    """
    with uow_factory() as uow:
        project = uow.projects.get(project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Projekt nie istnieje: {project_id}",
            )

        updated = replace(
            project,
            name=body.name if body.name is not None else project.name,
            description=(
                body.description if "description" in body.model_fields_set else project.description
            ),
            mode=body.mode.value if body.mode is not None else project.mode,
            voltage_level_kv=(
                body.voltage_level_kv
                if body.voltage_level_kv is not None
                else project.voltage_level_kv
            ),
            frequency_hz=(
                body.frequency_hz if body.frequency_hz is not None else project.frequency_hz
            ),
            updated_at=datetime.now(UTC),
        )
        uow.projects.update(updated, commit=False)
        uow.commit()

        orm = uow.projects.get_orm(project_id)
        if orm is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Projekt nie istnieje: {project_id}",
            )
        return ProjectResponse(
            id=orm.id,
            name=orm.name,
            description=orm.description,
            mode=orm.mode,
            voltage_level_kv=float(orm.voltage_level_kv),
            frequency_hz=float(orm.frequency_hz),
            connection_node_id=orm.connection_node_id,
            connection_description=orm.connection_description,
            owner_id=orm.owner_id,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_project(
    project_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
):
    """
    Usuwa projekt (soft delete).

    DELETE /api/projects/{project_id}

    Jeśli projekt ma zależne obiekty (przypadki, obliczenia), zwraca 409 Conflict.
    """
    with uow_factory() as uow:
        # Check if project exists
        orm = uow.projects.get_orm(project_id)
        if orm is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Projekt nie istnieje: {project_id}",
            )

        # Check for dependencies
        if uow.projects.has_dependencies(project_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Projekt {project_id} posiada zależne obiekty "
                f"(warianty/przypadki/obliczenia). Usuń je najpierw.",
            )

        # Soft delete
        uow.projects.soft_delete(project_id, commit=False)
        uow.commit()
