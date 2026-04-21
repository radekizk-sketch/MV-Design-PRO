"""
Execution Engine — PR-14: StudyCase → Run → ResultSet

Canonical execution layer that ensures:
- Solver is NEVER called directly from UI
- Every result is tied to a deterministic run_id
- Readiness/eligibility gating before execution
- Full audit trail (solver_input_hash, deterministic_signature)
"""

from .errors import (
    ExecutionError,
    ResultSetNotFoundError,
    RunBlockedError,
    RunNotFoundError,
    RunNotReadyError,
    StudyCaseNotFoundError,
)
from .service import ExecutionEngineService

__all__ = [
    "ExecutionEngineService",
    "ExecutionError",
    "RunNotFoundError",
    "RunNotReadyError",
    "RunBlockedError",
    "ResultSetNotFoundError",
    "StudyCaseNotFoundError",
]
