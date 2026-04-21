from __future__ import annotations

from datetime import datetime
from uuid import UUID

from analysis.coverage_score.builder import CoverageScoreBuilder
from analysis.normative.models import (
    NormativeContext,
    NormativeItem,
    NormativeReport,
    NormativeSeverity,
    NormativeStatus,
)
from analysis.protection_insight.models import (
    ProtectionInsightContext,
    ProtectionInsightItem,
    ProtectionInsightSummary,
    ProtectionInsightView,
    ProtectionSelectivityStatus,
)
from analysis.recommendations.models import (
    RecommendationContext,
    RecommendationEffect,
    RecommendationEntry,
    RecommendationSummary,
    RecommendationView,
)
from analysis.sensitivity.models import (
    SensitivityContext,
    SensitivitySummary,
    SensitivityView,
)
from analysis.voltage_profile.models import (
    VoltageProfileContext,
    VoltageProfileRow,
    VoltageProfileStatus,
    VoltageProfileSummary,
    VoltageProfileView,
)
from application.proof_engine.types import ProofDocument, ProofHeader, ProofSummary, ProofType

RUN_TS = datetime(2024, 4, 1, 12, 0, 0)


def _proof_doc(proof_type: ProofType, document_id: str) -> ProofDocument:
    header = ProofHeader(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        solver_version="v1",
        target_id="T1",
    )
    summary = ProofSummary(key_results={}, unit_check_passed=True, total_steps=0)
    return ProofDocument(
        document_id=UUID(document_id),
        artifact_id=UUID("22222222-2222-2222-2222-222222222222"),
        created_at=RUN_TS,
        proof_type=proof_type,
        title_pl="Doc",
        header=header,
        steps=(),
        summary=summary,
    )


def _normative_report() -> NormativeReport:
    context = NormativeContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    items = (
        NormativeItem(
            rule_id="NR_P20_001",
            title_pl="Test",
            severity=NormativeSeverity.WARNING,
            status=NormativeStatus.NOT_COMPUTED,
            target_id="BUS-1",
            observed_value=None,
            unit=None,
            limit_value=None,
            limit_unit=None,
            margin=None,
            why_pl="Brak danych",
            requires=("P21",),
        ),
    )
    return NormativeReport(report_id="rep-1", context=context, items=items)


def _voltage_profile() -> VoltageProfileView:
    context = VoltageProfileContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    rows = (
        VoltageProfileRow(
            bus_id="BUS-1",
            bus_name=None,
            u_nom_kv=None,
            u_kv=None,
            u_pu=None,
            delta_pct=None,
            status=VoltageProfileStatus.NOT_COMPUTED,
            p_mw=None,
            q_mvar=None,
            case_name="Case",
            run_timestamp=RUN_TS,
        ),
    )
    summary = VoltageProfileSummary(
        worst_bus_id=None,
        worst_delta_pct_abs=None,
        pass_count=0,
        warning_count=0,
        fail_count=0,
        not_computed_count=1,
    )
    return VoltageProfileView(
        context=context,
        thresholds={"voltage_warn_pct": 5.0, "voltage_fail_pct": 10.0},
        rows=rows,
        summary=summary,
    )


def _protection_insight() -> ProtectionInsightView:
    context = ProtectionInsightContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    items = (
        ProtectionInsightItem(
            rule_id="NR_P18_004",
            primary_device_id="CB-01",
            backup_device_id=None,
            ikss_ka=None,
            ip_ka=None,
            ith_ka2s=None,
            icu_ka=None,
            idyn_ka=None,
            ith_limit_ka2s=None,
            breaking_margin_pct=None,
            dynamic_margin_pct=None,
            thermal_margin_pct=None,
            selectivity_status=ProtectionSelectivityStatus.NOT_EVALUATED,
            why_pl="Brak danych",
        ),
    )
    summary = ProtectionInsightSummary(
        count_ok=0,
        count_warning=0,
        count_fail=0,
        count_not_evaluated=1,
    )
    return ProtectionInsightView(context=context, items=items, summary=summary)


def _sensitivity_view() -> SensitivityView:
    context = SensitivityContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    summary = SensitivitySummary(total_entries=0, not_computed_count=1)
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
    entry = RecommendationEntry(
        parameter_id="load_p",
        parameter_label="Load P",
        target_id="LINE-1",
        source="P26",
        current_value=None,
        current_unit=None,
        required_delta=None,
        delta_unit=None,
        expected_effect=RecommendationEffect.NOT_COMPUTED,
        confidence_note="Brak danych",
    )
    summary = RecommendationSummary(total_entries=1, not_computed_count=1)
    return RecommendationView(
        analysis_id="rec-1",
        context=context,
        primary=entry,
        alternatives=(),
        summary=summary,
    )


def test_coverage_score_gap_detection() -> None:
    builder = CoverageScoreBuilder()
    view = builder.build(
        proof_documents=(
            _proof_doc(ProofType.SC3F_IEC60909, "11111111-1111-1111-1111-111111111111"),
        ),
        normative_report=_normative_report(),
        voltage_profile=_voltage_profile(),
        protection_insight=_protection_insight(),
        protection_curves_it=None,
        sensitivity=_sensitivity_view(),
        recommendations=_recommendation_view(),
    )

    assert any("P19" in item for item in view.missing_items)
    assert any("P14-GAP-001" in item for item in view.critical_gaps)
    assert view.total_score < 100.0


def test_coverage_score_deterministic() -> None:
    builder = CoverageScoreBuilder()
    view_a = builder.build(
        proof_documents=(
            _proof_doc(ProofType.SC3F_IEC60909, "11111111-1111-1111-1111-111111111111"),
        ),
        normative_report=_normative_report(),
        voltage_profile=_voltage_profile(),
        protection_insight=_protection_insight(),
        protection_curves_it=None,
        sensitivity=_sensitivity_view(),
        recommendations=_recommendation_view(),
    )
    view_b = builder.build(
        proof_documents=(
            _proof_doc(ProofType.SC3F_IEC60909, "11111111-1111-1111-1111-111111111111"),
        ),
        normative_report=_normative_report(),
        voltage_profile=_voltage_profile(),
        protection_insight=_protection_insight(),
        protection_curves_it=None,
        sensitivity=_sensitivity_view(),
        recommendations=_recommendation_view(),
    )

    assert view_a.to_dict() == view_b.to_dict()
