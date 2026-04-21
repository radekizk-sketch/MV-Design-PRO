"""
P20d: Reporting/export layer - PDF report generator for PowerFlowResult.

This module provides functions to export Power Flow calculation results
to PDF format. It uses the stable Result API contract without modifying
any solver logic.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: No physics calculations, only formatting
- 100% Polish labels
- UTF-8 encoding
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from network_model.solvers.power_flow_result import PowerFlowResultV1
    from network_model.solvers.power_flow_trace import PowerFlowTrace

# Check for reportlab availability at import time
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    _PDF_AVAILABLE = True
except ImportError:
    _PDF_AVAILABLE = False


def _format_value(value: Any) -> str:
    """Format a value for display in the report."""
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.6g}"
    if isinstance(value, bool):
        return "Tak" if value else "Nie"
    if isinstance(value, list):
        return f"[{len(value)} elementow]"
    return str(value)


def export_power_flow_result_to_pdf(
    result: PowerFlowResultV1,
    path: str | Path,
    *,
    trace: PowerFlowTrace | None = None,
    metadata: dict[str, Any] | None = None,
    title: str | None = None,
    include_trace: bool = True,
) -> Path:
    """
    Export a single PowerFlowResultV1 to a PDF file.

    Creates a human-readable engineering report with:
    - Title page/header with run parameters
    - Summary section with key metrics
    - Bus results table
    - Branch results table
    - Trace section with Newton-Raphson iterations (optional)

    Args:
        result: The PowerFlowResultV1 instance to export.
        path: Target file path (str or Path). Parent directories are created
              if they do not exist.
        trace: Optional PowerFlowTrace to include as trace section.
        metadata: Optional metadata dict (project_name, case_name, run_id, etc.).
        title: Custom report title. Defaults to "Raport rozplywu mocy".
        include_trace: If True, include the trace section. Defaults to True.

    Returns:
        Path to the written PDF file.

    Raises:
        ImportError: If reportlab is not installed in the environment.
        ValueError: If result.to_dict() does not return a dict.
    """
    if not _PDF_AVAILABLE:
        raise ImportError(
            "PDF export requires reportlab (missing dependency). "
            "Install it with: pip install reportlab"
        )

    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Validate that to_dict() returns a dict
    data = result.to_dict()
    if not isinstance(data, dict):
        raise ValueError(f"result.to_dict() must return a dict, got {type(data).__name__}")

    # Create PDF canvas
    c = canvas.Canvas(str(output_path), pagesize=A4)
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
        """Check if page break is needed and create new page if so."""
        nonlocal y
        if y - needed_height < bottom_margin:
            c.showPage()
            return top_margin
        return y

    def draw_text(text: str, x: float, font_size: int = 10, bold: bool = False) -> None:
        """Draw text at current y position and move y down."""
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
    ) -> None:
        """Draw a simple table row."""
        nonlocal y
        font_name = "Helvetica-Bold" if bold else "Helvetica"
        c.setFont(font_name, font_size)
        current_x = x
        for i, val in enumerate(values):
            text = str(val)[:20]  # Truncate long text
            c.drawString(current_x, y, text)
            current_x += col_widths[i]
        y -= line_height

    # 1) Title
    report_title = title if title else "Raport rozplywu mocy"
    c.setFont("Helvetica-Bold", 16)
    title_width = c.stringWidth(report_title, "Helvetica-Bold", 16)
    c.drawString((page_width - title_width) / 2, y, report_title)
    y -= 10 * mm

    # 2) Parameters line
    c.setFont("Helvetica", 10)
    params = [
        f"Status: {'Zbiezny' if data.get('converged') else 'Niezbiezny'}",
        f"Iteracje: {data.get('iterations_count', '—')}",
        f"Tolerancja: {_format_value(data.get('tolerance_used'))}",
        f"Moc bazowa: {data.get('base_mva', 100)} MVA",
    ]
    params_text = " | ".join(params)
    params_width = c.stringWidth(params_text, "Helvetica", 10)
    c.drawString((page_width - params_width) / 2, y, params_text)
    y -= line_height

    # Metadata if provided
    if metadata:
        meta_parts = []
        if metadata.get("project_name"):
            meta_parts.append(f"Projekt: {metadata['project_name']}")
        if metadata.get("run_id"):
            meta_parts.append(f"Run: {metadata['run_id'][:8]}...")
        if metadata.get("created_at"):
            meta_parts.append(f"Data: {metadata['created_at']}")
        if meta_parts:
            meta_text = " | ".join(meta_parts)
            c.drawString(left_margin, y, meta_text)
            y -= line_height

    y -= section_spacing

    # 3) Summary section
    y = check_page_break(40 * mm)
    draw_text("Podsumowanie", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    summary = data.get("summary", {})
    summary_fields = [
        ("Status zbieznosci:", "Zbiezny" if data.get("converged") else "Niezbiezny"),
        ("Wezel bilansujacy:", str(data.get("slack_bus_id", "—"))[:20]),
        ("Calkowite straty P:", f"{_format_value(summary.get('total_losses_p_mw'))} MW"),
        ("Calkowite straty Q:", f"{_format_value(summary.get('total_losses_q_mvar'))} Mvar"),
        ("Min. napiecie:", f"{_format_value(summary.get('min_v_pu'))} pu"),
        ("Max. napiecie:", f"{_format_value(summary.get('max_v_pu'))} pu"),
        ("Moc czynna slack:", f"{_format_value(summary.get('slack_p_mw'))} MW"),
        ("Moc bierna slack:", f"{_format_value(summary.get('slack_q_mvar'))} Mvar"),
    ]

    label_x = left_margin
    value_x = left_margin + 50 * mm

    for label, value in summary_fields:
        y = check_page_break(line_height)
        c.setFont("Helvetica", 10)
        c.drawString(label_x, y, label)
        c.drawString(value_x, y, value)
        y -= line_height

    y -= section_spacing

    # 4) Bus results section
    y = check_page_break(30 * mm)
    draw_text("Wyniki wezlowe (szyny)", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    bus_results = data.get("bus_results", [])
    if bus_results:
        # Header
        bus_cols = [35 * mm, 25 * mm, 25 * mm, 30 * mm, 30 * mm]
        draw_table_row(
            ["ID szyny", "V [pu]", "Kat [deg]", "P_inj [MW]", "Q_inj [Mvar]"],
            bus_cols,
            left_margin,
            bold=True,
        )
        y -= 2 * mm

        # Data rows (limit to 30 for readability)
        for bus in bus_results[:30]:
            y = check_page_break(line_height)
            draw_table_row(
                [
                    str(bus.get("bus_id", "—"))[:15],
                    _format_value(bus.get("v_pu")),
                    _format_value(bus.get("angle_deg")),
                    _format_value(bus.get("p_injected_mw")),
                    _format_value(bus.get("q_injected_mvar")),
                ],
                bus_cols,
                left_margin,
            )

        if len(bus_results) > 30:
            y = check_page_break(line_height)
            c.setFont("Helvetica-Oblique", 9)
            c.drawString(left_margin, y, f"... oraz {len(bus_results) - 30} dodatkowych wezlow")
            y -= line_height
    else:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(left_margin, y, "Brak wynikow wezlowych.")
        y -= line_height

    y -= section_spacing

    # 5) Branch results section
    y = check_page_break(30 * mm)
    draw_text("Wyniki galeziowe", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    branch_results = data.get("branch_results", [])
    if branch_results:
        # Header
        branch_cols = [35 * mm, 28 * mm, 28 * mm, 28 * mm, 28 * mm]
        draw_table_row(
            ["ID galezi", "P_from [MW]", "Q_from [Mvar]", "Straty P", "Straty Q"],
            branch_cols,
            left_margin,
            bold=True,
        )
        y -= 2 * mm

        # Data rows (limit to 30)
        for branch in branch_results[:30]:
            y = check_page_break(line_height)
            draw_table_row(
                [
                    str(branch.get("branch_id", "—"))[:15],
                    _format_value(branch.get("p_from_mw")),
                    _format_value(branch.get("q_from_mvar")),
                    _format_value(branch.get("losses_p_mw")),
                    _format_value(branch.get("losses_q_mvar")),
                ],
                branch_cols,
                left_margin,
            )

        if len(branch_results) > 30:
            y = check_page_break(line_height)
            c.setFont("Helvetica-Oblique", 9)
            c.drawString(left_margin, y, f"... oraz {len(branch_results) - 30} dodatkowych galezi")
            y -= line_height
    else:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(left_margin, y, "Brak wynikow galeziowych.")
        y -= line_height

    y -= section_spacing

    # 6) Trace section (optional)
    if include_trace and trace is not None:
        y = check_page_break(40 * mm)
        draw_text("Slad obliczen (Newton-Raphson)", left_margin, font_size=14, bold=True)
        y -= 3 * mm

        trace_data = trace.to_dict()

        # Trace metadata
        trace_fields = [
            ("Wersja solvera:", trace_data.get("solver_version", "—")),
            ("Hash wejscia:", str(trace_data.get("input_hash", "—"))[:16] + "..."),
            ("Metoda startu:", trace_data.get("init_method", "—")),
            ("Wynik:", "Zbiezny" if trace_data.get("converged") else "Niezbiezny"),
            ("Wykonane iteracje:", str(trace_data.get("final_iterations_count", "—"))),
        ]

        for label, value in trace_fields:
            y = check_page_break(line_height)
            c.setFont("Helvetica", 10)
            c.drawString(label_x, y, label)
            c.drawString(value_x, y, value)
            y -= line_height

        y -= 5 * mm

        # Iteration table
        iterations = trace_data.get("iterations", [])
        if iterations:
            draw_text("Iteracje:", left_margin, font_size=11, bold=True)
            y -= 2 * mm

            iter_cols = [20 * mm, 40 * mm, 40 * mm, 40 * mm]
            draw_table_row(
                ["k", "Norma mismatch", "Max mismatch [pu]", "Status"],
                iter_cols,
                left_margin,
                bold=True,
            )
            y -= 2 * mm

            for it in iterations:
                y = check_page_break(line_height)
                draw_table_row(
                    [
                        str(it.get("k", "—")),
                        f"{it.get('norm_mismatch', 0):.2e}",
                        f"{it.get('max_mismatch_pu', 0):.2e}",
                        it.get("cause_if_failed") or "OK",
                    ],
                    iter_cols,
                    left_margin,
                )

    c.save()
    return output_path


def export_power_flow_comparison_to_pdf(
    comparison: dict[str, Any],
    path: str | Path,
    *,
    title: str | None = None,
) -> Path:
    """
    Export a PowerFlowComparisonResult to a PDF file.

    Args:
        comparison: The comparison result dict (from to_dict()).
        path: Target file path (str or Path).
        title: Custom report title. Defaults to "Raport porownania rozplywu mocy".

    Returns:
        Path to the written PDF file.

    Raises:
        ImportError: If reportlab is not installed.
        ValueError: If comparison is not a dict.
    """
    if not _PDF_AVAILABLE:
        raise ImportError(
            "PDF export requires reportlab (missing dependency). "
            "Install it with: pip install reportlab"
        )

    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not isinstance(comparison, dict):
        raise ValueError(f"comparison must be a dict, got {type(comparison).__name__}")

    # Create PDF canvas
    c = canvas.Canvas(str(output_path), pagesize=A4)
    page_width, page_height = A4

    left_margin = 25 * mm
    page_width - 25 * mm
    top_margin = page_height - 25 * mm
    bottom_margin = 25 * mm
    line_height = 5 * mm
    section_spacing = 8 * mm

    y = top_margin

    def check_page_break(needed_height: float = 20 * mm) -> float:
        nonlocal y
        if y - needed_height < bottom_margin:
            c.showPage()
            return top_margin
        return y

    def draw_text(text: str, x: float, font_size: int = 10, bold: bool = False) -> None:
        nonlocal y
        font_name = "Helvetica-Bold" if bold else "Helvetica"
        c.setFont(font_name, font_size)
        c.drawString(x, y, text)
        y -= line_height

    # 1) Title
    report_title = title if title else "Raport porownania rozplywu mocy"
    c.setFont("Helvetica-Bold", 16)
    title_width = c.stringWidth(report_title, "Helvetica-Bold", 16)
    c.drawString((page_width - title_width) / 2, y, report_title)
    y -= 10 * mm

    # Subtitle
    subtitle = f"Run A: {comparison.get('run_a_id', '—')[:8]}... | Run B: {comparison.get('run_b_id', '—')[:8]}..."
    c.setFont("Helvetica", 10)
    subtitle_width = c.stringWidth(subtitle, "Helvetica", 10)
    c.drawString((page_width - subtitle_width) / 2, y, subtitle)
    y -= line_height

    y -= section_spacing

    # 2) Summary
    y = check_page_break(50 * mm)
    draw_text("Podsumowanie porownania", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    summary = comparison.get("summary", {})
    summary_fields = [
        ("Liczba szyn:", str(summary.get("total_buses", "—"))),
        ("Liczba galezi:", str(summary.get("total_branches", "—"))),
        ("Zbieznosc A:", "Tak" if summary.get("converged_a") else "Nie"),
        ("Zbieznosc B:", "Tak" if summary.get("converged_b") else "Nie"),
        ("Delta strat P [MW]:", _format_value(summary.get("delta_total_losses_p_mw"))),
        ("Max delta V [pu]:", _format_value(summary.get("max_delta_v_pu"))),
        ("Liczba problemow:", str(summary.get("total_issues", "—"))),
        ("Krytyczne:", str(summary.get("critical_issues", "—"))),
        ("Powazne:", str(summary.get("major_issues", "—"))),
    ]

    label_x = left_margin
    value_x = left_margin + 50 * mm

    for label, value in summary_fields:
        y = check_page_break(line_height)
        c.setFont("Helvetica", 10)
        c.drawString(label_x, y, label)
        c.drawString(value_x, y, value)
        y -= line_height

    y -= section_spacing

    # 3) Ranking
    y = check_page_break(30 * mm)
    draw_text("Ranking problemow", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    ranking = comparison.get("ranking", [])
    severity_labels = {5: "Krytyczny", 4: "Powazny", 3: "Sredni", 2: "Drobny", 1: "Info"}

    if ranking:
        for issue in ranking[:20]:
            y = check_page_break(line_height * 2)
            severity = severity_labels.get(issue.get("severity", 1), "?")
            c.setFont("Helvetica-Bold", 9)
            c.drawString(left_margin, y, f"[{severity}] {issue.get('issue_code', '—')}")
            y -= line_height
            c.setFont("Helvetica", 9)
            c.drawString(
                left_margin + 10 * mm,
                y,
                f"{issue.get('element_ref', '—')}: {issue.get('description_pl', '—')[:60]}",
            )
            y -= line_height

        if len(ranking) > 20:
            c.setFont("Helvetica-Oblique", 9)
            c.drawString(left_margin, y, f"... oraz {len(ranking) - 20} dodatkowych problemow")
            y -= line_height
    else:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(left_margin, y, "Brak wykrytych problemow.")
        y -= line_height

    c.save()
    return output_path
