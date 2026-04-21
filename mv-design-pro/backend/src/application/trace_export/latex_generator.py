"""
LaTeXGenerator — deterministic LaTeX export from TraceArtifactV2 (PR-38).

INVARIANTS:
- Deterministic: same TraceArtifactV2 → same LaTeX output (byte-for-byte)
- No timestamps in signature block
- Stable numbering (equation/step numbers from step_id sort order)
- Structure: Inputs → Equations → Steps → Outputs → Signature footer

Input: TraceArtifactV2 + EquationRegistryV2
Output: LaTeX string
"""

from __future__ import annotations

from domain.trace_v2.artifact import TraceArtifactV2
from domain.trace_v2.equation_registry_v2 import EquationRegistryV2


class LaTeXGenerator:
    """Deterministic LaTeX generator for Trace v2."""

    def __init__(self, registry: EquationRegistryV2 | None = None) -> None:
        self._registry = registry or EquationRegistryV2.default()

    def generate(self, artifact: TraceArtifactV2) -> str:
        """Generate complete LaTeX document from TraceArtifactV2.

        Returns:
            LaTeX string (deterministic)
        """
        sections: list[str] = []
        sections.append(self._preamble(artifact))
        sections.append(self._section_inputs(artifact))
        sections.append(self._section_equations())
        sections.append(self._section_steps(artifact))
        sections.append(self._section_outputs(artifact))
        sections.append(self._section_signature(artifact))
        sections.append(self._postamble())
        return "\n\n".join(sections)

    def _preamble(self, artifact: TraceArtifactV2) -> str:
        analysis_labels = {
            "SC": "Obliczenia zwarciowe (IEC 60909)",
            "PROTECTION": "Analiza zabezpieczeń",
            "LOAD_FLOW": "Rozpływ mocy",
        }
        title = analysis_labels.get(artifact.analysis_type.value, artifact.analysis_type.value)
        return (
            r"\documentclass[a4paper,11pt]{article}"
            "\n"
            r"\usepackage[utf8]{inputenc}"
            "\n"
            r"\usepackage[T1]{fontenc}"
            "\n"
            r"\usepackage[polish]{babel}"
            "\n"
            r"\usepackage{amsmath,amssymb}"
            "\n"
            r"\usepackage{booktabs}"
            "\n"
            r"\usepackage{longtable}"
            "\n"
            r"\usepackage[margin=20mm]{geometry}"
            "\n"
            "\n"
            r"\begin{document}"
            "\n"
            "\n"
            rf"\section*{{{title}}}"
            "\n"
            rf"\textbf{{MathSpecVersion:}} {artifact.math_spec_version} \\"
            "\n"
            rf"\textbf{{Analiza:}} {artifact.analysis_type.value} \\"
            "\n"
            rf"\textbf{{Trace ID:}} \texttt{{{artifact.trace_id}}}"
        )

    def _section_inputs(self, artifact: TraceArtifactV2) -> str:
        lines = [r"\subsection*{Dane wejściowe}", ""]
        lines.append(r"\begin{longtable}{lllp{6cm}}")
        lines.append(r"\toprule")
        lines.append(r"\textbf{Zmienna} & \textbf{Wartość} & \textbf{Jednostka} & \textbf{Opis} \\")
        lines.append(r"\midrule")
        lines.append(r"\endhead")

        for key in sorted(artifact.inputs.keys()):
            tv = artifact.inputs[key]
            val = _escape_latex(str(tv.value))
            lines.append(
                rf"\texttt{{{_escape_latex(tv.name)}}} & {val} & {_escape_latex(tv.unit)} & {_escape_latex(tv.label_pl)} \\"
            )

        lines.append(r"\bottomrule")
        lines.append(r"\end{longtable}")
        return "\n".join(lines)

    def _section_equations(self) -> str:
        lines = [r"\subsection*{Rejestr równań}", ""]

        used_eqs = self._registry.all_entries()
        for eq in sorted(used_eqs, key=lambda e: e.eq_id):
            lines.append(
                rf"\paragraph{{{_escape_latex(eq.label_pl)} ({_escape_latex(eq.eq_id)})}}~\\"
            )
            lines.append(rf"Źródło: {_escape_latex(eq.source_norm)} \\")
            lines.append(r"\begin{equation*}")
            lines.append(f"  {eq.latex_symbolic}")
            lines.append(r"\end{equation*}")
            lines.append("")

        return "\n".join(lines)

    def _section_steps(self, artifact: TraceArtifactV2) -> str:
        lines = [r"\subsection*{Kroki obliczeniowe}", ""]

        sorted_steps = sorted(artifact.equation_steps, key=lambda s: s.step_id)
        for idx, step in enumerate(sorted_steps, 1):
            lines.append(rf"\subsubsection*{{Krok {idx}: {_escape_latex(step.label_pl)}}}")
            lines.append(
                rf"\textbf{{ID:}} \texttt{{{_escape_latex(step.step_id)}}}, "
                rf"\textbf{{Równanie:}} \texttt{{{_escape_latex(step.eq_id)}}}, "
                rf"\textbf{{Obiekt:}} \texttt{{{_escape_latex(step.subject_id)}}}"
            )
            lines.append("")

            # Symbolic formula
            lines.append(r"\textbf{Wzór symboliczny:}")
            lines.append(r"\begin{equation*}")
            lines.append(f"  {step.symbolic_latex}")
            lines.append(r"\end{equation*}")

            # Substitution
            if step.substituted_latex:
                lines.append(r"\textbf{Podstawienie:}")
                lines.append(r"\begin{equation*}")
                lines.append(f"  {step.substituted_latex}")
                lines.append(r"\end{equation*}")

            # Intermediate values
            if step.intermediate_values:
                lines.append(r"\textbf{Wartości pośrednie:}")
                lines.append(r"\begin{longtable}{lll}")
                lines.append(r"\toprule")
                lines.append(r"\textbf{Zmienna} & \textbf{Wartość} & \textbf{Jednostka} \\")
                lines.append(r"\midrule")
                for k in sorted(step.intermediate_values.keys()):
                    iv = step.intermediate_values[k]
                    lines.append(
                        rf"\texttt{{{_escape_latex(iv.name)}}} & {_escape_latex(str(iv.value))} & {_escape_latex(iv.unit)} \\"
                    )
                lines.append(r"\bottomrule")
                lines.append(r"\end{longtable}")

            # Result
            lines.append(
                rf"\textbf{{Wynik:}} ${_escape_latex(step.result.name)} = "
                rf"{_escape_latex(str(step.result.value))}$ "
                rf"[{_escape_latex(step.result.unit)}]"
            )
            lines.append(rf"\textbf{{Pochodzenie:}} {_escape_latex(step.origin)}")
            lines.append("")

        return "\n".join(lines)

    def _section_outputs(self, artifact: TraceArtifactV2) -> str:
        lines = [r"\subsection*{Wyniki}", ""]
        lines.append(r"\begin{longtable}{lllp{6cm}}")
        lines.append(r"\toprule")
        lines.append(r"\textbf{Zmienna} & \textbf{Wartość} & \textbf{Jednostka} & \textbf{Opis} \\")
        lines.append(r"\midrule")
        lines.append(r"\endhead")

        for key in sorted(artifact.outputs.keys()):
            tv = artifact.outputs[key]
            val = _escape_latex(str(tv.value))
            lines.append(
                rf"\texttt{{{_escape_latex(tv.name)}}} & {val} & {_escape_latex(tv.unit)} & {_escape_latex(tv.label_pl)} \\"
            )

        lines.append(r"\bottomrule")
        lines.append(r"\end{longtable}")
        return "\n".join(lines)

    def _section_signature(self, artifact: TraceArtifactV2) -> str:
        lines = [
            r"\subsection*{Podpisy}",
            "",
            r"\begin{description}",
            rf"\item[SnapshotHash] \texttt{{{artifact.snapshot_hash}}}",
            rf"\item[RunHash] \texttt{{{artifact.run_hash}}}",
            rf"\item[MathSpecVersion] {artifact.math_spec_version}",
            rf"\item[TraceSignature] \texttt{{{artifact.trace_signature}}}",
            r"\end{description}",
        ]
        return "\n".join(lines)

    def _postamble(self) -> str:
        return r"\end{document}"


def _escape_latex(text: str) -> str:
    """Escape special LaTeX characters."""
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
    # Don't escape backslashes that are already LaTeX commands
    # Only escape raw text, not LaTeX commands
    for old, new in replacements:
        # Simple approach: only escape if it's clearly not a LaTeX command
        if old == "\\":
            continue  # Skip backslash escaping for LaTeX content
        text = text.replace(old, new)
    return text
