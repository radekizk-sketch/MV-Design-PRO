"""
FIX-12: Protection Coordination PDF Report Generator

Creates human-readable engineering report with:
- Summary with overall verdict
- Device settings table
- Sensitivity checks table
- Selectivity checks table
- Overload checks table
- TCC reference (page numbers if multi-page)

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Only formatting, no physics calculations
- 100% Polish labels
- UTF-8 encoding
- DETERMINISTIC: invariant mode for binary reproducibility
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

# Check for reportlab availability at import time
try:
    from reportlab import rl_config
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    _PDF_AVAILABLE = True
except ImportError:
    _PDF_AVAILABLE = False
    rl_config = None  # type: ignore


# =============================================================================
# POLISH LABELS
# =============================================================================

VERDICT_COLORS = {
    "PASS": "#16a34a",  # green
    "MARGINAL": "#d97706",  # amber
    "FAIL": "#dc2626",  # red
    "ERROR": "#6b7280",  # gray
}

VERDICT_LABELS_PL = {
    "PASS": "Prawidłowa",
    "MARGINAL": "Margines niski",
    "FAIL": "Nieskoordynowane",
    "ERROR": "Błąd analizy",
}


def _format_value(value: Any) -> str:
    """Format a value for display in the report."""
    if value is None:
        return "—"
    if isinstance(value, float):
        if value == float("inf") or value > 900:
            return "∞"
        return f"{value:.3f}"
    if isinstance(value, bool):
        return "Tak" if value else "Nie"
    return str(value)


def export_protection_coordination_to_pdf(
    result: dict[str, Any],
    path: str | Path,
    *,
    title: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Path:
    """
    Export protection coordination result to PDF.

    Args:
        result: Coordination analysis result dict
        path: Target file path
        title: Custom report title (default: "Raport koordynacji zabezpieczeń")
        metadata: Optional metadata (project_name, created_at, etc.)

    Returns:
        Path to the written PDF file

    Raises:
        ImportError: If reportlab is not installed
    """
    if not _PDF_AVAILABLE:
        raise ImportError("PDF export requires reportlab. Install with: pip install reportlab")

    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Enable deterministic PDF generation
    rl_config.invariant = 1

    # Create PDF canvas with invariant mode
    c = canvas.Canvas(str(output_path), pagesize=A4, invariant=1, pageCompression=0)

    # Set fixed metadata for determinism
    c.setCreator("MV-DESIGN-PRO")
    c.setAuthor("MV-DESIGN-PRO")
    c.setTitle("Raport koordynacji zabezpieczeń nadprądowych")
    c.setSubject("Raport deterministyczny — analiza koordynacji")

    page_width, page_height = A4

    # Margins and layout
    left_margin = 25 * mm
    page_width - 25 * mm
    top_margin = page_height - 25 * mm
    bottom_margin = 25 * mm
    line_height = 5 * mm
    section_spacing = 8 * mm

    y = top_margin

    def check_page_break(needed_height: float = 20 * mm) -> float:
        """Check if page break is needed."""
        nonlocal y
        if y - needed_height < bottom_margin:
            c.showPage()
            return top_margin
        return y

    def draw_text(text: str, x: float, font_size: int = 10, bold: bool = False) -> None:
        """Draw text at current y position."""
        nonlocal y
        font_name = "Helvetica-Bold" if bold else "Helvetica"
        c.setFont(font_name, font_size)
        c.drawString(x, y, text)
        y -= line_height

    def draw_table_row(
        values: list[str],
        col_widths: list[float],
        x: float,
        font_size: int = 9,
        bold: bool = False,
        colors: list[str] | None = None,
    ) -> None:
        """Draw a table row with optional column colors."""
        nonlocal y
        font_name = "Helvetica-Bold" if bold else "Helvetica"
        current_x = x
        for i, val in enumerate(values):
            text = str(val)[:25]  # Truncate long text
            if colors and i < len(colors) and colors[i]:
                c.setFillColor(HexColor(colors[i]))
            else:
                c.setFillColor(HexColor("#000000"))
            c.setFont(font_name, font_size)
            c.drawString(current_x, y, text)
            current_x += col_widths[i]
        c.setFillColor(HexColor("#000000"))  # Reset color
        y -= line_height

    def draw_verdict_badge(verdict: str, x: float, y_pos: float) -> None:
        """Draw a colored verdict badge."""
        color = VERDICT_COLORS.get(verdict, "#6b7280")
        label = VERDICT_LABELS_PL.get(verdict, verdict)

        # Draw background rectangle
        c.setFillColor(HexColor(color))
        c.roundRect(x, y_pos - 2 * mm, 30 * mm, 6 * mm, 2 * mm, fill=1, stroke=0)

        # Draw text
        c.setFillColor(HexColor("#ffffff"))
        c.setFont("Helvetica-Bold", 9)
        c.drawString(x + 2 * mm, y_pos, label)
        c.setFillColor(HexColor("#000000"))

    # ==========================================================================
    # 1) TITLE
    # ==========================================================================
    report_title = title if title else "Raport koordynacji zabezpieczeń nadprądowych"
    c.setFont("Helvetica-Bold", 16)
    title_width = c.stringWidth(report_title, "Helvetica-Bold", 16)
    c.drawString((page_width - title_width) / 2, y, report_title)
    y -= 12 * mm

    # ==========================================================================
    # 2) OVERALL VERDICT
    # ==========================================================================
    overall_verdict = result.get("overall_verdict", "ERROR")
    verdict_pl = result.get("summary", {}).get(
        "overall_verdict_pl", VERDICT_LABELS_PL.get(overall_verdict, overall_verdict)
    )

    c.setFont("Helvetica", 12)
    c.drawString(left_margin, y, "Wynik analizy:")
    draw_verdict_badge(overall_verdict, left_margin + 35 * mm, y)
    y -= 8 * mm

    # Metadata
    if metadata:
        meta_parts = []
        if metadata.get("project_name"):
            meta_parts.append(f"Projekt: {metadata['project_name']}")
        if metadata.get("created_at"):
            meta_parts.append(f"Data: {metadata['created_at'][:19]}")
        if meta_parts:
            c.setFont("Helvetica", 9)
            c.drawString(left_margin, y, " | ".join(meta_parts))
            y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 3) SUMMARY
    # ==========================================================================
    y = check_page_break(40 * mm)
    draw_text("Podsumowanie", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    summary = result.get("summary", {})
    summary_fields = [
        ("Liczba urządzeń:", str(summary.get("total_devices", 0))),
        ("Łączna liczba sprawdzeń:", str(summary.get("total_checks", 0))),
        ("Czułość - prawidłowe:", str(summary.get("sensitivity", {}).get("pass", 0))),
        ("Czułość - nieprawidłowe:", str(summary.get("sensitivity", {}).get("fail", 0))),
        ("Selektywność - prawidłowe:", str(summary.get("selectivity", {}).get("pass", 0))),
        ("Selektywność - nieprawidłowe:", str(summary.get("selectivity", {}).get("fail", 0))),
        ("Przeciążalność - prawidłowe:", str(summary.get("overload", {}).get("pass", 0))),
        ("Przeciążalność - nieprawidłowe:", str(summary.get("overload", {}).get("fail", 0))),
    ]

    label_x = left_margin
    value_x = left_margin + 55 * mm

    for label, value in summary_fields:
        y = check_page_break(line_height)
        c.setFont("Helvetica", 10)
        c.drawString(label_x, y, label)
        c.drawString(value_x, y, value)
        y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 4) DEVICE SETTINGS TABLE
    # ==========================================================================
    y = check_page_break(30 * mm)
    draw_text("Tabela urządzeń i nastaw", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    devices = result.get("devices", [])
    if devices:
        # Sort by device name for deterministic order
        sorted_devices = sorted(devices, key=lambda d: d.get("name", d.get("id", "")))
        dev_cols = [35 * mm, 25 * mm, 25 * mm, 25 * mm, 25 * mm]
        draw_table_row(
            ["Nazwa", "Typ", "I_pickup [A]", "TMS", "Krzywa"], dev_cols, left_margin, bold=True
        )
        y -= 2 * mm

        for dev in sorted_devices:
            y = check_page_break(line_height)
            settings = dev.get("settings", {})
            stage_51 = settings.get("stage_51", {})
            curve_settings = stage_51.get("curve_settings", {})

            draw_table_row(
                [
                    dev.get("name", "—")[:12],
                    dev.get("device_type", "—")[:10],
                    _format_value(stage_51.get("pickup_current_a")),
                    _format_value(curve_settings.get("time_multiplier")),
                    curve_settings.get("variant", "—"),
                ],
                dev_cols,
                left_margin,
            )
    else:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(left_margin, y, "Brak urządzeń")
        y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 5) SENSITIVITY CHECKS
    # ==========================================================================
    y = check_page_break(30 * mm)
    draw_text("Sprawdzenie czułości (I_min / I_pickup)", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    sensitivity_checks = result.get("sensitivity_checks", [])
    if sensitivity_checks:
        sens_cols = [35 * mm, 25 * mm, 25 * mm, 25 * mm, 35 * mm]
        draw_table_row(
            ["Urządzenie", "I_min [A]", "I_pickup [A]", "Margines [%]", "Werdykt"],
            sens_cols,
            left_margin,
            bold=True,
        )
        y -= 2 * mm

        for check in sensitivity_checks:
            y = check_page_break(line_height)
            verdict = check.get("verdict", "ERROR")
            verdict_pl = VERDICT_LABELS_PL.get(verdict, verdict)
            verdict_color = VERDICT_COLORS.get(verdict, "#000000")

            draw_table_row(
                [
                    check.get("device_id", "—")[:8] + "...",
                    _format_value(check.get("i_fault_min_a")),
                    _format_value(check.get("i_pickup_a")),
                    _format_value(check.get("margin_percent")),
                    verdict_pl,
                ],
                sens_cols,
                left_margin,
                colors=[None, None, None, None, verdict_color],
            )
    else:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(left_margin, y, "Brak danych")
        y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 6) SELECTIVITY CHECKS
    # ==========================================================================
    y = check_page_break(30 * mm)
    draw_text("Sprawdzenie selektywności czasowej (Δt)", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    selectivity_checks = result.get("selectivity_checks", [])
    if selectivity_checks:
        sel_cols = [30 * mm, 30 * mm, 22 * mm, 22 * mm, 22 * mm, 25 * mm]
        draw_table_row(
            ["Podrzędne", "Nadrzędne", "t_pod [s]", "t_nad [s]", "Δt [s]", "Werdykt"],
            sel_cols,
            left_margin,
            bold=True,
        )
        y -= 2 * mm

        for check in selectivity_checks:
            y = check_page_break(line_height)
            verdict = check.get("verdict", "ERROR")
            verdict_pl = VERDICT_LABELS_PL.get(verdict, verdict)
            verdict_color = VERDICT_COLORS.get(verdict, "#000000")

            draw_table_row(
                [
                    check.get("downstream_device_id", "—")[:8] + "...",
                    check.get("upstream_device_id", "—")[:8] + "...",
                    _format_value(check.get("t_downstream_s")),
                    _format_value(check.get("t_upstream_s")),
                    _format_value(check.get("margin_s")),
                    verdict_pl,
                ],
                sel_cols,
                left_margin,
                colors=[None, None, None, None, None, verdict_color],
            )
    else:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(left_margin, y, "Brak danych (wymaga min. 2 urządzeń)")
        y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 7) OVERLOAD CHECKS
    # ==========================================================================
    y = check_page_break(30 * mm)
    draw_text(
        "Sprawdzenie przeciążalności (I_pickup / I_rob)", left_margin, font_size=14, bold=True
    )
    y -= 3 * mm

    overload_checks = result.get("overload_checks", [])
    if overload_checks:
        ovl_cols = [35 * mm, 25 * mm, 25 * mm, 25 * mm, 35 * mm]
        draw_table_row(
            ["Urządzenie", "I_rob [A]", "I_pickup [A]", "Margines [%]", "Werdykt"],
            ovl_cols,
            left_margin,
            bold=True,
        )
        y -= 2 * mm

        for check in overload_checks:
            y = check_page_break(line_height)
            verdict = check.get("verdict", "ERROR")
            verdict_pl = VERDICT_LABELS_PL.get(verdict, verdict)
            verdict_color = VERDICT_COLORS.get(verdict, "#000000")

            draw_table_row(
                [
                    check.get("device_id", "—")[:8] + "...",
                    _format_value(check.get("i_operating_a")),
                    _format_value(check.get("i_pickup_a")),
                    _format_value(check.get("margin_percent")),
                    verdict_pl,
                ],
                ovl_cols,
                left_margin,
                colors=[None, None, None, None, verdict_color],
            )
    else:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(left_margin, y, "Brak danych")
        y -= line_height

    y -= section_spacing

    # ==========================================================================
    # 8) TCC CURVES INFO
    # ==========================================================================
    y = check_page_break(30 * mm)
    draw_text("Krzywe czasowo-prądowe (TCC)", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    tcc_curves = result.get("tcc_curves", [])
    if tcc_curves:
        tcc_cols = [40 * mm, 30 * mm, 30 * mm, 30 * mm]
        draw_table_row(
            ["Urządzenie", "Typ krzywej", "I_pickup [A]", "TMS"], tcc_cols, left_margin, bold=True
        )
        y -= 2 * mm

        for curve in tcc_curves:
            y = check_page_break(line_height)
            draw_table_row(
                [
                    curve.get("device_name", "—")[:20],
                    curve.get("curve_type", "—"),
                    _format_value(curve.get("pickup_current_a")),
                    _format_value(curve.get("time_multiplier")),
                ],
                tcc_cols,
                left_margin,
            )

        y -= 3 * mm
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(left_margin, y, "Wykres TCC dostępny w eksporcie interaktywnym")
        y -= line_height
    else:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(left_margin, y, "Brak krzywych TCC")
        y -= line_height

    # ==========================================================================
    # 9) FOOTER
    # ==========================================================================
    y = check_page_break(20 * mm)
    y -= section_spacing
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#6b7280"))
    c.drawString(left_margin, y, f"Run ID: {result.get('run_id', '—')}")
    c.drawString(left_margin, y - 4 * mm, f"Wygenerowano: {result.get('created_at', '—')[:19]}")
    c.setFillColor(HexColor("#000000"))

    c.save()
    return output_path
