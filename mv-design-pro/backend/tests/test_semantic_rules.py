"""
Testy semantic_rules (PR-C konsolidacji UI).

Pokrywa:
- rule_cable_cannot_start_from_pole: branch_pole musi być na line_overhead
- rule_overhead_cannot_host_zksn: zksn musi być na cable
- rule_der_must_match_bay_type: DER respektuje rolę pola
- validate_semantic: wywołuje wszystkie reguły
- Legalna topologia: zwraca pustą listę
"""

from network_model.validation.semantic_rules import (
    SEMANTIC_RULES,
    rule_cable_cannot_start_from_pole,
    rule_der_must_match_bay_type,
    rule_overhead_cannot_start_from_zksn,
)
from network_model.validation.semantic_validator import (
    validate_semantic,
    validate_semantic_as_dicts,
)


def _make_branch_point(ref_id: str, bp_type: str, parent_seg_id: str) -> dict:
    return {
        "ref_id": ref_id,
        "branch_point_type": bp_type,
        "parent_segment_id": parent_seg_id,
    }


def _make_branch(seg_id: str, br_type: str) -> dict:
    return {"id": seg_id, "ref_id": seg_id, "type": br_type}


def _make_bay(ref_id: str, role: str) -> dict:
    return {"ref_id": ref_id, "bay_role": role}


def _make_generator(ref_id: str, gen_type: str, bay_ref: str) -> dict:
    return {"ref_id": ref_id, "gen_type": gen_type, "bay_ref": bay_ref}


class TestCableCannotStartFromPole:
    def test_pole_on_overhead_passes(self):
        enm = {
            "branch_points": [_make_branch_point("BP-1", "branch_pole", "SEG-1")],
            "branches": [_make_branch("SEG-1", "line_overhead")],
        }
        issues = rule_cable_cannot_start_from_pole(enm)
        assert issues == []

    def test_pole_on_cable_blocks(self):
        enm = {
            "branch_points": [_make_branch_point("BP-1", "branch_pole", "SEG-1")],
            "branches": [_make_branch("SEG-1", "cable")],
        }
        issues = rule_cable_cannot_start_from_pole(enm)
        assert len(issues) == 1
        assert issues[0].code == "semantic.cable_cannot_start_from_pole"
        assert issues[0].element_id == "BP-1"
        assert "słup" in issues[0].message.lower()

    def test_pole_without_parent_segment_skipped(self):
        enm = {
            "branch_points": [_make_branch_point("BP-1", "branch_pole", "")],
            "branches": [],
        }
        issues = rule_cable_cannot_start_from_pole(enm)
        assert issues == []


class TestOverheadCannotHostZksn:
    def test_zksn_on_cable_passes(self):
        enm = {
            "branch_points": [_make_branch_point("BP-2", "zksn", "SEG-2")],
            "branches": [_make_branch("SEG-2", "cable")],
        }
        issues = rule_overhead_cannot_start_from_zksn(enm)
        assert issues == []

    def test_zksn_on_overhead_blocks(self):
        enm = {
            "branch_points": [_make_branch_point("BP-2", "zksn", "SEG-2")],
            "branches": [_make_branch("SEG-2", "line_overhead")],
        }
        issues = rule_overhead_cannot_start_from_zksn(enm)
        assert len(issues) == 1
        assert issues[0].code == "semantic.overhead_cannot_host_zksn"
        assert issues[0].element_id == "BP-2"
        assert "zksn" in issues[0].message.lower()


class TestDerMustMatchBayType:
    def test_pv_in_der_bay_passes(self):
        enm = {
            "generators": [_make_generator("GEN-1", "PV", "BAY-1")],
            "bays": [_make_bay("BAY-1", "der")],
        }
        issues = rule_der_must_match_bay_type(enm)
        assert issues == []

    def test_pv_in_feeder_bay_passes(self):
        enm = {
            "generators": [_make_generator("GEN-1", "PV", "BAY-1")],
            "bays": [_make_bay("BAY-1", "feeder")],
        }
        issues = rule_der_must_match_bay_type(enm)
        assert issues == []

    def test_pv_in_transformer_bay_blocks(self):
        enm = {
            "generators": [_make_generator("GEN-1", "PV", "BAY-1")],
            "bays": [_make_bay("BAY-1", "transformer")],
        }
        issues = rule_der_must_match_bay_type(enm)
        assert len(issues) == 1
        assert issues[0].code == "semantic.der_bay_type_mismatch"

    def test_generator_without_bay_skipped(self):
        enm = {"generators": [_make_generator("GEN-1", "PV", "")], "bays": []}
        issues = rule_der_must_match_bay_type(enm)
        assert issues == []


class TestValidateSemantic:
    def test_legitimate_topology_returns_empty(self):
        enm = {
            "branch_points": [
                _make_branch_point("BP-1", "branch_pole", "SEG-1"),
                _make_branch_point("BP-2", "zksn", "SEG-2"),
            ],
            "branches": [
                _make_branch("SEG-1", "line_overhead"),
                _make_branch("SEG-2", "cable"),
            ],
            "generators": [_make_generator("GEN-1", "PV", "BAY-1")],
            "bays": [_make_bay("BAY-1", "der")],
        }
        assert validate_semantic(enm) == []
        assert validate_semantic_as_dicts(enm) == []

    def test_multiple_violations_collected(self):
        enm = {
            "branch_points": [
                _make_branch_point("BP-1", "branch_pole", "SEG-CABLE"),  # naruszenie 1
                _make_branch_point("BP-2", "zksn", "SEG-OH"),  # naruszenie 2
            ],
            "branches": [
                _make_branch("SEG-CABLE", "cable"),
                _make_branch("SEG-OH", "line_overhead"),
            ],
            "generators": [_make_generator("GEN-1", "PV", "BAY-1")],
            "bays": [_make_bay("BAY-1", "transformer")],  # naruszenie 3
        }
        issues = validate_semantic(enm)
        codes = {i.code for i in issues}
        assert "semantic.cable_cannot_start_from_pole" in codes
        assert "semantic.overhead_cannot_host_zksn" in codes
        assert "semantic.der_bay_type_mismatch" in codes

    def test_empty_enm_no_issues(self):
        assert validate_semantic({}) == []

    def test_as_dicts_serializable(self):
        enm = {
            "branch_points": [_make_branch_point("BP-1", "branch_pole", "SEG-1")],
            "branches": [_make_branch("SEG-1", "cable")],
        }
        dicts = validate_semantic_as_dicts(enm)
        assert len(dicts) == 1
        assert dicts[0]["code"] == "semantic.cable_cannot_start_from_pole"
        assert dicts[0]["severity"] == "ERROR"
        assert "element_id" in dicts[0]


class TestSemanticRulesRegistry:
    def test_all_three_rules_registered(self):
        assert len(SEMANTIC_RULES) == 3
