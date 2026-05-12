"""
Study Case Service — P10 FULL MAX

Application service for study case management.
Implements full lifecycle with PowerFactory-grade semantics.

INVARIANTS:
- One project = one NetworkModel
- Case = configuration only, never mutates model
- Exactly one active case per project
- Result status: NONE → FRESH → OUTDATED

OPERATIONS:
- CRUD: Create, Read, Update, Delete
- Clone: Copy config, no results
- Activate: Set as active (deactivates others)
- Compare: Read-only diff between two cases
- Invalidate: Mark as OUTDATED on model/config change
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from domain.study_case import (
    ProtectionConfig,
    StudyCase,
    StudyCaseComparison,
    StudyCaseConfig,
    StudyCaseResult,
    compare_study_cases,
    new_study_case,
)

from .errors import (
    ActiveCaseRequiredError,
    CaseConfigurationError,
    StudyCaseNotFoundError,
)


@dataclass
class StudyCaseListItem:
    """Summary item for listing study cases."""

    id: str
    name: str
    description: str
    result_status: str
    results_valid: bool  # PR-4: explicit validity flag
    is_active: bool
    updated_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "result_status": self.result_status,
            "results_valid": self.results_valid,
            "is_active": self.is_active,
            "updated_at": self.updated_at,
        }


class StudyCaseService:
    """
    Application service for study case management.

    Provides full CRUD, clone, compare, and status management operations.
    All operations are transactional via the UoW pattern.
    """

    def __init__(self, uow_factory: Callable[[], Any]):
        """
        Initialize the service.

        Args:
            uow_factory: Factory function that returns a UoW with session
        """
        self._uow_factory = uow_factory

    # =========================================================================
    # CRUD Operations
    # =========================================================================

    def create_case(
        self,
        project_id: UUID,
        name: str,
        description: str = "",
        config: dict[str, Any] | None = None,
        set_active: bool = False,
    ) -> StudyCase:
        """
        Create a new study case.

        Args:
            project_id: Project this case belongs to
            name: Case name
            description: Optional description
            config: Calculation configuration (optional)
            set_active: Whether to set this case as active

        Returns:
            Created StudyCase
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")

            cfg = StudyCaseConfig.from_dict(config) if config else StudyCaseConfig()
            case = new_study_case(
                project_id=project_id,
                name=name,
                description=description,
                config=cfg,
                is_active=set_active,
            )

            repo.add_study_case(case)
            return case

    def get_case(self, case_id: UUID) -> StudyCase:
        """
        Get a study case by ID.

        Args:
            case_id: Case ID

        Returns:
            StudyCase

        Raises:
            StudyCaseNotFoundError: If case not found
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")

            case = repo.get_study_case(case_id)
            if case is None:
                raise StudyCaseNotFoundError(str(case_id))
            return case

    def list_cases(self, project_id: UUID) -> list[StudyCaseListItem]:
        """
        List all study cases for a project.

        Args:
            project_id: Project ID

        Returns:
            List of study case summary items, ordered by name
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")

            cases = repo.list_study_cases(project_id)
            return [
                StudyCaseListItem(
                    id=str(case.id),
                    name=case.name,
                    description=case.description,
                    result_status=case.result_status.value,
                    results_valid=case.results_valid,
                    is_active=case.is_active,
                    updated_at=case.updated_at.isoformat(),
                )
                for case in cases
            ]

    def update_case(
        self,
        case_id: UUID,
        name: str | None = None,
        description: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> StudyCase:
        """
        Update a study case.

        Args:
            case_id: Case ID
            name: New name (optional)
            description: New description (optional)
            config: New configuration (optional) — marks case as OUTDATED

        Returns:
            Updated StudyCase

        Raises:
            StudyCaseNotFoundError: If case not found
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")

            case = repo.get_study_case(case_id)
            if case is None:
                raise StudyCaseNotFoundError(str(case_id))

            updated = case
            if name is not None:
                updated = updated.with_name(name)
            if description is not None:
                updated = updated.with_description(description)
            if config is not None:
                new_config = StudyCaseConfig.from_dict(config)
                updated = updated.with_updated_config(new_config)

            repo.update_study_case(updated)
            return updated

    def delete_case(self, case_id: UUID) -> bool:
        """
        Delete a study case.

        Args:
            case_id: Case ID

        Returns:
            True if deleted, False if not found
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")
            return repo.delete_study_case(case_id)

    # =========================================================================
    # Clone Operation
    # =========================================================================

    def clone_case(
        self,
        case_id: UUID,
        new_name: str | None = None,
    ) -> StudyCase:
        """
        Clone a study case.

        CLONING RULES (PowerFactory-style):
        - Configuration is copied
        - Results are NOT copied (status = NONE)
        - New case is NOT active

        Args:
            case_id: Source case ID
            new_name: Name for the clone (optional, defaults to "name (kopia)")

        Returns:
            Cloned StudyCase

        Raises:
            StudyCaseNotFoundError: If source case not found
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")

            source = repo.get_study_case(case_id)
            if source is None:
                raise StudyCaseNotFoundError(str(case_id))

            cloned = source.clone(new_name)
            repo.add_study_case(cloned)
            return cloned

    # =========================================================================
    # Active Case Management
    # =========================================================================

    def get_active_case(self, project_id: UUID) -> StudyCase | None:
        """
        Get the active study case for a project.

        Args:
            project_id: Project ID

        Returns:
            Active StudyCase or None if no active case
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")
            return repo.get_active_study_case(project_id)

    def set_active_case(self, project_id: UUID, case_id: UUID) -> StudyCase:
        """
        Set a study case as active.

        Deactivates all other cases in the project first.

        Args:
            project_id: Project ID
            case_id: Case ID to activate

        Returns:
            Activated StudyCase

        Raises:
            StudyCaseNotFoundError: If case not found
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")

            case = repo.set_active_study_case(project_id, case_id)
            if case is None:
                raise StudyCaseNotFoundError(str(case_id))
            return case

    # =========================================================================
    # Compare Operation
    # =========================================================================

    def compare_cases(
        self,
        case_a_id: UUID,
        case_b_id: UUID,
    ) -> StudyCaseComparison:
        """
        Compare two study cases.

        This is a 100% read-only operation — no mutations allowed.

        Args:
            case_a_id: First case ID
            case_b_id: Second case ID

        Returns:
            StudyCaseComparison with configuration differences

        Raises:
            StudyCaseNotFoundError: If either case not found
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")

            case_a = repo.get_study_case(case_a_id)
            if case_a is None:
                raise StudyCaseNotFoundError(str(case_a_id))

            case_b = repo.get_study_case(case_b_id)
            if case_b is None:
                raise StudyCaseNotFoundError(str(case_b_id))

            return compare_study_cases(case_a, case_b)

    # =========================================================================
    # Result Status Management
    # =========================================================================

    def mark_all_outdated(self, project_id: UUID) -> int:
        """
        Mark all study cases in a project as OUTDATED.

        Called when NetworkModel changes.
        Only affects cases with FRESH status.

        Args:
            project_id: Project ID

        Returns:
            Number of cases marked as OUTDATED
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")
            return repo.mark_all_cases_outdated(project_id)

    def mark_case_outdated(self, case_id: UUID) -> bool:
        """
        Mark a single study case as OUTDATED.

        Called when case configuration changes.

        Args:
            case_id: Case ID

        Returns:
            True if case was marked, False if not found or already OUTDATED/NONE
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")
            return repo.mark_case_outdated(case_id)

    def mark_case_fresh(
        self,
        case_id: UUID,
        analysis_run_id: UUID,
        analysis_type: str,
        input_hash: str,
    ) -> bool:
        """
        Mark a study case as FRESH after successful calculation.

        Args:
            case_id: Case ID
            analysis_run_id: ID of the analysis run with results
            analysis_type: Type of analysis (e.g., "short_circuit_sn")
            input_hash: Hash of the input for cache invalidation

        Returns:
            True if case was marked, False if not found
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")

            result_ref = StudyCaseResult(
                analysis_run_id=analysis_run_id,
                analysis_type=analysis_type,
                calculated_at=datetime.now(UTC),
                input_hash=input_hash,
            )
            return repo.mark_case_fresh(case_id, result_ref)

    # =========================================================================
    # Validation Helpers
    # =========================================================================

    def require_active_case(self, project_id: UUID) -> StudyCase:
        """
        Get the active case, raising if none is set.

        Args:
            project_id: Project ID

        Returns:
            Active StudyCase

        Raises:
            ActiveCaseRequiredError: If no active case
        """
        case = self.get_active_case(project_id)
        if case is None:
            raise ActiveCaseRequiredError(str(project_id))
        return case

    def can_calculate(self, case_id: UUID) -> tuple[bool, str | None]:
        """
        Check if a case can be calculated.

        Returns:
            (can_calculate, error_message)
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")

            case = repo.get_study_case(case_id)
            if case is None:
                return False, "Przypadek obliczeniowy nie istnieje"

            if not case.is_active:
                return False, "Przypadek nie jest aktywny"

            # Additional validation could be added here
            return True, None

    def count_cases(self, project_id: UUID) -> int:
        """Count study cases for a project."""
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")
            return repo.count_study_cases(project_id)

    # =========================================================================
    # Protection Configuration (P14c)
    # =========================================================================

    def update_protection_config(
        self,
        case_id: UUID,
        template_ref: str | None,
        template_fingerprint: str | None,
        library_manifest_ref: dict[str, Any] | None,
        overrides: dict[str, Any],
    ) -> StudyCase:
        """
        Update protection configuration for a study case (P14c).

        Args:
            case_id: Study case ID
            template_ref: ID of ProtectionSettingTemplate (None to clear)
            template_fingerprint: Fingerprint of template at bind time
            library_manifest_ref: Reference to library manifest
            overrides: Override values for setting fields

        Returns:
            Updated StudyCase

        Raises:
            StudyCaseNotFoundError: If case doesn't exist
            ValueError: If template_ref doesn't exist in catalog
        """
        with self._uow_factory() as uow:
            repo = uow.cases
            if repo is None:
                raise CaseConfigurationError("Repozytorium przypadków jest niedostępne")

            # Get case
            case = repo.get_study_case(case_id)
            if case is None:
                raise StudyCaseNotFoundError(str(case_id))

            # TODO P14c: Validate template_ref exists in catalog
            # For now, we trust the frontend validation

            # Create new ProtectionConfig
            now = datetime.now(UTC)
            new_config = ProtectionConfig(
                template_ref=template_ref,
                template_fingerprint=template_fingerprint,
                library_manifest_ref=library_manifest_ref,
                overrides=overrides or {},
                bound_at=now if template_ref else None,
            )

            # Update case
            updated_case = case.with_protection_config(new_config)
            repo.update_study_case(updated_case)

            return updated_case
