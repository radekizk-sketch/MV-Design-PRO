from __future__ import annotations

from application.power_flow_input_builder import build_power_flow_input
from network_model.core.graph import NetworkGraph
from network_model.solvers.power_flow_types import PowerFlowOptions, PQSpec, SlackSpec


def test_build_power_flow_input_coerces_dict_specs() -> None:
    result = build_power_flow_input(
        graph=NetworkGraph(),
        base_mva=110.0,
        slack={"node_id": "slack-1", "u_pu": 1.01, "angle_rad": 0.02},
        pq=[{"node_id": "load-1", "p_mw": 2.5, "q_mvar": 0.8}],
        pv=[
            {
                "node_id": "gen-1",
                "p_mw": 1.2,
                "u_pu": 1.0,
                "q_min_mvar": -0.5,
                "q_max_mvar": 0.5,
            }
        ],
        options={"tolerance": 1e-7, "max_iter": 15, "trace_level": "full"},
    )

    assert result.base_mva == 110.0
    assert result.slack.node_id == "slack-1"
    assert result.slack.u_pu == 1.01
    assert result.pq[0].node_id == "load-1"
    assert result.pq[0].p_mw == 2.5
    assert result.pv[0].node_id == "gen-1"
    assert result.options.max_iter == 15
    assert result.options.trace_level == "full"


def test_build_power_flow_input_preserves_typed_specs() -> None:
    slack = SlackSpec(node_id="slack-typed", u_pu=1.0, angle_rad=0.0)
    pq = [PQSpec(node_id="load-typed", p_mw=3.0, q_mvar=1.0)]
    options = PowerFlowOptions(tolerance=1e-9, max_iter=22, trace_level="summary")

    result = build_power_flow_input(
        graph=NetworkGraph(),
        base_mva=100.0,
        slack=slack,
        pq=pq,
        options=options,
    )

    assert result.slack is slack
    assert result.pq[0] is pq[0]
    assert result.options is options
