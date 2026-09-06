"""
P11a - SLD (Single Line Diagram) API Endpoints.

Production contract:
- overlay is read-only,
- overlay is built only from canonical run data,
- no fallback to legacy result readers.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.canonical_run_views import build_sld_overlay
from api.dependencies import get_uow_factory
from application.analysis_run.read_model import canonicalize_json
from enm.canonical_analysis import get_run as get_canonical_run
from fastapi import APIRouter, Depends, HTTPException, Query, status
from infrastructure.persistence.unit_of_work import UnitOfWork

router = APIRouter()


@router.get("/projects/{project_id}/sld/{diagram_id}/overlay")
def get_sld_result_overlay(
    project_id: UUID,
    diagram_id: UUID,
    run_id: UUID = Query(..., description="Analysis run ID for result overlay"),
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    canonical_run = get_canonical_run(run_id)
    if canonical_run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run {run_id} not found",
        )
    if canonical_run.project_id is not None and str(canonical_run.project_id) != str(project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Przebieg analizy nie należy do tego projektu",
        )
    with uow_factory() as uow:
        diagram = uow.sld.get(diagram_id)
    if diagram is None or str(diagram.get("project_id")) != str(project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SLD diagram not found",
        )
    return canonicalize_json(
        build_sld_overlay(
            canonical_run,
            diagram_id=diagram_id,
            sld_payload=diagram.get("payload", {}),
            uow_factory=uow_factory,
        )
    )
