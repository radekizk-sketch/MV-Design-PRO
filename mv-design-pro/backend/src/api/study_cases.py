"""
Study Cases API — P10 FULL MAX

REST API endpoints for study case management.
Implements full CRUD, clone, compare, and status management.

All responses use Polish error messages for UI consistency.
"""

from __future__ import annotations

from collections.abc import Callable
from infrastructure.persistence.unit_of_work import UnitOfWork

from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.study_case import (
    StudyCaseNotFoundError,
    StudyCaseService,
)
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/study-cases", tags=["study-cases"])


# =============================================================================
# Request/Response Models
# =============================================================================


class CreateStudyCaseRequest(BaseModel):
    """Request to create a new study case."""

    project_id: str = Field(..., description="ID projektu")
    name: str = Field(..., min_length=1, max_length=255, description="Nazwa przypadku")
    description: str = Field("", max_length=1000, description="Opis")
    config: dict[str, Any] | None = Field(None, description="Konfiguracja obliczeń")
    set_active: bool = Field(False, description="Ustaw jako aktywny")


class UpdateStudyCaseRequest(BaseModel):
    """Request to update a study case."""

    name: str | None = Field(None, min_length=1, max_length=255, description="Nowa nazwa")
    description: str | None = Field(None, max_length=1000, description="Nowy opis")
    config: dict[str, Any] | None = Field(None, description="Nowa konfiguracja")


class CloneStudyCaseRequest(BaseModel):
    """Request to clone a study case."""

    new_name: str | None = Field(None, min_length=1, max_length=255, description="Nazwa klonu")


class SetActiveRequest(BaseModel):
    """Request to set active case."""

    project_id: str = Field(..., description="ID projektu")
    case_id: str = Field(..., description="ID przypadku do aktywacji")


class CompareRequest(BaseModel):
    """Request to compare two cases."""

    case_a_id: str = Field(..., description="ID pierwszego przypadku")
    case_b_id: str = Field(..., description="ID drugiego przypadku")


class StudyCaseResponse(BaseModel):
    """Study case response model."""

    id: str
    project_id: str
    name: str
    description: str
    config: dict[str, Any]
    result_status: str
    results_valid: bool  # PR-4: explicit validity flag
    is_active: bool
    revision: int
    created_at: str
    updated_at: str


class StudyCaseListItemResponse(BaseModel):
    """Study case list item response."""

    id: str
    name: str
    description: str
    result_status: str
    results_valid: bool  # PR-4: explicit validity flag
    is_active: bool
    updated_at: str


class StudyCaseComparisonResponse(BaseModel):
    """Study case comparison response."""

    case_a_id: str
    case_b_id: str
    case_a_name: str
    case_b_name: str
    config_differences: list[dict[str, Any]]
    status_a: str
    status_b: str


class ErrorResponse(BaseModel):
    """Error response model."""

    detail: str
    code: str | None = None


class ProtectionConfigRequest(BaseModel):
    """Request to update protection configuration (P14c)."""

    template_ref: str | None = Field(None, description="ID szablonu nastaw zabezpieczeń")
    template_fingerprint: str | None = Field(None, description="Fingerprint szablonu (dla audytu)")
    library_manifest_ref: dict[str, Any] | None = Field(
        None, description="Referencja do manifestu biblioteki"
    )
    overrides: dict[str, Any] = Field(default_factory=dict, description="Nadpisane wartości nastaw")


class ProtectionConfigResponse(BaseModel):
    """Protection configuration response (P14c)."""

    template_ref: str | None
    template_fingerprint: str | None
    library_manifest_ref: dict[str, Any] | None
    overrides: dict[str, Any]
    bound_at: str | None


# =============================================================================
# Helper Functions
# =============================================================================


def _build_service(uow_factory: Any) -> StudyCaseService:
    """Build the study case service."""
    return StudyCaseService(uow_factory)


def _parse_uuid(value: str, field_name: str = "id") -> UUID:
    """Parse and validate a UUID string."""
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} musi być poprawnym UUID",
        ) from exc


# =============================================================================
# CRUD Endpoints
# =============================================================================


@router.post("", response_model=StudyCaseResponse, status_code=status.HTTP_201_CREATED)
def create_study_case(
    request: CreateStudyCaseRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Utwórz nowy przypadek obliczeniowy.

    POST /api/study-cases
    """
    project_id = _parse_uuid(request.project_id, "project_id")
    service = _build_service(uow_factory)

    case = service.create_case(
        project_id=project_id,
        name=request.name,
        description=request.description,
        config=request.config,
        set_active=request.set_active,
    )

    return case.to_dict()


@router.get("/{case_id}", response_model=StudyCaseResponse)
def get_study_case(
    case_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Pobierz przypadek obliczeniowy po ID.

    GET /api/study-cases/{case_id}
    """
    parsed_id = _parse_uuid(case_id, "case_id")
    service = _build_service(uow_factory)

    try:
        case = service.get_case(parsed_id)
        return case.to_dict()
    except StudyCaseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get("/project/{project_id}", response_model=list[StudyCaseListItemResponse])
def list_study_cases(
    project_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> list[dict[str, Any]]:
    """
    Lista wszystkich przypadków obliczeniowych w projekcie.

    GET /api/study-cases/project/{project_id}
    """
    parsed_id = _parse_uuid(project_id, "project_id")
    service = _build_service(uow_factory)

    cases = service.list_cases(parsed_id)
    return [case.to_dict() for case in cases]


@router.patch("/{case_id}", response_model=StudyCaseResponse)
def update_study_case(
    case_id: str,
    request: UpdateStudyCaseRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Aktualizuj przypadek obliczeniowy.

    Zmiana konfiguracji oznacza wyniki jako OUTDATED.

    PATCH /api/study-cases/{case_id}
    """
    parsed_id = _parse_uuid(case_id, "case_id")
    service = _build_service(uow_factory)

    try:
        case = service.update_case(
            case_id=parsed_id,
            name=request.name,
            description=request.description,
            config=request.config,
        )
        return case.to_dict()
    except StudyCaseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_study_case(
    case_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> Response:
    """
    Usuń przypadek obliczeniowy.

    DELETE /api/study-cases/{case_id}
    """
    parsed_id = _parse_uuid(case_id, "case_id")
    service = _build_service(uow_factory)

    if not service.delete_case(parsed_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Przypadek obliczeniowy nie istnieje: {case_id}",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# =============================================================================
# Clone Endpoint
# =============================================================================


@router.post(
    "/{case_id}/clone", response_model=StudyCaseResponse, status_code=status.HTTP_201_CREATED
)
def clone_study_case(
    case_id: str,
    request: CloneStudyCaseRequest | None = None,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Klonuj przypadek obliczeniowy.

    Konfiguracja jest kopiowana, wyniki NIE są kopiowane.
    Sklonowany przypadek ma status NONE i nie jest aktywny.

    POST /api/study-cases/{case_id}/clone
    """
    parsed_id = _parse_uuid(case_id, "case_id")
    service = _build_service(uow_factory)

    new_name = request.new_name if request else None

    try:
        cloned = service.clone_case(parsed_id, new_name)
        return cloned.to_dict()
    except StudyCaseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


# =============================================================================
# Active Case Endpoints
# =============================================================================


@router.get("/project/{project_id}/active", response_model=StudyCaseResponse | None)
def get_active_case(
    project_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any] | None:
    """
    Pobierz aktywny przypadek obliczeniowy dla projektu.

    GET /api/study-cases/project/{project_id}/active
    """
    parsed_id = _parse_uuid(project_id, "project_id")
    service = _build_service(uow_factory)

    case = service.get_active_case(parsed_id)
    return case.to_dict() if case else None


@router.post("/activate", response_model=StudyCaseResponse)
def set_active_case(
    request: SetActiveRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Ustaw przypadek jako aktywny.

    Dezaktywuje wszystkie inne przypadki w projekcie.

    POST /api/study-cases/activate
    """
    project_id = _parse_uuid(request.project_id, "project_id")
    case_id = _parse_uuid(request.case_id, "case_id")
    service = _build_service(uow_factory)

    try:
        case = service.set_active_case(project_id, case_id)
        return case.to_dict()
    except StudyCaseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


# =============================================================================
# Compare Endpoint
# =============================================================================


@router.post("/compare", response_model=StudyCaseComparisonResponse)
def compare_study_cases(
    request: CompareRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Porównaj dwa przypadki obliczeniowe.

    Operacja 100% read-only — brak mutacji.

    POST /api/study-cases/compare
    """
    case_a_id = _parse_uuid(request.case_a_id, "case_a_id")
    case_b_id = _parse_uuid(request.case_b_id, "case_b_id")
    service = _build_service(uow_factory)

    try:
        comparison = service.compare_cases(case_a_id, case_b_id)
        return comparison.to_dict()
    except StudyCaseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


# =============================================================================
# Status Management Endpoints
# =============================================================================


@router.post("/project/{project_id}/invalidate-all")
def invalidate_all_cases(
    project_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Oznacz wszystkie przypadki jako OUTDATED.

    Wywoływane po zmianie NetworkModel.

    POST /api/study-cases/project/{project_id}/invalidate-all
    """
    parsed_id = _parse_uuid(project_id, "project_id")
    service = _build_service(uow_factory)

    count = service.mark_all_outdated(parsed_id)
    return {
        "message": f"Oznaczono {count} przypadków jako nieaktualne",
        "affected_count": count,
    }


@router.post("/{case_id}/invalidate")
def invalidate_case(
    case_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Oznacz przypadek jako OUTDATED.

    Wywoływane po zmianie konfiguracji przypadku.

    POST /api/study-cases/{case_id}/invalidate
    """
    parsed_id = _parse_uuid(case_id, "case_id")
    service = _build_service(uow_factory)

    if service.mark_case_outdated(parsed_id):
        return {"message": "Przypadek oznaczony jako nieaktualny", "result_status": "OUTDATED"}
    return {"message": "Przypadek nie wymaga aktualizacji statusu", "result_status": "unchanged"}


@router.get("/{case_id}/can-calculate")
def can_calculate_case(
    case_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Sprawdź czy przypadek może być obliczony.

    GET /api/study-cases/{case_id}/can-calculate
    """
    parsed_id = _parse_uuid(case_id, "case_id")
    service = _build_service(uow_factory)

    can_calc, error = service.can_calculate(parsed_id)
    return {
        "can_calculate": can_calc,
        "error": error,
    }


@router.get("/project/{project_id}/count")
def count_cases(
    project_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Policz przypadki obliczeniowe w projekcie.

    GET /api/study-cases/project/{project_id}/count
    """
    parsed_id = _parse_uuid(project_id, "project_id")
    service = _build_service(uow_factory)

    count = service.count_cases(parsed_id)
    return {"count": count}


# =============================================================================
# Protection Configuration Endpoints (P14c)
# =============================================================================


@router.get("/{case_id}/protection-config", response_model=ProtectionConfigResponse)
def get_protection_config(
    case_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Pobierz konfigurację zabezpieczeń dla przypadku (P14c).

    GET /api/study-cases/{case_id}/protection-config
    """
    parsed_id = _parse_uuid(case_id, "case_id")
    service = _build_service(uow_factory)

    try:
        case = service.get_case(parsed_id)
        return case.protection_config.to_dict()
    except StudyCaseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.put("/{case_id}/protection-config", response_model=ProtectionConfigResponse)
def update_protection_config(
    case_id: str,
    request: ProtectionConfigRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Aktualizuj konfigurację zabezpieczeń dla przypadku (P14c).

    Walidacje:
    - template_ref musi istnieć w katalogu (jeśli podane)
    - template_fingerprint powinien być zgodny z aktualnym eksportem (ostrzeżenie, nie błąd)

    PUT /api/study-cases/{case_id}/protection-config
    """
    parsed_id = _parse_uuid(case_id, "case_id")
    service = _build_service(uow_factory)

    try:
        case = service.update_protection_config(
            case_id=parsed_id,
            template_ref=request.template_ref,
            template_fingerprint=request.template_fingerprint,
            library_manifest_ref=request.library_manifest_ref,
            overrides=request.overrides,
        )
        return case.protection_config.to_dict()
    except StudyCaseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        # Validation error (e.g., template_ref doesn't exist)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
