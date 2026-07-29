"""P22: Power Flow Interpretation Builder.

Builder interpretacji wynikow rozplywu mocy.

KANON (BINDING):
- Analysis != Solver (ZERO obliczen fizycznych)
- Interpretacja WYLACZNIE na podstawie PowerFlowResult
- Determinizm absolutny (sortowanie po ID, stale progi)
- 100% jezyk polski w description_pl
- Brak norm, brak "OK / VIOLATION"

REGULY SEVERITY (jawne, stale):
- Voltage: |V - 1.0| < 2% -> INFO, 2-5% -> WARN, >5% -> HIGH
- Branch loading: jesli dostepne dane o obciazeniu
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import TYPE_CHECKING

from analysis.power_flow_interpretation.models import (
    BranchLoadingFinding,
    FindingSeverity,
    InterpretationContext,
    InterpretationRankedItem,
    InterpretationSummary,
    InterpretationThresholds,
    InterpretationTrace,
    PowerFlowInterpretationResult,
    VoltageFinding,
)
from analysis.power_flow_interpretation.serializer import SEVERITY_ORDER

if TYPE_CHECKING:
    from analysis.power_flow.result import PowerFlowResult


# =============================================================================
# Constants (BINDING)
# =============================================================================


# Version interpretacji - zmiana = nowa wersja
INTERPRETATION_VERSION = "1.0.0"

# Progi napieciowe (BINDING - stale)
VOLTAGE_INFO_MAX_PCT = 2.0  # |V - 1.0| < 2% -> INFO
VOLTAGE_WARN_MAX_PCT = 5.0  # 2-5% -> WARN, >5% -> HIGH

# Progi obciazenia galezi (opcjonalne - jesli brak danych o prądowosci znamionowej)
# Te progi sa uzywane tylko jesli mamy dane o obciazeniu wzglednym
BRANCH_LOADING_INFO_MAX_PCT = 70.0  # <70% -> INFO
BRANCH_LOADING_WARN_MAX_PCT = 90.0  # 70-90% -> WARN, >90% -> HIGH

# P22b BINDING: Progi strat galeziowych (kW) - uzywane gdy brak danych o obciazeniu
BRANCH_LOSSES_INFO_MAX_KW = 2.0  # < 2 kW -> INFO
BRANCH_LOSSES_WARN_MAX_KW = 5.0  # 2-5 kW -> WARN, >5 kW -> HIGH

# Liczba elementow w rankingu top issues
TOP_ISSUES_COUNT = 10


# =============================================================================
# Builder Class
# =============================================================================


class PowerFlowInterpretationBuilder:
    """Builder interpretacji wynikow rozplywu mocy.

    INVARIANTS:
    - READ-ONLY: Nie modyfikuje PowerFlowResult
    - DETERMINISTIC: Ten sam input -> identyczny output
    - NO PHYSICS: Tylko interpretacja, zero obliczen
    """

    def __init__(
        self,
        context: InterpretationContext | None = None,
    ) -> None:
        """Initialize builder.

        Args:
            context: Opcjonalny kontekst interpretacji (projekt, case, timestamp)
        """
        self._context = context

    def build(
        self,
        power_flow_result: PowerFlowResult,
        run_id: str,
        run_timestamp: datetime | None = None,
    ) -> PowerFlowInterpretationResult:
        """Build interpretation from power flow result.

        Args:
            power_flow_result: Wynik rozplywu mocy (READ-ONLY)
            run_id: ID runu rozplywu mocy
            run_timestamp: Opcjonalny timestamp runu (dla determinizmu)

        Returns:
            PowerFlowInterpretationResult z pelnymi obserwacjami i rankingiem
        """
        # Timestamp dla trace - jesli nie podany, uzyj z context lub deterministyczny fallback
        trace_timestamp = (
            run_timestamp
            or (self._context.run_timestamp if self._context else None)
            or datetime(1970, 1, 1)
        )

        # Build interpretation ID (deterministic)
        interpretation_id = self._build_interpretation_id(run_id)

        # Build findings
        voltage_findings = self._build_voltage_findings(power_flow_result, run_id)
        branch_findings = self._build_branch_findings(power_flow_result, run_id)

        # Build summary with ranking
        summary = self._build_summary(voltage_findings, branch_findings)

        # Build trace
        trace = self._build_trace(
            interpretation_id=interpretation_id,
            run_id=run_id,
            timestamp=trace_timestamp,
        )

        return PowerFlowInterpretationResult(
            context=self._context,
            voltage_findings=tuple(voltage_findings),
            branch_findings=tuple(branch_findings),
            summary=summary,
            trace=trace,
        )

    def _build_interpretation_id(self, run_id: str) -> str:
        """Build deterministic interpretation ID."""
        # SHA256 of run_id + version for determinism
        data = f"{run_id}:{INTERPRETATION_VERSION}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]

    def _build_voltage_findings(
        self,
        power_flow_result: PowerFlowResult,
        run_id: str,
    ) -> list[VoltageFinding]:
        """Build voltage findings from power flow result."""
        findings: list[VoltageFinding] = []

        # Iterate over node voltages (deterministycznie posortowane po ID)
        for bus_id in sorted(power_flow_result.node_u_mag_pu.keys()):
            v_pu = power_flow_result.node_u_mag_pu[bus_id]

            # Calculate deviation from 1.0 pu
            deviation_pct = abs(v_pu - 1.0) * 100.0

            # Determine severity based on fixed thresholds
            severity = self._classify_voltage_severity(deviation_pct)

            # Build Polish description
            description_pl = self._build_voltage_description_pl(
                bus_id=bus_id,
                v_pu=v_pu,
                deviation_pct=deviation_pct,
                severity=severity,
            )

            # Evidence reference
            evidence_ref = f"wynik rozpływu — moduł napięcia węzła '{bus_id}' (bieg {run_id})"

            findings.append(
                VoltageFinding(
                    bus_id=bus_id,
                    v_pu=v_pu,
                    deviation_pct=deviation_pct,
                    severity=severity,
                    description_pl=description_pl,
                    evidence_ref=evidence_ref,
                )
            )

        # Sort by severity (HIGH first), then by deviation (descending), then by ID
        findings.sort(
            key=lambda f: (
                SEVERITY_ORDER[f.severity],
                -f.deviation_pct,
                f.bus_id,
            )
        )

        return findings

    def _classify_voltage_severity(self, deviation_pct: float) -> FindingSeverity:
        """Classify voltage deviation into severity level.

        BINDING RULES:
        - |V - 1.0| < 2% -> INFO
        - 2-5% -> WARN
        - >5% -> HIGH
        """
        if deviation_pct < VOLTAGE_INFO_MAX_PCT:
            return FindingSeverity.INFO
        elif deviation_pct < VOLTAGE_WARN_MAX_PCT:
            return FindingSeverity.WARN
        else:
            return FindingSeverity.HIGH

    def _build_voltage_description_pl(
        self,
        bus_id: str,
        v_pu: float,
        deviation_pct: float,
        severity: FindingSeverity,
    ) -> str:
        """Build Polish description for voltage finding."""
        bus_short = bus_id[:12] if len(bus_id) > 12 else bus_id

        if severity == FindingSeverity.INFO:
            return (
                f"Szyna {bus_short}: napiecie {v_pu:.4f} pu "
                f"(odchylenie {deviation_pct:.2f}% od 1.0 pu) - w normie"
            )
        elif severity == FindingSeverity.WARN:
            direction = "podwyzszone" if v_pu > 1.0 else "obnizone"
            return (
                f"Szyna {bus_short}: napiecie {direction} {v_pu:.4f} pu "
                f"(odchylenie {deviation_pct:.2f}% od 1.0 pu) - wymaga uwagi"
            )
        else:  # HIGH
            direction = "znacznie podwyzszone" if v_pu > 1.0 else "znacznie obnizone"
            return (
                f"Szyna {bus_short}: napiecie {direction} {v_pu:.4f} pu "
                f"(odchylenie {deviation_pct:.2f}% od 1.0 pu) - istotny problem"
            )

    def _build_branch_findings(
        self,
        power_flow_result: PowerFlowResult,
        run_id: str,
    ) -> list[BranchLoadingFinding]:
        """Build branch loading findings from power flow result."""
        findings: list[BranchLoadingFinding] = []

        # Get branch losses data
        branch_s_from = power_flow_result.branch_s_from_mva
        branch_s_to = power_flow_result.branch_s_to_mva

        # Iterate over branches (deterministycznie posortowane po ID)
        for branch_id in sorted(branch_s_from.keys()):
            s_from = branch_s_from.get(branch_id, 0.0 + 0.0j)
            s_to = branch_s_to.get(branch_id, 0.0 + 0.0j)

            # Extract real/imag parts (handle both complex and dict formats)
            if isinstance(s_from, dict):
                p_from = s_from.get("re", 0.0)
                q_from = s_from.get("im", 0.0)
            else:
                p_from = s_from.real
                q_from = s_from.imag

            if isinstance(s_to, dict):
                p_to = s_to.get("re", 0.0)
                q_to = s_to.get("im", 0.0)
            else:
                p_to = s_to.real
                q_to = s_to.imag

            # Calculate losses
            losses_p_mw = p_from + p_to
            losses_q_mvar = q_from + q_to

            # Loading percentage - not available from basic PowerFlowResult
            # Would need branch ratings from catalog
            loading_pct = None

            # Determine severity based on losses magnitude
            # Since we don't have ratings, use losses as proxy
            severity = self._classify_branch_severity_by_losses(losses_p_mw)

            # Build Polish description
            description_pl = self._build_branch_description_pl(
                branch_id=branch_id,
                losses_p_mw=losses_p_mw,
                losses_q_mvar=losses_q_mvar,
                loading_pct=loading_pct,
                severity=severity,
            )

            # Evidence reference
            evidence_ref = (
                f"wynik rozpływu — moce pozorne końców gałęzi '{branch_id}' (bieg {run_id})"
            )

            findings.append(
                BranchLoadingFinding(
                    branch_id=branch_id,
                    loading_pct=loading_pct,
                    losses_p_mw=losses_p_mw,
                    losses_q_mvar=losses_q_mvar,
                    severity=severity,
                    description_pl=description_pl,
                    evidence_ref=evidence_ref,
                )
            )

        # Sort by severity (HIGH first), then by losses (descending), then by ID
        findings.sort(
            key=lambda f: (
                SEVERITY_ORDER[f.severity],
                -abs(f.losses_p_mw),
                f.branch_id,
            )
        )

        return findings

    def _classify_branch_severity_by_losses(self, losses_p_mw: float) -> FindingSeverity:
        """Classify branch by losses magnitude.

        P22b BINDING - Progi severity dla strat galeziowych:
        - INFO: < BRANCH_LOSSES_INFO_MAX_KW (2 kW)
        - WARN: BRANCH_LOSSES_INFO_MAX_KW - BRANCH_LOSSES_WARN_MAX_KW (2-5 kW)
        - HIGH: > BRANCH_LOSSES_WARN_MAX_KW (5 kW)

        Deterministyczne: losses_kw = losses_mw * 1000, round(6).
        """
        losses_kw = round(abs(losses_p_mw) * 1000.0, 6)
        if losses_kw < BRANCH_LOSSES_INFO_MAX_KW:
            return FindingSeverity.INFO
        elif losses_kw <= BRANCH_LOSSES_WARN_MAX_KW:
            return FindingSeverity.WARN
        else:
            return FindingSeverity.HIGH

    def _build_branch_description_pl(
        self,
        branch_id: str,
        losses_p_mw: float,
        losses_q_mvar: float,
        loading_pct: float | None,
        severity: FindingSeverity,
    ) -> str:
        """Build Polish description for branch finding."""
        branch_short = branch_id[:12] if len(branch_id) > 12 else branch_id

        losses_p_kw = losses_p_mw * 1000.0
        losses_q_kvar = losses_q_mvar * 1000.0

        loading_info = ""
        if loading_pct is not None:
            loading_info = f", obciazenie {loading_pct:.1f}%"

        if severity == FindingSeverity.INFO:
            return (
                f"Galaz {branch_short}: straty {losses_p_kw:.2f} kW / "
                f"{losses_q_kvar:.2f} kvar{loading_info} - niskie"
            )
        elif severity == FindingSeverity.WARN:
            return (
                f"Galaz {branch_short}: straty {losses_p_kw:.2f} kW / "
                f"{losses_q_kvar:.2f} kvar{loading_info} - podwyzszone"
            )
        else:  # HIGH
            return (
                f"Galaz {branch_short}: straty {losses_p_kw:.2f} kW / "
                f"{losses_q_kvar:.2f} kvar{loading_info} - wysokie"
            )

    def _build_summary(
        self,
        voltage_findings: list[VoltageFinding],
        branch_findings: list[BranchLoadingFinding],
    ) -> InterpretationSummary:
        """Build interpretation summary with deterministic ranking."""
        # Count by severity
        high_count = sum(1 for f in voltage_findings if f.severity == FindingSeverity.HIGH) + sum(
            1 for f in branch_findings if f.severity == FindingSeverity.HIGH
        )
        warn_count = sum(1 for f in voltage_findings if f.severity == FindingSeverity.WARN) + sum(
            1 for f in branch_findings if f.severity == FindingSeverity.WARN
        )
        info_count = sum(1 for f in voltage_findings if f.severity == FindingSeverity.INFO) + sum(
            1 for f in branch_findings if f.severity == FindingSeverity.INFO
        )

        # Build ranking (top N issues)
        ranked_items: list[InterpretationRankedItem] = []

        # Add voltage findings to ranking
        for f in voltage_findings:
            if f.severity != FindingSeverity.INFO:  # Only WARN and HIGH
                ranked_items.append(
                    InterpretationRankedItem(
                        rank=0,  # Will be assigned later
                        element_type="voltage",
                        element_id=f.bus_id,
                        severity=f.severity,
                        magnitude=f.deviation_pct,
                        description_pl=f.description_pl,
                    )
                )

        # Add branch findings to ranking
        for f in branch_findings:
            if f.severity != FindingSeverity.INFO:  # Only WARN and HIGH
                ranked_items.append(
                    InterpretationRankedItem(
                        rank=0,  # Will be assigned later
                        element_type="branch_loading",
                        element_id=f.branch_id,
                        severity=f.severity,
                        magnitude=abs(f.losses_p_mw) * 1000.0,  # kW for comparison
                        description_pl=f.description_pl,
                    )
                )

        # Sort by severity, then by magnitude (descending), then by element_type, then by ID
        # P22b: Full deterministic tie-breaker for ranking
        # P22b-fix: Round magnitude to 6 decimal places to avoid floating point precision issues
        ranked_items.sort(
            key=lambda item: (
                SEVERITY_ORDER[item.severity],
                -round(item.magnitude, 6),
                item.element_type,
                item.element_id,
            )
        )

        # Assign ranks and take top N
        top_issues = tuple(
            InterpretationRankedItem(
                rank=i + 1,
                element_type=item.element_type,
                element_id=item.element_id,
                severity=item.severity,
                magnitude=item.magnitude,
                description_pl=item.description_pl,
            )
            for i, item in enumerate(ranked_items[:TOP_ISSUES_COUNT])
        )

        return InterpretationSummary(
            total_voltage_findings=len(voltage_findings),
            total_branch_findings=len(branch_findings),
            high_count=high_count,
            warn_count=warn_count,
            info_count=info_count,
            top_issues=top_issues,
        )

    def _build_trace(
        self,
        interpretation_id: str,
        run_id: str,
        timestamp: datetime,
    ) -> InterpretationTrace:
        """Build interpretation trace for auditability."""
        thresholds = InterpretationThresholds(
            voltage_info_max_pct=VOLTAGE_INFO_MAX_PCT,
            voltage_warn_max_pct=VOLTAGE_WARN_MAX_PCT,
            branch_loading_info_max_pct=BRANCH_LOADING_INFO_MAX_PCT,
            branch_loading_warn_max_pct=BRANCH_LOADING_WARN_MAX_PCT,
        )

        rules_applied = (
            "VOLTAGE_DEVIATION: |V - 1.0| < 2% -> INFO, 2-5% -> WARN, >5% -> HIGH",
            f"BRANCH_LOSSES: <{BRANCH_LOSSES_INFO_MAX_KW}kW -> INFO, {BRANCH_LOSSES_INFO_MAX_KW}-{BRANCH_LOSSES_WARN_MAX_KW}kW -> WARN, >{BRANCH_LOSSES_WARN_MAX_KW}kW -> HIGH",
            "RANKING: severity DESC, magnitude DESC, element_type ASC, element_id ASC",
        )

        data_sources = (
            f"wynik rozpływu — moduły napięć węzłów (bieg {run_id})",
            f"wynik rozpływu — moc pozorna początków gałęzi (bieg {run_id})",
            f"wynik rozpływu — moc pozorna końców gałęzi (bieg {run_id})",
        )

        return InterpretationTrace(
            interpretation_id=interpretation_id,
            power_flow_run_id=run_id,
            created_at=timestamp,
            thresholds=thresholds,
            rules_applied=rules_applied,
            data_sources=data_sources,
            interpretation_version=INTERPRETATION_VERSION,
        )
