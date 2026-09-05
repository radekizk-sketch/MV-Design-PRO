"""Serie przebiegów (wsad) — REST API (karta CV-3.3-C, trwały rejestr `run_batches`).

Końcówki (kształt odpowiedzi BEZ ZMIANY względem karty BATCH-ROUTER — pola
addytywne: `finished_at`, `name`, `envelope`, `items[]`):
    POST /api/execution/study-cases/{case_id}/batches      — utwórz serię
    POST /api/execution/batches/{batch_id}/execute         — wykonaj serię
    GET  /api/execution/study-cases/{case_id}/batches      — lista serii
    GET  /api/execution/batches/{batch_id}                 — szczegóły serii

Seria = sekwencja biegów kanonicznych nad scenariuszami zwarciowymi jednego
przypadku (tor identyczny z pojedynczym biegiem ze scenariusza). Wyniki
pojedynczych biegów są dostępne istniejącymi końcówkami
(`GET /api/execution/runs/{run_id}` / `.../results`).

TRWAŁOŚĆ (karta CV-3.3-C, 2026-09-05). Seria żyje odtąd w tabeli `run_batches`
(R2) — restart procesu backendu NIE gubi serii (poprzednio: trzy słowniki w
pamięci modułu). Status serii ma pięć wartości (CREATED/RUNNING/FINISHED/
FAILED/PARTIAL) — PARTIAL, gdy część pozycji zawiodła, a reszta się powiodła
(seria NIGDY nie melduje cicho FINISHED). Każda pozycja niesie własną
świeżość wyniku (`result_freshness`, wyprowadzoną z koperty biegu — TA SAMA
funkcja co nakładka pojedynczego biegu, `application/result_freshness.py`) —
ekran serii pokazuje OUTDATED per pozycja, nie zielone na zawsze.

Komunikaty błędów po polsku (spójność z UI).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from api.fault_scenarios import get_fault_scenario_service
from api.klucz_twin_dep import klucz_twin_z_sciezki
from application.batch_execution_service import (
    BatchExecutionService,
    BatchNotFoundError,
    BatchNotPendingError,
)
from application.fault_scenario_service import FaultScenarioNotFoundError
from application.result_freshness import (
    FreshnessReason,
    FreshnessVerdict,
    ResultFreshness,
    StanBiezacyModelu,
    swiezosc_biegu_kanonicznego,
)
from domain.run_batch import RunBatch
from enm.canonical_analysis import get_run as get_canonical_run
from fastapi import APIRouter, Depends, HTTPException, Request, status
from infrastructure.persistence.unit_of_work import UnitOfWork
from pydantic import BaseModel, Field

router = APIRouter(tags=["batch-execution"])

# Serwis jest BEZSTANOWY (karta CV-3.3-C, wzorzec `FaultScenarioService`) —
# singleton pozostaje wyłącznie jako wygodny punkt wstrzyknięcia w testach,
# nie jako nośnik treści (treść żyje w `run_batches`).
_batch_service: BatchExecutionService | None = None


def get_batch_service() -> BatchExecutionService:
    """Serwis serii — związany z serwisem scenariuszy zwarciowych."""
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


class BatchItemResponse(BaseModel):
    """Jedna pozycja serii — ZERO własnego wyniku (wynik = bieg kanoniczny po
    `canonical_run_id`, `GET /api/execution/runs/{canonical_run_id}`)."""

    position: int
    scenario_id: str
    analysis_type: str
    options_hash: str
    canonical_run_id: str | None
    status: str
    error_message: str | None
    #: Świeżość WYNIKU pozycji względem modelu bieżącego — TA SAMA funkcja co
    #: nakładka pojedynczego biegu (`application/result_freshness.py`), zero
    #: pola "zielone na zawsze" (karta §0 C3).
    result_freshness: str
    result_freshness_reason: str
    result_freshness_reason_pl: str


class BatchResponse(BaseModel):
    """Rekord serii przebiegów."""

    batch_id: str
    study_case_id: str
    analysis_type: str
    scenario_ids: list[str]
    created_at: str
    finished_at: str | None
    status: str
    batch_input_hash: str
    run_ids: list[str]
    result_set_ids: list[str]
    errors: list[str]
    name: str | None
    envelope: dict[str, Any] | None
    items: list[BatchItemResponse]


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


def _werdykt_pozycji(run_id: str | None, stan: StanBiezacyModelu) -> FreshnessVerdict:
    """Świeżość WYNIKU jednej pozycji — brak biegu = uczciwe NONE (bieg nigdy
    nie powstał, np. scenariusz zablokowany przed utworzeniem biegu)."""
    if run_id is None:
        return FreshnessVerdict(ResultFreshness.NONE, FreshnessReason.BRAK_WYNIKU)
    run = get_canonical_run(UUID(run_id))
    if run is None:
        return FreshnessVerdict(ResultFreshness.NONE, FreshnessReason.BRAK_WYNIKU)
    return swiezosc_biegu_kanonicznego(run, stan)


def _pola_swiezosci_pozycji(werdykt: FreshnessVerdict) -> dict[str, str]:
    return {
        "result_freshness": werdykt.status.value,
        "result_freshness_reason": werdykt.reason.value,
        "result_freshness_reason_pl": werdykt.reason_pl,
    }


def _do_odpowiedzi(batch: RunBatch, uow_factory: Callable[[], UnitOfWork] | None) -> dict[str, Any]:
    """Rekord serii → kształt HTTP, z DOŁOŻONĄ świeżością per pozycja (liczoną
    RAZ dla całej serii — pozycje dzielą `case_id`, więc `StanBiezacyModelu`
    jest jednym odczytem, nie N odczytami modelu)."""
    dane = batch.to_dict()
    stan = StanBiezacyModelu.dla_przypadku(str(batch.case_id), uow_factory)
    dane["items"] = [
        {
            **pozycja,
            **_pola_swiezosci_pozycji(_werdykt_pozycji(pozycja["canonical_run_id"], stan)),
        }
        for pozycja in dane["items"]
    ]
    return dane


# =============================================================================
# Końcówki serii
# =============================================================================


@router.post(
    "/api/execution/study-cases/{case_id}/batches",
    response_model=BatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Utwórz serię przebiegów ze scenariuszy zwarciowych",
)
def create_batch(
    case_id: str,
    request: CreateBatchRequest,
    http_request: Request,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Utwórz serię przebiegów (CREATED) nad scenariuszami przypadku.

    Odcisk treści każdego scenariusza jest przypinany przy tworzeniu serii;
    wykonanie odmówi biegu TEJ pozycji, jeśli scenariusz został w międzyczasie
    zmieniony lub usunięty (jedno źródło prawdy o treści serii) — reszta
    pozycji jest próbowana niezależnie.

    Zwraca 404 dla nieznanego scenariusza, 400 dla listy pustej, duplikatów,
    scenariusza spoza przypadku albo mieszanych typów analizy.
    """
    parsed_case_id = _parse_uuid(case_id, "case_id")
    if not request.scenario_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seria przebiegów wymaga co najmniej jednego scenariusza",
        )
    scenario_ids = [_parse_uuid(sid, "scenario_id") for sid in request.scenario_ids]
    klucz = klucz_twin_z_sciezki(case_id, http_request)
    service = get_batch_service()

    try:
        batch = service.create_batch(
            klucz=klucz,
            study_case_id=parsed_case_id,
            scenario_ids=scenario_ids,
        )
        return _do_odpowiedzi(batch, uow_factory)
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
def execute_batch(
    batch_id: str,
    http_request: Request,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Wykonaj serię sekwencyjnie torem kanonicznym (realny solver).

    KAŻDA pozycja jest próbowana, niezależnie od wyniku poprzednich (karta §0
    C2 — zero zatrzymania na pierwszej awarii): status końcowy to FINISHED
    (wszystkie pozycje FINISHED), FAILED (wszystkie FAILED) albo PARTIAL
    (mieszanka).

    Zwraca 404 dla nieznanej serii, 409 dla serii w stanie innym niż CREATED,
    404 gdy przypadek serii nie należy do żadnego projektu (klucz magazynu ENM
    tłumaczony TU, bo `BatchExecutionService` nie ma dostępu do bazy danych —
    patrz `application/batch_execution_service.py`).
    """
    parsed_batch_id = _parse_uuid(batch_id, "batch_id")
    service = get_batch_service()

    try:
        batch_przed = service.get_batch(parsed_batch_id)
    except BatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    klucz = klucz_twin_z_sciezki(str(batch_przed.case_id), http_request)

    try:
        batch = service.execute_batch(parsed_batch_id, klucz_twin=klucz)
        return _do_odpowiedzi(batch, uow_factory)
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
def list_batches(
    case_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Serie przypadku, najnowsze pierwsze (pusta lista = uczciwe zero)."""
    parsed_case_id = _parse_uuid(case_id, "case_id")
    service = get_batch_service()

    batches = service.list_batches(parsed_case_id)
    return {
        "batches": [_do_odpowiedzi(b, uow_factory) for b in batches],
        "count": len(batches),
    }


@router.get(
    "/api/execution/batches/{batch_id}",
    response_model=BatchResponse,
    summary="Szczegóły serii przebiegów",
)
def get_batch(
    batch_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Szczegóły serii; 404 dla nieznanego identyfikatora."""
    parsed_batch_id = _parse_uuid(batch_id, "batch_id")
    service = get_batch_service()

    try:
        batch = service.get_batch(parsed_batch_id)
        return _do_odpowiedzi(batch, uow_factory)
    except BatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
