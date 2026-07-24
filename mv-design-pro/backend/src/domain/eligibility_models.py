"""
Analysis Eligibility Matrix — PR-17: Domain Models

Deterministyczna warstwa zdolności uruchomienia analiz (eligibility).
Niezależna od walidacji (validation) i gotowości (readiness).

DOMAIN ENTITIES:
- AnalysisType: SC_3F, SC_2F, SC_1F, LOAD_FLOW
- EligibilityStatus: ELIGIBLE, INELIGIBLE
- IssueSeverity: BLOCKER, WARNING, INFO
- AnalysisEligibilityIssue: pojedynczy problem blokujący/ostrzegawczy
- AnalysisEligibilityResult: wynik eligibility dla jednej analizy
- AnalysisEligibilityMatrix: macierz eligibility dla wszystkich analiz

INVARIANTS:
- Immutable (frozen dataclass / Pydantic frozen)
- Deterministyczny: identyczny ENM + readiness -> identyczny matrix + content_hash
- content_hash = SHA-256 z kanonicznego JSON (sorted keys, sorted lists)
- Reuse FixAction z PR-13 (enm.fix_actions)
- Zero heurystyk, zero mutacji ENM
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from enm.fix_actions import FixAction

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class AnalysisType(StrEnum):
    """Typy analiz objęte macierzą eligibility."""

    SC_3F = "SC_3F"
    SC_2F = "SC_2F"
    SC_1F = "SC_1F"
    LOAD_FLOW = "LOAD_FLOW"


class EligibilityStatus(StrEnum):
    """Status eligibility dla danego typu analizy."""

    ELIGIBLE = "ELIGIBLE"
    INELIGIBLE = "INELIGIBLE"


class IssueSeverity(StrEnum):
    """Waga problemu eligibility."""

    BLOCKER = "BLOCKER"
    WARNING = "WARNING"
    INFO = "INFO"


# ---------------------------------------------------------------------------
# AnalysisEligibilityIssue
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AnalysisEligibilityIssue:
    """Pojedynczy problem eligibility.

    Stabilny kod (ELIG_*), komunikat PL, opcjonalny element i fix_action.
    FixAction to ten sam model z PR-13 (enm.fix_actions).
    """

    code: str
    severity: IssueSeverity
    message_pl: str
    element_ref: str | None = None
    element_type: str | None = None
    fix_action: FixAction | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity.value,
            "message_pl": self.message_pl,
            "element_ref": self.element_ref,
            "element_type": self.element_type,
            "fix_action": (self.fix_action.model_dump(mode="json") if self.fix_action else None),
        }


# ---------------------------------------------------------------------------
# AnalysisEligibilityResult
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AnalysisEligibilityResult:
    """Wynik eligibility dla jednego typu analizy.

    Deterministyczny: sorted issues by code + element_ref.
    content_hash = SHA-256 z kanonicznego JSON.
    """

    analysis_type: AnalysisType
    status: EligibilityStatus
    blockers: tuple[AnalysisEligibilityIssue, ...] = field(default_factory=tuple)
    warnings: tuple[AnalysisEligibilityIssue, ...] = field(default_factory=tuple)
    info: tuple[AnalysisEligibilityIssue, ...] = field(default_factory=tuple)
    content_hash: str = ""

    @property
    def by_severity(self) -> dict[str, int]:
        return {
            "BLOCKER": len(self.blockers),
            "WARNING": len(self.warnings),
            "INFO": len(self.info),
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "analysis_type": self.analysis_type.value,
            "status": self.status.value,
            "blockers": [b.to_dict() for b in self.blockers],
            "warnings": [w.to_dict() for w in self.warnings],
            "info": [i.to_dict() for i in self.info],
            "by_severity": self.by_severity,
            "content_hash": self.content_hash,
        }


# ---------------------------------------------------------------------------
# AnalysisEligibilityMatrix
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AnalysisEligibilityMatrix:
    """Macierz eligibility dla wszystkich typów analiz.

    Deterministyczny: matrix sorted by AnalysisType.value.
    content_hash = SHA-256 z kanonicznego JSON całej macierzy.
    """

    case_id: str
    enm_revision: int
    matrix: tuple[AnalysisEligibilityResult, ...] = field(default_factory=tuple)
    content_hash: str = ""

    @property
    def overall(self) -> dict[str, Any]:
        statuses = [r.status for r in self.matrix]
        return {
            "eligible_any": any(s == EligibilityStatus.ELIGIBLE for s in statuses),
            "eligible_all": all(s == EligibilityStatus.ELIGIBLE for s in statuses),
            "blockers_total": sum(len(r.blockers) for r in self.matrix),
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "enm_revision": self.enm_revision,
            "matrix": [r.to_dict() for r in self.matrix],
            "overall": self.overall,
            "content_hash": self.content_hash,
        }


# ---------------------------------------------------------------------------
# Deterministic hashing helpers
# ---------------------------------------------------------------------------


def _sort_issues(
    issues: list[AnalysisEligibilityIssue],
) -> tuple[AnalysisEligibilityIssue, ...]:
    """Sort issues deterministically by code, then element_ref."""
    return tuple(sorted(issues, key=lambda i: (i.code, i.element_ref or "")))


def compute_eligibility_result_hash(result_dict: dict[str, Any]) -> str:
    """SHA-256 z kanonicznego JSON wyniku eligibility."""
    payload = json.dumps(result_dict, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_eligibility_result(
    *,
    analysis_type: AnalysisType,
    blockers: list[AnalysisEligibilityIssue],
    warnings: list[AnalysisEligibilityIssue] | None = None,
    info: list[AnalysisEligibilityIssue] | None = None,
) -> AnalysisEligibilityResult:
    """Build AnalysisEligibilityResult with computed hash.

    Status = INELIGIBLE if any blockers, ELIGIBLE otherwise.
    Issues sorted deterministically.
    """
    sorted_blockers = _sort_issues(blockers)
    sorted_warnings = _sort_issues(warnings or [])
    sorted_info = _sort_issues(info or [])

    status = EligibilityStatus.INELIGIBLE if sorted_blockers else EligibilityStatus.ELIGIBLE

    # Build hash from canonical dict (without hash field)
    sig_data = {
        "analysis_type": analysis_type.value,
        "status": status.value,
        "blockers": [b.to_dict() for b in sorted_blockers],
        "warnings": [w.to_dict() for w in sorted_warnings],
        "info": [i.to_dict() for i in sorted_info],
    }
    content_hash = compute_eligibility_result_hash(sig_data)

    return AnalysisEligibilityResult(
        analysis_type=analysis_type,
        status=status,
        blockers=sorted_blockers,
        warnings=sorted_warnings,
        info=sorted_info,
        content_hash=content_hash,
    )


def build_eligibility_matrix(
    *,
    case_id: str,
    enm_revision: int,
    results: list[AnalysisEligibilityResult],
) -> AnalysisEligibilityMatrix:
    """Build AnalysisEligibilityMatrix with computed hash.

    Results sorted by AnalysisType.value for determinism.
    """
    sorted_results = tuple(sorted(results, key=lambda r: r.analysis_type.value))

    # Build hash from canonical dict (without top-level hash)
    sig_data = {
        "case_id": case_id,
        "enm_revision": enm_revision,
        "matrix": [r.to_dict() for r in sorted_results],
    }
    content_hash = compute_eligibility_result_hash(sig_data)

    return AnalysisEligibilityMatrix(
        case_id=case_id,
        enm_revision=enm_revision,
        matrix=sorted_results,
        content_hash=content_hash,
    )
