"""Application adapter for legacy unified run endpoints.

Public API modules cannot import the historical analysis dispatch package
directly. This adapter keeps the compatibility route thin while the actual
dispatch implementation remains in the application layer.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from application.analysis_dispatch import AnalysisDispatchService
from application.analysis_dispatch.summary import AnalysisRunSummary
from domain.analysis_kind import AnalysisKind
from infrastructure.persistence.unit_of_work import UnitOfWork


class UnifiedRunDispatchService:
    """Compatibility facade for `/api/runs/*` dispatch routes."""

    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._delegate = AnalysisDispatchService(uow_factory)

    def dispatch(
        self,
        *,
        analysis_kind: AnalysisKind,
        project_id: UUID,
        study_case_id: UUID | None,
        options: dict[str, Any] | None,
    ) -> AnalysisRunSummary:
        return self._delegate.dispatch(
            analysis_kind=analysis_kind,
            project_id=project_id,
            study_case_id=study_case_id,
            options=options,
        )
