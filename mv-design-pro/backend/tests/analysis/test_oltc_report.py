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


class TestMissingPositionIsNoneNotZero:
    """FAB-E (E1): 0 jest prawdziwa pozycja NEUTRALNA wielu OLTC — gdy ANI
    slad solvera, ANI konfiguracja regulatora nie niosa pozycji, wynik MUSI
    byc None (nieodroznialne od "regulator nie zmienil pozycji"), nigdy
    fikcyjne 0."""

    @staticmethod
    def _oltc_control_bez_pozycji() -> dict:
        """Syntetyczny slad: regulator bez wpisu w initial_positions/
        final_positions I bez meta.initial_position — komplet braku danych."""
        return {
            "converged": True,
            "iterations": [],
            "regulators": [{"branch_id": "TR_BEZ_DANYCH", "regulated_winding": "HV"}],
            "initial_positions": {},
            "final_positions": {},
            "switch_counts": {"TR_BEZ_DANYCH": 2},
        }

    def test_missing_position_in_both_sources_gives_none_not_zero(self):
        section = build_oltc_report_section(self._oltc_control_bez_pozycji())
        reg = section.regulators[0]
        assert reg.initial_position is None
        assert reg.final_position is None
        # switch_count (obecny w sladzie) nadal liczy sie normalnie.
        assert reg.switch_count == 2

    def test_missing_position_renders_as_dash_not_zero(self):
        section = build_oltc_report_section(self._oltc_control_bez_pozycji())
        text = render_oltc_report_text(section)
        assert "pozycja — → —" in text
        latex = render_oltc_report_latex(section)
        assert "TR_BEZ_DANYCH & HV & — & — & 2" in latex

    def test_meta_initial_position_used_when_trace_missing_it(self):
        """Slad solvera nie ma tego branch_id, ale konfiguracja regulatora
        (meta.initial_position) ma -> uzyta jako drugie zrodlo (nie None)."""
        oltc_control = {
            "converged": True,
            "iterations": [],
            "regulators": [
                {"branch_id": "TR_Z_META", "regulated_winding": "HV", "initial_position": 3}
            ],
            "initial_positions": {},
            "final_positions": {},
            "switch_counts": {},
        }
        section = build_oltc_report_section(oltc_control)
        reg = section.regulators[0]
        assert reg.initial_position == 3
        assert reg.final_position == 3  # brak final_positions -> to samo zrodlo zapasowe
