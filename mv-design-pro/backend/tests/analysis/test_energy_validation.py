"""
Tests for energy validation analysis module.

Validates 5 check types: branch loading, transformer loading,
voltage deviation, loss budget, reactive power balance.

Uses golden network + synthetic PowerFlowResult data.
"""

from __future__ import annotations

import json
from datetime import UTC

import pytest
from analysis.energy_validation.builder import EnergyValidationBuilder
from analysis.energy_validation.models import (
    EnergyCheckType,
    EnergyValidationConfig,
    EnergyValidationContext,
    EnergyValidationStatus,
)
from analysis.power_flow.result import PowerFlowResult
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType

# ============================================================================
# Fixtures & helpers
# ============================================================================


def _mk_pq(nid: str, name: str, vl: float = 15.0) -> Node:
    return Node(
        id=nid,
        name=name,
        node_type=NodeType.PQ,
        voltage_level=vl,
        active_power=0.0,
        reactive_power=0.0,
    )


def _mk_slack(nid: str, name: str, vl: float = 110.0) -> Node:
    return Node(
        id=nid,
        name=name,
        node_type=NodeType.SLACK,
        voltage_level=vl,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
        active_power=0.0,
        reactive_power=0.0,
    )


def _mk_line(lid: str, fn: str, tn: str, rated_i: float = 200.0) -> LineBranch:
    return LineBranch(
        id=lid,
        name=f"Line {lid}",
        branch_type=BranchType.LINE,
        from_node_id=fn,
        to_node_id=tn,
        in_service=True,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.4,
        b_us_per_km=5.0,
        length_km=1.0,
        rated_current_a=rated_i,
    )


def _mk_trafo(tid: str, fn: str, tn: str, sn_mva: float = 25.0) -> TransformerBranch:
    return TransformerBranch(
        id=tid,
        name=f"Trafo {tid}",
        branch_type=BranchType.TRANSFORMER,
        from_node_id=fn,
        to_node_id=tn,
        in_service=True,
        rated_power_mva=sn_mva,
        voltage_hv_kv=110.0,
        voltage_lv_kv=15.0,
        uk_percent=11.0,
        pk_kw=120.0,
        i0_percent=0.35,
        p0_kw=25.0,
        vector_group="Yd11",
        tap_position=0,
        tap_step_percent=2.5,
    )


def _build_simple_graph() -> NetworkGraph:
    """2-bus graph: slack → line → PQ, with transformer branch."""
    g = NetworkGraph()
    g.add_node(_mk_slack("slack", "Slack 110"))
    g.add_node(_mk_pq("bus-a", "Bus A", vl=110.0))
    g.add_node(_mk_pq("bus-b", "Bus B", vl=15.0))
    g.add_branch(_mk_line("line-1", "slack", "bus-a", rated_i=500.0))
    g.add_branch(_mk_trafo("tr-1", "bus-a", "bus-b", sn_mva=25.0))
    return g


def _build_pf_result(
    *,
    node_voltage_kv: dict[str, float] | None = None,
    branch_current_ka: dict[str, float] | None = None,
    branch_s_from_mva: dict[str, complex] | None = None,
    branch_s_to_mva: dict[str, complex] | None = None,
    losses_total_pu: complex = 0.01 + 0.005j,
    slack_power_pu: complex = 1.0 + 0.3j,
    slack_node_id: str = "slack",
) -> PowerFlowResult:
    return PowerFlowResult(
        converged=True,
        iterations=5,
        tolerance=1e-6,
        max_mismatch_pu=1e-7,
        base_mva=100.0,
        slack_node_id=slack_node_id,
        node_voltage_kv=node_voltage_kv or {},
        node_u_mag_pu={},
        node_angle_rad={},
        node_voltage_pu={},
        branch_current_pu={},
        branch_current_ka=branch_current_ka or {},
        branch_s_from_pu={},
        branch_s_to_pu={},
        branch_s_from_mva=branch_s_from_mva or {},
        branch_s_to_mva=branch_s_to_mva or {},
        losses_total_pu=losses_total_pu,
        slack_power_pu=slack_power_pu,
    )


DEFAULT_CONFIG = EnergyValidationConfig()


# ============================================================================
# TestBranchLoading
# ============================================================================


class TestBranchLoading:
    """Branch (line/cable) loading checks."""

    def test_pass_when_below_warn(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            branch_current_ka={"line-1": 0.1},  # 100A of 500A rated → 20%
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        loading_items = [i for i in view.items if i.check_type == EnergyCheckType.BRANCH_LOADING]
        assert len(loading_items) == 1
        assert loading_items[0].status == EnergyValidationStatus.PASS
        assert loading_items[0].observed_value == pytest.approx(20.0)

    def test_warning_when_above_warn(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            branch_current_ka={"line-1": 0.45},  # 450A of 500A → 90%
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.BRANCH_LOADING]
        assert items[0].status == EnergyValidationStatus.WARNING

    def test_fail_when_above_fail(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            branch_current_ka={"line-1": 0.6},  # 600A of 500A → 120%
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.BRANCH_LOADING]
        assert items[0].status == EnergyValidationStatus.FAIL
        assert items[0].observed_value == pytest.approx(120.0)

    def test_not_computed_when_missing_current(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(branch_current_ka={})
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.BRANCH_LOADING]
        assert items[0].status == EnergyValidationStatus.NOT_COMPUTED

    def test_ignores_transformers(self):
        """Branch loading only checks LineBranch, not TransformerBranch."""
        graph = _build_simple_graph()
        pf = _build_pf_result(
            branch_current_ka={"line-1": 0.1, "tr-1": 0.5},
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        bl_items = [i for i in view.items if i.check_type == EnergyCheckType.BRANCH_LOADING]
        assert all(i.target_id != "tr-1" for i in bl_items)

    def test_custom_thresholds(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            branch_current_ka={"line-1": 0.3},  # 300A/500A = 60%
        )
        strict_config = EnergyValidationConfig(
            loading_warn_pct=50.0,
            loading_fail_pct=70.0,
        )
        view = EnergyValidationBuilder().build(pf, graph, strict_config)
        items = [i for i in view.items if i.check_type == EnergyCheckType.BRANCH_LOADING]
        assert items[0].status == EnergyValidationStatus.WARNING


# ============================================================================
# TestTransformerLoading
# ============================================================================


class TestTransformerLoading:
    """Transformer loading checks (S_apparent vs S_rated)."""

    def test_pass_normal_loading(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            branch_s_from_mva={"tr-1": complex(10.0, 5.0)},
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.TRANSFORMER_LOADING]
        assert len(items) == 1
        s_mva = abs(complex(10.0, 5.0))
        expected_pct = (s_mva / 25.0) * 100.0
        assert items[0].observed_value == pytest.approx(expected_pct, rel=1e-3)
        assert items[0].status == EnergyValidationStatus.PASS

    def test_fail_overloaded_transformer(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            branch_s_from_mva={"tr-1": complex(20.0, 15.0)},
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.TRANSFORMER_LOADING]
        assert items[0].status == EnergyValidationStatus.FAIL

    def test_uses_max_of_from_and_to(self):
        """Should use max(|S_from|, |S_to|) for loading calculation."""
        graph = _build_simple_graph()
        pf = _build_pf_result(
            branch_s_from_mva={"tr-1": complex(5.0, 3.0)},
            branch_s_to_mva={"tr-1": complex(22.0, 12.0)},
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.TRANSFORMER_LOADING]
        s_to = abs(complex(22.0, 12.0))
        expected_pct = (s_to / 25.0) * 100.0
        assert items[0].observed_value == pytest.approx(expected_pct, rel=1e-3)
        assert items[0].status == EnergyValidationStatus.FAIL

    def test_not_computed_missing_power(self):
        graph = _build_simple_graph()
        pf = _build_pf_result()
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.TRANSFORMER_LOADING]
        assert items[0].status == EnergyValidationStatus.NOT_COMPUTED


# ============================================================================
# TestVoltageDeviation
# ============================================================================


class TestVoltageDeviation:
    """Voltage deviation checks (|U - U_nom| / U_nom * 100)."""

    def test_pass_nominal_voltage(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={
                "slack": 110.0,
                "bus-a": 109.5,
                "bus-b": 14.8,
            },
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.VOLTAGE_DEVIATION]
        assert len(items) == 3
        assert all(i.status == EnergyValidationStatus.PASS for i in items)

    def test_warning_moderate_deviation(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={
                "slack": 110.0,
                "bus-a": 103.0,  # |103 - 110| / 110 = 6.36% → WARNING
                "bus-b": 15.0,
            },
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [
            i
            for i in view.items
            if i.check_type == EnergyCheckType.VOLTAGE_DEVIATION and i.target_id == "bus-a"
        ]
        assert items[0].status == EnergyValidationStatus.WARNING
        assert items[0].observed_value == pytest.approx(6.3636, rel=1e-2)

    def test_fail_large_deviation(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={
                "slack": 110.0,
                "bus-a": 110.0,
                "bus-b": 12.0,  # |12 - 15| / 15 = 20% → FAIL
            },
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [
            i
            for i in view.items
            if i.check_type == EnergyCheckType.VOLTAGE_DEVIATION and i.target_id == "bus-b"
        ]
        assert items[0].status == EnergyValidationStatus.FAIL
        assert items[0].observed_value == pytest.approx(20.0)

    def test_not_computed_missing_voltage(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(node_voltage_kv={})
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.VOLTAGE_DEVIATION]
        assert all(i.status == EnergyValidationStatus.NOT_COMPUTED for i in items)


# ============================================================================
# TestLossBudget
# ============================================================================


class TestLossBudget:
    """Loss budget checks (P_loss / P_slack * 100)."""

    def test_pass_low_losses(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            losses_total_pu=0.01 + 0.005j,
            slack_power_pu=1.0 + 0.3j,
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.LOSS_BUDGET]
        assert len(items) == 1
        # 0.01 / 1.0 * 100 = 1%
        assert items[0].observed_value == pytest.approx(1.0)
        assert items[0].status == EnergyValidationStatus.PASS

    def test_warning_moderate_losses(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            losses_total_pu=0.06 + 0.02j,
            slack_power_pu=1.0 + 0.3j,
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.LOSS_BUDGET]
        assert items[0].status == EnergyValidationStatus.WARNING

    def test_fail_high_losses(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            losses_total_pu=0.15 + 0.05j,
            slack_power_pu=1.0 + 0.3j,
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.LOSS_BUDGET]
        assert items[0].status == EnergyValidationStatus.FAIL

    def test_not_computed_zero_slack(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            losses_total_pu=0.01 + 0.005j,
            slack_power_pu=0.0 + 0.0j,
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.LOSS_BUDGET]
        assert items[0].status == EnergyValidationStatus.NOT_COMPUTED


# ============================================================================
# TestReactiveBalance
# ============================================================================


class TestReactiveBalance:
    """Reactive power balance checks (cos(phi) at slack bus)."""

    def test_pass_good_cos_phi(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            slack_power_pu=1.0 + 0.2j,  # tan(phi) = 0.2, cos(phi) ≈ 0.98
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.REACTIVE_BALANCE]
        assert len(items) == 1
        assert items[0].status == EnergyValidationStatus.PASS

    def test_warning_borderline_cos_phi(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            slack_power_pu=1.0 + 0.55j,  # tan(phi) = 0.55, cos(phi) ≈ 0.876
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.REACTIVE_BALANCE]
        assert items[0].status == EnergyValidationStatus.WARNING

    def test_fail_low_cos_phi(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            slack_power_pu=1.0 + 2.0j,  # tan(phi) = 2.0, cos(phi) ≈ 0.447
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        items = [i for i in view.items if i.check_type == EnergyCheckType.REACTIVE_BALANCE]
        assert items[0].status == EnergyValidationStatus.FAIL


# ============================================================================
# TestSummary
# ============================================================================


class TestSummary:
    """Summary aggregation."""

    def test_all_pass_summary(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 110.0, "bus-b": 15.0},
            branch_current_ka={"line-1": 0.05},
            branch_s_from_mva={"tr-1": complex(5.0, 2.0)},
            losses_total_pu=0.005 + 0.002j,
            slack_power_pu=1.0 + 0.2j,
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        assert view.summary.fail_count == 0
        assert view.summary.warning_count == 0
        assert view.summary.pass_count > 0

    def test_worst_item_tracked(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 110.0, "bus-b": 12.0},
            branch_current_ka={"line-1": 0.6},
            branch_s_from_mva={"tr-1": complex(5.0, 2.0)},
            losses_total_pu=0.005 + 0.002j,
            slack_power_pu=1.0 + 0.2j,
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        assert view.summary.fail_count >= 2
        assert view.summary.worst_item_target_id is not None


# ============================================================================
# TestSortOrder
# ============================================================================


class TestSortOrder:
    """Items sorted by severity → margin → check_type → target_id."""

    def test_fail_items_first(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 110.0, "bus-b": 12.0},
            branch_current_ka={"line-1": 0.05},
            branch_s_from_mva={"tr-1": complex(5.0, 2.0)},
            losses_total_pu=0.005 + 0.002j,
            slack_power_pu=1.0 + 0.2j,
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        statuses = [i.status for i in view.items]
        fail_indices = [idx for idx, s in enumerate(statuses) if s == EnergyValidationStatus.FAIL]
        pass_indices = [idx for idx, s in enumerate(statuses) if s == EnergyValidationStatus.PASS]
        if fail_indices and pass_indices:
            assert max(fail_indices) < min(pass_indices)


# ============================================================================
# TestSerialization
# ============================================================================


class TestSerialization:
    """Serialization to dict (deterministic, JSON-safe)."""

    def test_view_to_dict_roundtrip(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 109.5, "bus-b": 14.8},
            branch_current_ka={"line-1": 0.1},
            branch_s_from_mva={"tr-1": complex(10.0, 5.0)},
            losses_total_pu=0.01 + 0.005j,
            slack_power_pu=1.0 + 0.3j,
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        d = view.to_dict()
        assert isinstance(d, dict)
        assert "items" in d
        assert "summary" in d
        assert "config" in d

    def test_json_serializable(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 109.5, "bus-b": 14.8},
            branch_current_ka={"line-1": 0.1},
            branch_s_from_mva={"tr-1": complex(10.0, 5.0)},
            losses_total_pu=0.01 + 0.005j,
            slack_power_pu=1.0 + 0.3j,
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        d = view.to_dict()
        serialized = json.dumps(d, sort_keys=True)
        assert isinstance(serialized, str)
        assert len(serialized) > 100

    def test_deterministic_serialization(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 109.5, "bus-b": 14.8},
            branch_current_ka={"line-1": 0.1},
            branch_s_from_mva={"tr-1": complex(10.0, 5.0)},
            losses_total_pu=0.01 + 0.005j,
            slack_power_pu=1.0 + 0.3j,
        )
        view1 = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        view2 = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        j1 = json.dumps(view1.to_dict(), sort_keys=True)
        j2 = json.dumps(view2.to_dict(), sort_keys=True)
        assert j1 == j2

    def test_item_fields_present(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 109.5, "bus-b": 14.8},
            branch_current_ka={"line-1": 0.1},
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        d = view.to_dict()
        first_item = d["items"][0]
        required_keys = {
            "check_type",
            "target_id",
            "target_name",
            "observed_value",
            "unit",
            "limit_warn",
            "limit_fail",
            "margin_pct",
            "status",
            "why_pl",
        }
        assert required_keys.issubset(first_item.keys())


# ============================================================================
# TestContext
# ============================================================================


class TestContext:
    """Context propagation."""

    def test_context_passed_through(self):
        from datetime import datetime

        ctx = EnergyValidationContext(
            project_name="Golden SN",
            case_name="Max load",
            run_timestamp=datetime(2024, 1, 1, tzinfo=UTC),
            snapshot_id="snap-001",
            trace_id="run-001",
        )
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 109.5, "bus-b": 14.8},
        )
        builder = EnergyValidationBuilder(context=ctx)
        view = builder.build(pf, graph, DEFAULT_CONFIG)
        assert view.context is not None
        assert view.context.project_name == "Golden SN"
        d = view.to_dict()
        assert d["context"]["project_name"] == "Golden SN"

    def test_none_context(self):
        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 109.5, "bus-b": 14.8},
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        assert view.context is None
        d = view.to_dict()
        assert d["context"] is None


# ============================================================================
# TestGoldenNetworkIntegration
# ============================================================================


class TestGoldenNetworkIntegration:
    """Integration with Golden Network SN fixture."""

    @pytest.fixture()
    def golden_graph(self):
        import sys
        from pathlib import Path

        tests_dir = str(Path(__file__).resolve().parents[1])
        if tests_dir not in sys.path:
            sys.path.insert(0, tests_dir)
        from golden.golden_network_sn import build_golden_network

        return build_golden_network()

    @pytest.fixture()
    def golden_pf_result(self, golden_graph):
        """Synthetic PF result for golden network — all nodes near nominal."""
        node_voltage_kv = {}
        for nid, node in golden_graph.nodes.items():
            node_voltage_kv[nid] = node.voltage_level * 0.98

        branch_current_ka = {}
        for bid, branch in golden_graph.branches.items():
            if isinstance(branch, LineBranch):
                branch_current_ka[bid] = branch.rated_current_a * 0.5 / 1000.0

        branch_s_mva = {}
        for bid, branch in golden_graph.branches.items():
            if isinstance(branch, TransformerBranch):
                branch_s_mva[bid] = complex(
                    branch.rated_power_mva * 0.6,
                    branch.rated_power_mva * 0.2,
                )

        return _build_pf_result(
            node_voltage_kv=node_voltage_kv,
            branch_current_ka=branch_current_ka,
            branch_s_from_mva=branch_s_mva,
            losses_total_pu=0.02 + 0.01j,
            slack_power_pu=2.5 + 0.8j,
            slack_node_id="bus-system-ref",
        )

    def test_all_checks_present(self, golden_graph, golden_pf_result):
        """All 5 check types should be present in the result."""
        view = EnergyValidationBuilder().build(golden_pf_result, golden_graph, DEFAULT_CONFIG)
        check_types = {i.check_type for i in view.items}
        assert EnergyCheckType.BRANCH_LOADING in check_types
        assert EnergyCheckType.TRANSFORMER_LOADING in check_types
        assert EnergyCheckType.VOLTAGE_DEVIATION in check_types
        assert EnergyCheckType.LOSS_BUDGET in check_types
        assert EnergyCheckType.REACTIVE_BALANCE in check_types

    def test_item_count_matches_topology(self, golden_graph, golden_pf_result):
        """Number of items should match the network topology."""
        view = EnergyValidationBuilder().build(golden_pf_result, golden_graph, DEFAULT_CONFIG)
        line_count = sum(
            1 for b in golden_graph.branches.values() if isinstance(b, LineBranch) and b.in_service
        )
        trafo_count = sum(
            1
            for b in golden_graph.branches.values()
            if isinstance(b, TransformerBranch) and b.in_service
        )
        node_count = len(golden_graph.nodes)

        bl_items = [i for i in view.items if i.check_type == EnergyCheckType.BRANCH_LOADING]
        tl_items = [i for i in view.items if i.check_type == EnergyCheckType.TRANSFORMER_LOADING]
        vd_items = [i for i in view.items if i.check_type == EnergyCheckType.VOLTAGE_DEVIATION]
        lb_items = [i for i in view.items if i.check_type == EnergyCheckType.LOSS_BUDGET]
        rb_items = [i for i in view.items if i.check_type == EnergyCheckType.REACTIVE_BALANCE]

        assert len(bl_items) == line_count
        assert len(tl_items) == trafo_count
        assert len(vd_items) == node_count
        assert len(lb_items) == 1
        assert len(rb_items) == 1

    def test_all_pass_at_nominal(self, golden_graph, golden_pf_result):
        """At 50% loading and 98% voltage, everything should pass."""
        view = EnergyValidationBuilder().build(golden_pf_result, golden_graph, DEFAULT_CONFIG)
        assert view.summary.fail_count == 0

    def test_deterministic_output(self, golden_graph, golden_pf_result):
        view1 = EnergyValidationBuilder().build(golden_pf_result, golden_graph, DEFAULT_CONFIG)
        view2 = EnergyValidationBuilder().build(golden_pf_result, golden_graph, DEFAULT_CONFIG)
        j1 = json.dumps(view1.to_dict(), sort_keys=True)
        j2 = json.dumps(view2.to_dict(), sort_keys=True)
        assert j1 == j2

    def test_overload_scenario(self, golden_graph):
        """With 200% line loading, fail items should appear."""
        node_voltage_kv = {
            nid: node.voltage_level * 0.98 for nid, node in golden_graph.nodes.items()
        }
        branch_current_ka = {}
        for bid, branch in golden_graph.branches.items():
            if isinstance(branch, LineBranch):
                branch_current_ka[bid] = branch.rated_current_a * 2.0 / 1000.0

        pf = _build_pf_result(
            node_voltage_kv=node_voltage_kv,
            branch_current_ka=branch_current_ka,
            losses_total_pu=0.02 + 0.01j,
            slack_power_pu=2.5 + 0.8j,
            slack_node_id="bus-system-ref",
        )
        view = EnergyValidationBuilder().build(pf, golden_graph, DEFAULT_CONFIG)
        assert view.summary.fail_count > 0
        bl_fails = [
            i
            for i in view.items
            if i.check_type == EnergyCheckType.BRANCH_LOADING
            and i.status == EnergyValidationStatus.FAIL
        ]
        assert len(bl_fails) > 0


# ============================================================================
# TestOrchestrator
# ============================================================================


class TestOrchestrator:
    """Analysis orchestrator integration."""

    def test_orchestrator_produces_bundle(self):
        from application.analysis_run.orchestrator import AnalysisOrchestrator

        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 109.5, "bus-b": 14.8},
            branch_current_ka={"line-1": 0.1},
            branch_s_from_mva={"tr-1": complex(10.0, 5.0)},
            losses_total_pu=0.01 + 0.005j,
            slack_power_pu=1.0 + 0.3j,
        )
        orch = AnalysisOrchestrator()
        bundle = orch.run_post_pf_analysis(
            run_id="test-run-001",
            power_flow_result=pf,
            graph=graph,
        )
        assert bundle.run_id == "test-run-001"
        assert bundle.energy_validation is not None
        assert bundle.voltage_profile is not None
        assert bundle.overall_status in {"PASS", "WARNING", "FAIL", "NOT_COMPUTED"}
        assert len(bundle.fingerprint) == 64  # SHA-256 hex

    def test_orchestrator_deterministic(self):
        from application.analysis_run.orchestrator import AnalysisOrchestrator

        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 109.5, "bus-b": 14.8},
            branch_current_ka={"line-1": 0.1},
            branch_s_from_mva={"tr-1": complex(10.0, 5.0)},
            losses_total_pu=0.01 + 0.005j,
            slack_power_pu=1.0 + 0.3j,
        )
        orch = AnalysisOrchestrator()
        b1 = orch.run_post_pf_analysis(run_id="run-x", power_flow_result=pf, graph=graph)
        b2 = orch.run_post_pf_analysis(run_id="run-x", power_flow_result=pf, graph=graph)
        assert b1.fingerprint == b2.fingerprint

    def test_orchestrator_without_voltage_profile(self):
        from application.analysis_run.orchestrator import AnalysisOrchestrator

        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 109.5, "bus-b": 14.8},
        )
        orch = AnalysisOrchestrator()
        bundle = orch.run_post_pf_analysis(
            run_id="run-y",
            power_flow_result=pf,
            graph=graph,
            include_voltage_profile=False,
        )
        assert bundle.voltage_profile is None
        assert bundle.energy_validation is not None

    def test_bundle_to_dict(self):
        from application.analysis_run.orchestrator import AnalysisOrchestrator

        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 109.5, "bus-b": 14.8},
            branch_current_ka={"line-1": 0.1},
            branch_s_from_mva={"tr-1": complex(10.0, 5.0)},
        )
        orch = AnalysisOrchestrator()
        bundle = orch.run_post_pf_analysis(
            run_id="run-z",
            power_flow_result=pf,
            graph=graph,
        )
        d = bundle.to_dict()
        assert isinstance(d, dict)
        serialized = json.dumps(d, sort_keys=True)
        assert isinstance(serialized, str)


# ============================================================================
# TestEnvelopeAdapter
# ============================================================================


class TestEnvelopeAdapter:
    """Run envelope adapter for energy validation."""

    def test_creates_envelope(self):
        from application.analyses.energy_validation.envelope_adapter import (
            to_run_envelope,
        )

        graph = _build_simple_graph()
        pf = _build_pf_result(
            node_voltage_kv={"slack": 110.0, "bus-a": 109.5, "bus-b": 14.8},
            branch_current_ka={"line-1": 0.1},
        )
        view = EnergyValidationBuilder().build(pf, graph, DEFAULT_CONFIG)
        envelope = to_run_envelope(view, run_id="ev-run-001")
        assert envelope.analysis_type == "energy_validation.v0"
        assert envelope.run_id == "ev-run-001"
        assert len(envelope.fingerprint) == 64

    def test_registered_in_registry(self):
        from application.analyses.run_registry import get_run_envelope_adapter

        adapter = get_run_envelope_adapter("energy_validation.v0")
        assert adapter is not None
