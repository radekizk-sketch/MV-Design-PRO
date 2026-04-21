from __future__ import annotations

from datetime import datetime

from analysis.recommendations.builder import RecommendationBuilder
from analysis.recommendations.models import RecommendationEffect
from analysis.sensitivity.models import (
    SensitivityContext,
    SensitivityDecision,
    SensitivityEntry,
    SensitivityPerturbation,
    SensitivitySummary,
    SensitivityView,
)

RUN_TS = datetime(2024, 2, 1, 12, 0, 0)


def _sensitivity_view() -> SensitivityView:
    context = SensitivityContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    entry_primary = SensitivityEntry(
        parameter_id="load_p",
        parameter_label="Load P (k_S)",
        target_id="LINE-1",
        source="P20",
        base_margin=-1.0,
        margin_unit="%",
        base_decision=SensitivityDecision.FAIL,
        minus=SensitivityPerturbation(
            delta_pct=-5.0,
            margin=-2.0,
            delta_margin=-1.0,
            decision=SensitivityDecision.FAIL,
        ),
        plus=SensitivityPerturbation(
            delta_pct=5.0,
            margin=0.0,
            delta_margin=1.0,
            decision=SensitivityDecision.PASS,
        ),
    )
    entry_alt = SensitivityEntry(
        parameter_id="voltage_limit",
        parameter_label="Voltage limits",
        target_id="BUS-1",
        source="P21",
        base_margin=-2.0,
        margin_unit="%",
        base_decision=SensitivityDecision.FAIL,
        minus=SensitivityPerturbation(
            delta_pct=-5.0,
            margin=-3.0,
            delta_margin=-1.0,
            decision=SensitivityDecision.FAIL,
        ),
        plus=SensitivityPerturbation(
            delta_pct=5.0,
            margin=-1.0,
            delta_margin=1.0,
            decision=SensitivityDecision.FAIL,
        ),
    )
    entry_nc = SensitivityEntry(
        parameter_id="load_q",
        parameter_label="Load Q (k_I)",
        target_id="LINE-2",
        source="P20",
        base_margin=None,
        margin_unit="%",
        base_decision=SensitivityDecision.NOT_COMPUTED,
        minus=SensitivityPerturbation(
            delta_pct=-5.0,
            margin=None,
            delta_margin=None,
            decision=SensitivityDecision.NOT_COMPUTED,
        ),
        plus=SensitivityPerturbation(
            delta_pct=5.0,
            margin=None,
            delta_margin=None,
            decision=SensitivityDecision.NOT_COMPUTED,
        ),
    )
    entries = (entry_primary, entry_alt, entry_nc)
    summary = SensitivitySummary(total_entries=3, not_computed_count=1)
    return SensitivityView(
        analysis_id="sens-1",
        context=context,
        delta_pct=5.0,
        entries=entries,
        summary=summary,
        top_drivers=(),
    )


def test_recommendations_minimal_delta() -> None:
    view = RecommendationBuilder().build(
        proofs=[],
        sensitivity=_sensitivity_view(),
        normative_report=None,
        voltage_profile=None,
        protection_insight=None,
        protection_curves_it=None,
    )

    assert view.primary is not None
    assert view.primary.parameter_id == "load_p"
    assert round(view.primary.required_delta or 0.0, 2) == 5.00
    assert view.primary.expected_effect == RecommendationEffect.PASS

    alt_ids = [entry.parameter_id for entry in view.alternatives]
    assert "voltage_limit" in alt_ids


def test_recommendations_not_computed() -> None:
    view = RecommendationBuilder().build(
        proofs=[],
        sensitivity=_sensitivity_view(),
        normative_report=None,
        voltage_profile=None,
        protection_insight=None,
        protection_curves_it=None,
    )

    not_computed = [
        entry
        for entry in (view.primary, *view.alternatives)
        if entry is not None and entry.expected_effect == RecommendationEffect.NOT_COMPUTED
    ]
    assert not_computed
    assert view.summary.not_computed_count == len(not_computed)


def test_recommendations_deterministic() -> None:
    builder = RecommendationBuilder()
    view_a = builder.build(
        proofs=[],
        sensitivity=_sensitivity_view(),
        normative_report=None,
        voltage_profile=None,
        protection_insight=None,
        protection_curves_it=None,
    )
    view_b = builder.build(
        proofs=[],
        sensitivity=_sensitivity_view(),
        normative_report=None,
        voltage_profile=None,
        protection_insight=None,
        protection_curves_it=None,
    )

    assert view_a.to_dict() == view_b.to_dict()
