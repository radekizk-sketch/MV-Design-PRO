from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from application.active_case.errors import ActiveCaseNotFoundError
from infrastructure.persistence.unit_of_work import UnitOfWork


class ActiveCaseService:
    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    def get_active_case_id(self, project_id: UUID) -> UUID | None:
        with self._uow_factory() as uow:
            self._ensure_project(uow, project_id)
            active_case_id = uow.wizard.get_active_case_id(project_id)
            if active_case_id is not None:
                case = uow.cases.get_operating_case(active_case_id)
                if case is not None and case.project_id == project_id:
                    return active_case_id
            cases = uow.cases.list_operating_cases(project_id)
            if len(cases) == 1:
                case_id = cases[0].id
                uow.wizard.set_active_case_id(project_id, case_id, commit=False)
                return case_id
            return None

    def set_active_case(self, project_id: UUID, case_id: UUID) -> None:
        with self._uow_factory() as uow:
            self._ensure_project(uow, project_id)
            case = uow.cases.get_operating_case(case_id)
            if case is None or case.project_id != project_id:
                raise ActiveCaseNotFoundError(
                    f"OperatingCase {case_id} not found for project {project_id}"
                )
            uow.wizard.set_active_case_id(project_id, case_id, commit=False)

    def _ensure_project(self, uow: UnitOfWork, project_id: UUID) -> None:
        if uow.projects.get(project_id) is None:
            raise ActiveCaseNotFoundError(f"Project {project_id} not found")
