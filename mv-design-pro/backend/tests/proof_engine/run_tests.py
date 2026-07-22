#!/usr/bin/env python3
"""
Manual test runner for Proof Engine P11.1a

Runs without pytest to verify core functionality.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from uuid import uuid4

# Add src to path
sys.path.insert(0, str(Path(__file__).parents[2] / "src"))

from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.proof_generator import (
    ProofGenerator,
    SC3FInput,
    VDROPInput,
    VDROPSegmentInput,
)
from application.proof_engine.types import ProofType
from application.proof_engine.unit_verifier import UnitVerifier


def create_test_sc3f_input() -> SC3FInput:
    """Test data from P11_1a_MVP_SC3F_AND_VDROP.md example."""
    return SC3FInput(
        project_name="Test Project",
        case_name="Test Case SC3F",
        fault_node_id="B2",
        fault_type="THREE_PHASE",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        c_factor=1.10,
        u_n_kv=15.0,
        z_thevenin_ohm=complex(0.749, 3.419),
        ikss_ka=2.722,
        ip_ka=5.882,
        ith_ka=2.722,
        sk_mva=70.7,
        kappa=1.528,
        rx_ratio=0.219,
        tk_s=1.0,
        m_factor=1.0,
        n_factor=0.0,
        # Karta S-C (2026-07-22): pełny bilans — I_b(t_b) z FROZEN wyniku solvera.
        ib_ka=2.722,
        tb_s=0.1,
    )


def create_test_vdrop_input() -> VDROPInput:
    """Test data for VDROP."""
    return VDROPInput(
        project_name="Test Project",
        case_name="Test Case VDROP",
        source_bus_id="SOURCE",
        target_bus_id="LOAD",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        u_source_kv=15.0,
        segments=[
            VDROPSegmentInput(
                segment_id="SEG1",
                from_bus_id="SOURCE",
                to_bus_id="MID",
                r_ohm_per_km=0.206,
                x_ohm_per_km=0.075,
                length_km=2.5,
                p_mw=2.0,
                q_mvar=1.0,
                u_n_kv=15.0,
            ),
        ],
    )


def test_sc3f_generation():
    """Test SC3F proof generation."""
    print("=" * 60)
    print("TEST: SC3F Proof Generation")
    print("=" * 60)

    data = create_test_sc3f_input()
    proof = ProofGenerator.generate_sc3f_proof(data)

    assert proof is not None, "Proof should not be None"
    assert proof.proof_type == ProofType.SC3F_IEC60909, "Wrong proof type"
    # 9 kroków po karcie S-C (2026-07-22): + I_b(t_b), + I²t.
    assert len(proof.steps) == 9, f"Expected 9 steps, got {len(proof.steps)}"

    print(f"✓ Generated proof with {len(proof.steps)} steps")
    print(f"✓ Proof type: {proof.proof_type.value}")
    print(f"✓ Document ID: {proof.document_id}")

    # Check required steps
    [s.title_pl for s in proof.steps]
    print("\nSteps:")
    for i, step in enumerate(proof.steps, 1):
        print(f"  {i}. {step.title_pl}")

    # Check key results
    print("\nKey Results:")
    for key, val in sorted(proof.summary.key_results.items()):
        print(f"  {key}: {val.formatted}")

    # Check unit verification
    all_passed = all(s.unit_check.passed for s in proof.steps)
    print(f"\nUnit checks: {'✓ ALL PASSED' if all_passed else '✗ SOME FAILED'}")

    return True


def test_vdrop_generation():
    """Test VDROP proof generation."""
    print("\n" + "=" * 60)
    print("TEST: VDROP Proof Generation")
    print("=" * 60)

    data = create_test_vdrop_input()
    proof = ProofGenerator.generate_vdrop_proof(data)

    assert proof is not None, "Proof should not be None"
    assert proof.proof_type == ProofType.VDROP, "Wrong proof type"
    assert len(proof.steps) == 7, f"Expected 7 steps, got {len(proof.steps)}"

    print(f"✓ Generated proof with {len(proof.steps)} steps")
    print(f"✓ Proof type: {proof.proof_type.value}")

    # Check key results
    print("\nKey Results:")
    for key, val in sorted(proof.summary.key_results.items()):
        print(f"  {key}: {val.formatted}")

    return True


def test_determinism():
    """Test determinism: same input → same output."""
    print("\n" + "=" * 60)
    print("TEST: Determinism")
    print("=" * 60)

    data = create_test_sc3f_input()
    artifact_id = uuid4()

    proof_1 = ProofGenerator.generate_sc3f_proof(data, artifact_id)
    proof_2 = ProofGenerator.generate_sc3f_proof(data, artifact_id)

    # Compare steps
    for s1, s2 in zip(proof_1.steps, proof_2.steps, strict=False):
        assert s1.step_id == s2.step_id, f"Step ID mismatch: {s1.step_id} vs {s2.step_id}"
        assert s1.result.value == s2.result.value, f"Result mismatch in {s1.step_id}"

    print("✓ Same input produces same steps")
    print("✓ Same input produces same results")

    return True


def test_equation_registry():
    """Test equation registry."""
    print("\n" + "=" * 60)
    print("TEST: Equation Registry")
    print("=" * 60)

    sc3f = EquationRegistry.get_sc3f_equations()
    vdrop = EquationRegistry.get_vdrop_equations()

    print(f"✓ SC3F equations: {len(sc3f)}")
    print(f"✓ VDROP equations: {len(vdrop)}")

    # Check required equations exist
    required_sc3f = ["EQ_SC3F_004", "EQ_SC3F_005", "EQ_SC3F_006", "EQ_SC3F_007", "EQ_SC3F_008"]
    for eq_id in required_sc3f:
        assert eq_id in sc3f, f"Missing equation: {eq_id}"
    print("✓ All required SC3F equations present")

    # Validate ID stability
    EquationRegistry.validate_id_stability()
    print("✓ ID stability validated")

    return True


def test_json_output():
    """Test JSON serialization."""
    print("\n" + "=" * 60)
    print("TEST: JSON Output")
    print("=" * 60)

    data = create_test_sc3f_input()
    proof = ProofGenerator.generate_sc3f_proof(data)

    json_str = proof.json_representation
    json_dict = json.loads(json_str)

    assert "steps" in json_dict
    assert "summary" in json_dict
    assert json_dict["proof_type"] == "SC3F_IEC60909"

    print("✓ JSON serialization successful")
    print(f"✓ JSON size: {len(json_str)} bytes")

    return True


def test_latex_output():
    """Test LaTeX generation."""
    print("\n" + "=" * 60)
    print("TEST: LaTeX Output")
    print("=" * 60)

    data = create_test_sc3f_input()
    proof = ProofGenerator.generate_sc3f_proof(data)

    latex = proof.latex_representation

    assert r"\documentclass" in latex
    assert r"\begin{document}" in latex
    assert r"\section{Dowód}" in latex
    assert r"\end{document}" in latex

    print("✓ LaTeX generation successful")
    print(f"✓ LaTeX size: {len(latex)} bytes")

    return True


def test_unit_verifier():
    """Test unit verification."""
    print("\n" + "=" * 60)
    print("TEST: Unit Verifier")
    print("=" * 60)

    # Test kV / Ω = kA
    result = UnitVerifier.verify_equation(
        "EQ_SC3F_004",
        {"c": "—", "U_n": "kV", "Z_th": "Ω"},
        "kA",
    )
    assert result.passed, "kV / Ω = kA should pass"
    print("✓ kV / Ω = kA: PASS")

    # Test kV · kA = MVA
    result = UnitVerifier.verify_equation(
        "EQ_SC3F_007",
        {"U_n": "kV", "I_k''": "kA"},
        "MVA",
    )
    assert result.passed, "kV · kA = MVA should pass"
    print("✓ kV · kA = MVA: PASS")

    return True


def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("PROOF ENGINE P11.1a — TEST SUITE")
    print("=" * 60 + "\n")

    tests = [
        ("SC3F Generation", test_sc3f_generation),
        ("VDROP Generation", test_vdrop_generation),
        ("Determinism", test_determinism),
        ("Equation Registry", test_equation_registry),
        ("JSON Output", test_json_output),
        ("LaTeX Output", test_latex_output),
        ("Unit Verifier", test_unit_verifier),
    ]

    passed = 0
    failed = 0

    for name, test_fn in tests:
        try:
            result = test_fn()
            if result:
                passed += 1
        except Exception as e:
            print(f"\n✗ FAILED: {name}")
            print(f"  Error: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 60)

    return failed == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
