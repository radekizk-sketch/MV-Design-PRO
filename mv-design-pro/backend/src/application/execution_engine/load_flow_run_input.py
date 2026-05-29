"""Canonical Load Flow run input for ExecutionEngineService.

This contract captures full network topology, injections and solver options,
with deterministic canonical hashing.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_inverter import (
    InverterControl,
    inverter_control_from_params,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    SlackSpec,
)
from network_model.solvers.power_flow_zip import ZipCoeffs


def _build_inverter_control(
    params: dict[str, Any] | None, base_mva: float
) -> InverterControl | None:
    """ADR-011 §5b: build the U/f-control from raw params on base_mva.

    Reads sn_mva from the params dict when present. None => constant-PQ source."""
    if not params:
        return None
    return inverter_control_from_params(params, base_mva, params.get("sn_mva"))


@dataclass(frozen=True)
class LoadFlowNodeInput:
    node_id: str
    node_type: str
    voltage_level_kv: float


@dataclass(frozen=True)
class LoadFlowBranchInput:
    branch_id: str
    from_node_id: str
    to_node_id: str
    r_ohm_per_km: float
    x_ohm_per_km: float
    b_us_per_km: float
    length_km: float
    in_service: bool = True


@dataclass(frozen=True)
class LoadFlowLoadInput:
    node_id: str
    p_mw: float
    q_mvar: float
    # ADR-011 (Z-ZIP-04): optional voltage-/frequency-dependent (ZIP) load
    # coefficients. None => classic constant-power PQ (reduce-to-NR).
    zip_coeffs: ZipCoeffs | None = None
    # ADR-011 §5b: optional inverter/converter U/f-control params (the keys read
    # by inverter_control_from_params). None => constant-PQ source; the typed
    # InverterControl is built in to_power_flow_input using base_mva.
    inverter_control_params: dict[str, Any] | None = None


@dataclass(frozen=True)
class LoadFlowGeneratorInput:
    node_id: str
    p_mw: float
    u_pu: float
    q_min_mvar: float
    q_max_mvar: float


@dataclass(frozen=True)
class LoadFlowRunInput:
    base_mva: float
    slack_node_id: str
    slack_u_pu: float
    slack_angle_rad: float
    nodes: tuple[LoadFlowNodeInput, ...]
    branches: tuple[LoadFlowBranchInput, ...]
    loads: tuple[LoadFlowLoadInput, ...]
    generators: tuple[LoadFlowGeneratorInput, ...] = ()
    options: PowerFlowOptions = field(default_factory=PowerFlowOptions)

    def canonical_dict(self) -> dict[str, Any]:
        raw = {
            "base_mva": self.base_mva,
            "slack_node_id": self.slack_node_id,
            "slack_u_pu": self.slack_u_pu,
            "slack_angle_rad": self.slack_angle_rad,
            "options": {
                "tolerance": self.options.tolerance,
                "max_iter": self.options.max_iter,
                "damping": self.options.damping,
                "flat_start": self.options.flat_start,
                "validate": self.options.validate,
                "trace_level": self.options.trace_level,
            },
            "nodes": [
                {
                    "node_id": n.node_id,
                    "node_type": n.node_type,
                    "voltage_level_kv": n.voltage_level_kv,
                }
                for n in self.nodes
            ],
            "branches": [
                {
                    "branch_id": b.branch_id,
                    "from_node_id": b.from_node_id,
                    "to_node_id": b.to_node_id,
                    "r_ohm_per_km": b.r_ohm_per_km,
                    "x_ohm_per_km": b.x_ohm_per_km,
                    "b_us_per_km": b.b_us_per_km,
                    "length_km": b.length_km,
                    "in_service": b.in_service,
                }
                for b in self.branches
            ],
            "loads": [
                {
                    "node_id": ld.node_id,
                    "p_mw": ld.p_mw,
                    "q_mvar": ld.q_mvar,
                    # ADR-011: only emit ZIP when present so constant-power
                    # loads keep their existing canonical hash byte-identical.
                    **(
                        {"zip_coeffs": dataclasses.asdict(ld.zip_coeffs)}
                        if ld.zip_coeffs is not None
                        else {}
                    ),
                    # ADR-011 §5b: only emit inverter control when present so
                    # constant-PQ sources keep their canonical hash unchanged.
                    **(
                        {"inverter_control": ld.inverter_control_params}
                        if ld.inverter_control_params
                        else {}
                    ),
                }
                for ld in self.loads
            ],
            "generators": [
                {
                    "node_id": g.node_id,
                    "p_mw": g.p_mw,
                    "u_pu": g.u_pu,
                    "q_min_mvar": g.q_min_mvar,
                    "q_max_mvar": g.q_max_mvar,
                }
                for g in self.generators
            ],
        }
        return {
            **raw,
            "nodes": sorted(raw["nodes"], key=lambda x: x["node_id"]),
            "branches": sorted(raw["branches"], key=lambda x: x["branch_id"]),
            "loads": sorted(raw["loads"], key=lambda x: x["node_id"]),
            "generators": sorted(raw["generators"], key=lambda x: x["node_id"]),
        }

    def canonical_hash(self) -> str:
        payload = json.dumps(self.canonical_dict(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def to_power_flow_input(self) -> PowerFlowInput:
        graph = NetworkGraph()
        for node in sorted(self.nodes, key=lambda n: n.node_id):
            n_type = NodeType(node.node_type)
            graph.add_node(
                Node(
                    id=node.node_id,
                    name=node.node_id,
                    node_type=n_type,
                    voltage_level=node.voltage_level_kv,
                    voltage_magnitude=1.0,
                    voltage_angle=0.0,
                    active_power=0.0,
                    reactive_power=0.0,
                )
            )

        for branch in sorted(self.branches, key=lambda b: b.branch_id):
            graph.add_branch(
                LineBranch(
                    id=branch.branch_id,
                    name=branch.branch_id,
                    branch_type=BranchType.LINE,
                    from_node_id=branch.from_node_id,
                    to_node_id=branch.to_node_id,
                    in_service=branch.in_service,
                    r_ohm_per_km=branch.r_ohm_per_km,
                    x_ohm_per_km=branch.x_ohm_per_km,
                    b_us_per_km=branch.b_us_per_km,
                    length_km=branch.length_km,
                )
            )

        return PowerFlowInput(
            graph=graph,
            base_mva=self.base_mva,
            slack=SlackSpec(
                node_id=self.slack_node_id,
                u_pu=self.slack_u_pu,
                angle_rad=self.slack_angle_rad,
            ),
            pq=[
                PQSpec(
                    node_id=x.node_id,
                    p_mw=x.p_mw,
                    q_mvar=x.q_mvar,
                    zip_coeffs=x.zip_coeffs,
                    # ADR-011 §5b: build the U/f-control on base_mva (None =>
                    # constant-PQ source, reduce-to-NR).
                    inverter_control=_build_inverter_control(
                        x.inverter_control_params, self.base_mva
                    ),
                )
                for x in self.loads
            ],
            pv=[
                PVSpec(
                    node_id=g.node_id,
                    p_mw=g.p_mw,
                    u_pu=g.u_pu,
                    q_min_mvar=g.q_min_mvar,
                    q_max_mvar=g.q_max_mvar,
                )
                for g in self.generators
            ],
            options=self.options,
        )
