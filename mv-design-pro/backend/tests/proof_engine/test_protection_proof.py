"""
P18 Protection Overcurrent & Selectivity Tests.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import pytest
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.proof_generator import ProofGenerator
from application.proof_engine.proof_inspector import ProofInspector
from application.proof_engine.types import (
    ProofType,
    ProtectionProofInput,
    ProtectionSelectivityInput,
)


def _build_protection_input() -> ProtectionProofInput:
    return ProtectionProofInput(
        project_name="Test Project",
        case_name="Test Case P18",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        target_id="PROT_01",
        device_id="DEV_01",
        ikss_ka=10.0,
        ip_ka=20.0,
        ith_ka=5.0,
        tk_s=1.0,
        icu_ka=15.0,
        idyn_ka=18.0,
        ith_limit_ka2s=30.0,
        selectivity=ProtectionSelectivityInput(
            current_ka=8.0,
            downstream_device_id="FUSE_01",
            upstream_device_id="BREAKER_01",
            downstream_max_s=0.2,
            upstream_min_s=0.5,
            margin_s=0.05,
        ),
    )


def test_protection_proof_type() -> None:
    proof = ProofGenerator.generate_protection_proof(_build_protection_input())
    assert proof.proof_type == ProofType.PROTECTION_OVERCURRENT


def test_protection_registry_ids_exist() -> None:
    assert EquationRegistry.get_equation("EQ_PR_001") is not None
    assert EquationRegistry.get_equation("EQ_PR_002") is not None
    assert EquationRegistry.get_equation("EQ_PR_003") is not None
    assert EquationRegistry.get_equation("EQ_PR_004") is not None


def test_protection_step_order_deterministic() -> None:
    assert EquationRegistry.get_pr_step_order() == [
        "EQ_PR_001",
        "EQ_PR_002",
        "EQ_PR_003",
        "EQ_PR_004",
    ]


def test_protection_comparisons() -> None:
    proof = ProofGenerator.generate_protection_proof(_build_protection_input())

    assert proof.summary.key_results["breaking_ok"].value == "OK"
    assert proof.summary.key_results["dynamic_ok"].value == "NOT_OK"
    assert proof.summary.key_results["thermal_ok"].value == "OK"
    assert proof.summary.key_results["selectivity_ok"].value == "OK"

    assert proof.summary.key_results["breaking_margin_ka"].value == pytest.approx(5.0)
    assert proof.summary.key_results["dynamic_margin_ka"].value == pytest.approx(-2.0)
    assert proof.summary.key_results["thermal_margin_ka2s"].value == pytest.approx(5.0)
    assert proof.summary.key_results["selectivity_margin_s"].value == pytest.approx(0.25)


def test_protection_unit_checks_pass() -> None:
    proof = ProofGenerator.generate_protection_proof(_build_protection_input())
    assert all(step.unit_check.passed for step in proof.steps)


def test_protection_json_determinism() -> None:
    artifact_id = UUID("12345678-1234-5678-1234-567812345679")
    data = _build_protection_input()
    proof_a = ProofGenerator.generate_protection_proof(data, artifact_id)
    proof_b = ProofGenerator.generate_protection_proof(data, artifact_id)

    json_a = proof_a.to_dict()
    json_b = proof_b.to_dict()

    del json_a["document_id"]
    del json_a["created_at"]
    del json_b["document_id"]
    del json_b["created_at"]

    assert json_a == json_b


def test_protection_missing_data_warning() -> None:
    data = ProtectionProofInput(
        project_name="Test Project",
        case_name="Test Case P18 Missing",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        target_id="PROT_02",
        device_id=None,
        ikss_ka=None,
        ip_ka=None,
        ith_ka=None,
        tk_s=None,
        icu_ka=None,
        idyn_ka=None,
        ith_limit_ka2s=None,
        selectivity=None,
    )

    proof = ProofGenerator.generate_protection_proof(data)
    assert proof.summary.warnings
    assert proof.summary.key_results["breaking_ok"].value == "NOT_EVALUATED"
    assert proof.summary.key_results["dynamic_ok"].value == "NOT_EVALUATED"
    assert proof.summary.key_results["thermal_ok"].value == "NOT_EVALUATED"
    assert proof.summary.key_results["selectivity_ok"].value == "NOT_EVALUATED"


def test_protection_inspector_view() -> None:
    proof = ProofGenerator.generate_protection_proof(_build_protection_input())
    inspector = ProofInspector(proof)
    view = inspector.get_view()

    assert view.summary.protection_comparisons is not None
    assert len(view.summary.protection_comparisons.rows) == 4
    assert all(row.why_pl for row in view.summary.protection_comparisons.rows)
