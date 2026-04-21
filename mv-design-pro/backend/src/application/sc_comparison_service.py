"""
Short-Circuit Comparison Service — PR-20: Deterministic Comparison

Application service for computing mathematical deltas between two SC ResultSets.

INVARIANTS:
- INTERPRETATION ONLY — no physics, no solver calls
- analysis_type must match between ResultSets
- study_case_id must match between ResultSets
- Both ResultSets must have status DONE (verified via Run)
- ZERO heuristics
- ZERO severity scoring (separate PR)
"""

from __future__ import annotations

import logging
from uuid import UUID

from application.execution_engine.service import ExecutionEngineService
from domain.execution import (
    RunStatus,
)
from domain.sc_comparison import (
    ShortCircuitComparison,
    build_comparison,
)

logger = logging.getLogger(__name__)


class ComparisonError(Exception):
    """Base exception for comparison errors."""

    pass


class ComparisonNotFoundError(ComparisonError):
    """Comparison does not exist."""

    def __init__(self, comparison_id: str) -> None:
        super().__init__(f"Porównanie nie istnieje: {comparison_id}")
        self.comparison_id = comparison_id


class AnalysisTypeMismatchError(ComparisonError):
    """ResultSets have different analysis types."""

    def __init__(self, type_a: str, type_b: str) -> None:
        super().__init__(f"Typy analiz nie zgadzają się: {type_a} vs {type_b}")
        self.type_a = type_a
        self.type_b = type_b


class StudyCaseMismatchError(ComparisonError):
    """ResultSets belong to different study cases."""

    def __init__(self, case_a: str, case_b: str) -> None:
        super().__init__(f"Przypadki obliczeniowe nie zgadzają się: {case_a} vs {case_b}")
        self.case_a = case_a
        self.case_b = case_b


class RunNotDoneError(ComparisonError):
    """Run is not in DONE status."""

    def __init__(self, run_id: str, status: str) -> None:
        super().__init__(f"Przebieg {run_id} ma status {status} — wymagany DONE")
        self.run_id = run_id
        self.status = status


class ScComparisonService:
    """
    Service for computing short-circuit result comparisons.

    Validates inputs, extracts ResultSets, and delegates delta
    computation to the domain layer.
    """

    def __init__(self, engine: ExecutionEngineService) -> None:
        self._engine = engine
        self._comparisons: dict[UUID, ShortCircuitComparison] = {}
        self._case_comparisons: dict[UUID, list[UUID]] = {}

    def compute_comparison(
        self,
        *,
        study_case_id: UUID,
        base_run_id: UUID,
        other_run_id: UUID,
        base_scenario_id: UUID,
        other_scenario_id: UUID,
    ) -> ShortCircuitComparison:
        """
        Compute a comparison between two SC ResultSets.

        Validates:
        - Both runs exist and are DONE
        - Both runs have the same analysis_type
        - Both runs belong to the same study_case_id

        Args:
            study_case_id: Expected study case for both runs.
            base_run_id: Run ID for the base (reference) result.
            other_run_id: Run ID for the other (comparison) result.
            base_scenario_id: Scenario ID for the base result.
            other_scenario_id: Scenario ID for the other result.

        Returns:
            ShortCircuitComparison with computed deltas.

        Raises:
            RunNotFoundError: If either run doesn't exist.
            RunNotDoneError: If either run is not DONE.
            AnalysisTypeMismatchError: If analysis types differ.
            StudyCaseMismatchError: If study cases differ.
        """
        # Get both runs
        base_run = self._engine.get_run(base_run_id)
        other_run = self._engine.get_run(other_run_id)

        # Validate DONE status
        if base_run.status != RunStatus.DONE:
            raise RunNotDoneError(str(base_run_id), base_run.status.value)
        if other_run.status != RunStatus.DONE:
            raise RunNotDoneError(str(other_run_id), other_run.status.value)

        # Validate same analysis_type
        if base_run.analysis_type != other_run.analysis_type:
            raise AnalysisTypeMismatchError(
                base_run.analysis_type.value,
                other_run.analysis_type.value,
            )

        # Validate same study_case_id
        if base_run.study_case_id != other_run.study_case_id:
            raise StudyCaseMismatchError(
                str(base_run.study_case_id),
                str(other_run.study_case_id),
            )

        if base_run.study_case_id != study_case_id:
            raise StudyCaseMismatchError(
                str(study_case_id),
                str(base_run.study_case_id),
            )

        # Get ResultSets
        base_result_set = self._engine.get_result_set(base_run_id)
        other_result_set = self._engine.get_result_set(other_run_id)

        # Build comparison
        comparison = build_comparison(
            study_case_id=study_case_id,
            analysis_type=base_run.analysis_type,
            base_scenario_id=base_scenario_id,
            other_scenario_id=other_scenario_id,
            base_result_set=base_result_set,
            other_result_set=other_result_set,
        )

        # Store
        self._comparisons[comparison.comparison_id] = comparison
        if study_case_id not in self._case_comparisons:
            self._case_comparisons[study_case_id] = []
        self._case_comparisons[study_case_id].append(comparison.comparison_id)

        logger.info(
            "Comparison %s computed: base=%s other=%s hash=%s",
            comparison.comparison_id,
            base_run_id,
            other_run_id,
            comparison.input_hash[:16],
        )

        return comparison

    def get_comparison(self, comparison_id: UUID) -> ShortCircuitComparison:
        """Get a comparison by ID."""
        comparison = self._comparisons.get(comparison_id)
        if comparison is None:
            raise ComparisonNotFoundError(str(comparison_id))
        return comparison

    def list_comparisons(self, study_case_id: UUID) -> list[ShortCircuitComparison]:
        """List all comparisons for a study case, newest first."""
        comparison_ids = self._case_comparisons.get(study_case_id, [])
        comparisons = [self._comparisons[cid] for cid in comparison_ids if cid in self._comparisons]
        return list(reversed(comparisons))
