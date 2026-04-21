"""
Proof Engine Tests — P11.1c FULL (SC1)

Testy:
- 1F–Z, 2F, 2F–Z: wymagane kroki i wyniki
- Determinizm JSON
- Weryfikacja jednostek
- Terminologia PL (zgodna/przeciwna/zerowa)
"""

from __future__ import annotations

import math
from datetime import datetime
from uuid import uuid4

import pytest
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.proof_generator import ProofGenerator, SC1Input


def _base_sc1_input(fault_type: str) -> SC1Input:
    return SC1Input(
        project_name="Test Project",
        case_name=f"Test Case {fault_type}",
        fault_node_id="B1",
        fault_type=fault_type,
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        u_n_kv=15.0,
        c_factor=1.10,
        u_prefault_kv=8.660,
        z1_ohm=complex(0.5, 1.2),
        z2_ohm=complex(0.6, 1.1),
        z0_ohm=complex(0.8, 2.4),
        a_operator=complex(-0.5, math.sqrt(3) / 2),
    )


@pytest.mark.parametrize(
    "fault_type",
    ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
)
def test_sc1_units_all_pass(fault_type: str):
    """Wszystkie weryfikacje jednostek przechodzą."""
    proof = ProofGenerator.generate_sc1_proof(_base_sc1_input(fault_type))
    assert all(step.unit_check.passed for step in proof.steps)
    assert proof.summary.unit_check_passed


def test_sc1fZ_has_required_steps_and_results():
    """SC1F–Z zawiera wymagane kroki i wyniki."""
    proof = ProofGenerator.generate_sc1_proof(_base_sc1_input("ONE_PHASE_TO_GROUND"))
    assert [step.equation.equation_id for step in proof.steps] == (
        EquationRegistry.get_sc1_step_order("SC1FZ")
    )
    for key in ["z_equiv_ohm", "i1_ka", "i2_ka", "i0_ka", "ia_ka", "ib_ka", "ic_ka"]:
        assert key in proof.summary.key_results


def test_sc2f_has_required_steps_and_results():
    """SC2F zawiera wymagane kroki i wyniki."""
    proof = ProofGenerator.generate_sc1_proof(_base_sc1_input("TWO_PHASE"))
    assert [step.equation.equation_id for step in proof.steps] == (
        EquationRegistry.get_sc1_step_order("SC2F")
    )
    for key in ["z_equiv_ohm", "i1_ka", "i2_ka", "i0_ka", "ia_ka", "ib_ka", "ic_ka"]:
        assert key in proof.summary.key_results


def test_sc2fZ_has_required_steps_and_results():
    """SC2F–Z zawiera wymagane kroki i wyniki."""
    proof = ProofGenerator.generate_sc1_proof(_base_sc1_input("TWO_PHASE_TO_GROUND"))
    assert [step.equation.equation_id for step in proof.steps] == (
        EquationRegistry.get_sc1_step_order("SC2FZ")
    )
    for key in ["z_equiv_ohm", "i1_ka", "i2_ka", "i0_ka", "ia_ka", "ib_ka", "ic_ka"]:
        assert key in proof.summary.key_results


def test_sc1_determinism_json():
    """SC1 determinism: identyczny JSON po usunięciu pól zmiennych."""
    artifact_id = uuid4()
    input_data = _base_sc1_input("TWO_PHASE_TO_GROUND")

    proof_1 = ProofGenerator.generate_sc1_proof(input_data, artifact_id)
    proof_2 = ProofGenerator.generate_sc1_proof(input_data, artifact_id)

    json_1 = proof_1.to_dict()
    json_2 = proof_2.to_dict()

    for payload in (json_1, json_2):
        del payload["document_id"]
        del payload["created_at"]

    assert json_1 == json_2


def test_sc1_terminology_polish():
    """Tytuły kroków zawierają terminologię: zgodna/przeciwna/zerowa."""
    proof = ProofGenerator.generate_sc1_proof(_base_sc1_input("ONE_PHASE_TO_GROUND"))
    titles = " ".join(step.title_pl.lower() for step in proof.steps)
    assert "zgodna" in titles
    assert "przeciwna" in titles
    assert "zerowa" in titles
