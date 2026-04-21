"""
DiagnosticEngine — silnik diagnostyki inżynierskiej ENM (v4.2).

Wejście: NetworkGraph (kanoniczny) + opcjonalny kontekst case.
Wyjście: DiagnosticReport (frozen, deterministyczny).

Zasady:
- Brak mutacji ENM
- Stabilne kody błędów
- Deterministyczne sortowanie wyników
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .models import (
    AnalysisAvailability,
    AnalysisMatrix,
    AnalysisMatrixEntry,
    AnalysisType,
    DiagnosticIssue,
    DiagnosticReport,
    DiagnosticSeverity,
    DiagnosticStatus,
)
from .rules import (
    ALL_BLOCKER_RULES,
    ALL_INFO_GRAPH_RULES,
    ALL_WARN_RULES,
    rule_i_d01_full_analysis_available,
)

if TYPE_CHECKING:
    from network_model.core.graph import NetworkGraph


class DiagnosticEngine:
    """
    Silnik diagnostyki inżynierskiej ENM.

    Analizuje graf sieci i zwraca raport diagnostyczny
    z listą problemów oraz macierzą dostępności analiz.

    Nie mutuje grafu — operuje read-only.
    """

    def run(self, graph: NetworkGraph) -> DiagnosticReport:
        """
        Uruchom pełną diagnostykę na grafie sieci.

        Args:
            graph: Graf sieci ENM (read-only).

        Returns:
            DiagnosticReport z listą problemów i macierzą analiz.
        """
        all_issues: list[DiagnosticIssue] = []

        # 1. Run BLOCKER rules
        for rule_fn in ALL_BLOCKER_RULES:
            all_issues.extend(rule_fn(graph))

        # 2. Run WARN rules
        for rule_fn in ALL_WARN_RULES:
            all_issues.extend(rule_fn(graph))

        # 3. Run INFO rules (graph-based)
        for rule_fn in ALL_INFO_GRAPH_RULES:
            all_issues.extend(rule_fn(graph))

        # 4. Run I-D01 (conditional on blockers)
        blockers = [i for i in all_issues if i.severity == DiagnosticSeverity.BLOCKER]
        all_issues.extend(rule_i_d01_full_analysis_available(blockers))

        # 5. Sort deterministically: severity order then by code
        severity_order = {
            DiagnosticSeverity.BLOCKER: 0,
            DiagnosticSeverity.WARN: 1,
            DiagnosticSeverity.INFO: 2,
        }
        all_issues.sort(key=lambda i: (severity_order[i.severity], i.code))

        # 6. Compute analysis matrix
        analysis_matrix = self._compute_analysis_matrix(graph, blockers, all_issues)

        # 7. Determine overall status
        if blockers:
            status = DiagnosticStatus.FAIL
        elif any(i.severity == DiagnosticSeverity.WARN for i in all_issues):
            status = DiagnosticStatus.WARN
        else:
            status = DiagnosticStatus.OK

        return DiagnosticReport(
            status=status,
            issues=tuple(all_issues),
            analysis_matrix=analysis_matrix,
        )

    def _compute_analysis_matrix(
        self,
        graph: NetworkGraph,
        blockers: list[DiagnosticIssue],
        all_issues: list[DiagnosticIssue],
    ) -> AnalysisMatrix:
        """Oblicz macierz dostępności analiz na podstawie problemów."""
        blocker_codes = {b.code for b in blockers}
        all_codes = {i.code for i in all_issues}

        # Common blockers that affect all analyses
        common_blockers = blocker_codes & {
            "E-D01",
            "E-D03",
            "E-D04",
        }

        entries: list[AnalysisMatrixEntry] = []

        # SC 3F
        sc3f_blockers = common_blockers | (blocker_codes & {"E-D05"})
        entries.append(
            self._matrix_entry(
                AnalysisType.SC_3F,
                sc3f_blockers,
                "Zwarcie trójfazowe zablokowane",
            )
        )

        # SC 1F — also blocked by E-D06 (WARN-level, Z0 restriction)
        sc1f_blockers = common_blockers | (blocker_codes & {"E-D05"})
        if "E-D06" in all_codes:
            sc1f_blockers.add("E-D06")
        entries.append(
            self._matrix_entry(
                AnalysisType.SC_1F,
                sc1f_blockers,
                "Zwarcie jednofazowe zablokowane",
            )
        )

        # LF (Load Flow)
        lf_blockers = common_blockers | (blocker_codes & {"E-D02", "E-D05"})
        entries.append(
            self._matrix_entry(
                AnalysisType.LF,
                lf_blockers,
                "Rozpływ mocy zablokowany",
            )
        )

        # Protection
        protection_blockers = common_blockers | (blocker_codes & {"E-D05"})
        entries.append(
            self._matrix_entry(
                AnalysisType.PROTECTION,
                protection_blockers,
                "Koordynacja zabezpieczeń zablokowana",
            )
        )

        return AnalysisMatrix(entries=tuple(entries))

    def _matrix_entry(
        self,
        analysis_type: AnalysisType,
        blocking_codes: set[str],
        blocked_reason: str,
    ) -> AnalysisMatrixEntry:
        if blocking_codes:
            return AnalysisMatrixEntry(
                analysis_type=analysis_type,
                availability=AnalysisAvailability.BLOCKED,
                reason_pl=f"{blocked_reason}: {', '.join(sorted(blocking_codes))}",
                blocking_codes=tuple(sorted(blocking_codes)),
            )
        return AnalysisMatrixEntry(
            analysis_type=analysis_type,
            availability=AnalysisAvailability.AVAILABLE,
        )
