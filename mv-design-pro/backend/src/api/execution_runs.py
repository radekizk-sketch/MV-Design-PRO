"""
Execution Runs API.

Production path:
    domain-ops -> ENM snapshot -> canonical analysis run -> result set
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.klucz_twin_dep import KluczTwin
from application.execution import BiegNieDoAnulowaniaError, wykonawca_biegow
from domain.execution import ExecutionAnalysisType, RunStatus
from enm.canonical_analysis import (
    ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY,
    CanonicalRun,
    build_execution_result_set,
)
from enm.canonical_analysis import (
    create_run as create_canonical_run,
)
from enm.canonical_analysis import (
    get_run as get_canonical_run,
)
from enm.canonical_analysis import (
    list_runs_for_case as list_canonical_runs_for_case,
)
from enm.scenariusze import ScenariuszNieistniejeError, wczytaj_scenariusz
from fastapi import APIRouter, HTTPException, Request, status
from network_model.odmowa_danych import OdmowaDanychError
from pydantic import BaseModel, Field

router = APIRouter(tags=["execution-runs"])


class CreateRunRequest(BaseModel):
    analysis_type: str = Field(
        ...,
        description=(
            "Typ analizy: SC_3F, SC_1F, SC_2F, SC_2F_G, LOAD_FLOW, PF_UNBALANCED, "
            "PHASE_STATE_SN, DYNAMIKA_RMS"
        ),
    )
    solver_input: dict[str, Any] = Field(default_factory=dict, description="Opcje solvera")
    scenario_id: str | None = Field(
        None,
        description=(
            "Scenariusz nazwany projektu (magazyn scenariuszy) — migawka biegu i jego "
            "projekcja na opcje (np. harmonogram dynamiki) pochodzą ze scenariusza"
        ),
    )
    readiness: dict[str, Any] | None = Field(None, description="Legacy - ignorowane")
    eligibility: dict[str, Any] | None = Field(None, description="Legacy - ignorowane")


class RunResponse(BaseModel):
    id: str
    study_case_id: str
    analysis_type: str
    solver_input_hash: str
    status: RunStatus
    started_at: str | None = None
    finished_at: str | None = None
    error_message: str | None = None
    # KARTA-UI2 §1 p. 10: rewizja modelu, na której policzono bieg (koperta CV-2,
    # `None` = bieg sprzed rejestru koperty), oraz pochodzenie biegu (kiedy/z
    # jakiej migawki) — pola addytywne, `to_execution_dict` już je niesie.
    model_revision: int | None = None
    created_at: str | None = None
    snapshot_hash: str | None = None
    # Karta DYNAMIKA-W-TLE: postęp biegu w toku (pomiar wykonawcy w tle; `None` — bieg
    # nie jest liczony w tym procesie albo jego wykonawca nie mierzy postępu).
    postep: PostepResponse | None = None


class PostepResponse(BaseModel):
    """Postęp biegu w toku: co policzono z czego (jednostka nazwana), ułamek 0–1."""

    wykonane: float
    razem: float
    jednostka: str
    krok: int
    ulamek: float


class RunListResponse(BaseModel):
    runs: list[RunResponse]
    count: int


class ElementResultResponse(BaseModel):
    element_ref: str
    element_type: str
    values: dict[str, Any]


class ResultSetResponse(BaseModel):
    run_id: str
    analysis_type: str
    validation_snapshot: dict[str, Any]
    readiness_snapshot: dict[str, Any]
    element_results: list[ElementResultResponse]
    global_results: dict[str, Any]
    deterministic_signature: str


def _parse_uuid(value: str, field_name: str = "id") -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} musi być poprawnym UUID",
        ) from exc


def _parse_analysis_type(value: str) -> ExecutionAnalysisType:
    try:
        return ExecutionAnalysisType(value)
    except ValueError as exc:
        valid = ", ".join(t.value for t in ExecutionAnalysisType)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowy typ analizy: {value}. Dozwolone: {valid}",
        ) from exc


def _canonical_analysis_type(value: ExecutionAnalysisType) -> str:
    if value == ExecutionAnalysisType.LOAD_FLOW:
        return "PF"
    if value == ExecutionAnalysisType.PF_UNBALANCED:
        return ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY
    if value in {
        ExecutionAnalysisType.SC_3F,
        ExecutionAnalysisType.SC_1F,
        ExecutionAnalysisType.SC_2F,
        ExecutionAnalysisType.SC_2F_G,
    }:
        return "short_circuit_sn"
    if value == ExecutionAnalysisType.PHASE_STATE_SN:
        return "phase_state_sn"
    if value == ExecutionAnalysisType.DYNAMIKA_RMS:
        return "dynamika_rms"
    # V12K-025: PROTECTION ma osobny endpoint (architektoniczna separacja
    # bo wymaga sc_run_id + protection_case_id). Realna ocena za
    # POST /protection-runs to application.analyses.protection.ocena_nadpradowa (tor
    # "protection_sn"). Drugi, martwy silnik `domain.protection_engine_v1`
    # (0 konsumentow produkcyjnych) skasowany w karcie RESULTSET-MARTWE-MAPPERY
    # (2026-09-30, zgoda B-01 w O-59); bramka wskrzeszenia w
    # scripts/resultset_v1_schema_guard.py.
    if value == ExecutionAnalysisType.PROTECTION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Analiza PROTECTION wymaga osobnego endpoint-u "
                "POST /api/projects/{project_id}/protection-runs "
                "(wymaga sc_run_id zakończonego biegu zwarciowego 3F albo 2F i "
                "protection_case_id przypadku, którego model niesie nastawy zabezpieczeń). "
                "Patrz V12K-025 w REJESTR_KONFLIKTOW.md."
            ),
        )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Nieobsługiwany typ analizy: {value.value}",
    )


def _normalize_solver_input(
    analysis_type: ExecutionAnalysisType,
    solver_input: dict[str, Any] | None,
) -> dict[str, Any]:
    options = dict(solver_input or {})
    if analysis_type == ExecutionAnalysisType.SC_3F:
        options.setdefault("fault_type", "3F")
    elif analysis_type == ExecutionAnalysisType.SC_1F:
        options.setdefault("fault_type", "1F")
    elif analysis_type == ExecutionAnalysisType.SC_2F:
        options.setdefault("fault_type", "2F")
    elif analysis_type == ExecutionAnalysisType.SC_2F_G:
        options.setdefault("fault_type", "2F+Z")
    return options


def _resolve_project_id(case_id: str, request: Request) -> str | None:
    uow_factory = getattr(request.app.state, "uow_factory", None)
    if uow_factory is None:
        return None
    parsed_case_id = _parse_uuid(case_id, "case_id")
    with uow_factory() as uow:
        study_case = uow.cases.get_study_case(parsed_case_id)
        if study_case is not None:
            return str(study_case.project_id)
    return None


@router.post(
    "/api/execution/study-cases/{case_id}/runs",
    response_model=RunResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_run(
    case_id: str, klucz: KluczTwin, request: CreateRunRequest, http_request: Request
) -> dict[str, Any]:
    _parse_uuid(case_id, "case_id")
    analysis_type = _parse_analysis_type(request.analysis_type)

    # Karta AB-P1: scenariusz NAZWANY (np. harmonogram zdarzeń biegu `dynamika_rms`)
    # wchodzi do biegu istniejącym mechanizmem `create_run(scenariusz=...)` — migawka
    # efektywna, projekcja `opcje_biegu_ze_scenariusza` i koperta rewizji ze scenariuszem.
    scenariusz = None
    if request.scenario_id is not None:
        try:
            scenariusz = wczytaj_scenariusz(klucz, request.scenario_id)
        except ScenariuszNieistniejeError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    try:
        run = create_canonical_run(
            case_id=case_id,
            klucz_twin=klucz,
            project_id=_resolve_project_id(case_id, http_request),
            analysis_type=_canonical_analysis_type(analysis_type),
            options=_normalize_solver_input(analysis_type, request.solver_input),
            scenariusz=scenariusz,
        )
        return run.to_execution_dict()
    except OdmowaDanychError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.get(
    "/api/execution/study-cases/{case_id}/runs",
    response_model=RunListResponse,
)
def list_runs(case_id: str) -> dict[str, Any]:
    _parse_uuid(case_id, "case_id")
    runs = list_canonical_runs_for_case(case_id)
    return {
        "runs": [run.to_execution_dict() for run in runs],
        "count": len(runs),
    }


def _stan_biegu_z_postepem(run: CanonicalRun) -> dict[str, Any]:
    """Kontrakt HTTP biegu + postęp z wykonawcy w tle (karta DYNAMIKA-W-TLE)."""
    postep = wykonawca_biegow.postep_biegu(run.id)
    return {**run.to_execution_dict(), "postep": None if postep is None else postep.to_dict()}


@router.post(
    "/api/execution/runs/{run_id}/execute",
    response_model=RunResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def execute_run(run_id: str, http_request: Request) -> dict[str, Any]:
    # Karta DYNAMIKA-W-TLE: bieg NIE wykonuje się w żądaniu — trafia do kolejki
    # wykonawcy w tle (jeden ciężki bieg naraz), odpowiedź 202 niesie stan QUEUED
    # (albo stan bieżący, gdy bieg był już zlecony/zakończony), a klient odpytuje
    # `GET /api/execution/runs/{run_id}` do stanu końcowego (DONE/FAILED/CANCELLED).
    # CV-4.2b: bieg wykonuje się TĄ SAMĄ fabryką `UnitOfWork`, którą widzi reszta
    # żądania — bieg zabezpieczeń (konfiguracja przypadku) i rozpływ/zwarcie z
    # konfiguracją audytu 2 stacji czytają bazę; bez fabryki wołającego wykonawca
    # budował własne połączenie z `DATABASE_URL` (inna baza niż `app.state`).
    # (Komentarz, nie docstring: opis operacji jest częścią snapshotu OpenAPI.)
    parsed_run_id = _parse_uuid(run_id, "run_id")

    try:
        run = wykonawca_biegow.zlec_bieg(
            parsed_run_id,
            uow_factory=getattr(http_request.app.state, "uow_factory", None),
        )
    except OdmowaDanychError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    # CV-2-W: po biegu NIE przestawiamy zadnego stanu na przypadku. Status wynikow
    # jest wyprowadzany z biegow przypadku i koperty rewizji, wiec zakonczony bieg
    # sam w sobie zmienia werdykt — nie ma czego zapisywac (i nie ma jak zapomniec).
    return _stan_biegu_z_postepem(run)


@router.post(
    "/api/execution/runs/{run_id}/cancel",
    response_model=RunResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def cancel_run(run_id: str) -> dict[str, Any]:
    # Karta DYNAMIKA-W-TLE: bieg w kolejce jest anulowany od razu (CANCELLED z
    # wyjaśnieniem); bieg w toku dostaje żądanie przerwania sprawdzane w punktach
    # przerwania wykonawcy (bieg czasowy: po każdym kroku całkowania; zwarcie: między
    # punktami zwarcia) — odpowiedź niesie stan bieżący, klient odpytuje do CANCELLED.
    # Bieg zakończony albo w toku bez punktów przerwania → 409 z nazwanym powodem.
    parsed_run_id = _parse_uuid(run_id, "run_id")
    try:
        run = wykonawca_biegow.anuluj_bieg(parsed_run_id)
    except BiegNieDoAnulowaniaError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except OdmowaDanychError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _stan_biegu_z_postepem(run)


@router.get(
    "/api/execution/runs/{run_id}",
    response_model=RunResponse,
)
def get_run(run_id: str) -> dict[str, Any]:
    parsed_run_id = _parse_uuid(run_id, "run_id")
    run = get_canonical_run(parsed_run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nie znaleziono obliczenia {run_id}",
        )
    return _stan_biegu_z_postepem(run)


@router.get(
    "/api/execution/runs/{run_id}/results",
    response_model=ResultSetResponse,
)
def get_run_results(run_id: str) -> dict[str, Any]:
    parsed_run_id = _parse_uuid(run_id, "run_id")
    run = get_canonical_run(parsed_run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nie znaleziono obliczenia {run_id}",
        )
    if run.status != "FINISHED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Wyniki niedostępne - status obliczenia: {run.status}",
        )
    return build_execution_result_set(run)
