from __future__ import annotations

from datetime import datetime
from uuid import UUID

from domain.models import StudyRun
from infrastructure.persistence.models import StudyRunORM
from infrastructure.persistence.time_utils import ensure_utc
from sqlalchemy import select
from sqlalchemy.orm import Session


class StudyRunRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, run: StudyRun) -> None:
        """P10a: Add run with network_snapshot_id and solver_version_hash."""
        self._session.add(
            StudyRunORM(
                id=run.id,
                project_id=run.project_id,
                case_id=run.case_id,
                analysis_type=run.analysis_type,
                input_hash=run.input_hash,
                network_snapshot_id=run.network_snapshot_id,  # P10a
                solver_version_hash=run.solver_version_hash,  # P10a
                result_state=run.result_state,  # P10a
                status=run.status,
                started_at=ensure_utc(run.started_at),
                finished_at=ensure_utc(run.finished_at),
            )
        )
        self._session.commit()

    def get(self, run_id: UUID) -> StudyRun | None:
        """P10a: Get run with network_snapshot_id and solver_version_hash."""
        stmt = select(StudyRunORM).where(StudyRunORM.id == run_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return StudyRun(
            id=row.id,
            project_id=row.project_id,
            case_id=row.case_id,
            analysis_type=row.analysis_type,
            input_hash=row.input_hash,
            network_snapshot_id=row.network_snapshot_id,  # P10a
            solver_version_hash=row.solver_version_hash,  # P10a
            result_state=row.result_state,  # P10a
            status=row.status,
            started_at=ensure_utc(row.started_at),
            finished_at=ensure_utc(row.finished_at),
        )

    def update_status(self, run_id: UUID, status: str, finished_at: datetime | None = None) -> None:
        stmt = select(StudyRunORM).where(StudyRunORM.id == run_id)
        row = self._session.execute(stmt).scalar_one()
        row.status = status
        row.finished_at = ensure_utc(finished_at)
        self._session.commit()

    def list_by_project(self, project_id: UUID) -> list[StudyRun]:
        """P10a: List runs with new fields."""
        stmt = select(StudyRunORM).where(StudyRunORM.project_id == project_id)
        rows = self._session.execute(stmt).scalars().all()
        return [
            StudyRun(
                id=row.id,
                project_id=row.project_id,
                case_id=row.case_id,
                analysis_type=row.analysis_type,
                input_hash=row.input_hash,
                network_snapshot_id=row.network_snapshot_id,  # P10a
                solver_version_hash=row.solver_version_hash,  # P10a
                result_state=row.result_state,  # P10a
                status=row.status,
                started_at=ensure_utc(row.started_at),
                finished_at=ensure_utc(row.finished_at),
            )
            for row in rows
        ]

    # P10a: Result invalidation support
    def invalidate_runs_for_snapshot(self, network_snapshot_id: str, *, commit: bool = True) -> int:
        """
        P10a: Mark all runs for a given snapshot as OUTDATED.

        Called when network model changes (new snapshot is created).
        Returns the number of runs invalidated.
        """
        stmt = select(StudyRunORM).where(
            StudyRunORM.network_snapshot_id == network_snapshot_id,
            StudyRunORM.result_state == "VALID",
        )
        rows = self._session.execute(stmt).scalars().all()
        count = 0
        for row in rows:
            row.result_state = "OUTDATED"
            count += 1
        if commit and count > 0:
            self._session.commit()
        return count

    def list_by_snapshot(self, network_snapshot_id: str) -> list[StudyRun]:
        """P10a: List all runs for a specific network snapshot."""
        stmt = select(StudyRunORM).where(StudyRunORM.network_snapshot_id == network_snapshot_id)
        rows = self._session.execute(stmt).scalars().all()
        return [
            StudyRun(
                id=row.id,
                project_id=row.project_id,
                case_id=row.case_id,
                analysis_type=row.analysis_type,
                input_hash=row.input_hash,
                network_snapshot_id=row.network_snapshot_id,
                solver_version_hash=row.solver_version_hash,
                result_state=row.result_state,
                status=row.status,
                started_at=ensure_utc(row.started_at),
                finished_at=ensure_utc(row.finished_at),
            )
            for row in rows
        ]
