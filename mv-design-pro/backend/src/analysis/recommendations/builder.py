from __future__ import annotations

from collections.abc import Iterable

from analysis.koperta_kontekstu import pola_koperty
from analysis.normative.models import NormativeReport, NormativeStatus
from analysis.protection_curves_it.models import ProtectionCurvesITView
from analysis.protection_insight.models import ProtectionInsightView
from analysis.recommendations.models import (
    RecommendationContext,
    RecommendationEffect,
    RecommendationEntry,
    RecommendationSummary,
    RecommendationView,
    compute_recommendation_id,
)
from analysis.sensitivity.models import SensitivityDecision, SensitivityEntry, SensitivityView
from analysis.voltage_profile.models import VoltageProfileView
from application.proof_engine.types import ProofDocument


class RecommendationBuilder:
    def build(
        self,
        *,
        proofs: Iterable[ProofDocument],
        sensitivity: SensitivityView | None,
        normative_report: NormativeReport | None,
        voltage_profile: VoltageProfileView | None,
        protection_insight: ProtectionInsightView | None,
        protection_curves_it: ProtectionCurvesITView | None,
    ) -> RecommendationView:
        entries: list[RecommendationEntry] = []
        proofs_list = list(proofs)

        if sensitivity is not None:
            entries.extend(_entries_from_sensitivity(sensitivity))
        if normative_report is not None:
            entries.extend(_entries_from_normative(normative_report))

        context = _resolve_context(
            proofs_list,
            sensitivity,
            normative_report,
            voltage_profile,
            protection_insight,
            protection_curves_it,
        )

        if not entries:
            fallback = RecommendationEntry(
                parameter_id="recommendations",
                parameter_label="Rekomendacje",
                target_id="—",
                source="P26",
                current_value=None,
                current_unit=None,
                required_delta=None,
                delta_unit=None,
                expected_effect=RecommendationEffect.NOT_COMPUTED,
                confidence_note="NOT COMPUTED: brak danych wejściowych P25/P20.",
            )
            summary = RecommendationSummary(total_entries=1, not_computed_count=1)
            analysis_id = compute_recommendation_id(context, fallback, ())
            return RecommendationView(
                analysis_id=analysis_id,
                context=context,
                primary=fallback,
                alternatives=(),
                summary=summary,
            )

        entries_sorted = sorted(entries, key=_entry_sort_key)
        primary = entries_sorted[0]
        alternatives = tuple(entries_sorted[1:])
        summary = _build_summary(entries_sorted)
        analysis_id = compute_recommendation_id(context, primary, alternatives)

        return RecommendationView(
            analysis_id=analysis_id,
            context=context,
            primary=primary,
            alternatives=alternatives,
            summary=summary,
        )


def _resolve_context(
    proofs: list[ProofDocument],
    sensitivity: SensitivityView | None,
    normative_report: NormativeReport | None,
    voltage_profile: VoltageProfileView | None,
    protection_insight: ProtectionInsightView | None,
    protection_curves_it: ProtectionCurvesITView | None,
) -> RecommendationContext | None:
    for ctx in (
        sensitivity.context if sensitivity else None,
        normative_report.context if normative_report else None,
        voltage_profile.context if voltage_profile else None,
        protection_insight.context if protection_insight else None,
        protection_curves_it.context if protection_curves_it else None,
    ):
        if ctx is not None:
            return RecommendationContext(**pola_koperty(ctx))
    if proofs:
        first = sorted(proofs, key=lambda doc: (doc.proof_type.value, doc.document_id.hex))[0]
        header = first.header
        return RecommendationContext(
            project_name=header.project_name,
            case_name=header.case_name,
            run_timestamp=header.run_timestamp,
            snapshot_id=None,
            trace_id=str(first.artifact_id),
        )
    return None


def _entries_from_sensitivity(view: SensitivityView) -> list[RecommendationEntry]:
    entries: list[RecommendationEntry] = []
    allowed = {
        "load_p": "Dopuszczalna zmiana obciążenia P (k_S)",
        "load_q": "Dopuszczalna zmiana obciążenia Q (k_I)",
        "voltage_limit": "Dopuszczalna zmiana napięcia (limity)",
        "protection_margin": "Nastawa zabezpieczenia (marginesy)",
        "protection_curve_margin": "Nastawa zabezpieczenia (krzywe I–t)",
    }
    for entry in view.entries:
        label = allowed.get(entry.parameter_id)
        if label is None:
            continue
        if entry.base_decision == SensitivityDecision.NOT_COMPUTED:
            entries.append(
                RecommendationEntry(
                    parameter_id=entry.parameter_id,
                    parameter_label=label,
                    target_id=entry.target_id,
                    source=entry.source,
                    current_value=entry.base_margin,
                    current_unit=entry.margin_unit,
                    required_delta=None,
                    delta_unit="%",
                    expected_effect=RecommendationEffect.NOT_COMPUTED,
                    confidence_note="NOT COMPUTED: brak danych wejściowych P25.",
                )
            )
            continue
        if entry.base_decision != SensitivityDecision.FAIL:
            continue
        required_delta = _required_delta(entry)
        if required_delta is None:
            expected = RecommendationEffect.STILL_FAIL
            note = "Brak wiarygodnej estymacji Δ z P25 (liniowość niepewna)."
        else:
            expected = RecommendationEffect.PASS
            note = "Wyznaczono na podstawie P25 (liniowa estymacja ±Δ%)."
        entries.append(
            RecommendationEntry(
                parameter_id=entry.parameter_id,
                parameter_label=label,
                target_id=entry.target_id,
                source=entry.source,
                current_value=entry.base_margin,
                current_unit=entry.margin_unit,
                required_delta=required_delta,
                delta_unit="%",
                expected_effect=expected,
                confidence_note=note,
            )
        )
    return entries


def _entries_from_normative(report: NormativeReport) -> list[RecommendationEntry]:
    entries: list[RecommendationEntry] = []
    for item in report.items:
        if item.status not in (NormativeStatus.FAIL, NormativeStatus.WARNING):
            continue
        required_delta = _required_limit_delta_pct(item.observed_value, item.limit_value)
        if required_delta is None:
            expected = RecommendationEffect.NOT_COMPUTED
            note = "NOT COMPUTED: brak obserwacji lub limitu normatywnego."
        else:
            expected = RecommendationEffect.PASS
            note = "Zmiana limitu normatywnego wyznaczona z P20 (post-hoc)."
        entries.append(
            RecommendationEntry(
                parameter_id="normative_limit",
                parameter_label="Limit normatywny",
                target_id=item.target_id,
                source="P20",
                current_value=float(item.limit_value) if item.limit_value is not None else None,
                current_unit=item.limit_unit,
                required_delta=required_delta,
                delta_unit="%",
                expected_effect=expected,
                confidence_note=note,
            )
        )
    return entries


def _required_limit_delta_pct(
    observed: float | str | None,
    limit: float | None,
) -> float | None:
    if limit is None or limit == 0:
        return None
    if not isinstance(observed, int | float):
        return None
    return (float(observed) - float(limit)) / float(limit) * 100.0


def _required_delta(entry: SensitivityEntry) -> float | None:
    base_margin = entry.base_margin
    if base_margin is None:
        return None

    candidates: list[float] = []
    for perturbation in (entry.minus, entry.plus):
        if perturbation.delta_margin is None or perturbation.delta_pct == 0:
            continue
        slope = perturbation.delta_margin / perturbation.delta_pct
        if slope == 0:
            continue
        required = -base_margin / slope
        if required == 0:
            candidates.append(required)
        elif required * perturbation.delta_pct > 0:
            candidates.append(required)
    if not candidates:
        return None
    return min(candidates, key=lambda value: abs(value))


def _entry_sort_key(entry: RecommendationEntry) -> tuple[int, float, str, str, str]:
    order = {
        RecommendationEffect.PASS: 0,
        RecommendationEffect.STILL_FAIL: 1,
        RecommendationEffect.NOT_COMPUTED: 2,
    }
    delta = abs(entry.required_delta) if entry.required_delta is not None else float("inf")
    return (
        order[entry.expected_effect],
        delta,
        entry.parameter_id,
        entry.target_id,
        entry.source,
    )


def _build_summary(entries: Iterable[RecommendationEntry]) -> RecommendationSummary:
    entries_list = list(entries)
    not_computed = sum(
        1 for entry in entries_list if entry.expected_effect == RecommendationEffect.NOT_COMPUTED
    )
    return RecommendationSummary(
        total_entries=len(entries_list),
        not_computed_count=not_computed,
    )
