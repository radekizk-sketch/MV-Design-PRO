"""
Tests for P0.9 V12K simplified SC source integration in solver_input.

Verifies that StudyCaseConfig.sc_input_mode='simplified' is propagated to
ShortCircuitPayload.simplified_grid_source when building solver-input.

Coverage:
- 'advanced' mode (or simplified without S″k) → no simplified_grid_source emitted
- 'simplified' + S″k value → simplified_grid_source populated with r_x_ratio
- Round-trip serialization (model_dump → ShortCircuitPayload reconstruct)
- SimplifiedGridSource validation (positive sk_mva)
"""

import pytest
from domain.study_case import StudyCaseConfig
from network_model.catalog.repository import CatalogRepository
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType
from solver_input.builder import build_solver_input
from solver_input.contracts import (
    ShortCircuitPayload,
    SimplifiedGridSource,
    SolverAnalysisType,
)


def _make_minimal_graph() -> NetworkGraph:
    g = NetworkGraph()
    g.add_node(
        Node(
            id="slack",
            name="Slack",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="load",
            name="Load",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    g.add_branch(
        LineBranch(
            id="line_1",
            name="Line 1",
            branch_type=BranchType.LINE,
            from_node_id="slack",
            to_node_id="load",
            r_ohm_per_km=0.420,
            x_ohm_per_km=0.377,
            b_us_per_km=2.84,
            length_km=2.0,
            rated_current_a=210.0,
            type_ref="lt-afl70",
        )
    )
    # SI-100 needs a BREAKER for Protection eligibility, but for SC it's optional
    g.add_switch(
        Switch(
            id="cb_main",
            name="Q01",
            switch_type=SwitchType.BREAKER,
            from_node_id="slack",
            to_node_id="load",
            state=SwitchState.CLOSED,
        )
    )
    return g


def _make_catalog() -> CatalogRepository:
    return CatalogRepository.from_records(
        line_types=[
            {
                "id": "lt-afl70",
                "name": "AFL-6 70mm2",
                "params": {
                    "r_ohm_per_km": 0.420,
                    "x_ohm_per_km": 0.377,
                    "b_us_per_km": 2.84,
                    "rated_current_a": 210.0,
                },
            }
        ],
        cable_types=[],
        transformer_types=[],
    )


class TestSimplifiedGridSourceContract:
    """SimplifiedGridSource Pydantic contract validation."""

    def test_default_r_x_ratio(self) -> None:
        src = SimplifiedGridSource(sk_mva=250.0)
        assert src.r_x_ratio == 0.1

    def test_explicit_r_x_ratio(self) -> None:
        src = SimplifiedGridSource(sk_mva=250.0, r_x_ratio=0.05)
        assert src.r_x_ratio == 0.05

    def test_sk_mva_must_be_positive(self) -> None:
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            SimplifiedGridSource(sk_mva=0.0)
        with pytest.raises(ValidationError):
            SimplifiedGridSource(sk_mva=-10.0)

    def test_r_x_ratio_must_be_non_negative(self) -> None:
        from pydantic import ValidationError

        # r_x_ratio = 0.0 allowed (pure reactance, theoretical)
        src = SimplifiedGridSource(sk_mva=100.0, r_x_ratio=0.0)
        assert src.r_x_ratio == 0.0
        with pytest.raises(ValidationError):
            SimplifiedGridSource(sk_mva=100.0, r_x_ratio=-0.1)

    def test_frozen_immutable(self) -> None:
        src = SimplifiedGridSource(sk_mva=250.0)
        with pytest.raises(Exception):
            src.sk_mva = 500.0  # type: ignore[misc]


class TestBuilderSimplifiedIntegration:
    """builder.py → ShortCircuitPayload.simplified_grid_source propagation."""

    def test_advanced_mode_no_simplified_source(self) -> None:
        """sc_input_mode='advanced' → simplified_grid_source MUST be None."""
        graph = _make_minimal_graph()
        catalog = _make_catalog()
        cfg = StudyCaseConfig(sc_input_mode="advanced")

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-1",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            config=cfg,
        )
        payload = env.payload
        assert payload["simplified_grid_source"] is None

    def test_simplified_mode_without_sk_no_source(self) -> None:
        """sc_input_mode='simplified' but sk_mva=None → no source emitted.

        Projektant musi explicit podać S″k; bez tego payload pozostaje "advanced
        equivalent" — solver fallback do pełnego modelu z buses/branches.
        """
        graph = _make_minimal_graph()
        catalog = _make_catalog()
        cfg = StudyCaseConfig(sc_input_mode="simplified", sc_simplified_sk_mva=None)

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-1",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            config=cfg,
        )
        assert env.payload["simplified_grid_source"] is None

    def test_simplified_mode_with_sk_emits_source(self) -> None:
        """sc_input_mode='simplified' + sk_mva=250 → SimplifiedGridSource populated."""
        graph = _make_minimal_graph()
        catalog = _make_catalog()
        cfg = StudyCaseConfig(
            sc_input_mode="simplified",
            sc_simplified_sk_mva=250.0,
            sc_simplified_r_x_ratio=0.08,
        )

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-1",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            config=cfg,
        )
        source = env.payload["simplified_grid_source"]
        assert source is not None
        assert source["sk_mva"] == 250.0
        assert source["r_x_ratio"] == 0.08

    def test_simplified_mode_uses_default_rx_when_not_set(self) -> None:
        """Default sc_simplified_r_x_ratio = 0.1 propaguje do payload."""
        graph = _make_minimal_graph()
        catalog = _make_catalog()
        cfg = StudyCaseConfig(
            sc_input_mode="simplified",
            sc_simplified_sk_mva=400.0,
            # sc_simplified_r_x_ratio NOT set → default 0.1
        )

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-1",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            config=cfg,
        )
        source = env.payload["simplified_grid_source"]
        assert source is not None
        assert source["sk_mva"] == 400.0
        assert source["r_x_ratio"] == 0.1

    def test_payload_serialization_round_trip(self) -> None:
        """ShortCircuitPayload with simplified source survives JSON round-trip."""
        graph = _make_minimal_graph()
        catalog = _make_catalog()
        cfg = StudyCaseConfig(
            sc_input_mode="simplified",
            sc_simplified_sk_mva=300.0,
            sc_simplified_r_x_ratio=0.12,
        )

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-1",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            config=cfg,
        )
        # Reconstruct payload from JSON dict
        payload = ShortCircuitPayload(**env.payload)
        assert payload.simplified_grid_source is not None
        assert payload.simplified_grid_source.sk_mva == 300.0
        assert payload.simplified_grid_source.r_x_ratio == 0.12

    def test_load_flow_payload_unaffected(self) -> None:
        """LOAD_FLOW analysis must NOT carry simplified_grid_source field."""
        graph = _make_minimal_graph()
        catalog = _make_catalog()
        cfg = StudyCaseConfig(
            sc_input_mode="simplified",
            sc_simplified_sk_mva=250.0,
        )

        env = build_solver_input(
            graph=graph,
            catalog=catalog,
            case_id="case-1",
            enm_revision="rev-1",
            analysis_type=SolverAnalysisType.LOAD_FLOW,
            config=cfg,
        )
        # LoadFlowPayload doesn't have simplified_grid_source — key absent
        assert "simplified_grid_source" not in env.payload
