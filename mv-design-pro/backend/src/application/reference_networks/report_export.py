"""
Report export — JSON i PDF dla ValidationReport.

PDF generuje z reportlab (już zależność backendu).
JSON to standard json.dumps(report.to_dict()).
"""

from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Any

from application.reference_networks.comparator import ValidationReport
from network_model.reporting.czcionki import ustaw_czcionki_stylow, zarejestruj_czcionki


def to_json(report: ValidationReport, path: Path | str | None = None) -> str:
    """Serialize ValidationReport to JSON string. Optionally write to file."""
    data = report.to_dict()
    json_str = json.dumps(data, indent=2, ensure_ascii=False)
    if path is not None:
        Path(path).write_text(json_str, encoding="utf-8")
    return json_str


def to_pdf_bytes(report: ValidationReport) -> bytes:
    """Generate PDF bytes from ValidationReport (reportlab)."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError as exc:
        raise ImportError("reportlab is required for PDF export") from exc

    buf = BytesIO()
    zarejestruj_czcionki()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        title=f"Raport walidacji - {report.network_id}",
        invariant=1,
        pageCompression=0,
    )
    styles = getSampleStyleSheet()
    ustaw_czcionki_stylow(styles)
    story: list[Any] = []

    # Title block
    title_style = ParagraphStyle(
        "TitlePL",
        parent=styles["Heading1"],
        fontSize=18,
        spaceAfter=12,
    )
    story.append(Paragraph("Raport walidacji sieci referencyjnej", title_style))
    story.append(Paragraph(report.network_name_pl, styles["Heading2"]))
    story.append(Spacer(1, 12))

    # Source
    story.append(Paragraph(f"<b>Identyfikator:</b> {report.network_id}", styles["BodyText"]))
    story.append(Paragraph(f"<b>Źródło:</b> {report.source}", styles["BodyText"]))
    story.append(Paragraph(f"<b>Wersja solvera:</b> {report.solver_version}", styles["BodyText"]))
    story.append(Spacer(1, 12))

    # Overall verdict — coloured box
    verdict_color = (
        colors.HexColor("#2ea043")
        if report.overall_status == "PASS"
        else colors.HexColor("#cf222e")
    )
    verdict_style = ParagraphStyle(
        "Verdict",
        parent=styles["Heading1"],
        textColor=verdict_color,
        fontSize=24,
        alignment=1,  # center
    )
    story.append(Paragraph(f"Wynik: {report.overall_status}", verdict_style))
    story.append(Spacer(1, 20))

    # Summary table
    summary_data = [
        ["Kategoria", "PASS", "FAIL"],
        ["Rozpływ mocy (węzły)", str(report.pf_pass_count), str(report.pf_fail_count)],
        [
            "Rozpływ mocy (gałęzie)",
            str(report.pf_branch_pass_count),
            str(report.pf_branch_fail_count),
        ],
        ["Zwarcia", str(report.sc_pass_count), str(report.sc_fail_count)],
    ]
    summary_table = Table(summary_data, hAlign="LEFT")
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0d1117")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.gray),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 18))

    # Per-element details
    if report.pf_comparisons:
        story.append(Paragraph("Rozpływ mocy - napięcia węzłów", styles["Heading3"]))
        data = [["Element", "Wielkość", "Otrzymano", "Oczekiwano", "Δ rel. [%]", "Status"]]
        for c in report.pf_comparisons:
            data.append(
                [
                    c.element_id,
                    c.quantity,
                    f"{c.actual:.4f}",
                    f"{c.expected:.4f}",
                    f"{c.rel_diff * 100:.3f}",
                    c.status,
                ]
            )
        t = Table(data, hAlign="LEFT")
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0d1117")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.gray),
                ]
            )
        )
        story.append(t)
        story.append(Spacer(1, 12))

    # Footnote
    story.append(Spacer(1, 24))
    story.append(
        Paragraph(
            "<i>Wygenerowano przez MV-DESIGN-PRO Reference Network Validation. "
            "Wartości oczekiwane pochodzą z publikowanej literatury — zobacz docs/reference-networks/source-citations.md.</i>",
            styles["Italic"],
        )
    )

    doc.build(story)
    return buf.getvalue()


def to_pdf(report: ValidationReport, path: Path | str) -> None:
    """Generate PDF and write to disk."""
    pdf_bytes = to_pdf_bytes(report)
    Path(path).write_bytes(pdf_bytes)
