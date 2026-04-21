from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from application.analysis_run.result_invalidator import ResultInvalidator
from application.network_model import (
    ensure_snapshot_matches_project,
    network_model_id_for_project,
)
from domain.models import OperatingCase
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


class WizardActionService:
    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory
        self._result_invalidator = ResultInvalidator()

    def build_action(self, case_id: UUID, payload: dict[str, Any]) -> ActionEnvelope:
        parent_snapshot_id = self._get_case_snapshot_id(case_id)
        payload_parent_id = _string_or_none(payload.get("parent_snapshot_id"))
        if payload_parent_id is not None and payload_parent_id != parent_snapshot_id:
            raise InvalidActionPayload(
                "Action parent_snapshot_id does not match case active snapshot."
            )
        return ActionEnvelope(
            action_id=_string_or_none(payload.get("action_id")),
            parent_snapshot_id=parent_snapshot_id,
            action_type=_string_or_none(payload.get("action_type")),
            payload=payload.get("payload", {}),
            created_at=_string_or_none(payload.get("created_at")),
            status=_string_or_none(payload.get("status")),
            actor=_string_or_none(payload.get("actor")),
            schema_version=payload.get("schema_version"),
        )

    def get_case_snapshot(self, case_id: UUID) -> NetworkSnapshot:
        parent_snapshot_id = self._get_case_snapshot_id(case_id)
        with self._uow_factory() as uow:
            case = uow.cases.get_operating_case(case_id)
            snapshot = uow.snapshots.get_snapshot(parent_snapshot_id)
        if case is None:
            raise ValueError(f"OperatingCase {case_id} not found")
        if snapshot is None:
            raise ValueError(f"Snapshot {parent_snapshot_id} not found")
        ensure_snapshot_matches_project(snapshot, case.project_id)
        return snapshot

    def submit_batch(self, case_id: UUID, actions: list[dict[str, Any]]) -> BatchActionResult:
        with self._uow_factory() as uow:
            case = uow.cases.get_operating_case(case_id)
            if case is None:
                raise ValueError(f"OperatingCase {case_id} not found")
            parent_snapshot_id = _extract_snapshot_id(case)
            snapshot = uow.snapshots.get_snapshot(parent_snapshot_id)
            if snapshot is None:
                raise ValueError(f"Snapshot {parent_snapshot_id} not found")
            ensure_snapshot_matches_project(snapshot, case.project_id)
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
            envelopes = [_build_envelope(payload, parent_snapshot_id) for payload in actions]
            working_snapshot = snapshot
            failure_index: int | None = None
            failure_action_result: ActionResult | None = None
            for index, envelope in enumerate(envelopes):
                result = validate_action_envelope(envelope, working_snapshot)
                result = _enforce_parent_snapshot_match(result, envelope, parent_snapshot_id)
                if result.status != "accepted":
                    failure_index = index
                    failure_action_result = result
                    break
                accepted_action = replace(envelope, status="accepted")
                working_snapshot = apply_action_to_snapshot(working_snapshot, accepted_action)
            if failure_index is not None and failure_action_result is not None:
                aborted_results = [
                    (
                        failure_action_result
                        if index == failure_index
                        else _batch_aborted_result(envelope, parent_snapshot_id)
                    )
                    for index, envelope in enumerate(envelopes)
                ]
                return BatchActionResult(
                    status="rejected",
                    parent_snapshot_id=parent_snapshot_id,
                    action_results=aborted_results,
                    errors=list(failure_action_result.errors),
                )
            action_results = [
                _accepted_result(envelope, parent_snapshot_id) for envelope in envelopes
            ]
            new_snapshot = create_network_snapshot(
                working_snapshot.graph,
                parent_snapshot_id=parent_snapshot_id,
                created_at=str(envelopes[-1].created_at),
                schema_version=snapshot.meta.schema_version,
                network_model_id=network_model_id_for_project(case.project_id),
            )
            uow.snapshots.add_snapshot(new_snapshot, commit=False)
            updated_case = _update_case_snapshot(case, new_snapshot.meta.snapshot_id)
            uow.cases.update_operating_case(updated_case, commit=False)
            self._result_invalidator.invalidate_project_results(uow, case.project_id)
            return BatchActionResult(
                status="accepted",
                parent_snapshot_id=parent_snapshot_id,
                new_snapshot_id=new_snapshot.meta.snapshot_id,
                action_results=action_results,
            )

    def _get_case_snapshot_id(self, case_id: UUID) -> str:
        with self._uow_factory() as uow:
            case = uow.cases.get_operating_case(case_id)
        if case is None:
            raise ValueError(f"OperatingCase {case_id} not found")
        return _extract_snapshot_id(case)


def _extract_snapshot_id(case: OperatingCase) -> str:
    snapshot_id = (case.case_payload or {}).get("active_snapshot_id")
    if not snapshot_id:
        raise ValueError(f"OperatingCase {case.id} has no active_snapshot_id")
    return str(snapshot_id)


def _update_case_snapshot(case: OperatingCase, snapshot_id: str) -> OperatingCase:
    payload = dict(case.case_payload or {})
    payload["active_snapshot_id"] = snapshot_id
    return OperatingCase(
        id=case.id,
        project_id=case.project_id,
        name=case.name,
        case_payload=payload,
        project_design_mode=case.project_design_mode,
        revision=case.revision,
        created_at=case.created_at,
        updated_at=datetime.now(UTC),
    )


def _build_envelope(payload: dict[str, Any], parent_snapshot_id: str) -> ActionEnvelope:
    payload_parent_id = _string_or_none(payload.get("parent_snapshot_id"))
    if payload_parent_id is not None and payload_parent_id != parent_snapshot_id:
        raise InvalidActionPayload("Action parent_snapshot_id does not match case active snapshot.")
    return ActionEnvelope(
        action_id=_string_or_none(payload.get("action_id")),
        parent_snapshot_id=parent_snapshot_id,
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
                message="Action parent_snapshot_id does not match case snapshot.",
                path="parent_snapshot_id",
            )
        )
    status = "accepted" if not errors else "rejected"
    return ActionResult(
        status=status,
        action_id=envelope.action_id,
        parent_snapshot_id=parent_snapshot_id,
        errors=errors,
        warnings=list(result.warnings),
    )


def _accepted_result(envelope: ActionEnvelope, parent_snapshot_id: str) -> ActionResult:
    return ActionResult(
        status="accepted",
        action_id=envelope.action_id,
        parent_snapshot_id=parent_snapshot_id,
        errors=[],
        warnings=[],
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


class InvalidActionPayload(ValueError):
    pass
