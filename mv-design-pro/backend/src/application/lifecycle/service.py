"""
P10a Lifecycle Service — Snapshot Binding (legacy P2–P12, kasacja CV-4)

CO STĄD ZNIKŁO I DLACZEGO (CV-2-W). Usługa unieważniała PRZYPADKI obliczeniowe
przy każdej nowej migawce sieci (`invalidate_cases_for_snapshot`,
`mark_all_cases_outdated`). To był jeden z siedmiu pisarzy statusu wyników
przypadku — a status jest odtąd WYPROWADZANY z biegów kanonicznych i koperty
rewizji (`application/study_case/status_wynikow.py`), więc pisarz nie ma czego
pisać. Została wyłącznie część biegów LEGACY (`study_runs`), która żyje razem z
torem P2–P12 i znika razem z nim w CV-4.

STAN FAKTYCZNY (uczciwie): po tej kasacji `LifecycleService` NIE MA żadnego
konsumenta w `src/` ani w testach — jest kandydatem do skasowania w całości
razem z torem legacy (CV-4), a nie żywym ogniwem łańcucha.

CANONICAL ALIGNMENT:
- Project → Run → Snapshot lifecycle (tor legacy)
- Deterministic fingerprint-based change detection

INVARIANTS:
- When snapshot changes, ALL legacy runs bound to old snapshot become OUTDATED
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
        Handle new snapshot creation — invalidate LEGACY runs and update bindings.

        P10a: This is the main entry point for lifecycle management.
        PRZYPADKI OBLICZENIOWE NIE SĄ TU DOTYKANE (CV-2-W) — ich status wynika
        z biegów kanonicznych, nie z zapisu.

        Args:
            project_id: ID of the project
            new_snapshot_id: ID of the newly created snapshot
            old_snapshot_id: ID of the previous active snapshot (if any)

        Returns:
            InvalidationResult with the count of invalidated legacy runs
        """
        with self._uow_factory() as uow:
            # 1. Update project's active snapshot
            uow.projects.set_active_snapshot_id(project_id, new_snapshot_id, commit=False)

            runs_invalidated = 0

            # 2. If there was an old snapshot, invalidate its legacy runs
            if old_snapshot_id is not None and uow.study_runs is not None:
                runs_invalidated = uow.study_runs.invalidate_runs_for_snapshot(
                    old_snapshot_id, commit=False
                )

            # 3. Commit all changes atomically
            uow.session.commit()

        return InvalidationResult(
            project_id=project_id,
            old_snapshot_id=old_snapshot_id,
            new_snapshot_id=new_snapshot_id,
            runs_invalidated=runs_invalidated,
            timestamp=datetime.now(UTC),
        )

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
