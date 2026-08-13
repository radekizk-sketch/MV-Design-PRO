"""
LaTeX Renderer — Generator dokumentów LaTeX dla Proof Engine P11.1a/P11.1b

STATUS: CANONICAL & BINDING
Reference: P11_1a_MVP_SC3F_AND_VDROP.md

Generuje dokumenty LaTeX z ProofDocument:
- Format blokowy ($$...$$) WYŁĄCZNIE
- Bez inline LaTeX
- Terminologia normowa PN-EN (PL)
- Obsługa Q(U) (P11.1b) z tabelą counterfactual A/B/Δ
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from application.proof_engine.types import ProofDocument, ProofStep, ProofValue


class LaTeXRenderer:
    """
    Renderer dokumentów LaTeX dla ProofDocument.

    Generuje pełny dokument LaTeX z:
    - Nagłówkiem
    - Krokami dowodu
    - Podsumowaniem wyników
    - Tabelą wyników końcowych
    """

    PREAMBLE = r"""
\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[polish]{babel}
\usepackage{amsmath,amssymb}
\usepackage{booktabs}
\usepackage{geometry}
\usepackage{fancyhdr}
\usepackage{lastpage}
\usepackage{xcolor}

\geometry{margin=2.5cm}

\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\textit{MV-DESIGN-PRO — Proof Engine}}
\fancyhead[R]{\textit{Dowód matematyczny}}
\fancyfoot[C]{\thepage\ / \pageref{LastPage}}

\definecolor{resultbox}{RGB}{230,245,230}

\newcommand{\resultbox}[1]{%
  \colorbox{resultbox}{\parbox{0.9\textwidth}{\centering #1}}%
}

"""

    @classmethod
    def render(cls, doc: ProofDocument) -> str:
        """
        Renderuje ProofDocument do LaTeX.

        Args:
            doc: ProofDocument do renderowania

        Returns:
            Pełny dokument LaTeX jako string
        """
        parts = [
            cls.PREAMBLE,
            cls._render_title(doc),
            r"\begin{document}",
            r"\maketitle",
            r"\tableofcontents",
            r"\newpage",
            cls._render_header(doc),
            cls._render_load_flow_voltage_section(doc),
            cls._render_losses_energy_section(doc),
            cls._render_steps(doc),
            cls._render_summary(doc),
            r"\end{document}",
        ]
        return "\n\n".join(parts)

    @classmethod
    def _render_title(cls, doc: ProofDocument) -> str:
        """Renderuje nagłówek dokumentu."""
        return rf"""
\title{{{doc.title_pl}}}
\author{{MV-DESIGN-PRO}}
\date{{{doc.created_at.strftime('%Y-%m-%d %H:%M:%S')}}}
"""

    @classmethod
    def _render_header(cls, doc: ProofDocument) -> str:
        """Renderuje sekcję danych wejściowych."""
        h = doc.header
        lines = [
            r"\section{Dane wejściowe}",
            r"\begin{itemize}",
            rf"  \item Projekt: {cls._escape(h.project_name)}",
            rf"  \item Przypadek: {cls._escape(h.case_name)}",
            rf"  \item Wersja solvera: {cls._escape(h.solver_version)}",
        ]

        if h.target_id:
            lines.append(rf"  \item Element: {cls._escape(h.target_id)}")
        if h.element_kind:
            lines.append(rf"  \item Typ elementu: {cls._escape(h.element_kind)}")
        if h.fault_location:
            lines.append(rf"  \item Miejsce zwarcia: {cls._escape(h.fault_location)}")
        if h.fault_type:
            lines.append(rf"  \item Typ zwarcia: {cls._escape(h.fault_type)}")
        if h.voltage_factor is not None:
            lines.append(r"  \item Współczynnik napięciowy:")
            lines.append(cls._math_block(f"c = {h.voltage_factor:.4f}"))
        if h.source_bus:
            lines.append(rf"  \item Szyna źródłowa: {cls._escape(h.source_bus)}")
        if h.target_bus:
            lines.append(rf"  \item Szyna docelowa: {cls._escape(h.target_bus)}")

        lines.append(r"\end{itemize}")
        return "\n".join(lines)

    @classmethod
    def _render_steps(cls, doc: ProofDocument) -> str:
        """Renderuje kroki dowodu."""
        lines = [r"\section{Dowód}"]

        for step in sorted(doc.steps, key=lambda s: s.step_number):
            lines.append(cls._render_step(step))

        return "\n\n".join(lines)

    @classmethod
    def _render_step(cls, step: ProofStep) -> str:
        """Renderuje pojedynczy krok dowodu."""
        parts = [
            rf"\subsection{{Krok {step.step_number}: {cls._escape(step.title_pl)}}}",
            "",
            r"\textbf{Wzór:}",
            cls._math_block(step.equation.latex.strip()),
            "",
            r"\textbf{Dane:}",
            r"\begin{itemize}",
        ]

        # Sortowanie input_values alfabetycznie po symbol (determinizm)
        sorted_inputs = sorted(step.input_values, key=lambda v: v.symbol)
        for val in sorted_inputs:
            parts.append(r"  \item")
            parts.append(cls._math_block(f"{val.symbol} = {cls._format_value_latex(val)}"))

        parts.extend(
            [
                r"\end{itemize}",
                "",
                r"\textbf{Podstawienie:}",
                cls._math_block(step.substitution_latex),
                "",
                r"\textbf{Wynik:}",
                r"\begin{center}",
                cls._math_block(f"{step.result.symbol} = {cls._format_value_latex(step.result)}"),
                r"\end{center}",
                "",
                r"\textbf{Weryfikacja jednostek:}",
                cls._math_block(step.unit_check.derivation),
            ]
        )

        return "\n".join(parts)

    @classmethod
    def _render_summary(cls, doc: ProofDocument) -> str:
        """Renderuje podsumowanie wyników."""
        lines = [
            r"\section{Podsumowanie wyników}",
            "",
        ]

        # Sprawdź czy to Q(U) counterfactual (ma klucze delta_*)
        is_counterfactual = (
            "delta_k_q" in doc.summary.key_results
            and "delta_q_raw" in doc.summary.key_results
            and "delta_q_cmd" in doc.summary.key_results
        )

        is_lc_counterfactual = bool(doc.summary.counterfactual_diff)

        # P11.1c: Sprawdź czy ma dane VDROP (wpływ Q na U)
        has_vdrop_link = "vdrop_u_kv" in doc.summary.key_results

        if is_counterfactual:
            lines.extend(cls._render_counterfactual_table(doc))
        elif is_lc_counterfactual:
            lines.extend(cls._render_load_currents_counterfactual_table(doc))
        elif has_vdrop_link:
            # P11.1c: Sekcja "Wpływ Q na U"
            lines.extend(cls._render_vdrop_link_section(doc))
            lines.append("")
            lines.append(r"\textbf{Wyniki końcowe:}")
            lines.append(r"\begin{itemize}")

            # Sortowanie key_results alfabetycznie (determinizm)
            for key in sorted(doc.summary.key_results.keys()):
                val = doc.summary.key_results[key]
                value_str = cls._format_numeric_value(val.value)
                lines.append(r"  \item")
                lines.append(cls._math_block(f"{val.symbol} = {value_str}\\,\\text{{{val.unit}}}"))

            lines.append(r"\end{itemize}")
        else:
            lines.append(r"\textbf{Wyniki końcowe:}")
            lines.append(r"\begin{itemize}")

            # Sortowanie key_results alfabetycznie (determinizm)
            for key in sorted(doc.summary.key_results.keys()):
                val = doc.summary.key_results[key]
                value_str = cls._format_numeric_value(val.value)
                lines.append(r"  \item")
                lines.append(cls._math_block(f"{val.symbol} = {value_str}\\,\\text{{{val.unit}}}"))

            lines.append(r"\end{itemize}")

        lines.extend(
            [
                "",
                rf"Liczba kroków: {doc.summary.total_steps}",
                "",
                r"Weryfikacja jednostek: "
                + (
                    r"\textcolor{green}{PASS}"
                    if doc.summary.unit_check_passed
                    else r"\textcolor{red}{FAIL}"
                ),
            ]
        )

        if doc.summary.warnings:
            lines.append("")
            lines.append(r"\textbf{Ostrzeżenia:}")
            lines.append(r"\begin{itemize}")
            for warning in doc.summary.warnings:
                lines.append(rf"  \item {cls._escape(warning)}")
            lines.append(r"\end{itemize}")

        return "\n".join(lines)

    @classmethod
    def _render_losses_energy_section(cls, doc: ProofDocument) -> str:
        """Renderuje sekcję profilu energii strat dla P17."""
        from application.proof_engine.types import ProofType

        if doc.proof_type != ProofType.LOSSES_ENERGY:
            return ""

        rows: list[tuple[float, float, float, float]] = []
        current_t_i: float | None = None
        current_delta_t: float | None = None

        for step in sorted(doc.steps, key=lambda s: s.step_number):
            eq_id = step.equation.equation_id
            if eq_id == "EQ_LE_001":
                values = {val.symbol: val.value for val in step.input_values}
                current_t_i = float(values.get("t_i", 0.0))
                current_delta_t = float(step.result.value)
            elif eq_id == "EQ_LE_002":
                values = {val.symbol: val.value for val in step.input_values}
                p_loss = float(values.get("P_{loss,i}", 0.0))
                delta_t = float(values.get("\\Delta t_i", current_delta_t or 0.0))
                e_i = float(step.result.value)
                t_i = float(current_t_i or 0.0)
                rows.append((t_i, p_loss, delta_t, e_i))
            elif eq_id == "EQ_LE_004":
                values = {val.symbol: val.value for val in step.input_values}
                p_loss = float(values.get("P_{loss}", 0.0))
                duration_h = float(values.get("t", 0.0))
                e_i = float(step.result.value)
                rows.append((duration_h, p_loss, duration_h, e_i))

        lines = [
            r"\section{Energia strat}",
            "",
            r"\textbf{Profil czasowy:}",
            "",
            r"\begin{center}",
            r"\begin{tabular}{cccc}",
            r"\toprule",
            r"$$t_i$$ & $$P_{loss,i}$$ & $$\Delta t_i$$ & $$E_i$$ \\",
            r"\midrule",
        ]

        for t_i, p_loss, delta_t, e_i in rows:
            lines.append(
                rf"$$ {t_i:.4f}\,\text{{h}} $$ & "
                rf"$$ {p_loss:.4f}\,\text{{kW}} $$ & "
                rf"$$ {delta_t:.4f}\,\text{{h}} $$ & "
                rf"$$ {e_i:.4f}\,\text{{kWh}} $$ \\"
            )

        lines.extend(
            [
                r"\bottomrule",
                r"\end{tabular}",
                r"\end{center}",
            ]
        )

        return "\n".join(lines)

    @classmethod
    def _render_counterfactual_table(cls, doc: ProofDocument) -> list[str]:
        """Renderuje tabelę A/B/Δ dla counterfactual Q(U)."""
        kr = doc.summary.key_results

        q_cmd_a = kr["q_cmd_a"].value
        q_cmd_b = kr["q_cmd_b"].value
        delta_k_q = kr["delta_k_q"].value
        delta_q_raw = kr["delta_q_raw"].value
        delta_q_cmd = kr["delta_q_cmd"].value

        lines = [
            r"\textbf{Porównanie scenariuszy A vs B:}",
            "",
            r"\begin{center}",
            r"\begin{tabular}{lccc}",
            r"\toprule",
            r"\textbf{Wielkość} & \textbf{A} & \textbf{B} & \textbf{$\Delta$ (B-A)} \\",
            r"\midrule",
        ]

        # Q_cmd row
        lines.append(rf"$Q_{{cmd}}$ [Mvar] & {q_cmd_a:.4f} & {q_cmd_b:.4f} & {delta_q_cmd:.4f} \\")

        # P11.1c: Dodaj wiersz U jeśli dane VDROP są dostępne
        if "u_a_kv" in kr and "u_b_kv" in kr and "delta_u_voltage_kv" in kr:
            u_a = kr["u_a_kv"].value
            u_b = kr["u_b_kv"].value
            delta_u = kr["delta_u_voltage_kv"].value
            lines.append(rf"$U$ [kV] & {u_a:.4f} & {u_b:.4f} & {delta_u:.4f} \\")

        lines.extend(
            [
                r"\bottomrule",
                r"\end{tabular}",
                r"\end{center}",
                "",
                r"\textbf{Różnice (counterfactual diff):}",
                r"\begin{itemize}",
            ]
        )

        lines.append(r"  \item")
        lines.append(cls._math_block(f"\\Delta k_Q = {delta_k_q:.4f}\\,\\text{{Mvar/kV}}"))
        lines.append(r"  \item")
        lines.append(cls._math_block(f"\\Delta Q_{{raw}} = {delta_q_raw:.4f}\\,\\text{{Mvar}}"))
        lines.append(r"  \item")
        lines.append(cls._math_block(f"\\Delta Q_{{cmd}} = {delta_q_cmd:.4f}\\,\\text{{Mvar}}"))

        # P11.1c: Dodaj delta U jeśli dostępne
        if "delta_u_voltage_kv" in kr:
            delta_u = kr["delta_u_voltage_kv"].value
            lines.append(r"  \item")
            lines.append(cls._math_block(f"\\Delta U_{{(B-A)}} = {delta_u:.4f}\\,\\text{{kV}}"))

        lines.append(r"\end{itemize}")

        return lines

    @classmethod
    def _render_load_flow_voltage_section(cls, doc: ProofDocument) -> str:
        """Renderuje sekcję P32: Load Flow i spadki napięć."""
        from application.proof_engine.types import ProofType

        if doc.proof_type != ProofType.LOAD_FLOW_VOLTAGE:
            return ""

        bus_rows: dict[str, dict[str, float | str | None]] = {}
        element_rows: dict[str, dict[str, float | str | None]] = {}

        for step in doc.steps:
            bus_id = step.source_keys.get("bus_id")
            element_id = step.source_keys.get("element_id")
            eq_id = step.equation.equation_id

            if bus_id:
                entry = bus_rows.setdefault(bus_id, {})
                values = {val.symbol: val.value for val in step.input_values}
                if "U" in values:
                    entry["u_ll_kv"] = values.get("U")
                if "U_{n}" in values:
                    entry["u_nom_kv"] = values.get("U_{n}")
                if eq_id == "EQ_LF_006":
                    entry["u_pu"] = step.result.value
                if eq_id == "EQ_LF_007":
                    entry["delta_pct"] = step.result.value

            if element_id:
                entry = element_rows.setdefault(element_id, {})
                entry["element_kind"] = step.source_keys.get("element_kind")
                values = {val.symbol: val.value for val in step.input_values}
                if "R" in values:
                    entry["r_ohm"] = values.get("R")
                if "X" in values:
                    entry["x_ohm"] = values.get("X")
                if "P" in values:
                    entry["p_mw"] = values.get("P")
                if "Q" in values:
                    entry["q_mvar"] = values.get("Q")
                if eq_id == "EQ_LF_003":
                    entry["delta_u_r_kv"] = step.result.value
                if eq_id == "EQ_LF_004":
                    entry["delta_u_x_kv"] = step.result.value
                if eq_id == "EQ_LF_005":
                    entry["delta_u_kv"] = step.result.value

        def _cell(value: float | str | None, unit: str) -> str:
            formatted = "—" if value is None else cls._format_numeric_value(value)
            return rf"$$ {formatted}\,\text{{{unit}}} $$"

        lines = [
            r"\section{Load Flow i spadki napięć}",
            "",
            r"\textbf{Tabela BUS:}",
            "",
            r"\begin{center}",
            r"\begin{tabular}{lcccc}",
            r"\toprule",
            r"$$\text{BUS}$$ & $$U_{n}$$ & $$U$$ & $$U_{pu}$$ & $$\delta_{U}$$ \\",
            r"\midrule",
        ]

        percent_unit = r"\%"
        for bus_id in sorted(bus_rows.keys()):
            entry = bus_rows[bus_id]
            lines.append(
                rf"$$\text{{{cls._escape(bus_id)}}}$$ & "
                rf"{_cell(entry.get('u_nom_kv'), 'kV')} & "
                rf"{_cell(entry.get('u_ll_kv'), 'kV')} & "
                rf"{_cell(entry.get('u_pu'), 'p.u.')} & "
                rf"{_cell(entry.get('delta_pct'), percent_unit)} \\"
            )

        lines.extend(
            [
                r"\bottomrule",
                r"\end{tabular}",
                r"\end{center}",
                "",
                r"\textbf{Tabela elementów:}",
                "",
                r"\begin{center}",
                r"\begin{tabular}{lccccccc}",
                r"\toprule",
                r"$$\text{Element}$$ & $$\text{Typ}$$ & $$R$$ & $$X$$ & $$P$$ & $$Q$$ & $$\Delta U_{R}$$ & $$\Delta U_{X}$$ \\",
                r"\midrule",
            ]
        )

        for element_id in sorted(element_rows.keys()):
            entry = element_rows[element_id]
            lines.append(
                rf"$$\text{{{cls._escape(element_id)}}}$$ & "
                rf"$$\text{{{cls._escape(str(entry.get('element_kind') or '—'))}}}$$ & "
                rf"{_cell(entry.get('r_ohm'), 'Ω')} & "
                rf"{_cell(entry.get('x_ohm'), 'Ω')} & "
                rf"{_cell(entry.get('p_mw'), 'MW')} & "
                rf"{_cell(entry.get('q_mvar'), 'Mvar')} & "
                rf"{_cell(entry.get('delta_u_r_kv'), 'kV')} & "
                rf"{_cell(entry.get('delta_u_x_kv'), 'kV')} \\"
            )

        lines.extend(
            [
                r"\bottomrule",
                r"\end{tabular}",
                r"\end{center}",
            ]
        )

        if element_rows:
            lines.extend(
                [
                    "",
                    r"\textbf{Spadek całkowity elementów:}",
                    "",
                    r"\begin{center}",
                    r"\begin{tabular}{lc}",
                    r"\toprule",
                    r"$$\text{Element}$$ & $$\Delta U$$ \\",
                    r"\midrule",
                ]
            )
            for element_id in sorted(element_rows.keys()):
                entry = element_rows[element_id]
                lines.append(
                    rf"$$\text{{{cls._escape(element_id)}}}$$ & "
                    rf"{_cell(entry.get('delta_u_kv'), 'kV')} \\"
                )
            lines.extend(
                [
                    r"\bottomrule",
                    r"\end{tabular}",
                    r"\end{center}",
                ]
            )

        return "\n".join(lines)

    @classmethod
    def _render_load_currents_counterfactual_table(cls, doc: ProofDocument) -> list[str]:
        """Renderuje tabelę A/B/Δ dla counterfactual P15."""
        kr = doc.summary.key_results
        diff = doc.summary.counterfactual_diff

        rows: list[tuple[str, str, str, str]] = []

        def _add_row(key: str, label: str, unit: str) -> None:
            key_a = f"{key}_a"
            key_b = f"{key}_b"
            key_d = f"delta_{key}"
            if key_a in kr and key_b in kr and key_d in diff:
                a_val = cls._format_numeric_value(kr[key_a].value)
                b_val = cls._format_numeric_value(kr[key_b].value)
                d_val = cls._format_numeric_value(diff[key_d].value)
                rows.append((f"{label} [{unit}]", a_val, b_val, d_val))

        _add_row("s_mva", "S", "MVA")
        _add_row("i_ka", "I", "kA")
        _add_row("k_i_percent", "k_I", "%")
        _add_row("m_i_percent", "m_I", "%")
        _add_row("k_s_percent", "k_S", "%")
        _add_row("m_s_percent", "m_S", "%")

        lines = [
            r"\textbf{Porównanie scenariuszy A vs B (P15):}",
            "",
            r"\begin{center}",
            r"\begin{tabular}{lccc}",
            r"\toprule",
            r"\textbf{Wielkość} & \textbf{A} & \textbf{B} & \textbf{$\Delta$ (B-A)} \\",
            r"\midrule",
        ]

        for label, a_val, b_val, d_val in rows:
            lines.append(rf"{label} & {a_val} & {b_val} & {d_val} \\")

        lines.extend(
            [
                r"\bottomrule",
                r"\end{tabular}",
                r"\end{center}",
                "",
                r"\textbf{Różnice (counterfactual diff):}",
                r"\begin{itemize}",
            ]
        )

        for _key, val in sorted(diff.items()):
            lines.append(r"  \item")
            lines.append(
                cls._math_block(
                    f"{val.symbol} = {cls._format_numeric_value(val.value)}\\,\\text{{{val.unit}}}"
                )
            )

        lines.append(r"\end{itemize}")

        return lines

    @classmethod
    def _render_vdrop_link_section(cls, doc: ProofDocument) -> list[str]:
        """
        P11.1c: Renderuje sekcję "Wpływ Q na U".

        Pokazuje tabelę z Q_cmd i wynikami VDROP (ΔU_X, ΔU, U).
        """
        kr = doc.summary.key_results

        q_cmd = kr["q_cmd_mvar"].value
        delta_u_x = kr["vdrop_delta_u_x_percent"].value
        delta_u = kr["vdrop_delta_u_percent"].value
        u = kr["vdrop_u_kv"].value

        lines = [
            r"\subsection{Wpływ Q na U}",
            "",
            r"\textbf{Łańcuch zależności Q(U) → VDROP:}",
            "",
            cls._math_block(r"Q_{cmd} \xrightarrow{\text{VDROP}} \Delta U_X \to \Delta U \to U"),
            "",
            r"\begin{center}",
            r"\begin{tabular}{lcc}",
            r"\toprule",
            r"\textbf{Wielkość} & \textbf{Wartość} & \textbf{Jednostka} \\",
            r"\midrule",
            rf"$Q_{{cmd}}$ & {q_cmd:.4f} & Mvar \\",
            rf"$\Delta U_X$ & {delta_u_x:.4f} & \% \\",
            rf"$\Delta U$ & {delta_u:.4f} & \% \\",
            rf"$U$ & {u:.4f} & kV \\",
            r"\bottomrule",
            r"\end{tabular}",
            r"\end{center}",
            "",
            r"\textit{Uwaga: Wartości VDROP pochodzą z istniejących obliczeń "
            r"(EQ\_VDROP\_004..007). Ten krok nie wykonuje nowych obliczeń.}",
        ]

        return lines

    @staticmethod
    def _math_block(latex: str) -> str:
        """Opakowuje LaTeX w blok $$...$$."""
        return f"$$\n{latex}\n$$"

    @classmethod
    def _escape(cls, text: str) -> str:
        """Escape specjalnych znaków LaTeX."""
        replacements = {
            "&": r"\&",
            "%": r"\%",
            "$": r"\$",
            "#": r"\#",
            "_": r"\_",
            "{": r"\{",
            "}": r"\}",
            "~": r"\textasciitilde{}",
            "^": r"\textasciicircum{}",
        }
        for char, replacement in replacements.items():
            text = text.replace(char, replacement)
        return text

    @classmethod
    def _format_value_latex(cls, val: ProofValue) -> str:
        """Formatuje wartość do LaTeX."""
        if isinstance(val.value, complex):
            r = val.value.real
            i = val.value.imag
            sign = "+" if i >= 0 else "-"
            return rf"{r:.4f} {sign} j{abs(i):.4f}\,\text{{{val.unit}}}"
        elif isinstance(val.value, int | float):
            return rf"{val.value:.4f}\,\text{{{val.unit}}}"
        else:
            return rf"{val.value}\,\text{{{val.unit}}}"

    @classmethod
    def _format_numeric_value(cls, value: float | complex | str) -> str:
        """Formatuje wartość numeryczną."""
        if isinstance(value, complex):
            r = value.real
            i = value.imag
            sign = "+" if i >= 0 else "-"
            return f"{r:.4f} {sign} j{abs(i):.4f}"
        elif isinstance(value, int | float):
            return f"{value:.4f}"
        else:
            return str(value)
