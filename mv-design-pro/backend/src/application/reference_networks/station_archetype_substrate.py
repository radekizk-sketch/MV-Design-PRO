"""Build per-archetype SN/nN station substrates and emit solver-true companions.

This script is the PROVENANCE for the numeric values the station-rozdzielnia v2
renderer displays (nN load power, PV generation, power-flow DIRECTION and
energisation). For each archetype it assembles a minimal substrate as a frozen
``PowerFlowInput`` — GPZ slack -> SN line(s) -> SN busbar -> (transformer -> nN
bus -> nN loads + optional PV) — and runs the FROZEN power-flow solver
(``solve_power_flow_physics``). The resulting per-branch directions and energised
sets are serialised into the ``sld_power_flow_companion_v1`` shape the frontend
parser (``SldPowerFlowCompanion``) reads verbatim.

READ-ONLY w.r.t. the frozen core (B-01): like
``application.reference_networks.frozen_solver_input``, this only constructs the
``PowerFlowInput`` and reads the solution — it never modifies any solver.

Branch refs are CANONICAL and shared 1:1 with the frontend archetype builder
(``frontend/src/ui/sld/v2/station-rozdzielnia/archetypes.ts``), so the renderer
joins each field to its solver flow by ref. Keep the two ref schemes in sync.

Voltage / per-unit note: the substrate is solved on a SINGLE per-unit base (the
SN level), exactly as the committed CIGRE-LV and IEEE reference builders do. The
SN/nN transformer is modelled as a low-impedance ``LineBranch`` so the solver
carries real power across the transformation boundary; the magnitudes the
renderer shows are the solver's branch active power, not a recomputation.

Run ``python -m
src.application.reference_networks.station_archetype_substrate --write`` to
(re)generate the companion TS module the frontend imports. Without ``--write`` it
prints the companions as JSON to stdout.
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Literal

from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_newton import (
    PowerFlowNewtonSolution,
    solve_power_flow_physics,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
    ShortCircuitResult,
)

_BASE_MVA = 100.0
_BASE_KV = 15.0
_TOLERANCE = 1e-8
_MAX_ITER = 30
# Active-power magnitude (MVA) below which a branch flow has no direction. 1e-3
# MVA = 1 kW — above solver round-off, below the smallest station load.
_FLOW_EPS_MVA = 1.0e-3

FlowDirection = Literal["forward", "reverse", "none"]

# Substrate impedances (ohm at the SN base). Lines carry a modest series Z; the
# SN/nN transformer is a low-Z line so the solver carries power across it. These
# are substrate inputs, not physics — the solver computes every flow.
_SN_LINE_R = 0.45
_SN_LINE_X = 0.90
_TRAFO_R = 0.05
_TRAFO_X = 0.60
_NN_FEEDER_R = 0.02
_NN_FEEDER_X = 0.04


def _line(branch_id: str, from_id: str, to_id: str, r: float, x: float) -> LineBranch:
    return LineBranch(
        id=branch_id,
        name=branch_id,
        branch_type=BranchType.LINE,
        from_node_id=from_id,
        to_node_id=to_id,
        r_ohm_per_km=r,
        x_ohm_per_km=x,
        length_km=1.0,
        rated_current_a=630.0,
    )


def _pq_node(node_id: str, voltage_kv: float = _BASE_KV) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.PQ,
        voltage_level=voltage_kv,
        active_power=0.0,
        reactive_power=0.0,
    )


def _slack_node(node_id: str) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.SLACK,
        voltage_level=_BASE_KV,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )


class _Substrate:
    """A minimal solver substrate: nodes, line branches, PQ/slack specs."""

    def __init__(self) -> None:
        self.graph = NetworkGraph(network_model_id="station-archetype")
        self.pq: list[PQSpec] = []
        self.slack_id: str | None = None
        self._open_branches: list[str] = []

    def add_slack(self, node_id: str) -> None:
        self.graph.add_node(_slack_node(node_id))
        self.slack_id = node_id

    def add_bus(self, node_id: str, voltage_kv: float = _BASE_KV) -> None:
        self.graph.add_node(_pq_node(node_id, voltage_kv))

    def add_load(self, node_id: str, p_mw: float, q_mvar: float) -> None:
        self.pq.append(PQSpec(node_id=node_id, p_mw=p_mw, q_mvar=q_mvar))

    def add_pv(self, node_id: str, p_inject_mw: float) -> None:
        # Frozen convention: PQSpec.p_mw is CONSUMPTION -> an injection is negative.
        self.pq.append(PQSpec(node_id=node_id, p_mw=-p_inject_mw, q_mvar=0.0))

    def add_line(
        self, branch_id: str, a: str, b: str, r: float, x: float, *, closed: bool = True
    ) -> None:
        line = _line(branch_id, a, b, r, x)
        if not closed:
            line.in_service = False
            self._open_branches.append(branch_id)
        self.graph.add_branch(line)

    def add_transformer(
        self,
        branch_id: str,
        hv: str,
        lv: str,
        *,
        hv_kv: float,
        lv_kv: float,
        uk_percent: float,
        rated_mva: float,
    ) -> None:
        """A real SN/nN TransformerBranch — so the SC solver steps voltage and the
        nN busbar carries a physically correct Ik'' (transformer-dominated)."""
        self.graph.add_branch(
            TransformerBranch(
                id=branch_id,
                name=branch_id,
                branch_type=BranchType.TRANSFORMER,
                from_node_id=hv,
                to_node_id=lv,
                voltage_hv_kv=hv_kv,
                voltage_lv_kv=lv_kv,
                uk_percent=uk_percent,
                rated_power_mva=rated_mva,
            )
        )

    def finalize_pq(self) -> None:
        """Every island bus that is neither slack nor already a PQ spec must
        appear as a zero-injection PQ bus, else the solver leaves it at flat
        start (mirrors frozen_solver_input)."""
        listed = {s.node_id for s in self.pq}
        if self.slack_id:
            listed.add(self.slack_id)
        for node_id in sorted(self.graph.nodes):
            if node_id not in listed:
                self.pq.append(PQSpec(node_id=node_id, p_mw=0.0, q_mvar=0.0))

    @property
    def open_branches(self) -> list[str]:
        return list(self._open_branches)

    def to_input(self) -> PowerFlowInput:
        assert self.slack_id is not None, "substrate has no slack node"
        return PowerFlowInput(
            graph=self.graph,
            base_mva=_BASE_MVA,
            slack=SlackSpec(node_id=self.slack_id, u_pu=1.0, angle_rad=0.0),
            pq=list(self.pq),
            options=PowerFlowOptions(
                tolerance=_TOLERANCE,
                max_iter=_MAX_ITER,
                trace_level="basic",
                validate=False,
            ),
        )


def _flow_direction(p_from_mva: float) -> FlowDirection:
    if p_from_mva > _FLOW_EPS_MVA:
        return "forward"
    if p_from_mva < -_FLOW_EPS_MVA:
        return "reverse"
    return "none"


def _companion_from_solution(
    archetype: str,
    substrate: _Substrate,
    solution: PowerFlowNewtonSolution,
) -> dict[str, Any]:
    island = set(solution.slack_island_nodes)
    energized_bus_refs = sorted(n for n in substrate.graph.nodes if n in island)
    de_energized_bus_refs = sorted(n for n in substrate.graph.nodes if n not in island)

    branch_flow: dict[str, dict[str, Any]] = {}
    energized_branch_refs: list[str] = []
    for branch_id in sorted(substrate.graph.branches):
        s_from = solution.branch_s_from.get(branch_id)
        if s_from is None:
            branch_flow[branch_id] = {"direction": "none", "p_from_mw": 0.0}
            continue
        p_from_mw = round(float(s_from.real) * _BASE_MVA, 3)
        branch_flow[branch_id] = {
            "direction": _flow_direction(p_from_mw),
            "p_from_mw": p_from_mw,
        }
        energized_branch_refs.append(branch_id)

    return {
        "schema": "sld_power_flow_companion_v1",
        "case_ref": f"case/station/{archetype}",
        "case_label": f"Stan podstawowy — {archetype}",
        "solver_method": str(getattr(solution, "solver_method", "newton-raphson")),
        "converged": bool(solution.converged),
        "iterations": int(solution.iterations),
        "base_mva": _BASE_MVA,
        "enm_hash": f"station-substrate/{archetype}",
        "branch_flow": dict(sorted(branch_flow.items())),
        "energized_branch_refs": sorted(energized_branch_refs),
        "energized_bus_refs": energized_bus_refs,
        "de_energized_bus_refs": de_energized_bus_refs,
        "open_point_branch_refs": sorted(substrate.open_branches),
    }


# ---------------------------------------------------------------------------
# Short-circuit companion (per busbar, IEC 60909) — gate E.
# ---------------------------------------------------------------------------
# IEC 60909 voltage factors c: max=1.10 (Ik''max → equipment withstand), min=0.95
# (Ik''min → protection sensitivity). tk = 1.0 s (Ith reference duration).
_C_MAX = 1.10
_C_MIN = 0.95
_TK_S = 1.0


def _json_safe(value: Any) -> Any:
    """Recursively convert solver trace values to JSON-ready types (complex →
    {re, im}, numpy scalars → native). The White Box trace is carried verbatim
    except for this lossless type normalisation."""
    if isinstance(value, complex):
        return {"re": float(value.real), "im": float(value.imag)}
    if hasattr(value, "item"):  # numpy scalar
        return value.item()
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list | tuple)):
        return [_json_safe(v) for v in value]
    return value


def _sc_one(graph: NetworkGraph, bus_id: str, c_factor: float) -> ShortCircuitResult:
    """Run the FROZEN IEC 60909 3-phase SC solver at one busbar (READ-ONLY)."""
    return ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id=bus_id,
        c_factor=c_factor,
        tk_s=_TK_S,
    )


def _sc_bus_entry(
    graph: NetworkGraph, bus_id: str, un_kv: float, icw_ka: float
) -> dict[str, Any]:
    """Ik''max/min + ip/ib/ith/kappa + Sk + Icw verification at one busbar, with the
    solver's White Box trace carried verbatim (interpretation, not recomputation)."""
    rmax = _sc_one(graph, bus_id, _C_MAX)
    rmin = _sc_one(graph, bus_id, _C_MIN)
    ikss_max_ka = round(rmax.ikss_a / 1000.0, 3)
    ikss_min_ka = round(rmin.ikss_a / 1000.0, 3)
    return {
        "bus_ref": bus_id,
        "un_kv": un_kv,
        "icw_ka": icw_ka,
        # Ik''max branch (c=1.10): equipment-withstand verification.
        "max": {
            "case_ref": "ZWARCIOWY_MAKS",
            "c_factor": _C_MAX,
            "ikss_ka": ikss_max_ka,
            "ip_ka": round(rmax.ip_a / 1000.0, 3),
            "ib_ka": round(rmax.ib_a / 1000.0, 3),
            "ith_ka": round(rmax.ith_a / 1000.0, 3),
            "kappa": round(rmax.kappa, 3),
            "sk_mva": round(rmax.sk_mva, 2),
            "rx_ratio": round(rmax.rx_ratio, 4),
            "white_box_trace": _json_safe(rmax.white_box_trace),
        },
        # Ik''min branch (c=0.95): protection-sensitivity reference.
        "min": {
            "case_ref": "ZWARCIOWY_MIN",
            "c_factor": _C_MIN,
            "ikss_ka": ikss_min_ka,
            "ith_ka": round(rmin.ith_a / 1000.0, 3),
            "kappa": round(rmin.kappa, 3),
            "sk_mva": round(rmin.sk_mva, 2),
            "white_box_trace": _json_safe(rmin.white_box_trace),
        },
        # Verification: Ik''max ≤ Icw (rozdzielnia withstand).
        "verification": {
            "rule": "ikss_max_le_icw",
            "ikss_max_ka": ikss_max_ka,
            "icw_ka": icw_ka,
            "passed": bool(ikss_max_ka <= icw_ka),
        },
    }


def build_short_circuit_companion(
    archetype: str, graph: NetworkGraph, buses: list[tuple[str, float, float]]
) -> dict[str, Any]:
    """SC companion for one archetype: every (bus_id, un_kv, icw_ka) carries its
    IEC 60909 Ik''max/min + ip/ib/ith + Icw verification + White Box trace."""
    return {
        "schema": "sld_short_circuit_companion_v1",
        "enm_hash": f"station-substrate/{archetype}",
        "standard": "IEC 60909",
        "solver_method": "iec60909-3ph",
        "tk_s": _TK_S,
        "buses": {
            bus_id: _sc_bus_entry(graph, bus_id, un_kv, icw_ka)
            for bus_id, un_kv, icw_ka in buses
        },
    }


# ---------------------------------------------------------------------------
# Canonical branch refs (must match frontend archetypes.ts BR map).
# ---------------------------------------------------------------------------
SR_IN = "sr/branch/in"
SR_OUT = "sr/branch/out"
SR_OUT_B = "sr/branch/out-b"
SR_TR = "sr/branch/tr"
SR_NN_F1 = "sr/branch/nn-f1"
SR_NN_F2 = "sr/branch/nn-f2"
SR_NN_PV = "sr/branch/nn-pv"
SR_MAIN_OUT = "sr/branch/main-out"
SR_BRANCH = "sr/branch/branch"
SR_COUPLER = "sr/branch/coupler"
SR_LINE_B = "sr/branch/line-b"


def build_t1() -> _Substrate:
    """T1 przelotowa: GPZ -> SN bus -> LINIA_OUT + (TR -> nN bus -> 2 feeders + PV)."""
    s = _Substrate()
    s.add_slack("GPZ")
    for b in ("SN_BUS", "LINE_OUT_END", "NN_BUS", "NN_F1", "NN_F2", "NN_PV"):
        s.add_bus(b)
    s.add_line(SR_IN, "GPZ", "SN_BUS", _SN_LINE_R, _SN_LINE_X)
    s.add_line(SR_OUT, "SN_BUS", "LINE_OUT_END", _SN_LINE_R, _SN_LINE_X)
    s.add_line(SR_TR, "SN_BUS", "NN_BUS", _TRAFO_R, _TRAFO_X)
    s.add_line(SR_NN_F1, "NN_BUS", "NN_F1", _NN_FEEDER_R, _NN_FEEDER_X)
    s.add_line(SR_NN_F2, "NN_BUS", "NN_F2", _NN_FEEDER_R, _NN_FEEDER_X)
    s.add_line(SR_NN_PV, "NN_BUS", "NN_PV", _NN_FEEDER_R, _NN_FEEDER_X)
    s.add_load("LINE_OUT_END", p_mw=0.82, q_mvar=0.25)
    s.add_load("NN_F1", p_mw=0.26, q_mvar=0.085)
    s.add_load("NN_F2", p_mw=0.18, q_mvar=0.06)
    s.add_pv("NN_PV", p_inject_mw=0.15)
    s.finalize_pq()
    return s


def build_t2() -> _Substrate:
    """T2 końcowa: GPZ -> SN bus -> (TR -> nN bus -> 2 feeders + PV). No LINIA_OUT."""
    s = _Substrate()
    s.add_slack("GPZ")
    for b in ("SN_BUS", "NN_BUS", "NN_F1", "NN_F2", "NN_PV"):
        s.add_bus(b)
    s.add_line(SR_IN, "GPZ", "SN_BUS", _SN_LINE_R, _SN_LINE_X)
    s.add_line(SR_TR, "SN_BUS", "NN_BUS", _TRAFO_R, _TRAFO_X)
    s.add_line(SR_NN_F1, "NN_BUS", "NN_F1", _NN_FEEDER_R, _NN_FEEDER_X)
    s.add_line(SR_NN_F2, "NN_BUS", "NN_F2", _NN_FEEDER_R, _NN_FEEDER_X)
    s.add_line(SR_NN_PV, "NN_BUS", "NN_PV", _NN_FEEDER_R, _NN_FEEDER_X)
    s.add_load("NN_F1", p_mw=0.21, q_mvar=0.07)
    s.add_load("NN_F2", p_mw=0.14, q_mvar=0.045)
    s.add_pv("NN_PV", p_inject_mw=0.12)
    s.finalize_pq()
    return s


def build_t3() -> _Substrate:
    """T3 ZKSN: cable junction MAIN_IN/MAIN_OUT/BRANCH. No transformer/nN."""
    s = _Substrate()
    s.add_slack("GPZ")
    for b in ("ZKSN", "MAIN_OUT_END", "BRANCH_END"):
        s.add_bus(b)
    s.add_line(SR_IN, "GPZ", "ZKSN", _SN_LINE_R, _SN_LINE_X)
    s.add_line(SR_MAIN_OUT, "ZKSN", "MAIN_OUT_END", _SN_LINE_R, _SN_LINE_X)
    s.add_line(SR_BRANCH, "ZKSN", "BRANCH_END", _SN_LINE_R, _SN_LINE_X)
    s.add_load("MAIN_OUT_END", p_mw=0.47, q_mvar=0.15)
    s.add_load("BRANCH_END", p_mw=0.32, q_mvar=0.10)
    s.finalize_pq()
    return s


def build_t4() -> _Substrate:
    """T4 sekcyjna: two sections fed independently, coupler normally OPEN.

    The coupler branch is in_service=False so each section is energised from its
    own line and the coupler carries no power — the NOP state the renderer shows.
    """
    s = _Substrate()
    s.add_slack("GPZ_A")
    for b in ("SEC_A", "SEC_B", "LOAD_A", "LOAD_B"):
        s.add_bus(b)
    s.add_line(SR_IN, "GPZ_A", "SEC_A", _SN_LINE_R, _SN_LINE_X)
    s.add_line(SR_OUT, "SEC_A", "LOAD_A", _SN_LINE_R, _SN_LINE_X)
    s.add_line(SR_COUPLER, "SEC_A", "SEC_B", _TRAFO_R, _TRAFO_X, closed=False)
    s.add_line(SR_LINE_B, "GPZ_A", "SEC_B", _SN_LINE_R, _SN_LINE_X)
    s.add_line(SR_OUT_B, "SEC_B", "LOAD_B", _SN_LINE_R, _SN_LINE_X)
    s.add_load("LOAD_A", p_mw=0.67, q_mvar=0.21)
    s.add_load("LOAD_B", p_mw=0.61, q_mvar=0.19)
    s.finalize_pq()
    return s


_ARCHETYPES = {
    "T1": build_t1,
    "T2": build_t2,
    "T3": build_t3,
    "T4": build_t4,
}


def build_companion(archetype: str) -> dict[str, Any]:
    substrate = _ARCHETYPES[archetype]()
    solution = solve_power_flow_physics(substrate.to_input())
    return _companion_from_solution(archetype, substrate, solution)


def build_all() -> dict[str, dict[str, Any]]:
    return {name: build_companion(name) for name in _ARCHETYPES}


# ---------------------------------------------------------------------------
# Short-circuit graphs (gate E) — a SEPARATE two-voltage graph per archetype with
# a REAL SN/nN TransformerBranch, so the nN busbar carries a physically correct
# Ik''. The power-flow substrate (single-base, transformer-as-line) is unchanged,
# so the accepted nN power-flow values are preserved. SC is READ-ONLY (B-01).
# ---------------------------------------------------------------------------
# Rozdzielnica withstand (Icw) per the ABB UniSwitch data: 25 kA SN. nN board
# typically 20–25 kA; use 25 kA nN board rating for the verification headroom.
_ICW_SN_KA = 25.0
_ICW_NN_KA = 25.0
_NN_KV = 0.4
_TRAFO_UK_PCT = 6.0
_TRAFO_MVA = 0.63


def _sc_graph_sn_nn(*, with_line_out: bool) -> NetworkGraph:
    """SN busbar fed from GPZ via a line; nN busbar behind a real transformer."""
    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("SN_BUS", _BASE_KV)
    s.add_bus("NN_BUS", _NN_KV)
    s.add_line(SR_IN, "GPZ", "SN_BUS", _SN_LINE_R, _SN_LINE_X)
    if with_line_out:
        s.add_bus("LINE_OUT_END", _BASE_KV)
        s.add_line(SR_OUT, "SN_BUS", "LINE_OUT_END", _SN_LINE_R, _SN_LINE_X)
    s.add_transformer(
        SR_TR, "SN_BUS", "NN_BUS",
        hv_kv=_BASE_KV, lv_kv=_NN_KV, uk_percent=_TRAFO_UK_PCT, rated_mva=_TRAFO_MVA,
    )
    return s.graph


def _sc_graph_t3() -> NetworkGraph:
    """ZKSN: SN cable junction only (no transformer/nN)."""
    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("ZKSN", _BASE_KV)
    s.add_line(SR_IN, "GPZ", "ZKSN", _SN_LINE_R, _SN_LINE_X)
    return s.graph


def _sc_graph_t4() -> NetworkGraph:
    """Sectioned bus: two SN sections fed independently (coupler open)."""
    s = _Substrate()
    s.add_slack("GPZ_A")
    s.add_bus("SEC_A", _BASE_KV)
    s.add_bus("SEC_B", _BASE_KV)
    s.add_line(SR_IN, "GPZ_A", "SEC_A", _SN_LINE_R, _SN_LINE_X)
    s.add_line(SR_LINE_B, "GPZ_A", "SEC_B", _SN_LINE_R, _SN_LINE_X)
    return s.graph


def _sc_spec(archetype: str) -> tuple[NetworkGraph, list[tuple[str, float, float]]]:
    """(graph, [(bus_id, un_kv, icw_ka)]) — the busbars that must carry SC at L2."""
    if archetype in ("T1", "T2"):
        graph = _sc_graph_sn_nn(with_line_out=(archetype == "T1"))
        return graph, [
            ("SN_BUS", _BASE_KV, _ICW_SN_KA),
            ("NN_BUS", _NN_KV, _ICW_NN_KA),
        ]
    if archetype == "T3":
        return _sc_graph_t3(), [("ZKSN", _BASE_KV, _ICW_SN_KA)]
    # T4 — two independently-energised SN sections.
    return _sc_graph_t4(), [
        ("SEC_A", _BASE_KV, _ICW_SN_KA),
        ("SEC_B", _BASE_KV, _ICW_SN_KA),
    ]


def build_sc_companion(archetype: str) -> dict[str, Any]:
    graph, buses = _sc_spec(archetype)
    return build_short_circuit_companion(archetype, graph, buses)


def build_all_sc() -> dict[str, dict[str, Any]]:
    return {name: build_sc_companion(name) for name in _ARCHETYPES}


# ---------------------------------------------------------------------------
# Voltage + power-flow companion (gate F) — bus U + branch I/P/Q/S from the
# FROZEN Newton-Raphson solver (READ-ONLY). Run on the SAME two-voltage graph
# as the SC dossier (real TransformerBranch), so the nN busbar voltage is
# physically correct (not the single-base power-flow substrate).
# ---------------------------------------------------------------------------
# Loadflow case (declared state the solution belongs to).
_LF_CASE_REF = "ROZPLYW_MAX_OBC"


def _vf_graph_and_pq(
    archetype: str,
) -> tuple[NetworkGraph, str, list[PQSpec], list[tuple[str, float]]]:
    """(graph, slack_id, pq, [(bus_id, un_kv)]) — a two-voltage loadflow substrate
    with a REAL transformer so bus voltages (incl. nN 400 V) are physical."""
    s = _Substrate()
    if archetype in ("T1", "T2"):
        s.add_slack("GPZ")
        s.add_bus("SN_BUS", _BASE_KV)
        s.add_bus("NN_BUS", _NN_KV)
        s.add_line(SR_IN, "GPZ", "SN_BUS", _SN_LINE_R, _SN_LINE_X)
        s.add_transformer(
            SR_TR, "SN_BUS", "NN_BUS",
            hv_kv=_BASE_KV, lv_kv=_NN_KV, uk_percent=_TRAFO_UK_PCT, rated_mva=_TRAFO_MVA,
        )
        s.add_load("NN_BUS", p_mw=0.44 if archetype == "T1" else 0.35, q_mvar=0.14)
        if archetype == "T1":
            s.add_bus("LINE_OUT_END", _BASE_KV)
            s.add_line(SR_OUT, "SN_BUS", "LINE_OUT_END", _SN_LINE_R, _SN_LINE_X)
            s.add_load("LINE_OUT_END", p_mw=0.82, q_mvar=0.25)
        buses = [("SN_BUS", _BASE_KV), ("NN_BUS", _NN_KV)]
    elif archetype == "T3":
        s.add_slack("GPZ")
        s.add_bus("ZKSN", _BASE_KV)
        s.add_bus("MAIN_OUT_END", _BASE_KV)
        s.add_bus("BRANCH_END", _BASE_KV)
        s.add_line(SR_IN, "GPZ", "ZKSN", _SN_LINE_R, _SN_LINE_X)
        s.add_line(SR_MAIN_OUT, "ZKSN", "MAIN_OUT_END", _SN_LINE_R, _SN_LINE_X)
        s.add_line(SR_BRANCH, "ZKSN", "BRANCH_END", _SN_LINE_R, _SN_LINE_X)
        s.add_load("MAIN_OUT_END", p_mw=0.47, q_mvar=0.15)
        s.add_load("BRANCH_END", p_mw=0.32, q_mvar=0.10)
        buses = [("ZKSN", _BASE_KV)]
    else:  # T4 — two sections fed independently (coupler open), each with a load feeder.
        s.add_slack("GPZ_A")
        s.add_bus("SEC_A", _BASE_KV)
        s.add_bus("SEC_B", _BASE_KV)
        s.add_bus("LOAD_A", _BASE_KV)
        s.add_bus("LOAD_B", _BASE_KV)
        s.add_line(SR_IN, "GPZ_A", "SEC_A", _SN_LINE_R, _SN_LINE_X)
        s.add_line(SR_LINE_B, "GPZ_A", "SEC_B", _SN_LINE_R, _SN_LINE_X)
        s.add_line(SR_OUT, "SEC_A", "LOAD_A", _SN_LINE_R, _SN_LINE_X)
        s.add_line(SR_OUT_B, "SEC_B", "LOAD_B", _SN_LINE_R, _SN_LINE_X)
        s.add_load("LOAD_A", p_mw=0.67, q_mvar=0.21)
        s.add_load("LOAD_B", p_mw=0.61, q_mvar=0.19)
        buses = [("SEC_A", _BASE_KV), ("SEC_B", _BASE_KV)]
    s.finalize_pq()
    assert s.slack_id is not None
    return s.graph, s.slack_id, list(s.pq), buses


def build_voltage_flow_companion(archetype: str) -> dict[str, Any]:
    graph, slack_id, pq, buses = _vf_graph_and_pq(archetype)
    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=_BASE_MVA,
        slack=SlackSpec(node_id=slack_id, u_pu=1.0, angle_rad=0.0),
        pq=pq,
        options=PowerFlowOptions(
            tolerance=_TOLERANCE, max_iter=_MAX_ITER, trace_level="basic", validate=False
        ),
    )
    sol = solve_power_flow_physics(pf_input)

    bus_entries: dict[str, dict[str, Any]] = {}
    for bus_id, un_kv in buses:
        u_pu = float(sol.node_u_mag.get(bus_id, 0.0))
        u_kv = round(u_pu * un_kv, 4)
        bus_entries[bus_id] = {
            "bus_ref": bus_id,
            "un_kv": un_kv,
            "u_kv": u_kv,
            "u_pu": round(u_pu, 5),
            "u_percent": round(u_pu * 100.0, 3),
            "deviation_percent": round((u_pu - 1.0) * 100.0, 3),
            "angle_deg": round(float(sol.node_angle.get(bus_id, 0.0)) * 180.0 / 3.141592653589793, 3),
        }

    branch_entries: dict[str, dict[str, Any]] = {}
    for branch_id in sorted(graph.branches):
        s_from = sol.branch_s_from_mva.get(branch_id)
        i_ka = float(sol.branch_current_ka.get(branch_id, 0.0))
        branch = graph.branches[branch_id]
        rated_a = float(getattr(branch, "rated_current_a", 0.0) or 0.0)
        loading_pct = round((i_ka * 1000.0 / rated_a) * 100.0, 2) if rated_a > 0 else None
        p_mw = round(float(s_from.real), 4) if s_from is not None else 0.0
        q_mvar = round(float(s_from.imag), 4) if s_from is not None else 0.0
        s_mva = round((p_mw**2 + q_mvar**2) ** 0.5, 4)
        branch_entries[branch_id] = {
            "branch_ref": branch_id,
            "i_a": round(i_ka * 1000.0, 2),
            "p_mw": p_mw,
            "q_mvar": q_mvar,
            "s_mva": s_mva,
            "direction": _flow_direction(p_mw),
            "loading_percent": loading_pct,
        }

    return {
        "schema": "sld_voltage_flow_companion_v1",
        "enm_hash": f"station-substrate/{archetype}",
        "solver_method": str(getattr(sol, "solver_method", "newton-raphson")),
        "case_ref": _LF_CASE_REF,
        "converged": bool(sol.converged),
        "iterations": int(sol.iterations),
        "base_mva": _BASE_MVA,
        # White Box: the NR iteration trace (formula → mismatch → update → result).
        "white_box_steps": len(sol.nr_trace),
        "buses": dict(sorted(bus_entries.items())),
        "branches": dict(sorted(branch_entries.items())),
    }


def build_all_vf() -> dict[str, dict[str, Any]]:
    return {name: build_voltage_flow_companion(name) for name in _ARCHETYPES}


def _companions_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", "..", "..", ".."))
    # The companions are imported by the frontend archetype builder (single
    # location — no duplicate public/ copy => no second truth).
    return os.path.join(
        repo, "frontend", "src", "ui", "sld", "v2", "station-rozdzielnia", "companions"
    )


_TS_HEADER = """\
/**
 * GENERATED — DO NOT EDIT BY HAND.
 *
 * Per-archetype frozen-solver power-flow companions for the station-rozdzielnia
 * v2 renderer. Produced by running the FROZEN power-flow solver
 * (`solve_power_flow_physics`) on the per-archetype substrate in
 * `backend/src/application/reference_networks/station_archetype_substrate.py`
 * (READ-ONLY w.r.t. the solver, B-01). Regenerate with:
 *
 *   cd mv-design-pro/backend && poetry run python -m \\
 *     application.reference_networks.station_archetype_substrate --write
 *
 * The renderer reads nN load power, PV generation, power-flow DIRECTION and
 * energisation from THESE values (one truth) — never recomputed in the renderer.
 */
import type { SldPowerFlowCompanion } from '../../canvas/SldPowerFlowCompanion';
import type { StationArchetype } from '../contract';

export const STATION_ARCHETYPE_COMPANIONS: Readonly<
  Record<StationArchetype, SldPowerFlowCompanion>
> = """


_TS_SC_HEADER = """\
/**
 * GENERATED — DO NOT EDIT BY HAND.
 *
 * Per-archetype, per-busbar IEC 60909 SHORT-CIRCUIT companions (gate E). Produced
 * by running the FROZEN ShortCircuitIEC60909Solver on a two-voltage substrate
 * (real SN/nN TransformerBranch) in
 * `backend/src/application/reference_networks/station_archetype_substrate.py`
 * (READ-ONLY w.r.t. the solver, B-01). Regenerate with:
 *
 *   cd mv-design-pro/backend && poetry run python -m \\
 *     application.reference_networks.station_archetype_substrate --write
 *
 * Every SN and nN busbar carries Ik''max/min + ip/ib/ith/kappa + Z(R/X) + Sk''
 * + the Ik''max ≤ Icw verification + the solver White Box trace. The renderer
 * INTERPRETS these on L2 — it never recomputes a short circuit.
 */
import type { StationArchetype } from '../contract';
import type { SldShortCircuitCompanion } from './shortCircuitTypes';

export const STATION_ARCHETYPE_SHORT_CIRCUIT: Readonly<
  Record<StationArchetype, SldShortCircuitCompanion>
> = """


def write_companions() -> str:
    out_dir = _companions_dir()
    os.makedirs(out_dir, exist_ok=True)
    body = json.dumps(build_all(), indent=2, sort_keys=True)
    ts = _TS_HEADER + body + ";\n"
    path = os.path.join(out_dir, "index.ts")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(ts)
    return path


def write_sc_companions() -> str:
    out_dir = _companions_dir()
    os.makedirs(out_dir, exist_ok=True)
    body = json.dumps(build_all_sc(), indent=2, sort_keys=True)
    ts = _TS_SC_HEADER + body + ";\n"
    path = os.path.join(out_dir, "shortCircuit.ts")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(ts)
    return path


_TS_VF_HEADER = """\
/**
 * GENERATED — DO NOT EDIT BY HAND.
 *
 * Per-archetype VOLTAGE + POWER-FLOW companions (gate F). Produced by running the
 * FROZEN Newton-Raphson solver (`solve_power_flow_physics`) on a two-voltage
 * substrate (real SN/nN TransformerBranch) in
 * `backend/src/application/reference_networks/station_archetype_substrate.py`
 * (READ-ONLY w.r.t. the solver, B-01). Regenerate with:
 *
 *   cd mv-design-pro/backend && poetry run python -m \\
 *     application.reference_networks.station_archetype_substrate --write
 *
 * Every busbar carries U [kV] + [p.u./%] + deviation; every branch carries
 * I/P/Q/S + direction + loading %. The renderer INTERPRETS these on L2 — it
 * never recomputes a power flow.
 */
import type { StationArchetype } from '../contract';
import type { SldVoltageFlowCompanion } from './voltageFlowTypes';

export const STATION_ARCHETYPE_VOLTAGE_FLOW: Readonly<
  Record<StationArchetype, SldVoltageFlowCompanion>
> = """


def write_vf_companions() -> str:
    out_dir = _companions_dir()
    os.makedirs(out_dir, exist_ok=True)
    body = json.dumps(build_all_vf(), indent=2, sort_keys=True)
    ts = _TS_VF_HEADER + body + ";\n"
    path = os.path.join(out_dir, "voltageFlow.ts")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(ts)
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="write the companion TS modules")
    args = parser.parse_args()
    if args.write:
        print(f"wrote {write_companions()}")
        print(f"wrote {write_sc_companions()}")
        print(f"wrote {write_vf_companions()}")
    else:
        print(
            json.dumps(
                {
                    "power_flow": build_all(),
                    "short_circuit": build_all_sc(),
                    "voltage_flow": build_all_vf(),
                },
                indent=2,
                sort_keys=True,
            )
        )


if __name__ == "__main__":
    main()
