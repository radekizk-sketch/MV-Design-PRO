"""
Deterministic PDF renderer for the P24+ audit-grade report.

Input sources (read-only):
- VoltageProfileView (P21)
- ProtectionInsightView (P22a)
- SensitivityView (P25)
- LFSensitivityView (P33)
- RecommendationView (P26)
- ScenarioComparisonView (P27)
- CoverageScoreView (P28)
- NormativeReport (P20)
- ProofDocument metadata (P11–P19)
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from importlib.util import find_spec
from io import BytesIO

from analysis.coverage_score.models import CoverageScoreView
from analysis.lf_sensitivity.models import (
    LFSensitivityDriver,
    LFSensitivityEntry,
    LFSensitivityView,
)
from analysis.normative.models import NormativeItem, NormativeReport, NormativeStatus
from analysis.protection_curves_it.models import ProtectionCurvesITView
from analysis.protection_insight.models import (
    ProtectionInsightItem,
    ProtectionInsightView,
    ProtectionSelectivityStatus,
)
from analysis.recommendations.models import (
    RecommendationEffect,
    RecommendationEntry,
    RecommendationView,
)
from analysis.scenario_comparison.models import ScenarioComparisonEntry, ScenarioComparisonView
from analysis.sensitivity.models import (
    SensitivityDecision,
    SensitivityDriver,
    SensitivityEntry,
    SensitivityView,
)
from analysis.voltage_profile.models import VoltageProfileRow, VoltageProfileView
from analysis.voltage_profile.serializer import STATUS_ORDER
from application.proof_engine.proof_pack import resolve_mv_design_pro_version
from application.proof_engine.types import ProofDocument

_PDF_AVAILABLE = find_spec("reportlab") is not None

if _PDF_AVAILABLE:
    from reportlab import rl_config
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas


@dataclass(frozen=True)
class ReportContext:
    project_name: str | None
    case_name: str | None
    run_timestamp: datetime | None
    snapshot_id: str | None
    trace_id: str | None
    #: Identyfikator PRZEBIEGU (V12K-269) — osobno od `trace_id`, ktory
    #: identyfikuje ARTEFAKT dowodowy. Raport pokazuje oba, bo odpowiadaja na
    #: dwa rozne pytania: „ktory bieg" i „ktory dowod".
    run_id: str | None = None


def export_p24_plus_report_pdf(
    *,
    voltage_profile: VoltageProfileView | None,
    protection_insight: ProtectionInsightView | None,
    protection_curves_it: ProtectionCurvesITView | None,
    sensitivity: SensitivityView | None = None,
    lf_sensitivity: LFSensitivityView | None = None,
    recommendations: RecommendationView | None = None,
    scenario_comparison: ScenarioComparisonView | None = None,
    coverage_score: CoverageScoreView | None = None,
    normative_report: NormativeReport | None,
    proof_documents: Sequence[ProofDocument],
) -> bytes:
    if not _PDF_AVAILABLE:
        raise ImportError(
            "PDF export requires reportlab (missing dependency). "
            "Install it with: pip install reportlab"
        )

    rl_config.invariant = 1
    output = BytesIO()
    c = canvas.Canvas(
        output,
        pagesize=A4,
        invariant=1,
        pageCompression=0,
    )
    c.setCreator("MV-DESIGN-PRO PDF Renderer")
    c.setAuthor("MV-DESIGN-PRO")
    c.setTitle("Raport P24+ (ETAP+)")
    c.setSubject("Raport deterministyczny — audit-grade")

    page_width, page_height = A4
    left_margin = 20 * mm
    right_margin = page_width - 20 * mm
    top_margin = page_height - 20 * mm
    bottom_margin = 20 * mm
    line_height = 5 * mm
    section_spacing = 7 * mm

    y = top_margin

    def check_page_break(needed_height: float = 18 * mm) -> None:
        nonlocal y
        if y - needed_height < bottom_margin:
            c.showPage()
            y = top_margin

    def draw_heading(text: str, font_size: int = 12) -> None:
        nonlocal y
        check_page_break(14 * mm)
        c.setFont("Helvetica-Bold", font_size)
        c.drawString(left_margin, y, text)
        y -= line_height

    def draw_text(text: str, font_size: int = 10, bold: bool = False) -> None:
        nonlocal y
        font_name = "Helvetica-Bold" if bold else "Helvetica"
        c.setFont(font_name, font_size)
        c.drawString(left_margin, y, text)
        y -= line_height

    def draw_wrapped(text: str, font_size: int = 9) -> None:
        nonlocal y
        c.setFont("Helvetica", font_size)
        max_width = right_margin - left_margin
        words = str(text).split()
        line = ""
        for word in words:
            test_line = f"{line} {word}".strip()
            if c.stringWidth(test_line, "Helvetica", font_size) <= max_width:
                line = test_line
            else:
                check_page_break(line_height)
                c.drawString(left_margin, y, line)
                y -= line_height
                line = word
        if line:
            check_page_break(line_height)
            c.drawString(left_margin, y, line)
            y -= line_height

    context = _resolve_context(
        voltage_profile,
        protection_insight,
        protection_curves_it,
        sensitivity,
        lf_sensitivity,
        recommendations,
        coverage_score,
        normative_report,
    )
    report_hash = _report_hash(
        voltage_profile=voltage_profile,
        protection_insight=protection_insight,
        protection_curves_it=protection_curves_it,
        sensitivity=sensitivity,
        lf_sensitivity=lf_sensitivity,
        recommendations=recommendations,
        scenario_comparison=scenario_comparison,
        coverage_score=coverage_score,
        normative_report=normative_report,
        proof_documents=proof_documents,
    )

    c.setFont("Helvetica-Bold", 16)
    c.drawString(left_margin, y, "Raport P24+ — ETAP+ (audit-grade)")
    y -= section_spacing

    draw_heading("1. Strona tytułowa")
    draw_text(f"Projekt: {context.project_name or '—'}")
    draw_text(f"Case: {context.case_name or '—'}")
    draw_text(f"Run timestamp: {_format_timestamp(context.run_timestamp)}")
    draw_text(f"Snapshot ID: {context.snapshot_id or '—'}")
    draw_text(f"Run ID: {context.run_id or '—'}")
    draw_text(f"Trace ID: {context.trace_id or '—'}")
    draw_text("Zakres: P11–P33, P24+")
    y -= section_spacing

    draw_heading("2. Executive Summary (1 strona)")
    summary_lines = _build_summary_lines(
        voltage_profile=voltage_profile,
        protection_insight=protection_insight,
        protection_curves_it=protection_curves_it,
        sensitivity=sensitivity,
        lf_sensitivity=lf_sensitivity,
        recommendations=recommendations,
        scenario_comparison=scenario_comparison,
        coverage_score=coverage_score,
        normative_report=normative_report,
    )
    for line in summary_lines:
        draw_wrapped(line)
    draw_text("3 najważniejsze ryzyka:", bold=True)
    for line in _build_top_risks(
        voltage_profile=voltage_profile,
        protection_insight=protection_insight,
        normative_report=normative_report,
    ):
        draw_wrapped(f"- {line}")
    y -= section_spacing

    draw_heading("3. Voltage Profile — BUS-centric (P21)")
    if voltage_profile is None:
        draw_text("Brak danych P21.")
    else:
        draw_text("Top 5 najbardziej krytycznych BUS:", bold=True)
        for rank, row in enumerate(_top_critical_buses(voltage_profile.rows), start=1):
            draw_wrapped(
                f"Rank {rank}: BUS {row.bus_id} | Δ%={_format_percent(row.delta_pct)} | Status={row.status.value}"
            )
        draw_text("Tabela (BUS, Unom, U, Δ%, Status):", bold=True)
        for row in voltage_profile.rows:
            draw_wrapped(_format_voltage_row(row))
    y -= section_spacing

    draw_heading("4. Zabezpieczenia — decyzja inżynierska (P22a + P18 + P20)")
    if protection_insight is None:
        draw_text("Brak danych P22a.")
    else:
        for item in protection_insight.items:
            draw_wrapped(_format_protection_item(item))
    y -= section_spacing

    draw_heading("5. Krzywe I–t (jeśli dostępne)")
    if protection_curves_it is None:
        draw_text("Brak danych P22 (NOT EVALUATED).")
    else:
        draw_text(
            f"Status: {protection_curves_it.normative_status.value} | "
            f"BUS={protection_curves_it.bus_id}"
        )
        draw_wrapped(protection_curves_it.why_pl)
        if protection_curves_it.missing_data:
            draw_text("missing_data:", bold=True)
            for entry in protection_curves_it.missing_data:
                draw_wrapped(f"- {entry}")
    y -= section_spacing

    draw_heading("6. Ocena normatywna (P20)")
    if normative_report is None:
        draw_text("Brak raportu P20.")
    else:
        for item in normative_report.items:
            draw_wrapped(_format_normative_item(item))
    y -= section_spacing

    draw_heading("7. Analiza wrażliwości i marginesów (P25)")
    if sensitivity is None:
        draw_text("Brak analizy P25.")
    else:
        draw_text("Top 5 driverów wrażliwości:", bold=True)
        for driver in sensitivity.top_drivers:
            draw_wrapped(_format_sensitivity_driver(driver))
        if not sensitivity.entries:
            draw_text("Brak wpisów w P25.")
        else:
            draw_text("Lista wejściowa (parametr → margines):", bold=True)
            for entry in sensitivity.entries:
                draw_wrapped(_format_sensitivity_entry(entry))
    y -= section_spacing

    draw_heading("8. Wrażliwość napięć (P33) — Top 5 driverów")
    if lf_sensitivity is None:
        draw_text("Brak danych P33 (NOT COMPUTED).")
    else:
        if not lf_sensitivity.top_drivers:
            draw_text("Brak driverów P33.")
        else:
            for driver in lf_sensitivity.top_drivers:
                draw_wrapped(_format_lf_sensitivity_driver(driver))
        for entry in lf_sensitivity.entries:
            if entry.missing_data:
                draw_wrapped(_format_lf_sensitivity_entry(entry))
    y -= section_spacing

    draw_heading("9. Rekomendacje (P26)")
    if recommendations is None:
        draw_text("Brak danych P26.")
    else:
        if recommendations.primary is None:
            draw_text("Brak rekomendacji głównej (NOT COMPUTED).")
        else:
            draw_text("Rekomendacja główna:", bold=True)
            draw_wrapped(_format_recommendation_entry(recommendations.primary))
        if recommendations.alternatives:
            draw_text("Alternatywy:", bold=True)
            for entry in recommendations.alternatives:
                draw_wrapped(_format_recommendation_entry(entry))
    y -= section_spacing

    draw_heading("10. Porównanie scenariuszy (P27)")
    if scenario_comparison is None:
        draw_text("Brak danych P27.")
    else:
        if scenario_comparison.winner_scenario_id is None:
            draw_text("Brak zwycięzcy (NOT COMPUTED).")
        else:
            draw_text(
                f"Zwycięzca: {scenario_comparison.winner_scenario_id}",
                bold=True,
            )
        for entry in scenario_comparison.scenarios:
            draw_wrapped(_format_scenario_entry(entry))
            draw_wrapped(f"WHY: {entry.why_pl}")
    y -= section_spacing

    draw_heading("11. Kompletność analizy (P28)")
    if coverage_score is None:
        draw_text("Brak danych P28.")
    else:
        draw_text(f"Wynik kompletności: {coverage_score.total_score:.1f}/100")
        if coverage_score.missing_items:
            draw_text("Braki:", bold=True)
            for item in coverage_score.missing_items:
                draw_wrapped(f"- {item}")
        if coverage_score.critical_gaps:
            draw_text("Krytyczne luki:", bold=True)
            for item in coverage_score.critical_gaps:
                draw_wrapped(f"- {item}")
    y -= section_spacing

    draw_heading("12. Jawne braki danych (NOT COMPUTED)")
    missing_lines = _build_missing_data_lines(
        voltage_profile=voltage_profile,
        protection_insight=protection_insight,
        protection_curves_it=protection_curves_it,
        sensitivity=sensitivity,
        lf_sensitivity=lf_sensitivity,
        recommendations=recommendations,
        normative_report=normative_report,
    )
    if not missing_lines:
        draw_text("Brak wpisów NOT COMPUTED.")
    else:
        for line in missing_lines:
            draw_wrapped(line)
    y -= section_spacing

    draw_heading("13. Ślad dowodowy (ProofDocument)")
    if not proof_documents:
        draw_text("Brak ProofDocument.")
    else:
        for doc in _sorted_proof_documents(proof_documents):
            draw_wrapped(_format_proof_reference(doc))
    y -= section_spacing

    draw_heading("14. Ograniczenia i zastrzeżenia")
    for line in _LIMITATIONS:
        draw_wrapped(line)
    y -= section_spacing

    draw_heading("15. Stopka deterministyczna")
    draw_text("Deterministic Report: TAK")
    draw_text(f"MV-DESIGN-PRO version: {resolve_mv_design_pro_version() or '—'}")
    draw_text(f"Report hash (SHA-256): {report_hash}")

    c.save()
    return output.getvalue()


def _resolve_context(
    voltage_profile: VoltageProfileView | None,
    protection_insight: ProtectionInsightView | None,
    protection_curves_it: ProtectionCurvesITView | None,
    sensitivity: SensitivityView | None,
    lf_sensitivity: LFSensitivityView | None,
    recommendations: RecommendationView | None,
    coverage_score: CoverageScoreView | None,
    normative_report: NormativeReport | None,
) -> ReportContext:
    for ctx in (
        voltage_profile.context if voltage_profile else None,
        protection_insight.context if protection_insight else None,
        protection_curves_it.context if protection_curves_it else None,
        sensitivity.context if sensitivity else None,
        lf_sensitivity.context if lf_sensitivity else None,
        recommendations.context if recommendations else None,
        coverage_score.context if coverage_score else None,
        normative_report.context if normative_report else None,
    ):
        if ctx is not None:
            return ReportContext(
                project_name=getattr(ctx, "project_name", None),
                case_name=getattr(ctx, "case_name", None),
                run_timestamp=getattr(ctx, "run_timestamp", None),
                snapshot_id=getattr(ctx, "snapshot_id", None),
                trace_id=getattr(ctx, "trace_id", None),
                run_id=getattr(ctx, "run_id", None),
            )
    return ReportContext(
        project_name=None,
        case_name=None,
        run_timestamp=None,
        snapshot_id=None,
        trace_id=None,
        run_id=None,
    )


def _report_hash(
    *,
    voltage_profile: VoltageProfileView | None,
    protection_insight: ProtectionInsightView | None,
    protection_curves_it: ProtectionCurvesITView | None,
    sensitivity: SensitivityView | None,
    lf_sensitivity: LFSensitivityView | None,
    recommendations: RecommendationView | None,
    scenario_comparison: ScenarioComparisonView | None,
    coverage_score: CoverageScoreView | None,
    normative_report: NormativeReport | None,
    proof_documents: Sequence[ProofDocument],
) -> str:
    payload = {
        "voltage_profile": voltage_profile.to_dict() if voltage_profile else None,
        "protection_insight": (protection_insight.to_dict() if protection_insight else None),
        "protection_curves_it": (protection_curves_it.to_dict() if protection_curves_it else None),
        "sensitivity": sensitivity.to_dict() if sensitivity else None,
        "lf_sensitivity": lf_sensitivity.to_dict() if lf_sensitivity else None,
        "recommendations": recommendations.to_dict() if recommendations else None,
        "scenario_comparison": (scenario_comparison.to_dict() if scenario_comparison else None),
        "coverage_score": coverage_score.to_dict() if coverage_score else None,
        "normative_report": normative_report.to_dict() if normative_report else None,
        "proof_metadata": [
            _proof_metadata(doc) for doc in _sorted_proof_documents(proof_documents)
        ],
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _sorted_proof_documents(
    proof_documents: Sequence[ProofDocument],
) -> list[ProofDocument]:
    return sorted(
        proof_documents,
        key=lambda doc: (doc.proof_type.value, doc.document_id.hex),
    )


def _proof_metadata(doc: ProofDocument) -> dict[str, str | None]:
    return {
        "document_id": str(doc.document_id),
        "artifact_id": str(doc.artifact_id),
        "proof_type": doc.proof_type.value,
        "title_pl": doc.title_pl,
        "target_id": doc.header.target_id,
    }


def _format_timestamp(ts: datetime | None) -> str:
    if ts is None:
        return "—"
    return ts.isoformat(timespec="seconds")


def _format_percent(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:.2f}%"


def _format_float(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:.3f}"


def _build_summary_lines(
    *,
    voltage_profile: VoltageProfileView | None,
    protection_insight: ProtectionInsightView | None,
    protection_curves_it: ProtectionCurvesITView | None,
    sensitivity: SensitivityView | None,
    lf_sensitivity: LFSensitivityView | None,
    recommendations: RecommendationView | None,
    scenario_comparison: ScenarioComparisonView | None,
    coverage_score: CoverageScoreView | None,
    normative_report: NormativeReport | None,
) -> list[str]:
    lines: list[str] = []
    if normative_report is None:
        lines.append("P20: brak raportu normatywnego.")
    else:
        counts = _count_normative(normative_report.items)
        lines.append(
            "P20: FAIL={fail}, WARNING={warn}, NOT COMPUTED={nc}".format(
                fail=counts["fail"],
                warn=counts["warning"],
                nc=counts["not_computed"],
            )
        )
    if voltage_profile is None:
        lines.append("P21: brak profilu napięciowego.")
    else:
        summary = voltage_profile.summary
        lines.append(
            f"P21: FAIL={summary.fail_count}, WARNING={summary.warning_count}, NOT COMPUTED={summary.not_computed_count}"
        )
    if protection_insight is None:
        lines.append("P22a: brak analizy zabezpieczeń.")
    else:
        summary = protection_insight.summary
        lines.append(
            f"P22a: FAIL={summary.count_fail}, WARNING={summary.count_warning}, NOT_EVALUATED={summary.count_not_evaluated}"
        )
    if protection_curves_it is None:
        lines.append("P22: brak krzywych I–t.")
    else:
        lines.append(
            f"P22: status={protection_curves_it.normative_status.value} | "
            f"missing_data={len(protection_curves_it.missing_data)}"
        )
    if sensitivity is None:
        lines.append("P25: brak analizy wrażliwości.")
    else:
        lines.append(
            f"P25: entries={len(sensitivity.entries)}, top_drivers={len(sensitivity.top_drivers)}, not_computed={sensitivity.summary.not_computed_count}"
        )
    if lf_sensitivity is None:
        lines.append("P33: brak wrażliwości napięć.")
    else:
        lines.append(
            f"P33: entries={len(lf_sensitivity.entries)}, top_drivers={len(lf_sensitivity.top_drivers)}, not_computed={lf_sensitivity.summary.not_computed_count}"
        )
    if recommendations is None:
        lines.append("P26: brak rekomendacji.")
    else:
        lines.append(
            "P26: primary={primary}, alternatives={alt}, not_computed={nc}".format(
                primary="TAK" if recommendations.primary else "NIE",
                alt=len(recommendations.alternatives),
                nc=recommendations.summary.not_computed_count,
            )
        )
    if scenario_comparison is None:
        lines.append("P27: brak porównania scenariuszy.")
    else:
        lines.append(
            "P27: scenarios={count}, winner={winner}".format(
                count=len(scenario_comparison.scenarios),
                winner=scenario_comparison.winner_scenario_id or "—",
            )
        )
    if coverage_score is None:
        lines.append("P28: brak audytu kompletności.")
    else:
        lines.append(
            f"P28: score={coverage_score.total_score:.1f}/100 | "
            f"missing={len(coverage_score.missing_items)} | "
            f"gaps={len(coverage_score.critical_gaps)}"
        )
    return lines


def _build_top_risks(
    *,
    voltage_profile: VoltageProfileView | None,
    protection_insight: ProtectionInsightView | None,
    normative_report: NormativeReport | None,
) -> list[str]:
    risks: list[str] = []
    if normative_report is not None:
        risky_items = [
            item
            for item in normative_report.items
            if item.status in (NormativeStatus.FAIL, NormativeStatus.WARNING)
        ]
        risky_items_sorted = sorted(
            risky_items,
            key=lambda item: (
                0 if item.status == NormativeStatus.FAIL else 1,
                item.rule_id,
                item.target_id,
            ),
        )
        for item in risky_items_sorted:
            risks.append(
                f"{item.rule_id} {item.target_id}: {item.why_pl} (status={item.status.value})"
            )
    if voltage_profile is not None:
        worst = _top_critical_buses(voltage_profile.rows)[:1]
        if worst:
            row = worst[0]
            risks.append(
                f"P21 BUS {row.bus_id}: Δ%={_format_percent(row.delta_pct)}"
                f" (status={row.status.value})"
            )
    if protection_insight is not None:
        critical = [
            item
            for item in protection_insight.items
            if item.selectivity_status == ProtectionSelectivityStatus.NOT_SELECTIVE
        ]
        critical_sorted = sorted(
            critical,
            key=lambda item: item.primary_device_id,
        )
        for item in critical_sorted:
            risks.append(f"P22a {item.primary_device_id}: brak selektywności ({item.why_pl})")
    return risks[:3]


def _top_critical_buses(rows: Iterable[VoltageProfileRow]) -> list[VoltageProfileRow]:
    return sorted(
        rows,
        key=lambda row: (
            STATUS_ORDER[row.status],
            -(abs(row.delta_pct) if row.delta_pct is not None else -1.0),
            row.bus_id,
        ),
    )[:5]


def _format_voltage_row(row: VoltageProfileRow) -> str:
    return (
        f"BUS {row.bus_id} | Unom={_format_float(row.u_nom_kv)} kV | "
        f"U={_format_float(row.u_kv)} kV | Δ%={_format_percent(row.delta_pct)} | "
        f"Status={row.status.value}"
    )


def _format_protection_item(item: ProtectionInsightItem) -> str:
    decision = _selectivity_decision(item.selectivity_status)
    margin = _min_margin(
        item.breaking_margin_pct,
        item.dynamic_margin_pct,
        item.thermal_margin_pct,
    )
    margin_str = _format_percent(margin) if margin is not None else "—"
    return (
        f"P22a {item.primary_device_id} | Rule={item.rule_id} | "
        f"Decision={decision} | Margin={margin_str} | WHY: {item.why_pl}"
    )


def _format_sensitivity_entry(entry: SensitivityEntry) -> str:
    base_margin = _format_percent(entry.base_margin)
    minus_delta = _format_percent(entry.minus.delta_margin)
    plus_delta = _format_percent(entry.plus.delta_margin)
    return (
        f"P25 {entry.parameter_id} {entry.target_id} | Base={base_margin} | "
        f"Δ-={minus_delta} | Δ+={plus_delta} | "
        f"Decision={entry.base_decision.value}"
    )


def _format_sensitivity_driver(driver: SensitivityDriver) -> str:
    return (
        f"{driver.parameter_id} {driver.target_id} | "
        f"Score={driver.score:.2f} | Direction={driver.direction}"
    )


def _format_lf_sensitivity_driver(driver: LFSensitivityDriver) -> str:
    delta = _format_percent(driver.delta_delta_pct)
    margin = _format_percent(driver.delta_margin_pct)
    return (
        f"{driver.bus_id} {driver.parameter} | "
        f"Perturb={driver.perturbation} | ΔΔ%={delta} | "
        f"ΔMargin={margin}"
    )


def _format_lf_sensitivity_entry(entry: LFSensitivityEntry) -> str:
    missing = ", ".join(entry.missing_data)
    return f"P33 BUS {entry.bus_id}: NOT COMPUTED ({missing})."


def _format_recommendation_entry(entry: RecommendationEntry) -> str:
    current = _format_value(entry.current_value, entry.current_unit)
    delta = _format_value(entry.required_delta, entry.delta_unit)
    return (
        f"P26 {entry.parameter_id} {entry.target_id} | "
        f"Current={current} | Required Δ={delta} | "
        f"Effect={entry.expected_effect.value} | Note: {entry.confidence_note}"
    )


def _format_scenario_entry(entry: ScenarioComparisonEntry) -> str:
    delta_margin = _format_percent(entry.delta_margin)
    return (
        f"P27 {entry.scenario_id} | Risk={entry.risk_score:.2f} | "
        f"ΔMargin={delta_margin} | RankΔ={entry.delta_risk_rank}"
    )


def _selectivity_decision(status: ProtectionSelectivityStatus) -> str:
    if status == ProtectionSelectivityStatus.OK:
        return "PASS"
    if status == ProtectionSelectivityStatus.NOT_SELECTIVE:
        return "FAIL"
    return "NOT COMPUTED"


def _min_margin(*values: float | None) -> float | None:
    numeric = [v for v in values if v is not None]
    if not numeric:
        return None
    return min(numeric)


def _format_normative_item(item: NormativeItem) -> str:
    observed = _format_value(item.observed_value, item.unit)
    limit = _format_value(item.limit_value, item.limit_unit)
    margin = _format_percent(item.margin) if item.margin is not None else "—"
    return (
        f"P20 {item.rule_id} | Target={item.target_id} | "
        f"Observed={observed} | Limit={limit} | Margin={margin} | "
        f"Decision={item.status.value} | WHY: {item.why_pl}"
    )


def _format_value(value: float | str | None, unit: str | None) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        if unit:
            return f"{value:.3f} {unit}"
        return f"{value:.3f}"
    if unit:
        return f"{value} {unit}"
    return str(value)


def _build_missing_data_lines(
    *,
    voltage_profile: VoltageProfileView | None,
    protection_insight: ProtectionInsightView | None,
    protection_curves_it: ProtectionCurvesITView | None,
    sensitivity: SensitivityView | None,
    lf_sensitivity: LFSensitivityView | None,
    recommendations: RecommendationView | None,
    normative_report: NormativeReport | None,
) -> list[str]:
    lines: list[str] = []
    if normative_report is not None:
        for item in normative_report.items:
            if item.status == NormativeStatus.NOT_COMPUTED:
                requires = ", ".join(item.requires) if item.requires else "—"
                lines.append(f"P20 {item.rule_id} {item.target_id}: brak danych ({requires}).")
    if voltage_profile is not None:
        for row in voltage_profile.rows:
            if row.status.value == "NOT_COMPUTED":
                lines.append(f"P21 BUS {row.bus_id}: brak Unom/U (NOT COMPUTED).")
    if protection_insight is not None:
        for item in protection_insight.items:
            if item.selectivity_status == ProtectionSelectivityStatus.NOT_EVALUATED:
                lines.append(f"P22a {item.primary_device_id}: brak oceny selektywności.")
    if protection_curves_it is not None and protection_curves_it.missing_data:
        for entry in protection_curves_it.missing_data:
            lines.append(f"P22 {protection_curves_it.primary_device_id}: {entry}.")
    if sensitivity is not None:
        for entry in sensitivity.entries:
            if entry.base_decision == SensitivityDecision.NOT_COMPUTED:
                lines.append(
                    f"P25 {entry.parameter_id} {entry.target_id}: brak danych wejściowych."
                )
    if lf_sensitivity is not None:
        for entry in lf_sensitivity.entries:
            if entry.missing_data:
                lines.append(_format_lf_sensitivity_entry(entry))
    if recommendations is not None:
        entries = []
        if recommendations.primary is not None:
            entries.append(recommendations.primary)
        entries.extend(recommendations.alternatives)
        for entry in entries:
            if entry.expected_effect == RecommendationEffect.NOT_COMPUTED:
                lines.append(f"P26 {entry.parameter_id} {entry.target_id}: {entry.confidence_note}")
    return lines


def _count_normative(items: Iterable[NormativeItem]) -> dict[str, int]:
    counts = {"fail": 0, "warning": 0, "not_computed": 0}
    for item in items:
        if item.status == NormativeStatus.FAIL:
            counts["fail"] += 1
        elif item.status == NormativeStatus.WARNING:
            counts["warning"] += 1
        elif item.status == NormativeStatus.NOT_COMPUTED:
            counts["not_computed"] += 1
    return counts


def _format_proof_reference(doc: ProofDocument) -> str:
    metadata = _proof_metadata(doc)
    encoded = json.dumps(metadata, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    return (
        f"ProofDocument {metadata['proof_type']} | ID={metadata['document_id']} | "
        f"Artifact={metadata['artifact_id']} | Hash={digest}"
    )


_LIMITATIONS = (
    "Raport nie zawiera nowych obliczeń fizycznych (prezentacja tylko).",
    "Krzywe I–t są prezentacją danych wejściowych i normatywnych (read-only).",
    "Decyzje PASS/WARNING/FAIL pochodzą z P20 i P22a (bez modyfikacji solverów).",
    "Analiza P25 jest post-hoc (perturbacje bez recompute fizyki).",
    "Analiza P33 jest post-hoc i opiera się na dowodzie P32 (bez uruchamiania solvera).",
    "Rekomendacje P26 są estymacją post-hoc na bazie P25 (bez zmian solverów).",
    "Porównanie scenariuszy P27 jest deterministyczne i opisowe (brak nowych obliczeń).",
    "Kompletność P28 to audyt informacyjny (bez PASS/FAIL).",
    "NOT COMPUTED oznacza brak danych wejściowych, a nie negatywny wynik.",
)
