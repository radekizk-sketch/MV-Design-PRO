from __future__ import annotations

from datetime import datetime

from analysis.normative.models import NormativeConfig
from analysis.power_flow.result import PowerFlowResult
from analysis.voltage_profile.builder import VoltageProfileBuilder
from analysis.voltage_profile.models import VoltageProfileContext, VoltageProfileStatus
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType

RUN_TS = datetime(2024, 2, 1, 10, 0, 0)


def _make_graph() -> NetworkGraph:
    graph = NetworkGraph(network_model_id="model-1")
    graph.add_node(
        Node(
            id="BUS_FAIL",
            name="Bus Fail",
            node_type=NodeType.PQ,
            voltage_level=100.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    graph.add_node(
        Node(
            id="BUS_WARN",
            name="Bus Warn",
            node_type=NodeType.PQ,
            voltage_level=100.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    graph.add_node(
        Node(
            id="BUS_PASS",
            name="Bus Pass",
            node_type=NodeType.PQ,
            voltage_level=100.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    graph.add_node(
        Node(
            id="BUS_MISSING_U",
            name="Bus Missing U",
            node_type=NodeType.PQ,
            voltage_level=100.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    graph.add_node(
        Node(
            id="BUS_NO_NOM",
            name="Bus No Nom",
            node_type=NodeType.PQ,
            voltage_level=0.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    return graph


def _make_pf_result() -> PowerFlowResult:
    return PowerFlowResult(
        converged=True,
        iterations=3,
        tolerance=1e-6,
        max_mismatch_pu=0.0,
        base_mva=100.0,
        slack_node_id="BUS_FAIL",
        node_voltage_pu={},
        node_u_mag_pu={
            "BUS_FAIL": 1.12,
            "BUS_WARN": 1.06,
            "BUS_PASS": 1.02,
        },
        node_angle_rad={},
        node_voltage_kv={
            "BUS_FAIL": 112.0,
            "BUS_WARN": 106.0,
            "BUS_PASS": 102.0,
        },
        branch_current_pu={},
        branch_current_ka={},
        branch_s_from_pu={},
        branch_s_to_pu={},
        branch_s_from_mva={},
        branch_s_to_mva={},
        losses_total_pu=0.0 + 0.0j,
        slack_power_pu=0.0 + 0.0j,
        violations=[],
        pv_to_pq_switches=[],
        white_box_trace={},
    )


def test_voltage_profile_determinism() -> None:
    graph = _make_graph()
    pf_result = _make_pf_result()
    context = VoltageProfileContext(
        project_name="Proj",
        case_name="Case A",
        run_timestamp=RUN_TS,
        snapshot_id="snap-1",
        trace_id="trace-1",
    )
    builder = VoltageProfileBuilder(graph=graph, context=context)
    config = NormativeConfig()

    view_a = builder.build(pf_result, config)
    view_b = builder.build(pf_result, config)

    assert view_a.to_dict() == view_b.to_dict()


def test_voltage_profile_threshold_statuses() -> None:
    graph = _make_graph()
    pf_result = _make_pf_result()
    builder = VoltageProfileBuilder(graph=graph)
    view = builder.build(pf_result, NormativeConfig())

    rows = {row.bus_id: row for row in view.rows}
    assert rows["BUS_FAIL"].status == VoltageProfileStatus.FAIL
    assert rows["BUS_WARN"].status == VoltageProfileStatus.WARNING
    assert rows["BUS_PASS"].status == VoltageProfileStatus.PASS


def test_voltage_profile_sorting() -> None:
    graph = _make_graph()
    pf_result = _make_pf_result()
    builder = VoltageProfileBuilder(graph=graph)
    view = builder.build(pf_result, NormativeConfig())

    ordered_ids = [row.bus_id for row in view.rows]
    assert ordered_ids[:3] == ["BUS_FAIL", "BUS_WARN", "BUS_PASS"]
    assert ordered_ids[-2:] == ["BUS_MISSING_U", "BUS_NO_NOM"]


def test_voltage_profile_not_computed() -> None:
    graph = _make_graph()
    pf_result = _make_pf_result()
    builder = VoltageProfileBuilder(graph=graph)
    view = builder.build(pf_result, NormativeConfig())

    rows = {row.bus_id: row for row in view.rows}
    assert rows["BUS_MISSING_U"].status == VoltageProfileStatus.NOT_COMPUTED
    assert rows["BUS_NO_NOM"].status == VoltageProfileStatus.NOT_COMPUTED
