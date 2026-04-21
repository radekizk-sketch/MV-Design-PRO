from __future__ import annotations

from datetime import datetime

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
from analysis.sensitivity.builder import SensitivityBuilder
from analysis.sensitivity.models import SensitivityDecision
from analysis.voltage_profile.models import (
    VoltageProfileContext,
    VoltageProfileRow,
    VoltageProfileStatus,
    VoltageProfileSummary,
    VoltageProfileView,
)

RUN_TS = datetime(2024, 2, 1, 12, 0, 0)


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
            rule_id="NR_P15_001",
            title_pl="Obciążenie prądowe %In",
            severity=NormativeSeverity.WARNING,
            status=NormativeStatus.WARNING,
            target_id="LINE-1",
            observed_value=90.0,
            unit="%",
            limit_value=80.0,
            limit_unit="%",
            margin=10.0,
            why_pl="Przekroczony próg.",
            requires=(),
        ),
        NormativeItem(
            rule_id="NR_P15_002",
            title_pl="Obciążenie mocowe %Sn",
            severity=NormativeSeverity.INFO,
            status=NormativeStatus.PASS,
            target_id="TR-1",
            observed_value=70.0,
            unit="%",
            limit_value=80.0,
            limit_unit="%",
            margin=-10.0,
            why_pl="W normie.",
            requires=(),
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
            bus_id="B1",
            bus_name="Bus 1",
            u_nom_kv=20.0,
            u_kv=18.6,
            u_pu=0.93,
            delta_pct=-7.0,
            status=VoltageProfileStatus.WARNING,
            p_mw=None,
            q_mvar=None,
            case_name="Case",
            run_timestamp=RUN_TS,
        ),
    )
    summary = VoltageProfileSummary(
        worst_bus_id="B1",
        worst_delta_pct_abs=7.0,
        pass_count=0,
        warning_count=1,
        fail_count=0,
        not_computed_count=0,
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
            ikss_ka=10.0,
            ip_ka=12.0,
            ith_ka2s=100.0,
            icu_ka=12.0,
            idyn_ka=15.0,
            ith_limit_ka2s=120.0,
            breaking_margin_pct=16.6667,
            dynamic_margin_pct=20.0,
            thermal_margin_pct=16.6667,
            selectivity_status=ProtectionSelectivityStatus.OK,
            why_pl="OK",
        ),
    )
    summary = ProtectionInsightSummary(
        count_ok=1,
        count_warning=0,
        count_fail=0,
        count_not_evaluated=0,
    )
    return ProtectionInsightView(context=context, items=items, summary=summary)


def test_sensitivity_ranking_stable() -> None:
    builder = SensitivityBuilder(delta_pct=10.0, top_n=2)
    view_a = builder.build(
        proofs=[],
        normative_report=_normative_report(),
        voltage_profile=_voltage_profile(),
        protection_insight=_protection_insight(),
        protection_curves_it=None,
    )
    view_b = builder.build(
        proofs=[],
        normative_report=_normative_report(),
        voltage_profile=_voltage_profile(),
        protection_insight=_protection_insight(),
        protection_curves_it=None,
    )

    assert view_a.to_dict() == view_b.to_dict()

    top_ids = [driver.target_id for driver in view_a.top_drivers]
    assert top_ids[0] == "CB-01"


def test_sensitivity_margin_math_short_circuit() -> None:
    builder = SensitivityBuilder(delta_pct=10.0, top_n=1)
    view = builder.build(
        proofs=[],
        normative_report=None,
        voltage_profile=None,
        protection_insight=_protection_insight(),
        protection_curves_it=None,
    )

    entry = next(e for e in view.entries if e.parameter_id == "short_circuit_level")

    assert round(entry.base_margin or 0.0, 4) == round(16.6667, 4)
    assert round(entry.plus.margin or 0.0, 4) == round(8.3333, 4)


def test_sensitivity_not_computed_propagation() -> None:
    context = NormativeContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    report = NormativeReport(
        report_id="rep-2",
        context=context,
        items=(
            NormativeItem(
                rule_id="NR_P15_001",
                title_pl="Obciążenie prądowe %In",
                severity=NormativeSeverity.WARNING,
                status=NormativeStatus.NOT_COMPUTED,
                target_id="LINE-2",
                observed_value=None,
                unit="%",
                limit_value=None,
                limit_unit="%",
                margin=None,
                why_pl="Brak danych.",
                requires=("P15",),
            ),
        ),
    )

    view = SensitivityBuilder(delta_pct=5.0, top_n=1).build(
        proofs=[],
        normative_report=report,
        voltage_profile=None,
        protection_insight=None,
        protection_curves_it=None,
    )

    entry = view.entries[0]
    assert entry.base_decision == SensitivityDecision.NOT_COMPUTED
    assert view.summary.not_computed_count == 1
