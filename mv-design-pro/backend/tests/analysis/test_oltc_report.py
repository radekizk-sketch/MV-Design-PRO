"""OLTC report section (V12K-045, §14) — reads a real oltc_control trace."""

from __future__ import annotations

from analysis.reporting.oltc_report import (
    build_oltc_report_section,
    render_oltc_report_latex,
    render_oltc_report_text,
)
from network_model.solvers.power_flow_oltc import solve_with_oltc

from tests.network_model.solvers.test_power_flow_oltc import _build_input, _oltc, _solve_once


def _real_trace():
    _solution, trace = solve_with_oltc(_build_input(_oltc()), _solve_once)
    return trace


class TestReportSection:
    def test_empty_when_no_oltc(self):
        section = build_oltc_report_section(None)
        assert section.present is False
        assert "brak automatycznej regulacji" in render_oltc_report_text(section).lower()

    def test_section_from_real_trace(self):
        section = build_oltc_report_section(_real_trace())
        assert section.present is True
        assert section.converged is True
        assert section.total_switch_count >= 1
        assert len(section.regulators) == 1
        reg = section.regulators[0]
        assert reg.branch_id == "TR1"
        assert reg.regulated_winding == "HV"
        assert reg.initial_position == 0
        assert reg.final_position < 0  # stepped down to raise the SN busbar
        assert reg.switch_count == abs(reg.final_position - reg.initial_position)
        assert reg.u_controlled_before_kv is not None
        assert reg.u_controlled_after_kv is not None
        # The regulator raised the controlled busbar toward the setpoint.
        assert reg.u_controlled_after_kv > reg.u_controlled_before_kv

    def test_text_and_latex_render(self):
        section = build_oltc_report_section(_real_trace())
        text = render_oltc_report_text(section)
        assert "Regulacja napięcia (OLTC)" in text
        assert "TR1" in text
        latex = render_oltc_report_latex(section)
        assert "\\section{Regulacja napiecia (OLTC)}" in latex
        assert "tabular" in latex

    def test_to_dict_shape(self):
        section = build_oltc_report_section(_real_trace())
        d = section.to_dict()
        assert d["section"] == "oltc_regulation"
        assert d["present"] is True
        assert isinstance(d["regulators"], list)
        assert d["regulators"][0]["branch_id"] == "TR1"

    def test_deterministic(self):
        a = build_oltc_report_section(_real_trace()).to_dict()
        b = build_oltc_report_section(_real_trace()).to_dict()
        assert a == b
