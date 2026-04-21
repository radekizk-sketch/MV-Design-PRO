"""
P19 Earthing / Ground Fault Proof Pack Tests.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import pytest
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.proof_generator import ProofGenerator
from application.proof_engine.types import EarthingGroundFaultInput, ProofType


@pytest.fixture
def earthing_input() -> EarthingGroundFaultInput:
    return EarthingGroundFaultInput(
        project_name="Test Project",
        case_name="Test Case P19",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        fault_location="B1",
        fault_type="1F-Z",
        earthing_mode="rezystor",
        u0_v=400.0,
        z_e_ohm=4.0,
        i_u_a=60.0,
        i_p_a=40.0,
        r_u_ohm=2.0,
    )


def test_earthing_step_order_is_stable() -> None:
    expected = [
        "EQ_EARTH_001",
        "EQ_EARTH_002",
        "EQ_EARTH_003",
    ]
    assert EquationRegistry.get_earth_step_order() == expected


def test_earthing_proof_computes_values(earthing_input: EarthingGroundFaultInput) -> None:
    proof = ProofGenerator.generate_earthing_ground_fault_proof(earthing_input)

    assert proof.proof_type == ProofType.EARTHING_GROUND_FAULT_SN
    assert proof.summary.key_results["i_earth_a"].value == pytest.approx(100.0)
    assert proof.summary.key_results["u_touch_v"].value == pytest.approx(120.0)
    assert proof.summary.key_results["computed_status"].value == "COMPUTED"
    assert proof.summary.unit_check_passed
    assert all(step.unit_check.passed for step in proof.steps)


def test_earthing_determinism_json(earthing_input: EarthingGroundFaultInput) -> None:
    artifact_id = uuid4()

    proof_1 = ProofGenerator.generate_earthing_ground_fault_proof(earthing_input, artifact_id)
    proof_2 = ProofGenerator.generate_earthing_ground_fault_proof(earthing_input, artifact_id)

    json_1 = proof_1.to_dict()
    json_2 = proof_2.to_dict()

    del json_1["document_id"]
    del json_1["created_at"]
    del json_2["document_id"]
    del json_2["created_at"]

    assert json_1 == json_2


def test_earthing_missing_data_not_computed() -> None:
    proof = ProofGenerator.generate_earthing_ground_fault_proof(
        EarthingGroundFaultInput(
            project_name="Test Project",
            case_name="Test Case P19 Missing",
            run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
            solver_version="1.0.0-test",
            fault_location=None,
            fault_type=None,
            earthing_mode=None,
            u0_v=None,
            z_e_ohm=None,
            i_u_a=None,
            i_p_a=None,
            r_u_ohm=None,
        )
    )

    assert proof.summary.key_results["computed_status"].value == "NOT COMPUTED"
    assert proof.summary.key_results["i_earth_a"].value == "—"
    assert proof.summary.warnings
