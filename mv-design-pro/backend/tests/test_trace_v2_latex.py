"""
Tests for LaTeXGenerator — PR-38.

Tests:
- Golden LaTeX output structure
- Stable numbering (same input → same numbers)
- No timestamps in signature block
"""

from __future__ import annotations

from application.trace_export.latex_generator import LaTeXGenerator
from domain.trace_v2.artifact import (
    AnalysisTypeV2,
    TraceArtifactV2,
    TraceEquationStep,
    TraceValue,
    build_trace_artifact_v2,
)


def _tv(name: str, value: float, unit: str = "A") -> TraceValue:
    return TraceValue(name=name, value=value, unit=unit, label_pl=name)


def _step(step_id: str) -> TraceEquationStep:
    return TraceEquationStep(
        step_id=step_id,
        subject_id="bus_01",
        eq_id="SC_IKSS",
        label_pl="Prąd zwarciowy początkowy",
        symbolic_latex=r"I_{k}'' = \frac{c \cdot U_n}{|Z_k|}",
        substituted_latex=r"\frac{1.1 \cdot 20000}{3.534} = 3500",
        inputs_used=("c_factor", "un_v"),
        intermediate_values={
            "c_factor": _tv("c_factor", 1.1, "—"),
        },
        result=_tv("ikss_a", 3500.0),
        origin="solver",
    )


def _artifact() -> TraceArtifactV2:
    return build_trace_artifact_v2(
        trace_id="test-trace-latex",
        analysis_type=AnalysisTypeV2.SC,
        math_spec_version="1.0.0",
        snapshot_hash="abc123",
        run_hash="hash456",
        inputs={"un_v": _tv("un_v", 20000.0, "V")},
        equation_steps=[_step("SC_IKSS_001")],
        outputs={"ikss_a": _tv("ikss_a", 3500.0)},
    )


class TestLaTeXGenerator:
    def test_generates_document(self) -> None:
        gen = LaTeXGenerator()
        latex = gen.generate(_artifact())
        assert r"\documentclass" in latex
        assert r"\begin{document}" in latex
        assert r"\end{document}" in latex

    def test_contains_inputs_section(self) -> None:
        gen = LaTeXGenerator()
        latex = gen.generate(_artifact())
        assert "Dane wejściowe" in latex  # Polish section header

    def test_contains_steps_section(self) -> None:
        gen = LaTeXGenerator()
        latex = gen.generate(_artifact())
        assert "Kroki obliczeniowe" in latex

    def test_contains_outputs_section(self) -> None:
        gen = LaTeXGenerator()
        latex = gen.generate(_artifact())
        assert "Wyniki" in latex

    def test_contains_signature_block(self) -> None:
        gen = LaTeXGenerator()
        latex = gen.generate(_artifact())
        assert "SnapshotHash" in latex
        assert "RunHash" in latex
        assert "MathSpecVersion" in latex
        assert "TraceSignature" in latex
        assert "abc123" in latex  # snapshot_hash
        assert "hash456" in latex  # run_hash

    def test_no_timestamps_in_signature(self) -> None:
        gen = LaTeXGenerator()
        latex = gen.generate(_artifact())
        # Signature section should not contain date/time patterns
        import re

        sig_section = latex[latex.index("Podpisy") :]
        # No ISO timestamp pattern
        assert not re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", sig_section)

    def test_stable_numbering(self) -> None:
        gen = LaTeXGenerator()
        latex1 = gen.generate(_artifact())
        latex2 = gen.generate(_artifact())
        assert latex1 == latex2

    def test_math_spec_version_in_header(self) -> None:
        gen = LaTeXGenerator()
        latex = gen.generate(_artifact())
        assert "1.0.0" in latex
