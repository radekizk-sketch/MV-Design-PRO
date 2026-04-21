"""Tests for Q(U) Regulation Proof Pack."""

from datetime import datetime

import pytest
from application.proof_engine.packs.qu_regulation import (
    QUCharacteristicPoint,
    QURegulationProofInput,
    QURegulationProofPack,
    QURegulationProofResult,
)
from application.proof_engine.types import ProofType


def _make_input(**overrides) -> QURegulationProofInput:
    """Create default Q(U) proof input."""
    defaults = {
        "project_name": "Projekt OZE",
        "case_name": "Przypadek bazowy",
        "oze_id": "OZE1",
        "oze_name": "PV Park Zachód",
        "run_timestamp": datetime(2024, 6, 15, 10, 0, 0),
        "solver_version": "4.0.0",
        "p_nominal_mw": 2.0,
        "q_max_mvar": 1.0,
        "cos_phi_min": 0.9,
        "qu_characteristic": [
            QUCharacteristicPoint(u_pu=0.95, q_pu=1.0),
            QUCharacteristicPoint(u_pu=0.98, q_pu=0.0),
            QUCharacteristicPoint(u_pu=1.02, q_pu=0.0),
            QUCharacteristicPoint(u_pu=1.05, q_pu=-1.0),
        ],
        "voltages_at_oze_pu": [1.00, 1.01, 1.02, 1.03, 1.04],
        "q_injected_mvar": [0.0, 0.0, 0.0, -0.04, -0.08],
    }
    defaults.update(overrides)
    return QURegulationProofInput(**defaults)


class TestQURegulationProofPack:
    """Tests for Q(U) proof pack generation."""

    def test_generate_returns_result(self):
        inp = _make_input()
        result = QURegulationProofPack.generate(inp)
        assert isinstance(result, QURegulationProofResult)

    def test_unit_check_passed(self):
        inp = _make_input()
        result = QURegulationProofPack.generate(inp)
        assert result.unit_check_passed is True

    def test_proof_type_is_qu_regulation(self):
        inp = _make_input()
        result = QURegulationProofPack.generate(inp)
        assert result.proof.proof_type == ProofType.Q_U_REGULATION

    def test_voltages_within_limits_all_ok(self):
        inp = _make_input()
        result = QURegulationProofPack.generate(inp)
        assert result.voltages_within_limits is True

    def test_voltages_outside_limits_detected(self):
        inp = _make_input(
            voltages_at_oze_pu=[1.00, 1.01, 1.06, 1.08, 1.10],
        )
        result = QURegulationProofPack.generate(inp)
        assert result.voltages_within_limits is False

    def test_qu_compliance_in_deadband(self):
        """Within dead-band (0.98-1.02), Q should be ~0."""
        inp = _make_input(
            voltages_at_oze_pu=[1.00, 1.00, 1.00, 1.00, 1.00],
            q_injected_mvar=[0.0, 0.0, 0.0, 0.0, 0.0],
        )
        result = QURegulationProofPack.generate(inp)
        assert result.qu_compliance is True

    def test_qu_non_compliance_detected(self):
        """Large Q where none expected -> non-compliant."""
        inp = _make_input(
            voltages_at_oze_pu=[1.00, 1.00, 1.00, 1.00, 1.00],
            q_injected_mvar=[0.5, 0.5, 0.5, 0.5, 0.5],
        )
        result = QURegulationProofPack.generate(inp)
        assert result.qu_compliance is False

    def test_step_count_matches_generation_levels(self):
        """1 (characteristic) + N (gen levels) + 1 (summary)."""
        inp = _make_input()
        result = QURegulationProofPack.generate(inp)
        n_gen = len(inp.generation_levels)
        expected_steps = 1 + n_gen + 1
        assert len(result.proof.steps) == expected_steps

    def test_header_contains_oze_data(self):
        inp = _make_input()
        result = QURegulationProofPack.generate(inp)
        header = result.proof.header
        assert header.target_id == "OZE1"
        assert header.element_kind == "OZE"
        assert header.project_name == "Projekt OZE"

    def test_summary_key_results(self):
        inp = _make_input()
        result = QURegulationProofPack.generate(inp)
        kr = result.proof.summary.key_results
        assert "voltages_within_limits" in kr
        assert "qu_compliance" in kr
        assert "p_nominal_mw" in kr
        assert "q_max_mvar" in kr

    def test_to_dict_serializable(self):
        inp = _make_input()
        result = QURegulationProofPack.generate(inp)
        d = result.to_dict()
        assert "proof" in d
        assert "voltages_within_limits" in d
        assert "qu_compliance" in d
        assert "unit_check_passed" in d

    def test_determinism_with_fixed_artifact_id(self):
        from uuid import UUID

        inp = _make_input()
        aid = UUID("abcdef01-2345-6789-abcd-ef0123456789")
        r1 = QURegulationProofPack.generate(inp, artifact_id=aid)
        r2 = QURegulationProofPack.generate(inp, artifact_id=aid)
        assert r1.voltages_within_limits == r2.voltages_within_limits
        assert r1.qu_compliance == r2.qu_compliance
        assert len(r1.proof.steps) == len(r2.proof.steps)

    def test_title_contains_oze_name(self):
        inp = _make_input(oze_name="Farma PV")
        result = QURegulationProofPack.generate(inp)
        assert "Farma PV" in result.proof.title_pl

    def test_overall_status(self):
        inp = _make_input()
        result = QURegulationProofPack.generate(inp)
        assert result.proof.summary.overall_status in ("PASS", "FAIL")

    def test_each_step_has_unit_check(self):
        inp = _make_input()
        result = QURegulationProofPack.generate(inp)
        for step in result.proof.steps:
            assert step.unit_check.passed is True


class TestQUCharacteristicCalculation:
    """Tests for _calculate_expected_q."""

    def test_dead_band_returns_zero(self):
        q = QURegulationProofPack._calculate_expected_q(
            u_pu=1.00, q_max=1.0, u_db_low=0.98, u_db_high=1.02, slope=4.0
        )
        assert q == pytest.approx(0.0)

    def test_under_voltage_positive_q(self):
        q = QURegulationProofPack._calculate_expected_q(
            u_pu=0.95, q_max=1.0, u_db_low=0.98, u_db_high=1.02, slope=4.0
        )
        assert q > 0.0

    def test_over_voltage_negative_q(self):
        q = QURegulationProofPack._calculate_expected_q(
            u_pu=1.05, q_max=1.0, u_db_low=0.98, u_db_high=1.02, slope=4.0
        )
        assert q < 0.0

    def test_q_clamped_to_q_max(self):
        q = QURegulationProofPack._calculate_expected_q(
            u_pu=0.50, q_max=1.0, u_db_low=0.98, u_db_high=1.02, slope=4.0
        )
        assert q <= 1.0

    def test_q_clamped_to_neg_q_max(self):
        q = QURegulationProofPack._calculate_expected_q(
            u_pu=1.50, q_max=1.0, u_db_low=0.98, u_db_high=1.02, slope=4.0
        )
        assert q >= -1.0

    def test_boundary_low_returns_zero(self):
        q = QURegulationProofPack._calculate_expected_q(
            u_pu=0.98, q_max=1.0, u_db_low=0.98, u_db_high=1.02, slope=4.0
        )
        assert q == pytest.approx(0.0)

    def test_boundary_high_returns_zero(self):
        q = QURegulationProofPack._calculate_expected_q(
            u_pu=1.02, q_max=1.0, u_db_low=0.98, u_db_high=1.02, slope=4.0
        )
        assert q == pytest.approx(0.0)
