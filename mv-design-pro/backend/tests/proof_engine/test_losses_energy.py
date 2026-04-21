"""
P17 Losses Energy Profile Tests.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import pytest
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.proof_generator import ProofGenerator
from application.proof_engine.types import (
    EnergyProfilePoint,
    LossesEnergyInput,
    LossesEnergyTargetKind,
)


def _build_discrete_input() -> LossesEnergyInput:
    return LossesEnergyInput(
        project_name="Test Project",
        case_name="Test Case LE",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        target_kind=LossesEnergyTargetKind.LINE,
        target_id="LINE_01",
        points=[
            EnergyProfilePoint(t_h=0.0, p_loss_kw=10.0),
            EnergyProfilePoint(t_h=1.0, p_loss_kw=10.0),
            EnergyProfilePoint(t_h=2.0, p_loss_kw=10.0),
        ],
    )


def test_le_registry_ids_exist() -> None:
    assert EquationRegistry.get_equation("EQ_LE_001") is not None
    assert EquationRegistry.get_equation("EQ_LE_002") is not None
    assert EquationRegistry.get_equation("EQ_LE_003") is not None
    assert EquationRegistry.get_equation("EQ_LE_004") is not None


def test_le_step_order_deterministic() -> None:
    assert EquationRegistry.get_le_step_order() == [
        "EQ_LE_001",
        "EQ_LE_002",
        "EQ_LE_003",
        "EQ_LE_004",
    ]


def test_energy_discrete_sum_math() -> None:
    proof = ProofGenerator.generate_losses_energy_proof(_build_discrete_input())
    assert proof.summary.key_results["e_loss_kwh"].value == pytest.approx(20.0)


def test_energy_constant_variant_math() -> None:
    data = LossesEnergyInput(
        project_name="Test Project",
        case_name="Test Case LE Constant",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        target_kind=LossesEnergyTargetKind.TRANSFORMER,
        target_id="TR_01",
        points=[],
        p_loss_const_kw=5.0,
        duration_h=2.0,
    )
    proof = ProofGenerator.generate_losses_energy_proof(data)
    assert proof.summary.key_results["e_loss_kwh"].value == pytest.approx(10.0)


def test_energy_units_pass() -> None:
    proof = ProofGenerator.generate_losses_energy_proof(_build_discrete_input())
    assert all(step.unit_check.passed for step in proof.steps)


def test_energy_json_determinism() -> None:
    artifact_id = UUID("12345678-1234-5678-1234-567812345678")
    data = _build_discrete_input()
    proof_a = ProofGenerator.generate_losses_energy_proof(data, artifact_id)
    proof_b = ProofGenerator.generate_losses_energy_proof(data, artifact_id)

    json_a = proof_a.to_dict()
    json_b = proof_b.to_dict()

    del json_a["document_id"]
    del json_a["created_at"]
    del json_b["document_id"]
    del json_b["created_at"]

    assert json_a == json_b
