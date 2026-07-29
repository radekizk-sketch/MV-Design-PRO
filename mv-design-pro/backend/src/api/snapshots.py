from __future__ import annotations

from collections.abc import Callable
from typing import Any

from api.dependencies import get_uow_factory
from application.analysis_run.read_model import canonicalize_json
from application.snapshots import SnapshotService
from fastapi import APIRouter, Depends, HTTPException, status
from infrastructure.persistence.unit_of_work import UnitOfWork

router = APIRouter()


def _build_service(uow_factory: Any) -> SnapshotService:
    return SnapshotService(uow_factory)


@router.get("/snapshots/{snapshot_id}")
def get_snapshot(
    snapshot_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    service = _build_service(uow_factory)
    try:
        snapshot = service.get_snapshot(snapshot_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return canonicalize_json(snapshot.to_dict())


@router.post("/snapshots/{snapshot_id}/actions")
def submit_snapshot_action(
    snapshot_id: str,
    payload: dict[str, Any],
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    service = _build_service(uow_factory)
    try:
        result, new_snapshot_id = service.submit_action(snapshot_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    response: dict[str, Any] = {"result": result.to_dict()}
    if new_snapshot_id is not None:
        response["new_snapshot_id"] = new_snapshot_id
    return canonicalize_json(response)


@router.post("/snapshots/{snapshot_id}/actions:batch")
def submit_snapshot_action_batch(
    snapshot_id: str,
    payload: dict[str, Any],
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    actions = payload.get("actions")
    if not isinstance(actions, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload must include an actions list.",
        )
    service = _build_service(uow_factory)
    try:
        result = service.submit_actions_batch(snapshot_id, actions)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return canonicalize_json(result.to_dict())
