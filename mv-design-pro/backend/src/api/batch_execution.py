"""Serie przebiegów (wsad) — REST API (karta BATCH-ROUTER).

Końcówki:
    POST /api/execution/study-cases/{case_id}/batches      — utwórz serię
    POST /api/execution/batches/{batch_id}/execute         — wykonaj serię
    GET  /api/execution/study-cases/{case_id}/batches      — lista serii
    GET  /api/execution/batches/{batch_id}                 — szczegóły serii

Seria = sekwencja biegów kanonicznych nad scenariuszami zwarciowymi jednego
przypadku (tor identyczny z pojedynczym biegiem ze scenariusza). Wyniki
pojedynczych biegów są dostępne istniejącymi końcówkami
(`GET /api/execution/runs/{run_id}` / `.../results`).

HISTORIA (pomiar karty BATCH-ROUTER, 2026-08-07): poprzednia wersja tego
modułu (PR-20/21, nigdy niewpięta do `main.py`) niosła 8 końcówek, z czego:
- 4 wsadowe fabrykowały wyniki (wyniki z żądania klienta zamiast solvera,
  rejestr przypadków w pamięci silnika, której produkcja nie zasila),
- 4 porównawcze były DUPLIKATEM żywej powierzchni
  `/api/short-circuit-comparisons` (rozstrzygnięcie 2026-08-06, rejestr
  długu w `scripts/route_prefix_guard.py`) — usunięte, nie wpięte.

Komunikaty błędów po polsku (spójność z UI).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.fault_scenarios import get_fault_scenario_service
from application.batch_execution_service import (
    BatchExecutionService,
    BatchNotFoundError,
    BatchNotPendingError,
)
from application.fault_scenario_service import FaultScenarioNotFoundError
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(tags=["batch-execution"])

# Serwis pamięciowy (spójnie z serwisem scenariuszy, którego serie dotyczą).
_batch_service: BatchExecutionService | None = None


def get_batch_service() -> BatchExecutionService:
    """Singleton serwisu serii — związany z serwisem scenariuszy zwarciowych."""
    global _batch_service
    if _batch_service is None:
        _batch_service = BatchExecutionService(get_fault_scenario_service())
    return _batch_service


# =============================================================================
# Modele żądań/odpowiedzi
# =============================================================================


class CreateBatchRequest(BaseModel):
    """Żądanie utworzenia serii przebiegów."""

    scenario_ids: list[str] = Field(
        ...,
        description="Identyfikatory scenariuszy zwarciowych przypadku (UUID)",
    )


class BatchResponse(BaseModel):
    """Rekord serii przebiegów."""

    batch_id: str
    study_case_id: str
    analysis_type: str
    scenario_ids: list[str]
    created_at: str
    status: str
    batch_input_hash: str
    run_ids: list[str]
    result_set_ids: list[str]
    errors: list[str]


class BatchListResponse(BaseModel):
    """Lista serii przebiegów przypadku."""

    batches: list[BatchResponse]
    count: int


# =============================================================================
# Pomocnicze
# =============================================================================


def _parse_uuid(value: str, field_name: str = "id") -> UUID:
    """Parsuj i zweryfikuj UUID; 400 z polskim komunikatem przy błędzie."""
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} musi być poprawnym UUID",
        ) from exc


# =============================================================================
# Końcówki serii
# =============================================================================


@router.post(
    "/api/execution/study-cases/{case_id}/batches",
    response_model=BatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Utwórz serię przebiegów ze scenariuszy zwarciowych",
)
def create_batch(case_id: str, request: CreateBatchRequest) -> dict[str, Any]:
    """Utwórz serię przebiegów (PENDING) nad scenariuszami przypadku.

    Odcisk treści każdego scenariusza jest przypinany przy tworzeniu serii;
    wykonanie odmówi biegu, jeśli scenariusz został w międzyczasie zmieniony
    lub usunięty (jedno źródło prawdy o treści serii).

    Zwraca 404 dla nieznanego scenariusza, 400 dla listy pustej, duplikatów,
    scenariusza spoza przypadku albo mieszanych typów analizy.
    """
    parsed_case_id = _parse_uuid(case_id, "case_id")
    scenario_ids = [_parse_uuid(sid, "scenario_id") for sid in request.scenario_ids]
    service = get_batch_service()

    try:
        batch = service.create_batch(
            study_case_id=parsed_case_id,
            scenario_ids=scenario_ids,
        )
        return batch.to_dict()
    except FaultScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/api/execution/batches/{batch_id}/execute",
    response_model=BatchResponse,
    summary="Wykonaj serię przebiegów",
)
def execute_batch(batch_id: str) -> dict[str, Any]:
    """Wykonaj serię sekwencyjnie torem kanonicznym (realny solver).

    Zero ponowień, zero częściowego sukcesu: pierwsza awaria kończy serię
    stanem FAILED z polskim komunikatem; biegi ukończone wcześniej pozostają
    dostępne jak zwykłe biegi kanoniczne.

    Zwraca 404 dla nieznanej serii, 409 dla serii w stanie innym niż PENDING.
    """
    parsed_batch_id = _parse_uuid(batch_id, "batch_id")
    service = get_batch_service()

    try:
        batch = service.execute_batch(parsed_batch_id)
        return batch.to_dict()
    except BatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except BatchNotPendingError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.get(
    "/api/execution/study-cases/{case_id}/batches",
    response_model=BatchListResponse,
    summary="Lista serii przebiegów przypadku",
)
def list_batches(case_id: str) -> dict[str, Any]:
    """Serie przypadku, najnowsze pierwsze (pusta lista = uczciwe zero)."""
    parsed_case_id = _parse_uuid(case_id, "case_id")
    service = get_batch_service()

    batches = service.list_batches(parsed_case_id)
    return {
        "batches": [b.to_dict() for b in batches],
        "count": len(batches),
    }


@router.get(
    "/api/execution/batches/{batch_id}",
    response_model=BatchResponse,
    summary="Szczegóły serii przebiegów",
)
def get_batch(batch_id: str) -> dict[str, Any]:
    """Szczegóły serii; 404 dla nieznanego identyfikatora."""
    parsed_batch_id = _parse_uuid(batch_id, "batch_id")
    service = get_batch_service()

    try:
        batch = service.get_batch(parsed_batch_id)
        return batch.to_dict()
    except BatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
