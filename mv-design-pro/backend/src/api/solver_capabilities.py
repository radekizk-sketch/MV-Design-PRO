from __future__ import annotations

from application.solvers.solver_capability_registry import (
    get_solver_capability,
    solver_capabilities_by_analysis_type,
    solver_capabilities_contract,
)
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/solver-capabilities", tags=["solver-capabilities"])


@router.get("")
def list_capabilities() -> dict[str, object]:
    return solver_capabilities_contract()


@router.get("/analysis-type/{analysis_type}")
def get_capabilities_for_analysis_type(analysis_type: str) -> dict[str, object]:
    capabilities = solver_capabilities_by_analysis_type(analysis_type)
    return {
        "analysis_type": analysis_type,
        "capabilities": [capability.to_dict() for capability in capabilities],
    }


@router.get("/{capability}")
def get_capability(capability: str) -> dict[str, object]:
    try:
        return get_solver_capability(capability).to_dict()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
