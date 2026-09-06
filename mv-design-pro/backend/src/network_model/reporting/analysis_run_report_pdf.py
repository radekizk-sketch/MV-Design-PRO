"""
Reporting/export layer - PDF report generator for AnalysisRun bundles.

This module exports read-only AnalysisRun report data to PDF format using the
shared reporting dependencies (reportlab) without invoking solvers.
"""

from __future__ import annotations

import json
from importlib.util import find_spec
from io import BytesIO
from typing import Any

from network_model.reporting.czcionki import zarejestruj_czcionki
from network_model.reporting.missing_value import format_wynik

_PDF_AVAILABLE = find_spec("reportlab") is not None

if _PDF_AVAILABLE:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas


def export_analysis_run_to_pdf(bundle: dict[str, Any]) -> bytes:
    if not _PDF_AVAILABLE:
        raise ImportError(
            "PDF export requires reportlab (missing dependency). "
            "Install it with: pip install reportlab"
        )

    output = BytesIO()
    zarejestruj_czcionki()
    c = canvas.Canvas(output, pagesize=A4, invariant=1, pageCompression=0)
    page_width, page_height = A4

    left_margin = 20 * mm
    right_margin = page_width - 20 * mm
    top_margin = page_height - 20 * mm
    bottom_margin = 20 * mm
    line_height = 5 * mm
    section_spacing = 6 * mm

    y = top_margin

    def check_page_break(needed_height: float = 20 * mm) -> None:
        nonlocal y
        if y - needed_height < bottom_margin:
            c.showPage()
            y = top_margin

    def draw_text(text: str, font_size: int = 10, bold: bool = False) -> None:
        nonlocal y
        font_name = "DejaVuSans-Bold" if bold else "DejaVuSans"
        c.setFont(font_name, font_size)
        c.drawString(left_margin, y, text)
        y -= line_height

    def draw_wrapped(text: str, font_size: int = 9) -> None:
        nonlocal y
        c.setFont("DejaVuSans", font_size)
        max_width = right_margin - left_margin
        words = str(text).split()
        line = ""
        for word in words:
            test_line = f"{line} {word}".strip()
            if c.stringWidth(test_line, "DejaVuSans", font_size) <= max_width:
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

    title = "Raport z uruchomienia AnalysisRun"
    c.setFont("DejaVuSans-Bold", 14)
    c.drawString(left_margin, y, title)
    y -= section_spacing

    draw_text("A. Nagłówek", font_size=12, bold=True)
    _draw_header_block(c, bundle, left_margin, right_margin, line_height, y)
    y = _advance_y(c, bundle, left_margin, right_margin, line_height, y)

    draw_text("B. Input snapshot", font_size=12, bold=True)
    run = bundle.get("run", {})
    draw_text(f"Input hash: {run.get('input_hash') or '—'}")
    snapshot = bundle.get("input_snapshot", {})
    for line in _pretty_json(snapshot).splitlines():
        draw_wrapped(line)
    y -= section_spacing

    check_page_break(25 * mm)
    draw_text("C. Result summary", font_size=12, bold=True)
    summary = bundle.get("result_summary", {})
    if summary:
        for key in sorted(summary.keys()):
            label = _label_for_summary_key(key)
            draw_wrapped(f"{label}: {_format_value(summary.get(key))}")
    else:
        draw_text("Brak danych.")
    y -= section_spacing

    check_page_break(25 * mm)
    draw_text("D. White-box trace", font_size=12, bold=True)
    steps = bundle.get("white_box_trace", [])
    if not steps:
        draw_text("Brak śladu obliczeń.")
    else:
        for step in steps:
            key = step.get("key") or ""
            title = step.get("title") or ""
            header = key if not title else f"{key}: {title}"
            draw_text(header, bold=True)
            if step.get("severity") is not None:
                draw_wrapped(f"Severity: {step.get('severity')}")
            if step.get("notes") is not None:
                draw_wrapped(f"Notes: {step.get('notes')}")
            if "metrics" in step:
                draw_wrapped("Metrics:")
                draw_wrapped(_truncate_json(step.get("metrics")))
            if "data" in step:
                draw_wrapped("Data:")
                draw_wrapped(_truncate_json(step.get("data")))
            y -= 2 * mm
    y -= section_spacing

    check_page_break(25 * mm)
    draw_text("E. Wyniki", font_size=12, bold=True)
    results = bundle.get("results", [])
    if not results:
        draw_text("Brak zapisanych wyników.")
    else:
        for result in results:
            draw_wrapped(
                f"Typ: {result.get('result_type') or '—'} | "
                f"Utworzono: {result.get('created_at') or '—'}"
            )
            draw_wrapped(f"Rozmiar payloadu: {result.get('payload_size_bytes') or 0} B")
            draw_wrapped(f"Kluczowe parametry: {_format_value(result.get('payload_summary'))}")
            y -= 2 * mm
    y -= section_spacing

    check_page_break(25 * mm)
    draw_text("F. SLD overlay payload (JSON)", font_size=12, bold=True)
    overlay = bundle.get("overlay")
    if not overlay:
        draw_text("Brak danych SLD overlay.")
    else:
        diagram = overlay.get("diagram", {})
        summary = overlay.get("summary", {})
        draw_wrapped(f"Diagram: {diagram.get('name') or '—'} ({diagram.get('id') or '—'})")
        draw_wrapped(
            f"Nodes: {format_wynik(summary.get('node_count'))} | "
            f"Branches: {format_wynik(summary.get('branch_count'))}"
        )
        draw_wrapped("Skrócony JSON:")
        for line in _truncate_json(overlay.get("payload", {})).splitlines():
            draw_wrapped(line)

    overlay_payload = overlay.get("payload") if overlay else None
    if overlay_payload is not None:
        check_page_break(30 * mm)
        draw_text("Aneks: pełny SLD overlay payload", font_size=12, bold=True)
        for line in _pretty_json(overlay_payload).splitlines():
            draw_wrapped(line)

    c.save()
    return output.getvalue()


def _draw_header_block(
    c: canvas.Canvas,
    bundle: dict[str, Any],
    left_margin: float,
    right_margin: float,
    line_height: float,
    y: float,
) -> None:
    c.setFont("DejaVuSans", 10)
    project = bundle.get("project", {})
    study_case = bundle.get("study_case") or bundle.get("operating_case", {})
    run = bundle.get("run", {})
    items = [
        ("Projekt", project.get("name")),
        ("Project ID", project.get("id")),
        ("Przypadek obliczeniowy", study_case.get("name")),
        ("StudyCase ID", study_case.get("id")),
        ("AnalysisRun ID", run.get("id")),
        ("Deterministic ID", run.get("deterministic_id")),
        ("Analysis type", run.get("analysis_type")),
        ("Status", run.get("status")),
        ("Created at", run.get("created_at")),
        ("Started at", run.get("started_at")),
        ("Finished at", run.get("finished_at")),
        ("Duration [s]", _format_value(run.get("duration_seconds"))),
        ("Queue time [s]", _format_value(run.get("queue_seconds"))),
    ]
    current_y = y
    for label, value in items:
        c.drawString(left_margin, current_y, f"{label}: {value or '—'}")
        current_y -= line_height


def _advance_y(
    c: canvas.Canvas,
    bundle: dict[str, Any],
    left_margin: float,
    right_margin: float,
    line_height: float,
    y: float,
) -> float:
    project = bundle.get("project", {})
    study_case = bundle.get("study_case") or bundle.get("operating_case", {})
    run = bundle.get("run", {})
    items = [
        project.get("name"),
        project.get("id"),
        study_case.get("name"),
        study_case.get("id"),
        run.get("id"),
        run.get("deterministic_id"),
        run.get("analysis_type"),
        run.get("status"),
        run.get("created_at"),
        run.get("started_at"),
        run.get("finished_at"),
        run.get("duration_seconds"),
        run.get("queue_seconds"),
    ]
    return y - line_height * len(items) - 4 * mm


def _format_value(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "Tak" if value else "Nie"
    if isinstance(value, float):
        return f"{value:.6g}"
    if isinstance(value, dict | list):
        return _truncate_json(value)
    return str(value)


def _pretty_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)


def _truncate_json(value: Any, max_chars: int = 1200) -> str:
    payload = _pretty_json(value)
    if len(payload) <= max_chars:
        return payload
    return f"{payload[:max_chars]}\n... (skrócono)"


def _label_for_summary_key(key: str) -> str:
    if key == "connection_node_id":
        return "BoundaryNode – węzeł przyłączenia"
    return key
