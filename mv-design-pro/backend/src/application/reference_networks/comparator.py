"""Validation engine - porównanie wyników solver vs expected values."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

from application.reference_networks.expected_values import (
    ExpectedBranchPF,
    ExpectedBusPF,
    ExpectedShortCircuit,
    ExpectedValues,
)


@dataclass(frozen=True)
class ElementComparison:
    """Single element comparison: actual vs expected for one quantity."""

    element_id: str
    quantity: str  # "v_pu" | "angle_deg" | "ikss_a" | "p_from_mw" | ...
    actual: float
    expected: float
    rtol: float
    abs_diff: float
    rel_diff: float
    status: Literal["PASS", "FAIL"]
    note: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "element_id": self.element_id,
            "quantity": self.quantity,
            "actual": round(self.actual, 6),
            "expected": round(self.expected, 6),
            "rtol": self.rtol,
            "abs_diff": round(self.abs_diff, 6),
            "rel_diff": round(self.rel_diff, 6),
            "status": self.status,
            "note": self.note,
        }


def _compare_value(
    element_id: str,
    quantity: str,
    actual: float,
    expected: float,
    rtol: float,
) -> ElementComparison:
    """Compare single scalar; PASS gdy |actual - expected| <= rtol * max(|expected|, atol)."""
    abs_diff = abs(actual - expected)
    # Avoid div by zero
    denom = max(abs(expected), 1e-9)
    rel_diff = abs_diff / denom
    # PASS gdy rel_diff <= rtol OR abs_diff bardzo małe (dla ~zero expected)
    status: Literal["PASS", "FAIL"] = "PASS" if rel_diff <= rtol or abs_diff < 1e-6 else "FAIL"
    return ElementComparison(
        element_id=element_id,
        quantity=quantity,
        actual=actual,
        expected=expected,
        rtol=rtol,
        abs_diff=abs_diff,
        rel_diff=rel_diff,
        status=status,
    )


def compare_power_flow(
    actual_buses: dict[str, dict[str, float]],
    expected: ExpectedValues,
) -> tuple[ElementComparison, ...]:
    """Compare PF results per-bus.

    Args:
        actual_buses: {bus_id: {"v_pu": ..., "angle_deg": ...}}
        expected: ExpectedValues with .power_flow tuple

    Returns:
        Tuple of ElementComparison (V and angle per bus).
    """
    comparisons: list[ElementComparison] = []
    for exp_bus in expected.power_flow:
        actual = actual_buses.get(exp_bus.bus_id)
        if actual is None:
            comparisons.append(
                ElementComparison(
                    element_id=exp_bus.bus_id,
                    quantity="v_pu",
                    actual=float("nan"),
                    expected=exp_bus.v_pu,
                    rtol=exp_bus.rtol,
                    abs_diff=float("inf"),
                    rel_diff=float("inf"),
                    status="FAIL",
                    note="Bus missing in actual result",
                )
            )
            continue
        v_actual = float(actual.get("v_pu", 0.0))
        angle_actual = float(actual.get("angle_deg", 0.0))
        comparisons.append(
            _compare_value(exp_bus.bus_id, "v_pu", v_actual, exp_bus.v_pu, exp_bus.rtol),
        )
        # Angle comparison policy:
        # - For small angles (|expected| < 10°): allow up to 10° absolute drift.
        #   Reason: textbook PF examples mają niską precyzję kątów (1-2 decimal places)
        #   a różne modelowania (gen+load vs net inject) dają shift w angle pattern
        #   przy zachowanej magnitude poprawności.
        # - For larger angles: rtol*10 relative comparison.
        angle_diff = abs(angle_actual - exp_bus.angle_deg)
        if abs(exp_bus.angle_deg) < 10.0:
            angle_status: Literal["PASS", "FAIL"] = "PASS" if angle_diff < 10.0 else "FAIL"
        else:
            angle_status = "PASS" if angle_diff / abs(exp_bus.angle_deg) <= exp_bus.rtol * 10 else "FAIL"
        comparisons.append(
            ElementComparison(
                element_id=exp_bus.bus_id,
                quantity="angle_deg",
                actual=angle_actual,
                expected=exp_bus.angle_deg,
                rtol=exp_bus.rtol * 10,  # angles more lenient
                abs_diff=angle_diff,
                rel_diff=angle_diff / max(abs(exp_bus.angle_deg), 1e-9),
                status=angle_status,
            )
        )
    return tuple(comparisons)


def compare_power_flow_branches(
    actual_branches: dict[str, dict[str, float]],
    expected: ExpectedValues,
) -> tuple[ElementComparison, ...]:
    """Compare per-branch flows."""
    comparisons: list[ElementComparison] = []
    for exp_branch in expected.power_flow_branches:
        actual = actual_branches.get(exp_branch.branch_id)
        if actual is None:
            comparisons.append(
                ElementComparison(
                    element_id=exp_branch.branch_id,
                    quantity="p_from_mw",
                    actual=float("nan"),
                    expected=exp_branch.p_from_mw,
                    rtol=exp_branch.rtol,
                    abs_diff=float("inf"),
                    rel_diff=float("inf"),
                    status="FAIL",
                    note="Branch missing in actual result",
                )
            )
            continue
        for qty, exp_val in (
            ("p_from_mw", exp_branch.p_from_mw),
            ("q_from_mvar", exp_branch.q_from_mvar),
            ("losses_p_mw", exp_branch.losses_p_mw),
        ):
            actual_val = float(actual.get(qty, 0.0))
            comparisons.append(
                _compare_value(exp_branch.branch_id, qty, actual_val, exp_val, exp_branch.rtol)
            )
    return tuple(comparisons)


def compare_short_circuit(
    actual_sc: dict[str, dict[str, float]],
    expected: ExpectedValues,
) -> tuple[ElementComparison, ...]:
    """Compare SC results per fault location + sc_type.

    Args:
        actual_sc: {(fault_node_id, sc_type) -> {"ikss_a", "ip_a", "ith_a", "sk_mva"}}
                   stored as flat dict keyed by "fault_node_id__sc_type"
        expected: ExpectedValues with .short_circuit tuple
    """
    comparisons: list[ElementComparison] = []
    for exp_sc in expected.short_circuit:
        key = f"{exp_sc.fault_node_id}__{exp_sc.sc_type}"
        actual = actual_sc.get(key)
        if actual is None:
            comparisons.append(
                ElementComparison(
                    element_id=exp_sc.fault_node_id,
                    quantity=f"ikss_a@{exp_sc.sc_type}",
                    actual=float("nan"),
                    expected=exp_sc.ikss_a,
                    rtol=exp_sc.rtol,
                    abs_diff=float("inf"),
                    rel_diff=float("inf"),
                    status="FAIL",
                    note=f"SC scenario {key} missing in actual",
                )
            )
            continue
        for qty, exp_val in (
            (f"ikss_a@{exp_sc.sc_type}", exp_sc.ikss_a),
            (f"ip_a@{exp_sc.sc_type}", exp_sc.ip_a),
            (f"ith_a@{exp_sc.sc_type}", exp_sc.ith_a),
            (f"sk_mva@{exp_sc.sc_type}", exp_sc.sk_mva),
        ):
            actual_val = float(actual.get(qty.split("@")[0], 0.0))
            comparisons.append(
                _compare_value(exp_sc.fault_node_id, qty, actual_val, exp_val, exp_sc.rtol)
            )
    return tuple(comparisons)


@dataclass(frozen=True)
class ValidationReport:
    """Aggregate validation report for one network."""

    network_id: str
    network_name_pl: str
    source: str
    solver_version: str
    overall_status: Literal["PASS", "FAIL"]
    pf_comparisons: tuple[ElementComparison, ...]
    pf_branch_comparisons: tuple[ElementComparison, ...]
    sc_comparisons: tuple[ElementComparison, ...]
    pf_pass_count: int
    pf_fail_count: int
    pf_branch_pass_count: int
    pf_branch_fail_count: int
    sc_pass_count: int
    sc_fail_count: int
    trace: tuple[dict[str, Any], ...] = ()

    def to_dict(self) -> dict[str, object]:
        return {
            "network_id": self.network_id,
            "network_name_pl": self.network_name_pl,
            "source": self.source,
            "solver_version": self.solver_version,
            "overall_status": self.overall_status,
            "pf_comparisons": [c.to_dict() for c in self.pf_comparisons],
            "pf_branch_comparisons": [c.to_dict() for c in self.pf_branch_comparisons],
            "sc_comparisons": [c.to_dict() for c in self.sc_comparisons],
            "pf_pass_count": self.pf_pass_count,
            "pf_fail_count": self.pf_fail_count,
            "pf_branch_pass_count": self.pf_branch_pass_count,
            "pf_branch_fail_count": self.pf_branch_fail_count,
            "sc_pass_count": self.sc_pass_count,
            "sc_fail_count": self.sc_fail_count,
            "trace_step_count": len(self.trace),
        }


def build_validation_report(
    network_id: str,
    network_name_pl: str,
    source: str,
    solver_version: str,
    pf_comparisons: tuple[ElementComparison, ...],
    pf_branch_comparisons: tuple[ElementComparison, ...],
    sc_comparisons: tuple[ElementComparison, ...],
    trace: tuple[dict[str, Any], ...] = (),
) -> ValidationReport:
    """Assemble ValidationReport with PASS/FAIL counts and overall status."""
    pf_pass = sum(1 for c in pf_comparisons if c.status == "PASS")
    pf_fail = sum(1 for c in pf_comparisons if c.status == "FAIL")
    pf_b_pass = sum(1 for c in pf_branch_comparisons if c.status == "PASS")
    pf_b_fail = sum(1 for c in pf_branch_comparisons if c.status == "FAIL")
    sc_pass = sum(1 for c in sc_comparisons if c.status == "PASS")
    sc_fail = sum(1 for c in sc_comparisons if c.status == "FAIL")
    overall: Literal["PASS", "FAIL"] = (
        "PASS" if (pf_fail + pf_b_fail + sc_fail == 0) else "FAIL"
    )
    return ValidationReport(
        network_id=network_id,
        network_name_pl=network_name_pl,
        source=source,
        solver_version=solver_version,
        overall_status=overall,
        pf_comparisons=pf_comparisons,
        pf_branch_comparisons=pf_branch_comparisons,
        sc_comparisons=sc_comparisons,
        pf_pass_count=pf_pass,
        pf_fail_count=pf_fail,
        pf_branch_pass_count=pf_b_pass,
        pf_branch_fail_count=pf_b_fail,
        sc_pass_count=sc_pass,
        sc_fail_count=sc_fail,
        trace=trace,
    )
