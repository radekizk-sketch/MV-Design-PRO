from __future__ import annotations

from application.automation.trace import (
    build_automation_trace,
    build_post_fault_topology_effect,
)
from application.stability.dynamic_stability import (
    FaultClearScenario,
    FaultClearSourceState,
    evaluate_fault_clear_dynamic_stability,
)


def _evaluation():
    scenario = FaultClearScenario(
        scenario_id="trace-001",
        faulted_element_id="line-11",
        clearing_time_ms=110.0,
        cleared_by_element_ids=("cb-2", "cb-1"),
        source_state=FaultClearSourceState(
            source_id="src-1",
            pre_fault_angle_deg=8.0,
            during_fault_angle_deg=55.0,
            post_fault_angle_deg=16.0,
            post_fault_voltage_pu=0.99,
            post_fault_frequency_pu=0.995,
        ),
    )
    return evaluate_fault_clear_dynamic_stability(scenario)


def test_post_fault_topology_effect_is_canonical_and_deterministic() -> None:
    effect_a = build_post_fault_topology_effect(
        source_id="src-1",
        faulted_element_id="line-11",
        cleared_by_element_ids=["cb-2", "cb-1", "cb-1"],
        isolated_element_ids=["bus-7", "load-2", "load-2"],
        additionally_opened_element_ids=["sw-5"],
        disconnected_source_ids=["src-backup"],
    )
    effect_b = build_post_fault_topology_effect(
        source_id="src-1",
        faulted_element_id="line-11",
        cleared_by_element_ids=["cb-1", "cb-2"],
        isolated_element_ids=["load-2", "bus-7"],
        additionally_opened_element_ids=["sw-5"],
        disconnected_source_ids=["src-backup"],
    )

    assert effect_a.to_dict() == effect_b.to_dict()
    assert effect_a.opened_element_ids == ("cb-1", "cb-2", "sw-5")
    assert effect_a.isolated_element_ids == ("bus-7", "load-2")
    assert effect_a.disconnected_source_ids == ("src-backup",)
    assert effect_a.network_state == "ISLANDED"
    assert effect_a.outage_scope == "WIDE"


def test_build_automation_trace_emits_expected_sequence() -> None:
    evaluation = _evaluation()
    topology_effect = build_post_fault_topology_effect(
        source_id=evaluation.source_id,
        faulted_element_id=evaluation.faulted_element_id,
        cleared_by_element_ids=evaluation.cleared_by_element_ids,
        isolated_element_ids=("load-9",),
    )

    trace = build_automation_trace(evaluation, topology_effect)

    assert [event.event_seq for event in trace.events] == [1, 2, 3, 4, 5]
    assert [event.event_type for event in trace.events] == [
        "AUTOMATION_STARTED",
        "FAULT_APPLIED",
        "FAULT_CLEARED",
        "POST_FAULT_TOPOLOGY_EFFECT",
        "DYNAMIC_STABILITY_EVALUATED",
    ]
    assert trace.events[2].payload["cleared_by_element_ids"] == ["cb-1", "cb-2"]
    assert trace.events[3].payload["effect_signature"] == topology_effect.effect_signature
    assert trace.events[4].payload["status"] == "STABLE"
    assert trace.events[4].payload["source_id"] == "src-1"


def test_build_automation_trace_is_deterministic() -> None:
    evaluation = _evaluation()
    topology_effect = build_post_fault_topology_effect(
        source_id=evaluation.source_id,
        faulted_element_id=evaluation.faulted_element_id,
        cleared_by_element_ids=evaluation.cleared_by_element_ids,
        isolated_element_ids=("load-9",),
    )

    first = build_automation_trace(evaluation, topology_effect).to_dict()
    second = build_automation_trace(evaluation, topology_effect).to_dict()

    assert first == second
