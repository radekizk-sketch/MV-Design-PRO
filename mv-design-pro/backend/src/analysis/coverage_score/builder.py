from __future__ import annotations

from collections.abc import Iterable

from analysis.coverage_score.models import (
    CoverageScoreContext,
    CoverageScoreView,
    compute_coverage_id,
)
from analysis.koperta_kontekstu import pola_koperty
from analysis.normative.models import NormativeReport, NormativeStatus
from analysis.protection_curves_it.models import ProtectionCurvesITView
from analysis.protection_insight.models import ProtectionInsightView, ProtectionSelectivityStatus
from analysis.recommendations.models import RecommendationView
from analysis.sensitivity.models import SensitivityView
from analysis.voltage_profile.models import VoltageProfileStatus, VoltageProfileView
from application.proof_engine.types import ProofDocument, ProofType

_PROOF_WEIGHTS: tuple[tuple[str, ProofType, float], ...] = (
    ("P11: SC3F", ProofType.SC3F_IEC60909, 15.0),
    ("P11: VDROP", ProofType.VDROP, 15.0),
    ("P15: Load Currents", ProofType.LOAD_CURRENTS_OVERLOAD, 10.0),
    ("P17: Losses & Energy", ProofType.LOSSES_ENERGY, 10.0),
    ("P18: Protection Overcurrent", ProofType.PROTECTION_OVERCURRENT, 10.0),
    ("P19: Earthing SN", ProofType.EARTHING_GROUND_FAULT_SN, 10.0),
)


class CoverageScoreBuilder:
    def build(
        self,
        *,
        proof_documents: Iterable[ProofDocument],
        normative_report: NormativeReport | None,
        voltage_profile: VoltageProfileView | None,
        protection_insight: ProtectionInsightView | None,
        protection_curves_it: ProtectionCurvesITView | None,
        sensitivity: SensitivityView | None,
        recommendations: RecommendationView | None,
    ) -> CoverageScoreView:
        proof_types = {doc.proof_type for doc in proof_documents}
        missing_items: list[str] = []
        critical_gaps: list[str] = []

        score = 100.0

        for label, proof_type, weight in _PROOF_WEIGHTS:
            if proof_type not in proof_types:
                missing_items.append(f"Brak dowodu: {label}.")
                score -= weight
                if proof_type == ProofType.EARTHING_GROUND_FAULT_SN:
                    critical_gaps.append("P14-GAP-001: brak pakietu P19 (earthing SN).")

        if normative_report is None:
            missing_items.append("Brak P20 (raport normatywny).")
            score -= 5.0
        if voltage_profile is None:
            missing_items.append("Brak P21 (profil napięć).")
            score -= 5.0
        if protection_insight is None:
            missing_items.append("Brak P22a (analiza zabezpieczeń).")
            score -= 5.0
        if protection_curves_it is None:
            missing_items.append("Brak P22 (krzywe I–t).")
            score -= 3.0
            critical_gaps.append("P14-GAP-002: selektywność bez pełnych krzywych I–t.")
        if sensitivity is None:
            missing_items.append("Brak P25 (wrażliwość).")
            score -= 5.0
        if recommendations is None:
            missing_items.append("Brak P26 (rekomendacje).")
            score -= 5.0

        not_computed_count = _count_not_computed(
            normative_report,
            voltage_profile,
            protection_insight,
            sensitivity,
            recommendations,
        )
        score -= min(20.0, float(not_computed_count))
        score = max(0.0, min(100.0, score))

        missing_items_sorted = tuple(sorted(missing_items))
        critical_gaps_sorted = tuple(sorted(set(critical_gaps)))

        context = _resolve_context(
            normative_report,
            voltage_profile,
            protection_insight,
            protection_curves_it,
            sensitivity,
            recommendations,
        )
        analysis_id = compute_coverage_id(
            context,
            score,
            missing_items_sorted,
            critical_gaps_sorted,
        )
        return CoverageScoreView(
            analysis_id=analysis_id,
            context=context,
            total_score=score,
            missing_items=missing_items_sorted,
            critical_gaps=critical_gaps_sorted,
        )


def _resolve_context(
    normative_report: NormativeReport | None,
    voltage_profile: VoltageProfileView | None,
    protection_insight: ProtectionInsightView | None,
    protection_curves_it: ProtectionCurvesITView | None,
    sensitivity: SensitivityView | None,
    recommendations: RecommendationView | None,
) -> CoverageScoreContext | None:
    for ctx in (
        normative_report.context if normative_report else None,
        voltage_profile.context if voltage_profile else None,
        protection_insight.context if protection_insight else None,
        protection_curves_it.context if protection_curves_it else None,
        sensitivity.context if sensitivity else None,
        recommendations.context if recommendations else None,
    ):
        if ctx is not None:
            return CoverageScoreContext(**pola_koperty(ctx))
    return None


def _count_not_computed(
    normative_report: NormativeReport | None,
    voltage_profile: VoltageProfileView | None,
    protection_insight: ProtectionInsightView | None,
    sensitivity: SensitivityView | None,
    recommendations: RecommendationView | None,
) -> int:
    count = 0
    if normative_report is not None:
        count += sum(
            1 for item in normative_report.items if item.status == NormativeStatus.NOT_COMPUTED
        )
    if voltage_profile is not None:
        count += sum(
            1 for row in voltage_profile.rows if row.status == VoltageProfileStatus.NOT_COMPUTED
        )
    if protection_insight is not None:
        count += sum(
            1
            for item in protection_insight.items
            if item.selectivity_status == ProtectionSelectivityStatus.NOT_EVALUATED
        )
    if sensitivity is not None:
        count += sensitivity.summary.not_computed_count
    if recommendations is not None:
        count += recommendations.summary.not_computed_count
    return count
