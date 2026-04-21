"""Tests for LoadFlowResultSetV1 mapper — stable ordering, deterministic signature."""

from application.result_mapping.load_flow_to_resultset_v1 import (
    map_power_flow_to_resultset_v1,
)
from network_model.solvers.power_flow_result import (
    PowerFlowBranchResult,
    PowerFlowBusResult,
    PowerFlowResultV1,
    PowerFlowSummary,
)


def _make_pf_result(**overrides) -> PowerFlowResultV1:
    defaults = {
        "result_version": "1.0.0",
        "converged": True,
        "iterations_count": 5,
        "tolerance_used": 1e-6,
        "base_mva": 100.0,
        "slack_bus_id": "bus-001",
        "bus_results": (
            PowerFlowBusResult(
                bus_id="bus-002",
                v_pu=0.98,
                angle_deg=-1.2,
                p_injected_mw=-2.0,
                q_injected_mvar=-0.8,
            ),
            PowerFlowBusResult(
                bus_id="bus-001", v_pu=1.0, angle_deg=0.0, p_injected_mw=3.6, q_injected_mvar=1.5
            ),
            PowerFlowBusResult(
                bus_id="bus-003",
                v_pu=0.97,
                angle_deg=-2.1,
                p_injected_mw=-1.5,
                q_injected_mvar=-0.6,
            ),
        ),
        "branch_results": (
            PowerFlowBranchResult(
                branch_id="br-002",
                p_from_mw=1.51,
                q_from_mvar=0.61,
                p_to_mw=-1.5,
                q_to_mvar=-0.6,
                losses_p_mw=0.01,
                losses_q_mvar=0.01,
            ),
            PowerFlowBranchResult(
                branch_id="br-001",
                p_from_mw=2.02,
                q_from_mvar=0.82,
                p_to_mw=-2.0,
                q_to_mvar=-0.8,
                losses_p_mw=0.02,
                losses_q_mvar=0.02,
            ),
        ),
        "summary": PowerFlowSummary(
            total_losses_p_mw=0.03,
            total_losses_q_mvar=0.03,
            min_v_pu=0.97,
            max_v_pu=1.0,
            slack_p_mw=3.6,
            slack_q_mvar=1.5,
        ),
    }
    defaults.update(overrides)
    return PowerFlowResultV1(**defaults)


class TestResultSetMapping:
    def test_basic_mapping(self):
        pf = _make_pf_result()
        rs = map_power_flow_to_resultset_v1(
            pf_result=pf,
            snapshot_hash="abc123",
            run_hash="def456",
            input_hash="ghi789",
        )
        assert rs.analysis_type == "LOAD_FLOW"
        assert rs.convergence_status == "CONVERGED"
        assert rs.iteration_count == 5
        assert len(rs.nodes) == 3
        assert len(rs.branches) == 2

    def test_nodes_sorted_by_id(self):
        pf = _make_pf_result()
        rs = map_power_flow_to_resultset_v1(
            pf_result=pf,
            snapshot_hash="abc",
            run_hash="def",
            input_hash="ghi",
        )
        node_ids = [n.node_id for n in rs.nodes]
        assert node_ids == sorted(node_ids)

    def test_branches_sorted_by_id(self):
        pf = _make_pf_result()
        rs = map_power_flow_to_resultset_v1(
            pf_result=pf,
            snapshot_hash="abc",
            run_hash="def",
            input_hash="ghi",
        )
        branch_ids = [b.branch_id for b in rs.branches]
        assert branch_ids == sorted(branch_ids)

    def test_deterministic_signature_stable(self):
        pf = _make_pf_result()
        sigs = set()
        for _ in range(5):
            rs = map_power_flow_to_resultset_v1(
                pf_result=pf,
                snapshot_hash="abc",
                run_hash="def",
                input_hash="ghi",
            )
            sigs.add(rs.deterministic_signature)
        assert len(sigs) == 1

    def test_not_converged_status(self):
        pf = _make_pf_result(converged=False)
        rs = map_power_flow_to_resultset_v1(
            pf_result=pf,
            snapshot_hash="abc",
            run_hash="def",
            input_hash="ghi",
        )
        assert rs.convergence_status == "NOT_CONVERGED"

    def test_voltage_kv_with_base(self):
        pf = _make_pf_result()
        rs = map_power_flow_to_resultset_v1(
            pf_result=pf,
            snapshot_hash="abc",
            run_hash="def",
            input_hash="ghi",
            bus_voltage_bases={"bus-001": 20.0, "bus-002": 20.0, "bus-003": 20.0},
        )
        bus1 = next(n for n in rs.nodes if n.node_id == "bus-001")
        assert abs(bus1.voltage_kv - 20.0) < 0.01

    def test_serialization_round_trip(self):
        pf = _make_pf_result()
        rs = map_power_flow_to_resultset_v1(
            pf_result=pf,
            snapshot_hash="abc",
            run_hash="def",
            input_hash="ghi",
        )
        d = rs.to_dict()
        assert d["analysis_type"] == "LOAD_FLOW"
        assert len(d["nodes"]) == 3
        assert len(d["branches"]) == 2
        assert isinstance(d["deterministic_signature"], str)
