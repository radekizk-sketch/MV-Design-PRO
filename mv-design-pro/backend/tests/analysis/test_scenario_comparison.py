from __future__ import annotations

from datetime import datetime

from analysis.normative.models import (
    NormativeContext,
    NormativeItem,
    NormativeReport,
    NormativeSeverity,
    NormativeStatus,
)
from analysis.recommendations.models import (
    RecommendationContext,
    RecommendationEffect,
    RecommendationEntry,
    RecommendationSummary,
    RecommendationView,
)
from analysis.scenario_comparison.builder import ScenarioComparisonBuilder, ScenarioComparisonInput
from analysis.sensitivity.models import (
    SensitivityContext,
    SensitivitySummary,
    SensitivityView,
)
from application.study_scenario.models import (
    ScenarioType,
    create_run,
    create_scenario,
    create_study,
)

RUN_TS = datetime(2024, 3, 1, 12, 0, 0)


def _normative_report(pass_only: bool) -> NormativeReport:
    context = NormativeContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    status = NormativeStatus.PASS if pass_only else NormativeStatus.FAIL
    items = (
        NormativeItem(
            rule_id="NR_P20_001",
            title_pl="Test",
            severity=NormativeSeverity.FAIL,
            status=status,
            target_id="BUS-1",
            observed_value=10.0,
            unit="%",
            limit_value=5.0,
            limit_unit="%",
            margin=5.0 if pass_only else -5.0,
            why_pl="Test",
            requires=(),
        ),
    )
    return NormativeReport(report_id=f"rep-{status.value}", context=context, items=items)


def _sensitivity_view() -> SensitivityView:
    context = SensitivityContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    summary = SensitivitySummary(total_entries=0, not_computed_count=0)
    return SensitivityView(
        analysis_id="sens-1",
        context=context,
        delta_pct=5.0,
        entries=(),
        summary=summary,
        top_drivers=(),
    )


def _recommendation_view() -> RecommendationView:
    context = RecommendationContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    primary = RecommendationEntry(
        parameter_id="load_p",
        parameter_label="Load P",
        target_id="LINE-1",
        source="P26",
        current_value=-2.0,
        current_unit="%",
        required_delta=5.0,
        delta_unit="%",
        expected_effect=RecommendationEffect.PASS,
        confidence_note="Test",
    )
    summary = RecommendationSummary(total_entries=1, not_computed_count=0)
    return RecommendationView(
        analysis_id="rec-1",
        context=context,
        primary=primary,
        alternatives=(),
        summary=summary,
    )


def _scenario_input(name: str, pass_only: bool) -> ScenarioComparisonInput:
    study = create_study(
        name="Study",
        description="Desc",
        created_by="qa",
        assumptions=("A",),
        normative_profile_id=None,
        created_at=RUN_TS,
    )
    scenario = create_scenario(
        study_id=study.study_id,
        name=name,
        description="Desc",
        scenario_type=ScenarioType.NORMAL,
        switches_state_ref={},
        sources_state_ref={},
        loads_state_ref={},
        constraints_ref={},
        is_base=True,
    )
    run = create_run(
        scenario_id=scenario.scenario_id,
        created_at=RUN_TS,
        input_snapshot_id=None,
        solver_versions={},
        proof_set_ids=(),
        normative_report_id="rep",
        voltage_profile_view_id=None,
        protection_insight_view_id=None,
        protection_curves_it_view_id=None,
        report_p24_plus_id=None,
    )
    return ScenarioComparisonInput(
        scenario=scenario,
        run=run,
        normative_report=_normative_report(pass_only),
        sensitivity=_sensitivity_view(),
        recommendations=_recommendation_view(),
    )


def test_scenario_comparison_ordering() -> None:
    builder = ScenarioComparisonBuilder()
    input_a = _scenario_input("Scenario A", pass_only=True)
    input_b = _scenario_input("Scenario B", pass_only=False)

    view = builder.build([input_a, input_b])

    assert view.scenarios[0].scenario_name == "Scenario A"
    assert view.scenarios[0].winner_flag is True
    assert view.scenarios[1].winner_flag is False
    assert "gorszy" in view.scenarios[1].why_pl


def test_scenario_comparison_deterministic() -> None:
    builder = ScenarioComparisonBuilder()
    input_a = _scenario_input("Scenario A", pass_only=True)
    input_b = _scenario_input("Scenario B", pass_only=False)

    view_a = builder.build([input_a, input_b])
    view_b = builder.build([input_a, input_b])

    assert view_a.to_dict() == view_b.to_dict()
