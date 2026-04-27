from application.stability.dynamic_stability import (
    FaultClearScenario,
    FaultClearSourceState,
    evaluate_fault_clear_dynamic_stability,
)


def test_fault_clear_stability_reportable() -> None:
    scenario = FaultClearScenario(
        scenario_id="dyn-reference",
        faulted_element_id="bay-05",
        clearing_time_ms=90.0,
        cleared_by_element_ids=("breaker-05",),
        source_state=FaultClearSourceState(
            source_id="pv-01",
            pre_fault_angle_deg=8.0,
            during_fault_angle_deg=48.0,
            post_fault_angle_deg=18.0,
            post_fault_voltage_pu=0.98,
            post_fault_frequency_pu=0.995,
        ),
    )

    result = evaluate_fault_clear_dynamic_stability(scenario).to_dict()

    assert result["stable"] is True
    assert result["status"] == "STABLE"
    assert result["limiting_factor"] in {"clearing_time", "angle_swing", "voltage_recovery", "frequency_recovery"}
    assert result["violated_checks"] == []
    assert result["stability_index"] > 0.0


def test_fault_clear_stability_detects_instability() -> None:
    scenario = FaultClearScenario(
        scenario_id="dyn-unstable",
        faulted_element_id="bay-05",
        clearing_time_ms=220.0,
        cleared_by_element_ids=("breaker-05",),
        source_state=FaultClearSourceState(
            source_id="fw-01",
            pre_fault_angle_deg=5.0,
            during_fault_angle_deg=150.0,
            post_fault_angle_deg=140.0,
            post_fault_voltage_pu=0.82,
            post_fault_frequency_pu=0.95,
        ),
    )

    result = evaluate_fault_clear_dynamic_stability(scenario).to_dict()

    assert result["stable"] is False
    assert result["status"] == "UNSTABLE"
    assert "clearing_time" in result["violated_checks"]
    assert "angle_swing" in result["violated_checks"]
