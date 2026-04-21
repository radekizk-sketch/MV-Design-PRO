from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    message: str
    element_id: str | None = None
    field: str | None = None


@dataclass(frozen=True)
class ValidationReport:
    errors: tuple[ValidationIssue, ...] = field(default_factory=tuple)
    warnings: tuple[ValidationIssue, ...] = field(default_factory=tuple)

    @property
    def is_valid(self) -> bool:
        return not self.errors

    def with_error(self, issue: ValidationIssue) -> ValidationReport:
        return ValidationReport(errors=self.errors + (issue,), warnings=self.warnings)

    def with_warning(self, issue: ValidationIssue) -> ValidationReport:
        return ValidationReport(errors=self.errors, warnings=self.warnings + (issue,))

    def to_dict(self) -> dict:
        return {
            "errors": [self._issue_to_dict(issue) for issue in self._sorted(self.errors)],
            "warnings": [self._issue_to_dict(issue) for issue in self._sorted(self.warnings)],
            "is_valid": self.is_valid,
        }

    @staticmethod
    def _issue_to_dict(issue: ValidationIssue) -> dict:
        return {
            "code": issue.code,
            "message": issue.message,
            "element_id": issue.element_id,
            "field": issue.field,
        }

    @staticmethod
    def _sorted(issues: Iterable[ValidationIssue]) -> list[ValidationIssue]:
        return sorted(
            issues,
            key=lambda issue: (
                issue.code,
                issue.element_id or "",
                issue.field or "",
                issue.message,
            ),
        )
