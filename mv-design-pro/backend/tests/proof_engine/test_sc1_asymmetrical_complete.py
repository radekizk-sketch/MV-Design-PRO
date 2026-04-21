"""
SC Asymmetrical Proofs — Complete Test Suite (§4.1 Blocker Resolution)

Tests:
1. Mathematical correctness (manual computation vs proof engine)
2. Anti-double-counting c factor (c in EQ_SC1_008 ONLY)
3. Completeness: {I''k, ip, I_th, I_dyn} MANDATORY — missing = FAIL
4. Determinism: 2x run = identical proof (modulo document_id/created_at)
5. Unit verification: all steps pass
6. Proof Pack: all 3 fault types (1F-Z, 2F, 2F-Z)
7. Normative references: IEC 60909-0:2016 points present
"""

from __future__ import annotations

import math
from datetime import datetime
from uuid import uuid4

import pytest
from application.proof_engine.equation_registry import (
    AntiDoubleCountingAudit,
    EquationRegistry,
)
from application.proof_engine.packs.sc_asymmetrical import (
    SCAsymmetricalPackInput,
    SCAsymmetricalProofPack,
)
from application.proof_engine.proof_generator import ProofGenerator, SC1Input
from application.proof_engine.types import ProofType

# =============================================================================
# Test Fixtures
# =============================================================================

A_OPERATOR = complex(-0.5, math.sqrt(3) / 2)

# Reference network: Z1, Z2, Z0 (typical MV network)
Z1 = complex(0.5, 1.2)
Z2 = complex(0.6, 1.1)
Z0 = complex(0.8, 2.4)

U_N_KV = 15.0
C_FACTOR = 1.10
U_PREFAULT_KV = C_FACTOR * U_N_KV / math.sqrt(3)  # = c·Un/√3

FIXED_TIMESTAMP = datetime(2026, 2, 6, 10, 0, 0)
SOLVER_VERSION = "1.0.0-test"


def _make_sc1_input(fault_type: str, **kwargs) -> SC1Input:
    defaults = {
        "project_name": "Test Project §4.1",
        "case_name": f"Test Case {fault_type}",
        "fault_node_id": "B1",
        "fault_type": fault_type,
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
    defaults.update(kwargs)
    return SC1Input(**defaults)


def _make_pack_input(**kwargs) -> SCAsymmetricalPackInput:
    defaults = {
        "project_name": "Test Project §4.1",
        "case_name": "Full Pack Test",
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
    defaults.update(kwargs)
    return SCAsymmetricalPackInput(**defaults)


# =============================================================================
# 1. Mathematical Correctness Tests
# =============================================================================


class TestMathematicalCorrectness:
    """Porównanie ręczne (manual computation) vs proof engine."""

    def _manual_compute_1fz(self):
        """Manual computation for 1F-Z fault."""
        z_equiv = Z1 + Z2 + Z0
        i1 = U_PREFAULT_KV / z_equiv
        i2 = i1
        i0 = i1
        a = A_OPERATOR
        a2 = a**2
        ia = i0 + i1 + i2
        ib = i0 + a2 * i1 + a * i2
        ic = i0 + a * i1 + a2 * i2
        ikss = math.sqrt(3) * C_FACTOR * U_N_KV / abs(z_equiv)
        rx = z_equiv.real / z_equiv.imag if z_equiv.imag != 0 else 0
        kappa = 1.02 + 0.98 * math.exp(-3 * rx)
        ip = kappa * math.sqrt(2) * ikss
        ith = ikss  # m=1, n=0 → √(1+0) = 1
        return z_equiv, i1, i2, i0, ia, ib, ic, ikss, kappa, ip, ith

    def _manual_compute_2f(self):
        """Manual computation for 2F fault."""
        z_equiv = Z1 + Z2
        i1 = U_PREFAULT_KV / z_equiv
        i2 = -i1
        i0 = 0.0
        a = A_OPERATOR
        a2 = a**2
        ia = i0 + i1 + i2
        ib = i0 + a2 * i1 + a * i2
        ic = i0 + a * i1 + a2 * i2
        ikss = C_FACTOR * U_N_KV / abs(z_equiv)
        rx = z_equiv.real / z_equiv.imag if z_equiv.imag != 0 else 0
        kappa = 1.02 + 0.98 * math.exp(-3 * rx)
        ip = kappa * math.sqrt(2) * ikss
        ith = ikss
        return z_equiv, i1, i2, i0, ia, ib, ic, ikss, kappa, ip, ith

    def _manual_compute_2fz(self):
        """Manual computation for 2F-Z fault."""
        z_equiv = Z1 + (Z2 * Z0) / (Z2 + Z0)
        i1 = U_PREFAULT_KV / z_equiv
        denom = Z2 + Z0
        i2 = -(Z0 / denom) * i1
        i0 = -(Z2 / denom) * i1
        a = A_OPERATOR
        a2 = a**2
        ia = i0 + i1 + i2
        ib = i0 + a2 * i1 + a * i2
        ic = i0 + a * i1 + a2 * i2
        ikss = C_FACTOR * U_N_KV / abs(z_equiv)
        rx = z_equiv.real / z_equiv.imag if z_equiv.imag != 0 else 0
        kappa = 1.02 + 0.98 * math.exp(-3 * rx)
        ip = kappa * math.sqrt(2) * ikss
        ith = ikss
        return z_equiv, i1, i2, i0, ia, ib, ic, ikss, kappa, ip, ith

    @pytest.mark.parametrize(
        "fault_type,manual_fn",
        [
            ("ONE_PHASE_TO_GROUND", "_manual_compute_1fz"),
            ("TWO_PHASE", "_manual_compute_2f"),
            ("TWO_PHASE_TO_GROUND", "_manual_compute_2fz"),
        ],
    )
    def test_ikss_matches_manual(self, fault_type, manual_fn):
        """I''k from proof matches manual computation."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        _, _, _, _, _, _, _, ikss_manual, _, _, _ = getattr(self, manual_fn)()

        ikss_proof = proof.summary.key_results["ikss_ka"].value
        assert abs(ikss_proof - ikss_manual) < 1e-8, (
            f"I''k mismatch for {fault_type}: " f"proof={ikss_proof:.8f}, manual={ikss_manual:.8f}"
        )

    @pytest.mark.parametrize(
        "fault_type,manual_fn",
        [
            ("ONE_PHASE_TO_GROUND", "_manual_compute_1fz"),
            ("TWO_PHASE", "_manual_compute_2f"),
            ("TWO_PHASE_TO_GROUND", "_manual_compute_2fz"),
        ],
    )
    def test_ip_matches_manual(self, fault_type, manual_fn):
        """ip from proof matches manual computation."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        _, _, _, _, _, _, _, _, _, ip_manual, _ = getattr(self, manual_fn)()

        ip_proof = proof.summary.key_results["ip_ka"].value
        assert abs(ip_proof - ip_manual) < 1e-8, (
            f"ip mismatch for {fault_type}: " f"proof={ip_proof:.8f}, manual={ip_manual:.8f}"
        )

    @pytest.mark.parametrize(
        "fault_type,manual_fn",
        [
            ("ONE_PHASE_TO_GROUND", "_manual_compute_1fz"),
            ("TWO_PHASE", "_manual_compute_2f"),
            ("TWO_PHASE_TO_GROUND", "_manual_compute_2fz"),
        ],
    )
    def test_ith_matches_manual(self, fault_type, manual_fn):
        """I_th from proof matches manual computation."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        _, _, _, _, _, _, _, _, _, _, ith_manual = getattr(self, manual_fn)()

        ith_proof = proof.summary.key_results["ith_ka"].value
        assert abs(ith_proof - ith_manual) < 1e-8, (
            f"I_th mismatch for {fault_type}: " f"proof={ith_proof:.8f}, manual={ith_manual:.8f}"
        )

    @pytest.mark.parametrize(
        "fault_type,manual_fn",
        [
            ("ONE_PHASE_TO_GROUND", "_manual_compute_1fz"),
            ("TWO_PHASE", "_manual_compute_2f"),
            ("TWO_PHASE_TO_GROUND", "_manual_compute_2fz"),
        ],
    )
    def test_z_equiv_matches_manual(self, fault_type, manual_fn):
        """Z_k from proof matches manual computation."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        z_equiv_manual, _, _, _, _, _, _, _, _, _, _ = getattr(self, manual_fn)()

        z_equiv_proof = proof.summary.key_results["z_equiv_ohm"].value
        assert abs(z_equiv_proof - z_equiv_manual) < 1e-10


# =============================================================================
# 2. Anti-Double-Counting Tests
# =============================================================================


class TestAntiDoubleCountingC:
    """Weryfikacja: c w EQ_SC1_008 ONLY, NIE w innych SC1 equations."""

    def test_sc1_audit_passes(self):
        """SC1 anti-double-counting audit = PASS."""
        assert AntiDoubleCountingAudit.verify_sc1() is True

    def test_c_only_in_eq_sc1_008(self):
        """c appears in exactly ONE SC1 equation: EQ_SC1_008."""
        audit = AntiDoubleCountingAudit.SC1_PROOF_EQUATIONS_AUDIT
        c_equations = [eq_id for eq_id, has_c in audit.items() if has_c]
        assert c_equations == [
            "EQ_SC1_008"
        ], f"c should appear in EQ_SC1_008 only, but found in: {c_equations}"

    def test_sc3f_audit_still_passes(self):
        """SC3F anti-double-counting audit still = PASS."""
        assert AntiDoubleCountingAudit.verify() is True

    def test_audit_report_contains_sc1(self):
        """Audit report contains SC1 section."""
        report = AntiDoubleCountingAudit.get_audit_report()
        assert "SC1" in report
        assert "EQ_SC1_008" in report

    def test_registry_verify_anti_double_counting_sc1(self):
        """EquationRegistry.verify_anti_double_counting_sc1() = True."""
        assert EquationRegistry.verify_anti_double_counting_sc1() is True

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_c_factor_in_proof_step_only_sc1_008(self, fault_type):
        """In generated proof, c_factor source_key appears only in EQ_SC1_008 step."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        c_steps = []
        for step in proof.steps:
            if "c" in step.source_keys and step.source_keys.get("c") == "c_factor":
                c_steps.append(step.equation.equation_id)
        assert c_steps == [
            "EQ_SC1_008"
        ], f"c_factor should only be in EQ_SC1_008, found in: {c_steps}"


# =============================================================================
# 3. Completeness Tests (I''k, ip, I_th, I_dyn MANDATORY)
# =============================================================================


class TestCompleteness:
    """Brak któregokolwiek z {I''k, ip, I_th, I_dyn} = FAIL."""

    MANDATORY_KEYS = {"ikss_ka", "ip_ka", "ith_ka", "idyn_ka"}

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_all_mandatory_results_present(self, fault_type):
        """All mandatory results present in key_results."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        missing = self.MANDATORY_KEYS - set(proof.summary.key_results.keys())
        assert not missing, f"Missing mandatory results for {fault_type}: {missing}"

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_mandatory_values_positive(self, fault_type):
        """All mandatory results are positive (physical sense)."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        for key in self.MANDATORY_KEYS:
            value = proof.summary.key_results[key].value
            assert value > 0, f"{key} should be positive for {fault_type}, got {value}"

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_kappa_in_results(self, fault_type):
        """kappa present in key_results."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        assert "kappa" in proof.summary.key_results

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_idyn_equals_ip(self, fault_type):
        """I_dyn = ip (definition)."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        ip = proof.summary.key_results["ip_ka"].value
        idyn = proof.summary.key_results["idyn_ka"].value
        assert abs(ip - idyn) < 1e-12, f"I_dyn should equal ip for {fault_type}"

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_step_count_is_10(self, fault_type):
        """Each proof has exactly 10 steps (7 original + 5 new)."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        assert len(proof.steps) == 10, f"Expected 10 steps for {fault_type}, got {len(proof.steps)}"

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_sequence_currents_present(self, fault_type):
        """Sequence currents (i1, i2, i0) present in key_results."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        for key in ["i1_ka", "i2_ka", "i0_ka"]:
            assert key in proof.summary.key_results, f"Missing {key} for {fault_type}"


# =============================================================================
# 4. Determinism Tests
# =============================================================================


class TestDeterminism:
    """Determinizm: 2x run z identycznymi danymi = identyczny proof."""

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_json_determinism(self, fault_type):
        """Same input → identical JSON (minus document_id, created_at)."""
        artifact_id = uuid4()
        data = _make_sc1_input(fault_type)

        proof_1 = ProofGenerator.generate_sc1_proof(data, artifact_id)
        proof_2 = ProofGenerator.generate_sc1_proof(data, artifact_id)

        d1 = proof_1.to_dict()
        d2 = proof_2.to_dict()

        # Remove non-deterministic fields
        for d in (d1, d2):
            del d["document_id"]
            del d["created_at"]

        assert d1 == d2, f"Non-deterministic proof for {fault_type}"

    def test_pack_determinism(self):
        """Full pack is deterministic."""
        artifact_id = uuid4()
        data = _make_pack_input()

        result_1 = SCAsymmetricalProofPack.generate(data, artifact_id)
        result_2 = SCAsymmetricalProofPack.generate(data, artifact_id)

        for label, p1, p2 in [
            ("1F-Z", result_1.proof_1fz, result_2.proof_1fz),
            ("2F", result_1.proof_2f, result_2.proof_2f),
            ("2F-Z", result_1.proof_2fz, result_2.proof_2fz),
        ]:
            d1 = p1.to_dict()
            d2 = p2.to_dict()
            for d in (d1, d2):
                del d["document_id"]
                del d["created_at"]
            assert d1 == d2, f"Non-deterministic pack for {label}"


# =============================================================================
# 5. Unit Verification Tests
# =============================================================================


class TestUnitVerification:
    """Wszystkie weryfikacje jednostek przechodzą."""

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_all_unit_checks_pass(self, fault_type):
        """All unit checks pass in generated proof."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        for step in proof.steps:
            assert step.unit_check.passed, (
                f"Unit check failed for {step.equation.equation_id} "
                f"in {fault_type}: {step.unit_check.derivation}"
            )

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_summary_unit_check_passed(self, fault_type):
        """Summary unit_check_passed = True."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        assert proof.summary.unit_check_passed


# =============================================================================
# 6. Proof Pack Tests
# =============================================================================


class TestSCAsymmetricalProofPack:
    """Test full proof pack generation."""

    def test_pack_generates_all_three_proofs(self):
        """Pack contains proofs for all 3 fault types."""
        result = SCAsymmetricalProofPack.generate(_make_pack_input())
        assert result.proof_1fz is not None
        assert result.proof_2f is not None
        assert result.proof_2fz is not None

    def test_pack_proof_types_correct(self):
        """Each proof has correct ProofType."""
        result = SCAsymmetricalProofPack.generate(_make_pack_input())
        assert result.proof_1fz.proof_type == ProofType.SC1F_IEC60909
        assert result.proof_2f.proof_type == ProofType.SC2F_IEC60909
        assert result.proof_2fz.proof_type == ProofType.SC2FG_IEC60909

    def test_pack_all_passed(self):
        """Pack all_passed = True."""
        result = SCAsymmetricalProofPack.generate(_make_pack_input())
        assert result.all_passed

    def test_pack_completeness_validation(self):
        """validate_completeness returns empty list (all mandatory present)."""
        result = SCAsymmetricalProofPack.generate(_make_pack_input())
        missing = SCAsymmetricalProofPack.validate_completeness(result)
        assert missing == [], f"Missing mandatory results: {missing}"

    def test_pack_to_dict(self):
        """Pack to_dict is serializable."""
        result = SCAsymmetricalProofPack.generate(_make_pack_input())
        d = result.to_dict()
        assert "proof_1fz" in d
        assert "proof_2f" in d
        assert "proof_2fz" in d
        assert d["all_passed"] is True


# =============================================================================
# 7. Normative References Tests
# =============================================================================


class TestNormativeReferences:
    """Odniesienia do IEC 60909-0:2016 w dowodach."""

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_iec_reference_in_all_steps(self, fault_type):
        """Each step has IEC 60909 standard reference."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        for step in proof.steps:
            ref = step.equation.standard_ref
            assert (
                "IEC 60909" in ref
            ), f"Missing IEC 60909 reference in {step.equation.equation_id}: {ref}"

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_proof_type_in_header(self, fault_type):
        """Header contains fault_type."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        assert proof.header.fault_type is not None
        assert proof.header.fault_type in {"SC1FZ", "SC2F", "SC2FZ"}

    def test_all_equations_have_latex(self):
        """All SC1 equations have LaTeX formulas."""
        equations = EquationRegistry.get_sc1_equations()
        for eq_id, eq in equations.items():
            assert eq.latex, f"Missing LaTeX for {eq_id}"
            assert len(eq.latex) > 5, f"LaTeX too short for {eq_id}"


# =============================================================================
# 8. Step Order Tests
# =============================================================================


class TestStepOrder:
    """Weryfikacja kolejności kroków."""

    @pytest.mark.parametrize(
        "fault_type,expected_eq_ids",
        [
            (
                "ONE_PHASE_TO_GROUND",
                [
                    "EQ_SC1_001",
                    "EQ_SC1_002",
                    "EQ_SC1_003",
                    "EQ_SC1_006",
                    "EQ_SC1_007",
                    "EQ_SC1_008",
                    "EQ_SC1_009",
                    "EQ_SC1_010",
                    "EQ_SC1_012",
                    "EQ_SC1_011",
                ],
            ),
            (
                "TWO_PHASE",
                [
                    "EQ_SC1_001",
                    "EQ_SC1_002",
                    "EQ_SC1_004",
                    "EQ_SC1_006",
                    "EQ_SC1_007",
                    "EQ_SC1_008",
                    "EQ_SC1_009",
                    "EQ_SC1_010",
                    "EQ_SC1_012",
                    "EQ_SC1_011",
                ],
            ),
            (
                "TWO_PHASE_TO_GROUND",
                [
                    "EQ_SC1_001",
                    "EQ_SC1_002",
                    "EQ_SC1_005",
                    "EQ_SC1_006",
                    "EQ_SC1_007",
                    "EQ_SC1_008",
                    "EQ_SC1_009",
                    "EQ_SC1_010",
                    "EQ_SC1_012",
                    "EQ_SC1_011",
                ],
            ),
        ],
    )
    def test_step_order_matches_proof(self, fault_type, expected_eq_ids):
        """Proof steps follow the canonical step order."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        actual_ids = [step.equation.equation_id for step in proof.steps]
        assert actual_ids == expected_eq_ids, (
            f"Step order mismatch for {fault_type}:\n"
            f"  Expected: {expected_eq_ids}\n"
            f"  Actual:   {actual_ids}"
        )


# =============================================================================
# 9. Physical Sanity Tests
# =============================================================================


class TestPhysicalSanity:
    """Weryfikacja fizycznego sensu wyników."""

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_ip_greater_than_ikss(self, fault_type):
        """ip > I''k (always, because κ·√2 > 1)."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        ikss = proof.summary.key_results["ikss_ka"].value
        ip = proof.summary.key_results["ip_ka"].value
        assert ip > ikss, f"ip should be > I''k for {fault_type}"

    @pytest.mark.parametrize(
        "fault_type",
        ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"],
    )
    def test_kappa_in_physical_range(self, fault_type):
        """1.0 < κ ≤ 2.0 (physical range per IEC 60909)."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input(fault_type))
        kappa = proof.summary.key_results["kappa"].value
        assert 1.0 < kappa <= 2.0, f"κ = {kappa} out of physical range for {fault_type}"

    def test_1fz_ikss_uses_sqrt3_factor(self):
        """1F-Z: I''k = √3·c·Un / |Zk| (voltage factor √3)."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input("ONE_PHASE_TO_GROUND"))
        z_equiv = Z1 + Z2 + Z0
        expected = math.sqrt(3) * C_FACTOR * U_N_KV / abs(z_equiv)
        actual = proof.summary.key_results["ikss_ka"].value
        assert abs(actual - expected) < 1e-8

    def test_2f_ikss_uses_unity_factor(self):
        """2F: I''k = c·Un / |Zk| (voltage factor 1.0)."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input("TWO_PHASE"))
        z_equiv = Z1 + Z2
        expected = C_FACTOR * U_N_KV / abs(z_equiv)
        actual = proof.summary.key_results["ikss_ka"].value
        assert abs(actual - expected) < 1e-8

    def test_2fz_ikss_uses_unity_factor(self):
        """2F-Z: I''k = c·Un / |Zk|."""
        proof = ProofGenerator.generate_sc1_proof(_make_sc1_input("TWO_PHASE_TO_GROUND"))
        z_equiv = Z1 + (Z2 * Z0) / (Z2 + Z0)
        expected = C_FACTOR * U_N_KV / abs(z_equiv)
        actual = proof.summary.key_results["ikss_ka"].value
        assert abs(actual - expected) < 1e-8


# =============================================================================
# 10. Equation Registry Integration Tests
# =============================================================================


class TestEquationRegistryIntegration:
    """Weryfikacja integracji z EquationRegistry."""

    def test_all_sc1_equations_registered(self):
        """All EQ_SC1_001-012 are in the registry."""
        for i in range(1, 13):
            eq_id = f"EQ_SC1_{i:03d}"
            eq = EquationRegistry.get_equation(eq_id)
            assert eq is not None, f"Missing equation {eq_id} in registry"

    def test_sc1_equations_dict_complete(self):
        """SC1_EQUATIONS dict has 12 entries."""
        equations = EquationRegistry.get_sc1_equations()
        assert len(equations) == 12, f"Expected 12 SC1 equations, got {len(equations)}"

    def test_id_stability_passes(self):
        """validate_id_stability still passes with new equations."""
        assert EquationRegistry.validate_id_stability() is True
