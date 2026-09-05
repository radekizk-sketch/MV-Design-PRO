"""
Execution Runs API.

Production path:
    domain-ops -> ENM snapshot -> canonical analysis run -> result set
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.klucz_twin_dep import KluczTwin
from application.execution_engine import ExecutionEngineService
from domain.execution import ExecutionAnalysisType
from enm.canonical_analysis import (
    build_execution_result_set,
)
from enm.canonical_analysis import (
    create_run as create_canonical_run,
)
from enm.canonical_analysis import (
    execute_run as execute_canonical_run,
)
from enm.canonical_analysis import (
    get_run as get_canonical_run,
)
from enm.canonical_analysis import (
    list_runs_for_case as list_canonical_runs_for_case,
)
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

router = APIRouter(tags=["execution-runs"])

# Retained only for compatibility with modules/tests importing get_engine().
_engine = ExecutionEngineService()


def get_engine() -> ExecutionEngineService:
    return _engine


class CreateRunRequest(BaseModel):
    analysis_type: str = Field(
        ...,
        description=(
            "Typ analizy: SC_3F, SC_1F, SC_2F, SC_2F_G, LOAD_FLOW, "
            "PHASE_STATE_SN, DYNAMIC_STABILITY, SOURCE_COMPLIANCE"
        ),
    )
    solver_input: dict[str, Any] = Field(default_factory=dict, description="Opcje solvera")
    readiness: dict[str, Any] | None = Field(None, description="Legacy - ignorowane")
    eligibility: dict[str, Any] | None = Field(None, description="Legacy - ignorowane")


class RunResponse(BaseModel):
    id: str
    study_case_id: str
    analysis_type: str
    solver_input_hash: str
    status: str
    started_at: str | None = None
    finished_at: str | None = None
    error_message: str | None = None


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
    if value in {
        ExecutionAnalysisType.SC_3F,
        ExecutionAnalysisType.SC_1F,
        ExecutionAnalysisType.SC_2F,
        ExecutionAnalysisType.SC_2F_G,
    }:
        return "short_circuit_sn"
    if value == ExecutionAnalysisType.PHASE_STATE_SN:
        return "phase_state_sn"
    if value == ExecutionAnalysisType.DYNAMIC_STABILITY:
        return "dynamic_stability"
    if value == ExecutionAnalysisType.SOURCE_COMPLIANCE:
        return "source_compliance"
    # V12K-025: PROTECTION ma osobny endpoint (architektoniczna separacja
    # bo wymaga sc_run_id + protection_case_id + protection_engine_v1).
    if value == ExecutionAnalysisType.PROTECTION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Analiza PROTECTION wymaga osobnego endpoint-u "
                "POST /api/projects/{project_id}/protection-runs "
                "(wymaga sc_run_id z poprzedniej analizy SC + protection_case_id "
                "z study_case.protection_config). Patrz V12K-025 w REJESTR_KONFLIKTOW.md."
            ),
        )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Nieobslugiwany typ analizy: {value.value}",
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

    try:
        run = create_canonical_run(
            case_id=case_id,
            klucz_twin=klucz,
            project_id=_resolve_project_id(case_id, http_request),
            analysis_type=_canonical_analysis_type(analysis_type),
            options=_normalize_solver_input(analysis_type, request.solver_input),
        )
        return run.to_execution_dict()
    except ValueError as exc:
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


@router.post(
    "/api/execution/runs/{run_id}/execute",
    response_model=RunResponse,
)
def execute_run(run_id: str) -> dict[str, Any]:
    parsed_run_id = _parse_uuid(run_id, "run_id")

    try:
        run = execute_canonical_run(parsed_run_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    # CV-2-W: po biegu NIE przestawiamy zadnego stanu na przypadku. Status wynikow
    # jest wyprowadzany z biegow przypadku i koperty rewizji, wiec zakonczony bieg
    # sam w sobie zmienia werdykt — nie ma czego zapisywac (i nie ma jak zapomniec).
    return run.to_execution_dict()


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
    return run.to_execution_dict()


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
