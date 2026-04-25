from __future__ import annotations

import pytest

from application.stability.dynamic_stability import (
    FaultClearScenario,
    FaultClearSourceState,
    evaluate_fault_clear_dynamic_stability,
)


def _stable_scenario() -> FaultClearScenario:
    return FaultClearScenario(
        scenario_id="dyn-001",
        faulted_element_id="line-01",
        clearing_time_ms=120.0,
        cleared_by_element_ids=("cb-b", "cb-a", "cb-a"),
        source_state=FaultClearSourceState(
            source_id="src-main",
            pre_fault_angle_deg=10.0,
            during_fault_angle_deg=75.0,
            post_fault_angle_deg=28.0,
            post_fault_voltage_pu=0.97,
            post_fault_frequency_pu=0.99,
        ),
    )


def test_fault_clear_evaluator_returns_stable_result() -> None:
    result = evaluate_fault_clear_dynamic_stability(_stable_scenario())

    assert result.stable is True
    assert result.status == "STABLE"
    assert result.cleared_by_element_ids == ("cb-a", "cb-b")
    assert result.angle_swing_deg == 65.0
    assert result.clearing_margin_ms == 30.0
    assert result.limiting_factor == "clearing_time"
    assert result.violated_checks == ()
    assert result.stability_index == pytest.approx(0.664583)


def test_fault_clear_evaluator_flags_all_failed_checks_deterministically() -> None:
    scenario = FaultClearScenario(
        scenario_id="dyn-002",
        faulted_element_id="line-02",
        clearing_time_ms=190.0,
        cleared_by_element_ids=("cb-z",),
        source_state=FaultClearSourceState(
            source_id="src-main",
            pre_fault_angle_deg=5.0,
            during_fault_angle_deg=165.0,
            post_fault_angle_deg=150.0,
            post_fault_voltage_pu=0.90,
            post_fault_frequency_pu=0.97,
        ),
    )

    result = evaluate_fault_clear_dynamic_stability(scenario)

    assert result.stable is False
    assert result.status == "UNSTABLE"
    assert result.limiting_factor == "angle_swing"
    assert result.violated_checks == (
        "clearing_time",
        "angle_swing",
        "voltage_recovery",
        "frequency_recovery",
    )
    assert result.checks == {
        "clearing_time": False,
        "angle_swing": False,
        "voltage_recovery": False,
        "frequency_recovery": False,
    }


def test_fault_clear_evaluator_is_deterministic() -> None:
    scenario = _stable_scenario()

    first = evaluate_fault_clear_dynamic_stability(scenario).to_dict()
    second = evaluate_fault_clear_dynamic_stability(scenario).to_dict()

    assert first == second


def test_fault_clear_requires_clearing_path() -> None:
    with pytest.raises(ValueError, match="cleared_by_element_ids"):
        FaultClearScenario(
            scenario_id="dyn-003",
            faulted_element_id="line-03",
            clearing_time_ms=100.0,
            cleared_by_element_ids=(),
            source_state=FaultClearSourceState(
                source_id="src-main",
                pre_fault_angle_deg=0.0,
                during_fault_angle_deg=10.0,
                post_fault_angle_deg=5.0,
                post_fault_voltage_pu=1.0,
                post_fault_frequency_pu=1.0,
            ),
        )
