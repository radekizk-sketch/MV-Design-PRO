"""P22: Power Flow Interpretation Serializer.

Deterministyczna serializacja wynikow interpretacji.

INVARIANTS:
- Sortowanie po kluczach dla determinizmu
- Wszystkie kolekcje posortowane po ID
- Float z pelna precyzja (nie zaokraglamy)
"""

from __future__ import annotations

from typing import Any

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

# =============================================================================
# Severity ordering for deterministic ranking
# =============================================================================


SEVERITY_ORDER: dict[FindingSeverity, int] = {
    FindingSeverity.HIGH: 0,  # Most important first
    FindingSeverity.WARN: 1,
    FindingSeverity.INFO: 2,
}


# =============================================================================
# Individual Serializers
# =============================================================================


def voltage_finding_to_dict(finding: VoltageFinding) -> dict[str, Any]:
    """Serialize VoltageFinding to dict."""
    return {
        "bus_id": finding.bus_id,
        "v_pu": float(finding.v_pu),
        "deviation_pct": float(finding.deviation_pct),
        "severity": finding.severity.value,
        "description_pl": finding.description_pl,
        "evidence_ref": finding.evidence_ref,
    }


def branch_finding_to_dict(finding: BranchLoadingFinding) -> dict[str, Any]:
    """Serialize BranchLoadingFinding to dict."""
    return {
        "branch_id": finding.branch_id,
        "loading_pct": float(finding.loading_pct) if finding.loading_pct is not None else None,
        "losses_p_mw": float(finding.losses_p_mw),
        "losses_q_mvar": float(finding.losses_q_mvar),
        "severity": finding.severity.value,
        "description_pl": finding.description_pl,
        "evidence_ref": finding.evidence_ref,
    }


def ranked_item_to_dict(item: InterpretationRankedItem) -> dict[str, Any]:
    """Serialize InterpretationRankedItem to dict."""
    return {
        "rank": int(item.rank),
        "element_type": item.element_type,
        "element_id": item.element_id,
        "severity": item.severity.value,
        "magnitude": float(item.magnitude),
        "description_pl": item.description_pl,
    }


def summary_to_dict(summary: InterpretationSummary) -> dict[str, Any]:
    """Serialize InterpretationSummary to dict."""
    return {
        "total_voltage_findings": int(summary.total_voltage_findings),
        "total_branch_findings": int(summary.total_branch_findings),
        "high_count": int(summary.high_count),
        "warn_count": int(summary.warn_count),
        "info_count": int(summary.info_count),
        "top_issues": [ranked_item_to_dict(item) for item in summary.top_issues],
    }


def thresholds_to_dict(thresholds: InterpretationThresholds) -> dict[str, Any]:
    """Serialize InterpretationThresholds to dict."""
    return {
        "voltage_info_max_pct": float(thresholds.voltage_info_max_pct),
        "voltage_warn_max_pct": float(thresholds.voltage_warn_max_pct),
        "branch_loading_info_max_pct": (
            float(thresholds.branch_loading_info_max_pct)
            if thresholds.branch_loading_info_max_pct is not None
            else None
        ),
        "branch_loading_warn_max_pct": (
            float(thresholds.branch_loading_warn_max_pct)
            if thresholds.branch_loading_warn_max_pct is not None
            else None
        ),
    }


def trace_to_dict(trace: InterpretationTrace) -> dict[str, Any]:
    """Serialize InterpretationTrace to dict."""
    return {
        "interpretation_id": trace.interpretation_id,
        "power_flow_run_id": trace.power_flow_run_id,
        "created_at": trace.created_at.isoformat(),
        "thresholds": thresholds_to_dict(trace.thresholds),
        "rules_applied": list(trace.rules_applied),
        "data_sources": list(trace.data_sources),
        "interpretation_version": trace.interpretation_version,
    }


def context_to_dict(context: InterpretationContext | None) -> dict[str, Any] | None:
    """Serialize InterpretationContext to dict."""
    if context is None:
        return None
    return context.to_dict()


# =============================================================================
# Main Result Serializer
# =============================================================================


def result_to_dict(result: PowerFlowInterpretationResult) -> dict[str, Any]:
    """Serialize PowerFlowInterpretationResult to dict.

    DETERMINISTIC: Same input -> identical output JSON.
    """
    return {
        "context": context_to_dict(result.context),
        "voltage_findings": [voltage_finding_to_dict(f) for f in result.voltage_findings],
        "branch_findings": [branch_finding_to_dict(f) for f in result.branch_findings],
        "summary": summary_to_dict(result.summary),
        "trace": trace_to_dict(result.trace),
    }
