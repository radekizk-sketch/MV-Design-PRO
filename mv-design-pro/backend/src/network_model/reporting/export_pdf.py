"""
Reporting/export layer - Professional PDF report generators for SC and PF results.

This module provides generate_sc_report_pdf and generate_pf_report_pdf functions
that create comprehensive engineering reports in PDF format.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: No physics calculations, only formatting
- 100% Polish labels
- UTF-8 encoding
"""

from __future__ import annotations

import textwrap
from pathlib import Path
from typing import TYPE_CHECKING, Any

from network_model.reporting.czcionki import zarejestruj_czcionki
from network_model.reporting.missing_value import format_wynik

if TYPE_CHECKING:
    from network_model.solvers.power_flow_result import PowerFlowResultV1
    from network_model.solvers.power_flow_trace import PowerFlowTrace
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
    """Format a complex number for display."""
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
        return "\u2014"
    if isinstance(value, dict) and "re" in value and "im" in value:
        return _format_complex(value)
    if isinstance(value, complex):
        return _format_complex(value)
    if isinstance(value, float):
        return f"{value:.6g}"
    if isinstance(value, bool):
        return "Tak" if value else "Nie"
    if isinstance(value, list):
        return f"[{len(value)} elementow]"
    return str(value)


def _wrap_text_lines(text: str, *, max_chars: int = 110) -> list[str]:
    """Wrap text without truncation."""
    if not text:
        return []
    return textwrap.wrap(
        text,
        width=max_chars,
        break_long_words=True,
        break_on_hyphens=False,
    ) or [text]


class _PDFLayout:
    """Encapsulates PDF layout helpers for consistent page management."""

    def __init__(self, c: canvas.Canvas) -> None:
        self.c = c
        self.page_width, self.page_height = A4
        self.left_margin = 25 * mm
        self.right_margin = self.page_width - 25 * mm
        self.top_margin = self.page_height - 25 * mm
        self.bottom_margin = 25 * mm
        self.line_height = 5 * mm
        self.section_spacing = 8 * mm
        self.y = self.top_margin

    @property
    def content_width(self) -> float:
        return self.right_margin - self.left_margin

    def check_page_break(self, needed_height: float = 20) -> None:
        """Create a new page if insufficient space remains."""
        needed = needed_height * mm if needed_height < 10 else needed_height
        if self.y - needed < self.bottom_margin:
            self.c.showPage()
            self.y = self.top_margin

    def draw_title(self, text: str) -> None:
        """Draw centered title text."""
        self.c.setFont("DejaVuSans-Bold", 16)
        w = self.c.stringWidth(text, "DejaVuSans-Bold", 16)
        self.c.drawString((self.page_width - w) / 2, self.y, text)
        self.y -= 10 * mm

    def draw_subtitle(self, text: str) -> None:
        """Draw centered subtitle text."""
        self.c.setFont("DejaVuSans", 10)
        w = self.c.stringWidth(text, "DejaVuSans", 10)
        if w > self.content_width:
            # Wrap if too wide
            self.c.drawString(self.left_margin, self.y, text[:100])
        else:
            self.c.drawString((self.page_width - w) / 2, self.y, text)
        self.y -= self.line_height

    def draw_heading(self, text: str, font_size: int = 14) -> None:
        """Draw a section heading."""
        self.check_page_break(30)
        self.c.setFont("DejaVuSans-Bold", font_size)
        self.c.drawString(self.left_margin, self.y, text)
        self.y -= self.line_height + 3 * mm

    def draw_text(
        self, text: str, x: float | None = None, font_size: int = 10, bold: bool = False
    ) -> None:
        """Draw text at current y position and advance."""
        self.check_page_break(self.line_height)
        font = "DejaVuSans-Bold" if bold else "DejaVuSans"
        self.c.setFont(font, font_size)
        self.c.drawString(x or self.left_margin, self.y, text)
        self.y -= self.line_height

    def draw_kv_row(self, label: str, value: str) -> None:
        """Draw a key-value pair at fixed columns."""
        self.check_page_break(self.line_height)
        self.c.setFont("DejaVuSans", 10)
        self.c.drawString(self.left_margin, self.y, label)
        self.c.drawString(self.left_margin + 55 * mm, self.y, value)
        self.y -= self.line_height

    def draw_table_row(
        self,
        values: list[str],
        col_widths: list[float],
        bold: bool = False,
        font_size: int = 9,
    ) -> None:
        """Draw a table row with given column widths."""
        self.check_page_break(self.line_height)
        font = "DejaVuSans-Bold" if bold else "DejaVuSans"
        self.c.setFont(font, font_size)
        x = self.left_margin
        for i, val in enumerate(values):
            text = str(val)[:25]
            self.c.drawString(x, self.y, text)
            x += col_widths[i]
        self.y -= self.line_height

    def space(self) -> None:
        """Add vertical spacing."""
        self.y -= self.section_spacing


def generate_sc_report_pdf(
    result: ShortCircuitResult,
    snapshot: dict[str, Any] | None,
    output_path: str | Path,
    *,
    title: str | None = None,
    project_info: dict[str, str] | None = None,
) -> Path:
    """
    Generate a professional PDF report for IEC 60909 short-circuit results.

    Creates a comprehensive report with:
    - Title page with project info
    - Input data table (from snapshot)
    - Equations section
    - Calculation trace (white-box steps)
    - Results table (Ik'', ip, Ith, Sk)
    - Source contributions table
    - TCC chart placeholder (if protection data available)

    Args:
        result: ShortCircuitResult instance to export.
        snapshot: Network snapshot dict (optional).
        output_path: Target file path.
        title: Custom report title.
        project_info: Optional project metadata dict.

    Returns:
        Path to the written PDF file.

    Raises:
        ImportError: If reportlab is not installed.
        ValueError: If result.to_dict() does not return a dict.
    """
    if not _PDF_AVAILABLE:
        raise ImportError(
            "PDF export requires reportlab (missing dependency). "
            "Install it with: pip install reportlab"
        )

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    data = result.to_dict()
    if not isinstance(data, dict):
        raise ValueError(f"result.to_dict() must return a dict, got {type(data).__name__}")

    zarejestruj_czcionki()
    c = canvas.Canvas(str(out), pagesize=A4, invariant=1, pageCompression=0)
    lay = _PDFLayout(c)

    # =========================================================================
    # 1) Title
    # =========================================================================
    report_title = title if title else "Raport zwarciowy IEC 60909"
    lay.draw_title(report_title)

    # Project info
    if project_info:
        parts = []
        for key in ("name", "version", "author", "date"):
            if project_info.get(key):
                parts.append(f"{key}: {project_info[key]}")
        if parts:
            lay.draw_subtitle(" | ".join(parts))

    # Fault parameters
    _dash = "\u2014"
    params = [
        f"Typ: {data.get('short_circuit_type', _dash)}",
        f"Wezel: {data.get('fault_node_id', _dash)}",
        f"Un: {_format_value(data.get('un_v'))} V",
        f"c: {_format_value(data.get('c_factor'))}",
    ]
    lay.draw_subtitle(" | ".join(params))
    lay.space()

    # =========================================================================
    # 2) Input data from snapshot
    # =========================================================================
    lay.draw_heading("Dane wejsciowe sieci")
    if snapshot:
        nodes = snapshot.get("nodes", [])
        if nodes:
            lay.draw_text("Wezly:", bold=True)
            node_cols = [35 * mm, 35 * mm, 30 * mm]
            lay.draw_table_row(["ID", "Typ", "Un [kV]"], node_cols, bold=True)
            for node in nodes[:20]:
                lay.draw_table_row(
                    [
                        str(node.get("id", "\u2014"))[:15],
                        str(node.get("node_type", "\u2014"))[:15],
                        _format_value(node.get("voltage_level")),
                    ],
                    node_cols,
                )
            lay.y -= 3 * mm

        branches = snapshot.get("branches", [])
        if branches:
            lay.draw_text("Galezi:", bold=True)
            br_cols = [30 * mm, 25 * mm, 25 * mm, 25 * mm, 30 * mm]
            lay.draw_table_row(["ID", "Typ", "Od", "Do", "Impedancja"], br_cols, bold=True)
            for br in branches[:20]:
                z_info = br.get("z_ohm") or br.get("uk_percent", "\u2014")
                lay.draw_table_row(
                    [
                        str(br.get("id", "\u2014"))[:12],
                        str(br.get("branch_type", "\u2014"))[:10],
                        str(br.get("from_node_id", "\u2014"))[:10],
                        str(br.get("to_node_id", "\u2014"))[:10],
                        _format_value(z_info),
                    ],
                    br_cols,
                )
    else:
        lay.draw_text("Brak danych migawki sieci (snapshot).")
    lay.space()

    # =========================================================================
    # 3) Equations section
    # =========================================================================
    lay.draw_heading("Rownania IEC 60909")
    equations = [
        ("Z_k = f(Z_1, Z_2, Z_0)", "Impedancja zastpcza"),
        ("I_k'' = (c * U_n * k_U) / |Z_k|", "Prad poczatkowy"),
        ("kappa = 1.02 + 0.98 * exp(-3*R/X)", "Wspolczynnik udaru"),
        ("I_p = kappa * sqrt(2) * I_k''", "Prad udarowy"),
        ("I_th = I_k'' * sqrt(t_k)", "Prad cieplny"),
        ("S_k = sqrt(3) * U_n * I_k'' / 10^6", "Moc zwarciowa"),
    ]
    eq_cols = [80 * mm, 50 * mm]
    lay.draw_table_row(["Wzor", "Nazwa"], eq_cols, bold=True)
    for formula, name in equations:
        lay.draw_table_row([formula, name], eq_cols)
    lay.space()

    # =========================================================================
    # 4) Calculation trace (white-box steps)
    # =========================================================================
    lay.draw_heading("Slad obliczen (White Box)")
    white_box_trace = data.get("white_box_trace", [])
    if not white_box_trace:
        lay.draw_text("Brak sladu obliczen.")
    else:
        for step in white_box_trace:
            _add_wb_step_pdf(lay, step)
    lay.space()

    # =========================================================================
    # 5) Results table
    # =========================================================================
    lay.draw_heading("Wyniki")
    result_fields = [
        ("Ik'' [A]", "ikss_a"),
        ("Ip [A]", "ip_a"),
        ("Ib [A]", "ib_a"),
        ("Ith [A]", "ith_a"),
        ("Sk [MVA]", "sk_mva"),
        ("kappa [-]", "kappa"),
        ("R/X [-]", "rx_ratio"),
        ("Zk [ohm]", "zkk_ohm"),
        ("Ik Thevenin [A]", "ik_thevenin_a"),
        ("Ik falowniki [A]", "ik_inverters_a"),
        ("Ik calkowity [A]", "ik_total_a"),
    ]
    for label, key in result_fields:
        lay.draw_kv_row(label, _format_value(data.get(key)))
    lay.space()

    # =========================================================================
    # 6) Source contributions
    # =========================================================================
    lay.draw_heading("Udzialy zrodel")
    contributions = data.get("contributions", [])
    if contributions:
        c_cols = [30 * mm, 30 * mm, 20 * mm, 30 * mm, 25 * mm]
        lay.draw_table_row(
            ["ID", "Nazwa", "Typ", "I [A]", "Udzial [%]"],
            c_cols,
            bold=True,
        )
        for contrib in contributions:
            share = contrib.get("share")
            share_str = f"{share * 100:.2f}" if isinstance(share, int | float) else "\u2014"
            lay.draw_table_row(
                [
                    str(contrib.get("source_id", "\u2014"))[:12],
                    str(contrib.get("source_name", "\u2014"))[:12],
                    str(contrib.get("source_type", "\u2014"))[:8],
                    _format_value(contrib.get("i_contrib_a")),
                    share_str,
                ],
                c_cols,
            )
    else:
        lay.draw_text("Brak danych o udzialach zrodel.")
    lay.space()

    # =========================================================================
    # 7) TCC chart placeholder
    # =========================================================================
    # If protection data available from snapshot, note TCC is available
    if snapshot and snapshot.get("protection_devices"):
        lay.draw_heading("Krzywe TCC")
        lay.draw_text("Dane TCC dostepne - wykres w eksporcie interaktywnym.")

    c.save()
    return out


def _add_wb_step_pdf(lay: _PDFLayout, step: dict) -> None:
    """Add a single white box step to the PDF."""
    step_key = step.get("key", "")
    step_title = step.get("title", "")
    header_text = f"{step_key}: {step_title}" if step_title else step_key
    lay.draw_text(header_text, bold=True, font_size=11)

    formula = step.get("formula_latex", "")
    if formula:
        lay.draw_text("Wzór:", bold=True, font_size=10)
        for line in _wrap_text_lines(str(formula), max_chars=105):
            lay.draw_text(line, x=lay.left_margin + 10 * mm, font_size=9)

    inputs = step.get("inputs", {})
    if inputs and isinstance(inputs, dict):
        for k, v in inputs.items():
            lay.draw_text(f"  {k}: {_format_value(v)}", font_size=9)

    substitution = step.get("substitution_latex") or step.get("substitution", "")
    if substitution:
        lay.draw_text("Podstawienie:", bold=True, font_size=10)
        for line in _wrap_text_lines(str(substitution), max_chars=105):
            lay.draw_text(line, x=lay.left_margin + 10 * mm, font_size=9)

    result_data = step.get("result", {})
    if result_data and isinstance(result_data, dict):
        for k, v in result_data.items():
            lay.draw_text(f"  Wynik: {k} = {_format_value(v)}", font_size=9)

    notes = step.get("notes")
    if notes:
        lay.draw_text(f"  Uwagi: {notes}", font_size=9)

    lay.y -= 3 * mm


def generate_pf_report_pdf(
    result: PowerFlowResultV1,
    snapshot: dict[str, Any] | None,
    output_path: str | Path,
    *,
    trace: PowerFlowTrace | None = None,
    title: str | None = None,
    project_info: dict[str, str] | None = None,
) -> Path:
    """
    Generate a professional PDF report for Power Flow results.

    Creates a comprehensive report with:
    - Bus voltages table
    - Branch flows table
    - Losses summary
    - Violations section

    Args:
        result: PowerFlowResultV1 instance to export.
        snapshot: Network snapshot dict (optional).
        output_path: Target file path.
        trace: Optional PowerFlowTrace.
        title: Custom report title.
        project_info: Optional project metadata.

    Returns:
        Path to the written PDF file.

    Raises:
        ImportError: If reportlab is not installed.
        ValueError: If result.to_dict() does not return a dict.
    """
    if not _PDF_AVAILABLE:
        raise ImportError(
            "PDF export requires reportlab (missing dependency). "
            "Install it with: pip install reportlab"
        )

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    data = result.to_dict()
    if not isinstance(data, dict):
        raise ValueError(f"result.to_dict() must return a dict, got {type(data).__name__}")

    zarejestruj_czcionki()
    c = canvas.Canvas(str(out), pagesize=A4, invariant=1, pageCompression=0)
    lay = _PDFLayout(c)

    # =========================================================================
    # 1) Title
    # =========================================================================
    report_title = title if title else "Raport rozplywu mocy"
    lay.draw_title(report_title)

    if project_info:
        parts = []
        for key in ("name", "version", "author", "date"):
            if project_info.get(key):
                parts.append(f"{key}: {project_info[key]}")
        if parts:
            lay.draw_subtitle(" | ".join(parts))

    _dash = "\u2014"
    params = [
        f"Status: {'Zbiezny' if data.get('converged') else 'Niezbiezny'}",
        f"Iteracje: {data.get('iterations_count', _dash)}",
        f"Bazowa: {format_wynik(data.get('base_mva'))} MVA",
    ]
    lay.draw_subtitle(" | ".join(params))
    lay.space()

    # =========================================================================
    # 2) Summary / Losses
    # =========================================================================
    lay.draw_heading("Podsumowanie i straty")
    summary = data.get("summary", {})
    summary_fields = [
        ("Status:", "Zbiezny" if data.get("converged") else "Niezbiezny"),
        ("Wezel bilansujacy:", str(data.get("slack_bus_id", "\u2014"))[:20]),
        ("Straty P [MW]:", f"{_format_value(summary.get('total_losses_p_mw'))}"),
        ("Straty Q [Mvar]:", f"{_format_value(summary.get('total_losses_q_mvar'))}"),
        ("Moc czynna slack [MW]:", f"{_format_value(summary.get('slack_p_mw'))}"),
        ("Moc bierna slack [Mvar]:", f"{_format_value(summary.get('slack_q_mvar'))}"),
        ("Min. napiecie [pu]:", f"{_format_value(summary.get('min_v_pu'))}"),
        ("Max. napiecie [pu]:", f"{_format_value(summary.get('max_v_pu'))}"),
    ]
    for label, value in summary_fields:
        lay.draw_kv_row(label, value)
    lay.space()

    # =========================================================================
    # 3) Bus voltages
    # =========================================================================
    lay.draw_heading("Napiecia wezlowe")
    bus_results = data.get("bus_results", [])
    if bus_results:
        bus_cols = [35 * mm, 25 * mm, 25 * mm, 30 * mm, 30 * mm]
        lay.draw_table_row(
            ["ID szyny", "V [pu]", "Kat [deg]", "P_inj [MW]", "Q_inj [Mvar]"],
            bus_cols,
            bold=True,
        )
        for bus in bus_results[:30]:
            lay.draw_table_row(
                [
                    str(bus.get("bus_id", "\u2014"))[:15],
                    _format_value(bus.get("v_pu")),
                    _format_value(bus.get("angle_deg")),
                    _format_value(bus.get("p_injected_mw")),
                    _format_value(bus.get("q_injected_mvar")),
                ],
                bus_cols,
            )
        if len(bus_results) > 30:
            lay.draw_text(f"... oraz {len(bus_results) - 30} dodatkowych wezlow")
    else:
        lay.draw_text("Brak wynikow wezlowych.")
    lay.space()

    # =========================================================================
    # 4) Branch flows
    # =========================================================================
    lay.draw_heading("Przeplywy galeziowe")
    branch_results = data.get("branch_results", [])
    if branch_results:
        br_cols = [35 * mm, 28 * mm, 28 * mm, 28 * mm, 28 * mm]
        lay.draw_table_row(
            ["ID galezi", "P_from [MW]", "Q_from [Mvar]", "Straty P", "Straty Q"],
            br_cols,
            bold=True,
        )
        for branch in branch_results[:30]:
            lay.draw_table_row(
                [
                    str(branch.get("branch_id", "\u2014"))[:15],
                    _format_value(branch.get("p_from_mw")),
                    _format_value(branch.get("q_from_mvar")),
                    _format_value(branch.get("losses_p_mw")),
                    _format_value(branch.get("losses_q_mvar")),
                ],
                br_cols,
            )
        if len(branch_results) > 30:
            lay.draw_text(f"... oraz {len(branch_results) - 30} dodatkowych galezi")
    else:
        lay.draw_text("Brak wynikow galeziowych.")
    lay.space()

    # =========================================================================
    # 5) Violations
    # =========================================================================
    lay.draw_heading("Naruszenia granic")
    violations_found = False

    v_min_limit = 0.95
    v_max_limit = 1.05
    _dash = "\u2014"
    for bus in bus_results:
        v_pu = bus.get("v_pu")
        if v_pu is not None and (v_pu < v_min_limit or v_pu > v_max_limit):
            violations_found = True
            status = "Podnapiecie" if v_pu < v_min_limit else "Przepiecie"
            bus_id = bus.get("bus_id", _dash)
            lay.draw_text(
                f"  {bus_id}: V={_format_value(v_pu)} pu - {status}",
                font_size=9,
            )

    if not data.get("converged", True):
        violations_found = True
        lay.draw_text("UWAGA: Obliczenia NIE zbiegly.", bold=True)

    if not violations_found:
        lay.draw_text("Brak naruszen. Wszystkie parametry w granicach dopuszczalnych.")
    lay.space()

    # =========================================================================
    # 6) NR Trace (optional)
    # =========================================================================
    if trace is not None:
        lay.draw_heading("Slad obliczen (Newton-Raphson)")
        trace_data = trace.to_dict()
        trace_fields = [
            ("Wersja solvera:", trace_data.get("solver_version", "\u2014")),
            ("Metoda startu:", trace_data.get("init_method", "\u2014")),
            (
                "Wynik:",
                "Zbiezny" if trace_data.get("converged") else "Niezbiezny",
            ),
            ("Iteracje:", str(trace_data.get("final_iterations_count", "\u2014"))),
        ]
        for label, value in trace_fields:
            lay.draw_kv_row(label, value)

        iterations = trace_data.get("iterations", [])
        if iterations:
            lay.y -= 3 * mm
            lay.draw_text("Iteracje:", bold=True)
            iter_cols = [20 * mm, 40 * mm, 40 * mm, 40 * mm]
            lay.draw_table_row(
                ["k", "Norma mismatch", "Max mismatch [pu]", "Status"],
                iter_cols,
                bold=True,
            )
            for it in iterations:
                lay.draw_table_row(
                    [
                        str(it.get("k", "\u2014")),
                        format_wynik(it.get("norm_mismatch"), ".2e"),
                        format_wynik(it.get("max_mismatch_pu"), ".2e"),
                        it.get("cause_if_failed") or "OK",
                    ],
                    iter_cols,
                )

    c.save()
    return out
