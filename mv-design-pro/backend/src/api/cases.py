from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.analysis_run.read_model import canonicalize_json
from application.sld_projection import SldProjectionService
from application.wizard_actions import WizardActionService
from application.wizard_actions.service import InvalidActionPayload
from fastapi import APIRouter, Depends, HTTPException, status
from infrastructure.persistence.unit_of_work import UnitOfWork

router = APIRouter()


def _build_service(uow_factory: Any) -> SldProjectionService:
    return SldProjectionService(uow_factory)


def _build_wizard_action_service(uow_factory: Any) -> WizardActionService:
    return WizardActionService(uow_factory)


@router.get("/cases/{case_id}/sld")
def get_case_sld(
    case_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    try:
        parsed_case_id = UUID(case_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="case_id must be a valid UUID",
        ) from exc
    service = _build_service(uow_factory)
    try:
        diagram = service.get_sld_for_case(parsed_case_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return canonicalize_json(diagram.to_dict())


@router.get("/cases/{case_id}/snapshot")
def get_case_snapshot(
    case_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    try:
        parsed_case_id = UUID(case_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="case_id must be a valid UUID",
        ) from exc
    service = _build_wizard_action_service(uow_factory)
    try:
        snapshot = service.get_case_snapshot(parsed_case_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return canonicalize_json(snapshot.to_dict())


@router.post("/cases/{case_id}/actions/batch")
def submit_case_action_batch(
    case_id: str,
    payload: dict[str, Any],
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    try:
        parsed_case_id = UUID(case_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="case_id must be a valid UUID",
        ) from exc
    actions = payload.get("actions")
    if not isinstance(actions, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload must include an actions list.",
        )
    service = _build_wizard_action_service(uow_factory)
    try:
        result = service.submit_batch(parsed_case_id, actions)
    except InvalidActionPayload as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return canonicalize_json(result.to_dict())
