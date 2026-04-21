"""
Tests for EquationRegistryV2 + MathSpecVersion — PR-34.

Tests:
- Registry immutability (same default() → same entries)
- All equation IDs are stable and unique
- MathSpecVersion parsing
- Version bump enforcement
"""

from __future__ import annotations

from domain.trace_v2.equation_registry_v2 import EquationRegistryV2
from domain.trace_v2.math_spec_version import CURRENT_MATH_SPEC_VERSION, MathSpecVersion


class TestEquationRegistryImmutability:
    def test_default_registry_same_ids(self) -> None:
        r1 = EquationRegistryV2.default()
        r2 = EquationRegistryV2.default()
        assert r1.all_ids() == r2.all_ids()

    def test_all_ids_unique(self) -> None:
        r = EquationRegistryV2.default()
        ids = r.all_ids()
        assert len(ids) == len(set(ids))

    def test_all_ids_sorted(self) -> None:
        r = EquationRegistryV2.default()
        ids = r.all_ids()
        assert ids == sorted(ids)

    def test_sc_equations_present(self) -> None:
        r = EquationRegistryV2.default()
        required = [
            "SC_ZK_3F",
            "SC_ZK_2F",
            "SC_ZK_1F",
            "SC_ZK_2FG",
            "SC_IKSS",
            "SC_KAPPA",
            "SC_IP",
            "SC_IB",
            "SC_ITH",
            "SC_IDYN",
            "SC_SK",
        ]
        for eq_id in required:
            assert r.contains(eq_id), f"Missing SC equation: {eq_id}"

    def test_protection_equations_present(self) -> None:
        r = EquationRegistryV2.default()
        required = [
            "PROT_CT_CONVERSION",
            "PROT_MULTIPLE_M",
            "PROT_IEC_IDMT",
            "PROT_F50_TRIP",
        ]
        for eq_id in required:
            assert r.contains(eq_id), f"Missing Protection equation: {eq_id}"

    def test_load_flow_equations_present(self) -> None:
        r = EquationRegistryV2.default()
        required = [
            "LF_CONVERGENCE",
            "LF_POWER_BALANCE_P",
            "LF_POWER_BALANCE_Q",
            "LF_BUS_VOLTAGE",
            "LF_BRANCH_FLOW",
            "LF_BRANCH_LOSSES",
        ]
        for eq_id in required:
            assert r.contains(eq_id), f"Missing LF equation: {eq_id}"

    def test_all_entries_have_valid_from(self) -> None:
        r = EquationRegistryV2.default()
        for entry in r.all_entries():
            assert entry.valid_from_math_spec == CURRENT_MATH_SPEC_VERSION

    def test_all_entries_have_label_pl(self) -> None:
        r = EquationRegistryV2.default()
        for entry in r.all_entries():
            assert entry.label_pl, f"{entry.eq_id} missing label_pl"

    def test_all_entries_have_latex(self) -> None:
        r = EquationRegistryV2.default()
        for entry in r.all_entries():
            assert entry.latex_symbolic, f"{entry.eq_id} missing latex_symbolic"

    def test_to_dict_deterministic(self) -> None:
        r1 = EquationRegistryV2.default()
        r2 = EquationRegistryV2.default()
        assert r1.to_dict() == r2.to_dict()


class TestMathSpecVersion:
    def test_parse(self) -> None:
        v = MathSpecVersion.parse("1.2.3")
        assert v.major == 1
        assert v.minor == 2
        assert v.patch == 3

    def test_str(self) -> None:
        v = MathSpecVersion(major=1, minor=0, patch=0)
        assert str(v) == "1.0.0"

    def test_current(self) -> None:
        v = MathSpecVersion.current()
        assert str(v) == CURRENT_MATH_SPEC_VERSION

    def test_compatible(self) -> None:
        v1 = MathSpecVersion.parse("1.0.0")
        v2 = MathSpecVersion.parse("1.1.0")
        v3 = MathSpecVersion.parse("2.0.0")
        assert v1.is_compatible_with(v2)
        assert not v1.is_compatible_with(v3)

    def test_ordering(self) -> None:
        v1 = MathSpecVersion.parse("1.0.0")
        v2 = MathSpecVersion.parse("1.1.0")
        v3 = MathSpecVersion.parse("1.0.1")
        assert v1 < v2
        assert v1 < v3
        assert v3 < v2

    def test_invalid_parse(self) -> None:
        import pytest

        with pytest.raises(ValueError):
            MathSpecVersion.parse("not_a_version")
