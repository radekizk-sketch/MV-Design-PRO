"""
Result Invalidator — PR-4: Study Case Lifecycle & Result Invalidation

Cascading invalidation for project-wide and case-level changes.

INVALIDATION MATRIX (§10.8, BINDING):
| Event                        | Scope       | New Status |
|------------------------------|-------------|------------|
| Model changed (new snapshot) | ALL cases   | OUTDATED   |
| Config changed               | Single case | OUTDATED   |
| Protection config changed    | Single case | OUTDATED   |
| Wizard commit (ENM edit)     | ALL cases   | OUTDATED   |

RULE: UI/API MUST NOT use results when results_valid == False.
"""

from __future__ import annotations

from uuid import UUID

from infrastructure.persistence.unit_of_work import UnitOfWork


class ResultInvalidator:
    """
    Cascading result invalidation for model and configuration changes.

    Ensures that stale results are never accessible after:
    - ENM / topology changes (project-wide)
    - Solver parameter changes (single case)
    - Protection config changes (single case)
    """

    def invalidate_project_results(self, uow: UnitOfWork, project_id: UUID) -> int:
        """
        Invalidate ALL results in a project after model/topology change.

        Cascades to:
        1. All AnalysisRuns → result_status = OUTDATED
        2. All StudyCases → result_status = OUTDATED (FRESH→OUTDATED only)

        Returns total number of affected entities (runs + cases).
        """
        affected = 0

        # 1. Invalidate all analysis runs
        if uow.analysis_runs is not None:
            affected += uow.analysis_runs.mark_results_outdated(project_id, commit=False)

        # 2. Invalidate all study cases (FRESH → OUTDATED, NONE stays NONE)
        if uow.cases is not None:
            affected += uow.cases.mark_all_cases_outdated(project_id, commit=False)

        return affected

    def invalidate_case_results(self, uow: UnitOfWork, project_id: UUID, case_id: UUID) -> int:
        """
        Invalidate results for a single case after config/protection change.

        Cascades to:
        1. AnalysisRuns bound to this case → result_status = OUTDATED
        2. The StudyCase itself → result_status = OUTDATED

        Returns total number of affected entities.
        """
        affected = 0

        # 1. Invalidate analysis runs for this case
        if uow.analysis_runs is not None:
            affected += uow.analysis_runs.mark_results_outdated_for_case(
                project_id, case_id, commit=False
            )

        # 2. Invalidate the study case
        if uow.cases is not None:
            if uow.cases.mark_case_outdated(case_id, commit=False):
                affected += 1

        return affected
