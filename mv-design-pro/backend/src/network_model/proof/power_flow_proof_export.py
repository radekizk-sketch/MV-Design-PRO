"""
P21: Eksport PowerFlowProofDocument do LaTeX, PDF i JSON.

Ten moduł zapewnia deterministyczny eksport dokumentu dowodowego
do formatów akademickich i audytowych.

CANONICAL ALIGNMENT:
- DETERMINISTIC: Ten sam ProofDocument → identyczny output
- LATEX-ONLY: Kanoniczny format matematyczny
- UTF-8: Wszystkie pliki w UTF-8
- POLISH: 100% język polski
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Any

from network_model.reporting.czcionki import ustaw_czcionki_stylow, zarejestruj_czcionki
from network_model.reporting.missing_value import BRAK_DANYCH

if TYPE_CHECKING:
    from network_model.proof.power_flow_proof_document import (
        IterationProofSection,
        PowerFlowProofDocument,
    )

# =============================================================================
# LATEX EXPORT
# =============================================================================

LATEX_PREAMBLE = r"""
\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[polish]{babel}
\usepackage{amsmath,amssymb,amsfonts}
\usepackage{booktabs}
\usepackage{longtable}
\usepackage{geometry}
\usepackage{fancyhdr}
\usepackage{hyperref}
\usepackage{xcolor}

\geometry{margin=2.5cm}
\pagestyle{fancy}
\fancyhf{}
\rhead{MV-Design PRO}
\lhead{Dowód Power Flow}
\rfoot{Strona \thepage}

\definecolor{converged}{RGB}{0,128,0}
\definecolor{notconverged}{RGB}{200,0,0}

\title{%(title)s}
\author{MV-Design PRO --- Automatycznie wygenerowany dowód}
\date{%(date)s}

\begin{document}
\maketitle
\tableofcontents
\newpage
"""

LATEX_FOOTER = r"""
\end{document}
"""


def _escape_latex(text: str) -> str:
    """Escapes special LaTeX characters in text."""
    if not text:
        return ""
    replacements = [
        ("\\", r"\textbackslash{}"),
        ("&", r"\&"),
        ("%", r"\%"),
        ("$", r"\$"),
        ("#", r"\#"),
        ("_", r"\_"),
        ("{", r"\{"),
        ("}", r"\}"),
        ("~", r"\textasciitilde{}"),
        ("^", r"\textasciicircum{}"),
    ]
    result = text
    for old, new in replacements:
        result = result.replace(old, new)
    return result


def _format_float_latex(value: float, precision: int = 4) -> str:
    """Formats float for LaTeX display."""
    if abs(value) < 1e-10:
        return "0"
    if abs(value) >= 10000:
        return f"{value:.{precision}e}"
    return f"{value:.{precision}f}"


def _format_float_latex_or_missing(value: float | None, precision: int = 4) -> str:
    """Jak ``_format_float_latex``, ale ``brak danych`` gdy pole nieznane.

    Do uzycia w tekscie/komorkach tabel (tryb TEXT LaTeX). FAB-E (E1): brak
    pola WYNIKU (np. ``p_mw``/``theta_rad`` niedostepne dla danego wezla w
    sladzie) NIE jest liczba 0 — dowod formalny (LaTeX) nie moze podpisac
    fikcyjnej wartosci jako obliczonej. ``BRAK_DANYCH`` nie zawiera znakow
    specjalnych LaTeX, wiec jest bezpieczny bez dodatkowego escapowania.
    """
    if value is None:
        return BRAK_DANYCH
    return _format_float_latex(value, precision)


def _format_float_latex_math_or_missing(value: float | None, precision: int = 4) -> str:
    """Jak ``_format_float_latex_or_missing``, ale wewnatrz trybu MATH (``$...$``).

    ``BRAK_DANYCH`` jest zwyklym tekstem, wiec w matematyce wymaga
    ``\\text{...}`` (pakiet ``amsmath``, juz w preambule tego eksportu) —
    bez tego LaTeX potraktowalby kazda litere jak osobna zmienna.
    """
    if value is None:
        return f"\\text{{{BRAK_DANYCH}}}"
    return _format_float_latex(value, precision)


def export_proof_to_latex(
    proof: PowerFlowProofDocument,
    path: str | Path,
) -> Path:
    """
    Export PowerFlowProofDocument to LaTeX (.tex) file.

    Args:
        proof: The PowerFlowProofDocument to export.
        path: Target file path (str or Path).

    Returns:
        Path to the written .tex file.
    """
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    latex_content = _build_latex_document(proof)

    output_path.write_text(latex_content, encoding="utf-8")
    return output_path


def _build_latex_document(proof: PowerFlowProofDocument) -> str:
    """Builds complete LaTeX document string."""
    sections: list[str] = []

    # Preamble
    preamble = LATEX_PREAMBLE % {
        "title": _escape_latex(proof.title_pl),
        "date": proof.created_at[:10],  # Just the date part
    }
    sections.append(preamble)

    # Header section
    sections.append(_build_header_section(proof))

    # Network definition section
    sections.append(_build_network_section(proof))

    # Power flow equations section
    sections.append(_build_equations_section(proof))

    # NR method description
    sections.append(_build_nr_method_section(proof))

    # Initial state section
    sections.append(_build_initial_state_section(proof))

    # Iterations section
    sections.append(_build_iterations_section(proof))

    # Convergence criterion
    sections.append(_build_convergence_section(proof))

    # Final state section
    sections.append(_build_final_state_section(proof))

    # Verification section
    sections.append(_build_verification_section(proof))

    # Summary section
    sections.append(_build_summary_section(proof))

    # Footer
    sections.append(LATEX_FOOTER)

    return "\n".join(sections)


def _build_header_section(proof: PowerFlowProofDocument) -> str:
    """Builds the header/metadata section."""
    header = proof.header
    return f"""
\\section{{Informacje ogólne}}

\\begin{{tabular}}{{ll}}
\\toprule
\\textbf{{Pole}} & \\textbf{{Wartość}} \\\\
\\midrule
Projekt & {_escape_latex(header.project_name)} \\\\
Przypadek & {_escape_latex(header.case_name)} \\\\
Data uruchomienia & {_escape_latex(header.run_timestamp[:19])} \\\\
Wersja solvera & {_escape_latex(header.solver_version)} \\\\
ID uruchomienia & \\texttt{{{_escape_latex(header.run_id or 'N/A')}}} \\\\
Hash wejścia & \\texttt{{{_escape_latex((header.input_hash or '')[:16])}...}} \\\\
Moc bazowa & {_format_float_latex(header.base_mva)} MVA \\\\
Tolerancja & {_format_float_latex(header.tolerance)} p.u. \\\\
Węzeł bilansujący & {_escape_latex(header.slack_bus_id)} \\\\
\\bottomrule
\\end{{tabular}}
"""


def _build_network_section(proof: PowerFlowProofDocument) -> str:
    """Builds the network definition section."""
    net = proof.network_definition
    pq_list = ", ".join(net.pq_bus_ids[:5])
    if len(net.pq_bus_ids) > 5:
        pq_list += f", ... ({len(net.pq_bus_ids)} węzłów)"

    pv_list = ", ".join(net.pv_bus_ids[:5])
    if len(net.pv_bus_ids) > 5:
        pv_list += f", ... ({len(net.pv_bus_ids)} węzłów)"

    return f"""
\\section{{Definicja problemu}}

\\subsection{{Parametry sieci}}

\\begin{{itemize}}
\\item Moc bazowa: $S_{{base}} = {_format_float_latex(net.base_mva)}$ MVA
\\item Liczba węzłów: $n = {net.bus_count}$
\\item Węzeł bilansujący (slack): {_escape_latex(net.slack_bus_id)}
\\item Węzły PQ: {_escape_latex(pq_list)}
\\item Węzły PV: {_escape_latex(pv_list) if pv_list else '(brak)'}
\\end{{itemize}}

\\subsection{{Macierz admitancji}}

{_escape_latex(net.ybus_description)}
"""


def _build_equations_section(proof: PowerFlowProofDocument) -> str:
    """Builds the power flow equations section."""
    sections_parts: list[str] = [
        r"\section{Równania rozpływu mocy}",
        "",
        r"Podstawowe równania rozpływu mocy w notacji węzłowej:",
        "",
    ]

    for eq_step in proof.power_flow_equations:
        sections_parts.append(f"\\subsection{{{_escape_latex(eq_step.title_pl)}}}")
        sections_parts.append("")
        sections_parts.append(f"\\textbf{{Równanie ({eq_step.equation.equation_id}):}}")
        sections_parts.append("")
        sections_parts.append(f"$${eq_step.equation.latex}$$")
        sections_parts.append("")
        if eq_step.equation.description_pl:
            sections_parts.append(f"{_escape_latex(eq_step.equation.description_pl)}")
            sections_parts.append("")

    return "\n".join(sections_parts)


def _build_nr_method_section(proof: PowerFlowProofDocument) -> str:
    """Builds the Newton-Raphson method description section."""
    nr_step = proof.nr_method_description

    return f"""
\\section{{Metoda Newtona-Raphsona}}

\\subsection{{Opis metody}}

Metoda Newtona-Raphsona dla rozpływu mocy jest iteracyjna i opiera się na linearyzacji
równań mocy wokół bieżącego punktu pracy.

\\subsection{{Macierz Jacobiego}}

Macierz Jacobiego składa się z czterech bloków:

$${nr_step.equation.latex}$$

Gdzie:
\\begin{{itemize}}
\\item $\\mathbf{{J}}_1 = \\frac{{\\partial \\mathbf{{P}}}}{{\\partial \\boldsymbol{{\\theta}}}}$ --- pochodne mocy czynnej po kątach
\\item $\\mathbf{{J}}_2 = \\frac{{\\partial \\mathbf{{P}}}}{{\\partial \\mathbf{{V}}}}$ --- pochodne mocy czynnej po napięciach
\\item $\\mathbf{{J}}_3 = \\frac{{\\partial \\mathbf{{Q}}}}{{\\partial \\boldsymbol{{\\theta}}}}$ --- pochodne mocy biernej po kątach
\\item $\\mathbf{{J}}_4 = \\frac{{\\partial \\mathbf{{Q}}}}{{\\partial \\mathbf{{V}}}}$ --- pochodne mocy biernej po napięciach
\\end{{itemize}}

\\subsection{{Parametry obliczeniowe}}

\\begin{{itemize}}
\\item Tolerancja zbieżności: $\\varepsilon = {_format_float_latex(proof.header.tolerance)}$ p.u.
\\item Maksymalna liczba iteracji: $k_{{max}} = {proof.header.max_iterations}$
\\end{{itemize}}
"""


def _build_initial_state_section(proof: PowerFlowProofDocument) -> str:
    """Builds the initial state section."""
    init = proof.initial_state

    state_rows: list[str] = []
    for bus_id, state in sorted(init.init_state.items())[:10]:  # Limit for readability
        # FAB-E (E1): brak v_pu/theta_rad NIE jest startem plaskim (1.0/0) —
        # to fabrykowaloby konkretna wartosc poczatkowa, ktorej solver
        # naprawde nie zapisal w sladzie.
        v_pu = state.get("v_pu")
        theta_rad = state.get("theta_rad")
        import math

        theta_deg = math.degrees(theta_rad) if theta_rad is not None else None
        state_rows.append(
            f"{_escape_latex(bus_id)} & {_format_float_latex_or_missing(v_pu)} & "
            f"{_format_float_latex_or_missing(theta_deg)} \\\\"
        )

    if len(init.init_state) > 10:
        state_rows.append(
            f"\\multicolumn{{3}}{{c}}{{... ({len(init.init_state)} węzłów łącznie)}} \\\\"
        )

    return f"""
\\section{{Stan początkowy}}

\\subsection{{Metoda inicjalizacji}}

Metoda: \\textbf{{{_escape_latex(init.init_method)}}}

\\subsection{{Wartości początkowe $V_0$, $\\theta_0$}}

\\begin{{longtable}}{{lrr}}
\\toprule
\\textbf{{Węzeł}} & \\textbf{{$|V|$ [p.u.]}} & \\textbf{{$\\theta$ [°]}} \\\\
\\midrule
\\endfirsthead
\\toprule
\\textbf{{Węzeł}} & \\textbf{{$|V|$ [p.u.]}} & \\textbf{{$\\theta$ [°]}} \\\\
\\midrule
\\endhead
{chr(10).join(state_rows)}
\\bottomrule
\\end{{longtable}}
"""


def _build_iterations_section(proof: PowerFlowProofDocument) -> str:
    """Builds the iterations section."""
    sections_parts: list[str] = [
        r"\section{Iteracje Newtona-Raphsona}",
        "",
    ]

    for iteration in proof.iterations:
        sections_parts.append(_build_single_iteration(iteration))

    return "\n".join(sections_parts)


def _build_single_iteration(iteration: IterationProofSection) -> str:
    """Builds a single iteration subsection."""
    k = iteration.iteration_number

    parts: list[str] = [
        f"\\subsection{{Iteracja $k = {k}$}}",
        "",
    ]

    # Mismatch step
    mismatch = iteration.mismatch_step
    parts.append("\\subsubsection{Mismatch $\\Delta P$, $\\Delta Q$}")
    parts.append("")
    parts.append(f"$${mismatch.substitution_latex}$$")
    parts.append("")
    parts.append(f"Maksymalny mismatch: ${mismatch.result.symbol} = {mismatch.result.formatted}$")
    parts.append("")

    # Norm step
    norm = iteration.norm_step
    parts.append("\\subsubsection{Norma błędu}")
    parts.append("")
    parts.append(f"$${norm.substitution_latex}$$")
    parts.append("")

    # Jacobian step (optional)
    if iteration.jacobian_step:
        jac = iteration.jacobian_step
        parts.append("\\subsubsection{Macierz Jacobiego}")
        parts.append("")
        parts.append(f"$${jac.substitution_latex}$$")
        parts.append("")

    # Delta step (optional)
    if iteration.delta_step:
        delta = iteration.delta_step
        parts.append("\\subsubsection{Poprawki $\\Delta\\theta$, $\\Delta V$}")
        parts.append("")
        parts.append(f"$${delta.substitution_latex}$$")
        parts.append("")
        parts.append(f"Norma kroku: $\\|\\Delta \\mathbf{{x}}\\| = {delta.result.formatted}$")
        parts.append("")

    # State update (optional)
    if iteration.state_update_step:
        update = iteration.state_update_step
        parts.append("\\subsubsection{Aktualizacja stanu}")
        parts.append("")
        parts.append(f"$${update.substitution_latex}$$")
        parts.append("")

    # Convergence check
    conv = iteration.convergence_check
    parts.append("\\subsubsection{Sprawdzenie zbieżności}")
    parts.append("")
    parts.append(f"$${conv.substitution_latex}$$")
    parts.append("")

    status = conv.result.value
    if status == "ZBIEŻNE":
        parts.append(r"\textcolor{converged}{\textbf{Zbieżność osiągnięta!}}")
    else:
        parts.append(r"\textit{Kontynuacja iteracji...}")
    parts.append("")

    return "\n".join(parts)


def _build_convergence_section(proof: PowerFlowProofDocument) -> str:
    """Builds the convergence criterion section."""
    conv = proof.convergence_criterion

    return f"""
\\section{{Kryterium zbieżności}}

\\subsection{{Warunek zbieżności}}

$${conv.equation.latex}$$

\\subsection{{Wynik}}

$${conv.substitution_latex}$$

\\textbf{{Status:}} {_escape_latex(str(conv.result.value))}
"""


def _build_final_state_section(proof: PowerFlowProofDocument) -> str:
    """Builds the final state section."""
    final = proof.final_state

    state_rows: list[str] = []
    for bus_id, state in sorted(final.final_state.items())[:15]:
        # FAB-E (E1): brak v_pu/theta_rad/p_mw/q_mvar NIE jest wartoscia 0/1.0
        # — p_mw/q_mvar w szczegolnosci NIE sa gwarantowane (dolaczane tylko
        # dla wezlow obecnych rowniez w wynikach solvera, patrz
        # PowerFlowProofBuilder._build_final_state).
        v_pu = state.get("v_pu")
        import math

        theta_rad = state.get("theta_rad")
        theta_deg = math.degrees(theta_rad) if theta_rad is not None else None
        p_mw = state.get("p_mw")
        q_mvar = state.get("q_mvar")
        state_rows.append(
            f"{_escape_latex(bus_id)} & "
            f"{_format_float_latex_or_missing(v_pu)} & "
            f"{_format_float_latex_or_missing(theta_deg)} & "
            f"{_format_float_latex_or_missing(p_mw)} & "
            f"{_format_float_latex_or_missing(q_mvar)} \\\\"
        )

    if len(final.final_state) > 15:
        state_rows.append(
            f"\\multicolumn{{5}}{{c}}{{... ({len(final.final_state)} węzłów łącznie)}} \\\\"
        )

    balance = final.power_balance

    return f"""
\\section{{Stan końcowy}}

\\subsection{{Wyniki dla węzłów}}

\\begin{{longtable}}{{lrrrr}}
\\toprule
\\textbf{{Węzeł}} & \\textbf{{$|V|$ [p.u.]}} & \\textbf{{$\\theta$ [°]}} & \\textbf{{$P$ [MW]}} & \\textbf{{$Q$ [Mvar]}} \\\\
\\midrule
\\endfirsthead
\\toprule
\\textbf{{Węzeł}} & \\textbf{{$|V|$ [p.u.]}} & \\textbf{{$\\theta$ [°]}} & \\textbf{{$P$ [MW]}} & \\textbf{{$Q$ [Mvar]}} \\\\
\\midrule
\\endhead
{chr(10).join(state_rows)}
\\bottomrule
\\end{{longtable}}

\\subsection{{Bilans mocy}}

\\begin{{itemize}}
\\item Straty mocy czynnej: $\\sum P_{{loss}} = {_format_float_latex_math_or_missing(balance.get('total_losses_p_mw'))}$ MW
\\item Straty mocy biernej: $\\sum Q_{{loss}} = {_format_float_latex_math_or_missing(balance.get('total_losses_q_mvar'))}$ Mvar
\\item Moc węzła bilansującego: $P_{{slack}} = {_format_float_latex_math_or_missing(balance.get('slack_p_mw'))}$ MW, $Q_{{slack}} = {_format_float_latex_math_or_missing(balance.get('slack_q_mvar'))}$ Mvar
\\end{{itemize}}
"""


def _build_verification_section(proof: PowerFlowProofDocument) -> str:
    """Builds the verification section."""
    ver = proof.verification

    def _check_symbol(passed: bool) -> str:
        return r"\checkmark" if passed else r"\times"

    def _check_color(passed: bool) -> str:
        return "converged" if passed else "notconverged"

    return f"""
\\section{{Weryfikacja}}

\\begin{{tabular}}{{lcc}}
\\toprule
\\textbf{{Test}} & \\textbf{{Wynik}} & \\textbf{{Status}} \\\\
\\midrule
Spójność jednostek & \\textcolor{{{_check_color(ver.unit_consistency)}}}{{${_check_symbol(ver.unit_consistency)}$}} & {'PASS' if ver.unit_consistency else 'FAIL'} \\\\
Bilans energetyczny & \\textcolor{{{_check_color(ver.energy_balance)}}}{{${_check_symbol(ver.energy_balance)}$}} & {'PASS' if ver.energy_balance else 'FAIL'} \\\\
Brak sprzeczności & \\textcolor{{{_check_color(ver.no_contradictions)}}}{{${_check_symbol(ver.no_contradictions)}$}} & {'PASS' if ver.no_contradictions else 'FAIL'} \\\\
\\midrule
\\textbf{{Ogólny wynik}} & \\textcolor{{{_check_color(ver.all_checks_passed)}}}{{${_check_symbol(ver.all_checks_passed)}$}} & \\textbf{{{'PASS' if ver.all_checks_passed else 'FAIL'}}} \\\\
\\bottomrule
\\end{{tabular}}
"""


def _build_summary_section(proof: PowerFlowProofDocument) -> str:
    """Builds the summary section."""
    summary = proof.summary

    warnings_latex = ""
    if summary.warnings:
        warnings_latex = "\\subsection{Ostrzeżenia}\n\\begin{itemize}\n"
        for warning in summary.warnings:
            warnings_latex += f"\\item {_escape_latex(warning)}\n"
        warnings_latex += "\\end{itemize}\n"

    converged_color = "converged" if summary.converged else "notconverged"
    converged_text = "ZBIEŻNE" if summary.converged else "NIEZB."

    return f"""
\\section{{Podsumowanie}}

\\subsection{{Wyniki kluczowe}}

\\begin{{tabular}}{{ll}}
\\toprule
\\textbf{{Parametr}} & \\textbf{{Wartość}} \\\\
\\midrule
Status zbieżności & \\textcolor{{{converged_color}}}{{\\textbf{{{converged_text}}}}} \\\\
Liczba iteracji & {summary.iterations_count} \\\\
Końcowy mismatch & {_format_float_latex(summary.final_max_mismatch)} p.u. \\\\
Całkowita liczba kroków & {summary.total_steps} \\\\
Weryfikacja jednostek & {'PASS' if summary.unit_check_passed else 'FAIL'} \\\\
\\bottomrule
\\end{{tabular}}

{warnings_latex}

\\vspace{{1cm}}
\\hrule
\\vspace{{0.5cm}}
\\textit{{Dokument wygenerowany automatycznie przez MV-Design PRO.}}

\\textit{{Wersja dowodu: {proof.proof_version}}}

\\textit{{ID dokumentu: \\texttt{{{proof.document_id[:8]}...}}}}
"""


# =============================================================================
# JSON EXPORT
# =============================================================================


def export_proof_to_json(
    proof: PowerFlowProofDocument,
    path: str | Path,
    *,
    indent: int = 2,
    ensure_ascii: bool = False,
) -> Path:
    """
    Export PowerFlowProofDocument to JSON file.

    Args:
        proof: The PowerFlowProofDocument to export.
        path: Target file path (str or Path).
        indent: JSON indentation level (default: 2).
        ensure_ascii: If True, escape non-ASCII characters (default: False).

    Returns:
        Path to the written .json file.
    """
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Build export payload
    export_payload: dict[str, Any] = {
        "report_type": "power_flow_proof",
        "report_version": proof.proof_version,
        "proof_document": proof.to_dict(),
    }

    # Serialize with deterministic ordering
    json_content = json.dumps(
        export_payload,
        indent=indent,
        ensure_ascii=ensure_ascii,
        sort_keys=True,
    )

    output_path.write_text(json_content, encoding="utf-8")
    return output_path


# =============================================================================
# PDF EXPORT (via LaTeX)
# =============================================================================


def export_proof_to_pdf(
    proof: PowerFlowProofDocument,
    path: str | Path,
    *,
    latex_engine: str = "pdflatex",
    keep_tex: bool = False,
) -> Path:
    """
    Export PowerFlowProofDocument to PDF via LaTeX compilation.

    Args:
        proof: The PowerFlowProofDocument to export.
        path: Target PDF file path (str or Path).
        latex_engine: LaTeX engine to use (default: pdflatex).
        keep_tex: If True, keep the intermediate .tex file.

    Returns:
        Path to the written .pdf file.

    Raises:
        RuntimeError: If LaTeX compilation fails.

    Note:
        Requires pdflatex (or specified latex_engine) to be installed
        and available in the system PATH.
    """
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Create temporary directory for LaTeX compilation
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        tex_file = tmpdir_path / "proof.tex"

        # Export to LaTeX first
        export_proof_to_latex(proof, tex_file)

        # Compile LaTeX to PDF (run twice for TOC)
        try:
            for _ in range(2):  # Two passes for TOC
                result = subprocess.run(
                    [
                        latex_engine,
                        "-interaction=nonstopmode",
                        "-output-directory",
                        str(tmpdir_path),
                        str(tex_file),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=120,  # 2 minute timeout
                )

                if result.returncode != 0:
                    # Check if PDF was still created (LaTeX often returns non-zero with warnings)
                    pdf_in_tmp = tmpdir_path / "proof.pdf"
                    if not pdf_in_tmp.exists():
                        raise RuntimeError(
                            f"LaTeX compilation failed:\n{result.stderr}\n{result.stdout}"
                        )

            # Move PDF to output path
            pdf_in_tmp = tmpdir_path / "proof.pdf"
            if pdf_in_tmp.exists():
                import shutil

                shutil.move(str(pdf_in_tmp), str(output_path))
            else:
                raise RuntimeError("PDF file was not created")

            # Optionally keep the .tex file
            if keep_tex:
                tex_output = output_path.with_suffix(".tex")
                shutil.copy(str(tex_file), str(tex_output))

        except FileNotFoundError:
            raise RuntimeError(
                f"LaTeX engine '{latex_engine}' not found. " "Please install TeX Live or MiKTeX."
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("LaTeX compilation timed out after 120 seconds.")

    return output_path


def export_proof_to_pdf_simple(
    proof: PowerFlowProofDocument,
    path: str | Path,
) -> Path:
    """
    Export PowerFlowProofDocument to PDF using ReportLab (no LaTeX required).

    This is a fallback when LaTeX is not available.

    Args:
        proof: The PowerFlowProofDocument to export.
        path: Target PDF file path (str or Path).

    Returns:
        Path to the written .pdf file.
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError:
        raise RuntimeError(
            "ReportLab is required for PDF export without LaTeX. "
            "Install with: pip install reportlab"
        )

    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    zarejestruj_czcionki()
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        invariant=1,
        pageCompression=0,
    )

    styles = getSampleStyleSheet()
    ustaw_czcionki_stylow(styles)
    title_style = styles["Title"]
    heading_style = styles["Heading1"]
    styles["Heading2"]
    normal_style = styles["Normal"]

    story: list[Any] = []

    # Title
    story.append(Paragraph(proof.title_pl, title_style))
    story.append(Spacer(1, 0.5 * cm))

    # Header info
    story.append(Paragraph("Informacje ogólne", heading_style))
    header_data = [
        ["Projekt", proof.header.project_name],
        ["Przypadek", proof.header.case_name],
        ["Data", proof.header.run_timestamp[:19]],
        ["Wersja solvera", proof.header.solver_version],
        ["Moc bazowa", f"{proof.header.base_mva} MVA"],
        ["Tolerancja", f"{proof.header.tolerance} p.u."],
    ]
    header_table = Table(header_data, colWidths=[5 * cm, 10 * cm])
    header_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("BACKGROUND", (0, 0), (0, -1), colors.lightgrey),
                ("FONTNAME", (0, 0), (0, -1), "DejaVuSans-Bold"),
            ]
        )
    )
    story.append(header_table)
    story.append(Spacer(1, 0.5 * cm))

    # Summary
    story.append(Paragraph("Podsumowanie", heading_style))
    summary = proof.summary
    summary_data = [
        ["Status", "ZBIEŻNE" if summary.converged else "NIEZB."],
        ["Iteracje", str(summary.iterations_count)],
        ["Końcowy mismatch", f"{summary.final_max_mismatch:.6f} p.u."],
        ["Liczba kroków", str(summary.total_steps)],
    ]
    summary_table = Table(summary_data, colWidths=[5 * cm, 10 * cm])
    summary_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("BACKGROUND", (0, 0), (0, -1), colors.lightgrey),
                ("FONTNAME", (0, 0), (0, -1), "DejaVuSans-Bold"),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 0.5 * cm))

    # Verification
    story.append(Paragraph("Weryfikacja", heading_style))
    ver = proof.verification
    ver_data = [
        ["Spójność jednostek", "PASS" if ver.unit_consistency else "FAIL"],
        ["Bilans energetyczny", "PASS" if ver.energy_balance else "FAIL"],
        ["Brak sprzeczności", "PASS" if ver.no_contradictions else "FAIL"],
        ["Ogólny wynik", "PASS" if ver.all_checks_passed else "FAIL"],
    ]
    ver_table = Table(ver_data, colWidths=[5 * cm, 10 * cm])
    ver_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("BACKGROUND", (0, 0), (0, -1), colors.lightgrey),
                ("FONTNAME", (0, 0), (0, -1), "DejaVuSans-Bold"),
            ]
        )
    )
    story.append(ver_table)
    story.append(Spacer(1, 0.5 * cm))

    # Iterations summary
    story.append(Paragraph("Przebieg iteracji", heading_style))
    iter_data = [["k", "max|Δf|", "Status"]]
    for it in proof.iterations:
        status = "✓" if it.convergence_check.result.value == "ZBIEŻNE" else "→"
        iter_data.append(
            [
                str(it.iteration_number),
                (
                    f"{it.mismatch_step.result.value:.6f}"
                    if isinstance(it.mismatch_step.result.value, float)
                    else str(it.mismatch_step.result.value)
                ),
                status,
            ]
        )
    iter_table = Table(iter_data, colWidths=[2 * cm, 5 * cm, 3 * cm])
    iter_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ]
        )
    )
    story.append(iter_table)

    # Footer
    story.append(Spacer(1, 1 * cm))
    story.append(
        Paragraph(
            f"Dokument wygenerowany przez MV-Design PRO. "
            f"Wersja dowodu: {proof.proof_version}. "
            f"ID: {proof.document_id[:8]}...",
            normal_style,
        )
    )

    doc.build(story)
    return output_path
