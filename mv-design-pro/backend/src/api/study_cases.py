"""
Study Cases API — P10 FULL MAX

REST API endpoints for study case management.
Implements full CRUD, clone and compare.

All responses use Polish error messages for UI consistency.

STATUS WYNIKOW (CV-2-W). `result_status` przypadku jest tu WYPROWADZANY z jego
biegow i biezacej rewizji modelu (`application/study_case/status_wynikow.py`),
nie odczytywany z kolumny. Slownik kontraktu HTTP bez zmian (NONE/FRESH/OUTDATED);
addytywnie kazda odpowiedz z przypadkiem niesie PRZYCZYNE statusu
(`result_status_reason`, `result_status_reason_pl`), pare rewizji
(`rewizja_biegu`, `rewizja_biezaca`) i LISTE ZMIAN, ktore uniewaznily wynik
(`zmiany_od_biegu`). Koncowki „uniewaznij” (`/invalidate-all`, `/invalidate`)
zostaly USUNIETE — nie ma juz stanu, ktory dalo by sie recznie przestawic.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.study_case import (
    StudyCaseNotFoundError,
    StudyCaseService,
)
from application.study_case.status_wynikow import pola_statusu_przypadku
from fastapi import APIRouter, Depends, HTTPException, Response, status
from infrastructure.persistence.unit_of_work import UnitOfWork
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


class ZmianaOdBieguResponse(BaseModel):
    """Jedna rewizja modelu powstala PO rewizji biegu — przyczyna nieaktualnosci."""

    rewizja: int
    operacja: str | None
    opis_pl: str
    elementy: list[str]


class StatusWynikowResponse(BaseModel):
    """Status wynikow przypadku — WYPROWADZANY, nigdy zapisywany (CV-2-W)."""

    result_status: str  # NONE / FRESH / OUTDATED (slownik kontraktu bez zmian)
    results_valid: bool  # PR-4: explicit validity flag — prawda wylacznie dla FRESH
    result_status_reason: str  # kod maszynowy przyczyny (stabilny, bez diakrytykow)
    result_status_reason_pl: str  # zdanie dla projektanta — jedyne zrodlo tekstu w UI
    rewizja_biegu: int | None  # rewizja modelu, na ktorej policzono wynik
    rewizja_biezaca: int | None  # rewizja modelu teraz
    zmiany_od_biegu: list[ZmianaOdBieguResponse]  # co uniewaznilo wynik


class StudyCaseResponse(StatusWynikowResponse):
    """Study case response model."""

    id: str
    project_id: str
    name: str
    description: str
    config: dict[str, Any]
    is_active: bool
    revision: int
    created_at: str
    updated_at: str


class StudyCaseListItemResponse(StatusWynikowResponse):
    """Study case list item response."""

    id: str
    name: str
    description: str
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


def _z_statusem(dane: dict[str, Any], uow_factory: Any) -> dict[str, Any]:
    """Doklej status wynikow do serializacji przypadku — JEDYNE miejsce w API,
    ktore go orzeka (ta sama funkcja dla pojedynczego przypadku, listy, klonu i
    aktywacji, wiec zaden ekran nie moze dostac innego werdyktu niz sasiedni)."""
    return {**dane, **pola_statusu_przypadku(dane["id"], uow_factory)}


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

    return _z_statusem(case.to_dict(), uow_factory)


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
        return _z_statusem(case.to_dict(), uow_factory)
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
    return [_z_statusem(case.to_dict(), uow_factory) for case in cases]


@router.patch("/{case_id}", response_model=StudyCaseResponse)
def update_study_case(
    case_id: str,
    request: UpdateStudyCaseRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Aktualizuj przypadek obliczeniowy.

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
        return _z_statusem(case.to_dict(), uow_factory)
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
        return _z_statusem(cloned.to_dict(), uow_factory)
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
    return _z_statusem(case.to_dict(), uow_factory) if case else None


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
        return _z_statusem(case.to_dict(), uow_factory)
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
        return {
            **comparison.to_dict(),
            # Statusy obu przypadkow z TEJ SAMEJ derywacji co kazda inna odpowiedz
            # — porownanie nie moze pokazac innego werdyktu niz lista przypadkow.
            "status_a": pola_statusu_przypadku(case_a_id, uow_factory)["result_status"],
            "status_b": pola_statusu_przypadku(case_b_id, uow_factory)["result_status"],
        }
    except StudyCaseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


# =============================================================================
# Status Endpoints
# =============================================================================


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
