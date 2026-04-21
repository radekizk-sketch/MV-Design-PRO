"""
P16 Losses Proof Pack Tests.

Tests for branch losses, total losses, and percentage calculations.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import pytest
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.packs.p16_losses import (
    P16BranchLossInput,
    P16LossesInput,
    P16LossesProof,
)
from application.proof_engine.types import ProofType


def _build_simple_losses_input() -> P16LossesInput:
    """Build test input with simple losses."""
    return P16LossesInput(
        project_name="Test Project",
        case_name="Test Case P16",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        branches=[
            P16BranchLossInput(
                branch_id="LINE_01",
                p_from_mw=50.0,
                q_from_mvar=10.0,
                p_to_mw=-49.0,  # Negative means power going out
                q_to_mvar=-9.5,
                p_loss_mw=1.0,
                q_loss_mvar=0.5,
            ),
            P16BranchLossInput(
                branch_id="LINE_02",
                p_from_mw=30.0,
                q_from_mvar=5.0,
                p_to_mw=-29.5,
                q_to_mvar=-4.7,
                p_loss_mw=0.5,
                q_loss_mvar=0.3,
            ),
        ],
        p_losses_total_mw=1.5,
        q_losses_total_mvar=0.8,
        p_gen_total_mw=100.0,
    )


def _build_multi_branch_input() -> P16LossesInput:
    """Build test input with many branches."""
    branches = []
    for i in range(15):
        branches.append(
            P16BranchLossInput(
                branch_id=f"BRANCH_{i:02d}",
                p_from_mw=10.0,
                q_from_mvar=2.0,
                p_to_mw=-9.9,
                q_to_mvar=-1.95,
                p_loss_mw=0.1,
                q_loss_mvar=0.05,
            )
        )

    return P16LossesInput(
        project_name="Test Project",
        case_name="Test Case P16 Multi-Branch",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        branches=branches,
        p_losses_total_mw=1.5,  # 15 * 0.1
        q_losses_total_mvar=0.75,  # 15 * 0.05
        p_gen_total_mw=150.0,
    )


def test_loss_registry_ids_exist() -> None:
    """Test that P16 equation IDs exist in registry."""
    assert EquationRegistry.get_equation("EQ_LOSS_001") is not None
    assert EquationRegistry.get_equation("EQ_LOSS_002") is not None
    assert EquationRegistry.get_equation("EQ_LOSS_003") is not None
    assert EquationRegistry.get_equation("EQ_LOSS_004") is not None
    assert EquationRegistry.get_equation("EQ_LOSS_005") is not None


def test_loss_step_order_deterministic() -> None:
    """Test that P16 step order is deterministic."""
    assert EquationRegistry.get_loss_step_order() == [
        "EQ_LOSS_001",
        "EQ_LOSS_002",
        "EQ_LOSS_003",
        "EQ_LOSS_004",
        "EQ_LOSS_005",
    ]


def test_loss_equations_dict() -> None:
    """Test that P16 equations dictionary is populated."""
    loss_eqs = EquationRegistry.get_loss_equations()
    assert len(loss_eqs) == 5
    assert "EQ_LOSS_001" in loss_eqs
    assert "EQ_LOSS_002" in loss_eqs
    assert "EQ_LOSS_003" in loss_eqs
    assert "EQ_LOSS_004" in loss_eqs
    assert "EQ_LOSS_005" in loss_eqs


def test_p16_proof_generation() -> None:
    """Test P16 proof generation."""
    data = _build_simple_losses_input()
    proof = P16LossesProof.generate(data)

    assert proof is not None
    assert proof.proof_type == ProofType.LOSSES_ENERGY


def test_p16_total_p_losses() -> None:
    """Test total P losses calculation."""
    data = _build_simple_losses_input()
    proof = P16LossesProof.generate(data)

    assert "p_losses_total_mw" in proof.summary.key_results
    assert proof.summary.key_results["p_losses_total_mw"].value == pytest.approx(1.5)


def test_p16_total_q_losses() -> None:
    """Test total Q losses calculation."""
    data = _build_simple_losses_input()
    proof = P16LossesProof.generate(data)

    assert "q_losses_total_mvar" in proof.summary.key_results
    assert proof.summary.key_results["q_losses_total_mvar"].value == pytest.approx(0.8)


def test_p16_loss_percent_calculation() -> None:
    """Test percentage losses calculation."""
    data = _build_simple_losses_input()
    proof = P16LossesProof.generate(data)

    # 1.5 MW / 100 MW * 100 = 1.5%
    expected_percent = 1.5
    assert "p_loss_percent" in proof.summary.key_results
    assert proof.summary.key_results["p_loss_percent"].value == pytest.approx(expected_percent)


def test_p16_branch_count() -> None:
    """Test branch count in summary."""
    data = _build_simple_losses_input()
    proof = P16LossesProof.generate(data)

    assert "branch_count" in proof.summary.key_results
    assert proof.summary.key_results["branch_count"].value == pytest.approx(2.0)


def test_p16_max_branch_steps_limit() -> None:
    """Test that max_branch_steps limits displayed branches."""
    data = _build_multi_branch_input()
    proof = P16LossesProof.generate(data, max_branch_steps=5)

    # Should have warning about limited branches
    assert len(proof.summary.warnings) > 0
    assert any("5" in w and "15" in w for w in proof.summary.warnings)


def test_p16_units_pass() -> None:
    """Test that all unit checks pass."""
    data = _build_simple_losses_input()
    proof = P16LossesProof.generate(data)

    assert all(step.unit_check.passed for step in proof.steps)


def test_p16_json_determinism() -> None:
    """Test that JSON output is deterministic."""
    artifact_id = UUID("12345678-1234-5678-1234-567812345678")
    data = _build_simple_losses_input()

    proof_a = P16LossesProof.generate(data, artifact_id)
    proof_b = P16LossesProof.generate(data, artifact_id)

    json_a = proof_a.to_dict()
    json_b = proof_b.to_dict()

    # Remove non-deterministic fields
    del json_a["document_id"]
    del json_a["created_at"]
    del json_b["document_id"]
    del json_b["created_at"]

    assert json_a == json_b


def test_p16_header_content() -> None:
    """Test that header contains correct information."""
    data = _build_simple_losses_input()
    proof = P16LossesProof.generate(data)

    assert proof.header.project_name == "Test Project"
    assert proof.header.case_name == "Test Case P16"
    assert proof.header.solver_version == "1.0.0-test"


def test_p16_overall_status() -> None:
    """Test overall status is COMPUTED."""
    data = _build_simple_losses_input()
    proof = P16LossesProof.generate(data)

    assert proof.summary.overall_status == "COMPUTED"


def test_p16_zero_generation() -> None:
    """Test handling of zero generation (avoid division by zero)."""
    data = P16LossesInput(
        project_name="Test Project",
        case_name="Test Case P16 Zero Gen",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        branches=[],
        p_losses_total_mw=0.0,
        q_losses_total_mvar=0.0,
        p_gen_total_mw=0.0,  # Zero generation
    )
    proof = P16LossesProof.generate(data)

    # Should handle gracefully with 0% losses
    assert proof.summary.key_results["p_loss_percent"].value == pytest.approx(0.0)


def test_p16_steps_include_branch_losses() -> None:
    """Test that steps include individual branch loss calculations."""
    data = _build_simple_losses_input()
    proof = P16LossesProof.generate(data)

    # Should have steps for each branch (2 branches * 2 steps each)
    # Plus 3 summary steps (total P, total Q, percent)
    # 2 * 2 + 3 = 7 steps
    branch_steps = [s for s in proof.steps if "LINE_" in s.title_pl]
    assert len(branch_steps) >= 4  # At least 2 branches * 2 steps


def test_p16_eq_symbols() -> None:
    """Test equation symbols have correct mapping keys."""
    eq = EquationRegistry.get_equation("EQ_LOSS_001")
    assert eq is not None

    mapping_keys = [s.mapping_key for s in eq.symbols]
    assert "p_loss_mw" in mapping_keys
    assert "p_from_mw" in mapping_keys
    assert "p_to_mw" in mapping_keys
