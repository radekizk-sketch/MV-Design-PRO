from __future__ import annotations

from catalog.profiles.nc_rfg import list_available_operators, load_nc_rfg_profile
from fastapi import APIRouter, HTTPException, status
from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeRunResult,
    NcRfgPtpireeSolver,
)
from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG

router = APIRouter(prefix="/api/ncrfg-tests", tags=["ncrfg-ptpiree-tests"])
_solver = NcRfgPtpireeSolver()


@router.get("/catalog")
def get_ncrfg_test_catalog() -> dict[str, object]:
    operators = []
    for operator_id in list_available_operators():
        profile = load_nc_rfg_profile(operator_id)
        operators.append(
            {
                "operator_id": profile.operator_id,
                "operator_name_pl": profile.operator_name_pl,
                "last_revision": profile.last_revision,
                "module_types": [item.model_dump(mode="json") for item in profile.module_types],
                "frequency_response": profile.frequency_response.model_dump(mode="json"),
                "reactive_power": profile.reactive_power.model_dump(mode="json"),
                "p_recovery_after_fault": profile.p_recovery_after_fault.model_dump(mode="json"),
            }
        )
    return {
        "procedure_version": "PTPiREE Procedura testowania v3.0",
        "source_ref": "https://ptpiree.pl/kodeksy-sieci/procedura-testowania/",
        "operators": operators,
        "tests": [item.model_dump(mode="json") for item in TEST_CATALOG],
    }


@router.post("/run", response_model=NcRfgPtpireeRunResult)
def run_ncrfg_ptpiree_tests(request: NcRfgPtpireeRunRequest) -> NcRfgPtpireeRunResult:
    try:
        return _solver.run(request)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
