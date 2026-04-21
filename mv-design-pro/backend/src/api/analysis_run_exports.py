from __future__ import annotations

import io
import json
import textwrap
from typing import Any, Literal

from api.analysis_case_context import build_analysis_case_context
from api.canonical_run_views import (
    build_analysis_run_summary,
    build_branch_results_response,
    build_bus_results_response,
    build_extended_trace_response,
    build_power_flow_export_bundle,
    build_results_index_response,
    build_short_circuit_results_response,
)
from api.v125_contracts import build_export_artifact, build_export_policy, resolve_proof_pack_ref
from application.analysis_run.read_model import build_trace_summary, canonicalize_json
from enm.canonical_analysis import CanonicalRun
from fastapi.responses import Response


def _trace_step_substitution_text(step: dict[str, Any]) -> str | None:
    substitution = step.get("substitution_latex") or step.get("substitution")
    if substitution is None:
        return None
    text = str(substitution).strip()
    return text or None


ReportProfile = Literal["osd", "wykonawczy", "audytowy"]
ReportDetailLevel = Literal["minimalny", "standardowy", "pelny"]
ReportScope = Literal["whole_run", "active_table"]
ReportSection = Literal["summary", "results", "catalog", "trace"]
ReportFocusTable = Literal["buses", "branches", "short_circuit", "trace"] | None

DEFAULT_REPORT_SECTIONS_BY_DETAIL: dict[ReportDetailLevel, tuple[ReportSection, ...]] = {
    "minimalny": ("summary", "results"),
    "standardowy": ("summary", "results", "catalog"),
    "pelny": ("summary", "results", "catalog", "trace"),
}

REPORT_SECTION_LABELS: dict[ReportSection, str] = {
    "summary": "Podsumowanie",
    "results": "Wyniki tabelaryczne",
    "catalog": "Kontekst katalogowy",
    "trace": "Wywód szczegółowy",
}

REPORT_PROFILE_LABELS: dict[ReportProfile, str] = {
    "osd": "OSD",
    "wykonawczy": "Wykonawczy",
    "audytowy": "Audytowy",
}

REPORT_DETAIL_LABELS: dict[ReportDetailLevel, str] = {
    "minimalny": "Minimalny",
    "standardowy": "Standardowy",
    "pelny": "Pełny",
}

REPORT_SCOPE_LABELS: dict[ReportScope, str] = {
    "whole_run": "Cały model",
    "active_table": "Aktywna tabela",
}


def normalize_report_options(
    *,
    profile: str | None = None,
    detail_level: str | None = None,
    scope: str | None = None,
    sections: list[str] | tuple[str, ...] | None = None,
    focus_table: str | None = None,
) -> dict[str, Any]:
    normalized_profile: ReportProfile = profile if profile in REPORT_PROFILE_LABELS else "osd"
    normalized_detail: ReportDetailLevel = (
        detail_level if detail_level in DEFAULT_REPORT_SECTIONS_BY_DETAIL else "standardowy"
    )
    normalized_scope: ReportScope = scope if scope in REPORT_SCOPE_LABELS else "whole_run"
    normalized_focus_table: ReportFocusTable = (
        focus_table if focus_table in {"buses", "branches", "short_circuit", "trace"} else None
    )

    default_sections = list(DEFAULT_REPORT_SECTIONS_BY_DETAIL[normalized_detail])
    raw_sections = list(sections or [])
    normalized_sections = [
        section for section in ("summary", "results", "catalog", "trace") if section in raw_sections
    ]
    if not normalized_sections:
        normalized_sections = default_sections

    return {
        "profile": normalized_profile,
        "profile_label": REPORT_PROFILE_LABELS[normalized_profile],
        "detail_level": normalized_detail,
        "detail_level_label": REPORT_DETAIL_LABELS[normalized_detail],
        "scope": normalized_scope,
        "scope_label": REPORT_SCOPE_LABELS[normalized_scope],
        "sections": normalized_sections,
        "section_labels": [REPORT_SECTION_LABELS[section] for section in normalized_sections],
        "focus_table": normalized_focus_table,
    }


def _analysis_title(run: CanonicalRun) -> str:
    if run.analysis_type == "PF":
        return "Raport rozpływu mocy"
    if run.analysis_type == "short_circuit_sn":
        return "Raport analizy zwarciowej"
    return "Raport analizy sieci"


def _detail_limits(detail_level: ReportDetailLevel) -> dict[str, int]:
    if detail_level == "minimalny":
        return {"catalog_items": 8, "trace_steps": 4, "rows": 12}
    if detail_level == "pelny":
        return {"catalog_items": 40, "trace_steps": 24, "rows": 80}
    return {"catalog_items": 20, "trace_steps": 12, "rows": 30}


def _build_report_results_section(
    run: CanonicalRun,
    *,
    scope: ReportScope,
    focus_table: ReportFocusTable,
) -> dict[str, Any]:
    results_index = build_results_index_response(run)
    bus_results = build_bus_results_response(run)
    branch_results = build_branch_results_response(run)
    short_circuit_results = build_short_circuit_results_response(run)

    if scope != "active_table" or focus_table is None:
        return {
            "index": results_index,
            "buses": bus_results,
            "branches": branch_results,
            "short_circuit": short_circuit_results,
        }

    filtered_tables = [
        table for table in results_index.get("tables", []) if table.get("table_id") == focus_table
    ]
    return {
        "index": {
            **results_index,
            "tables": filtered_tables,
        },
        "buses": bus_results if focus_table == "buses" else {"run_id": str(run.id), "rows": []},
        "branches": (
            branch_results if focus_table == "branches" else {"run_id": str(run.id), "rows": []}
        ),
        "short_circuit": (
            short_circuit_results
            if focus_table == "short_circuit"
            else {"run_id": str(run.id), "rows": []}
        ),
    }


def build_analysis_run_report_payload(
    run: CanonicalRun,
    *,
    report_options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    analysis_case_context = build_analysis_case_context(run)
    normalized_options = normalize_report_options(**(report_options or {}))
    trace_payload = canonicalize_json(build_extended_trace_response(run))
    results_section = _build_report_results_section(
        run,
        scope=normalized_options["scope"],
        focus_table=normalized_options["focus_table"],
    )

    payload: dict[str, Any] = {
        "report_type": "analysis_run_report",
        "report_version": "2.0.0",
        "title": _analysis_title(run),
        "report_options": normalized_options,
        "analysis_case_context": analysis_case_context,
        "proof_pack_ref": resolve_proof_pack_ref(run),
        "export_artifact": build_export_artifact(run, export_kind="json"),
        "export_policy": build_export_policy("json"),
        "run": build_analysis_run_summary(run),
        "summary": build_analysis_run_summary(run).get("summary_json", {}),
    }

    selected_sections = set(normalized_options["sections"])
    if "results" in selected_sections:
        payload["results"] = results_section
    if "catalog" in selected_sections:
        payload["catalog_context"] = trace_payload.get("catalog_context", [])
        payload["catalog_context_summary"] = trace_payload.get("catalog_context_summary", {})
    if "trace" in selected_sections:
        payload["trace"] = {
            "trace_summary": build_trace_summary(trace_payload.get("white_box_trace") or []),
            "white_box_trace": trace_payload.get("white_box_trace", []),
        }

    return payload


def _require_power_flow_bundle(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "PF":
        raise ValueError(
            "Eksport raportu z kanonicznego przebiegu jest obecnie dostępny tylko dla rozpływu mocy.",
        )
    return build_power_flow_export_bundle(run)


def _format_catalog_binding(entry: dict[str, Any]) -> str:
    binding = entry.get("catalog_binding") or {}
    namespace = binding.get("catalog_namespace") or "-"
    item_id = binding.get("catalog_item_id") or "-"
    version = binding.get("catalog_item_version")
    if version:
        return f"{namespace}:{item_id} ({version})"
    return f"{namespace}:{item_id}"


def _truncate_catalog_params(value: Any, max_chars: int = 220) -> str:
    if value is None:
        return "—"
    payload = canonicalize_json(value)
    text = str(payload)
    if isinstance(payload, dict | list):
        text = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars]}..."


def _catalog_context_lines(bundle: dict[str, Any], *, max_items: int = 20) -> list[str]:
    lines: list[str] = []
    for entry in (bundle.get("catalog_context") or [])[:max_items]:
        lines.append(
            " | ".join(
                [
                    str(entry.get("element_id") or "-"),
                    str(entry.get("element_type") or "-"),
                    _format_catalog_binding(entry),
                    str(entry.get("parameter_source") or entry.get("parameter_origin") or "-"),
                    _truncate_catalog_params(entry.get("materialized_params")),
                ]
            )
        )
    return lines


def build_analysis_run_export_payload(run: CanonicalRun) -> dict[str, Any]:
    bundle = _require_power_flow_bundle(run)
    analysis_case_context = bundle.get("analysis_case_context") or build_analysis_case_context(run)
    return {
        "report_type": "power_flow_result",
        "report_version": "1.1.0",
        "analysis_case_context": analysis_case_context,
        "proof_pack_ref": resolve_proof_pack_ref(run),
        "export_artifact": build_export_artifact(run, export_kind="json"),
        "export_policy": build_export_policy("json"),
        "metadata": bundle["metadata"],
        "result": bundle["result"],
        "bus_results": bundle.get("bus_results", {}),
        "branch_results": bundle.get("branch_results", {}),
        "results_index": bundle.get("results_index", {}),
        "catalog_context": bundle.get("catalog_context", []),
        "white_box_trace": bundle.get("white_box_trace", []),
        "trace_summary": {
            "solver_version": bundle["trace"].get("solver_version"),
            "input_hash": bundle["trace"].get("input_hash"),
            "converged": bundle["trace"].get("converged"),
            "final_iterations_count": bundle["trace"].get("final_iterations_count"),
        },
    }


def build_analysis_run_trace_export_payload(run: CanonicalRun) -> dict[str, Any]:
    trace_payload = canonicalize_json(build_extended_trace_response(run))
    if not trace_payload.get("white_box_trace"):
        raise ValueError("Ślad obliczeniowy niedostępny dla tego przebiegu analizy.")
    trace_payload["proof_pack_ref"] = resolve_proof_pack_ref(run)
    trace_payload["export_artifact"] = build_export_artifact(run, export_kind="whitebox_package")
    trace_payload["export_policy"] = build_export_policy("whitebox_package")
    return trace_payload


def export_run_report_json_response(
    run: CanonicalRun,
    *,
    filename_stem: str,
    report_options: dict[str, Any] | None = None,
) -> Response:
    json_content = json.dumps(
        build_analysis_run_report_payload(run, report_options=report_options),
        indent=2,
        ensure_ascii=False,
        sort_keys=True,
    )
    return Response(
        content=json_content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_stem}_{run.id}.json"',
        },
    )


def _trace_jsonl_lines(trace_payload: dict[str, Any]) -> list[str]:
    exported_at = canonicalize_json(trace_payload.get("exported_at")) or None
    if not isinstance(exported_at, str):
        from datetime import UTC, datetime

        exported_at = datetime.now(UTC).isoformat()

    white_box_trace = trace_payload.get("white_box_trace") or []
    lines = [
        json.dumps(
            {
                "type": "header",
                "seq": 1,
                "exported_at": exported_at,
                "data": {
                    "run_id": trace_payload.get("run_id"),
                    "snapshot_id": trace_payload.get("snapshot_id"),
                    "input_hash": trace_payload.get("input_hash"),
                    "total_steps": len(white_box_trace),
                    "catalog_context_count": len(trace_payload.get("catalog_context") or []),
                    "catalog_context": trace_payload.get("catalog_context") or [],
                    "catalog_context_by_element": trace_payload.get("catalog_context_by_element"),
                    "catalog_context_summary": trace_payload.get("catalog_context_summary"),
                    "analysis_case_context": trace_payload.get("analysis_case_context"),
                    "proof_pack_ref": trace_payload.get("proof_pack_ref"),
                    "export_artifact": trace_payload.get("export_artifact"),
                    "export_policy": trace_payload.get("export_policy"),
                    "export_version": "1.0.0",
                },
            },
            ensure_ascii=False,
        )
    ]

    for index, step in enumerate(white_box_trace):
        lines.append(
            json.dumps(
                {
                    "type": "step",
                    "seq": index + 2,
                    "exported_at": exported_at,
                    "data": {
                        "step_index": index,
                        "step_number": step.get("step"),
                        "key": step.get("key") or step.get("step_id"),
                        "title": step.get("title") or step.get("description"),
                        "phase": step.get("phase"),
                        "element_id": step.get("element_id")
                        or (step.get("catalog_context_entry") or {}).get("element_id"),
                        "target_id": step.get("target_id"),
                        "solver_ref": step.get("solver_ref"),
                        "catalog_binding": step.get("catalog_binding")
                        or (step.get("catalog_context_entry") or {}).get("catalog_binding"),
                        "source_catalog": step.get("source_catalog")
                        or (step.get("catalog_context_entry") or {}).get("source_catalog"),
                        "source_catalog_label": step.get("source_catalog_label")
                        or (step.get("catalog_context_entry") or {}).get("source_catalog_label"),
                        "parameter_origin": step.get("parameter_origin")
                        or (step.get("catalog_context_entry") or {}).get("parameter_origin"),
                        "parameter_source": step.get("parameter_source")
                        or (step.get("catalog_context_entry") or {}).get("parameter_source"),
                        "formula_latex": step.get("formula_latex"),
                        "inputs": step.get("inputs"),
                        "substitution": step.get("substitution"),
                        "substitution_latex": step.get("substitution_latex")
                        or step.get("substitution"),
                        "result": step.get("result"),
                        "materialized_params": step.get("materialized_params")
                        or (step.get("catalog_context_entry") or {}).get("materialized_params"),
                        "manual_overrides": step.get("manual_overrides")
                        or (step.get("catalog_context_entry") or {}).get("manual_overrides"),
                        "manual_override_count": step.get("manual_override_count")
                        or (step.get("catalog_context_entry") or {}).get("manual_override_count"),
                        "notes": step.get("notes"),
                    },
                },
                ensure_ascii=False,
            )
        )

    return lines


def export_run_json_response(
    run: CanonicalRun,
    *,
    filename_stem: str,
) -> Response:
    json_content = json.dumps(
        build_analysis_run_export_payload(run),
        indent=2,
        ensure_ascii=False,
        sort_keys=True,
    )
    return Response(
        content=json_content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_stem}_{run.id}.json"',
        },
    )


def export_run_docx_response(
    run: CanonicalRun,
    *,
    filename_stem: str,
) -> Response:
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.shared import Pt
    except ImportError as exc:
        raise ValueError(
            "Eksport DOCX wymaga python-docx. Zainstaluj: pip install python-docx",
        ) from exc

    bundle = _require_power_flow_bundle(run)
    result = bundle["result"]
    metadata = bundle["metadata"]
    catalog_context_lines = _catalog_context_lines(bundle)
    white_box_trace = bundle.get("white_box_trace") or []

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    heading = doc.add_heading("Raport rozpływu mocy", level=0)
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER

    status_parts = [
        f"Status: {'Zbieżny' if result.get('converged') else 'Niezbieżny'}",
        f"Iteracje: {result.get('iterations_count', '—')}",
        f"Uruchomienie: {str(metadata.get('run_id', '—'))[:8]}...",
    ]
    subtitle = doc.add_paragraph(" | ".join(status_parts))
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph()
    doc.add_heading("Podsumowanie", level=1)
    summary = result.get("summary", {})
    summary_table = doc.add_table(rows=1, cols=2)
    summary_table.style = "Table Grid"
    hdr = summary_table.rows[0].cells
    hdr[0].text = "Parametr"
    hdr[1].text = "Wartość"
    for cell in hdr:
        for paragraph in cell.paragraphs:
            for run_obj in paragraph.runs:
                run_obj.bold = True

    def add_row(label: str, value: Any) -> None:
        row = summary_table.add_row().cells
        row[0].text = label
        row[1].text = str(value) if value is not None else "—"

    add_row("Status zbieżności", "Zbieżny" if result.get("converged") else "Niezbieżny")
    add_row("Liczba iteracji", result.get("iterations_count"))
    add_row("Węzeł bilansujący", result.get("slack_bus_id"))
    add_row("Całkowite straty P [MW]", f"{summary.get('total_losses_p_mw', 0):.4g}")
    add_row("Całkowite straty Q [Mvar]", f"{summary.get('total_losses_q_mvar', 0):.4g}")
    add_row("Min. napięcie [pu]", f"{summary.get('min_v_pu', 0):.4g}")
    add_row("Max. napięcie [pu]", f"{summary.get('max_v_pu', 0):.4g}")
    add_row("Elementy z katalogiem", metadata.get("catalog_context_count"))

    doc.add_paragraph()
    doc.add_heading("Kontekst katalogowy", level=1)
    if catalog_context_lines:
        doc.add_paragraph(
            "Format: element_id | typ | katalog | pochodzenie parametrów | materialized_params"
        )
        for line in catalog_context_lines:
            doc.add_paragraph(line)
    else:
        doc.add_paragraph("Brak jawnego kontekstu katalogowego.")

    doc.add_paragraph()
    doc.add_heading("Wywód szczegółowy", level=1)
    if white_box_trace:
        for step in white_box_trace[:12]:
            title = step.get("title") or step.get("key") or "Krok"
            doc.add_paragraph(f"{title}: {json.dumps(step, ensure_ascii=False, sort_keys=True)}")
        if len(white_box_trace) > 12:
            doc.add_paragraph(f"... oraz {len(white_box_trace) - 12} kolejnych kroków")
    else:
        doc.add_paragraph("Brak jawnego śladu obliczeń.")

    doc.add_paragraph()
    doc.add_heading("Wyniki węzłowe (szyny)", level=1)
    bus_results = result.get("bus_results", [])
    if bus_results:
        bus_table = doc.add_table(rows=1, cols=5)
        bus_table.style = "Table Grid"
        header = bus_table.rows[0].cells
        header[0].text = "ID szyny"
        header[1].text = "V [pu]"
        header[2].text = "Kąt [deg]"
        header[3].text = "P_inj [MW]"
        header[4].text = "Q_inj [Mvar]"
        for cell in header:
            for paragraph in cell.paragraphs:
                for run_obj in paragraph.runs:
                    run_obj.bold = True
        for bus in bus_results[:30]:
            row = bus_table.add_row().cells
            row[0].text = str(bus.get("bus_id", "—"))[:16]
            row[1].text = f"{bus.get('v_pu', 0):.4g}"
            row[2].text = f"{bus.get('angle_deg', 0):.2f}"
            row[3].text = f"{bus.get('p_injected_mw', 0):.3g}"
            row[4].text = f"{bus.get('q_injected_mvar', 0):.3g}"
        if len(bus_results) > 30:
            doc.add_paragraph(f"... oraz {len(bus_results) - 30} dodatkowych węzłów")
    else:
        doc.add_paragraph("Brak wyników węzłowych.")

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_stem}_{run.id}.docx"',
        },
    )


def export_run_pdf_response(
    run: CanonicalRun,
    *,
    filename_stem: str,
) -> Response:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
    except ImportError as exc:
        raise ValueError(
            "Eksport PDF wymaga reportlab. Zainstaluj: pip install reportlab",
        ) from exc

    bundle = _require_power_flow_bundle(run)
    result = bundle["result"]
    metadata = bundle["metadata"]
    catalog_context_lines = _catalog_context_lines(bundle)
    white_box_trace = bundle.get("white_box_trace") or []

    buffer = io.BytesIO()
    canvas_obj = canvas.Canvas(buffer, pagesize=A4)
    page_width, page_height = A4
    left_margin = 25 * mm
    top_margin = page_height - 25 * mm
    y = top_margin
    line_height = 5 * mm

    canvas_obj.setFont("Helvetica-Bold", 16)
    title = "Raport rozpływu mocy"
    canvas_obj.drawString(
        (page_width - canvas_obj.stringWidth(title, "Helvetica-Bold", 16)) / 2,
        y,
        title,
    )
    y -= 10 * mm

    canvas_obj.setFont("Helvetica", 10)
    status_text = (
        f"Status: {'Zbieżny' if result.get('converged') else 'Niezbieżny'} | "
        f"Iteracje: {result.get('iterations_count', '—')} | "
        f"Uruchomienie: {str(metadata.get('run_id', '—'))[:8]}..."
    )
    canvas_obj.drawString(left_margin, y, status_text)
    y -= 8 * mm

    canvas_obj.setFont("Helvetica-Bold", 12)
    canvas_obj.drawString(left_margin, y, "Podsumowanie")
    y -= 6 * mm

    canvas_obj.setFont("Helvetica", 10)
    summary = result.get("summary", {})
    summary_lines = [
        f"Węzeł bilansujący: {result.get('slack_bus_id', '—')}",
        f"Całkowite straty P: {summary.get('total_losses_p_mw', 0):.4g} MW",
        f"Całkowite straty Q: {summary.get('total_losses_q_mvar', 0):.4g} Mvar",
        f"Min. napięcie: {summary.get('min_v_pu', 0):.4g} pu",
        f"Max. napięcie: {summary.get('max_v_pu', 0):.4g} pu",
        f"Elementy z katalogiem: {metadata.get('catalog_context_count', 0)}",
    ]
    for line in summary_lines:
        canvas_obj.drawString(left_margin, y, line)
        y -= line_height

    y -= 5 * mm
    canvas_obj.setFont("Helvetica-Bold", 12)
    canvas_obj.drawString(left_margin, y, "Kontekst katalogowy")
    y -= 5 * mm
    canvas_obj.setFont("Helvetica", 8)
    if catalog_context_lines:
        canvas_obj.drawString(
            left_margin,
            y,
            "Format: element_id | typ | katalog | pochodzenie | materialized_params",
        )
        y -= line_height
        for line in catalog_context_lines:
            canvas_obj.drawString(left_margin, y, line[:160])
            y -= line_height
            if y < 30 * mm:
                canvas_obj.showPage()
                y = top_margin
                canvas_obj.setFont("Helvetica", 8)
    else:
        canvas_obj.drawString(left_margin, y, "Brak jawnego kontekstu katalogowego.")
        y -= line_height

    y -= 5 * mm
    canvas_obj.setFont("Helvetica-Bold", 12)
    canvas_obj.drawString(left_margin, y, "Wywód szczegółowy")
    y -= 5 * mm
    canvas_obj.setFont("Helvetica", 8)
    if white_box_trace:
        for step in white_box_trace[:10]:
            title = step.get("title") or step.get("key") or "Krok"
            canvas_obj.drawString(
                left_margin,
                y,
                f"{title}: {json.dumps(step, ensure_ascii=False, sort_keys=True)[:150]}",
            )
            y -= line_height
            if y < 30 * mm:
                canvas_obj.showPage()
                y = top_margin
                canvas_obj.setFont("Helvetica", 8)
        if len(white_box_trace) > 10:
            canvas_obj.drawString(
                left_margin,
                y,
                f"... oraz {len(white_box_trace) - 10} kolejnych kroków",
            )
            y -= line_height
    else:
        canvas_obj.drawString(left_margin, y, "Brak jawnego śladu obliczeń.")
        y -= line_height

    y -= 5 * mm
    canvas_obj.setFont("Helvetica-Bold", 12)
    canvas_obj.drawString(left_margin, y, "Wyniki węzłowe (top 20)")
    y -= 5 * mm

    canvas_obj.setFont("Helvetica", 9)
    for bus in result.get("bus_results", [])[:20]:
        text = (
            f"{str(bus.get('bus_id', '—'))[:12]}: "
            f"V={bus.get('v_pu', 0):.4g} pu, "
            f"kat={bus.get('angle_deg', 0):.2f} deg"
        )
        canvas_obj.drawString(left_margin, y, text)
        y -= line_height
        if y < 30 * mm:
            canvas_obj.showPage()
            y = top_margin

    canvas_obj.save()
    buffer.seek(0)
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_stem}_{run.id}.pdf"',
        },
    )


def export_run_report_docx_response(
    run: CanonicalRun,
    *,
    filename_stem: str,
    report_options: dict[str, Any] | None = None,
) -> Response:
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.shared import Pt
    except ImportError as exc:
        raise ValueError(
            "Eksport DOCX wymaga python-docx. Zainstaluj: pip install python-docx",
        ) from exc

    payload = build_analysis_run_report_payload(run, report_options=report_options)
    options = payload["report_options"]
    limits = _detail_limits(options["detail_level"])
    results_section = payload.get("results", {})

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    heading = doc.add_heading(payload["title"], level=0)
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER

    subtitle = doc.add_paragraph(
        " | ".join(
            [
                f"Profil: {options['profile_label']}",
                f"Poziom: {options['detail_level_label']}",
                f"Zakres: {options['scope_label']}",
                f"Uruchomienie: {str(run.id)[:8]}...",
            ]
        )
    )
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph()
    doc.add_heading("Parametry raportu", level=1)
    options_table = doc.add_table(rows=1, cols=2)
    options_table.style = "Table Grid"
    header = options_table.rows[0].cells
    header[0].text = "Parametr"
    header[1].text = "Wartość"

    def add_pair(label: str, value: Any) -> None:
        row = options_table.add_row().cells
        row[0].text = label
        row[1].text = str(value) if value is not None else "—"

    add_pair("Typ analizy", run.analysis_type)
    add_pair("Status przebiegu", run.status)
    add_pair("Status wyników", run.result_status)
    add_pair("Profil raportu", options["profile_label"])
    add_pair("Poziom szczegółowości", options["detail_level_label"])
    add_pair("Zakres", options["scope_label"])
    add_pair("Sekcje", ", ".join(options["section_labels"]))

    if "summary" in options["sections"]:
        doc.add_paragraph()
        doc.add_heading("Podsumowanie", level=1)
        summary = payload.get("summary", {})
        summary_table = doc.add_table(rows=1, cols=2)
        summary_table.style = "Table Grid"
        summary_header = summary_table.rows[0].cells
        summary_header[0].text = "Pole"
        summary_header[1].text = "Wartość"
        for key, value in summary.items():
            row = summary_table.add_row().cells
            row[0].text = str(key)
            row[1].text = (
                json.dumps(value, ensure_ascii=False)
                if isinstance(value, dict | list)
                else str(value)
            )

    if "results" in options["sections"]:
        doc.add_paragraph()
        doc.add_heading("Wyniki tabelaryczne", level=1)
        for table in results_section.get("index", {}).get("tables", []):
            table_id = table.get("table_id")
            label = table.get("label_pl") or table_id or "Tabela"
            doc.add_heading(str(label), level=2)
            if table_id == "buses":
                rows = (results_section.get("buses", {}) or {}).get("rows", [])[: limits["rows"]]
                for row_data in rows:
                    doc.add_paragraph(
                        " | ".join(
                            [
                                str(row_data.get("name") or row_data.get("bus_id") or "—"),
                                f"U={row_data.get('u_pu') or '—'} pu",
                                f"kąt={row_data.get('angle_deg') or '—'} deg",
                            ]
                        )
                    )
            elif table_id == "branches":
                rows = (results_section.get("branches", {}) or {}).get("rows", [])[: limits["rows"]]
                for row_data in rows:
                    doc.add_paragraph(
                        " | ".join(
                            [
                                str(row_data.get("name") or row_data.get("branch_id") or "—"),
                                f"I={row_data.get('i_a') or '—'} A",
                                f"P={row_data.get('p_mw') or '—'} MW",
                                f"Q={row_data.get('q_mvar') or '—'} Mvar",
                            ]
                        )
                    )
            elif table_id == "short_circuit":
                rows = (results_section.get("short_circuit", {}) or {}).get("rows", [])[
                    : limits["rows"]
                ]
                for row_data in rows:
                    doc.add_paragraph(
                        " | ".join(
                            [
                                str(
                                    row_data.get("target_name") or row_data.get("target_id") or "—"
                                ),
                                f"Ik''={row_data.get('ikss_ka') or '—'} kA",
                                f"ip={row_data.get('ip_ka') or '—'} kA",
                                f"Ith={row_data.get('ith_ka') or '—'} kA",
                            ]
                        )
                    )
            else:
                doc.add_paragraph("Brak danych tabelarycznych dla wybranego zakresu.")

    if "catalog" in options["sections"]:
        doc.add_paragraph()
        doc.add_heading("Kontekst katalogowy", level=1)
        catalog_context = payload.get("catalog_context", [])
        if catalog_context:
            for entry in catalog_context[: limits["catalog_items"]]:
                doc.add_paragraph(
                    " | ".join(
                        [
                            str(entry.get("element_id") or "—"),
                            str(entry.get("element_type") or "—"),
                            _format_catalog_binding(entry),
                            str(
                                entry.get("parameter_source")
                                or entry.get("parameter_origin")
                                or "—"
                            ),
                        ]
                    )
                )
        else:
            doc.add_paragraph("Brak jawnego kontekstu katalogowego.")

    if "trace" in options["sections"]:
        doc.add_paragraph()
        doc.add_heading("Wywód szczegółowy", level=1)
        white_box_trace = (payload.get("trace", {}) or {}).get("white_box_trace", [])
        if white_box_trace:
            for step in white_box_trace[: limits["trace_steps"]]:
                title = step.get("title") or step.get("key") or "Krok"
                doc.add_paragraph(
                    f"{title}: {json.dumps(step, ensure_ascii=False, sort_keys=True)}"
                )
        else:
            doc.add_paragraph("Brak jawnego śladu obliczeń.")

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_stem}_{run.id}.docx"',
        },
    )


def export_run_report_pdf_response(
    run: CanonicalRun,
    *,
    filename_stem: str,
    report_options: dict[str, Any] | None = None,
) -> Response:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
    except ImportError as exc:
        raise ValueError(
            "Eksport PDF wymaga reportlab. Zainstaluj: pip install reportlab",
        ) from exc

    payload = build_analysis_run_report_payload(run, report_options=report_options)
    options = payload["report_options"]
    limits = _detail_limits(options["detail_level"])
    results_section = payload.get("results", {})

    buffer = io.BytesIO()
    canvas_obj = canvas.Canvas(buffer, pagesize=A4)
    page_width, page_height = A4
    left_margin = 25 * mm
    top_margin = page_height - 25 * mm
    bottom_margin = 18 * mm
    y = top_margin
    line_height = 5 * mm

    def ensure_page(required_lines: int = 1) -> None:
        nonlocal y
        if y - (required_lines * line_height) < bottom_margin:
            canvas_obj.showPage()
            y = top_margin

    def draw_line(text: str, *, font: str = "Helvetica", size: int = 9) -> None:
        nonlocal y
        ensure_page(1)
        canvas_obj.setFont(font, size)
        canvas_obj.drawString(left_margin, y, text[:155])
        y -= line_height

    canvas_obj.setFont("Helvetica-Bold", 16)
    canvas_obj.drawString(left_margin, y, payload["title"])
    y -= 8 * mm

    draw_line(
        f"Profil: {options['profile_label']} | Poziom: {options['detail_level_label']} | Zakres: {options['scope_label']}",
        size=10,
    )
    draw_line(
        f"Uruchomienie: {run.id} | Analiza: {run.analysis_type} | Status: {run.status}",
        size=10,
    )
    y -= 2 * mm

    if "summary" in options["sections"]:
        canvas_obj.setFont("Helvetica-Bold", 12)
        canvas_obj.drawString(left_margin, y, "Podsumowanie")
        y -= line_height
        for key, value in (payload.get("summary", {}) or {}).items():
            draw_line(f"{key}: {value}")
        y -= 2 * mm

    if "results" in options["sections"]:
        canvas_obj.setFont("Helvetica-Bold", 12)
        canvas_obj.drawString(left_margin, y, "Wyniki tabelaryczne")
        y -= line_height
        for table in results_section.get("index", {}).get("tables", []):
            draw_line(
                str(table.get("label_pl") or table.get("table_id") or "Tabela"),
                font="Helvetica-Bold",
                size=10,
            )
            if table.get("table_id") == "buses":
                for row_data in (results_section.get("buses", {}) or {}).get("rows", [])[
                    : limits["rows"]
                ]:
                    draw_line(
                        f"{row_data.get('name') or row_data.get('bus_id')}: U={row_data.get('u_pu') or '—'} pu, kąt={row_data.get('angle_deg') or '—'} deg"
                    )
            elif table.get("table_id") == "branches":
                for row_data in (results_section.get("branches", {}) or {}).get("rows", [])[
                    : limits["rows"]
                ]:
                    draw_line(
                        f"{row_data.get('name') or row_data.get('branch_id')}: I={row_data.get('i_a') or '—'} A, P={row_data.get('p_mw') or '—'} MW"
                    )
            elif table.get("table_id") == "short_circuit":
                for row_data in (results_section.get("short_circuit", {}) or {}).get("rows", [])[
                    : limits["rows"]
                ]:
                    draw_line(
                        f"{row_data.get('target_name') or row_data.get('target_id')}: Ik''={row_data.get('ikss_ka') or '—'} kA, ip={row_data.get('ip_ka') or '—'} kA"
                    )
        y -= 2 * mm

    if "catalog" in options["sections"]:
        canvas_obj.setFont("Helvetica-Bold", 12)
        canvas_obj.drawString(left_margin, y, "Kontekst katalogowy")
        y -= line_height
        catalog_context = payload.get("catalog_context", [])
        if catalog_context:
            for entry in catalog_context[: limits["catalog_items"]]:
                draw_line(
                    " | ".join(
                        [
                            str(entry.get("element_id") or "—"),
                            str(entry.get("element_type") or "—"),
                            _format_catalog_binding(entry),
                        ]
                    ),
                    size=8,
                )
        else:
            draw_line("Brak jawnego kontekstu katalogowego.")
        y -= 2 * mm

    if "trace" in options["sections"]:
        canvas_obj.setFont("Helvetica-Bold", 12)
        canvas_obj.drawString(left_margin, y, "Wywód szczegółowy")
        y -= line_height
        white_box_trace = (payload.get("trace", {}) or {}).get("white_box_trace", [])
        if white_box_trace:
            for step in white_box_trace[: limits["trace_steps"]]:
                title = step.get("title") or step.get("key") or "Krok"
                draw_line(
                    f"{title}: {json.dumps(step, ensure_ascii=False, sort_keys=True)[:120]}",
                    size=8,
                )
        else:
            draw_line("Brak jawnego śladu obliczeń.")

    canvas_obj.save()
    buffer.seek(0)
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_stem}_{run.id}.pdf"',
        },
    )


def export_run_trace_jsonl_response(
    run: CanonicalRun,
    *,
    filename_stem: str,
) -> Response:
    lines = _trace_jsonl_lines(build_analysis_run_trace_export_payload(run))
    return Response(
        content="\n".join(lines),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_stem}_{run.id}.jsonl"',
        },
    )


def export_run_trace_pdf_response(
    run: CanonicalRun,
    *,
    filename_stem: str,
) -> Response:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
    except ImportError as exc:
        raise ValueError(
            "Eksport PDF wymaga reportlab. Zainstaluj: pip install reportlab",
        ) from exc

    trace_payload = build_analysis_run_trace_export_payload(run)
    summary = build_trace_summary(trace_payload.get("white_box_trace") or [])
    buffer = io.BytesIO()
    canvas_obj = canvas.Canvas(buffer, pagesize=A4)
    page_width, page_height = A4
    left_margin = 20 * mm
    right_margin = page_width - 20 * mm
    top_margin = page_height - 20 * mm
    bottom_margin = 18 * mm
    y = top_margin

    def ensure_page(required_lines: int = 1, line_height: float = 4.5 * mm) -> None:
        nonlocal y
        if y - (required_lines * line_height) < bottom_margin:
            canvas_obj.showPage()
            y = top_margin

    def draw_wrapped(
        text: str,
        *,
        font_name: str = "Helvetica",
        font_size: int = 9,
        max_chars: int = 110,
        line_height: float = 4.5 * mm,
    ) -> None:
        nonlocal y
        canvas_obj.setFont(font_name, font_size)
        lines = textwrap.wrap(text, width=max_chars) or [text]
        ensure_page(len(lines), line_height)
        for line in lines:
            canvas_obj.drawString(left_margin, y, line)
            y -= line_height

    canvas_obj.setFont("Helvetica-Bold", 15)
    title = "Wywód obliczeń"
    canvas_obj.drawString(
        (page_width - canvas_obj.stringWidth(title, "Helvetica-Bold", 15)) / 2,
        y,
        title,
    )
    y -= 7 * mm

    draw_wrapped(
        f"Uruchomienie: {trace_payload.get('run_id')}", font_name="Helvetica", font_size=10
    )
    draw_wrapped(
        f"Migawka: {trace_payload.get('snapshot_id') or '—'} | Hash wejścia: {trace_payload.get('input_hash') or '—'}",
        font_name="Helvetica",
        font_size=9,
    )
    draw_wrapped(
        f"Liczba kroków: {summary.get('count', 0)} | Fazy: {', '.join(summary.get('phases', []) or []) or '—'}",
        font_name="Helvetica",
        font_size=9,
    )
    y -= 3 * mm

    white_box_trace = trace_payload.get("white_box_trace") or []
    for index, step in enumerate(white_box_trace, start=1):
        ensure_page(6)
        canvas_obj.setFont("Helvetica-Bold", 11)
        heading = step.get("title") or step.get("key") or f"Krok {index}"
        canvas_obj.drawString(left_margin, y, f"{index}. {heading}")
        y -= 5 * mm

        meta = " | ".join(
            [
                f"Faza: {step.get('phase') or '—'}",
                f"Element: {step.get('element_id') or '—'}",
                f"Cel: {step.get('target_id') or '—'}",
            ]
        )
        draw_wrapped(meta, font_name="Helvetica", font_size=8, max_chars=120, line_height=4 * mm)

        if step.get("formula_latex"):
            draw_wrapped(
                f"Wzór: {step.get('formula_latex')}",
                font_name="Helvetica-Oblique",
                font_size=8,
                max_chars=110,
                line_height=4 * mm,
            )
        substitution_text = _trace_step_substitution_text(step)
        if substitution_text:
            draw_wrapped(
                f"Podstawienie: {substitution_text}",
                font_name="Helvetica",
                font_size=8,
                max_chars=110,
                line_height=4 * mm,
            )
        if step.get("result") is not None:
            draw_wrapped(
                f"Wynik: {json.dumps(step.get('result'), ensure_ascii=False, sort_keys=True)}",
                font_name="Helvetica",
                font_size=8,
                max_chars=110,
                line_height=4 * mm,
            )
        if step.get("notes"):
            draw_wrapped(
                f"Uwagi: {step.get('notes')}",
                font_name="Helvetica",
                font_size=8,
                max_chars=110,
                line_height=4 * mm,
            )
        y -= 2 * mm

    ensure_page(2)
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.drawRightString(
        right_margin, bottom_margin - 2 * mm, "Wygenerowano przez MV-DESIGN-PRO"
    )
    canvas_obj.save()
    buffer.seek(0)
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_stem}_{run.id}.pdf"',
        },
    )
