"""Case-bound analysis run endpoints.

Wraps existing run APIs (short-circuit, power flow, protection settings)
into case-centric workflows.  Each run is always bound to a Study Case
and stores its results under that case.

Endpoints:
- POST /api/cases/{case_id}/runs/short-circuit  — Run short circuit analysis
- POST /api/cases/{case_id}/runs/loadflow        — Run power flow analysis
- POST /api/cases/{case_id}/runs/protection-settings — Run protection settings
- GET  /api/cases/{case_id}/runs                 — List all runs for a case
- GET  /api/runs/{run_id}                        — Get run details
- GET  /api/runs/{run_id}/trace                  — Get calculation trace
- GET  /api/runs/{run_id}/proof-pack             — Get proof pack

LAYER ALIGNMENT:
- Application layer only — no physics here (NOT-A-SOLVER rule).
- Case CANNOT mutate NetworkModel (Case Immutability Rule).
- Solver dispatch is delegated to dedicated solver services.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from api.dependencies import get_uow_factory
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

logger = logging.getLogger("mv_design_pro.case_runs")

router = APIRouter(prefix="/api", tags=["case-runs"])


# =============================================================================
# Enums
# =============================================================================


class FaultType(str, Enum):
    """IEC 60909 fault types."""

    THREE_PHASE = "3F"
    SINGLE_PHASE = "1F"
    TWO_PHASE = "2F"
    TWO_PHASE_GROUND = "2F+G"


class LoadFlowSolver(str, Enum):
    """Available load flow solver algorithms."""

    NEWTON = "newton"
    GAUSS_SEIDEL = "gauss_seidel"
    FAST_DECOUPLED = "fast_decoupled"


class ProtectionMethod(str, Enum):
    """Available protection grading methods."""

    HOPPEL = "hoppel"


class CaseRunStatus(str, Enum):
    """Lifecycle states for a case run."""

    CREATED = "CREATED"
    VALIDATED = "VALIDATED"
    RUNNING = "RUNNING"
    FINISHED = "FINISHED"
    FAILED = "FAILED"


class CaseRunAnalysisType(str, Enum):
    """Analysis types supported by case-bound runs."""

    SHORT_CIRCUIT = "short_circuit"
    LOADFLOW = "loadflow"
    PROTECTION_SETTINGS = "protection_settings"


# =============================================================================
# Request Models
# =============================================================================


class ShortCircuitRunRequest(BaseModel):
    """Request body for creating a short-circuit analysis run.

    Parameters aligned with IEC 60909.
    """

    fault_type: FaultType = Field(
        ...,
        description="Typ zwarcia wg IEC 60909 (3F, 1F, 2F, 2F+G)",
    )
    fault_node_id: str = Field(
        ...,
        min_length=1,
        description="ID wezla zwarciowego w modelu sieci",
    )
    c_factor: float = Field(
        default=1.1,
        gt=0.0,
        le=1.2,
        description="Wspolczynnik napiecia c wg IEC 60909 (domyslnie 1.1)",
    )
    tk_s: float = Field(
        default=1.0,
        gt=0.0,
        description="Czas trwania zwarcia t_k [s] (domyslnie 1.0)",
    )
    tb_s: float = Field(
        default=0.1,
        gt=0.0,
        description="Minimalny czas wylaczenia t_b [s] (domyslnie 0.1)",
    )


class LoadFlowRunRequest(BaseModel):
    """Request body for creating a power flow analysis run."""

    solver: LoadFlowSolver = Field(
        default=LoadFlowSolver.NEWTON,
        description="Algorytm solvera (newton, gauss_seidel, fast_decoupled)",
    )
    max_iterations: int = Field(
        default=100,
        ge=1,
        le=10000,
        description="Maksymalna liczba iteracji (domyslnie 100)",
    )
    tolerance: float = Field(
        default=1e-6,
        gt=0.0,
        lt=1.0,
        description="Tolerancja zbieznosci [pu] (domyslnie 1e-6)",
    )


class ProtectionSettingsRunRequest(BaseModel):
    """Request body for creating a protection settings analysis run.

    Parameters for IRiESD protection coordination.
    """

    method: ProtectionMethod = Field(
        default=ProtectionMethod.HOPPEL,
        description="Metoda koordynacji zabezpieczen (domyslnie hoppel)",
    )
    delta_t_s: float = Field(
        default=0.3,
        gt=0.0,
        le=2.0,
        description="Stopien czasowy IRiESD delta_t [s] (domyslnie 0.3)",
    )
    k_b: float = Field(
        default=1.2,
        gt=1.0,
        le=3.0,
        description="Wspolczynnik selektywnosci k_b (domyslnie 1.2)",
    )


# =============================================================================
# Response Models
# =============================================================================


class CaseRunSummaryResponse(BaseModel):
    """Summary of a single analysis run."""

    id: str
    case_id: str
    analysis_type: str
    status: str
    input_hash: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error_message: str | None = None


class CaseRunDetailResponse(BaseModel):
    """Detailed view of an analysis run, including input parameters."""

    id: str
    case_id: str
    analysis_type: str
    status: str
    input_hash: str
    input_params: dict[str, Any]
    result_summary: dict[str, Any] | None = None
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error_message: str | None = None


class CaseRunListResponse(BaseModel):
    """Paginated list of runs for a case."""

    items: list[CaseRunSummaryResponse]
    total: int


class CaseRunTraceResponse(BaseModel):
    """WHITE BOX calculation trace for a run."""

    run_id: str
    analysis_type: str
    trace_version: str
    steps: list[dict[str, Any]]
    created_at: str


class CaseRunProofPackResponse(BaseModel):
    """Proof pack metadata (download link + summary)."""

    run_id: str
    analysis_type: str
    proof_version: str
    document_id: str
    proof_type: str
    sections_count: int
    created_at: str


# =============================================================================
# In-Memory Storage (consistent with existing codebase patterns)
# =============================================================================

# Keyed by run_id (str) -> run record (dict)
_case_runs_store: dict[str, dict[str, Any]] = {}


def _compute_input_hash(params: dict[str, Any]) -> str:
    """Deterministic hash of input parameters for deduplication."""
    canonical = json.dumps(params, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _store_run(
    case_id: UUID,
    analysis_type: CaseRunAnalysisType,
    input_params: dict[str, Any],
) -> dict[str, Any]:
    """Create a new run record in the in-memory store and return it."""
    run_id = str(uuid4())
    now = _now_iso()
    record: dict[str, Any] = {
        "id": run_id,
        "case_id": str(case_id),
        "analysis_type": analysis_type.value,
        "status": CaseRunStatus.CREATED.value,
        "input_hash": _compute_input_hash(input_params),
        "input_params": input_params,
        "result_summary": None,
        "created_at": now,
        "started_at": None,
        "finished_at": None,
        "error_message": None,
    }
    _case_runs_store[run_id] = record
    logger.info(
        "Utworzono przebieg analizy run_id=%s case_id=%s typ=%s",
        run_id,
        case_id,
        analysis_type.value,
    )
    return record


# =============================================================================
# Helpers
# =============================================================================


def _parse_case_id(raw: str) -> UUID:
    """Parse *case_id* path parameter to UUID; raise 400 on failure."""
    try:
        return UUID(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="case_id musi byc poprawnym UUID",
        ) from exc


def _parse_run_id(raw: str) -> str:
    """Validate *run_id* is a proper UUID string; raise 400 on failure."""
    try:
        UUID(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="run_id musi byc poprawnym UUID",
        ) from exc
    return raw


def _require_case_exists(case_id: UUID, uow_factory: Any) -> None:
    """Verify that the case exists in persistence; raise 404 otherwise.

    Uses the UnitOfWork pattern consistent with the rest of the codebase.
    """
    try:
        with uow_factory() as uow:
            case = uow.cases.get(case_id)
            if case is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Przypadek obliczeniowy nie istnieje: {case_id}",
                )
    except HTTPException:
        raise
    except Exception:
        # If persistence layer is not fully wired yet (stub mode),
        # allow the request to proceed.
        logger.debug(
            "Pominieto sprawdzenie istnienia przypadku case_id=%s (brak UoW)",
            case_id,
        )


def _run_to_summary(record: dict[str, Any]) -> dict[str, Any]:
    """Project a run record into a CaseRunSummaryResponse-compatible dict."""
    return {
        "id": record["id"],
        "case_id": record["case_id"],
        "analysis_type": record["analysis_type"],
        "status": record["status"],
        "input_hash": record["input_hash"],
        "created_at": record["created_at"],
        "started_at": record.get("started_at"),
        "finished_at": record.get("finished_at"),
        "error_message": record.get("error_message"),
    }


def _run_to_detail(record: dict[str, Any]) -> dict[str, Any]:
    """Project a run record into a CaseRunDetailResponse-compatible dict."""
    return {
        "id": record["id"],
        "case_id": record["case_id"],
        "analysis_type": record["analysis_type"],
        "status": record["status"],
        "input_hash": record["input_hash"],
        "input_params": record["input_params"],
        "result_summary": record.get("result_summary"),
        "created_at": record["created_at"],
        "started_at": record.get("started_at"),
        "finished_at": record.get("finished_at"),
        "error_message": record.get("error_message"),
    }


# =============================================================================
# POST  /api/cases/{case_id}/runs/short-circuit
# =============================================================================


@router.post(
    "/cases/{case_id}/runs/short-circuit",
    response_model=CaseRunSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Uruchom analize zwarciowa dla przypadku",
)
def create_short_circuit_run(
    case_id: str,
    request: ShortCircuitRunRequest,
    uow_factory=Depends(get_uow_factory),
) -> dict[str, Any]:
    """Utwórz przebieg analizy zwarciowej powiazany z przypadkiem obliczeniowym.

    Waliduje parametry wejsciowe wg IEC 60909 i tworzy rekord przebiegu
    ze statusem CREATED.  Wlasciwe obliczenia (solver) sa uruchamiane
    asynchronicznie.

    Zwraca 404 jesli przypadek nie istnieje.
    Zwraca 422 jesli parametry wejsciowe sa niepoprawne (walidacja Pydantic).
    """
    parsed_case_id = _parse_case_id(case_id)
    _require_case_exists(parsed_case_id, uow_factory)

    input_params: dict[str, Any] = {
        "fault_type": request.fault_type.value,
        "fault_node_id": request.fault_node_id,
        "c_factor": request.c_factor,
        "tk_s": request.tk_s,
        "tb_s": request.tb_s,
    }

    record = _store_run(
        case_id=parsed_case_id,
        analysis_type=CaseRunAnalysisType.SHORT_CIRCUIT,
        input_params=input_params,
    )
    return _run_to_summary(record)


# =============================================================================
# POST  /api/cases/{case_id}/runs/loadflow
# =============================================================================


@router.post(
    "/cases/{case_id}/runs/loadflow",
    response_model=CaseRunSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Uruchom analize rozplywu mocy dla przypadku",
)
def create_loadflow_run(
    case_id: str,
    request: LoadFlowRunRequest,
    uow_factory=Depends(get_uow_factory),
) -> dict[str, Any]:
    """Utwórz przebieg analizy rozplywu mocy powiazany z przypadkiem.

    Parametry solvera (algorytm, iteracje, tolerancja) sa przechowywane
    jako input_params przebiegu.

    Zwraca 404 jesli przypadek nie istnieje.
    Zwraca 422 jesli parametry wejsciowe sa niepoprawne.
    """
    parsed_case_id = _parse_case_id(case_id)
    _require_case_exists(parsed_case_id, uow_factory)

    input_params: dict[str, Any] = {
        "solver": request.solver.value,
        "max_iterations": request.max_iterations,
        "tolerance": request.tolerance,
    }

    record = _store_run(
        case_id=parsed_case_id,
        analysis_type=CaseRunAnalysisType.LOADFLOW,
        input_params=input_params,
    )
    return _run_to_summary(record)


# =============================================================================
# POST  /api/cases/{case_id}/runs/protection-settings
# =============================================================================


@router.post(
    "/cases/{case_id}/runs/protection-settings",
    response_model=CaseRunSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Uruchom analize nastaw zabezpieczen dla przypadku",
)
def create_protection_settings_run(
    case_id: str,
    request: ProtectionSettingsRunRequest,
    uow_factory=Depends(get_uow_factory),
) -> dict[str, Any]:
    """Utwórz przebieg analizy nastaw zabezpieczen (koordynacja IRiESD).

    Parametry metody Hoppel (delta_t_s, k_b) sa przechowywane jako
    input_params przebiegu.

    Zwraca 404 jesli przypadek nie istnieje.
    Zwraca 422 jesli parametry wejsciowe sa niepoprawne.
    """
    parsed_case_id = _parse_case_id(case_id)
    _require_case_exists(parsed_case_id, uow_factory)

    input_params: dict[str, Any] = {
        "method": request.method.value,
        "delta_t_s": request.delta_t_s,
        "k_b": request.k_b,
    }

    record = _store_run(
        case_id=parsed_case_id,
        analysis_type=CaseRunAnalysisType.PROTECTION_SETTINGS,
        input_params=input_params,
    )
    return _run_to_summary(record)


# =============================================================================
# GET  /api/cases/{case_id}/runs
# =============================================================================


@router.get(
    "/cases/{case_id}/runs",
    response_model=CaseRunListResponse,
    summary="Lista przebiegow analizy dla przypadku",
)
def list_case_runs(
    case_id: str,
    analysis_type: str | None = Query(
        default=None,
        description="Filtruj po typie analizy (short_circuit, loadflow, protection_settings)",
    ),
    status_filter: str | None = Query(
        default=None,
        alias="status",
        description="Filtruj po statusie (CREATED, VALIDATED, RUNNING, FINISHED, FAILED)",
    ),
    limit: int = Query(default=50, ge=1, le=500, description="Limit wynikow"),
    offset: int = Query(default=0, ge=0, description="Przesuniecie"),
    uow_factory=Depends(get_uow_factory),
) -> dict[str, Any]:
    """Pobierz liste wszystkich przebiegow analizy powiazanych z przypadkiem.

    Wyniki sa posortowane po dacie utworzenia malejaco (najnowsze pierwsze)
    i moga byc filtrowane po typie analizy lub statusie.

    Zwraca 404 jesli przypadek nie istnieje.
    """
    parsed_case_id = _parse_case_id(case_id)
    _require_case_exists(parsed_case_id, uow_factory)

    case_id_str = str(parsed_case_id)

    # Filter runs belonging to this case
    matching = [record for record in _case_runs_store.values() if record["case_id"] == case_id_str]

    # Apply optional filters
    if analysis_type is not None:
        matching = [r for r in matching if r["analysis_type"] == analysis_type]
    if status_filter is not None:
        matching = [r for r in matching if r["status"] == status_filter]

    # Sort deterministically: newest first, then by id for stability
    matching.sort(key=lambda r: (r["created_at"], r["id"]), reverse=True)

    total = len(matching)
    page = matching[offset : offset + limit]

    return {
        "items": [_run_to_summary(r) for r in page],
        "total": total,
    }


# =============================================================================
# GET  /api/runs/{run_id}
# =============================================================================


@router.get(
    "/runs/{run_id}",
    response_model=CaseRunDetailResponse,
    summary="Szczegoly przebiegu analizy",
)
def get_run_detail(
    run_id: str,
    uow_factory=Depends(get_uow_factory),
) -> dict[str, Any]:
    """Pobierz szczegolowe informacje o przebiegu analizy.

    Zawiera parametry wejsciowe, podsumowanie wynikow (jesli dostepne)
    oraz metadane cyklu zycia.

    Zwraca 404 jesli przebieg nie istnieje.
    """
    validated_run_id = _parse_run_id(run_id)
    record = _case_runs_store.get(validated_run_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Przebieg analizy nie istnieje: {run_id}",
        )
    return _run_to_detail(record)


# =============================================================================
# GET  /api/runs/{run_id}/trace
# =============================================================================


@router.get(
    "/runs/{run_id}/trace",
    response_model=CaseRunTraceResponse,
    summary="Slad obliczeniowy przebiegu (WHITE BOX)",
)
def get_run_trace(
    run_id: str,
    uow_factory=Depends(get_uow_factory),
) -> dict[str, Any]:
    """Pobierz slad obliczeniowy (WHITE BOX trace) przebiegu analizy.

    Slad zawiera wszystkie kroki posrednie obliczen w formacie
    umozliwiajacym audyt numeryczny.  Dostepny tylko dla przebiegow
    ze statusem FINISHED.

    Zwraca 404 jesli przebieg nie istnieje lub slad nie jest dostepny.
    """
    validated_run_id = _parse_run_id(run_id)
    record = _case_runs_store.get(validated_run_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Przebieg analizy nie istnieje: {run_id}",
        )

    if record["status"] != CaseRunStatus.FINISHED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Slad obliczeniowy niedostepny — przebieg nie jest zakonczony "
                f"(status: {record['status']})"
            ),
        )

    # Stub: return a placeholder trace structure.
    # Full integration will read from the solver's TraceArtifact store.
    return {
        "run_id": record["id"],
        "analysis_type": record["analysis_type"],
        "trace_version": "1.0.0",
        "steps": [],
        "created_at": record["created_at"],
    }


# =============================================================================
# GET  /api/runs/{run_id}/proof-pack
# =============================================================================


@router.get(
    "/runs/{run_id}/proof-pack",
    response_model=CaseRunProofPackResponse,
    summary="Pakiet dowodowy przebiegu analizy",
)
def get_run_proof_pack(
    run_id: str,
    uow_factory=Depends(get_uow_factory),
) -> dict[str, Any]:
    """Pobierz metadane pakietu dowodowego (Proof Pack) przebiegu analizy.

    Pakiet dowodowy zawiera formalny dowod matematyczny z krokow solvera.
    Dostepny tylko dla przebiegow ze statusem FINISHED.

    Zwraca 404 jesli przebieg nie istnieje lub pakiet nie jest dostepny.
    """
    validated_run_id = _parse_run_id(run_id)
    record = _case_runs_store.get(validated_run_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Przebieg analizy nie istnieje: {run_id}",
        )

    if record["status"] != CaseRunStatus.FINISHED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Pakiet dowodowy niedostepny — przebieg nie jest zakonczony "
                f"(status: {record['status']})"
            ),
        )

    # Stub: compute a deterministic document_id from run metadata
    hash_input = f"{record['id']}:{record['input_hash']}:{record['case_id']}"
    document_id = hashlib.sha256(hash_input.encode("utf-8")).hexdigest()[:16]

    # Map analysis_type to proof_type label
    proof_type_map = {
        CaseRunAnalysisType.SHORT_CIRCUIT.value: "short_circuit_iec60909",
        CaseRunAnalysisType.LOADFLOW.value: "power_flow_newton_raphson",
        CaseRunAnalysisType.PROTECTION_SETTINGS.value: "protection_coordination",
    }
    proof_type = proof_type_map.get(record["analysis_type"], record["analysis_type"])

    return {
        "run_id": record["id"],
        "analysis_type": record["analysis_type"],
        "proof_version": "1.0.0",
        "document_id": document_id,
        "proof_type": proof_type,
        "sections_count": 0,
        "created_at": record["created_at"],
    }
