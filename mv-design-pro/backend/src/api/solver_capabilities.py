from __future__ import annotations

from typing import Literal

from application.solvers.solver_capability_registry import (
    PhysicsDomain,
    get_solver_capability,
    solver_capabilities_by_analysis_type,
    solver_capabilities_contract,
)
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/solver-capabilities", tags=["solver-capabilities"])


class OcenaDowodowaZdolnosciV1(BaseModel):
    """Stopien dowodowy zdolnosci z rejestru `solver_input/provenance.py` (karta AB-1a D1).

    Niesie POWOD raportowalnosci albo jej braku — konsument nie dostaje samego
    `reportable: false`, tylko stopien, jego etykiete, uzasadnienie i odniesienie
    do dowodu.
    """

    model_config = ConfigDict(extra="forbid")

    capability_id: str
    tier: Literal["VALIDATED_SIMULATION", "DECLARATION", "UNVALIDATED_MODEL", "NOT_SIMULATED"]
    tier_pl: str
    claim_kind: Literal["DYNAMIC_PERFORMANCE", "DECLARED_CONFIGURATION"]
    claim_kind_pl: str
    regulatory_evidence_eligible: bool
    rationale_pl: str
    audit_ref: str


class ZdolnoscSolveraV1(BaseModel):
    """Jeden wpis rejestru zdolnosci solverow (`SolverCapability.to_dict`)."""

    model_config = ConfigDict(extra="forbid")

    capability: str
    analysis_type: str
    availability: Literal["available", "withdrawn"]
    implementation_status: Literal["implemented"]
    solver_version: str
    required_inputs: list[str]
    output_contract: str
    proof_support: bool
    #: WYPROWADZONE z `ocena_dowodowa.regulatory_evidence_eligible` (nie zapisane).
    reportable: bool
    ocena_dowodowa: OcenaDowodowaZdolnosciV1
    reference_test: str
    applicability: str
    physics_domain: PhysicsDomain
    physics_domain_pl: str
    reprezentacja: Literal["abc", "zgodna", "skladowe"]


class RejestrZdolnosciSolverowV1(BaseModel):
    """Kontrakt `SolverCapabilityRegistryV1` — komplet rejestru z agregatami."""

    model_config = ConfigDict(extra="forbid")

    contract: Literal["SolverCapabilityRegistryV1"]
    capabilities: list[ZdolnoscSolveraV1]
    all_available: bool
    all_implemented: bool
    all_proof_supported: bool
    all_reportable: bool
    not_reportable: list[str]


class ZdolnosciRodzajuAnalizyV1(BaseModel):
    """Zdolnosci jednego `analysis_type` (pole rejestru, bez prefiksu biegu)."""

    model_config = ConfigDict(extra="forbid")

    analysis_type: str
    capabilities: list[ZdolnoscSolveraV1]


@router.get("", response_model=RejestrZdolnosciSolverowV1)
def list_capabilities() -> dict[str, object]:
    return solver_capabilities_contract()


@router.get("/analysis-type/{analysis_type}", response_model=ZdolnosciRodzajuAnalizyV1)
def get_capabilities_for_analysis_type(analysis_type: str) -> dict[str, object]:
    capabilities = solver_capabilities_by_analysis_type(analysis_type)
    return {
        "analysis_type": analysis_type,
        "capabilities": [capability.to_dict() for capability in capabilities],
    }


@router.get("/{capability}", response_model=ZdolnoscSolveraV1)
def get_capability(capability: str) -> dict[str, object]:
    try:
        return get_solver_capability(capability).to_dict()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
