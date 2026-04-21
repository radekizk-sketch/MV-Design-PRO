"""
Reporting/export layer - PDF report generator for ShortCircuitResult.

This module provides functions to export IEC 60909 short-circuit calculation
results to PDF format. It uses the stable Result API contract
(ShortCircuitResult.to_dict() + white_box_trace) without modifying any solver logic.
"""

from __future__ import annotations

import textwrap
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult

# Check for reportlab availability at import time
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    _PDF_AVAILABLE = True
except ImportError:
    _PDF_AVAILABLE = False


def _format_complex(value: dict | complex | str | Any) -> str:
    """
    Format a complex number for display.

    Handles dict with re/im keys, complex numbers, and strings.
    Returns a readable string like "1.23 + j*4.56" or "1.23 - j*4.56".
    """
    if isinstance(value, dict) and "re" in value and "im" in value:
        re_part = value["re"]
        im_part = value["im"]
    elif isinstance(value, complex):
        re_part = value.real
        im_part = value.imag
    elif isinstance(value, str):
        return value
    else:
        return str(value)

    if im_part >= 0:
        return f"{re_part:.6g} + j*{im_part:.6g}"
    else:
        return f"{re_part:.6g} - j*{abs(im_part):.6g}"


def _format_value(value: Any) -> str:
    """Format a value for display in the report."""
    if value is None:
        return "â€”"
    if isinstance(value, dict) and "re" in value and "im" in value:
        return _format_complex(value)
    if isinstance(value, complex):
        return _format_complex(value)
    if isinstance(value, float):
        return f"{value:.6g}"
    if isinstance(value, bool):
        return "Tak" if value else "Nie"
    if isinstance(value, list):
        return f"[{len(value)} elementĂłw]"
    return str(value)


def export_short_circuit_result_to_pdf(
    result: ShortCircuitResult,
    path: str | Path,
    *,
    title: str | None = None,
    include_white_box: bool = True,
) -> Path:
    """
    Export a single ShortCircuitResult to a PDF file.

    Creates a human-readable engineering report with:
    - Title page/header with fault parameters
    - Results section with key calculation outputs
    - White Box section with calculation trace (optional)

    Args:
        result: The ShortCircuitResult instance to export.
        path: Target file path (str or Path). Parent directories are created
              if they do not exist.
        title: Custom report title. Defaults to "Raport zwarciowy IEC 60909".
        include_white_box: If True, include the white box trace section
                          showing calculation steps. Defaults to True.

    Returns:
        Path to the written PDF file.

    Raises:
        ImportError: If reportlab is not installed in the environment.
        ValueError: If result.to_dict() does not return a dict.

    Example:
        >>> from network_model.solvers.short_circuit_iec60909 import (
        ...     ShortCircuitIEC60909Solver
        ... )
        >>> result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        ...     graph=graph, fault_node_id="B", c_factor=1.0, tk_s=1.0
        ... )
        >>> path = export_short_circuit_result_to_pdf(result, "output/report.pdf")
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
    right_margin = page_width - 25 * mm
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

    def draw_wrapped_text(text: str, x: float, max_width: float, font_size: int = 10) -> None:
        """Draw text with wrapping at current y position."""
        nonlocal y
        c.setFont("Helvetica", font_size)
        # Simple word wrap
        words = text.split()
        current_line = ""
        for word in words:
            test_line = f"{current_line} {word}".strip()
            if c.stringWidth(test_line, "Helvetica", font_size) < max_width:
                current_line = test_line
            else:
                if current_line:
                    y = check_page_break(line_height)
                    c.drawString(x, y, current_line)
                    y -= line_height
                current_line = word
        if current_line:
            y = check_page_break(line_height)
            c.drawString(x, y, current_line)
            y -= line_height

    # 1) Title
    report_title = title if title else "Raport zwarciowy IEC 60909"
    c.setFont("Helvetica-Bold", 16)
    title_width = c.stringWidth(report_title, "Helvetica-Bold", 16)
    c.drawString((page_width - title_width) / 2, y, report_title)
    y -= 10 * mm

    # 2) Fault parameters (metryka)
    c.setFont("Helvetica", 10)
    params = [
        f"Typ zwarcia: {data.get('short_circuit_type', 'â€”')}",
        f"WÄ™zeĹ‚: {data.get('fault_node_id', 'â€”')}",
        f"Un: {_format_value(data.get('un_v'))} V",
        f"c: {_format_value(data.get('c_factor'))}",
        f"tk: {_format_value(data.get('tk_s'))} s",
        f"tb: {_format_value(data.get('tb_s'))} s",
    ]
    params_text = " | ".join(params)
    params_width = c.stringWidth(params_text, "Helvetica", 10)
    if params_width > (right_margin - left_margin):
        # Split params across lines if too wide
        for param in params:
            y = check_page_break(line_height)
            c.drawString(left_margin, y, param)
            y -= line_height
    else:
        c.drawString((page_width - params_width) / 2, y, params_text)
        y -= line_height

    y -= section_spacing

    # 3) Results section
    y = check_page_break(30 * mm)
    draw_text("Wyniki", left_margin, font_size=14, bold=True)
    y -= 3 * mm

    result_fields = [
        ("Ik'' [A]", "ikss_a"),
        ("Ip [A]", "ip_a"),
        ("Ib [A]", "ib_a"),
        ("Ith [A]", "ith_a"),
        ("Sk [MVA]", "sk_mva"),
        ("Îş [-]", "kappa"),
        ("R/X [-]", "rx_ratio"),
        ("Zk [Î©]", "zkk_ohm"),
    ]

    # Draw results as a simple table
    label_x = left_margin
    value_x = left_margin + 50 * mm

    for label, key in result_fields:
        y = check_page_break(line_height)
        c.setFont("Helvetica", 10)
        c.drawString(label_x, y, label)
        c.drawString(value_x, y, _format_value(data.get(key)))
        y -= line_height

    y -= section_spacing

    # 4) White Box section (if requested)
    if include_white_box:
        y = check_page_break(20 * mm)
        draw_text("White Box", left_margin, font_size=14, bold=True)
        y -= 3 * mm

        white_box_trace = data.get("white_box_trace", [])

        if not white_box_trace:
            y = check_page_break(line_height)
            c.setFont("Helvetica-Oblique", 10)
            c.drawString(left_margin, y, "Brak Ĺ›ladu obliczeĹ„.")
            y -= line_height
        else:
            for step in white_box_trace:
                y = _add_white_box_step(
                    c, step, left_margin, right_margin, y, bottom_margin, top_margin
                )
                y -= 5 * mm

    c.save()
    return output_path


def _add_white_box_step(
    c: canvas.Canvas,
    step: dict,
    left_margin: float,
    right_margin: float,
    y: float,
    bottom_margin: float,
    top_margin: float,
) -> float:
    """
    Add a single white box step to the PDF canvas.

    Args:
        c: The Canvas instance to draw on.
        step: A dict with keys: key, title, formula_latex, inputs,
              substitution, result, notes (optional).
        left_margin: Left margin position.
        right_margin: Right margin position.
        y: Current y position.
        bottom_margin: Bottom margin for page break check.
        top_margin: Top margin for new page.

    Returns:
        Updated y position after drawing the step.
    """
    line_height = 5 * mm
    max_width = right_margin - left_margin

    def check_page_break(needed: float = 15 * mm) -> float:
        nonlocal y
        if y - needed < bottom_margin:
            c.showPage()
            return top_margin
        return y

    def draw_wrapped_lines(
        text: str,
        x: float,
        y_pos: float,
        max_width_value: float,
        font_size: int,
    ) -> float:
        nonlocal y
        c.setFont("Helvetica", font_size)
        approx_char_width = max(font_size * 0.55, 1.0)
        max_chars = max(1, int(max_width_value / approx_char_width))
        lines = textwrap.wrap(
            text,
            width=max_chars,
            break_long_words=True,
            break_on_hyphens=False,
        ) or [text]
        for idx, line in enumerate(lines):
            if idx == 0:
                y_pos = check_page_break(line_height)
            else:
                y_pos -= line_height
                y_pos = check_page_break(line_height)
            c.drawString(x, y_pos, line)
        return y_pos

    step_key = step.get("key", "")
    step_title = step.get("title", "")

    # Step header
    header_text = f"{step_key}: {step_title}" if step_title else step_key
    y = check_page_break(20 * mm)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left_margin, y, header_text)
    y -= line_height + 2 * mm

    # Formula
    formula = step.get("formula_latex", "")
    if formula:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left_margin, y, "Wzór:")
        y -= line_height
        y = draw_wrapped_lines(str(formula), left_margin + 10 * mm, y, max_width - 10 * mm, 9)
        y -= line_height

    # Inputs
    inputs = step.get("inputs", {})
    if inputs and isinstance(inputs, dict):
        y = check_page_break(line_height * (len(inputs) + 2))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left_margin, y, "Dane wejĹ›ciowe:")
        y -= line_height
        c.setFont("Helvetica", 9)
        for k, v in inputs.items():
            y = check_page_break(line_height)
            c.drawString(left_margin + 5 * mm, y, f"â€˘ {k}: {_format_value(v)}")
            y -= line_height

    # Substitution
    substitution = step.get("substitution_latex") or step.get("substitution", "")
    if substitution:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left_margin, y, "Podstawienie:")
        y -= line_height
        y = draw_wrapped_lines(str(substitution), left_margin + 5 * mm, y, max_width - 5 * mm, 9)
        y -= line_height

    # Result
    result_data = step.get("result", {})
    if result_data and isinstance(result_data, dict):
        y = check_page_break(line_height * (len(result_data) + 2))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left_margin, y, "Wynik:")
        y -= line_height
        c.setFont("Helvetica", 9)
        for k, v in result_data.items():
            y = check_page_break(line_height)
            c.drawString(left_margin + 5 * mm, y, f"â€˘ {k}: {_format_value(v)}")
            y -= line_height

    # Notes
    notes = step.get("notes")
    if notes:
        y = check_page_break(line_height * 2)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left_margin, y, "Uwagi:")
        y -= line_height
        c.setFont("Helvetica", 9)
        c.drawString(left_margin + 5 * mm, y, str(notes))
        y -= line_height

    return y


def _draw_wrapped_line(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font_size: int,
) -> None:
    """Draw a single line of text, truncating if too long."""
    c.setFont("Helvetica", font_size)
    if c.stringWidth(text, "Helvetica", font_size) > max_width:
        # Truncate with ellipsis
        while c.stringWidth(text + "...", "Helvetica", font_size) > max_width and len(text) > 0:
            text = text[:-1]
        text = text + "..."
    c.drawString(x, y, text)
