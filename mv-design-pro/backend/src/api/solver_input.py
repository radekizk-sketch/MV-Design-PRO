"""
API endpoints for solver-input contract (read-only, no side-effects).

Endpoints:
    GET /api/cases/{case_id}/analysis/solver-input/{analysis_type}
    GET /api/cases/{case_id}/analysis/eligibility
"""

from __future__ import annotations

from typing import Any

from domain.study_case import StudyCaseConfig
from api.dependencies import get_uow_factory
from fastapi import APIRouter, Depends, HTTPException, Path
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


# =============================================================================
# Phase 33: Audit2 Power Flow endpoint — uzywa Audit2PowerFlowWrapper
# =============================================================================


class Audit2PowerFlowRequest(BaseModel):
    """Request dla POST /api/v1/audit2-power-flow."""

    case_id: str
    project_id: str
    station_id: str
    base_mva: float = 100.0
    slack_node_id: str | None = None


class Audit2PowerFlowResponse(BaseModel):
    """Response z applied audit trail + (optional) solution metadata."""

    case_id: str
    project_id: str
    station_id: str
    audit2_applied: dict[str, Any] = {}
    solver_attempted: bool = False
    solver_error: str | None = None
    audit2_extensions_keys: list[str] = []


@router.post(
    "/audit2-power-flow",
    response_model=Audit2PowerFlowResponse,
    summary="Phase 33: Power flow z audit2 adjustments z DB station config",
    description=(
        "Wczytuje audit2 config z DB (project_id + station_id), buduje "
        "PowerFlowInput z audit2_extensions, aplikuje przez "
        "Audit2PowerFlowWrapper i zwraca audit trail + solver result."
    ),
)
def run_audit2_power_flow(
    req: Audit2PowerFlowRequest,
    uow_factory=Depends(get_uow_factory),
) -> Audit2PowerFlowResponse:
    """Phase 33: pelna petla — DB audit2 -> wrapper -> graph mutation."""
    from uuid import UUID

    from infrastructure.persistence.models import StationAudit2ConfigORM
    from network_model.solvers.power_flow_types import (
        PowerFlowInput,
        PowerFlowOptions,
        SlackSpec,
    )
    from solver_input.audit2_der_payload import (
        build_station_audit2_payload,
        extract_solver_extensions_from_payload,
    )
    from solver_input.audit2_pf_wrapper import solve_power_flow_with_audit2

    # 1. Pobierz audit2 config z DB.
    try:
        pid_uuid = UUID(req.project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid project_id: {exc}") from exc

    audit2_extensions: dict[str, Any] | None = None
    with uow_factory() as uow:
        assert uow.session is not None
        cfg = (
            uow.session.query(StationAudit2ConfigORM)
            .filter(
                StationAudit2ConfigORM.project_id == pid_uuid,
                StationAudit2ConfigORM.station_id == req.station_id,
            )
            .one_or_none()
        )
        if cfg is not None:
            payload = build_station_audit2_payload(
                station_id=cfg.station_id,
                mv_neutral_grounding_ref=cfg.mv_neutral_grounding_ref,
                tap_changer_refs=list(cfg.tap_changer_refs or []),
                der_specs=list(cfg.der_specs or []),
                transformer_tap_changers=dict(cfg.transformer_tap_changers or {}),
            )
            audit2_extensions = extract_solver_extensions_from_payload(payload)

    # 2. Zbuduj PowerFlowInput.
    graph = _get_graph_for_case(req.case_id)
    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=req.base_mva,
        slack=SlackSpec(node_id=req.slack_node_id or "slack-stub", u_pu=1.0, angle_rad=0.0),
        pq=[],
        options=PowerFlowOptions(),
        audit2_extensions=audit2_extensions,
    )

    # 3. Wywolaj wrapper. Solver moze rzucic na empty graph — przechwyc.
    applied: dict[str, Any] = {}
    solver_error: str | None = None
    try:
        result = solve_power_flow_with_audit2(pf_input)
        applied = result.applied_audit2
        solver_attempted = True
    except Exception as exc:
        # Apply ZOSTAL juz wywolany przed solverem — extract applied state
        # bezposrednio (nie zgubione).
        from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

        applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=audit2_extensions)
        solver_error = str(exc)
        solver_attempted = True

    return Audit2PowerFlowResponse(
        case_id=req.case_id,
        project_id=req.project_id,
        station_id=req.station_id,
        audit2_applied=applied,
        solver_attempted=solver_attempted,
        solver_error=solver_error,
        audit2_extensions_keys=list((audit2_extensions or {}).keys()),
    )


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
    # Phase 17: audit2 extensions exposed via API for solver consumers.
    audit2_extensions: dict[str, Any] | None = None


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
    project_id: str | None = None,
    station_id: str | None = None,
    uow_factory=Depends(get_uow_factory),
) -> SolverInputResponse:
    """
    Generate and return solver-input for the given case and analysis type.

    Phase 17: jesli `project_id` + `station_id` przekazane, podlacza
    audit2 config z bazy do envelope (`audit2_extensions` populated).
    """
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

    # Phase 17: pull audit2 station config z DB (gdy project+station pdane).
    audit2_payload: dict[str, Any] | None = None
    if project_id and station_id:
        from uuid import UUID

        from infrastructure.persistence.models import StationAudit2ConfigORM

        try:
            pid_uuid = UUID(project_id)
        except ValueError:
            pid_uuid = None

        if pid_uuid is not None:
            with uow_factory() as uow:
                assert uow.session is not None
                cfg = (
                    uow.session.query(StationAudit2ConfigORM)
                    .filter(
                        StationAudit2ConfigORM.project_id == pid_uuid,
                        StationAudit2ConfigORM.station_id == station_id,
                    )
                    .one_or_none()
                )
                if cfg is not None:
                    audit2_payload = {
                        "station_id": cfg.station_id,
                        "mv_neutral_grounding_ref": cfg.mv_neutral_grounding_ref,
                        "tap_changer_refs": list(cfg.tap_changer_refs or []),
                        "der_specs": list(cfg.der_specs or []),
                        # Phase 22: per-transformer mapping dla apply_audit2_to_network_model.
                        "transformer_tap_changers": dict(cfg.transformer_tap_changers or {}),
                    }

    envelope = build_solver_input(
        graph=graph,
        catalog=catalog,
        case_id=case_id,
        enm_revision="current",
        analysis_type=at,
        config=config,
        audit2_station_payload=audit2_payload,
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
        audit2_extensions=envelope.audit2_extensions,
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
