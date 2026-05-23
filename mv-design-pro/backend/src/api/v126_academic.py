from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from enm.store import get_enm
from fastapi import APIRouter, HTTPException, status
from network_model.solvers.v126_academic import V126AcademicSolver
from pydantic import BaseModel
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126ConverterInput,
    V126EarthingInput,
    V126HarmonicSourceInput,
    V126InsulationInput,
    V126MotorInput,
    V126RunRequest,
    build_v126_input_from_enm,
)

router = APIRouter(prefix="/api", tags=["v12.6-academic"])

_solver = V126AcademicSolver()
_runs: dict[str, dict[str, Any]] = {}


class V126RunResponse(BaseModel):
    run_id: str
    case_id: str
    analysis_type: V126AnalysisType
    status: str
    result_url: str
    trace_url: str
    deterministic_hash: str


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _require_run(run_id: UUID, analysis_type: V126AnalysisType) -> dict[str, Any]:
    run = _runs.get(str(run_id))
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nie znaleziono uruchomienia V12.6.")
    if run["analysis_type"] != analysis_type.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Typ analizy w sciezce nie zgadza sie z zapisanym uruchomieniem.",
        )
    return run


def _with_parameter_payloads(model: V126AcademicInput, parameters: dict[str, Any]) -> V126AcademicInput:
    update: dict[str, Any] = {"parameters": parameters}
    if isinstance(parameters.get("earthing"), dict):
        update["earthing"] = V126EarthingInput.model_validate(parameters["earthing"])
    if isinstance(parameters.get("insulation"), list):
        update["insulation"] = [
            V126InsulationInput.model_validate(item)
            for item in parameters["insulation"]
            if isinstance(item, dict)
        ]
    if isinstance(parameters.get("motors"), list):
        update["motors"] = [
            V126MotorInput.model_validate(item)
            for item in parameters["motors"]
            if isinstance(item, dict)
        ]
    if isinstance(parameters.get("harmonic_sources"), list):
        update["harmonic_sources"] = [
            V126HarmonicSourceInput.model_validate(item)
            for item in parameters["harmonic_sources"]
            if isinstance(item, dict)
        ]
    if isinstance(parameters.get("converters"), list):
        update["converters"] = [
            V126ConverterInput.model_validate(item)
            for item in parameters["converters"]
            if isinstance(item, dict)
        ]
    return model.model_copy(update=update)


@router.post("/cases/{case_id}/runs/v126/{analysis_type}", response_model=V126RunResponse)
def run_v126_analysis(
    case_id: UUID,
    analysis_type: V126AnalysisType,
    request: V126RunRequest,
) -> V126RunResponse:
    enm = get_enm(str(case_id))
    if not enm.buses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Przypadek nie ma committed ENM z wezłami. V12.6 nie uruchamia obliczen z draftu UI.",
        )
    model = _with_parameter_payloads(build_v126_input_from_enm(enm, parameters=request.parameters), request.parameters)
    result = _solver.run(analysis_type, model)
    run_id = UUID(hex=result["deterministic_hash"][:32])
    run_record = {
        "run_id": str(run_id),
        "case_id": str(case_id),
        "analysis_type": analysis_type.value,
        "status": "FINISHED",
        "created_at": _now_iso(),
        "input": model.model_dump(mode="json"),
        "result": result,
        "deterministic_hash": result["deterministic_hash"],
    }
    _runs[str(run_id)] = run_record
    return V126RunResponse(
        run_id=str(run_id),
        case_id=str(case_id),
        analysis_type=analysis_type,
        status="FINISHED",
        result_url=f"/api/analysis-runs/{run_id}/results/v126/{analysis_type.value}",
        trace_url=f"/api/analysis-runs/{run_id}/results/v126/{analysis_type.value}/trace",
        deterministic_hash=result["deterministic_hash"],
    )


@router.get("/analysis-runs/{run_id}/results/v126/{analysis_type}")
def get_v126_result(run_id: UUID, analysis_type: V126AnalysisType) -> dict[str, Any]:
    run = _require_run(run_id, analysis_type)
    return {
        "run_id": run["run_id"],
        "case_id": run["case_id"],
        "analysis_type": run["analysis_type"],
        "status": run["status"],
        "created_at": run["created_at"],
        "result": run["result"],
    }


@router.get("/analysis-runs/{run_id}/results/v126/{analysis_type}/trace")
def get_v126_trace(run_id: UUID, analysis_type: V126AnalysisType) -> dict[str, Any]:
    run = _require_run(run_id, analysis_type)
    result = run["result"]
    return {
        "run_id": run["run_id"],
        "analysis_type": run["analysis_type"],
        "trace_version": "AcademicWhiteBoxTraceV1",
        "deterministic_hash": result["deterministic_hash"],
        "steps": result["white_box_trace"],
    }


@router.get("/catalog/v126/{namespace}")
def get_v126_catalog(namespace: str) -> dict[str, Any]:
    catalogs: dict[str, Any] = {
        "analysis-types": [item.value for item in V126AnalysisType],
        "harmonic-limits": {
            "thdu_pnen50160_percent": 8.0,
            "thdu_ieee519_percent": 5.0,
            "tdd_ieee519_default_percent": 5.0,
            "individual_percent": {"5": 6.0, "7": 5.0, "11": 3.5, "13": 3.0},
        },
        "insulation-levels": [
            {"u_m_kv": 12.0, "bil_kv": 75.0, "short_duration_50hz_kv": 28.0},
            {"u_m_kv": 17.5, "bil_kv": 95.0, "short_duration_50hz_kv": 38.0},
            {"u_m_kv": 24.0, "bil_kv": 125.0, "short_duration_50hz_kv": 50.0},
            {"u_m_kv": 36.0, "bil_kv": 170.0, "short_duration_50hz_kv": 70.0},
        ],
        "reliability-defaults": [
            {"element": "linia_napowietrzna_sn", "lambda_per_km_year": 0.08, "mttr_h": 3.5},
            {"element": "kabel_sn", "lambda_per_km_year": 0.015, "mttr_h": 12.0},
            {"element": "transformator_sn_nn", "lambda_per_year": 0.008, "mttr_h": 48.0},
            {"element": "pole_sn", "lambda_per_year": 0.015, "mttr_h": 4.0},
        ],
        "converter-modes": ["GFL", "GFM_droop", "VSM", "Grid_Supporting"],
    }
    if namespace not in catalogs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nieznany katalog V12.6.")
    return {"namespace": namespace, "items": catalogs[namespace]}
