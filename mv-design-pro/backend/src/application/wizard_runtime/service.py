from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID, uuid4, uuid5

from application.network_model import (
    ensure_snapshot_matches_project,
    network_model_id_for_project,
)
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

from .errors import NotFound, SessionClosed
from .session import WizardSession, WizardSessionStatus

_DETERMINISTIC_NAMESPACE = UUID(int=0)


class WizardService:
    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory
        self._sessions: dict[UUID, WizardSession] = {}

    def start_session(self, project_id: UUID) -> WizardSession:
        with self._uow_factory() as uow:
            project = uow.projects.get(project_id)
            if project is None:
                raise NotFound(f"Project {project_id} not found")
            base_snapshot = uow.snapshots.get_latest_snapshot_for_model(
                network_model_id_for_project(project_id)
            )
            if base_snapshot is None:
                raise NotFound("No snapshots available to start wizard session")
            ensure_snapshot_matches_project(base_snapshot, project_id)
        session = WizardSession(
            wizard_session_id=uuid4(),
            project_id=project_id,
            base_snapshot_id=base_snapshot.meta.snapshot_id,
            working_snapshot_id=None,
        )
        self._sessions[session.wizard_session_id] = session
        return session

    def submit_action(self, session_id: UUID, envelope: ActionEnvelope) -> ActionResult:
        session = self._get_session(session_id)
        self._ensure_open(session)
        base_snapshot = self._load_base_snapshot(session)
        working_snapshot = session.working_snapshot or base_snapshot
        result = validate_action_envelope(envelope, working_snapshot)
        result = _enforce_parent_snapshot_match(result, envelope, session.base_snapshot_id)
        if result.status != "accepted":
            return result
        accepted_action = replace(envelope, status="accepted")
        new_snapshot = apply_action_to_snapshot(working_snapshot, accepted_action)
        session.mark_working_snapshot(new_snapshot)
        session.action_ids.append(envelope.action_id)
        session.last_action_created_at = envelope.created_at
        return result

    def submit_batch(self, session_id: UUID, actions: list[ActionEnvelope]) -> BatchActionResult:
        session = self._get_session(session_id)
        self._ensure_open(session)
        if not actions:
            return BatchActionResult(
                status="rejected",
                parent_snapshot_id=session.base_snapshot_id,
                action_results=[],
                errors=[
                    ActionIssue(
                        code="empty_batch",
                        message="Batch must contain at least one action.",
                        path="actions",
                    )
                ],
            )
        base_snapshot = self._load_base_snapshot(session)
        working_snapshot = session.working_snapshot or base_snapshot
        staged_snapshot = working_snapshot
        action_results: list[ActionResult] = []
        failure_result: ActionResult | None = None
        failure_index: int | None = None
        for index, envelope in enumerate(actions):
            result = validate_action_envelope(envelope, staged_snapshot)
            result = _enforce_parent_snapshot_match(result, envelope, session.base_snapshot_id)
            action_results.append(result)
            if result.status != "accepted":
                failure_result = result
                failure_index = index
                break
            accepted_action = replace(envelope, status="accepted")
            staged_snapshot = apply_action_to_snapshot(staged_snapshot, accepted_action)
        if failure_result is not None and failure_index is not None:
            aborted_results = [
                (
                    failure_result
                    if index == failure_index
                    else _batch_aborted_result(envelope, session.base_snapshot_id)
                )
                for index, envelope in enumerate(actions)
            ]
            return BatchActionResult(
                status="rejected",
                parent_snapshot_id=session.base_snapshot_id,
                action_results=aborted_results,
                errors=list(failure_result.errors),
            )
        session.mark_working_snapshot(staged_snapshot)
        session.action_ids.extend([envelope.action_id for envelope in actions])
        session.last_action_created_at = actions[-1].created_at
        return BatchActionResult(
            status="accepted",
            parent_snapshot_id=session.base_snapshot_id,
            action_results=action_results,
        )

    def preview(self, session_id: UUID) -> NetworkSnapshot:
        session = self._get_session(session_id)
        self._ensure_open(session)
        if session.working_snapshot is not None:
            return session.working_snapshot
        return self._load_base_snapshot(session)

    def commit(self, session_id: UUID) -> NetworkSnapshot:
        session = self._get_session(session_id)
        self._ensure_open(session)
        base_snapshot = self._load_base_snapshot(session)
        working_snapshot = session.working_snapshot or base_snapshot
        snapshot_id = _deterministic_snapshot_id(
            session.base_snapshot_id,
            session.action_ids,
        )
        created_at = session.last_action_created_at or datetime.now(UTC).isoformat()
        new_snapshot = create_network_snapshot(
            working_snapshot.graph,
            parent_snapshot_id=session.base_snapshot_id,
            snapshot_id=snapshot_id,
            created_at=created_at,
            schema_version=base_snapshot.meta.schema_version,
            network_model_id=network_model_id_for_project(session.project_id),
        )
        with self._uow_factory() as uow:
            uow.snapshots.add_snapshot(new_snapshot, commit=False)
        session.status = WizardSessionStatus.COMMITTED
        session.mark_working_snapshot(new_snapshot)
        return new_snapshot

    def abort(self, session_id: UUID) -> None:
        session = self._get_session(session_id)
        self._ensure_open(session)
        session.status = WizardSessionStatus.ABORTED
        session.working_snapshot = None
        session.working_snapshot_id = None
        session.action_ids.clear()
        session.last_action_created_at = None

    def _get_session(self, session_id: UUID) -> WizardSession:
        session = self._sessions.get(session_id)
        if session is None:
            raise NotFound(f"Wizard session {session_id} not found")
        return session

    def _ensure_open(self, session: WizardSession) -> None:
        if session.status != WizardSessionStatus.OPEN:
            raise SessionClosed(f"Wizard session {session.wizard_session_id} is not open")

    def _load_base_snapshot(self, session: WizardSession) -> NetworkSnapshot:
        with self._uow_factory() as uow:
            snapshot = uow.snapshots.get_snapshot(session.base_snapshot_id)
        if snapshot is None:
            raise NotFound(f"Base snapshot {session.base_snapshot_id} not found for wizard session")
        return snapshot


def _deterministic_snapshot_id(base_snapshot_id: str, action_ids: list[str]) -> str:
    payload = json.dumps(
        {
            "base_snapshot_id": base_snapshot_id,
            "actions": action_ids,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return str(uuid5(_DETERMINISTIC_NAMESPACE, payload))


def _enforce_parent_snapshot_match(
    result: ActionResult,
    envelope: ActionEnvelope,
    parent_snapshot_id: str,
) -> ActionResult:
    errors = list(result.errors)
    if envelope.parent_snapshot_id != parent_snapshot_id:
        errors.append(
            ActionIssue(
                code="parent_snapshot_mismatch",
                message="Action parent_snapshot_id does not match session base snapshot.",
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
