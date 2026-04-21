from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from typing import Any

from infrastructure.persistence.unit_of_work import UnitOfWork
from network_model.core import (
    ActionEnvelope,
    ActionIssue,
    ActionResult,
    BatchActionResult,
    NetworkSnapshot,
    apply_action_to_snapshot,
    create_network_snapshot,
    validate_action_envelope,
)


class SnapshotService:
    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    def get_snapshot(self, snapshot_id: str) -> NetworkSnapshot:
        with self._uow_factory() as uow:
            snapshot = uow.snapshots.get_snapshot(snapshot_id)
        if snapshot is None:
            raise ValueError(f"Snapshot {snapshot_id} not found")
        return snapshot

    def submit_action(
        self, parent_snapshot_id: str, action_payload: dict[str, Any]
    ) -> tuple[ActionResult, str | None]:
        with self._uow_factory() as uow:
            snapshot = uow.snapshots.get_snapshot(parent_snapshot_id)
            if snapshot is None:
                raise ValueError(f"Snapshot {parent_snapshot_id} not found")
            envelope = _build_envelope(action_payload)
            result = validate_action_envelope(envelope, snapshot)
            result = _enforce_parent_snapshot_match(result, envelope, parent_snapshot_id)
            if result.status != "accepted":
                return result, None
            accepted_action = replace(envelope, status="accepted")
            new_snapshot = apply_action_to_snapshot(snapshot, accepted_action)
            uow.snapshots.add_snapshot(new_snapshot, commit=False)
            return result, new_snapshot.meta.snapshot_id

    def submit_actions_batch(
        self, parent_snapshot_id: str, actions: list[dict[str, Any]]
    ) -> BatchActionResult:
        with self._uow_factory() as uow:
            snapshot = uow.snapshots.get_snapshot(parent_snapshot_id)
            if snapshot is None:
                raise ValueError(f"Snapshot {parent_snapshot_id} not found")
            if not actions:
                return BatchActionResult(
                    status="rejected",
                    parent_snapshot_id=parent_snapshot_id,
                    action_results=[],
                    errors=[
                        ActionIssue(
                            code="empty_batch",
                            message="Batch must contain at least one action.",
                            path="actions",
                        )
                    ],
                )
            envelopes = [_build_envelope(payload) for payload in actions]
            working_snapshot = snapshot
            failure_index: int | None = None
            failure_result: ActionResult | None = None
            for index, envelope in enumerate(envelopes):
                result = validate_action_envelope(envelope, working_snapshot)
                result = _enforce_parent_snapshot_match(result, envelope, parent_snapshot_id)
                if result.status != "accepted":
                    failure_index = index
                    failure_result = result
                    break
                accepted_action = replace(envelope, status="accepted")
                working_snapshot = apply_action_to_snapshot(working_snapshot, accepted_action)
            if failure_index is not None and failure_result is not None:
                aborted_results = [
                    (
                        failure_result
                        if index == failure_index
                        else _batch_aborted_result(envelope, parent_snapshot_id)
                    )
                    for index, envelope in enumerate(envelopes)
                ]
                return BatchActionResult(
                    status="rejected",
                    parent_snapshot_id=parent_snapshot_id,
                    action_results=aborted_results,
                    errors=list(failure_result.errors),
                )
            action_results = [
                ActionResult(
                    status="accepted",
                    action_id=envelope.action_id,
                    parent_snapshot_id=parent_snapshot_id,
                    errors=[],
                    warnings=[],
                )
                for envelope in envelopes
            ]
            new_snapshot = create_network_snapshot(
                working_snapshot.graph,
                parent_snapshot_id=parent_snapshot_id,
                created_at=str(envelopes[-1].created_at),
                schema_version=snapshot.meta.schema_version,
                network_model_id=snapshot.meta.network_model_id,
            )
            uow.snapshots.add_snapshot(new_snapshot, commit=False)
            return BatchActionResult(
                status="accepted",
                parent_snapshot_id=parent_snapshot_id,
                new_snapshot_id=new_snapshot.meta.snapshot_id,
                action_results=action_results,
            )


def _build_envelope(payload: dict[str, Any]) -> ActionEnvelope:
    return ActionEnvelope(
        action_id=_string_or_none(payload.get("action_id")),
        parent_snapshot_id=_string_or_none(payload.get("parent_snapshot_id")),
        action_type=_string_or_none(payload.get("action_type")),
        payload=payload.get("payload", {}),
        created_at=_string_or_none(payload.get("created_at")),
        status=_string_or_none(payload.get("status")),
        actor=_string_or_none(payload.get("actor")),
        schema_version=payload.get("schema_version"),
    )


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _enforce_parent_snapshot_match(
    result: ActionResult,
    envelope: ActionEnvelope,
    parent_snapshot_id: str,
) -> ActionResult:
    errors = list(result.errors)
    if (
        envelope.parent_snapshot_id is not None
        and envelope.parent_snapshot_id != parent_snapshot_id
    ):
        errors.append(
            ActionIssue(
                code="parent_snapshot_mismatch",
                message="Action parent_snapshot_id does not match requested snapshot.",
                path="parent_snapshot_id",
            )
        )
    status = result.status
    if errors:
        status = "rejected"
    return ActionResult(
        status=status,
        action_id=envelope.action_id,
        parent_snapshot_id=parent_snapshot_id,
        errors=errors,
        warnings=list(result.warnings),
    )


def _batch_aborted_result(envelope: ActionEnvelope, parent_snapshot_id: str) -> ActionResult:
    return ActionResult(
        status="rejected",
        action_id=envelope.action_id,
        parent_snapshot_id=parent_snapshot_id,
        errors=[
            ActionIssue(
                code="batch_aborted",
                message="Batch aborted due to validation error.",
                path="batch",
            )
        ],
        warnings=[],
    )
