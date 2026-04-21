"""Execution engine error types (Polish labels for UI consistency)."""

from __future__ import annotations


class ExecutionError(Exception):
    """Base exception for execution engine."""

    pass


class RunNotFoundError(ExecutionError):
    """Run does not exist."""

    def __init__(self, run_id: str) -> None:
        super().__init__(f"Przebieg obliczeniowy nie istnieje: {run_id}")
        self.run_id = run_id


class RunNotReadyError(ExecutionError):
    """Network/case is not ready for execution."""

    def __init__(self, reason: str) -> None:
        super().__init__(f"Sieć nie jest gotowa do obliczeń: {reason}")
        self.reason = reason


class RunBlockedError(ExecutionError):
    """Run is blocked by eligibility check."""

    def __init__(self, blockers: list[str]) -> None:
        msg = "Obliczenie zablokowane: " + "; ".join(blockers)
        super().__init__(msg)
        self.blockers = blockers


class ResultSetNotFoundError(ExecutionError):
    """ResultSet does not exist for the given run."""

    def __init__(self, run_id: str) -> None:
        super().__init__(f"Wyniki nie istnieją dla przebiegu: {run_id}")
        self.run_id = run_id


class StudyCaseNotFoundError(ExecutionError):
    """Study case does not exist."""

    def __init__(self, case_id: str) -> None:
        super().__init__(f"Przypadek obliczeniowy nie istnieje: {case_id}")
        self.case_id = case_id
