"""
P10a Lifecycle Service — Result Invalidation and Snapshot Binding

CANONICAL ALIGNMENT:
- Project → StudyCase → Run → Snapshot lifecycle management
- Result invalidation when network model changes (new snapshot)
- Deterministic fingerprint-based change detection

INVARIANTS:
- When snapshot changes, ALL cases bound to old snapshot become OUTDATED
- When snapshot changes, ALL runs bound to old snapshot become OUTDATED
- Project.active_network_snapshot_id is updated atomically with invalidation
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from infrastructure.persistence.unit_of_work import UnitOfWork


@dataclass(frozen=True)
class InvalidationResult:
    """Result of an invalidation operation (P10a)."""

    project_id: UUID
    old_snapshot_id: str | None
    new_snapshot_id: str
    cases_invalidated: int
    runs_invalidated: int
    timestamp: datetime


class LifecycleService:
    """
    P10a Lifecycle Service — manages state and result invalidation.

    RESPONSIBILITIES:
    - Invalidate results when network model changes
    - Update snapshot bindings for cases and runs
    - Manage project's active snapshot reference

    USAGE:
        lifecycle = LifecycleService(uow_factory)
        result = lifecycle.on_snapshot_created(project_id, old_snap, new_snap)
    """

    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    def on_snapshot_created(
        self,
        project_id: UUID,
        new_snapshot_id: str,
        old_snapshot_id: str | None = None,
    ) -> InvalidationResult:
        """
        Handle new snapshot creation — invalidate results and update bindings.

        P10a: This is the main entry point for lifecycle management.

        Args:
            project_id: ID of the project
            new_snapshot_id: ID of the newly created snapshot
            old_snapshot_id: ID of the previous active snapshot (if any)

        Returns:
            InvalidationResult with counts of invalidated cases and runs
        """
        with self._uow_factory() as uow:
            # 1. Update project's active snapshot
            uow.projects.set_active_snapshot_id(project_id, new_snapshot_id, commit=False)

            cases_invalidated = 0
            runs_invalidated = 0

            # 2. If there was an old snapshot, invalidate its results
            if old_snapshot_id is not None:
                # Mark all cases bound to old snapshot as OUTDATED
                cases_invalidated = uow.cases.invalidate_cases_for_snapshot(
                    old_snapshot_id, commit=False
                )

                # Mark all runs bound to old snapshot as OUTDATED
                if uow.study_runs is not None:
                    runs_invalidated = uow.study_runs.invalidate_runs_for_snapshot(
                        old_snapshot_id, commit=False
                    )

            # 3. Commit all changes atomically
            uow.session.commit()

        return InvalidationResult(
            project_id=project_id,
            old_snapshot_id=old_snapshot_id,
            new_snapshot_id=new_snapshot_id,
            cases_invalidated=cases_invalidated,
            runs_invalidated=runs_invalidated,
            timestamp=datetime.now(UTC),
        )

    def invalidate_project_results(self, project_id: UUID) -> int:
        """
        Invalidate all results for a project.

        P10a: Called when model changes require global invalidation.

        Returns:
            Number of cases invalidated
        """
        with self._uow_factory() as uow:
            count = uow.cases.mark_all_cases_outdated(project_id, commit=True)
        return count

    def bind_case_to_snapshot(
        self,
        case_id: UUID,
        snapshot_id: str,
    ) -> bool:
        """
        Bind a study case to a specific network snapshot.

        P10a: Updates the case's network_snapshot_id reference.

        Returns:
            True if case was found and updated
        """
        with self._uow_factory() as uow:
            case = uow.cases.get_study_case(case_id)
            if case is None:
                return False

            updated_case = case.with_network_snapshot_id(snapshot_id)
            uow.cases.update_study_case(updated_case, commit=True)
            return True

    def get_project_active_snapshot(self, project_id: UUID) -> str | None:
        """
        Get the active network snapshot ID for a project.

        P10a: Returns the snapshot_id the project is currently working with.
        """
        with self._uow_factory() as uow:
            return uow.projects.get_active_snapshot_id(project_id)

    def check_snapshot_changed(
        self,
        project_id: UUID,
        new_snapshot_id: str,
    ) -> bool:
        """
        Check if the snapshot has changed from the project's active snapshot.

        P10a: Used to determine if results need invalidation.

        Returns:
            True if snapshot is different from active snapshot
        """
        with self._uow_factory() as uow:
            current_id = uow.projects.get_active_snapshot_id(project_id)
            return current_id != new_snapshot_id

    def check_fingerprint_changed(
        self,
        project_id: UUID,
        new_fingerprint: str,
    ) -> bool:
        """
        Check if the fingerprint has changed from the active snapshot.

        P10a: Fingerprint-based change detection for deterministic invalidation.

        Returns:
            True if fingerprint is different
        """
        with self._uow_factory() as uow:
            current_snapshot_id = uow.projects.get_active_snapshot_id(project_id)
            if current_snapshot_id is None:
                return True

            current_fingerprint = uow.snapshots.get_fingerprint(current_snapshot_id)
            return current_fingerprint != new_fingerprint
