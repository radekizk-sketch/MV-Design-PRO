"""
Case Repository — P10a STATE / LIFECYCLE

Repository for OperatingCase and StudyCase entities.
Implements full CRUD, clone, and active case management for StudyCase.

P10a ADDITIONS:
- network_snapshot_id binding for StudyCase
- Snapshot-based invalidation methods
- Snapshot binding update methods

INVARIANTS:
- Exactly one StudyCase can be active per project
- Setting a case as active deactivates all other cases in the project
- Result status is managed via dedicated methods
- When snapshot changes, FRESH cases become OUTDATED
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from domain.models import OperatingCase
from domain.project_design_mode import ProjectDesignMode
from domain.study_case import (
    ProtectionConfig,
    StudyCase,
    StudyCaseConfig,
    StudyCaseResult,
    StudyCaseResultStatus,
)
from infrastructure.persistence.models import OperatingCaseORM, StudyCaseORM
from sqlalchemy import CursorResult, select, update
from sqlalchemy.orm import Session


class CaseRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add_operating_case(self, case: OperatingCase, *, commit: bool = True) -> None:
        self._session.add(
            OperatingCaseORM(
                id=case.id,
                project_id=case.project_id,
                name=case.name,
                case_jsonb=case.case_payload,
                project_design_mode=(
                    case.project_design_mode.value if case.project_design_mode is not None else None
                ),
                created_at=case.created_at,
                updated_at=case.updated_at,
            )
        )
        if commit:
            self._session.commit()

    def get_operating_case(self, case_id: UUID) -> OperatingCase | None:
        stmt = select(OperatingCaseORM).where(OperatingCaseORM.id == case_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return OperatingCase(
            id=row.id,
            project_id=row.project_id,
            name=row.name,
            case_payload=row.case_jsonb,
            project_design_mode=(
                ProjectDesignMode(row.project_design_mode) if row.project_design_mode else None
            ),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def list_operating_cases(self, project_id: UUID) -> list[OperatingCase]:
        stmt = select(OperatingCaseORM).where(OperatingCaseORM.project_id == project_id)
        rows = self._session.execute(stmt).scalars().all()
        return [
            OperatingCase(
                id=row.id,
                project_id=row.project_id,
                name=row.name,
                case_payload=row.case_jsonb,
                project_design_mode=(
                    ProjectDesignMode(row.project_design_mode) if row.project_design_mode else None
                ),
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            for row in rows
        ]

    def update_operating_case(self, case: OperatingCase, *, commit: bool = True) -> None:
        stmt = select(OperatingCaseORM).where(OperatingCaseORM.id == case.id)
        row = self._session.execute(stmt).scalar_one()
        row.name = case.name
        row.case_jsonb = case.case_payload
        row.project_design_mode = (
            case.project_design_mode.value if case.project_design_mode is not None else None
        )
        row.updated_at = case.updated_at
        if commit:
            self._session.commit()

    # =========================================================================
    # StudyCase methods — P10 FULL MAX
    # =========================================================================

    def _row_to_study_case(self, row: StudyCaseORM) -> StudyCase:
        """Convert ORM row to StudyCase domain entity (P10a)."""
        config = StudyCaseConfig.from_dict(row.study_jsonb)
        protection_config = ProtectionConfig.from_dict(
            (row.study_jsonb or {}).get("protection_config") or {}
        )
        result_refs = tuple(StudyCaseResult.from_dict(ref) for ref in (row.result_refs_jsonb or []))
        return StudyCase(
            id=row.id,
            project_id=row.project_id,
            name=row.name,
            description=row.description or "",
            network_snapshot_id=row.network_snapshot_id,  # P10a
            config=config,
            protection_config=protection_config,
            result_status=StudyCaseResultStatus(row.result_status or "NONE"),
            is_active=row.is_active or False,
            result_refs=result_refs,
            revision=row.revision or 1,
            created_at=row.created_at,
            updated_at=row.updated_at,
            study_payload=row.study_jsonb,
        )

    def add_study_case(self, case: StudyCase, *, commit: bool = True) -> None:
        """Add a new StudyCase to the database (P10a)."""
        # Support both old (study_payload) and new (P10: config, is_active, etc.) models
        is_active = getattr(case, "is_active", False)
        description = getattr(case, "description", "")
        result_status = getattr(case, "result_status", None)
        result_refs = getattr(case, "result_refs", ())
        network_snapshot_id = getattr(case, "network_snapshot_id", None)  # P10a

        # Determine study_jsonb from config (P10) or study_payload (legacy)
        if hasattr(case, "config") and case.config is not None:
            study_jsonb = case.config.to_dict()
        else:
            study_jsonb = getattr(case, "study_payload", {})
        if hasattr(case, "protection_config") and case.protection_config is not None:
            study_jsonb = {
                **study_jsonb,
                "protection_config": case.protection_config.to_dict(),
            }

        # If this case is active, deactivate all other cases in the project
        if is_active:
            self._deactivate_all_cases(case.project_id)

        self._session.add(
            StudyCaseORM(
                id=case.id,
                project_id=case.project_id,
                name=case.name,
                description=description,
                network_snapshot_id=network_snapshot_id,  # P10a
                study_jsonb=study_jsonb,
                is_active=is_active,
                result_status=result_status.value if result_status else "NONE",
                result_refs_jsonb=[ref.to_dict() for ref in result_refs] if result_refs else [],
                revision=case.revision,
                created_at=case.created_at,
                updated_at=case.updated_at,
            )
        )
        if commit:
            self._session.commit()

    def update_study_case(self, case: StudyCase, *, commit: bool = True) -> None:
        """Update an existing StudyCase (P10a)."""
        stmt = select(StudyCaseORM).where(StudyCaseORM.id == case.id)
        row = self._session.execute(stmt).scalar_one()

        # Support both old (study_payload) and new (P10) models
        is_active = getattr(case, "is_active", False)
        description = getattr(case, "description", "")
        result_status = getattr(case, "result_status", None)
        result_refs = getattr(case, "result_refs", ())
        network_snapshot_id = getattr(case, "network_snapshot_id", None)  # P10a

        if hasattr(case, "config") and case.config is not None:
            study_jsonb = case.config.to_dict()
        else:
            study_jsonb = getattr(case, "study_payload", {})
        if hasattr(case, "protection_config") and case.protection_config is not None:
            study_jsonb = {
                **study_jsonb,
                "protection_config": case.protection_config.to_dict(),
            }

        # If this case is becoming active, deactivate all other cases
        if is_active and not row.is_active:
            self._deactivate_all_cases(case.project_id)

        row.name = case.name
        row.description = description
        row.network_snapshot_id = network_snapshot_id  # P10a
        row.study_jsonb = study_jsonb
        row.is_active = is_active
        row.result_status = result_status.value if result_status else "NONE"
        row.result_refs_jsonb = [ref.to_dict() for ref in result_refs] if result_refs else []
        row.revision = case.revision
        row.updated_at = case.updated_at

        if commit:
            self._session.commit()

    def delete_study_case(self, case_id: UUID, *, commit: bool = True) -> bool:
        """
        Delete a StudyCase by ID.

        Returns True if case was deleted, False if not found.
        """
        stmt = select(StudyCaseORM).where(StudyCaseORM.id == case_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return False

        self._session.delete(row)
        if commit:
            self._session.commit()
        return True

    def get_study_case(self, case_id: UUID) -> StudyCase | None:
        """Get a StudyCase by ID."""
        stmt = select(StudyCaseORM).where(StudyCaseORM.id == case_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return self._row_to_study_case(row)

    def list_study_cases(self, project_id: UUID) -> list[StudyCase]:
        """List all StudyCases for a project, ordered by name."""
        stmt = (
            select(StudyCaseORM)
            .where(StudyCaseORM.project_id == project_id)
            .order_by(StudyCaseORM.name)
        )
        rows = self._session.execute(stmt).scalars().all()
        return [self._row_to_study_case(row) for row in rows]

    def get_active_study_case(self, project_id: UUID) -> StudyCase | None:
        """Get the active StudyCase for a project (if any)."""
        stmt = (
            select(StudyCaseORM)
            .where(StudyCaseORM.project_id == project_id)
            .where(StudyCaseORM.is_active == True)  # noqa: E712
        )
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None
        return self._row_to_study_case(row)

    def set_active_study_case(
        self, project_id: UUID, case_id: UUID, *, commit: bool = True
    ) -> StudyCase | None:
        """
        Set a StudyCase as active.

        Deactivates all other cases in the project first.
        Returns the activated case, or None if not found.
        """
        # First, deactivate all cases in the project
        self._deactivate_all_cases(project_id)

        # Then activate the specified case
        stmt = select(StudyCaseORM).where(StudyCaseORM.id == case_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return None

        row.is_active = True
        row.updated_at = datetime.now(UTC)

        if commit:
            self._session.commit()

        return self._row_to_study_case(row)

    def _deactivate_all_cases(self, project_id: UUID) -> None:
        """Deactivate all StudyCases in a project."""
        stmt = (
            update(StudyCaseORM)
            .where(StudyCaseORM.project_id == project_id)
            .values(is_active=False)
        )
        self._session.execute(stmt)

    def mark_all_cases_outdated(self, project_id: UUID, *, commit: bool = True) -> int:
        """
        Mark all StudyCases in a project as OUTDATED.

        Called when NetworkModel changes. Only affects cases with FRESH status.
        Returns the number of cases affected.
        """
        stmt = (
            update(StudyCaseORM)
            .where(StudyCaseORM.project_id == project_id)
            .where(StudyCaseORM.result_status == "FRESH")
            .values(
                result_status="OUTDATED",
                updated_at=datetime.now(UTC),
            )
        )
        # `Session.execute` jest typowane ogolnym `Result[Any]`, ale dla instrukcji DML
        # (`update()`) SQLAlchemy ZAWSZE zwraca `CursorResult` — i tylko on niesie
        # `rowcount`. Jawne zawezenie zamiast siegania po atrybut, ktorego deklarowany
        # typ nie ma.
        result = cast(CursorResult[Any], self._session.execute(stmt))
        if commit:
            self._session.commit()
        return result.rowcount

    def mark_case_outdated(self, case_id: UUID, *, commit: bool = True) -> bool:
        """
        Mark a single StudyCase as OUTDATED.

        Called when case configuration changes.
        Returns True if case was updated, False if not found or already OUTDATED/NONE.
        """
        stmt = select(StudyCaseORM).where(StudyCaseORM.id == case_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return False

        if row.result_status == "FRESH":
            row.result_status = "OUTDATED"
            row.updated_at = datetime.now(UTC)
            if commit:
                self._session.commit()
            return True
        return False

    def mark_case_fresh(
        self,
        case_id: UUID,
        result_ref: StudyCaseResult,
        *,
        commit: bool = True,
    ) -> bool:
        """
        Mark a StudyCase as FRESH and add result reference.

        Called after successful calculation.
        Returns True if case was updated, False if not found.
        """
        stmt = select(StudyCaseORM).where(StudyCaseORM.id == case_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            return False

        row.result_status = "FRESH"
        refs = list(row.result_refs_jsonb or [])
        refs.append(result_ref.to_dict())
        row.result_refs_jsonb = refs
        row.updated_at = datetime.now(UTC)

        if commit:
            self._session.commit()
        return True

    def delete_operating_cases_by_project(self, project_id: UUID, *, commit: bool = True) -> None:
        """Delete all OperatingCases for a project."""
        self._session.query(OperatingCaseORM).filter(
            OperatingCaseORM.project_id == project_id
        ).delete()
        if commit:
            self._session.commit()

    def delete_study_cases_by_project(self, project_id: UUID, *, commit: bool = True) -> None:
        """Delete all StudyCases for a project."""
        self._session.query(StudyCaseORM).filter(StudyCaseORM.project_id == project_id).delete()
        if commit:
            self._session.commit()

    def count_study_cases(self, project_id: UUID) -> int:
        """Count StudyCases for a project."""
        stmt = select(StudyCaseORM).where(StudyCaseORM.project_id == project_id)
        return len(self._session.execute(stmt).scalars().all())

    # P10a: Snapshot-based operations
    def list_cases_by_snapshot(self, network_snapshot_id: str) -> list[StudyCase]:
        """P10a: List all StudyCases bound to a specific network snapshot."""
        stmt = select(StudyCaseORM).where(StudyCaseORM.network_snapshot_id == network_snapshot_id)
        rows = self._session.execute(stmt).scalars().all()
        return [self._row_to_study_case(row) for row in rows]

    def invalidate_cases_for_snapshot(
        self, network_snapshot_id: str, *, commit: bool = True
    ) -> int:
        """
        P10a: Mark all StudyCases bound to a snapshot as OUTDATED.

        Called when network model changes (new snapshot is created).
        Returns the number of cases invalidated.
        """
        stmt = (
            update(StudyCaseORM)
            .where(StudyCaseORM.network_snapshot_id == network_snapshot_id)
            .where(StudyCaseORM.result_status == "FRESH")
            .values(
                result_status="OUTDATED",
                updated_at=datetime.now(UTC),
            )
        )
        # `Session.execute` jest typowane ogolnym `Result[Any]`, ale dla instrukcji DML
        # (`update()`) SQLAlchemy ZAWSZE zwraca `CursorResult` — i tylko on niesie
        # `rowcount`. Jawne zawezenie zamiast siegania po atrybut, ktorego deklarowany
        # typ nie ma.
        result = cast(CursorResult[Any], self._session.execute(stmt))
        if commit:
            self._session.commit()
        return result.rowcount

    def update_cases_snapshot_binding(
        self,
        project_id: UUID,
        old_snapshot_id: str | None,
        new_snapshot_id: str,
        *,
        commit: bool = True,
    ) -> int:
        """
        P10a: Update all cases bound to old snapshot to reference new snapshot.

        Also marks them as OUTDATED since the model changed.
        Returns the number of cases updated.
        """
        if old_snapshot_id is None:
            # Bind all cases without a snapshot
            stmt = (
                update(StudyCaseORM)
                .where(StudyCaseORM.project_id == project_id)
                .where(StudyCaseORM.network_snapshot_id.is_(None))
                .values(
                    network_snapshot_id=new_snapshot_id,
                    updated_at=datetime.now(UTC),
                )
            )
        else:
            # Update cases from old to new snapshot, mark as OUTDATED
            stmt = (
                update(StudyCaseORM)
                .where(StudyCaseORM.project_id == project_id)
                .where(StudyCaseORM.network_snapshot_id == old_snapshot_id)
                .values(
                    network_snapshot_id=new_snapshot_id,
                    result_status="OUTDATED",
                    updated_at=datetime.now(UTC),
                )
            )
        # `Session.execute` jest typowane ogolnym `Result[Any]`, ale dla instrukcji DML
        # (`update()`) SQLAlchemy ZAWSZE zwraca `CursorResult` — i tylko on niesie
        # `rowcount`. Jawne zawezenie zamiast siegania po atrybut, ktorego deklarowany
        # typ nie ma.
        result = cast(CursorResult[Any], self._session.execute(stmt))
        if commit:
            self._session.commit()
        return result.rowcount
