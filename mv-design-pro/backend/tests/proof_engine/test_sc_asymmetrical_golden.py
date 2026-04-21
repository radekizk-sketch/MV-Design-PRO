from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path

import pytest
from application.proof_engine.equation_registry import AntiDoubleCountingAudit
from application.proof_engine.packs.sc_asymmetrical import (
    SCAsymmetricalPackInput,
    SCAsymmetricalProofPack,
)
from application.proof_engine.proof_generator import ProofGenerator, SC1Input
from application.proof_engine.proof_inspector.exporters import export_to_tex
from application.proof_engine.serialization import proof_document_from_dict
from application.proof_engine.unit_verifier import UnitVerifier

ROOT = Path(__file__).resolve().parents[1]
GOLDEN_ROOT = ROOT / "golden" / "sc_asymmetrical"

A_OPERATOR = complex(-0.5, math.sqrt(3) / 2)
Z1 = complex(0.5, 1.2)
Z2 = complex(0.6, 1.1)
Z0 = complex(0.8, 2.4)
U_N_KV = 15.0
C_FACTOR = 1.10
U_PREFAULT_KV = C_FACTOR * U_N_KV / math.sqrt(3)
FIXED_TIMESTAMP = datetime(2026, 2, 6, 10, 0, 0)
SOLVER_VERSION = "1.0.0-test"
FIXED_DOC_ID = "00000000-0000-0000-0000-000000000001"
FIXED_ARTIFACT_ID = "00000000-0000-0000-0000-000000000001"
FIXED_CREATED_AT = "2026-02-06T10:00:00"

FAULT_CASES = {
    "1f_z": "ONE_PHASE_TO_GROUND",
    "2f": "TWO_PHASE",
    "2f_z": "TWO_PHASE_TO_GROUND",
}


def _base_kwargs() -> dict:
    return {
        "project_name": "Test Project §4.1",
        "fault_node_id": "B1",
        "run_timestamp": FIXED_TIMESTAMP,
        "solver_version": SOLVER_VERSION,
        "u_n_kv": U_N_KV,
        "c_factor": C_FACTOR,
        "u_prefault_kv": U_PREFAULT_KV,
        "z1_ohm": Z1,
        "z2_ohm": Z2,
        "z0_ohm": Z0,
        "a_operator": A_OPERATOR,
        "tk_s": 1.0,
        "m_factor": 1.0,
        "n_factor": 0.0,
    }


def _canonicalize_proof(proof) -> tuple[str, str]:
    payload = proof.to_dict()
    payload["document_id"] = FIXED_DOC_ID
    payload["artifact_id"] = FIXED_ARTIFACT_ID
    payload["created_at"] = FIXED_CREATED_AT
    normalized = proof_document_from_dict(payload)
    json_text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    tex_text = export_to_tex(normalized)
    return json_text, tex_text


def _generate_case(case_key: str):
    proof = ProofGenerator.generate_sc1_proof(
        SC1Input(
            fault_type=FAULT_CASES[case_key],
            case_name=f"Golden Case {case_key}",
            **_base_kwargs(),
        )
    )
    return _canonicalize_proof(proof)


@pytest.mark.parametrize("case_key", ["1f_z", "2f", "2f_z"])
def test_double_run_determinism(case_key: str):
    json_a, tex_a = _generate_case(case_key)
    json_b, tex_b = _generate_case(case_key)
    assert json_a == json_b
    assert tex_a == tex_b


@pytest.mark.parametrize("case_key", ["1f_z", "2f", "2f_z"])
def test_matches_golden_artifacts(case_key: str):
    expected_json = (GOLDEN_ROOT / case_key / "proof.json").read_text(encoding="utf-8")
    expected_tex = (GOLDEN_ROOT / case_key / "proof.tex").read_text(encoding="utf-8")
    actual_json, actual_tex = _generate_case(case_key)
    assert actual_json == expected_json
    assert actual_tex == expected_tex


@pytest.mark.parametrize("fault_type", ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"])
def test_mandatory_outputs_present_and_not_none(fault_type: str):
    proof = ProofGenerator.generate_sc1_proof(
        SC1Input(fault_type=fault_type, case_name="Mandatory outputs", **_base_kwargs())
    )
    for key in ("ikss_ka", "kappa", "ip_ka", "ith_ka", "idyn_ka"):
        assert key in proof.summary.key_results
        assert proof.summary.key_results[key].value is not None


def test_unit_rules_for_eq_sc1_008_012_are_active():
    for equation_id in ["EQ_SC1_008", "EQ_SC1_009", "EQ_SC1_010", "EQ_SC1_011", "EQ_SC1_012"]:
        assert equation_id in UnitVerifier.DERIVATION_RULES

    good = UnitVerifier.verify_equation("EQ_SC1_010", {"κ": "—", "I_k''": "kA"}, "kA")
    bad = UnitVerifier.verify_equation("EQ_SC1_010", {"κ": "—", "I_k''": "kA"}, "Ω")
    assert good.passed
    assert not bad.passed


def test_verify_sc1_fails_if_c_is_outside_eq_sc1_008(monkeypatch):
    original = dict(AntiDoubleCountingAudit.SC1_PROOF_EQUATIONS_AUDIT)
    tampered = dict(original)
    tampered["EQ_SC1_010"] = True
    monkeypatch.setattr(AntiDoubleCountingAudit, "SC1_PROOF_EQUATIONS_AUDIT", tampered)
    assert AntiDoubleCountingAudit.verify_sc1() is False


def test_pack_completeness_for_all_fault_types():
    result = SCAsymmetricalProofPack.generate(
        SCAsymmetricalPackInput(
            case_name="Pack", **{k: v for k, v in _base_kwargs().items() if k != "fault_type"}
        )
    )
    assert SCAsymmetricalProofPack.validate_completeness(result) == []
