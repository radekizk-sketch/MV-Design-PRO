"""
Protection Analysis API — P15a/P15b, tor kanoniczny (CV-3.3-B)

Backend-only endpoints for protection analysis runs.

CV-3.3-B (B2): bieg zabezpieczen jest odtad `CanonicalRun` (R1,
`enm.canonical_analysis`, `analysis_type="protection_sn"`) z kopertą rewizji
i migawką modelu — zamiast (usuniętego) `ProtectionAnalysisService`, który
zapisywał do R3 `study_results`. Kontrakt HTTP (ścieżki, kształt odpowiedzi)
BEZ ZMIAN — zmienia się wyłącznie tor zapisu/odczytu.

Endpoints:
- POST /projects/{project_id}/protection-runs — Create new protection run
- POST /protection-runs/{run_id}/execute — Execute protection run
- GET /protection-runs/{run_id} — Get run metadata
- GET /protection-runs/{run_id}/results — Get ProtectionResult
- GET /protection-runs/{run_id}/trace — Get ProtectionTrace

Nakładka SLD (`/projects/{id}/sld/{diagram}/protection-overlay`) SKASOWANA (karta
BIEG-ZABEZPIECZEN-Z-MODELU): nie miała konsumenta, a nakładała ocenę syntetycznego
urządzenia na szynę. Status świeżości (NONE/FRESH/OUTDATED z porównania kopert biegu i
biegu źródłowego) niesie odtąd `GET /protection-runs/{id}/results` — tę trasę czyta ekran
wyniku oceny zabezpieczeń.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from api.klucz_twin_dep import klucz_twin_z_uow
from application.result_freshness import (
    FreshnessReason,
    FreshnessVerdict,
    ResultFreshness,
    StanBiezacyModelu,
    swiezosc_biegu_kanonicznego,
)
from domain.execution import StanBiegu
from enm.canonical_analysis import CanonicalRun
from enm.canonical_analysis import create_run as create_canonical_run
from enm.canonical_analysis import execute_run as execute_canonical_run
from enm.canonical_analysis import get_run as get_canonical_run
from enm.canonical_analysis import list_runs_for_project as list_canonical_runs_for_project
from enm.hash import siec_biegu_zgodna_z_modelem
from enm.klucz_twin import czy_klucz_projektu, project_id_z_klucza
from enm.store import get_enm, has_enm
from fastapi import APIRouter, Depends, HTTPException, Query, status
from infrastructure.persistence.unit_of_work import UnitOfWork
from pydantic import BaseModel

router = APIRouter(tags=["protection-analysis"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================


class CreateProtectionRunRequest(BaseModel):
    """Request to create a new protection analysis run."""

    sc_run_id: str
    protection_case_id: str


class ProtectionRunResponse(BaseModel):
    """Response for protection run metadata."""

    id: str
    project_id: str
    sc_run_id: str
    protection_case_id: str
    status: StanBiegu
    input_hash: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error_message: str | None = None


class ProtectionRunListItemResponse(BaseModel):
    """Wpis listy biegów zabezpieczeń projektu (B5, karta CV-3.3-B).

    Niesie te same trzy pola co koperta rewizji biegu (`snapshot_hash`,
    `model_revision`, `scenario_ref`) — etykieta wyboru w porównaniu A/B
    (rodzaj + rewizja/scenariusz + krótki `snapshot_hash`) nie może pokazywać
    samego UUID biegu bez dowodu, KTÓRY stan modelu opisuje.
    """

    id: str
    project_id: str | None
    study_case_id: str
    analysis_type: str
    status: StanBiegu
    created_at: str
    finished_at: str | None
    input_hash: str
    snapshot_hash: str
    model_revision: int | None
    scenario_ref: tuple[str, int] | None


class ProtectionRunListResponse(BaseModel):
    """Lista biegów zabezpieczeń projektu."""

    runs: list[ProtectionRunListItemResponse]
    total: int


class ProtectionResultResponse(BaseModel):
    """Wynik biegu oceny zabezpieczeń nadprądowych z modelu.

    ``evaluations`` — oceny par (urządzenie modelu, punkt zwarcia w strefie) z rekordem
    werdyktu wyjaśnialnego; ``odmowy`` — urządzenia wstrzymane nazwanymi brakami z akcjami
    naprawczymi; ``pominiete`` — urządzenia, których ocena nadprądowa nie dotyczy (z
    przyczyną); ``nastawy`` — rozwiązane nastawy urządzeń (jednostki, przekładnia, zakresy
    katalogu); ``strefy`` — strefy urządzeń wyznaczone z topologii modelu.
    """

    run_id: str
    sc_run_id: str
    protection_case_id: str
    evaluations: list[dict[str, Any]]
    odmowy: list[dict[str, Any]]
    pominiete: list[dict[str, Any]]
    nastawy: list[dict[str, Any]]
    strefy: dict[str, dict[str, Any]]
    summary: dict[str, Any]
    created_at: str
    result_status: str
    result_status_reason: str
    result_status_reason_pl: str
    rewizja_biegu: int | None
    rewizja_biezaca: int | None
    zmiany_od_biegu: list[dict[str, Any]]


class ProtectionTraceResponse(BaseModel):
    """Ślad White Box biegu oceny zabezpieczeń (nastawy, strefy, bilanse, czasy z rdzenia)."""

    run_id: str
    sc_run_id: str
    snapshot_id: str | None
    steps: list[dict[str, Any]]
    created_at: str


# =============================================================================
# HELPERS
# =============================================================================


def _require_run(run_id: UUID) -> CanonicalRun:
    run = get_canonical_run(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Protection analysis run '{run_id}' not found",
        )
    return run


def _require_protection_run(run_id: UUID) -> CanonicalRun:
    run = _require_run(run_id)
    if run.analysis_type != "protection_sn":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Protection analysis run '{run_id}' not found",
        )
    return run


def _sc_run_id(run: CanonicalRun) -> str:
    """Bieg źródłowy biegu oceny — zapisany przy tworzeniu (``create_protection_run``)."""
    return str(run.options["sc_run_id"])


def _run_to_response(run: CanonicalRun) -> dict[str, Any]:
    """Convert CanonicalRun (protection_sn) to response dict — kontrakt HTTP bez zmian."""
    return {
        "id": str(run.id),
        "project_id": str(run.project_id) if run.project_id else "",
        "sc_run_id": _sc_run_id(run),
        "protection_case_id": run.case_id,
        "status": run.status,
        "input_hash": run.input_hash,
        "created_at": run.created_at.isoformat(),
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "error_message": run.error_message,
    }


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.get(
    "/projects/{project_id}/protection-runs",
    response_model=ProtectionRunListResponse,
)
def list_protection_runs(
    project_id: UUID,
    run_status: StanBiegu | None = Query(
        default=None,
        alias="status",
        description="Filtruj po statusie (CREATED, RUNNING, FINISHED, FAILED)",
    ),
) -> dict[str, Any]:
    """
    List protection analysis runs for a project (B5, karta CV-3.3-B).

    Zero R2/R3 list — jedyne źródło to R1 `CanonicalRun`
    (`analysis_type="protection_sn"`), ten sam wzorzec co
    `GET /projects/{project_id}/power-flow-runs`
    (`api/power_flow_runs.py::list_power_flow_runs`).
    """
    runs = [
        {
            "id": str(run.id),
            "project_id": run.project_id,
            "study_case_id": run.case_id,
            "analysis_type": run.analysis_type,
            "status": run.status,
            "created_at": run.created_at.isoformat(),
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "input_hash": run.input_hash,
            "snapshot_hash": run.snapshot_hash,
            "model_revision": (run.envelope or {}).get("model_revision"),
            "scenario_ref": (run.envelope or {}).get("scenario_ref"),
        }
        for run in sorted(
            list_canonical_runs_for_project(str(project_id), analysis_type="protection_sn"),
            key=lambda run: run.created_at,
            reverse=True,
        )
        if run_status is None or run.status == run_status
    ]
    return {"runs": runs, "total": len(runs)}


@router.post(
    "/projects/{project_id}/protection-runs",
    status_code=status.HTTP_201_CREATED,
    response_model=ProtectionRunResponse,
)
def create_protection_run(
    project_id: UUID,
    request: CreateProtectionRunRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Create a new protection analysis run.

    Requires:
    - zakończony bieg zwarciowy 3F albo 2F (sc_run_id) tego samego projektu,
    - przypadek (protection_case_id), którego model niesie urządzenia i nastawy
      zabezpieczeń (D-21) — przypadek nie przechowuje nastaw.

    Returns:
    - Protection run metadata with status CREATED
    """
    klucz = klucz_twin_z_uow(request.protection_case_id, uow_factory)
    if czy_klucz_projektu(klucz) and str(project_id_z_klucza(klucz)) != str(project_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Przypadek {request.protection_case_id} nie należy do projektu {project_id}",
        )

    try:
        run = create_canonical_run(
            case_id=request.protection_case_id,
            klucz_twin=klucz,
            project_id=str(project_id),
            analysis_type="protection_sn",
            options={"sc_run_id": request.sc_run_id},
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return _run_to_response(run)


@router.post(
    "/protection-runs/{run_id}/execute",
    response_model=ProtectionRunResponse,
)
def execute_protection_run(
    run_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Execute a protection analysis run.

    The run must be in CREATED status. This endpoint:
    1. Runs the protection evaluation engine (interpretation, zero physics)
    2. Stores the result on the CanonicalRun (R1)

    Returns:
    - Updated run metadata with status FINISHED or FAILED

    `uow_factory` — przekazana WPROST do `execute_canonical_run` (CV-3.3-B): rozpływ
    zwarciowy na żądanie biegu źródłowego z opcjami audytu 2 czyta konfigurację stacji
    przez `UnitOfWork` TEGO żądania, nie przez fabrykę zbudowaną z `DATABASE_URL`.
    """
    _require_protection_run(run_id)
    run = execute_canonical_run(run_id, uow_factory=uow_factory)
    return _run_to_response(run)


@router.get(
    "/protection-runs/{run_id}",
    response_model=ProtectionRunResponse,
)
def get_protection_run(run_id: UUID) -> dict[str, Any]:
    """
    Get protection run metadata.

    Returns the run status, input hash, timestamps, and error message (if failed).
    """
    run = _require_protection_run(run_id)
    return _run_to_response(run)


@router.get(
    "/protection-runs/{run_id}/results",
    response_model=ProtectionResultResponse,
)
def get_protection_run_results(
    run_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Wynik biegu oceny zabezpieczeń + świeżość względem bieżącego modelu.

    Dostępny wyłącznie dla biegu FINISHED. STATUS ŚWIEŻOŚCI Z PORÓWNANIA KOPERT
    (CV-2/CV-3.3-B): `swiezosc_biegu_kanonicznego` z DODATKOWYM sprawdzeniem biegu
    źródłowego (zwarciowego) — ocena interpretuje JEGO prąd zwarciowy, więc własna koperta
    biegu zabezpieczeń bywa aktualna, gdy koperta biegu źródłowego już nie jest. Zmiana
    nastaw w modelu zmienia odcisk modelu, więc wynik oceny staje się nieaktualny.
    """
    run = _require_protection_run(run_id)

    if run.status != "FINISHED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Przebieg nie jest zakończony (status: {run.status})",
        )

    result = (run.raw_result or {}).get("protection_result")
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Wynik analizy zabezpieczeń nie znaleziony",
        )

    return {
        "run_id": str(run.id),
        "sc_run_id": _sc_run_id(run),
        "protection_case_id": run.case_id,
        "evaluations": result["evaluations"],
        "odmowy": result["odmowy"],
        "pominiete": result["pominiete"],
        "nastawy": result["nastawy"],
        "strefy": result["strefy"],
        "summary": result["summary"],
        "created_at": (
            run.finished_at.isoformat() if run.finished_at else run.created_at.isoformat()
        ),
        **_swiezosc_wyniku(run, uow_factory),
    }


def _swiezosc_wyniku(run: CanonicalRun, uow_factory: Callable[[], UnitOfWork]) -> dict[str, Any]:
    """Pola świeżości wyniku oceny zabezpieczeń (ten sam kształt co w każdym odczycie z kopertą).

    Dwie kotwice, każda z WŁASNYM predykatem:
    - koperta TEGO biegu wobec bieżącego modelu (pełny odcisk — nastawy wchodzą do oceny, więc
      zmiana nastaw unieważnia wynik),
    - bieg źródłowy (zwarciowy) wobec bieżącej SIECI — ``siec_biegu_zgodna_z_modelem``, TEN SAM
      predykat, którym tworzenie biegu sprawdza, czy ocena może czytać rozpływ biegu źródłowego
      (``_validate_protection_sc_reference``).
      Zmiana samych nastaw nie unieważnia biegu zwarciowego (sieć ta sama); zmiana sieci —
      tak (``ZRODLO_NIEAKTUALNE``).
    """
    stan = StanBiezacyModelu.dla_przypadku(run.case_id, uow_factory)
    werdykt = swiezosc_biegu_kanonicznego(run, stan)
    if werdykt.status == ResultFreshness.FRESH:
        sc_run = get_canonical_run(UUID(_sc_run_id(run)))
        if (
            sc_run is None
            or stan.klucz is None
            or not has_enm(stan.klucz)
            or not siec_biegu_zgodna_z_modelem(
                sc_run.snapshot, get_enm(stan.klucz).model_dump(mode="json")
            )
        ):
            werdykt = FreshnessVerdict(
                ResultFreshness.OUTDATED,
                FreshnessReason.ZRODLO_NIEAKTUALNE,
                rewizja_biegu=werdykt.rewizja_biegu,
                rewizja_biezaca=werdykt.rewizja_biezaca,
            )
    return werdykt.to_overlay_fields()


@router.get(
    "/protection-runs/{run_id}/trace",
    response_model=ProtectionTraceResponse,
)
def get_protection_run_trace(run_id: UUID) -> dict[str, Any]:
    """
    Get protection analysis trace.

    Returns the full ProtectionTrace including all calculation steps.
    Only available for runs with status FINISHED.
    """
    run = _require_protection_run(run_id)

    if run.status != "FINISHED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Przebieg nie jest zakończony (status: {run.status})",
        )

    trace = (run.raw_result or {}).get("protection_trace")
    if trace is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ślad analizy zabezpieczeń nie znaleziony",
        )

    return {
        "run_id": str(run.id),
        "sc_run_id": _sc_run_id(run),
        "snapshot_id": trace.get("snapshot_id"),
        "steps": trace["steps"],
        "created_at": (
            run.finished_at.isoformat() if run.finished_at else run.created_at.isoformat()
        ),
    }
