from __future__ import annotations

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
from analysis.protection_curves_it.models import (
    ITCurvePoint,
    ITCurveRole,
    ITCurveSeries,
    ITCurveSource,
    ITCurveType,
    ITMarker,
    ITMarkerKind,
    ProtectionCurvesITContext,
    ProtectionCurvesITView,
)
from analysis.protection_insight.models import (
    ProtectionInsightContext,
    ProtectionInsightItem,
    ProtectionInsightSummary,
    ProtectionInsightView,
    ProtectionSelectivityStatus,
)
from analysis.reporting.pdf import export_p24_plus_report_pdf
from analysis.voltage_profile.models import (
    VoltageProfileContext,
    VoltageProfileRow,
    VoltageProfileStatus,
    VoltageProfileSummary,
    VoltageProfileView,
)
from application.proof_engine.types import ProofDocument, ProofHeader, ProofSummary, ProofType

_PDF_AVAILABLE = find_spec("reportlab") is not None


def _sample_voltage_profile() -> VoltageProfileView:
    context = VoltageProfileContext(
        project_name="Projekt A",
        case_name="Case 1",
        run_timestamp=datetime(2024, 1, 1, 12, 0, 0),
        snapshot_id="snap-001",
        trace_id="trace-001",
    )
    rows = (
        VoltageProfileRow(
            bus_id="B3",
            bus_name="Bus 3",
            u_nom_kv=20.0,
            u_kv=17.0,
            u_pu=0.85,
            delta_pct=-15.0,
            status=VoltageProfileStatus.FAIL,
            p_mw=None,
            q_mvar=None,
            case_name="Case 1",
            run_timestamp=context.run_timestamp,
        ),
        VoltageProfileRow(
            bus_id="B2",
            bus_name="Bus 2",
            u_nom_kv=20.0,
            u_kv=18.6,
            u_pu=0.93,
            delta_pct=-7.0,
            status=VoltageProfileStatus.WARNING,
            p_mw=None,
            q_mvar=None,
            case_name="Case 1",
            run_timestamp=context.run_timestamp,
        ),
        VoltageProfileRow(
            bus_id="B1",
            bus_name="Bus 1",
            u_nom_kv=20.0,
            u_kv=19.8,
            u_pu=0.99,
            delta_pct=-1.0,
            status=VoltageProfileStatus.PASS,
            p_mw=None,
            q_mvar=None,
            case_name="Case 1",
            run_timestamp=context.run_timestamp,
        ),
        VoltageProfileRow(
            bus_id="B4",
            bus_name="Bus 4",
            u_nom_kv=None,
            u_kv=None,
            u_pu=None,
            delta_pct=None,
            status=VoltageProfileStatus.NOT_COMPUTED,
            p_mw=None,
            q_mvar=None,
            case_name="Case 1",
            run_timestamp=context.run_timestamp,
        ),
    )
    summary = VoltageProfileSummary(
        worst_bus_id="B3",
        worst_delta_pct_abs=15.0,
        pass_count=1,
        warning_count=1,
        fail_count=1,
        not_computed_count=1,
    )
    return VoltageProfileView(
        context=context,
        thresholds={"voltage_warn_pct": 5.0, "voltage_fail_pct": 10.0},
        rows=rows,
        summary=summary,
    )


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
            backup_device_id=None,
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
        ProtectionInsightItem(
            rule_id="NR_P18_004",
            primary_device_id="CB-02",
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
            why_pl="Brak danych w raporcie P20.",
        ),
    )
    summary = ProtectionInsightSummary(
        count_ok=0,
        count_warning=0,
        count_fail=1,
        count_not_evaluated=1,
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
            rule_id="NR_P20_001",
            title_pl="Sprawdzenie napięcia",
            severity=NormativeSeverity.FAIL,
            status=NormativeStatus.FAIL,
            target_id="BUS:B3",
            observed_value=17.0,
            unit="kV",
            limit_value=18.0,
            limit_unit="kV",
            margin=-5.0,
            why_pl="Napięcie poniżej progu.",
            requires=(),
        ),
        NormativeItem(
            rule_id="NR_P20_002",
            title_pl="Sprawdzenie obciążenia",
            severity=NormativeSeverity.WARNING,
            status=NormativeStatus.WARNING,
            target_id="LINE:L1",
            observed_value=85.0,
            unit="%",
            limit_value=80.0,
            limit_unit="%",
            margin=-6.25,
            why_pl="Obciążenie przekracza próg ostrzegawczy.",
            requires=(),
        ),
        NormativeItem(
            rule_id="NR_P20_003",
            title_pl="Selektywność",
            severity=NormativeSeverity.WARNING,
            status=NormativeStatus.NOT_COMPUTED,
            target_id="CB-02",
            observed_value=None,
            unit=None,
            limit_value=None,
            limit_unit=None,
            margin=None,
            why_pl="Brak danych selektywności.",
            requires=("proof:P18", "selectivity_margin"),
        ),
    )
    return NormativeReport(report_id="report-001", context=context, items=items)


def _sample_protection_curves() -> ProtectionCurvesITView:
    context = ProtectionCurvesITContext(
        project_name="Projekt A",
        case_name="Case 1",
        run_timestamp=datetime(2024, 1, 1, 12, 0, 0),
        snapshot_id="snap-001",
        trace_id="trace-001",
    )
    series = (
        ITCurveSeries(
            series_id="SER-PRIMARY",
            device_id="CB-01",
            role=ITCurveRole.PRIMARY,
            curve_type=ITCurveType.INVERSE,
            points=(ITCurvePoint(i_a=100.0, t_s=1.0), ITCurvePoint(i_a=500.0, t_s=0.2)),
            source=ITCurveSource.CATALOG,
        ),
    )
    markers = (ITMarker(kind=ITMarkerKind.IKSS, i_a=12000.0, t_s=None, source_proof_id="p1"),)
    return ProtectionCurvesITView(
        context=context,
        bus_id="BUS-1",
        primary_device_id="CB-01",
        backup_device_id=None,
        series=series,
        markers=markers,
        normative_status=NormativeStatus.WARNING,
        margins_pct={"NR_P18_001": 10.0},
        why_pl="Reguły: NR_P18_001. Status: WARNING. WHY: Brak selektywności.",
        missing_data=("marker_ip",),
    )


def _sample_proof_documents() -> tuple[ProofDocument, ...]:
    header = ProofHeader(
        project_name="Projekt A",
        case_name="Case 1",
        run_timestamp=datetime(2024, 1, 1, 12, 0, 0),
        solver_version="P18-MVP",
        target_id="CB-01",
    )
    summary = ProofSummary(
        key_results={},
        unit_check_passed=True,
        total_steps=0,
    )
    doc = ProofDocument(
        document_id=UUID("11111111-1111-1111-1111-111111111111"),
        artifact_id=UUID("22222222-2222-2222-2222-222222222222"),
        created_at=datetime(2024, 1, 1, 12, 0, 0),
        proof_type=ProofType.PROTECTION_OVERCURRENT,
        title_pl="Dowód zabezpieczeń",
        header=header,
        steps=(),
        summary=summary,
    )
    return (doc,)


@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
def test_pdf_report_deterministic() -> None:
    pdf_a = export_p24_plus_report_pdf(
        voltage_profile=_sample_voltage_profile(),
        protection_insight=_sample_protection_insight(),
        protection_curves_it=_sample_protection_curves(),
        normative_report=_sample_normative_report(),
        proof_documents=_sample_proof_documents(),
    )
    pdf_b = export_p24_plus_report_pdf(
        voltage_profile=_sample_voltage_profile(),
        protection_insight=_sample_protection_insight(),
        protection_curves_it=_sample_protection_curves(),
        normative_report=_sample_normative_report(),
        proof_documents=_sample_proof_documents(),
    )
    assert pdf_a == pdf_b


@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
def test_pdf_report_includes_not_computed_section() -> None:
    pdf_bytes = export_p24_plus_report_pdf(
        voltage_profile=_sample_voltage_profile(),
        protection_insight=_sample_protection_insight(),
        protection_curves_it=_sample_protection_curves(),
        normative_report=_sample_normative_report(),
        proof_documents=_sample_proof_documents(),
    )
    assert b"Jawne braki danych" in pdf_bytes
    assert b"NOT COMPUTED" in pdf_bytes


@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab is not installed")
def test_pdf_report_includes_why_and_ranking_sort() -> None:
    pdf_bytes = export_p24_plus_report_pdf(
        voltage_profile=_sample_voltage_profile(),
        protection_insight=_sample_protection_insight(),
        protection_curves_it=_sample_protection_curves(),
        normative_report=_sample_normative_report(),
        proof_documents=_sample_proof_documents(),
    )
    assert b"WHY:" in pdf_bytes
    rank_b3 = pdf_bytes.find(b"Rank 1: BUS B3")
    rank_b2 = pdf_bytes.find(b"Rank 2: BUS B2")
    rank_b1 = pdf_bytes.find(b"Rank 3: BUS B1")
    assert rank_b3 != -1
    assert rank_b2 != -1
    assert rank_b1 != -1
    assert rank_b3 < rank_b2 < rank_b1
