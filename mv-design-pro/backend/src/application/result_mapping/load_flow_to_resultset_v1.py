"""LoadFlowResultSetV1 mapper — maps PowerFlowResultV1 to canonical ResultSet.

Maps solver output (PowerFlowResultV1) to the execution domain's ResultSet,
maintaining deterministic ordering and stable signatures.

BOUNDARY: This mapper does NOT touch SC or Protection ResultSet contracts.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from network_model.solvers.power_flow_result import PowerFlowResultV1

LOAD_FLOW_RESULTSET_VERSION = "1.0.0"


@dataclass(frozen=True)
class LoadFlowNodeResult:
    """Single node result in LoadFlowResultSetV1."""

    node_id: str
    voltage_pu: float
    voltage_kv: float
    angle_deg: float
    p_injected_mw: float
    q_injected_mvar: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "node_id": self.node_id,
            "voltage_pu": self.voltage_pu,
            "voltage_kv": self.voltage_kv,
            "angle_deg": self.angle_deg,
            "p_injected_mw": self.p_injected_mw,
            "q_injected_mvar": self.q_injected_mvar,
        }


@dataclass(frozen=True)
class LoadFlowBranchResult:
    """Single branch result in LoadFlowResultSetV1."""

    branch_id: str
    from_node_id: str
    to_node_id: str
    p_from_mw: float
    q_from_mvar: float
    p_to_mw: float
    q_to_mvar: float
    i_from_ka: float | None
    i_to_ka: float | None
    losses_p_mw: float
    losses_q_mvar: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_id": self.branch_id,
            "from_node_id": self.from_node_id,
            "to_node_id": self.to_node_id,
            "p_from_mw": self.p_from_mw,
            "q_from_mvar": self.q_from_mvar,
            "p_to_mw": self.p_to_mw,
            "q_to_mvar": self.q_to_mvar,
            "i_from_ka": self.i_from_ka,
            "i_to_ka": self.i_to_ka,
            "losses_p_mw": self.losses_p_mw,
            "losses_q_mvar": self.losses_q_mvar,
        }


@dataclass(frozen=True)
class LoadFlowTotals:
    """Aggregated totals for LoadFlowResultSetV1."""

    total_losses_p_mw: float
    total_losses_q_mvar: float
    slack_p_mw: float
    slack_q_mvar: float
    min_v_pu: float
    max_v_pu: float
    power_balance_mw: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_losses_p_mw": self.total_losses_p_mw,
            "total_losses_q_mvar": self.total_losses_q_mvar,
            "slack_p_mw": self.slack_p_mw,
            "slack_q_mvar": self.slack_q_mvar,
            "min_v_pu": self.min_v_pu,
            "max_v_pu": self.max_v_pu,
            "power_balance_mw": self.power_balance_mw,
        }


@dataclass(frozen=True)
class LoadFlowResultSetV1:
    """Canonical Load Flow ResultSet v1.

    FROZEN after introduction. Changes require new version.
    Deterministic: same input → same signature.
    """

    analysis_type: str  # Always "LOAD_FLOW"
    result_version: str  # Always "1.0.0"
    snapshot_hash: str
    run_hash: str
    input_hash: str
    convergence_status: str  # CONVERGED | NOT_CONVERGED | FAILED_VALIDATION | FAILED_SOLVER
    iteration_count: int
    nodes: tuple[LoadFlowNodeResult, ...]  # sorted by node_id
    branches: tuple[LoadFlowBranchResult, ...]  # sorted by branch_id
    totals: LoadFlowTotals
    warnings: tuple[str, ...]  # sorted
    errors: tuple[str, ...]  # sorted
    deterministic_signature: str  # SHA-256

    def to_dict(self) -> dict[str, Any]:
        return {
            "analysis_type": self.analysis_type,
            "result_version": self.result_version,
            "snapshot_hash": self.snapshot_hash,
            "run_hash": self.run_hash,
            "input_hash": self.input_hash,
            "convergence_status": self.convergence_status,
            "iteration_count": self.iteration_count,
            "nodes": [n.to_dict() for n in self.nodes],
            "branches": [b.to_dict() for b in self.branches],
            "totals": self.totals.to_dict(),
            "warnings": list(self.warnings),
            "errors": list(self.errors),
            "deterministic_signature": self.deterministic_signature,
        }


def _compute_signature(data: dict[str, Any]) -> str:
    """Compute deterministic SHA-256 signature."""
    payload = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def map_power_flow_to_resultset_v1(
    *,
    pf_result: PowerFlowResultV1,
    snapshot_hash: str,
    run_hash: str,
    input_hash: str,
    bus_voltage_bases: dict[str, float] | None = None,
    branch_topology: dict[str, tuple[str, str]] | None = None,
) -> LoadFlowResultSetV1:
    """Map PowerFlowResultV1 to LoadFlowResultSetV1.

    Args:
        pf_result: Frozen solver result.
        snapshot_hash: Hash of network snapshot.
        run_hash: Hash of LoadFlowRunInput.
        input_hash: Hash of canonical input JSON.
        bus_voltage_bases: {bus_id: voltage_kv} for voltage conversion.
        branch_topology: {branch_id: (from_node, to_node)} for branch mapping.

    Returns:
        LoadFlowResultSetV1 with deterministic signature.
    """
    voltage_bases = bus_voltage_bases or {}
    branch_topo = branch_topology or {}

    # Map bus results → node results (sorted by node_id)
    nodes = []
    for bus_r in pf_result.bus_results:
        base_kv = voltage_bases.get(bus_r.bus_id, 0.0)
        nodes.append(
            LoadFlowNodeResult(
                node_id=bus_r.bus_id,
                voltage_pu=bus_r.v_pu,
                voltage_kv=bus_r.v_pu * base_kv,
                angle_deg=bus_r.angle_deg,
                p_injected_mw=bus_r.p_injected_mw,
                q_injected_mvar=bus_r.q_injected_mvar,
            )
        )
    nodes_sorted = tuple(sorted(nodes, key=lambda n: n.node_id))

    # Map branch results (sorted by branch_id)
    branches = []
    for br_r in pf_result.branch_results:
        from_node, to_node = branch_topo.get(br_r.branch_id, ("", ""))
        branches.append(
            LoadFlowBranchResult(
                branch_id=br_r.branch_id,
                from_node_id=from_node,
                to_node_id=to_node,
                p_from_mw=br_r.p_from_mw,
                q_from_mvar=br_r.q_from_mvar,
                p_to_mw=br_r.p_to_mw,
                q_to_mvar=br_r.q_to_mvar,
                i_from_ka=None,  # TODO: compute from S/U when base voltage available
                i_to_ka=None,
                losses_p_mw=br_r.losses_p_mw,
                losses_q_mvar=br_r.losses_q_mvar,
            )
        )
    branches_sorted = tuple(sorted(branches, key=lambda b: b.branch_id))

    # Compute power balance
    total_p_injected = sum(n.p_injected_mw for n in nodes_sorted)
    power_balance = total_p_injected + pf_result.summary.total_losses_p_mw

    # Map totals
    totals = LoadFlowTotals(
        total_losses_p_mw=pf_result.summary.total_losses_p_mw,
        total_losses_q_mvar=pf_result.summary.total_losses_q_mvar,
        slack_p_mw=pf_result.summary.slack_p_mw,
        slack_q_mvar=pf_result.summary.slack_q_mvar,
        min_v_pu=pf_result.summary.min_v_pu,
        max_v_pu=pf_result.summary.max_v_pu,
        power_balance_mw=power_balance,
    )

    # Convergence status
    if pf_result.converged:
        convergence_status = "CONVERGED"
    else:
        convergence_status = "NOT_CONVERGED"

    # Build warnings/errors
    warnings: list[str] = []
    errors: list[str] = []

    # Compute signature from content (excluding signature itself)
    sig_data = {
        "analysis_type": "LOAD_FLOW",
        "result_version": LOAD_FLOW_RESULTSET_VERSION,
        "convergence_status": convergence_status,
        "iteration_count": pf_result.iterations_count,
        "nodes": [n.to_dict() for n in nodes_sorted],
        "branches": [b.to_dict() for b in branches_sorted],
        "totals": totals.to_dict(),
    }
    signature = _compute_signature(sig_data)

    return LoadFlowResultSetV1(
        analysis_type="LOAD_FLOW",
        result_version=LOAD_FLOW_RESULTSET_VERSION,
        snapshot_hash=snapshot_hash,
        run_hash=run_hash,
        input_hash=input_hash,
        convergence_status=convergence_status,
        iteration_count=pf_result.iterations_count,
        nodes=nodes_sorted,
        branches=branches_sorted,
        totals=totals,
        warnings=tuple(sorted(warnings)),
        errors=tuple(sorted(errors)),
        deterministic_signature=signature,
    )
