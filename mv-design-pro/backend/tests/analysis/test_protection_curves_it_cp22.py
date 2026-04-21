from __future__ import annotations

import hashlib
from datetime import datetime
from importlib.util import find_spec
from uuid import UUID

import pytest
from analysis.normative.models import (
    NormativeContext,
    NormativeItem,
    NormativeReport,
    NormativeSeverity,
    NormativeStatus,
)
from analysis.protection_curves_it.builder import ProtectionCurvesITBuilder
from analysis.protection_curves_it.models import (
    ITCurvePoint,
    ITCurveRole,
    ITCurveSeries,
    ITCurveSource,
    ITCurveType,
)
from analysis.protection_curves_it.renderer_pdf import render_protection_curves_pdf
from analysis.protection_curves_it.renderer_svg import render_protection_curves_svg
from analysis.protection_insight.models import (
    ProtectionInsightContext,
    ProtectionInsightItem,
    ProtectionInsightSummary,
    ProtectionInsightView,
    ProtectionSelectivityStatus,
)
from application.proof_engine.types import (
    ProofDocument,
    ProofHeader,
    ProofSummary,
    ProofType,
    ProofValue,
)

_PDF_AVAILABLE = find_spec("reportlab") is not None


def _sample_protection_insight() -> ProtectionInsightView:
    context = ProtectionInsightContext(
        project_name="Projekt A",
        case_name="Case 1",
        run_timestamp=datetime(2024, 1, 1, 12, 0, 0),
        snapshot_id="snap-001",
        trace_id="trace-001",
    )
    items = (
        ProtectionInsightItem(
            rule_id="NR_P18_004",
            primary_device_id="CB-01",
            backup_device_id="CB-02",
            ikss_ka=12.0,
            ip_ka=20.0,
            ith_ka2s=100.0,
            icu_ka=15.0,
            idyn_ka=25.0,
            ith_limit_ka2s=110.0,
            breaking_margin_pct=20.0,
            dynamic_margin_pct=20.0,
            thermal_margin_pct=9.09,
            selectivity_status=ProtectionSelectivityStatus.NOT_SELECTIVE,
            why_pl="Brak selektywności czasowej.",
        ),
    )
    summary = ProtectionInsightSummary(
        count_ok=0,
        count_warning=0,
        count_fail=1,
        count_not_evaluated=0,
    )
    return ProtectionInsightView(context=context, items=items, summary=summary)


def _sample_normative_report() -> NormativeReport:
    context = NormativeContext(
        project_name="Projekt A",
        case_name="Case 1",
        run_timestamp=datetime(2024, 1, 1, 12, 0, 0),
        snapshot_id="snap-001",
        trace_id="trace-001",
    )
    items = (
        NormativeItem(
            rule_id="NR_P18_001",
            title_pl="Wyłączalność",
            severity=NormativeSeverity.FAIL,
            status=NormativeStatus.FAIL,
            target_id="CB-01",
            observed_value="NOT_OK",
            unit="—",
            limit_value=None,
            limit_unit=None,
            margin=None,
            why_pl="I_k'' przekracza I_cu.",
            requires=(),
        ),
        NormativeItem(
            rule_id="NR_P18_002",
            title_pl="Warunek dynamiczny",
            severity=NormativeSeverity.WARNING,
            status=NormativeStatus.WARNING,
            target_id="CB-01",
            observed_value="NOT_OK",
            unit="—",
            limit_value=None,
            limit_unit=None,
            margin=None,
            why_pl="i_p przekracza I_dyn.",
            requires=(),
        ),
        NormativeItem(
            rule_id="NR_P18_003",
            title_pl="Warunek cieplny",
            severity=NormativeSeverity.WARNING,
            status=NormativeStatus.PASS,
            target_id="CB-01",
            observed_value="OK",
            unit="—",
            limit_value=None,
            limit_unit=None,
            margin=None,
            why_pl="Warunek cieplny spełniony.",
            requires=(),
        ),
        NormativeItem(
            rule_id="NR_P18_004",
            title_pl="Selektywność",
            severity=NormativeSeverity.WARNING,
            status=NormativeStatus.WARNING,
            target_id="CB-01",
            observed_value="NOT_OK",
            unit="—",
            limit_value=None,
            limit_unit=None,
            margin=None,
            why_pl="Brak selektywności czasowej.",
            requires=(),
        ),
    )
    return NormativeReport(report_id="report-001", context=context, items=items)


def _sample_proof() -> ProofDocument:
    header = ProofHeader(
        project_name="Projekt A",
        case_name="Case 1",
        run_timestamp=datetime(2024, 1, 1, 12, 0, 0),
        solver_version="P18",
        target_id="CB-01",
    )
    summary = ProofSummary(
        key_results={
            "ikss_ka": ProofValue.create("I_k''", 12.0, "kA", "ikss_ka"),
            "ip_ka": ProofValue.create("i_p", 20.0, "kA", "ip_ka"),
            "ith_ka": ProofValue.create("I_th", 15.0, "kA", "ith_ka"),
        },
        unit_check_passed=True,
        total_steps=0,
    )
    return ProofDocument(
        document_id=UUID("11111111-1111-1111-1111-111111111111"),
        artifact_id=UUID("22222222-2222-2222-2222-222222222222"),
        created_at=datetime(2024, 1, 1, 12, 0, 0),
        proof_type=ProofType.PROTECTION_OVERCURRENT,
        title_pl="Dowód zabezpieczeń",
        header=header,
        steps=(),
        summary=summary,
    )


def _sample_series() -> tuple[ITCurveSeries, ITCurveSeries]:
    primary = ITCurveSeries(
        series_id="SER-PRIMARY",
        device_id="CB-01",
        role=ITCurveRole.PRIMARY,
        curve_type=ITCurveType.INVERSE,
        points=(ITCurvePoint(i_a=100.0, t_s=1.0), ITCurvePoint(i_a=500.0, t_s=0.2)),
        source=ITCurveSource.CATALOG,
    )
    backup = ITCurveSeries(
        series_id="SER-BACKUP",
        device_id="CB-02",
        role=ITCurveRole.BACKUP,
        curve_type=ITCurveType.DEFINITE,
        points=(ITCurvePoint(i_a=120.0, t_s=1.2), ITCurvePoint(i_a=550.0, t_s=0.3)),
        source=ITCurveSource.USER,
    )
    return primary, backup


def test_builder_sorting_and_markers() -> None:
    builder = ProtectionCurvesITBuilder()
    primary, backup = _sample_series()
    view = builder.build(
        protection_insight=_sample_protection_insight(),
        proofs_p18=[backup, _sample_proof(), primary],
        normative_report_p20=_sample_normative_report(),
    )

    assert [series.role.value for series in view.series] == ["PRIMARY", "BACKUP"]
    assert [marker.kind.value for marker in view.markers] == ["IKSS", "IP", "ITH"]
    assert view.normative_status == NormativeStatus.FAIL
    assert "it_curve_series" not in view.missing_data


def test_builder_not_evaluated_when_missing_data() -> None:
    insight = ProtectionInsightView(
        context=None,
        items=(),
        summary=ProtectionInsightSummary(
            count_ok=0,
            count_warning=0,
            count_fail=0,
            count_not_evaluated=0,
        ),
    )
    report = NormativeReport(
        report_id="report-002",
        context=NormativeContext(
            project_name=None,
            case_name=None,
            run_timestamp=None,
            snapshot_id=None,
            trace_id=None,
        ),
        items=(),
    )
    view = ProtectionCurvesITBuilder().build(
        protection_insight=insight,
        proofs_p18=[],
        normative_report_p20=report,
    )

    assert view.normative_status == NormativeStatus.NOT_EVALUATED
    assert "it_curve_series" in view.missing_data
    assert "protection_insight_items" in view.missing_data


@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
def test_renderers_are_deterministic() -> None:
    builder = ProtectionCurvesITBuilder()
    primary, backup = _sample_series()
    view = builder.build(
        protection_insight=_sample_protection_insight(),
        proofs_p18=[primary, backup, _sample_proof()],
        normative_report_p20=_sample_normative_report(),
    )

    svg_a = render_protection_curves_svg(view)
    svg_b = render_protection_curves_svg(view)
    assert (
        hashlib.sha256(svg_a.encode("utf-8")).hexdigest()
        == hashlib.sha256(svg_b.encode("utf-8")).hexdigest()
    )

    pdf_a = render_protection_curves_pdf(view)
    pdf_b = render_protection_curves_pdf(view)
    assert hashlib.sha256(pdf_a).hexdigest() == hashlib.sha256(pdf_b).hexdigest()
