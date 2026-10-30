"""
Result Contract v1 API.
"""

from __future__ import annotations

import json
from typing import Any

from api.parsowanie_uuid import parsuj_uuid
from application.result_mapping.canonical_run_to_resultset_v1 import (
    build_resultset_v1_from_canonical_run,
)
from domain.opis_przebiegu import stan_przebiegu_pl
from domain.result_contract_v1_schema import generate_schema
from enm.canonical_analysis import get_run as get_canonical_run
from fastapi import APIRouter, HTTPException, status

router = APIRouter(tags=["result-contract-v1"])


@router.get("/api/execution/runs/{run_id}/results/v1")
def get_resultset_v1(run_id: str) -> dict[str, Any]:
    parsed_run_id = parsuj_uuid(run_id, "run_id")
    run = get_canonical_run(parsed_run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nie znaleziono wskazanego przebiegu obliczeń.",
        )
    if run.status != "FINISHED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Wyniki niedostępne — przebieg {stan_przebiegu_pl(run.status)}.",
        )

    result_v1 = build_resultset_v1_from_canonical_run(run)
    return json.loads(result_v1.model_dump_json())


@router.get("/api/result-contract/schema")
def get_result_contract_schema() -> dict[str, Any]:
    return generate_schema()
