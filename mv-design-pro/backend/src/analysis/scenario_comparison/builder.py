from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime

from analysis.normative.models import NormativeReport, NormativeStatus
from analysis.recommendations.models import (
    RecommendationEffect,
    RecommendationEntry,
    RecommendationView,
)
from analysis.scenario_comparison.models import (
    ScenarioComparisonEntry,
    ScenarioComparisonView,
    compute_comparison_id,
)
from analysis.sensitivity.models import SensitivityView
from application.study_scenario.models import Run, Scenario


@dataclass(frozen=True)
class _ScenarioMetrics:
    scenario: Scenario
    risk_score: float
    min_margin: float | None
    not_computed_count: int
    key_drivers: tuple[str, ...]


@dataclass(frozen=True)
class ScenarioComparisonInput:
    scenario: Scenario
    run: Run | None
    normative_report: NormativeReport | None
    sensitivity: SensitivityView | None
    recommendations: RecommendationView | None


class ScenarioComparisonBuilder:
    def build(
        self,
        scenarios: Iterable[ScenarioComparisonInput],
    ) -> ScenarioComparisonView:
        inputs = list(scenarios)
        study_id = _resolve_study_id(inputs)
        generated_at = _resolve_generated_at(inputs)

        metrics = [_scenario_metrics(entry) for entry in inputs]
        metrics_sorted = sorted(
            metrics,
            key=lambda item: (
                item.risk_score,
                item.scenario.name,
                str(item.scenario.scenario_id),
            ),
        )

        winner = metrics_sorted[0].scenario if metrics_sorted else None
        winner_margin = metrics_sorted[0].min_margin if metrics_sorted else None
        winner_name = winner.name if winner else "—"

        entries: list[ScenarioComparisonEntry] = []
        for rank, item in enumerate(metrics_sorted):
            scenario = item.scenario
            min_margin = item.min_margin
            delta_margin = _delta_margin(min_margin, winner_margin)
            key_drivers = item.key_drivers
            why_pl = _build_why(
                scenario_name=scenario.name,
                winner_name=winner_name,
                winner_flag=scenario == winner,
                key_drivers=key_drivers,
            )
            entries.append(
                ScenarioComparisonEntry(
                    scenario_id=str(scenario.scenario_id),
                    scenario_name=scenario.name,
                    risk_score=item.risk_score,
                    delta_margin=delta_margin,
                    delta_risk_rank=rank,
                    not_computed_count=item.not_computed_count,
                    key_drivers=key_drivers,
                    winner_flag=scenario == winner,
                    why_pl=why_pl,
                )
            )

        comparison_id = compute_comparison_id(study_id, entries)
        winner_scenario_id = str(winner.scenario_id) if winner else None

        return ScenarioComparisonView(
            comparison_id=comparison_id,
            study_id=study_id,
            generated_at=generated_at,
            scenarios=tuple(entries),
            winner_scenario_id=winner_scenario_id,
        )


def _resolve_study_id(inputs: list[ScenarioComparisonInput]) -> str | None:
    for entry in inputs:
        return str(entry.scenario.study_id)
    return None


def _resolve_generated_at(inputs: list[ScenarioComparisonInput]) -> datetime:
    timestamps = [entry.run.created_at for entry in inputs if entry.run is not None]
    if not timestamps:
        return datetime(1970, 1, 1)
    return max(timestamps)


def _scenario_metrics(entry: ScenarioComparisonInput) -> _ScenarioMetrics:
    scenario = entry.scenario
    normative_report = entry.normative_report
    sensitivity = entry.sensitivity
    recommendations = entry.recommendations

    fail_count = 0
    warning_count = 0
    not_computed_count = 0
    min_margin = None
    key_drivers: list[str] = []
    missing_penalty = 0.0

    if normative_report is None:
        key_drivers.append("NOT COMPUTED: brak P20 (raport normatywny).")
        not_computed_count += 1
        missing_penalty += 500.0
    else:
        fail_count, warning_count, not_computed_count, min_margin = _normative_metrics(
            normative_report
        )
        key_drivers.append(
            f"P20: FAIL={fail_count}, WARNING={warning_count}, NOT COMPUTED={not_computed_count}"
        )
        if min_margin is not None:
            key_drivers.append(f"Najgorszy margines={min_margin:.2f}%")

    sensitivity_score = 0.0
    if sensitivity is None:
        key_drivers.append("NOT COMPUTED: brak P25 (wrażliwość).")
        not_computed_count += 1
        missing_penalty += 50.0
    else:
        not_computed_count += sensitivity.summary.not_computed_count
        if sensitivity.top_drivers:
            top = sensitivity.top_drivers[0]
            sensitivity_score = float(top.score)
            key_drivers.append(
                f"P25: top_driver={top.parameter_id} ({top.target_id}), score={top.score:.2f}"
            )

    recommendation_delta = None
    if recommendations is None:
        key_drivers.append("NOT COMPUTED: brak P26 (rekomendacje).")
        not_computed_count += 1
        missing_penalty += 50.0
    else:
        not_computed_count += recommendations.summary.not_computed_count
        recommendation_delta = _min_recommendation_delta(recommendations)
        if recommendation_delta is not None:
            key_drivers.append(f"P26: min Δ={recommendation_delta:.2f}%")

    risk_score = (
        float(fail_count) * 1000.0
        + float(warning_count) * 100.0
        + float(not_computed_count) * 10.0
        + _margin_penalty(min_margin)
        + sensitivity_score
        + (recommendation_delta or 0.0)
        + missing_penalty
    )

    return _ScenarioMetrics(
        scenario=scenario,
        risk_score=risk_score,
        min_margin=min_margin,
        not_computed_count=not_computed_count,
        key_drivers=tuple(key_drivers),
    )


def _normative_metrics(report: NormativeReport) -> tuple[int, int, int, float | None]:
    fail_count = 0
    warning_count = 0
    not_computed_count = 0
    margins: list[float] = []
    for item in report.items:
        if item.status == NormativeStatus.FAIL:
            fail_count += 1
        elif item.status == NormativeStatus.WARNING:
            warning_count += 1
        elif item.status == NormativeStatus.NOT_COMPUTED:
            not_computed_count += 1
        if item.margin is not None:
            margins.append(float(item.margin))
    min_margin = min(margins) if margins else None
    return fail_count, warning_count, not_computed_count, min_margin


def _min_recommendation_delta(view: RecommendationView) -> float | None:
    candidates: list[float] = []
    if view.primary is not None:
        candidates.extend(_delta_candidates(view.primary))
    for entry in view.alternatives:
        candidates.extend(_delta_candidates(entry))
    if not candidates:
        return None
    return min(candidates)


def _delta_candidates(entry: RecommendationEntry) -> list[float]:
    if entry.expected_effect != RecommendationEffect.PASS:
        return []
    if entry.required_delta is None:
        return []
    return [abs(float(entry.required_delta))]


def _margin_penalty(min_margin: float | None) -> float:
    if min_margin is None:
        return 25.0
    if min_margin >= 0:
        return 0.0
    return abs(min_margin)


def _delta_margin(value: float | None, winner: float | None) -> float | None:
    if value is None or winner is None:
        return None
    return float(value) - float(winner)


def _build_why(
    *,
    scenario_name: str,
    winner_name: str,
    winner_flag: bool,
    key_drivers: tuple[str, ...],
) -> str:
    reasons = "; ".join(key_drivers)
    if winner_flag:
        return f"Scenariusz {scenario_name} najlepszy: {reasons}."
    return f"Scenariusz {scenario_name} gorszy od {winner_name}: {reasons}."
