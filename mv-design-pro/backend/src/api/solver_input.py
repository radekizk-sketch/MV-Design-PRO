"""
API endpoints for solver-input contract (read-only, no side-effects).

Endpoints:
    GET /api/cases/{case_id}/analysis/solver-input/{analysis_type}
    GET /api/cases/{case_id}/analysis/eligibility
"""

from __future__ import annotations

from typing import Any

from domain.study_case import StudyCaseConfig
from fastapi import APIRouter, HTTPException, Path
from network_model.catalog.repository import get_default_mv_catalog
from network_model.core.graph import NetworkGraph
from pydantic import BaseModel
from solver_input.builder import build_solver_input
from solver_input.contracts import (
    SolverAnalysisType,
)
from solver_input.eligibility import build_eligibility_map

router = APIRouter(
    prefix="/api/cases",
    tags=["solver-input"],
)


# ---------------------------------------------------------------------------
# Stub: In production, these would come from persistence layer.
# For PR-12, we expose the contract via test-friendly endpoints.
# ---------------------------------------------------------------------------


def _get_graph_for_case(case_id: str) -> NetworkGraph:
    """
    Stub: retrieve NetworkGraph for a given case.

    In production, this would load from persistence via UoW.
    For now, returns empty graph to demonstrate API contract.
    """
    return NetworkGraph(network_model_id=case_id)


def _get_config_for_case(case_id: str) -> StudyCaseConfig:
    """Stub: retrieve StudyCaseConfig for a given case."""
    return StudyCaseConfig()


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class SolverInputResponse(BaseModel):
    """Response wrapper for solver-input endpoint."""

    solver_input_version: str
    case_id: str
    enm_revision: str
    analysis_type: str
    eligibility: dict[str, Any]
    provenance_summary: dict[str, Any]
    payload: dict[str, Any]
    trace: list[dict[str, Any]]


class EligibilityMapResponse(BaseModel):
    """Response wrapper for eligibility endpoint."""

    entries: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{case_id}/analysis/solver-input/{analysis_type}",
    response_model=SolverInputResponse,
    summary="Get solver-input envelope for a specific analysis type",
    description=(
        "Returns the canonical solver-input envelope with payload, "
        "eligibility, and provenance trace. Read-only, no side-effects."
    ),
)
async def get_solver_input(
    case_id: str = Path(..., description="Study case ID"),
    analysis_type: str = Path(
        ...,
        description="Analysis type: short_circuit_3f, short_circuit_1f, load_flow, protection",
    ),
) -> SolverInputResponse:
    """Generate and return solver-input for the given case and analysis type."""
    # Validate analysis_type
    try:
        at = SolverAnalysisType(analysis_type)
    except ValueError:
        valid_types = [t.value for t in SolverAnalysisType]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid analysis_type '{analysis_type}'. Valid: {valid_types}",
        )

    graph = _get_graph_for_case(case_id)
    config = _get_config_for_case(case_id)
    catalog = get_default_mv_catalog()

    envelope = build_solver_input(
        graph=graph,
        catalog=catalog,
        case_id=case_id,
        enm_revision="current",
        analysis_type=at,
        config=config,
    )

    return SolverInputResponse(
        solver_input_version=envelope.solver_input_version,
        case_id=envelope.case_id,
        enm_revision=envelope.enm_revision,
        analysis_type=envelope.analysis_type.value,
        eligibility=envelope.eligibility.model_dump(mode="json"),
        provenance_summary=envelope.provenance_summary.model_dump(mode="json"),
        payload=envelope.payload,
        trace=[t.model_dump(mode="json") for t in envelope.trace],
    )


@router.get(
    "/{case_id}/analysis/eligibility",
    response_model=EligibilityMapResponse,
    summary="Get eligibility map for all analysis types",
    description=(
        "Returns eligibility status (READY/NOT_READY + blockers/warnings) "
        "for each analysis type. Read-only, no side-effects."
    ),
)
async def get_eligibility(
    case_id: str = Path(..., description="Study case ID"),
) -> EligibilityMapResponse:
    """Check eligibility for all analysis types for the given case."""
    graph = _get_graph_for_case(case_id)
    catalog = get_default_mv_catalog()

    emap = build_eligibility_map(graph, catalog)

    return EligibilityMapResponse(
        entries=[e.model_dump(mode="json") for e in emap.entries],
    )
