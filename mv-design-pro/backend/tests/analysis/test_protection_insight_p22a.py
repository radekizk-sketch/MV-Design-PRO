from __future__ import annotations

from datetime import datetime
from uuid import UUID

from analysis.normative.models import (
    NormativeContext,
    NormativeItem,
    NormativeReport,
    NormativeSeverity,
    NormativeStatus,
)
from analysis.protection_insight.builder import ProtectionInsightBuilder
from analysis.protection_insight.models import ProtectionSelectivityStatus
from application.proof_engine.types import (
    ProofDocument,
    ProofHeader,
    ProofSummary,
    ProofType,
    ProofValue,
)

RUN_TS = datetime(2024, 3, 1, 9, 0, 0)


def _make_proof(
    target_id: str,
    *,
    ikss_ka: float | None = 10.0,
    icu_ka: float | None = 12.0,
    ip_ka: float | None = 8.0,
    idyn_ka: float | None = 10.0,
    i2t_ka2s: float | None = 100.0,
    ith_limit_ka2s: float | None = 125.0,
    selectivity_margin_s: float | None = 0.15,
) -> ProofDocument:
    key_results: dict[str, ProofValue] = {
        "ikss_ka": ProofValue.create("I_k''", ikss_ka, "kA", "ikss_ka"),
        "icu_ka": ProofValue.create("I_{cu}", icu_ka, "kA", "icu_ka"),
        "ip_ka": ProofValue.create("i_p", ip_ka, "kA", "ip_ka"),
        "idyn_ka": ProofValue.create("I_{dyn}", idyn_ka, "kA", "idyn_ka"),
        "i2t_ka2s": ProofValue.create("∫i²dt", i2t_ka2s, "kA²s", "i2t_ka2s"),
        "ith_limit_ka2s": ProofValue.create("I_th", ith_limit_ka2s, "kA²s", "ith_limit_ka2s"),
    }
    if selectivity_margin_s is not None:
        key_results["selectivity_margin_s"] = ProofValue.create(
            "Δt_sel", selectivity_margin_s, "s", "selectivity_margin_s"
        )

    summary = ProofSummary(
        key_results=key_results,
        unit_check_passed=True,
        total_steps=1,
    )
    header = ProofHeader(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        solver_version="P18",
        target_id=target_id,
        element_kind="PROTECTION",
    )

    return ProofDocument(
        document_id=UUID(int=0),
        artifact_id=UUID(int=1),
        created_at=RUN_TS,
        proof_type=ProofType.PROTECTION_OVERCURRENT,
        title_pl="P18",
        header=header,
        steps=(),
        summary=summary,
    )


def _make_report(items: tuple[NormativeItem, ...]) -> NormativeReport:
    context = NormativeContext(
        project_name="Proj",
        case_name="Case",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    return NormativeReport(report_id="rep-1", context=context, items=items)


def test_protection_insight_determinism_to_dict() -> None:
    proof = _make_proof("DEV-1")
    report = _make_report(
        (
            NormativeItem(
                rule_id="NR_P18_004",
                title_pl="Selektywność",
                severity=NormativeSeverity.INFO,
                status=NormativeStatus.PASS,
                target_id="DEV-1",
                observed_value="OK",
                unit=None,
                limit_value=None,
                limit_unit=None,
                margin=None,
                why_pl="Warunek spełniony.",
                requires=(),
            ),
        )
    )

    builder = ProtectionInsightBuilder()

    view_a = builder.build([proof], report)
    view_b = builder.build([proof], report)

    assert view_a.to_dict() == view_b.to_dict()


def test_protection_insight_margin_calculation() -> None:
    proof = _make_proof("DEV-1", ikss_ka=10.0, icu_ka=12.0)
    report = _make_report(
        (
            NormativeItem(
                rule_id="NR_P18_004",
                title_pl="Selektywność",
                severity=NormativeSeverity.INFO,
                status=NormativeStatus.PASS,
                target_id="DEV-1",
                observed_value="OK",
                unit=None,
                limit_value=None,
                limit_unit=None,
                margin=None,
                why_pl="Warunek spełniony.",
                requires=(),
            ),
        )
    )

    view = ProtectionInsightBuilder().build([proof], report)
    item = view.items[0]

    assert round(item.breaking_margin_pct or 0.0, 6) == round(100.0 / 6.0, 6)


def test_protection_insight_not_evaluated_when_missing() -> None:
    proof = _make_proof("DEV-2", selectivity_margin_s=None)
    report = _make_report(())

    view = ProtectionInsightBuilder().build([proof], report)
    item = view.items[0]

    assert item.selectivity_status == ProtectionSelectivityStatus.NOT_EVALUATED
    assert "Brak oceny selektywności" in item.why_pl


def test_protection_insight_sorting_contract() -> None:
    proofs = [
        _make_proof("DEV-OK"),
        _make_proof("DEV-NOT-EVAL"),
        _make_proof("DEV-WARN"),
        _make_proof("DEV-FAIL"),
    ]
    report = _make_report(
        (
            NormativeItem(
                rule_id="NR_P18_004",
                title_pl="Selektywność",
                severity=NormativeSeverity.FAIL,
                status=NormativeStatus.FAIL,
                target_id="DEV-FAIL",
                observed_value="NOT_OK",
                unit=None,
                limit_value=None,
                limit_unit=None,
                margin=None,
                why_pl="Warunek niespełniony.",
                requires=(),
            ),
            NormativeItem(
                rule_id="NR_P18_004",
                title_pl="Selektywność",
                severity=NormativeSeverity.WARNING,
                status=NormativeStatus.NOT_COMPUTED,
                target_id="DEV-WARN",
                observed_value=None,
                unit=None,
                limit_value=None,
                limit_unit=None,
                margin=None,
                why_pl="Brak danych.",
                requires=(),
            ),
            NormativeItem(
                rule_id="NR_P18_004",
                title_pl="Selektywność",
                severity=NormativeSeverity.INFO,
                status=NormativeStatus.PASS,
                target_id="DEV-OK",
                observed_value="OK",
                unit=None,
                limit_value=None,
                limit_unit=None,
                margin=None,
                why_pl="Warunek spełniony.",
                requires=(),
            ),
        )
    )

    view = ProtectionInsightBuilder().build(proofs, report)

    ordered_ids = [item.primary_device_id for item in view.items]
    assert ordered_ids == ["DEV-FAIL", "DEV-WARN", "DEV-NOT-EVAL", "DEV-OK"]
