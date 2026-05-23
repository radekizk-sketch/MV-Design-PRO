"""Tests for comparator engine (PF / SC / overall validation)."""

from __future__ import annotations

from application.reference_networks.comparator import (
    ElementComparison,
    build_validation_report,
    compare_power_flow,
    compare_power_flow_branches,
    compare_short_circuit,
)
from application.reference_networks.expected_values import (
    ExpectedBranchPF,
    ExpectedBusPF,
    ExpectedShortCircuit,
    ExpectedValues,
)


class TestComparePowerFlow:
    """Per-bus PF comparison logic."""

    def test_matching_voltages_pass(self) -> None:
        expected = ExpectedValues(
            network_id="test",
            source="test",
            power_flow=(ExpectedBusPF(bus_id="BUS-1", v_pu=1.0, angle_deg=0.0, rtol=1e-3),),
        )
        actual = {"BUS-1": {"v_pu": 1.0, "angle_deg": 0.0}}
        result = compare_power_flow(actual, expected)
        v_comp = next(c for c in result if c.quantity == "v_pu")
        assert v_comp.status == "PASS"

    def test_out_of_tolerance_fails(self) -> None:
        expected = ExpectedValues(
            network_id="test",
            source="test",
            power_flow=(ExpectedBusPF(bus_id="BUS-1", v_pu=1.0, angle_deg=0.0, rtol=1e-3),),
        )
        actual = {"BUS-1": {"v_pu": 1.5, "angle_deg": 0.0}}  # 50% off
        result = compare_power_flow(actual, expected)
        v_comp = next(c for c in result if c.quantity == "v_pu")
        assert v_comp.status == "FAIL"

    def test_missing_bus_in_actual_fails(self) -> None:
        expected = ExpectedValues(
            network_id="test",
            source="test",
            power_flow=(ExpectedBusPF(bus_id="BUS-1", v_pu=1.0, angle_deg=0.0),),
        )
        actual: dict[str, dict[str, float]] = {}
        result = compare_power_flow(actual, expected)
        assert all(c.status == "FAIL" for c in result)

    def test_angle_comparison_lenient_near_zero(self) -> None:
        """Small expected angles should tolerate 0.5° absolute."""
        expected = ExpectedValues(
            network_id="test",
            source="test",
            power_flow=(ExpectedBusPF(bus_id="BUS-1", v_pu=1.0, angle_deg=0.1, rtol=1e-3),),
        )
        actual = {"BUS-1": {"v_pu": 1.0, "angle_deg": 0.3}}  # 0.2° off, small angle
        result = compare_power_flow(actual, expected)
        angle_comp = next(c for c in result if c.quantity == "angle_deg")
        assert angle_comp.status == "PASS"


class TestCompareShortCircuit:
    """Per-fault SC comparison logic."""

    def test_matching_ikss_passes(self) -> None:
        expected = ExpectedValues(
            network_id="test",
            source="test",
            short_circuit=(
                ExpectedShortCircuit(
                    fault_node_id="BUS-1",
                    sc_type="3F",
                    ikss_a=10000.0,
                    ip_a=25000.0,
                    ith_a=12000.0,
                    sk_mva=500.0,
                    rtol=2e-2,
                ),
            ),
        )
        actual = {
            "BUS-1__3F": {"ikss_a": 10100.0, "ip_a": 25200.0, "ith_a": 12100.0, "sk_mva": 505.0},
        }
        result = compare_short_circuit(actual, expected)
        # All values within 2% tolerance - all PASS
        assert all(c.status == "PASS" for c in result)


class TestBuildValidationReport:
    """Aggregate report logic."""

    def test_all_pass_gives_overall_pass(self) -> None:
        pf_comp = (
            ElementComparison("B1", "v_pu", 1.0, 1.0, 1e-3, 0.0, 0.0, "PASS"),
        )
        report = build_validation_report(
            network_id="test",
            network_name_pl="Test Network",
            source="test source",
            solver_version="v1",
            pf_comparisons=pf_comp,
            pf_branch_comparisons=(),
            sc_comparisons=(),
        )
        assert report.overall_status == "PASS"
        assert report.pf_pass_count == 1
        assert report.pf_fail_count == 0

    def test_any_fail_gives_overall_fail(self) -> None:
        pf_comp = (
            ElementComparison("B1", "v_pu", 1.0, 1.0, 1e-3, 0.0, 0.0, "PASS"),
            ElementComparison("B2", "v_pu", 1.5, 1.0, 1e-3, 0.5, 0.5, "FAIL"),
        )
        report = build_validation_report(
            network_id="test",
            network_name_pl="Test Network",
            source="test source",
            solver_version="v1",
            pf_comparisons=pf_comp,
            pf_branch_comparisons=(),
            sc_comparisons=(),
        )
        assert report.overall_status == "FAIL"
        assert report.pf_pass_count == 1
        assert report.pf_fail_count == 1

    def test_report_serializes_to_dict(self) -> None:
        report = build_validation_report(
            network_id="test",
            network_name_pl="Test",
            source="src",
            solver_version="v1",
            pf_comparisons=(),
            pf_branch_comparisons=(),
            sc_comparisons=(),
        )
        d = report.to_dict()
        assert d["network_id"] == "test"
        assert d["overall_status"] == "PASS"
        assert "pf_comparisons" in d
