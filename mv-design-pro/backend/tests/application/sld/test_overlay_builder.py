"""
Tests for SLD overlay builder.

Verifies that build_sld_overlay() correctly maps PowerFlowResult
and EnergyValidationView data onto NetworkGraph elements for
SLD overlay rendering.

APPLICATION LAYER test — no physics, only data mapping verification.
"""

from __future__ import annotations

import math

import pytest
from analysis.energy_validation.models import (
    EnergyCheckType,
    EnergyValidationConfig,
    EnergyValidationItem,
    EnergyValidationStatus,
    EnergyValidationSummary,
    EnergyValidationView,
)
from analysis.power_flow.result import PowerFlowResult
from application.sld.overlay_builder import (
    SldOverlayData,
    build_sld_overlay,
)
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType

# =============================================================================
# Test Fixtures
# =============================================================================


def _make_graph() -> NetworkGraph:
    """Build a minimal 3-bus network: slack -> line -> bus2, slack -> trafo -> bus3."""
    g = NetworkGraph()

    g.add_node(
        Node(
            id="bus1",
            name="GPZ 15kV",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="bus2",
            name="Szyna SN A",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=-2.0,
            reactive_power=-0.5,
        )
    )
    g.add_node(
        Node(
            id="bus3",
            name="Szyna nN",
            node_type=NodeType.PQ,
            voltage_level=0.4,
            active_power=-0.1,
            reactive_power=-0.02,
        )
    )

    line = LineBranch(
        id="line1",
        name="Linia A1",
        branch_type=BranchType.LINE,
        from_node_id="bus1",
        to_node_id="bus2",
        r_ohm_per_km=0.42,
        x_ohm_per_km=0.38,
        b_us_per_km=2.84,
        length_km=5.0,
        rated_current_a=210.0,
    )
    g.add_branch(line)

    trafo = TransformerBranch(
        id="trafo1",
        name="TR1 15/0.4",
        branch_type=BranchType.TRANSFORMER,
        from_node_id="bus1",
        to_node_id="bus3",
        rated_power_mva=0.63,
        voltage_hv_kv=15.0,
        voltage_lv_kv=0.4,
        uk_percent=4.0,
        pk_kw=6.0,
    )
    g.add_branch(trafo)

    return g


def _make_pf_result() -> PowerFlowResult:
    """Build synthetic power flow result for the 3-bus network."""
    return PowerFlowResult(
        converged=True,
        iterations=4,
        tolerance=1e-6,
        max_mismatch_pu=1e-8,
        base_mva=100.0,
        slack_node_id="bus1",
        node_u_mag_pu={"bus1": 1.0, "bus2": 0.97, "bus3": 0.96},
        node_voltage_kv={"bus1": 15.0, "bus2": 14.55, "bus3": 0.384},
        node_angle_rad={"bus1": 0.0, "bus2": -0.02, "bus3": -0.03},
        branch_current_ka={"line1": 0.080, "trafo1": 0.015},
        branch_s_from_mva={
            "line1": complex(2.05, 0.55),
            "trafo1": complex(0.105, 0.025),
        },
        branch_s_to_mva={
            "line1": complex(-2.0, -0.5),
            "trafo1": complex(-0.1, -0.02),
        },
        losses_total_pu=complex(0.0005, 0.0003),
        slack_power_pu=complex(0.02, 0.005),
    )


def _make_ev_view_pass() -> EnergyValidationView:
    """EV view where all checks pass."""
    items = (
        EnergyValidationItem(
            check_type=EnergyCheckType.VOLTAGE_DEVIATION,
            target_id="bus1",
            target_name="GPZ 15kV",
            observed_value=0.0,
            unit="%",
            limit_warn=5.0,
            limit_fail=10.0,
            margin_pct=-10.0,
            status=EnergyValidationStatus.PASS,
            why_pl="Odchylenie napieciowe 0.00 % ponizej limitu 5.0 %.",
        ),
        EnergyValidationItem(
            check_type=EnergyCheckType.VOLTAGE_DEVIATION,
            target_id="bus2",
            target_name="Szyna SN A",
            observed_value=3.0,
            unit="%",
            limit_warn=5.0,
            limit_fail=10.0,
            margin_pct=-7.0,
            status=EnergyValidationStatus.PASS,
            why_pl="Odchylenie napieciowe 3.00 % ponizej limitu 5.0 %.",
        ),
        EnergyValidationItem(
            check_type=EnergyCheckType.BRANCH_LOADING,
            target_id="line1",
            target_name="Linia A1",
            observed_value=38.1,
            unit="%",
            limit_warn=80.0,
            limit_fail=100.0,
            margin_pct=-61.9,
            status=EnergyValidationStatus.PASS,
            why_pl="Obciazenie 38.10 % ponizej limitu 80.0 %.",
        ),
    )
    return EnergyValidationView(
        context=None,
        config=EnergyValidationConfig(),
        items=items,
        summary=EnergyValidationSummary(
            pass_count=3,
            warning_count=0,
            fail_count=0,
            not_computed_count=0,
            worst_item_target_id=None,
            worst_item_margin_pct=None,
        ),
    )


def _make_ev_view_mixed() -> EnergyValidationView:
    """EV view with WARNING on bus2 and FAIL on line1."""
    items = (
        EnergyValidationItem(
            check_type=EnergyCheckType.VOLTAGE_DEVIATION,
            target_id="bus1",
            target_name="GPZ 15kV",
            observed_value=0.0,
            unit="%",
            limit_warn=5.0,
            limit_fail=10.0,
            margin_pct=-10.0,
            status=EnergyValidationStatus.PASS,
            why_pl="OK.",
        ),
        EnergyValidationItem(
            check_type=EnergyCheckType.VOLTAGE_DEVIATION,
            target_id="bus2",
            target_name="Szyna SN A",
            observed_value=7.5,
            unit="%",
            limit_warn=5.0,
            limit_fail=10.0,
            margin_pct=-2.5,
            status=EnergyValidationStatus.WARNING,
            why_pl="Ostrzezenie.",
        ),
        EnergyValidationItem(
            check_type=EnergyCheckType.BRANCH_LOADING,
            target_id="line1",
            target_name="Linia A1",
            observed_value=105.0,
            unit="%",
            limit_warn=80.0,
            limit_fail=100.0,
            margin_pct=5.0,
            status=EnergyValidationStatus.FAIL,
            why_pl="Przeciazenie.",
        ),
    )
    return EnergyValidationView(
        context=None,
        config=EnergyValidationConfig(),
        items=items,
        summary=EnergyValidationSummary(
            pass_count=1,
            warning_count=1,
            fail_count=1,
            not_computed_count=0,
            worst_item_target_id="line1",
            worst_item_margin_pct=5.0,
        ),
    )


# =============================================================================
# Tests: build_sld_overlay
# =============================================================================


class TestBuildSldOverlay:
    """Tests for build_sld_overlay function."""

    def test_basic_structure(self) -> None:
        """Overlay has correct run_id, result_status, and element counts."""
        graph = _make_graph()
        pf = _make_pf_result()

        overlay = build_sld_overlay(
            run_id="run-001",
            graph=graph,
            pf_result=pf,
            result_status="FRESH",
        )

        assert isinstance(overlay, SldOverlayData)
        assert overlay.run_id == "run-001"
        assert overlay.result_status == "FRESH"
        assert len(overlay.nodes) == 3
        assert len(overlay.branches) == 2

    def test_node_voltages_mapped(self) -> None:
        """Node overlay contains voltage values from PF result."""
        graph = _make_graph()
        pf = _make_pf_result()

        overlay = build_sld_overlay(run_id="r1", graph=graph, pf_result=pf)

        node_map = {n.node_id: n for n in overlay.nodes}
        assert node_map["bus1"].u_pu == 1.0
        assert node_map["bus1"].u_kv == 15.0
        assert node_map["bus2"].u_pu == 0.97
        assert node_map["bus2"].u_kv == 14.55

    def test_node_angles_converted_to_degrees(self) -> None:
        """Node angles are converted from radians to degrees."""
        graph = _make_graph()
        pf = _make_pf_result()

        overlay = build_sld_overlay(run_id="r1", graph=graph, pf_result=pf)

        node_map = {n.node_id: n for n in overlay.nodes}
        assert node_map["bus1"].angle_deg == pytest.approx(0.0)
        assert node_map["bus2"].angle_deg == pytest.approx(math.degrees(-0.02))

    def test_branch_current_converted_to_amps(self) -> None:
        """Branch current is converted from kA to A."""
        graph = _make_graph()
        pf = _make_pf_result()

        overlay = build_sld_overlay(run_id="r1", graph=graph, pf_result=pf)

        branch_map = {b.branch_id: b for b in overlay.branches}
        assert branch_map["line1"].i_a == pytest.approx(80.0)
        assert branch_map["trafo1"].i_a == pytest.approx(15.0)

    def test_branch_power_from_s_from_mva(self) -> None:
        """Branch P and Q come from S_from_mva (real/imag)."""
        graph = _make_graph()
        pf = _make_pf_result()

        overlay = build_sld_overlay(run_id="r1", graph=graph, pf_result=pf)

        branch_map = {b.branch_id: b for b in overlay.branches}
        assert branch_map["line1"].p_mw == pytest.approx(2.05)
        assert branch_map["line1"].q_mvar == pytest.approx(0.55)

    def test_line_loading_calculated(self) -> None:
        """Line loading_pct = (I_ka / I_rated_ka) * 100."""
        graph = _make_graph()
        pf = _make_pf_result()

        overlay = build_sld_overlay(run_id="r1", graph=graph, pf_result=pf)

        branch_map = {b.branch_id: b for b in overlay.branches}
        expected = (0.080 / (210.0 / 1000.0)) * 100.0
        assert branch_map["line1"].loading_pct == pytest.approx(expected)

    def test_transformer_loading_calculated(self) -> None:
        """Transformer loading = max(|S_from|, |S_to|) / S_rated * 100."""
        graph = _make_graph()
        pf = _make_pf_result()

        overlay = build_sld_overlay(run_id="r1", graph=graph, pf_result=pf)

        branch_map = {b.branch_id: b for b in overlay.branches}
        s_from = abs(complex(0.105, 0.025))
        s_to = abs(complex(-0.1, -0.02))
        expected = (max(s_from, s_to) / 0.63) * 100.0
        assert branch_map["trafo1"].loading_pct == pytest.approx(expected)

    def test_no_pf_result_yields_none_values(self) -> None:
        """Without PF result, all numeric fields are None."""
        graph = _make_graph()

        overlay = build_sld_overlay(run_id="r1", graph=graph, pf_result=None)

        for node in overlay.nodes:
            assert node.u_pu is None
            assert node.u_kv is None
            assert node.angle_deg is None

        for branch in overlay.branches:
            assert branch.i_a is None
            assert branch.loading_pct is None
            assert branch.p_mw is None

    def test_out_of_service_branches_excluded(self) -> None:
        """Branches with in_service=False are not in overlay."""
        graph = _make_graph()
        graph.branches["line1"].in_service = False

        overlay = build_sld_overlay(run_id="r1", graph=graph)

        branch_ids = {b.branch_id for b in overlay.branches}
        assert "line1" not in branch_ids
        assert "trafo1" in branch_ids

    def test_nodes_sorted_deterministically(self) -> None:
        """Nodes are sorted by node_id for deterministic output."""
        graph = _make_graph()

        overlay = build_sld_overlay(run_id="r1", graph=graph)

        node_ids = [n.node_id for n in overlay.nodes]
        assert node_ids == sorted(node_ids)

    def test_branches_sorted_deterministically(self) -> None:
        """Branches are sorted by branch_id for deterministic output."""
        graph = _make_graph()

        overlay = build_sld_overlay(run_id="r1", graph=graph)

        branch_ids = [b.branch_id for b in overlay.branches]
        assert branch_ids == sorted(branch_ids)


class TestVoltageDeviationStatus:
    """Tests for voltage_status classification in overlay."""

    def test_pass_within_5_percent(self) -> None:
        """Voltage within 5% of nominal → PASS."""
        graph = _make_graph()
        pf = _make_pf_result()
        pf.node_voltage_kv["bus2"] = 14.5  # delta = 3.3%

        overlay = build_sld_overlay(run_id="r1", graph=graph, pf_result=pf)

        node_map = {n.node_id: n for n in overlay.nodes}
        assert node_map["bus2"].voltage_status == "PASS"

    def test_warning_between_5_and_10_percent(self) -> None:
        """Voltage deviation 5-10% → WARNING."""
        graph = _make_graph()
        pf = _make_pf_result()
        pf.node_voltage_kv["bus2"] = 13.8  # delta = 8%

        overlay = build_sld_overlay(run_id="r1", graph=graph, pf_result=pf)

        node_map = {n.node_id: n for n in overlay.nodes}
        assert node_map["bus2"].voltage_status == "WARNING"

    def test_fail_above_10_percent(self) -> None:
        """Voltage deviation > 10% → FAIL."""
        graph = _make_graph()
        pf = _make_pf_result()
        pf.node_voltage_kv["bus2"] = 13.0  # delta = 13.3%

        overlay = build_sld_overlay(run_id="r1", graph=graph, pf_result=pf)

        node_map = {n.node_id: n for n in overlay.nodes}
        assert node_map["bus2"].voltage_status == "FAIL"

    def test_none_when_no_pf(self) -> None:
        """Without PF result, voltage_status is None."""
        graph = _make_graph()

        overlay = build_sld_overlay(run_id="r1", graph=graph, pf_result=None)

        for node in overlay.nodes:
            assert node.voltage_status is None


class TestEvStatusMapping:
    """Tests for energy validation status mapping in overlay."""

    def test_ev_node_status_pass(self) -> None:
        """EV PASS nodes get ev_status='PASS'."""
        graph = _make_graph()
        pf = _make_pf_result()
        ev = _make_ev_view_pass()

        overlay = build_sld_overlay(
            run_id="r1",
            graph=graph,
            pf_result=pf,
            ev_view=ev,
        )

        node_map = {n.node_id: n for n in overlay.nodes}
        assert node_map["bus1"].ev_status == "PASS"
        assert node_map["bus2"].ev_status == "PASS"

    def test_ev_node_status_warning(self) -> None:
        """EV WARNING node gets ev_status='WARNING'."""
        graph = _make_graph()
        pf = _make_pf_result()
        ev = _make_ev_view_mixed()

        overlay = build_sld_overlay(
            run_id="r1",
            graph=graph,
            pf_result=pf,
            ev_view=ev,
        )

        node_map = {n.node_id: n for n in overlay.nodes}
        assert node_map["bus2"].ev_status == "WARNING"

    def test_ev_branch_status_fail(self) -> None:
        """EV FAIL branch gets ev_status='FAIL'."""
        graph = _make_graph()
        pf = _make_pf_result()
        ev = _make_ev_view_mixed()

        overlay = build_sld_overlay(
            run_id="r1",
            graph=graph,
            pf_result=pf,
            ev_view=ev,
        )

        branch_map = {b.branch_id: b for b in overlay.branches}
        assert branch_map["line1"].ev_status == "FAIL"

    def test_no_ev_view_yields_none_status(self) -> None:
        """Without EV view, ev_status is None for all elements."""
        graph = _make_graph()
        pf = _make_pf_result()

        overlay = build_sld_overlay(
            run_id="r1",
            graph=graph,
            pf_result=pf,
            ev_view=None,
        )

        for node in overlay.nodes:
            assert node.ev_status is None
        for branch in overlay.branches:
            assert branch.ev_status is None

    def test_node_without_ev_item_has_none(self) -> None:
        """Node not covered by EV items gets ev_status=None."""
        graph = _make_graph()
        pf = _make_pf_result()
        ev = _make_ev_view_pass()

        overlay = build_sld_overlay(
            run_id="r1",
            graph=graph,
            pf_result=pf,
            ev_view=ev,
        )

        node_map = {n.node_id: n for n in overlay.nodes}
        # bus3 (0.4 kV) has no voltage_deviation item in the pass view
        assert node_map["bus3"].ev_status is None


class TestOverallEvStatus:
    """Tests for overall energy validation status in overlay."""

    def test_all_pass(self) -> None:
        """All pass → overall_ev_status='PASS'."""
        graph = _make_graph()
        ev = _make_ev_view_pass()

        overlay = build_sld_overlay(
            run_id="r1",
            graph=graph,
            ev_view=ev,
        )

        assert overlay.overall_ev_status == "PASS"

    def test_has_fail(self) -> None:
        """Any fail → overall_ev_status='FAIL'."""
        graph = _make_graph()
        ev = _make_ev_view_mixed()

        overlay = build_sld_overlay(
            run_id="r1",
            graph=graph,
            ev_view=ev,
        )

        assert overlay.overall_ev_status == "FAIL"

    def test_no_ev_view(self) -> None:
        """No EV view → overall_ev_status=None."""
        graph = _make_graph()

        overlay = build_sld_overlay(run_id="r1", graph=graph)

        assert overlay.overall_ev_status is None


class TestSerialization:
    """Tests for overlay serialization."""

    def test_to_dict_roundtrip(self) -> None:
        """to_dict() produces valid JSON-serializable structure."""
        graph = _make_graph()
        pf = _make_pf_result()
        ev = _make_ev_view_mixed()

        overlay = build_sld_overlay(
            run_id="r1",
            graph=graph,
            pf_result=pf,
            ev_view=ev,
        )

        d = overlay.to_dict()
        assert d["run_id"] == "r1"
        assert isinstance(d["nodes"], list)
        assert isinstance(d["branches"], list)
        assert len(d["nodes"]) == 3
        assert len(d["branches"]) == 2

    def test_node_dict_has_ev_fields(self) -> None:
        """Node dict includes voltage_status and ev_status."""
        graph = _make_graph()
        pf = _make_pf_result()
        ev = _make_ev_view_mixed()

        overlay = build_sld_overlay(
            run_id="r1",
            graph=graph,
            pf_result=pf,
            ev_view=ev,
        )

        d = overlay.to_dict()
        node_dicts = {n["node_id"]: n for n in d["nodes"]}
        assert "voltage_status" in node_dicts["bus2"]
        assert "ev_status" in node_dicts["bus2"]
        assert node_dicts["bus2"]["ev_status"] == "WARNING"

    def test_branch_dict_has_ev_status(self) -> None:
        """Branch dict includes ev_status."""
        graph = _make_graph()
        pf = _make_pf_result()
        ev = _make_ev_view_mixed()

        overlay = build_sld_overlay(
            run_id="r1",
            graph=graph,
            pf_result=pf,
            ev_view=ev,
        )

        d = overlay.to_dict()
        branch_dicts = {b["branch_id"]: b for b in d["branches"]}
        assert branch_dicts["line1"]["ev_status"] == "FAIL"

    def test_deterministic_output(self) -> None:
        """Same inputs produce identical output dicts."""
        graph = _make_graph()
        pf = _make_pf_result()
        ev = _make_ev_view_pass()

        d1 = build_sld_overlay(run_id="r1", graph=graph, pf_result=pf, ev_view=ev).to_dict()
        d2 = build_sld_overlay(run_id="r1", graph=graph, pf_result=pf, ev_view=ev).to_dict()

        assert d1 == d2
