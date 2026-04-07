"""
Results Workspace API — PR-22 + PR-23 (Contract Freeze)

Single endpoint aggregating runs, batches, and comparisons
for a study case into a unified workspace projection.

CANONICAL ALIGNMENT:
- SYSTEM_SPEC.md: Read-only API, no physics
- ARCHITECTURE.md: API layer, no solver logic

INVARIANTS:
- ZERO solver changes
- ZERO model mutations
- Pure read-only projection endpoint
- Deterministic output

PR-23 CONTRACT:
Response schema MUST contain exactly:
  { runs, batches, comparisons, metadata, content_hash,
    study_case_id, latest_done_run_id, deterministic_hash,
    source_run_ids, source_batch_ids, source_comparison_ids }
No dynamic fields. No None where not explicitly allowed.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from application.execution_engine.service import ExecutionEngineService
from application.execution_engine.errors import StudyCaseNotFoundError
from application.batch_execution_service import BatchExecutionService
from application.read_models.results_workspace_projection import (
    build_workspace_projection,
)
from api.execution_runs import get_engine
from enm.canonical_analysis import list_runs_for_case as list_canonical_runs_for_case

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/results-workspace",
    tags=["results-workspace"],
)


def _get_execution_service(request: Request) -> ExecutionEngineService:
    """Resolve ExecutionEngineService from app state."""
    if hasattr(request.app.state, "execution_engine_service"):
        return request.app.state.execution_engine_service
    return get_engine()


def _get_batch_service(request: Request) -> BatchExecutionService:
    """Resolve BatchExecutionService from app state."""
    if hasattr(request.app.state, "batch_execution_service"):
        return request.app.state.batch_execution_service
    return BatchExecutionService(_get_execution_service(request))


@router.get("/{study_case_id}")
async def get_results_workspace(
    study_case_id: UUID,
    request: Request,
) -> dict:
    """
    Get unified results workspace projection for a study case.

    Returns aggregated view of:
    - All runs for the case (sorted by created_at desc)
    - All batches for the case (sorted by created_at desc)
    - All comparisons for the case (sorted by created_at desc)
    - Latest done run ID
    - Deterministic content hash

    INVARIANTS:
    - Read-only — no mutations
    - Deterministic — same data produces same hash
    - No physics — pure aggregation
    """
    try:
        execution_service = _get_execution_service(request)
        batch_service = _get_batch_service(request)

        # Fetch runs
        try:
            runs = list_canonical_runs_for_case(str(study_case_id))
        except (StudyCaseNotFoundError, Exception):
            try:
                runs = execution_service.list_runs_for_case(study_case_id)
            except Exception:
                runs = []

        # Fetch batches
        try:
            batches = batch_service.list_batches_for_case(study_case_id)
        except Exception:
            batches = []

        # Comparisons — read from service if available
        comparisons: list[dict] = []
        if hasattr(request.app.state, "comparison_service"):
            try:
                comp_service = request.app.state.comparison_service
                raw_comparisons = comp_service.list_comparisons_for_case(study_case_id)
                comparisons = [
                    {
                        "comparison_id": str(getattr(c, "comparison_id", getattr(c, "id", ""))),
                        "analysis_type": str(getattr(c, "analysis_type", "")),
                        "base_scenario_id": str(getattr(c, "base_scenario_id", "")),
                        "other_scenario_id": str(getattr(c, "other_scenario_id", "")),
                        "input_hash": str(getattr(c, "input_hash", "")),
                        "created_at": str(getattr(c, "created_at", "")),
                    }
                    for c in raw_comparisons
                ]
            except Exception:
                comparisons = []

        projection = build_workspace_projection(
            study_case_id=study_case_id,
            runs=runs,
            batches=batches,
            comparisons=comparisons,
        )

        return projection.to_dict()

    except StudyCaseNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Przypadek obliczeniowy {study_case_id} nie istnieje",
        )
    except Exception as exc:
        logger.exception("Results workspace projection failed for case %s", study_case_id)
        raise HTTPException(
            status_code=500,
            detail="Blad projekcji przestrzeni roboczej wynikow",
        ) from exc
