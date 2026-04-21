"""
Study Case Errors — P10 FULL MAX

Error types for study case operations.
"""

from __future__ import annotations


class StudyCaseError(Exception):
    """Base error for study case operations."""

    pass


class StudyCaseNotFoundError(StudyCaseError):
    """Raised when a study case is not found."""

    def __init__(self, case_id: str):
        self.case_id = case_id
        super().__init__(f"Przypadek obliczeniowy nie istnieje: {case_id}")


class ActiveCaseRequiredError(StudyCaseError):
    """Raised when an active case is required but none is set."""

    def __init__(self, project_id: str):
        self.project_id = project_id
        super().__init__(f"Wymagany aktywny przypadek obliczeniowy dla projektu: {project_id}")


class CaseConfigurationError(StudyCaseError):
    """Raised when case configuration is invalid."""

    def __init__(self, message: str):
        super().__init__(f"Błąd konfiguracji przypadku: {message}")


class ResultsNotAvailableError(StudyCaseError):
    """Raised when results are not available for comparison."""

    def __init__(self, case_id: str, reason: str):
        self.case_id = case_id
        self.reason = reason
        super().__init__(f"Wyniki niedostępne dla przypadku {case_id}: {reason}")


class OperationNotAllowedError(StudyCaseError):
    """Raised when an operation is not allowed in current mode."""

    def __init__(self, operation: str, mode: str):
        self.operation = operation
        self.mode = mode
        super().__init__(f"Operacja '{operation}' niedozwolona w trybie '{mode}'")


class StaleResultsError(StudyCaseError):
    """
    PR-4: Raised when stale/outdated results are accessed.

    Results become stale when:
    - ENM/topology changes after calculation
    - Solver parameters change after calculation
    - Protection config changes after calculation

    UI/API MUST NOT use stale results for display, export, or analysis.
    """

    def __init__(self, run_id: str, result_status: str):
        self.run_id = run_id
        self.result_status = result_status
        super().__init__(
            f"Wyniki przebiegu {run_id} są nieaktualne (status: {result_status}). "
            "Wymagane ponowne obliczenie."
        )
