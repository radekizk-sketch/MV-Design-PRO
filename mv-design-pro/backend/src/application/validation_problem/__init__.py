"""ValidationProblemService — agregacja problemów walidacyjnych (PR-12).

Brief 2 §3 pkt 11. Klasyfikacja:
- error (czerwony, blokujący)
- warning (żółty)
- info (szary)
"""

from src.application.validation_problem.service import (
    ValidationProblem,
    ValidationProblemService,
    ValidationSeverity,
)

__all__ = [
    "ValidationProblem",
    "ValidationProblemService",
    "ValidationSeverity",
]
