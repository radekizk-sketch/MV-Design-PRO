"""
Pre-flight checks — macierz dostępności analiz przed RUN (v4.2).

Wyświetlana przed K10 (RUN). Tabela z analizami i ich statusem.
Brak „magii" — wszystko z DiagnosticEngine.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from .engine import DiagnosticEngine
from .models import (
    AnalysisAvailability,
    AnalysisType,
    DiagnosticReport,
    DiagnosticStatus,
)

if TYPE_CHECKING:
    from network_model.core.graph import NetworkGraph


@dataclass(frozen=True)
class PreflightCheckEntry:
    """Wpis w tabeli pre-flight."""

    analysis_type: str
    analysis_label_pl: str
    status: str  # "AVAILABLE" | "BLOCKED"
    reason_pl: str | None = None
    blocking_codes: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "analysis_type": self.analysis_type,
            "analysis_label_pl": self.analysis_label_pl,
            "status": self.status,
            "reason_pl": self.reason_pl,
            "blocking_codes": list(self.blocking_codes),
        }


@dataclass(frozen=True)
class PreflightReport:
    """Raport pre-flight — gotowość do RUN."""

    ready: bool
    overall_status: str  # "OK" | "WARN" | "FAIL"
    checks: tuple[PreflightCheckEntry, ...] = field(default_factory=tuple)
    blocker_count: int = 0
    warning_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "ready": self.ready,
            "overall_status": self.overall_status,
            "checks": [c.to_dict() for c in self.checks],
            "blocker_count": self.blocker_count,
            "warning_count": self.warning_count,
        }


_ANALYSIS_LABELS_PL: dict[str, str] = {
    AnalysisType.SC_3F.value: "Zwarcie trójfazowe (SC 3F)",
    AnalysisType.SC_1F.value: "Zwarcie jednofazowe (SC 1F)",
    AnalysisType.LF.value: "Rozpływ mocy (Load Flow)",
    AnalysisType.PROTECTION.value: "Koordynacja zabezpieczeń",
}


def run_preflight(graph: NetworkGraph) -> PreflightReport:
    """
    Uruchom pre-flight checks na grafie sieci.

    Args:
        graph: Graf sieci ENM.

    Returns:
        PreflightReport z macierzą dostępności analiz.
    """
    engine = DiagnosticEngine()
    report = engine.run(graph)
    return _build_preflight_from_report(report)


def build_preflight_from_diagnostic_report(
    report: DiagnosticReport,
) -> PreflightReport:
    """
    Zbuduj raport pre-flight z istniejącego raportu diagnostycznego.

    Args:
        report: DiagnosticReport (wynik DiagnosticEngine.run()).

    Returns:
        PreflightReport.
    """
    return _build_preflight_from_report(report)


def _build_preflight_from_report(report: DiagnosticReport) -> PreflightReport:
    checks: list[PreflightCheckEntry] = []

    for entry in report.analysis_matrix.entries:
        label = _ANALYSIS_LABELS_PL.get(entry.analysis_type.value, entry.analysis_type.value)
        checks.append(
            PreflightCheckEntry(
                analysis_type=entry.analysis_type.value,
                analysis_label_pl=label,
                status=entry.availability.value,
                reason_pl=entry.reason_pl,
                blocking_codes=entry.blocking_codes,
            )
        )

    any(c.status == AnalysisAvailability.BLOCKED.value for c in checks)

    return PreflightReport(
        ready=report.status != DiagnosticStatus.FAIL,
        overall_status=report.status.value,
        checks=tuple(checks),
        blocker_count=len(report.blockers),
        warning_count=len(report.warnings),
    )
