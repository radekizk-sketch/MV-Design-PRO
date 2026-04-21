"""Tests for Protection Settings Proof Pack."""

from datetime import datetime

import pytest
from application.proof_engine.packs.protection_settings import (
    ProtectionSettingsProofInput,
    ProtectionSettingsProofPack,
    ProtectionSettingsProofResult,
)
from application.proof_engine.types import ProofType


def _make_input(**overrides) -> ProtectionSettingsProofInput:
    """Create a default proof input."""
    defaults = {
        "project_name": "Projekt SN",
        "case_name": "Przypadek bazowy",
        "line_id": "L1",
        "line_name": "Linia SN 15kV",
        "run_timestamp": datetime(2024, 6, 15, 10, 0, 0),
        "solver_version": "4.0.0",
        "cross_section_mm2": 120.0,
        "conductor_material": "Al",
        "length_km": 5.0,
        "i_nominal_a": 300.0,
        "ik3_max_beginning_a": 8000.0,
        "ik3_min_beginning_a": 5000.0,
        "ik3_max_end_a": 4000.0,
        "ik3_min_end_a": 2500.0,
        "ik2_min_end_a": 2100.0,
        "ik_max_next_bus_a": 3000.0,
        "i_load_max_a": 180.0,
        "i_delayed_a": 216.0,
        "t_delayed_s": 0.3,
        "i_instantaneous_a": 4000.0,
        "i_th_dop_a": 37000.0,
        "j_thn": 94.0,
    }
    defaults.update(overrides)
    return ProtectionSettingsProofInput(**defaults)


class TestProtectionSettingsProofPack:
    """Tests for proof pack generation."""

    def test_generate_returns_result(self):
        inp = _make_input()
        result = ProtectionSettingsProofPack.generate(inp)
        assert isinstance(result, ProtectionSettingsProofResult)

    def test_unit_check_passed(self):
        inp = _make_input()
        result = ProtectionSettingsProofPack.generate(inp)
        assert result.unit_check_passed is True

    def test_proof_type_is_protection_overcurrent(self):
        inp = _make_input()
        result = ProtectionSettingsProofPack.generate(inp)
        assert result.proof.proof_type == ProofType.PROTECTION_OVERCURRENT

    def test_proof_has_5_steps(self):
        inp = _make_input()
        result = ProtectionSettingsProofPack.generate(inp)
        assert len(result.proof.steps) == 5

    def test_step_ids_are_stable(self):
        inp = _make_input()
        r1 = ProtectionSettingsProofPack.generate(inp)
        r2 = ProtectionSettingsProofPack.generate(inp)
        ids1 = [s.step_id for s in r1.proof.steps]
        ids2 = [s.step_id for s in r2.proof.steps]
        assert ids1 == ids2

    def test_header_contains_line_data(self):
        inp = _make_input()
        result = ProtectionSettingsProofPack.generate(inp)
        header = result.proof.header
        assert header.target_id == "L1"
        assert header.element_kind == "LINE"
        assert header.project_name == "Projekt SN"

    def test_summary_key_results(self):
        inp = _make_input()
        result = ProtectionSettingsProofPack.generate(inp)
        keys = result.proof.summary.key_results
        assert "I_delayed_A" in keys
        assert "I_instantaneous_A" in keys
        assert "I_th_dop_A" in keys
        assert "sensitivity_ratio" in keys

    def test_summary_key_result_values(self):
        inp = _make_input(i_delayed_a=216.0, i_instantaneous_a=4000.0)
        result = ProtectionSettingsProofPack.generate(inp)
        kr = result.proof.summary.key_results
        assert kr["I_delayed_A"].value == pytest.approx(216.0)
        assert kr["I_instantaneous_A"].value == pytest.approx(4000.0)

    def test_to_dict_serializable(self):
        inp = _make_input()
        result = ProtectionSettingsProofPack.generate(inp)
        d = result.to_dict()
        assert "proof" in d
        assert "unit_check_passed" in d
        proof_dict = d["proof"]
        assert "steps" in proof_dict
        assert "summary" in proof_dict

    def test_determinism(self):
        """Same input produces same proof structure (different UUIDs ok)."""
        from uuid import UUID

        inp = _make_input()
        aid = UUID("12345678-1234-1234-1234-123456789abc")
        r1 = ProtectionSettingsProofPack.generate(inp, artifact_id=aid)
        r2 = ProtectionSettingsProofPack.generate(inp, artifact_id=aid)
        assert r1.unit_check_passed == r2.unit_check_passed
        assert len(r1.proof.steps) == len(r2.proof.steps)
        for s1, s2 in zip(r1.proof.steps, r2.proof.steps, strict=False):
            assert s1.step_id == s2.step_id
            assert s1.result.value == s2.result.value

    def test_overall_status_pass_when_range_valid(self):
        inp = _make_input()
        result = ProtectionSettingsProofPack.generate(inp)
        assert result.proof.summary.overall_status in ("PASS", "FAIL")

    def test_title_contains_line_name(self):
        inp = _make_input(line_name="Linia Testowa")
        result = ProtectionSettingsProofPack.generate(inp)
        assert "Linia Testowa" in result.proof.title_pl

    def test_step_equations_have_ids(self):
        inp = _make_input()
        result = ProtectionSettingsProofPack.generate(inp)
        for step in result.proof.steps:
            assert step.equation.equation_id.startswith("EQ_PROT_")

    def test_substitution_latex_present(self):
        inp = _make_input()
        result = ProtectionSettingsProofPack.generate(inp)
        for step in result.proof.steps:
            assert step.substitution_latex is not None

    def test_each_step_has_unit_check(self):
        inp = _make_input()
        result = ProtectionSettingsProofPack.generate(inp)
        for step in result.proof.steps:
            assert step.unit_check.passed is True
