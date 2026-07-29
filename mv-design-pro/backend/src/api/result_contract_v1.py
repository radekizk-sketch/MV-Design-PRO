"""
Result Contract v1 API.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from domain.result_builder_v1 import build_resultset_v1
from domain.result_contract_v1_schema import generate_schema
from enm.canonical_analysis import build_execution_result_set
from enm.canonical_analysis import get_run as get_canonical_run
from fastapi import APIRouter, HTTPException, status

router = APIRouter(tags=["result-contract-v1"])


def _parse_uuid(value: str, field_name: str = "id") -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} musi byc poprawnym UUID",
        ) from exc


@router.get("/api/execution/runs/{run_id}/results/v1")
def get_resultset_v1(run_id: str) -> dict[str, Any]:
    parsed_run_id = _parse_uuid(run_id, "run_id")
    run = get_canonical_run(parsed_run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run {run_id} not found",
        )
    if run.status != "FINISHED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Wyniki niedostepne - status przebiegu: {run.status}",
        )

    rs_dict = build_execution_result_set(run)
    element_results_raw = [
        {
            "element_ref": er["element_ref"],
            "element_type": er.get("element_type", "unknown"),
            "values": er.get("values", {}),
        }
        for er in rs_dict.get("element_results", [])
    ]
    result_v1 = build_resultset_v1(
        run_id=str(run.id),
        analysis_type=rs_dict.get("analysis_type", ""),
        solver_input_hash=run.input_hash,
        validation=rs_dict.get("validation_snapshot", {}),
        readiness=rs_dict.get("readiness_snapshot", {}),
        element_results_raw=element_results_raw,
        global_results=rs_dict.get("global_results", {}),
        run_finished_at=run.finished_at.isoformat() if run.finished_at else None,
    )
    return json.loads(result_v1.model_dump_json())


@router.get("/api/result-contract/schema")
def get_result_contract_schema() -> dict[str, Any]:
    return generate_schema()
