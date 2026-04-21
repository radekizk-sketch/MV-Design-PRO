"""
SLD overlay builder — transforms analysis results into SLD overlay data.

Bridges the domain/analysis layers (NetworkGraph, PowerFlowResult,
EnergyValidationView) to the frontend SLD overlay format.

This is APPLICATION LAYER — no physics, only data mapping.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from analysis.energy_validation.models import (
    EnergyCheckType,
    EnergyValidationView,
)
from analysis.power_flow.result import PowerFlowResult
from network_model.core.branch import LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph


@dataclass(frozen=True)
class OverlayNode:
    node_id: str
    u_pu: float | None
    u_kv: float | None
    angle_deg: float | None
    ikss_ka: float | None
    sk_mva: float | None
    voltage_status: str | None
    ev_status: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "node_id": self.node_id,
            "u_pu": self.u_pu,
            "u_kv": self.u_kv,
            "angle_deg": self.angle_deg,
            "ikss_ka": self.ikss_ka,
            "sk_mva": self.sk_mva,
            "voltage_status": self.voltage_status,
            "ev_status": self.ev_status,
        }


@dataclass(frozen=True)
class OverlayBranch:
    branch_id: str
    p_mw: float | None
    q_mvar: float | None
    i_a: float | None
    loading_pct: float | None
    ev_status: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_id": self.branch_id,
            "p_mw": self.p_mw,
            "q_mvar": self.q_mvar,
            "i_a": self.i_a,
            "loading_pct": self.loading_pct,
            "ev_status": self.ev_status,
        }


@dataclass(frozen=True)
class SldOverlayData:
    run_id: str
    result_status: str
    nodes: tuple[OverlayNode, ...]
    branches: tuple[OverlayBranch, ...]
    overall_ev_status: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "result_status": self.result_status,
            "nodes": [n.to_dict() for n in self.nodes],
            "branches": [b.to_dict() for b in self.branches],
            "overall_ev_status": self.overall_ev_status,
        }


def build_sld_overlay(
    *,
    run_id: str,
    graph: NetworkGraph,
    pf_result: PowerFlowResult | None = None,
    ev_view: EnergyValidationView | None = None,
    result_status: str = "FRESH",
) -> SldOverlayData:
    """
    Build SLD overlay data from analysis results.

    Maps PowerFlowResult values and EnergyValidation statuses
    onto NetworkGraph elements for frontend overlay rendering.
    """
    ev_node_statuses = _build_ev_node_status_map(ev_view)
    ev_branch_statuses = _build_ev_branch_status_map(ev_view)

    nodes: list[OverlayNode] = []
    for node_id in sorted(graph.nodes.keys()):
        u_pu: float | None = None
        u_kv: float | None = None
        angle_deg: float | None = None

        if pf_result is not None:
            u_pu = pf_result.node_u_mag_pu.get(node_id)
            u_kv = pf_result.node_voltage_kv.get(node_id)
            angle_rad = pf_result.node_angle_rad.get(node_id)
            if angle_rad is not None:
                import math

                angle_deg = math.degrees(angle_rad)

        voltage_status = _voltage_deviation_status(u_kv, graph.nodes[node_id].voltage_level)
        ev_status = ev_node_statuses.get(node_id)

        nodes.append(
            OverlayNode(
                node_id=node_id,
                u_pu=u_pu,
                u_kv=u_kv,
                angle_deg=angle_deg,
                ikss_ka=None,
                sk_mva=None,
                voltage_status=voltage_status,
                ev_status=ev_status,
            )
        )

    branches: list[OverlayBranch] = []
    for branch_id in sorted(graph.branches.keys()):
        branch = graph.branches[branch_id]
        if not branch.in_service:
            continue

        p_mw: float | None = None
        q_mvar: float | None = None
        i_a: float | None = None
        loading_pct: float | None = None

        if pf_result is not None:
            s_from = pf_result.branch_s_from_mva.get(branch_id)
            if s_from is not None:
                p_mw = s_from.real
                q_mvar = s_from.imag

            i_ka = pf_result.branch_current_ka.get(branch_id)
            if i_ka is not None:
                i_a = i_ka * 1000.0

            if isinstance(branch, LineBranch) and i_ka is not None:
                rated_ka = branch.rated_current_a / 1000.0
                if rated_ka > 0:
                    loading_pct = (abs(i_ka) / rated_ka) * 100.0
            elif isinstance(branch, TransformerBranch):
                s_abs = None
                s_from_val = pf_result.branch_s_from_mva.get(branch_id)
                s_to_val = pf_result.branch_s_to_mva.get(branch_id)
                if s_from_val is not None or s_to_val is not None:
                    s_abs = max(
                        abs(s_from_val) if s_from_val is not None else 0.0,
                        abs(s_to_val) if s_to_val is not None else 0.0,
                    )
                if s_abs is not None and branch.rated_power_mva > 0:
                    loading_pct = (s_abs / branch.rated_power_mva) * 100.0

        ev_status = ev_branch_statuses.get(branch_id)

        branches.append(
            OverlayBranch(
                branch_id=branch_id,
                p_mw=p_mw,
                q_mvar=q_mvar,
                i_a=i_a,
                loading_pct=loading_pct,
                ev_status=ev_status,
            )
        )

    overall_ev = ev_view.summary if ev_view else None
    overall_ev_status: str | None = None
    if overall_ev is not None:
        if overall_ev.fail_count > 0:
            overall_ev_status = "FAIL"
        elif overall_ev.warning_count > 0:
            overall_ev_status = "WARNING"
        else:
            overall_ev_status = "PASS"

    return SldOverlayData(
        run_id=run_id,
        result_status=result_status,
        nodes=tuple(nodes),
        branches=tuple(branches),
        overall_ev_status=overall_ev_status,
    )


def _voltage_deviation_status(
    u_kv: float | None,
    u_nom_kv: float,
) -> str | None:
    """Classify voltage deviation: PASS / WARNING / FAIL."""
    if u_kv is None or u_nom_kv <= 0:
        return None
    delta_pct = abs((u_kv - u_nom_kv) / u_nom_kv) * 100.0
    if delta_pct >= 10.0:
        return "FAIL"
    if delta_pct >= 5.0:
        return "WARNING"
    return "PASS"


def _build_ev_node_status_map(
    ev_view: EnergyValidationView | None,
) -> dict[str, str]:
    """Extract worst EV status per node from voltage deviation items."""
    if ev_view is None:
        return {}
    result: dict[str, str] = {}
    for item in ev_view.items:
        if item.check_type == EnergyCheckType.VOLTAGE_DEVIATION:
            existing = result.get(item.target_id)
            new_status = item.status.value
            if existing is None or _status_priority(new_status) < _status_priority(existing):
                result[item.target_id] = new_status
    return result


def _build_ev_branch_status_map(
    ev_view: EnergyValidationView | None,
) -> dict[str, str]:
    """Extract worst EV status per branch from loading items."""
    if ev_view is None:
        return {}
    result: dict[str, str] = {}
    for item in ev_view.items:
        if item.check_type in {
            EnergyCheckType.BRANCH_LOADING,
            EnergyCheckType.TRANSFORMER_LOADING,
        }:
            existing = result.get(item.target_id)
            new_status = item.status.value
            if existing is None or _status_priority(new_status) < _status_priority(existing):
                result[item.target_id] = new_status
    return result


_STATUS_PRIORITY = {
    "FAIL": 0,
    "WARNING": 1,
    "NOT_COMPUTED": 2,
    "PASS": 3,
}


def _status_priority(status: str) -> int:
    return _STATUS_PRIORITY.get(status, 4)
