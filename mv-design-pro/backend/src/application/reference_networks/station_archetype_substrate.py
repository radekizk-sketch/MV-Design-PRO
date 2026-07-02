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
import math
import os
from typing import Any, Literal

from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.machine import AsynchronousMachineSource, SynchronousMachineSource
from network_model.core.node import Node, NodeType
from network_model.solvers.machine_sc_iec60909 import compute_machine_contributions
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
_SQRT3 = 3.0**0.5
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

    def add_inverter(
        self, node_id: str, *, rated_kva: float, un_kv: float, k_sc: float, source_type: str
    ) -> float:
        """Register an IBG (PV/BESS/full-converter wind) as an IEC 60909 §6.7
        limited-current SC source. The frozen SC solver sums these (a BOUNDED
        current Ik=k_sc·In), NOT a full machine contribution — the gate-J
        distinction. Returns the source's Ik'' contribution [A]."""
        in_rated_a = rated_kva * 1000.0 / (_SQRT3 * un_kv * 1000.0)
        src = InverterSource(
            name=f"{source_type}@{node_id}",
            node_id=node_id,
            in_rated_a=in_rated_a,
            k_sc=k_sc,
            contributes_negative_sequence=True,
            contributes_zero_sequence=False,
        )
        self.graph.add_inverter_source(src)
        return src.ik_sc_a

    def add_synchronous_machine(
        self,
        node_id: str,
        *,
        sr_mva: float,
        ur_kv: float,
        xd_subtransient_pu: float,
        cos_phi_r: float,
        c_max: float = 1.10,  # IEC c_max (== _C_MAX, defined later)
    ) -> SynchronousMachineSource:
        """Register a synchronous machine SC source (IEC 60909-0:2016 §6.3) — a
        voltage source behind Z″_GK, i.e. a FULL machine contribution (gate J:
        machine ≠ IBG). Added to the Y-bus shunt so the FROZEN SC solver includes it
        in I″k/ip/ith; the per-machine breaking current (μ) comes from
        ``compute_machine_contributions`` (§6.6)."""
        # Deterministic id (the source_id is surfaced in the companion breakdown — a
        # random UUID would break companion determinism).
        seq = (
            sum(1 for m in self.graph.synchronous_machine_sources.values() if m.node_id == node_id)
            + 1
        )
        src = SynchronousMachineSource(
            id=f"sync/{node_id}/{seq}",
            name=f"SYN@{node_id}#{seq}",
            node_id=node_id,
            sr_mva=sr_mva,
            ur_kv=ur_kv,
            xd_subtransient_pu=xd_subtransient_pu,
            cos_phi_r=cos_phi_r,
            c_max=c_max,
        )
        self.graph.add_synchronous_machine_source(src)
        return src

    def add_asynchronous_machine(
        self,
        node_id: str,
        *,
        pr_mw: float,
        ur_kv: float,
        cos_phi_r: float,
        efficiency: float,
        i_lr_ratio: float,
        pole_pairs: int,
        wind_type_3: bool = False,
    ) -> AsynchronousMachineSource:
        """Register an asynchronous (induction) machine SC source (IEC 60909-0:2016
        §6.7) — a voltage source behind Z_M, a FULL machine contribution (gate J).
        The breaking current uses μ·q (§6.6.3); small motors may be neglected (§6.6).
        ``wind_type_3`` marks a DFIG (crowbar → induction machine); same math, DFIG label."""
        seq = (
            sum(1 for m in self.graph.asynchronous_machine_sources.values() if m.node_id == node_id)
            + 1
        )
        src = AsynchronousMachineSource(
            id=f"async/{node_id}/{seq}",
            name=f"ASY@{node_id}#{seq}",
            node_id=node_id,
            pr_mw=pr_mw,
            ur_kv=ur_kv,
            cos_phi_r=cos_phi_r,
            efficiency=efficiency,
            i_lr_ratio=i_lr_ratio,
            pole_pairs=pole_pairs,
            wind_type_3=wind_type_3,
        )
        self.graph.add_asynchronous_machine_source(src)
        return src

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
        x_over_r: float | None = None,
    ) -> None:
        """A real SN/nN TransformerBranch — so the SC solver steps voltage and the
        nN busbar carries a physically correct Ik'' (transformer-dominated).

        The SC impedance magnitude is |Z| = uk%, but its R/X split needs the copper
        losses pk: with pk=0 the SC R is 0 ⇒ X/R→∞ ⇒ κ→2 (unphysical for an LV busbar
        behind a transformer). Pass ``x_over_r`` to derive pk from a target X/R (≈4.5
        for distribution transformers, IEC 60909) so κ_nN lands at ~1.5; |Z| (hence
        Ik'') is UNCHANGED. ``x_over_r=None`` keeps the legacy R≈0 — this physics fix
        is OPT-IN per preset, so it stays scoped to the preset requesting it (no ripple
        to other archetypes' determinism-pinned companions).
        """
        if x_over_r is None:
            pk_kw = 0.0
        else:
            z_pu = uk_percent / 100.0
            r_pu = z_pu / math.sqrt(1.0 + x_over_r * x_over_r)
            pk_kw = r_pu * rated_mva * 1000.0
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
                pk_kw=pk_kw,
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


def _det(value: float) -> float:
    """Round a float to 12 significant figures so the GENERATED companion is
    byte-stable across runs (N-7 determinism). NumPy float accumulation order can
    jitter the last ULP (e.g. 0.9 vs 0.8999999999999999); 12 sig-figs is far
    beyond engineering precision yet kills the jitter."""
    if value == 0.0 or not isinstance(value, float):
        return value
    from math import floor, isfinite, log10

    if not isfinite(value):
        return value
    digits = 12 - 1 - floor(log10(abs(value)))
    return round(value, digits)


def _json_safe(value: Any) -> Any:
    """Recursively convert solver trace values to JSON-ready types (complex →
    {re, im}, numpy scalars → native), with deterministic float rounding (N-7).
    The White Box trace is carried verbatim except for this lossless
    type-normalisation + 12-sig-fig stabilisation."""
    if isinstance(value, complex):
        return {"re": _det(float(value.real)), "im": _det(float(value.imag))}
    if hasattr(value, "item"):  # numpy scalar
        return _json_safe(value.item())
    if isinstance(value, float):
        return _det(value)
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


def _ibg_referred_a(graph: NetworkGraph, un_kv: float) -> float:
    """IBG SC contribution at a bus, REFERRED through the turns ratio (audit F-1). The FROZEN
    solver sums raw §6.7 ik_sc_a UN-referred onto every bus; the physical bus current is
    Σ I_src·(U_src/U_bus) (the product of intermediate turns ratios). 0 if no inverter sources."""
    if un_kv <= 0.0:
        return 0.0
    total = 0.0
    for src in graph.get_inverter_sources():
        node = graph.nodes.get(src.node_id)
        u_src = node.voltage_level if node is not None else un_kv
        total += src.ik_sc_a * (u_src / un_kv)
    return total


def _sc_bus_entry(graph: NetworkGraph, bus_id: str, un_kv: float, icw_ka: float) -> dict[str, Any]:
    """Ik''max/min + ip/ib/ith/kappa + Sk + Icw verification at one busbar, with the solver's
    White Box trace carried verbatim. Audit F-1: the FROZEN solver adds IBG current UN-REFERRED
    to every bus (raw §6.7 ik_sc_a, ignoring the transformer between the IBG and the fault),
    which inflates remote-bus (collector) Ik''. The reported scalars use the CONSISTENT metric:
    grid Thévenin (solver Ik'' minus its raw IBG sum) + the IBG REFERRED via the turns ratio.
    Machine sources are in the Z-bus (no inverter sources) → no-op — matching their reporting."""
    rmax = _sc_one(graph, bus_id, _C_MAX)
    rmin = _sc_one(graph, bus_id, _C_MIN)
    ibg_ref_a = _ibg_referred_a(graph, un_kv)
    ik_max_a = rmax.ikss_a - rmax.ik_inverters_a + ibg_ref_a
    ik_min_a = rmin.ikss_a - rmin.ik_inverters_a + ibg_ref_a
    f_max = (ik_max_a / rmax.ikss_a) if rmax.ikss_a else 1.0
    f_min = (ik_min_a / rmin.ikss_a) if rmin.ikss_a else 1.0
    ikss_max_ka = round(ik_max_a / 1000.0, 3)
    ikss_min_ka = round(ik_min_a / 1000.0, 3)
    ip_max_ka = round(rmax.ip_a * f_max / 1000.0, 3)
    # Rated PEAK (dynamic) withstand Idyn — the equipment nameplate paired with Icw, carried
    # PER BUS exactly like icw_ka (a multi-nN station then rates EACH busbar correctly). Ratio
    # per standard: IEC 62271-1 Idyn = 2.5·Icw for MV switchgear (50 Hz); LV ACBs ≈ 2.1·Icw
    # (3WA class). Checked at L2 as ip ≤ Idyn beside the thermal Ik″ ≤ Icw verdict.
    idyn_ka = round((2.5 if un_kv >= 1.0 else 2.1) * icw_ka, 1)
    return {
        "bus_ref": bus_id,
        "un_kv": un_kv,
        "icw_ka": icw_ka,
        "idyn_ka": idyn_ka,
        # Ik''max branch (c=1.10): equipment-withstand verification.
        "max": {
            "case_ref": "ZWARCIOWY_MAKS",
            "c_factor": _C_MAX,
            "ikss_ka": ikss_max_ka,
            "ip_ka": ip_max_ka,
            "ib_ka": round(rmax.ib_a * f_max / 1000.0, 3),
            "ith_ka": round(rmax.ith_a * f_max / 1000.0, 3),
            "kappa": round(rmax.kappa, 3),
            "sk_mva": round(rmax.sk_mva * f_max, 2),
            "rx_ratio": round(rmax.rx_ratio, 4),
            "white_box_trace": _json_safe(rmax.white_box_trace),
        },
        # Ik''min branch (c=0.95): protection-sensitivity reference.
        "min": {
            "case_ref": "ZWARCIOWY_MIN",
            "c_factor": _C_MIN,
            "ikss_ka": ikss_min_ka,
            "ith_ka": round(rmin.ith_a * f_min / 1000.0, 3),
            "kappa": round(rmin.kappa, 3),
            "sk_mva": round(rmin.sk_mva * f_min, 2),
            "white_box_trace": _json_safe(rmin.white_box_trace),
        },
        # Verification: Ik''max ≤ Icw (thermal withstand). The dynamic check (ip ≤ Idyn) is the
        # paired per-bus nameplate above; both are shown at L2 with their own verdict.
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
            bus_id: _sc_bus_entry(graph, bus_id, un_kv, icw_ka) for bus_id, un_kv, icw_ka in buses
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
        SR_TR,
        "SN_BUS",
        "NN_BUS",
        hv_kv=_BASE_KV,
        lv_kv=_NN_KV,
        uk_percent=_TRAFO_UK_PCT,
        rated_mva=_TRAFO_MVA,
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
            SR_TR,
            "SN_BUS",
            "NN_BUS",
            hv_kv=_BASE_KV,
            lv_kv=_NN_KV,
            uk_percent=_TRAFO_UK_PCT,
            rated_mva=_TRAFO_MVA,
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


def _wb(
    title: str,
    formula: str,
    inputs: dict[str, Any],
    subst: str,
    result: dict[str, Any],
    unit: str,
    source: str,
) -> dict[str, Any]:
    """One White Box step (A->B->C->D): formula -> data -> substitution -> result.
    `source` tags provenance: 'solver' (frozen NR primitive) or 'interpretacja'
    (derived from solver output for display)."""
    return {
        "title": title,
        "formula_latex": formula,
        "inputs": inputs,
        "substitution_latex": subst,
        "result": result,
        "result_unit": unit,
        "source": source,
    }


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
        u_pu_r = round(u_pu, 5)
        dev = round((u_pu - 1.0) * 100.0, 3)
        bus_entries[bus_id] = {
            "bus_ref": bus_id,
            "un_kv": un_kv,
            "u_kv": u_kv,
            "u_pu": u_pu_r,
            "u_percent": round(u_pu * 100.0, 3),
            "deviation_percent": dev,
            "angle_deg": round(
                float(sol.node_angle.get(bus_id, 0.0)) * 180.0 / 3.141592653589793, 3
            ),
            # White Box (gate D): U derivation from the frozen NR solution.
            "white_box": [
                _wb(
                    "Napięcie węzłowe U (p.u.)",
                    r"U_{pu} = |\underline{U}|\ \text{(rozwiązanie Newton-Raphson)}",
                    {"solver": "newton-raphson", "iteracje": int(sol.iterations)},
                    rf"U_{{pu}} = {u_pu_r}",
                    {"u_pu": u_pu_r},
                    "p.u.",
                    "solver",
                ),
                _wb(
                    "Napięcie U [kV]",
                    r"U = U_{pu} \cdot U_n",
                    {"u_pu": u_pu_r, "u_n_kv": un_kv},
                    rf"U = {u_pu_r} \cdot {un_kv}",
                    {"u_kv": u_kv},
                    "kV",
                    "interpretacja",
                ),
                _wb(
                    "Odchyłka napięcia ΔU",
                    r"\Delta U = (U_{pu} - 1) \cdot 100\%",
                    {"u_pu": u_pu_r},
                    rf"\Delta U = ({u_pu_r} - 1) \cdot 100\%",
                    {"deviation_percent": dev},
                    "%",
                    "interpretacja",
                ),
            ],
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
        i_a = round(i_ka * 1000.0, 2)
        from_un_kv = float(graph.nodes[branch.from_node_id].voltage_level)
        branch_entries[branch_id] = {
            "branch_ref": branch_id,
            "i_a": i_a,
            "p_mw": p_mw,
            "q_mvar": q_mvar,
            "s_mva": s_mva,
            "direction": _flow_direction(p_mw),
            "loading_percent": loading_pct,
            "white_box": [
                _wb(
                    "Moc galezi S (zespolona)",
                    r"\underline{S} = \underline{U} \cdot \underline{I}^{*}\ \text{(rozwiazanie NR)}",
                    {"solver": "newton-raphson"},
                    rf"P = {p_mw}\ \text{{MW}},\ Q = {q_mvar}\ \text{{Mvar}}",
                    {"p_mw": p_mw, "q_mvar": q_mvar},
                    "MW / Mvar",
                    "solver",
                ),
                _wb(
                    "Moc pozorna S",
                    r"S = \sqrt{P^2 + Q^2}",
                    {"p_mw": p_mw, "q_mvar": q_mvar},
                    rf"S = \sqrt{{{p_mw}^2 + {q_mvar}^2}}",
                    {"s_mva": s_mva},
                    "MVA",
                    "interpretacja",
                ),
                _wb(
                    "Prad galezi I",
                    r"I = \frac{S \cdot 10^3}{\sqrt{3} \cdot U_n}",
                    {"s_mva": s_mva, "u_n_kv": from_un_kv},
                    rf"I = \frac{{{s_mva} \cdot 10^3}}{{\sqrt{{3}} \cdot {from_un_kv}}}",
                    {"i_a": i_a},
                    "A",
                    "interpretacja",
                ),
                _wb(
                    "Obciazenie pola",
                    r"obc. = \frac{I}{I_{zn}} \cdot 100\%",
                    {"i_a": i_a, "i_zn_a": rated_a if rated_a > 0 else None},
                    (rf"obc. = \frac{{{i_a}}}{{{rated_a}}} \cdot 100\%" if rated_a > 0 else "n/d"),
                    {"loading_percent": loading_pct},
                    "%",
                    "interpretacja",
                ),
            ],
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


# ===========================================================================
# KROK 2 — OZE source archetypes (G family). Runda 2a: PV (G1-G3).
# ===========================================================================
# Each OZE archetype companion carries (all from the FROZEN solvers, READ-ONLY,
# B-01): source meta (machine_type IBG/SYNCHRONOUS/ASYNCHRONOUS, technology, NC
# RfG class + control mode, power hierarchy), power flow (bus U + branch I/P/Q/S;
# generation = reverse export), and short circuit per bus (Ik''max/min) WITH the
# IBG limited contribution tagged per gate J (bounded current, NOT a machine).
# IBG short-circuit factor k_sc (IEC 60909-0:2016 §6.7): Ik = k_sc · I_rated.
_IBG_K = 1.2
# Minimum time delay t_min for the symmetrical breaking current i_b of rotating
# machines (IEC 60909-0:2016 §6.6) — generic MV protection grading time.
_MACHINE_TMIN_S = 0.10


# Protection function sets per machine type (gate I) — ANSI/IEC codes on the
# connection field, per machine type (axis T). IBG ≠ synchronous ≠ asynchronous.
_PROTECTION_BY_MACHINE: dict[str, list[str]] = {
    # IBG (PV/BESS/full-converter wind): directional OC + voltage/frequency +
    # rate-of-change + neutral OV + anti-islanding.
    "IBG": ["67", "67N", "81U", "81O", "df/dt", "27", "59", "59N", "anti-islanding"],
    # Synchronous machine (cogeneration) — INTERFACE set only (line bay, NC RfG), same as
    # G6/G7. The FULL generator protection (87G diff, 40 loss-of-field, 32 reverse-power,
    # 64 ground, 46 neg-seq, 21/25, 27/59/81) lives on source.protection, NOT the interface.
    "SYNCHRONOUS": ["67", "67N", "27", "59", "81U", "81O", "df/dt", "anti-islanding"],
    # Asynchronous machine (wind Type 1) — INTERFACE set only (line bay, NC RfG), same as DFIG:
    # 46/47 neg-seq, 49, 51 (+ 37 motoring, 32 reverse-power) are MACHINE functions and live on
    # source.protection, NOT on the grid interface. anti-islanding is critical (self-excitation
    # of the induction generator from the compensation capacitor bank).
    "ASYNCHRONOUS": ["67", "67N", "27", "59", "81U", "81O", "df/dt", "anti-islanding"],
    # GPO wielopolowe (różne źródła na wspólnej szynie) — INTERFEJS = NC RfG (jak wyżej); każde
    # pole źródłowe ma własny zestaw maszynowy/IBG na polu (split per typ, audit #5).
    "MIXED": ["67", "67N", "27", "59", "81U", "81O", "df/dt", "anti-islanding"],
    # DFIG (wind Type 3) — INTERFACE set only (line bay, NC RfG). The MACHINE functions
    # (46/47 neg-seq, 49, 51) + the rotor-CONVERTER protection live on source.protection,
    # NOT on the grid interface (audit #5).
    "DFIG": ["67", "67N", "27", "59", "81U", "81O", "df/dt", "anti-islanding"],
}


def _pv_source(
    *,
    technology: str,
    machine_type: str,
    nc_class: str,
    control_mode: str,
    p_zainst_kw: float,
    pn_ac_kw: float,
    p_przylacz_kw: float,
    p_osiagalna_kw: float,
) -> dict[str, Any]:
    return {
        "technology": technology,
        "machine_type": machine_type,
        "nc_rfg_class": nc_class,
        "control_mode": control_mode,
        # Gate I — protection set is a function of the machine type (axis T).
        "protection_codes": list(_PROTECTION_BY_MACHINE.get(machine_type, [])),
        "power_hierarchy": {
            "p_zainst_kw": p_zainst_kw,
            "pn_ac_kw": pn_ac_kw,
            "p_przylacz_kw": p_przylacz_kw,
            "p_osiagalna_kw": p_osiagalna_kw,
        },
    }


def _metering(
    *,
    source_ref: str,
    ct_ipn_a: float,
    ct_cores: int,
    ct_isn_a: float = 5.0,
    ct_type: str | None = None,
    vt_usn_v: float = 100.0,
    vt_fv: float = 1.9,
) -> dict[str, Any]:
    """SN measurement-bay CT/VT nameplates as STRUCTURED fields — the SLD renders the ratio
    from these and never hard-codes one. ct_ipn_a is next-std ≥ I_load (the representative,
    correct value; the station wizard does the real IEC 61869 selection). The VT primary is
    derived from the bus Un in the view; here we carry the secondary (Usn/√3) + Fv (1.9 —
    compensated SN, 8 h)."""
    ct: dict[str, Any] = {"ipn_a": ct_ipn_a, "isn_a": ct_isn_a, "cores": ct_cores}
    if ct_type is not None:
        ct["type"] = ct_type
    return {"source_ref": source_ref, "ct": ct, "vt": {"usn_v": vt_usn_v, "fv": vt_fv}}


def _oze_sc_bus(
    graph: NetworkGraph,
    bus_id: str,
    un_kv: float,
    icw_ka: float,
    *,
    machine_type: str,
    t_min_s: float = _MACHINE_TMIN_S,
) -> dict[str, Any]:
    """SC dossier at one OZE busbar — the station SC entry + the source contribution
    broken out BY MACHINE TYPE (gate J).

    IBG = a BOUNDED current source (Ik = k·I_rated, IEC 60909-0:2016 §6.7); it is NOT
    in the solver Z-bus, so it is tagged separately. A SYNCHRONOUS/ASYNCHRONOUS machine
    is a voltage source behind Z″ that is ALREADY in the solver's I″k; here its PARTIAL
    share + the symmetrical breaking current (μ, and async μ·q — §6.6) are broken out
    via ``compute_machine_contributions`` (READ-ONLY, anti-fabrication: real solver)."""
    entry = _sc_bus_entry(graph, bus_id, un_kv, icw_ka)
    if machine_type == "MIXED":
        # GPO wielopolowe — IBG (§6.7, sprowadzony) + maszyny wirujące (§6.3/§6.7, w Z-bus) na
        # WSPÓLNEJ szynie SN. Rozbicie udziału: sieć = Ik'' − maszyny − IBG.
        res = compute_machine_contributions(graph, bus_id, c_factor=_C_MAX, t_min_s=t_min_s)
        ibg_ka = _ibg_referred_a(graph, un_kv) / 1000.0
        machine_ka = res.ikss_machines_a / 1000.0
        entry["source_contribution"] = {
            "machine_type": "MIXED",
            "model": "GPO — IBG (§6.7) + maszyny synchr./asynchr. (§6.3/§6.7) na wspólnej szynie SN",
            "ik_contribution_ka": round(machine_ka + ibg_ka, 3),
            "ibg_ka": round(ibg_ka, 3),
            "machine_ka": round(machine_ka, 3),
            "ib_contribution_ka": round(res.ib_machines_a / 1000.0, 3),
            "is_synchronous_machine": False,
            "machines": [
                {
                    "source_id": c.source_id,
                    "node_ref": c.node_id,
                    "ikss_partial_ka": round(c.ikss_partial_a / 1000.0, 3),
                    "ib_partial_ka": round(c.ib_a / 1000.0, 3),
                    "mu": round(c.mu, 4),
                    "q": round(c.q, 4),
                    "ir_a": round(c.ir_a, 1),
                }
                for c in res.contributions
            ],
        }
        return entry
    if machine_type == "IBG":
        # Per-bus IBG share REFERRED through the turns ratio (audit F-1) — consistent with the
        # Ik'' reported by _sc_bus_entry; collector ≈ referred (small), LV ≈ local k·In.
        entry["source_contribution"] = {
            "machine_type": "IBG",
            "model": (
                "IEC 60909 §6.7 — źródło prądowe ograniczone (k·I_rated), "
                "sprowadzone przez przekładnię"
            ),
            "ik_contribution_ka": round(_ibg_referred_a(graph, un_kv) / 1000.0, 3),
            "is_synchronous_machine": False,
        }
        return entry
    res = compute_machine_contributions(graph, bus_id, c_factor=_C_MAX, t_min_s=t_min_s)
    is_sync = machine_type == "SYNCHRONOUS"
    if is_sync:
        model = "IEC 60909-0:2016 §6.3/§6.6 — maszyna synchroniczna za Z″ (zanik μ)"
    elif machine_type == "DFIG":
        model = "IEC 60909-0:2016 §6.7/§6.6 — DFIG (Typ 3): crowbar → maszyna asynchroniczna za Z_M (zanik μ·q)"
    else:
        model = "IEC 60909-0:2016 §6.7/§6.6 — maszyna asynchroniczna za Z_M (zanik μ·q)"
    entry["source_contribution"] = {
        "machine_type": machine_type,
        "model": model,
        "ik_contribution_ka": round(res.ikss_machines_a / 1000.0, 3),
        "ib_contribution_ka": round(res.ib_machines_a / 1000.0, 3),
        "is_synchronous_machine": is_sync,
        "t_min_s": t_min_s,
        "motors_negligible": res.motors_negligible,
        # Per-machine breakdown (WHITE BOX): partial I″k, breaking current, μ/q, I_r.
        "machines": [
            {
                "source_id": c.source_id,
                "node_ref": c.node_id,
                "ikss_partial_ka": round(c.ikss_partial_a / 1000.0, 3),
                "ib_partial_ka": round(c.ib_a / 1000.0, 3),
                "mu": round(c.mu, 4),
                "q": round(c.q, 4),
                "ir_a": round(c.ir_a, 1),
            }
            for c in res.contributions
        ],
    }
    return entry


def _oze_companion(
    archetype: str,
    *,
    substrate: _Substrate,
    buses: list[tuple[str, float, float]],  # (bus_id, un_kv, icw_ka)
    pcc_bus: str,
    source: dict[str, Any],
    fields: list[dict[str, Any]],
    boundary: dict[str, Any],
) -> dict[str, Any]:
    """Assemble one OZE archetype companion: source meta + PF + SC (incl. IBG) +
    the STATION IDIOM (source field + connection field + boundary), each element
    carrying a source_ref (anti-fabrication: every element is pinned to the ENM /
    catalog / standard / solver — nothing is painted onto an empty busbar)."""
    graph = substrate.graph
    sol = solve_power_flow_physics(substrate.to_input())
    vf_buses: dict[str, dict[str, Any]] = {}
    for bus_id, un_kv, _icw in buses:
        u_pu = float(sol.node_u_mag.get(bus_id, 0.0))
        vf_buses[bus_id] = {
            "bus_ref": bus_id,
            "un_kv": un_kv,
            "u_kv": round(u_pu * un_kv, 4),
            "u_pu": round(u_pu, 5),
            "deviation_percent": round((u_pu - 1.0) * 100.0, 3),
        }
    vf_branches: dict[str, dict[str, Any]] = {}
    for branch_id in sorted(graph.branches):
        s_from = sol.branch_s_from_mva.get(branch_id)
        i_ka = float(sol.branch_current_ka.get(branch_id, 0.0))
        branch = graph.branches[branch_id]
        rated_a = float(getattr(branch, "rated_current_a", 0.0) or 0.0)
        p_mw = round(float(s_from.real), 4) if s_from is not None else 0.0
        q_mvar = round(float(s_from.imag), 4) if s_from is not None else 0.0
        vf_branches[branch_id] = {
            "branch_ref": branch_id,
            "i_a": round(i_ka * 1000.0, 2),
            "p_mw": p_mw,
            "q_mvar": q_mvar,
            "s_mva": round((p_mw**2 + q_mvar**2) ** 0.5, 4),
            "direction": _flow_direction(p_mw),
            "loading_percent": (
                round((i_ka * 1000.0 / rated_a) * 100.0, 2) if rated_a > 0 else None
            ),
        }
    sc_buses = {
        bus_id: _oze_sc_bus(graph, bus_id, un_kv, icw_ka, machine_type=source["machine_type"])
        for bus_id, un_kv, icw_ka in buses
    }
    h = source["power_hierarchy"]
    chain = [h["p_zainst_kw"], h["pn_ac_kw"], h["p_przylacz_kw"], h["p_osiagalna_kw"]]
    hierarchy_ok = all(chain[i] >= chain[i + 1] for i in range(len(chain) - 1))
    return {
        "schema": "sld_oze_archetype_companion_v1",
        "archetype": archetype,
        "enm_hash": f"oze-substrate/{archetype}",
        "pcc_bus_ref": pcc_bus,
        "source": {**source, "power_hierarchy": {**h, "valid": hierarchy_ok}},
        # Station idiom (anti-fabrication): the producer installation = source field
        # + connection field (interface protection lives HERE, looking at the grid)
        # + a boundary marker. Every field/boundary carries a source_ref.
        "fields": fields,
        "boundary": boundary,
        "case_ref_pf": "ROZPLYW_GEN_MAX",
        "case_ref_sc": "ZWARCIOWY_MAKS",
        "converged": bool(sol.converged),
        "voltage_flow": {
            "buses": dict(sorted(vf_buses.items())),
            "branches": dict(sorted(vf_branches.items())),
        },
        "short_circuit": {"standard": "IEC 60909", "buses": dict(sorted(sc_buses.items()))},
    }


# Allowed ENEA boundary variants (axis 6) — a closed set; mapped to the ENM
# Generator.connection_variant. Painting any other point → gate FAIL.
_BOUNDARY_VARIANTS = {
    "G-GPZ": "DEDICATED_MV_CONNECTION",
    "G-ZKSN": "DEDICATED_MV_CONNECTION",
    "G-SLUP": "DEDICATED_MV_CONNECTION",
    "G-ZLACZE-POM": "DEDICATED_MV_CONNECTION",
    "G-ZALICZNIK": "LV_BEHIND_STATION_TRANSFORMER",
}


def _boundary(variant: str, *, on_bus: str, metered: bool) -> dict[str, Any]:
    """A boundary marker pinned to an ENEA variant + the ENM connection_variant."""
    assert variant in _BOUNDARY_VARIANTS, f"unknown boundary variant {variant}"
    return {
        "variant": variant,
        "enm_connection_variant": _BOUNDARY_VARIANTS[variant],
        "on_bus_ref": on_bus,
        "metered": metered,
        "source_ref": f"enm:Generator.connection_variant={_BOUNDARY_VARIANTS[variant]}",
    }


def _port(
    port_id: str,
    *,
    kind: str,
    un_kv: float,
    entry_side: str,
    occupied_by: str,
    cable: str | None = None,
    source_ref: str = "",
) -> dict[str, Any]:
    """A field's cable-connection PORT (projection of ENM Port). The cable docks
    HERE (not at the middle of the field). `kind` ∈ Port.kind; `entry_side` (axis 7)
    ∈ {DOL, BOK-L, BOK-P, GORA} fixes WHERE the cable enters (the docking contract
    that keeps the network orthogonal at 53 stations); `occupied_by` = the cable
    segment ref; `cable` = type/cross-section ('dane niekompletne' if unknown)."""
    return {
        "port_id": port_id,
        "kind": kind,  # sn_input | sn_output | sn_branch | nn_feeder | ...
        "nominal_voltage_kv": un_kv,
        "entry_side": entry_side,  # axis 7 — DOL | BOK-L | BOK-P | GORA
        "occupied_by": occupied_by,  # cable segment ref (Port.occupied_by)
        "cable": cable or "dane niekompletne",
        "source_ref": source_ref or f"enm:Port.kind={kind}",
    }


def _app(
    device_ref: str,
    *,
    kind: str,
    designation: str,
    catalog: str | None = None,
    placement: str = "MIDSTREAM",
    source_ref: str = "",
) -> dict[str, Any]:
    """One apparatus on a field's power path (projection of ENM BayPrimaryDevice).
    `placement` orders the stack busbar→cable: UPSTREAM → MIDSTREAM → DOWNSTREAM,
    with OFF_PATH/GROUND_BRANCH for side branches (VT, surge arrester, earth)."""
    return {
        "device_ref": device_ref,
        "kind": kind,  # CB | DS | LOAD_SWITCH | ES | CT | VT | CABLE_HEAD | SURGE_ARRESTER ...
        "designation": designation,  # Q0, GTR5, T1.3, TU1.3, ...
        "catalog": catalog,
        "placement": placement,
        "source_ref": source_ref or f"enm:BayPrimaryDevice.kind={kind}",
    }


def _field(
    field_id: str,
    *,
    role: str,
    kind: str,
    abb_cell: str,
    on_bus: str,
    source_ref: str,
    interface_protection: bool,
    protection_codes: list[str] | None = None,
    apparatus: list[dict[str, Any]] | None = None,
    port: dict[str, Any] | None = None,
    source_kind: str | None = None,
) -> dict[str, Any]:
    """One station field pinned to the ENM. role: connection|source|measurement|
    switch|load|breaker. interface_protection=True ⇒ the relay that looks at the
    grid (connection field ONLY — never at the source). `apparatus` = ordered
    stack (busbar→cable); `port` = the cable-connection port (cable docks HERE,
    on the field's cable head)."""
    return {
        "field_id": field_id,
        "role": role,
        "kind": kind,  # ABB cell label / source kind
        "abb_cell": abb_cell,  # SDC | SDF | CBC | SMC | DBC | SDM-V | SDM-C ...
        "on_bus_ref": on_bus,
        "source_ref": source_ref,
        "interface_protection": interface_protection,
        "protection_codes": list(protection_codes or []),
        "apparatus": list(apparatus or []),
        "port": port,
        **({"source_kind": source_kind} if source_kind is not None else {}),
    }


def build_g1() -> dict[str, Any]:
    """G1 — PV prosumencka nN (za trafo odbiorczym): GPZ → SN → trafo SN/nN →
    nN bus → odbiór + falownik PV. IBG, klasa A, cosφ=const."""
    pv_kva = 50.0
    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("SN_BUS", _BASE_KV)
    s.add_bus("NN_BUS", _NN_KV)
    s.add_line(SR_IN, "GPZ", "SN_BUS", _SN_LINE_R, _SN_LINE_X)
    s.add_transformer(
        SR_TR,
        "SN_BUS",
        "NN_BUS",
        hv_kv=_BASE_KV,
        lv_kv=_NN_KV,
        uk_percent=_TRAFO_UK_PCT,
        rated_mva=_TRAFO_MVA,
        x_over_r=3.0,  # OSD MV/LV distribution TR — physical R/X (κ_nN ≈ 1.4), preset G2
    )
    # Prosument: midday PV (45 kW) exceeds the local load (10 kW) → net REVERSE
    # export to the grid (the solver signs it; we do not assume it). One netted
    # PQ spec per node (a node carries a single injection, not two specs).
    s.add_load("NN_BUS", p_mw=0.01 - pv_kva / 1000.0 * 0.9, q_mvar=0.004)
    s.add_inverter("NN_BUS", rated_kva=pv_kva, un_kv=_NN_KV, k_sc=_IBG_K, source_type="PV")
    s.finalize_pq()
    prot = list(_PROTECTION_BY_MACHINE["IBG"])
    src = _pv_source(
        technology="PV",
        machine_type="IBG",
        nc_class="A",
        control_mode="cosφ=const",
        p_zainst_kw=55.0,
        pn_ac_kw=50.0,
        p_przylacz_kw=50.0,
        p_osiagalna_kw=45.0,
    )
    # §5 — the prosumer LV network is TN (solid neutral at the OSD MV/LV transformer):
    # the single-phase earth fault carries current (no IMD; cleared by time-graded OC).
    src["grid_earthing"] = {
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:sieć_nN_TN",
        "neutral_point": "bezpośrednie (TN)",
        "ik_1f_ka": 10.0,  # nN L-PE fault (TN, solid earth) — z uziemienia OSD
        "imd_it_nn": False,
        "note_pl": "nN TN: doziemienie z prądem (uziemienie bezpośrednie OSD) — wyłączane zwłocznie",
    }
    return _oze_companion(
        "G1",
        substrate=s,
        buses=[("SN_BUS", _BASE_KV, _ICW_SN_KA), ("NN_BUS", _NN_KV, _ICW_NN_KA)],
        pcc_bus="NN_BUS",
        source=src,
        # Station idiom: source field (PV on nN, SDC) + connection field (interface
        # protection HERE, on nN looking at the OSD network) on the nN busbar.
        fields=[
            _field(
                "g1-conn",
                role="connection",
                kind="POLE_PRZYŁĄCZENIOWE",
                abb_cell="CBC",
                on_bus="NN_BUS",
                source_ref="enm:Bay.bay_role=LINIA_OUT",
                interface_protection=True,
                protection_codes=prot,
            ),
            _field(
                "g1-src",
                role="source",
                kind="PV",
                abb_cell="SDC",
                on_bus="NN_BUS",
                source_ref="enm:Generator.gen_type=pv_inverter",
                interface_protection=False,
            ),
        ],
        boundary=_boundary("G-ZALICZNIK", on_bus="NN_BUS", metered=True),
    )


def build_g2() -> dict[str, Any]:
    """G2 — Farma PV: falowniki nN + dedykowany trafo nN/SN. Przyłącze na SN. IBG,
    klasa C, Q(U)."""
    pv_kva = 990.0
    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("PCC_SN", _BASE_KV)
    s.add_bus("NN_COLLECTOR", _NN_KV)
    s.add_line(SR_IN, "GPZ", "PCC_SN", _SN_LINE_R, _SN_LINE_X)
    s.add_transformer(
        SR_TR,
        "PCC_SN",
        "NN_COLLECTOR",
        hv_kv=_BASE_KV,
        lv_kv=_NN_KV,
        uk_percent=_TRAFO_UK_PCT,
        rated_mva=1.0,
    )
    s.add_pv("NN_COLLECTOR", p_inject_mw=pv_kva / 1000.0 * 0.9)
    s.add_inverter("NN_COLLECTOR", rated_kva=pv_kva, un_kv=_NN_KV, k_sc=_IBG_K, source_type="PV")
    s.finalize_pq()
    return _oze_companion(
        # A 1 MVA PV collector nN board is specified for BOTH withstand checks at its actual
        # fault level: thermal Ik''≈26.5 kA and dynamic ip≈71.7 kA (high κ≈1.91 at the LV
        # collector). A 40 kA board is the minimal standard rating that passes both — Ik''≤40 and
        # ip ≤ Idyn=2.1·40=84 kA. (A 31.5 kA board clears the thermal check but its peak rating
        # 2.1·31.5≈66 kA < 72 kA: the per-bus dynamic verdict is real, not rigged.)
        "G2",
        substrate=s,
        buses=[("PCC_SN", _BASE_KV, _ICW_SN_KA), ("NN_COLLECTOR", _NN_KV, 40.0)],
        pcc_bus="PCC_SN",
        source=_pv_source(
            technology="PV",
            machine_type="IBG",
            nc_class="C",
            control_mode="Q(U)",
            p_zainst_kw=1100.0,
            pn_ac_kw=990.0,
            p_przylacz_kw=990.0,
            p_osiagalna_kw=900.0,
        ),
        # Station idiom: PV source field on the nN collector → block transformer →
        # connection field on the SN busbar (interface protection HERE) +
        # measurement field at the SN boundary. Dedicated MV connection (G-ZKSN).
        fields=[
            _field(
                "g2-conn",
                role="connection",
                kind="POLE_PRZYŁĄCZENIOWE",
                abb_cell="CBC",
                on_bus="PCC_SN",
                source_ref="enm:Bay.bay_role=LINIA_OUT",
                interface_protection=True,
                protection_codes=list(_PROTECTION_BY_MACHINE["IBG"]),
            ),
            _field(
                "g2-meter",
                role="measurement",
                kind="POLE_POMIAROWE",
                abb_cell="SDM-V",
                on_bus="PCC_SN",
                source_ref="enm:Measurement.purpose=metering",
                interface_protection=False,
            ),
            _field(
                "g2-src",
                role="source",
                kind="PV",
                abb_cell="SDC",
                on_bus="NN_COLLECTOR",
                source_ref="enm:Generator.gen_type=pv_inverter",
                interface_protection=False,
            ),
        ],
        boundary=_boundary("G-ZKSN", on_bus="PCC_SN", metered=True),
    )


def build_g3() -> dict[str, Any]:
    """G3 — Farma PV: falowniki SN bezpośrednio (blok falownik+trafo na SN). Przyłącze
    na SN. IBG, klasa C, cosφ(P)."""
    pv_kva = 1500.0
    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("PCC_SN", _BASE_KV)
    s.add_bus("PV_SN", _BASE_KV)
    s.add_line(SR_IN, "GPZ", "PCC_SN", _SN_LINE_R, _SN_LINE_X)
    s.add_line(SR_OUT, "PCC_SN", "PV_SN", _SN_LINE_R * 0.3, _SN_LINE_X * 0.3)
    s.add_pv("PV_SN", p_inject_mw=pv_kva / 1000.0 * 0.9)
    s.add_inverter("PV_SN", rated_kva=pv_kva, un_kv=_BASE_KV, k_sc=_IBG_K, source_type="PV")
    s.finalize_pq()
    return _oze_companion(
        "G3",
        substrate=s,
        buses=[("PCC_SN", _BASE_KV, _ICW_SN_KA), ("PV_SN", _BASE_KV, _ICW_SN_KA)],
        pcc_bus="PCC_SN",
        source=_pv_source(
            technology="PV",
            machine_type="IBG",
            nc_class="C",
            control_mode="cosφ(P)",
            p_zainst_kw=1650.0,
            pn_ac_kw=1500.0,
            p_przylacz_kw=1500.0,
            p_osiagalna_kw=1350.0,
        ),
        # Station idiom: SN-side PV inverters (source field on PV_SN, no transformer)
        # → connection field on the SN busbar (interface protection HERE).
        # Dedicated MV connection via a cable junction (G-ZKSN).
        fields=[
            _field(
                "g3-conn",
                role="connection",
                kind="POLE_PRZYŁĄCZENIOWE",
                abb_cell="CBC",
                on_bus="PCC_SN",
                source_ref="enm:Bay.bay_role=LINIA_OUT",
                interface_protection=True,
                protection_codes=list(_PROTECTION_BY_MACHINE["IBG"]),
            ),
            _field(
                "g3-src",
                role="source",
                kind="PV",
                abb_cell="SDC",
                on_bus="PV_SN",
                source_ref="enm:Generator.gen_type=pv_inverter",
                interface_protection=False,
            ),
        ],
        boundary=_boundary("G-ZKSN", on_bus="PCC_SN", metered=True),
    )


_OZE_ARCHETYPES_2A = {"G1": build_g1, "G2": build_g2, "G3": build_g3}


# Schematic-true nameplate voltages (distilled from the owner's execution drawing
# of the SN/nN station with a 1 MW PV farm — NOT 0.4 kV; the PV inverters output
# ~800 V AC and the step-up transformer is 15.75/0.8 kV).
_PV1MW_SN_KV = 15.75
_PV1MW_NN_KV = 0.8


# Grid infeed at the SN connection is GRID-dominated (X/R ≈ 7, PN-EN 60909) — not a
# resistive cable. |Z| matches the generic SN line (Ik″ unchanged), only X/R (→ κ, ip)
# is made physical: SN κ ≈ 1,66. Shared by the canonical SN-station presets (G1, G3).
_GRID_INFEED_R = 0.142
_GRID_INFEED_X = 0.996


# Protection coordination matrix — PV "Buk 1", dok. 1.18 "Wykaz nastaw i
# zabezpieczeń" (source_ref). Three-level coordination (inverter / nN Q1 / SN Q0)
# with two trip philosophies: SOFT disturbances (f, RoCoF, U) → nN Q1; faults /
# earth-faults / step-II overvoltage → SN Q0 (field 1). Each row carries the
# inverter setting, the SN relay (e²TANGO-800) setting, the measurement side, and
# the breaker that trips. Real function names — NOT ANSI 67/67N from memory.
_BUK1_COORDINATION: list[dict[str, Any]] = [
    {
        "lp": 1,
        "code": "I>",
        "name": "nadprądowe od przeciążeń",
        "inverter": "tech. producenta",
        "relay_sn": "1,2 I_bSN = 6 A → 48 A SN / 5 s",
        "measure": "SN",
        "trips": "SN Q0 pole 1",
    },
    {
        "lp": 2,
        "code": "I>>",
        "name": "nadprądowe zwarciowe",
        "inverter": "tech. producenta",
        "relay_sn": "4 I_bSN = 20 A → 160 A SN / 0,1 s",
        "measure": "SN",
        "trips": "SN Q0 pole 1",
    },
    {
        "lp": 3,
        "code": "Ust I>",
        "name": "przed wzrostem napięcia",
        "inverter": "1,1 Un = 880 V (16,5 kV) / 5 s",
        "relay_sn": "1,12 U_bSN = 112 V → 16,80 kV / 3 s",
        "measure": "SN",
        "trips": "nN Q1",
    },
    {
        "lp": 4,
        "code": "Ust II>",
        "name": "przed wzrostem napięcia",
        "inverter": "1,15 Un = 920 V (17,25 kV) / 0,05 s",
        "relay_sn": "1,15 U_bSN = 115 V → 17,25 kV / 0,3 s",
        "measure": "SN",
        "trips": "SN Q0 pole 1",
    },
    {
        "lp": 5,
        "code": "Ust I<",
        "name": "przed obniżeniem napięcia",
        "inverter": "0,8 Un = 640 V (12,00 kV) / 0,05 s",
        "relay_sn": "0,8 U_bnN = 80 V → 12,00 kV / 5 s",
        "measure": "nN",
        "trips": "nN Q1",
    },
    {
        "lp": 6,
        "code": "f>",
        "name": "przed wzrostem częstotliwości",
        "inverter": "51,5 Hz / 0,05 s",
        "relay_sn": "51,5 Hz / 0,3 s",
        "measure": "nN",
        "trips": "nN Q1",
    },
    {
        "lp": 7,
        "code": "f<",
        "name": "przed obniżeniem częstotliwości",
        "inverter": "47,5 Hz / 0,05 s",
        "relay_sn": "47,5 Hz / 0,3 s",
        "measure": "nN",
        "trips": "nN Q1",
    },
    {
        "lp": 8,
        "code": "df/dt",
        "name": "częstotliwościowe (RoCoF)",
        "inverter": "2 Hz/s / 0,05 s",
        "relay_sn": "2 Hz/s / 0,3 s",
        "measure": "nN",
        "trips": "nN Q1",
    },
    {
        "lp": 9,
        "code": "G0>",
        "name": "konduktancyjne",
        "inverter": "—",
        "relay_sn": "0,8 mS / 0,3 s",
        "measure": "SN",
        "trips": "SN Q0 pole 1",
    },
    {
        "lp": 10,
        "code": "3U0",
        "name": "zerowo-napięciowe",
        "inverter": "—",
        "relay_sn": "30 V / 5 s",
        "measure": "SN",
        "trips": "SN Q0 pole 1",
    },
    {
        "lp": 11,
        "code": "I0>",
        "name": "zerowo-prądowe",
        "inverter": "—",
        "relay_sn": "10 A / 0,2 s",
        "measure": "SN",
        "trips": "SN Q0 pole 1",
    },
    {
        "lp": 12,
        "code": "SPZ",
        "name": "samoczynne ponowne załączenie",
        "inverter": "od f>, f<, df/dt, Ust I< / 60 s",
        "relay_sn": "od f>, f<, df/dt, Ust I< / 600 s",
        "measure": "nN",
        "trips": "nN Q1",
    },
]
# Protection function CODES per device, derived from the matrix (real names).
_BUK1_SN_CODES = ["I>", "I>>", "Ust II>", "G0>", "3U0", "I0>"]  # SN Q0 (field 1) — hard trips
_BUK1_NN_CODES = ["Ust I>", "Ust I<", "f>", "f<", "df/dt", "SPZ"]  # nN Q1 — soft trips


def build_g4_pvtr() -> dict[str, Any]:
    """G4-PVTR — PV 1 MW "Buk 1" przez stację TR konsumencką — WIERNA PROJEKCJA
    realnego schematu wykonawczego + dok. 1.18 "Wykaz nastaw i zabezpieczeń".

    Stacja KOŃCOWA: jedno przyłącze SN do OSD (kabel POLA 1 → ZKSN → sieć OSD),
    transformator zasilany z POLA 2 — w SN brak wyjścia (nie przelot).
    SN: dwupolowa rozdzielnia e²TANGO-800 — POLE 1 LINIOWE (VCB: odłącznik → Q0 □
    TGI24 → CTM20 3-rdz. → VTB20 4-uzw. → POLIM-D 18-06 → ITK 224 → uziemnik;
    przekaźnik SN: I>/I>>/Ust II>/G0>/3U0/I0>; granica ZKSN na kablu zasilającym) +
    POLE 2 TRANSFORMATOROWE (SŁ2+U: rozłącznik GTR5 ◇ + uziemnik ◯ → ITK 224 →
    3×YHAKXS DO TRANSFORMATORA, który wisi pod polem; bez przekaźnika).
    nN 800 V (układ IT): Q1 □ 3WA1108 800A (I>=720A / I>>=4000A) → szyna 3×P40×10 →
    3 POLA FALOWNIKÓW (~333 kW; 560×595Wp/falownik; BTVC 315A/800V) + pole RPW-PV.
    Koordynacja trójpoziomowa (dok. 1.18) — w module zabezpieczenia, nie na płótnie.

    DC = 999,6 kWp (3×560×595Wp) = AC 999,6 kW → DC/AC ≈ 1,0 (brak oversizingu).
    Eksport = stan podstawowy; kierunek/wartość z FROZEN solvera (nie z palca).
    """
    # PV "Buk 1": 3 inverters, each 560 modules × 595 Wp = 333.2 kWp; 3×333.2 =
    # 999.6 kWp DC. Each inverter ~333 kVA AC (DC/AC ≈ 1.0).
    inv_count = 3
    modules_per_inv = 560
    wp_per_module = 595
    kwp_per_inv = modules_per_inv * wp_per_module / 1000.0  # 333.2 kWp
    p_dc_kwp = inv_count * kwp_per_inv  # 999.6 kWp
    inv_kva = kwp_per_inv  # DC/AC ≈ 1.0
    own_load_kw = 18.0  # RPW-PV potrzeby własne (TS 5 kVA + odpływy F1-F10)

    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("SN_PCC", _PV1MW_SN_KV)
    s.add_bus("NN_800", _PV1MW_NN_KV)
    s.add_line(SR_IN, "GPZ", "SN_PCC", _GRID_INFEED_R, _GRID_INFEED_X)
    s.add_transformer(
        SR_TR,
        "SN_PCC",
        "NN_800",
        hv_kv=_PV1MW_SN_KV,
        lv_kv=_PV1MW_NN_KV,
        uk_percent=6.0,
        rated_mva=1.0,
        x_over_r=4.5,  # §B-02 delta: physical R/X (κ_nN ≈ 1.53), |Z| unchanged
    )
    # Three SEPARATE inverter injections on the nN bus (each its own feeder field)
    # + the own-needs load. The solver decides the net export direction.
    inv_branch_refs = [f"sr/branch/inv{i + 1}" for i in range(inv_count)]
    for i, br in enumerate(inv_branch_refs):
        node = f"INV{i + 1}"
        s.add_bus(node, _PV1MW_NN_KV)
        s.add_line(br, "NN_800", node, _NN_FEEDER_R, _NN_FEEDER_X)
        # Each inverter injects its full AC output (DC/AC ≈ 1.0, no oversizing ⇒ AC
        # nominal = kWp). The base case (stan podstawowy) is rated export; the net
        # direction/value come from the FROZEN solver, never a hand-picked derating.
        s.add_load(node, p_mw=-kwp_per_inv / 1000.0, q_mvar=0.0)
        s.add_inverter(node, rated_kva=inv_kva, un_kv=_PV1MW_NN_KV, k_sc=_IBG_K, source_type="PV")
    s.add_load("NN_800", p_mw=own_load_kw / 1000.0, q_mvar=0.01)  # RPW-PV draw
    s.finalize_pq()

    # Hierarchy: DC/AC ≈ 1.0 ⇒ achievable AC power = AC nominal = DC nameplate. Keeping
    # P_osiągalna ≥ the solver export (≈ 0.98 MW) — a station cannot export more than it
    # can achieve. All four equal (999.6 kW) is the no-oversizing case.
    src = _pv_source(
        technology="PV 1 MW „Buk 1”",
        machine_type="IBG",
        nc_class="C",
        control_mode="Q(U)",
        p_zainst_kw=p_dc_kwp,
        pn_ac_kw=p_dc_kwp,
        p_przylacz_kw=p_dc_kwp,
        p_osiagalna_kw=p_dc_kwp,
    )
    # Override protection codes with the REAL Buk 1 function names (not ANSI).
    src["protection_codes"] = list(_BUK1_SN_CODES)
    src["coordination"] = {
        "source_ref": "dok:1.18_Wykaz_nastaw_i_zabezpieczen_Buk1",
        "levels": ["FALOWNIK (każdy)", "nN — Q1 (3WA1108)", "SN — Q0 pole 1 (e²TANGO-800)"],
        "philosophy": {
            "soft": "f>/f</df-dt, Ust I>/I< → nN Q1 (mniej inwazyjne, SPZ 600 s)",
            "hard": "zwarcia/doziemienia/Ust II> → SN Q0 pole 1 (izolacja od OSD)",
        },
        "base": {
            "i_b_sn_a": 40.0,
            "u_b_sn_kv": 15.0,
            "u_b_nn_v": 800.0,
            "in_sn_a": 38.47,
            "in_nn_a": 721.40,
            "sn_kw": 1039.23,
        },
        "matrix": _BUK1_COORDINATION,
    }
    src["schematic"] = {
        "source_ref": "schemat:stacja_TR_PV1MW_Buk1_wykonawczy",
        "sn_kv": _PV1MW_SN_KV,
        "nn_kv": _PV1MW_NN_KV,
        "transformer": "1000 kVA · 15,75/0,8 kV · POLIM-D18N",
        "nn_grid": "IT",
        "nn_main_breaker": "Q1 3WA1108 · 800 A · 1000 V · I>=720 A (0,9 In) · I>>=4000 A (4 In)",
        "pv_modules": f"JA SOLAR JAM72D40-595/MB · 595 Wp · {inv_count}×{modules_per_inv} szt = {p_dc_kwp:.1f} kWp DC",
        "inverters": f"{inv_count} × ~{kwp_per_inv:.0f} kW (BTVC 315 A/800 V na pole)",
        "dc_ac_ratio": round(p_dc_kwp / 1000.0, 3),
        "ct": {
            "type": "CTM 20",
            "ratio": "40/5/5/5 A/A",
            "ith_ka": 16.0,
            "idyn_ka": 40.0,
            "cores": ["I 5VA 0,2s(FS5) pomiar", "II 5VA 0,2s analizator", "III 5VA 5P10 zab."],
        },
        "vt": {
            "type": "VTB 20",
            "ratio": "15/√3 : 4×(0,1/√3)",
            "windings": [
                "I pomiar 0,2",
                "II pomiar 0,2",
                "III zab. 3P",
                "IV zab. 3P (otwarty trójkąt)",
            ],
        },
        "own_needs": "RPW-PV · TS 5 kVA 800/230 V · F0=HN-C20/1 · F1-F10",
    }
    # §5 P0 — OSD neutral-point earthing determines the SN single-phase earth-fault
    # current; the nN IT system carries an IMD (insulation monitoring) so the 1st earth
    # fault is signalled, not tripped (current ≈ 0). Documented model params (not painted
    # detail) — surfaced in the node readouts (Ik″1f-z) and the protection module.
    src["grid_earthing"] = {
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN",
        "neutral_point": "kompensowana",  # {izolowana | kompensowana | rezystor} — OSD SN
        "ik_1f_ka": 0.12,  # I″k 1f-z SN wg uziemienia neutralnego OSD (sieć skompensowana)
        "imd_it_nn": True,  # IMD na układzie IT nN — sygnalizacja 1. doziemienia (bez wyłączenia)
        "note_pl": "nN IT: 1. doziemienie bez prądu — IMD sygnalizuje; SN: I″k1f-z z uziemienia neutralnego OSD",
    }
    src["metering"] = _metering(
        source_ref="norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        ct_ipn_a=40.0,  # next-std ≥ I_load ≈ 38 A (PV 1 MW @ 15,75 kV)
        ct_cores=3,
        ct_type="AD11",
    )
    # nN inverter feeder fields (≥3, not one block) + Q1 main + own-needs.
    nn_fields = [
        _field(
            f"g4-inv{i + 1}",
            role="source",
            kind=f"FALOWNIK {i + 1} · ~{kwp_per_inv:.0f} kW",
            abb_cell="SDC",
            on_bus="NN_800",
            source_ref=f"enm:Generator.gen_type=pv_inverter;dok:1.18_falownik_{i + 1}",
            interface_protection=False,
        )
        for i in range(inv_count)
    ]
    return _oze_companion(
        "G4-PVTR",
        substrate=s,
        # SN withstand from CTM20 (Ith 16 kA); nN 800 V board 50 kA.
        buses=[("SN_PCC", _PV1MW_SN_KV, 16.0), ("NN_800", _PV1MW_NN_KV, 50.0)],
        pcc_bus="SN_PCC",
        source=src,
        # SN: POLE 1 LINIOWE — VCB (interface protection / hard trips, granica ZKSN
        # na kablu) + POLE 2 TRANSFORMATOROWE — SŁ2+U rozłącznik zasilający trafo.
        # Measurement is a FUNCTION inside POLE 1 (rdzeń I CTM20) — NOT a phantom
        # field. nN: Q1 main breaker + 3 inverter feeders + RPW-PV own-needs.
        fields=[
            _field(
                "g4-vcb",
                role="connection",
                kind="POLE 1 — VCB (e²TANGO-800)",
                abb_cell="CBC",
                on_bus="SN_PCC",
                source_ref="enm:Bay.bay_role=LINIA_OUT;schemat:POLE_NR_1_VCB",
                interface_protection=True,
                protection_codes=list(_BUK1_SN_CODES),
                # Apparatus stack busbar→cable (schemat POLE NR 1, dok. wykonawczy).
                apparatus=[
                    _app(
                        "vcb/q9",
                        kind="DS",
                        designation="Q9 (odłącznik szynowy)",
                        placement="UPSTREAM",
                    ),
                    _app(
                        "vcb/q0",
                        kind="CB",
                        designation="Q0",
                        catalog="TGI 24",
                        placement="MIDSTREAM",
                    ),
                    _app(
                        "vcb/ct",
                        kind="CT",
                        designation="T1.3",
                        catalog="CTM 20 · 40/5/5/5",
                        placement="MIDSTREAM",
                        source_ref="schemat:CTM20_3rdz",
                    ),
                    _app(
                        "vcb/vt",
                        kind="VT",
                        designation="TU1.3",
                        catalog="VTB 20",
                        placement="OFF_PATH",
                        source_ref="schemat:VTB20_4uzw",
                    ),
                    _app(
                        "vcb/sa",
                        kind="SURGE_ARRESTER",
                        designation="POLIM-D 18-06",
                        placement="OFF_PATH",
                    ),
                    _app(
                        "vcb/head", kind="CABLE_HEAD", designation="ITK 224", placement="DOWNSTREAM"
                    ),
                    _app("vcb/es", kind="ES", designation="uziemnik", placement="GROUND_BRANCH"),
                ],
                # Kabel zasilający z OSD wchodzi BOKIEM-L na głowicę ITK 224 (port sn_input).
                port=_port(
                    "vcb/port",
                    kind="sn_input",
                    un_kv=_PV1MW_SN_KV,
                    entry_side="BOK-L",
                    occupied_by="seg/kabel-osd",
                    cable="3×XRUHAKXS 1×70/25 mm² · L≈484 m",
                    source_ref="enm:Port.kind=sn_input;schemat:kabel_OSD",
                ),
            ),
            # POLE 2 — pole TRANSFORMATOROWE (nie „drugi kabel do OSD”): rozłącznik
            # GTR5 + uziemnik → głowica → kabel 3×YHAKXS schodzi DO TRANSFORMATORA,
            # który wisi POD tym polem. Stacja jest KOŃCOWA — w SN nie ma wyjścia.
            _field(
                "g4-sl2u",
                role="transformer",
                kind="POLE 2 — SŁ2+U (GTR5) · pole transformatorowe",
                abb_cell="SDC",
                on_bus="SN_PCC",
                source_ref="enm:Bay.bay_role=TRANSFORMATOR;schemat:POLE_NR_2_SL2U",
                interface_protection=False,
                apparatus=[
                    _app(
                        "sl2u/gtr5",
                        kind="LOAD_SWITCH",
                        designation="GTR 5 (rozłącznik)",
                        placement="MIDSTREAM",
                    ),
                    _app("sl2u/es", kind="ES", designation="uziemnik", placement="GROUND_BRANCH"),
                    _app(
                        "sl2u/head",
                        kind="CABLE_HEAD",
                        designation="ITK 224 → 3×YHAKXS do TR",
                        placement="DOWNSTREAM",
                    ),
                ],
            ),
            _field(
                "g4-q1",
                role="breaker",
                kind="Q1 nN · 3WA1108 800 A",
                abb_cell="CBC",
                on_bus="NN_800",
                source_ref="dok:1.18_karta_Q1_3WA1108",
                interface_protection=True,
                protection_codes=list(_BUK1_NN_CODES),
            ),
            *nn_fields,
            _field(
                "g4-own",
                role="load",
                kind="RPW-PV (potrzeby własne)",
                abb_cell="SDC",
                on_bus="NN_800",
                source_ref="enm:Bay.specialization=POTRZEBY_WLASNE;schemat:RPW-PV",
                interface_protection=False,
            ),
        ],
        boundary=_boundary("G-ZKSN", on_bus="SN_PCC", metered=True),
    )


# ── G5 — BESS (magazyn energii) — GENERYCZNY archetyp wg norm ───────────────────
_BESS_SN_KV = _BASE_KV  # 15 kV generic SN (NOT a specific installation)
_BESS_NN_KV = 0.4  # 0.4 kV generic nN (PCS side)


def build_g5_bess() -> dict[str, Any]:
    """G5 — BESS (magazyn energii) — GENERYCZNY archetyp wg norm (NC RfG / IRiESD /
    IEC 62933 / IEC 62619), NIE konkretna instalacja (source_ref = std:/norma:/enm:).

    Stacja KOŃCOWA: pole liniowe SN (przyłącze do OSD, granica ZKSN na kablu) + pole
    transformatorowe (trafo SN/nN pod polem) → szyna nN → n×PCS (przekształtnik
    DWUKIERUNKOWY, IBG) + potrzeby własne (HVAC/BMS). KLUCZOWA RÓŻNICA vs PV:
    DWUKIERUNKOWOŚĆ — rozładowanie (eksport, stan podstawowy) ⇄ ładowanie (pobór);
    kierunek z zamrożonego solvera. Oś ENERGII (kWh) obok osi mocy (kW).

    Zwarcie: IBG — prąd ograniczony k·In (IEC 60909-0:2016 §6.7), jak PV — NIE maszyna.
    """
    n_pcs = 2
    pcs_kw = 500.0
    p_pcs_kw = n_pcs * pcs_kw  # 1000 kW mocy PCS
    capacity_kwh = 2000.0  # magazyn 2 h (generic)
    pcs_kva = pcs_kw  # cosφ≈1 PCS
    own_load_kw = 10.0  # potrzeby własne (HVAC/BMS)

    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("SN_PCC", _BESS_SN_KV)
    s.add_bus("NN", _BESS_NN_KV)
    s.add_line(SR_IN, "GPZ", "SN_PCC", _GRID_INFEED_R, _GRID_INFEED_X)
    s.add_transformer(
        SR_TR,
        "SN_PCC",
        "NN",
        hv_kv=_BESS_SN_KV,
        lv_kv=_BESS_NN_KV,
        uk_percent=6.0,
        rated_mva=1.25,
        x_over_r=4.5,
    )
    # DISCHARGE (export) = stan podstawowy pokazany: każdy PCS oddaje moc (ujemne
    # obciążenie = generacja). Kierunek/wartość z FROZEN solvera (nie z palca).
    pcs_branch_refs = [f"sr/branch/pcs{i + 1}" for i in range(n_pcs)]
    for i, br in enumerate(pcs_branch_refs):
        node = f"PCS{i + 1}"
        s.add_bus(node, _BESS_NN_KV)
        s.add_line(br, "NN", node, _NN_FEEDER_R, _NN_FEEDER_X)
        s.add_load(node, p_mw=-pcs_kw / 1000.0, q_mvar=0.0)
        s.add_inverter(node, rated_kva=pcs_kva, un_kv=_BESS_NN_KV, k_sc=_IBG_K, source_type="BESS")
    s.add_load("NN", p_mw=own_load_kw / 1000.0, q_mvar=0.01)
    s.finalize_pq()

    src = _pv_source(
        technology="BESS (magazyn energii)",
        machine_type="IBG",
        nc_class="C",
        control_mode="P(f) · Q(U) · 2-kier.",
        p_zainst_kw=p_pcs_kw,
        pn_ac_kw=p_pcs_kw,
        p_przylacz_kw=p_pcs_kw,
        p_osiagalna_kw=950.0,
    )
    # BESS-specific: bidirectional + the ENERGY axis (kWh) alongside the power axis.
    src["bidirectional"] = True
    src["storage"] = {
        "source_ref": "std:IEC_62933;enm:Generator.gen_type=bess",
        "power_kw": p_pcs_kw,
        "capacity_kwh": capacity_kwh,
        "duration_h": round(capacity_kwh / p_pcs_kw, 2),
        "n_pcs": n_pcs,
        "pcs_kw": pcs_kw,
        "charge_kw": p_pcs_kw,
        "discharge_kw": p_pcs_kw,
        "bidirectional": True,
    }
    # §5 — SN station: OSD neutral earthing drives Ik″1f-z (SN, compensated); the IT nN
    # board carries an IMD (1st earth fault signalled).
    src["grid_earthing"] = {
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN",
        "neutral_point": "kompensowana",
        "ik_1f_ka": 0.12,
        "imd_it_nn": True,
        "note_pl": "nN IT: 1. doziemienie bez prądu — IMD; SN: I″k1f-z z uziemienia neutralnego OSD",
    }
    src["metering"] = _metering(
        source_ref="norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        ct_ipn_a=40.0,  # next-std ≥ I_load ≈ 38 A (BESS @ 15 kV)
        ct_cores=2,
    )
    nn_fields = [
        _field(
            f"g5-pcs{i + 1}",
            role="source",
            kind=f"PCS {i + 1} · {pcs_kw:.0f} kW (2-kier.)",
            abb_cell="SDC",
            on_bus="NN",
            source_ref=f"enm:Generator.gen_type=bess;std:NC_RfG_pcs_{i + 1}",
            interface_protection=False,
        )
        for i in range(n_pcs)
    ]
    return _oze_companion(
        "G5-BESS",
        substrate=s,
        # SN withstand 16 kA (generic SN board); nN 50 kA.
        buses=[("SN_PCC", _BESS_SN_KV, 16.0), ("NN", _BESS_NN_KV, 50.0)],
        pcc_bus="SN_PCC",
        source=src,
        # Stacja końcowa: pole LINIOWE (przyłącze OSD, granica na kablu) + pole
        # TRANSFORMATOROWE (trafo pod polem). nN: Q1 + n×PCS + potrzeby własne.
        # Aparaty/oznaczenia GENERYCZNE wg norm (nie katalog konkretnej instalacji).
        fields=[
            _field(
                "g5-line",
                role="connection",
                kind="POLE LINIOWE SN",
                abb_cell="CBC",
                on_bus="SN_PCC",
                source_ref="enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe",
                interface_protection=True,
                protection_codes=list(_PROTECTION_BY_MACHINE["IBG"]),
                apparatus=[
                    _app(
                        "line/ds",
                        kind="DS",
                        designation="Q1 (odłącznik szynowy)",
                        placement="UPSTREAM",
                    ),
                    _app(
                        "line/cb", kind="CB", designation="Q0 (wyłącznik SN)", placement="MIDSTREAM"
                    ),
                    _app(
                        "line/ct",
                        kind="CT",
                        designation="przekładnik prądowy",
                        placement="MIDSTREAM",
                        source_ref="std:IEC_61869_CT",
                    ),
                    _app(
                        "line/vt",
                        kind="VT",
                        designation="przekładnik napięciowy",
                        placement="OFF_PATH",
                        source_ref="std:IEC_61869_VT",
                    ),
                    _app(
                        "line/sa",
                        kind="SURGE_ARRESTER",
                        designation="ogranicznik przepięć",
                        placement="OFF_PATH",
                    ),
                    _app(
                        "line/head",
                        kind="CABLE_HEAD",
                        designation="głowica kablowa",
                        placement="DOWNSTREAM",
                    ),
                    _app("line/es", kind="ES", designation="uziemnik", placement="GROUND_BRANCH"),
                ],
                port=_port(
                    "line/port",
                    kind="sn_input",
                    un_kv=_BESS_SN_KV,
                    entry_side="BOK-L",
                    occupied_by="seg/kabel-osd",
                    cable="kabel SN do OSD (typ wg projektu)",
                    source_ref="enm:Port.kind=sn_input;std:przylacze_SN",
                ),
            ),
            _field(
                "g5-trafo",
                role="transformer",
                kind="POLE TRANSFORMATOROWE",
                abb_cell="SDC",
                on_bus="SN_PCC",
                source_ref="enm:Bay.bay_role=TRANSFORMATOR;std:IEC_62271_pole_trafo",
                interface_protection=False,
                apparatus=[
                    _app(
                        "trafo/ls",
                        kind="LOAD_SWITCH",
                        designation="rozłącznik",
                        placement="MIDSTREAM",
                    ),
                    _app("trafo/es", kind="ES", designation="uziemnik", placement="GROUND_BRANCH"),
                    _app(
                        "trafo/head",
                        kind="CABLE_HEAD",
                        designation="głowica → trafo",
                        placement="DOWNSTREAM",
                    ),
                ],
            ),
            _field(
                "g5-q1",
                role="breaker",
                kind="Q1 nN (wyłącznik główny)",
                abb_cell="CBC",
                on_bus="NN",
                source_ref="std:IEC_60947_nN_ACB",
                interface_protection=True,
                protection_codes=["I>", "I>>"],
            ),
            *nn_fields,
            _field(
                "g5-own",
                role="load",
                kind="potrzeby własne (HVAC/BMS)",
                abb_cell="SDC",
                on_bus="NN",
                source_ref="enm:Bay.specialization=POTRZEBY_WLASNE;std:potrzeby_wlasne",
                interface_protection=False,
            ),
        ],
        boundary=_boundary("G-ZKSN", on_bus="SN_PCC", metered=True),
    )


# ── G4 (kanon) — HYBRYDA PV + BESS na 15 kV (ENEA) — GENERYCZNY archetyp ─────────
# Dwa warianty współpracy PV + magazyn (NC RfG / IEC 62933 / IEC 60909; OBA źródła
# IBG §6.7 — prąd ograniczony k·In, NIE maszyna):
#   BUS — wspólna szyna SN: PV i BESS, KAŻDE za własnym trafem nN/SN, zebrane na
#         jednej szynie przyłączeniowej 15 kV (sprzężenie na SN).
#   AC  — AC-coupled: falowniki PV i PCS BESS na WSPÓLNEJ szynie nN za JEDNYM trafem
#         przyłączeniowym 15 kV (sprzężenie na nN, jedno pole transformatorowe).
# Moce: PV 1 MW (3×333 kVA) + BESS 1 MW / 2 MWh (2×500 kVA). Bilans mocy (wniosek
# przyłączeniowy): eksport PV i rozładowanie BESS mogą wystąpić jednocześnie ⇒ moc
# przyłączeniowa = suma 2 MW (współczynnik jednoczesności k=1, zachowawczo dla I″k,max).
_PVBESS_SN_KV = _BASE_KV  # 15 kV ENEA SN (przyłącze)
_PVBESS_PV_NN_KV = 0.8  # nN falowników PV (BUS) + wspólna szyna nN (AC)
_PVBESS_BESS_NN_KV = 0.4  # nN PCS BESS (wariant BUS)
_PVBESS_PV_INV_COUNT = 3
_PVBESS_PV_INV_KVA = 333.0  # 3×333 ≈ 1.0 MW PV (DC/AC ≈ 1.0)
_PVBESS_BESS_PCS_COUNT = 2
_PVBESS_BESS_PCS_KVA = 500.0  # 2×500 = 1.0 MW BESS
_PVBESS_CAPACITY_KWH = 2000.0  # 2 MWh (magazyn 2 h)
_PVBESS_PV_TR_MVA = 1.0  # trafo PV (wariant BUS)
_PVBESS_BESS_TR_MVA = 1.25  # trafo BESS (wariant BUS)
_PVBESS_AC_TR_MVA = 2.5  # wspólny trafo przyłączeniowy PV+BESS (wariant AC)


def _build_g4_pvbess(variant: str) -> dict[str, Any]:
    """G4 — hybryda PV + BESS na 15 kV; variant ∈ {"bus","ac"} (patrz nagłówek sekcji).
    Eksport (generacja PV + rozładowanie BESS) = stan podstawowy; kierunek/wartość z
    FROZEN solvera. Zwarcie: suma udziałów IBG (PV + PCS), każdy ograniczony k·In."""
    assert variant in ("bus", "ac"), f"unknown PV+BESS variant {variant}"
    p_pv_kw = _PVBESS_PV_INV_COUNT * _PVBESS_PV_INV_KVA
    p_bess_kw = _PVBESS_BESS_PCS_COUNT * _PVBESS_BESS_PCS_KVA
    p_total_kw = p_pv_kw + p_bess_kw

    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("SN_PCC", _PVBESS_SN_KV)
    s.add_line(SR_IN, "GPZ", "SN_PCC", _GRID_INFEED_R, _GRID_INFEED_X)

    def _add_sources(prefix: str, bus: str, count: int, kva: float, src_type: str, un_kv: float) -> None:
        for i in range(count):
            node = f"{prefix}{i + 1}"
            s.add_bus(node, un_kv)
            s.add_line(f"sr/branch/{prefix.lower()}{i + 1}", bus, node, _NN_FEEDER_R, _NN_FEEDER_X)
            s.add_load(node, p_mw=-kva / 1000.0, q_mvar=0.0)  # eksport (gen / rozładowanie)
            s.add_inverter(node, rated_kva=kva, un_kv=un_kv, k_sc=_IBG_K, source_type=src_type)

    if variant == "bus":
        s.add_bus("PV_NN", _PVBESS_PV_NN_KV)
        s.add_transformer("sr/branch/tr-pv", "SN_PCC", "PV_NN", hv_kv=_PVBESS_SN_KV,
                          lv_kv=_PVBESS_PV_NN_KV, uk_percent=6.0, rated_mva=_PVBESS_PV_TR_MVA, x_over_r=4.5)
        _add_sources("PV_INV", "PV_NN", _PVBESS_PV_INV_COUNT, _PVBESS_PV_INV_KVA, "PV", _PVBESS_PV_NN_KV)
        s.add_load("PV_NN", p_mw=12.0 / 1000.0, q_mvar=0.01)  # potrzeby własne PV
        s.add_bus("BESS_NN", _PVBESS_BESS_NN_KV)
        s.add_transformer("sr/branch/tr-bess", "SN_PCC", "BESS_NN", hv_kv=_PVBESS_SN_KV,
                          lv_kv=_PVBESS_BESS_NN_KV, uk_percent=6.0, rated_mva=_PVBESS_BESS_TR_MVA, x_over_r=4.5)
        _add_sources("BESS_PCS", "BESS_NN", _PVBESS_BESS_PCS_COUNT, _PVBESS_BESS_PCS_KVA, "BESS", _PVBESS_BESS_NN_KV)
        s.add_load("BESS_NN", p_mw=10.0 / 1000.0, q_mvar=0.01)  # potrzeby własne BESS (HVAC/BMS)
        buses = [("SN_PCC", _PVBESS_SN_KV, 16.0), ("PV_NN", _PVBESS_PV_NN_KV, 50.0),
                 ("BESS_NN", _PVBESS_BESS_NN_KV, 50.0)]
    else:  # ac — wspólna szyna nN za jednym trafem
        s.add_bus("NN", _PVBESS_PV_NN_KV)
        s.add_transformer(SR_TR, "SN_PCC", "NN", hv_kv=_PVBESS_SN_KV, lv_kv=_PVBESS_PV_NN_KV,
                          uk_percent=6.0, rated_mva=_PVBESS_AC_TR_MVA, x_over_r=4.5)
        _add_sources("PV_INV", "NN", _PVBESS_PV_INV_COUNT, _PVBESS_PV_INV_KVA, "PV", _PVBESS_PV_NN_KV)
        _add_sources("BESS_PCS", "NN", _PVBESS_BESS_PCS_COUNT, _PVBESS_BESS_PCS_KVA, "BESS", _PVBESS_PV_NN_KV)
        s.add_load("NN", p_mw=20.0 / 1000.0, q_mvar=0.02)  # wspólne potrzeby własne
        buses = [("SN_PCC", _PVBESS_SN_KV, 16.0), ("NN", _PVBESS_PV_NN_KV, 50.0)]

    s.finalize_pq()

    coupling_pl = (
        "sprzężenie na SN (wspólna szyna 15 kV, osobne trafa)"
        if variant == "bus"
        else "AC-coupled (wspólna szyna nN, jeden trafo przyłączeniowy)"
    )
    src = _pv_source(
        technology=f"Hybryda PV + BESS — {coupling_pl}",
        machine_type="IBG",
        nc_class="C",
        control_mode="P(f) · Q(U) · 2-kier. (BESS)",
        p_zainst_kw=p_total_kw,
        pn_ac_kw=p_total_kw,
        p_przylacz_kw=p_total_kw,
        p_osiagalna_kw=p_total_kw,
    )
    src["bidirectional"] = True  # część BESS
    src["hybrid"] = {
        "source_ref": "std:IEC_62933;std:NC_RfG;enm:Generator.gen_type=pv+bess",
        "coupling": "SN_BUS" if variant == "bus" else "AC_LV",
        "variant_pl": coupling_pl,
        "pv_kw": p_pv_kw,
        "bess_kw": p_bess_kw,
        "bess_capacity_kwh": _PVBESS_CAPACITY_KWH,
        "coincidence_factor": 1.0,  # PV gen + BESS rozładowanie mogą wystąpić jednocześnie
        "p_export_max_kw": p_total_kw,  # moc przyłączeniowa (eksport) = suma
    }
    src["storage"] = {
        "source_ref": "std:IEC_62933;enm:Generator.gen_type=bess",
        "power_kw": p_bess_kw,
        "capacity_kwh": _PVBESS_CAPACITY_KWH,
        "duration_h": round(_PVBESS_CAPACITY_KWH / p_bess_kw, 2),
        "n_pcs": _PVBESS_BESS_PCS_COUNT,
        "pcs_kw": _PVBESS_BESS_PCS_KVA,
        "charge_kw": p_bess_kw,
        "discharge_kw": p_bess_kw,
        "bidirectional": True,
    }
    src["grid_earthing"] = {
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN",
        "neutral_point": "kompensowana",
        "ik_1f_ka": 0.12,  # SN 15 kV (sieć skompensowana OSD) — stacja końcowa
        "imd_it_nn": True,  # nN IT: IMD sygnalizuje 1. doziemienie (bez wyłączenia)
        "note_pl": "nN IT: 1. doziemienie bez prądu — IMD; SN 15 kV: I″k1f-z z uziemienia neutralnego OSD",
    }
    src["metering"] = _metering(
        source_ref="norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        ct_ipn_a=100.0,  # next-std ≥ I_load ≈ 76 A (PV+BESS export @ 15 kV)
        ct_cores=2,
    )

    arch = "G4-PVBESS-BUS" if variant == "bus" else "G4-PVBESS-AC"
    pfx = "g4bus" if variant == "bus" else "g4ac"
    pv_bus = "PV_NN" if variant == "bus" else "NN"
    bess_bus = "BESS_NN" if variant == "bus" else "NN"
    fields = [
        _sn_line_connection_field(
            f"{pfx}-line", un_kv=_PVBESS_SN_KV, protection_codes=_PROTECTION_BY_MACHINE["IBG"]
        )
    ]
    if variant == "bus":
        fields.append(_field(f"{pfx}-tr-pv", role="transformer",
            kind=f"POLE TRAFO PV · {_PVBESS_PV_TR_MVA:.2f} MVA · 15/{_PVBESS_PV_NN_KV} kV",
            abb_cell="SDC", on_bus="SN_PCC",
            source_ref="enm:Bay.bay_role=TRANSFORMATOR;std:pole_trafo_PV", interface_protection=False))
        fields.append(_field(f"{pfx}-tr-bess", role="transformer",
            kind=f"POLE TRAFO BESS · {_PVBESS_BESS_TR_MVA:.2f} MVA · 15/{_PVBESS_BESS_NN_KV} kV",
            abb_cell="SDC", on_bus="SN_PCC",
            source_ref="enm:Bay.bay_role=TRANSFORMATOR;std:pole_trafo_BESS", interface_protection=False))
    else:
        fields.append(_field(f"{pfx}-tr", role="transformer",
            kind=f"POLE TRAFO · {_PVBESS_AC_TR_MVA:.2f} MVA · 15/{_PVBESS_PV_NN_KV} kV",
            abb_cell="SDC", on_bus="SN_PCC",
            source_ref="enm:Bay.bay_role=TRANSFORMATOR;std:pole_trafo_wspolny", interface_protection=False))
    for i in range(_PVBESS_PV_INV_COUNT):
        fields.append(_field(f"{pfx}-pv{i + 1}", role="source",
            kind=f"FALOWNIK PV {i + 1} · {_PVBESS_PV_INV_KVA:.0f} kW", abb_cell="SDC", on_bus=pv_bus,
            source_ref=f"enm:Generator.gen_type=pv_inverter;std:falownik_{i + 1}", interface_protection=False))
    for i in range(_PVBESS_BESS_PCS_COUNT):
        fields.append(_field(f"{pfx}-pcs{i + 1}", role="source",
            kind=f"PCS BESS {i + 1} · {_PVBESS_BESS_PCS_KVA:.0f} kW (2-kier.)", abb_cell="SDC", on_bus=bess_bus,
            source_ref=f"enm:Generator.gen_type=bess;std:pcs_{i + 1}", interface_protection=False))

    # Per-bus IBG tag (turns-ratio referral incl. cross-terms) is set consistently by
    # _oze_sc_bus / _ibg_referred_a (audit F-1) — no manual per-bus overwrite needed.
    return _oze_companion(
        arch,
        substrate=s,
        buses=buses,
        pcc_bus="SN_PCC",
        source=src,
        fields=fields,
        boundary=_boundary("G-ZKSN", on_bus="SN_PCC", metered=True),
    )


def build_g4_pvbess_bus() -> dict[str, Any]:
    """G4 (kanon) — hybryda PV + BESS, wariant WSPÓLNA SZYNA SN (sprzężenie na SN)."""
    return _build_g4_pvbess("bus")


def build_g4_pvbess_ac() -> dict[str, Any]:
    """G4 (kanon) — hybryda PV + BESS, wariant AC-COUPLED (wspólny trafo, sprzężenie nN)."""
    return _build_g4_pvbess("ac")


# ── G5 (kanon) — Wiatr Typ 4 (pełnoprzekształtnikowy) — GENERYCZNY archetyp wg norm ──
# ENEA SN catalog = {110, 20, 15, 6, 0.4} kV — 30 kV does NOT exist in ENEA's network.
# The wind SN collector is 15 kV (ENEA standard). Re-levelling 30→15 kV at a CONSTANT
# grid S_k″ DOUBLES the collector Ik″ (Ik″ = S_k″/(√3·Un); PN-EN 60909) — not cosmetic.
_WIND_COLLECTOR_KV = 15.0  # 15 kV ENEA-valid wind SN collector voltage
# F-1 (audit): the wind collector uses the FAMILY S_k″ STANDARD grid infeed (_GRID_INFEED,
# ≈245 MVA at 15 kV, X/R≈7) — the SAME as G4-PVTR/G5-BESS/G6/hybrid. S_k″ is a property of
# the ENEA connection POINT, not the DER type, so every 15 kV preset shares one infeed.
_WIND_LV_KV = 0.69  # 0.69 kV turbine generator/converter LV


def build_g5_wind_t4() -> dict[str, Any]:
    """G5 (kanon) — Wiatr Typ 4 (pełny przekształtnik) — GENERYCZNY archetyp wg norm
    (NC RfG / IEC 61400 / IEC 60909), NIE konkretna instalacja
    (source_ref = std:/norma:/enm:).

    KLUCZOWA RÓŻNICA vs PV/BESS: WEWNĘTRZNA SIEĆ KOLEKTOROWA SN — n turbin, KAŻDA z
    WŁASNYM transformatorem turbinowym (LV→kolektor), zebranych na szynie kolektora
    SN (radialnie), a NIE n falowników na jednej szynie nN za jednym trafem. Pole
    liniowe SN łączy kolektor z OSD (granica na kablu). Generacja = eksport (kierunek
    z zamrożonego solvera).

    Zwarcie: turbina pełnoprzekształtnikowa = IBG, prąd ograniczony k·In
    (IEC 60909-0:2016 §6.7) — jak PV — NIE maszyna (bramka J).
    """
    n_turbines = 3
    turbine_kw = 2000.0  # 2 MW per turbine (generic Type 4)
    turbine_kva = turbine_kw  # cosφ≈1 full converter
    p_farm_kw = n_turbines * turbine_kw  # 6000 kW
    tr_mva = 2.5  # turbine transformer

    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("SN_PCC", _WIND_COLLECTOR_KV)  # collector bus == farm SN busbar (przyłącze)
    # Collector grid infeed = FAMILY STANDARD _GRID_INFEED (ENEA 15 kV S_k″ ≈ 245 MVA,
    # X/R≈7, κ≈1.63) — shared with PV/BESS/G6 (audit F-1: S_k″ = connection-point property).
    s.add_line(SR_IN, "GPZ", "SN_PCC", _GRID_INFEED_R, _GRID_INFEED_X)
    # Each turbine: own transformer (LV→collector) + full-converter (IBG) at LV.
    # Generation (export) = negative load; direction/value from the FROZEN solver.
    for i in range(n_turbines):
        lv = f"WTG_LV_{i + 1}"
        s.add_bus(lv, _WIND_LV_KV)
        s.add_transformer(
            f"sr/branch/wtg-tr{i + 1}",
            "SN_PCC",
            lv,
            hv_kv=_WIND_COLLECTOR_KV,
            lv_kv=_WIND_LV_KV,
            uk_percent=6.0,
            rated_mva=tr_mva,
            x_over_r=4.5,  # physical turbine-TR R/X (κ_LV ≈ 1.52 < κ_collector); |Z| unchanged
        )
        s.add_load(lv, p_mw=-turbine_kw / 1000.0, q_mvar=0.0)
        s.add_inverter(
            lv, rated_kva=turbine_kva, un_kv=_WIND_LV_KV, k_sc=_IBG_K, source_type="WIND"
        )
    s.finalize_pq()

    src = _pv_source(
        technology="Wiatr — turbiny pełnoprzekształtnikowe (Typ 4)",
        machine_type="IBG",
        nc_class="C",
        control_mode="P(f) · Q(U)",
        p_zainst_kw=p_farm_kw,
        pn_ac_kw=p_farm_kw,
        p_przylacz_kw=p_farm_kw,
        p_osiagalna_kw=5700.0,
    )
    # Wind-specific: the internal SN collector network (the distinguishing block).
    src["collector"] = {
        "source_ref": "std:IEC_61400;enm:Generator.gen_type=wind_t4_collector",
        "collector_kv": _WIND_COLLECTOR_KV,
        "n_turbines": n_turbines,
        "turbine_kw": turbine_kw,
        "turbine_transformer": f"{_WIND_LV_KV}/{_WIND_COLLECTOR_KV:.0f} kV · {tr_mva} MVA",
        "turbine_lv_kv": _WIND_LV_KV,
        "topology": "radial",
    }
    # P0 — OSD neutral earthing at the MV collector drives Ik''1f-z (node ①). The turbine
    # LV (0.69 kV) sits behind a Dyn turbine transformer → its earthing is local, not the
    # station IT board, so imd_it_nn=False (no shared nN IT tier in a wind farm).
    src["grid_earthing"] = {
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN",
        "neutral_point": "kompensowana",
        # I″k1f-z for the compensated 15 kV collector: the residual current after Petersen
        # compensation ∝ Un (capacitive earth-fault current Ic of the collector cables),
        # so 0.06 kA = 0.12·(15/30) — re-levelled from the 30 kV model and DISTINCT from
        # G1 (PV, 0.12 kA): not a copy. Real Ic ⇒ network-specific; this is the archetype.
        "ik_1f_ka": 0.06,
        "imd_it_nn": False,
        "note_pl": (
            "SN kolektor 15 kV: I″k1f-z z uziemienia neutralnego OSD (kompensowana), "
            "prąd resztkowy ∝ Un; LV turbiny za trafem Dyn — uziemienie lokalne"
        ),
    }
    src["metering"] = _metering(
        source_ref="norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        ct_ipn_a=250.0,  # next-std ≥ I_load ≈ 230 A (3×2 MW @ 15 kV)
        ct_cores=2,
    )
    # Turbine BAYS sit on the COLLECTOR bus — the transformer + WTG hang behind
    # each bay (drawn per feeder), NOT a shared nN tier.
    turbine_fields = [
        _field(
            f"g6-wtg{i + 1}",
            role="source",
            kind=f"WTG {i + 1} · {turbine_kw / 1000:.0f} MW",
            abb_cell="SDC",
            on_bus="SN_PCC",
            source_ref=f"enm:Generator.gen_type=wind_t4;std:IEC_61400_wtg_{i + 1}",
            interface_protection=False,
        )
        for i in range(n_turbines)
    ]
    return _oze_companion(
        "G5-WIND-T4",
        substrate=s,
        # Collector 15 kV (board 25 kA Icw covers Ik″≈21.5 kA); a representative turbine LV (50 kA).
        buses=[("SN_PCC", _WIND_COLLECTOR_KV, 25.0), ("WTG_LV_1", _WIND_LV_KV, 50.0)],
        pcc_bus="SN_PCC",
        source=src,
        fields=[
            _field(
                "g5-line",
                role="connection",
                kind="POLE LINIOWE SN (przyłącze)",
                abb_cell="CBC",
                on_bus="SN_PCC",
                source_ref="enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe",
                interface_protection=True,
                protection_codes=list(_PROTECTION_BY_MACHINE["IBG"]),
                apparatus=[
                    _app(
                        "line/ds",
                        kind="DS",
                        designation="Q1 (odłącznik szynowy)",
                        placement="UPSTREAM",
                    ),
                    _app(
                        "line/cb", kind="CB", designation="Q0 (wyłącznik SN)", placement="MIDSTREAM"
                    ),
                    _app(
                        "line/ct",
                        kind="CT",
                        designation="przekładnik prądowy",
                        placement="MIDSTREAM",
                        source_ref="std:IEC_61869_CT",
                    ),
                    _app(
                        "line/vt",
                        kind="VT",
                        designation="przekładnik napięciowy",
                        placement="OFF_PATH",
                        source_ref="std:IEC_61869_VT",
                    ),
                    _app(
                        "line/sa",
                        kind="SURGE_ARRESTER",
                        designation="ogranicznik przepięć",
                        placement="OFF_PATH",
                    ),
                    _app(
                        "line/head",
                        kind="CABLE_HEAD",
                        designation="głowica kablowa",
                        placement="DOWNSTREAM",
                    ),
                    _app("line/es", kind="ES", designation="uziemnik", placement="GROUND_BRANCH"),
                ],
                port=_port(
                    "line/port",
                    kind="sn_input",
                    un_kv=_WIND_COLLECTOR_KV,
                    entry_side="BOK-L",
                    occupied_by="seg/kabel-osd",
                    cable="kabel SN do OSD (typ wg projektu)",
                    source_ref="enm:Port.kind=sn_input;std:przylacze_SN",
                ),
            ),
            *turbine_fields,
        ],
        boundary=_boundary("G-GPZ", on_bus="SN_PCC", metered=True),
    )


# ===========================================================================
# KROK 2 — OZE source archetypes (G family). Runda 2b: maszyny WIRUJĄCE.
# Biogaz (synchroniczna) + wiatr Typ 1 (asynchroniczna). W przeciwieństwie do
# IBG (G1-G6, prąd ograniczony k·In, §6.7) udział zwarciowy pochodzi z PEŁNEGO
# modelu maszyny (źródło za Z″, w solverze przez Y-bus) i jest rozbity per-maszyna
# z prądem wyłączeniowym (μ, async μ·q — §6.6) przez compute_machine_contributions.
# ===========================================================================
_BIOGAZ_GENSET_KW = 1000.0  # 1 MW na agregat (generyczna kogeneracja biogazowa)
_BIOGAZ_N_GENSETS = 2
_BIOGAZ_XD_PU = 0.15  # x″d — reaktancja podprzejściowa (generyczny agregat)
_BIOGAZ_COSPHI = 0.8

_WINDA_LV_KV = 0.69  # nN generatora indukcyjnego (Typ 1 — stała prędkość)
_WINDA_COLLECTOR_KV = 15.0  # szyna kolektorowa SN 15 kV (ENEA — 30 kV nie istnieje)
_WINDA_TURBINE_KW = 850.0  # 0.85 MW na turbinę (generyczny Typ 1)
_WINDA_N_TURBINES = 3
_WINDA_ILR = 6.0  # I_LR/I_rM generatora asynchronicznego
_WINDA_POLE_PAIRS = 2
_WINDA_COSPHI = 0.85
_WINDA_EFF = 0.95
_WINDA_TR_MVA = 1.0

# G6 (kanon) — wiatr Typ 3 (DFIG, generator dwustronnie zasilany). Stojan na sieci, wirnik
# przez przekształtnik częściowej mocy (~30 %). Model zwarciowy: zadziałanie crowbar
# (rotor zwarty) → maszyna indukcyjna za Z_M (§6.7); udział przekształtnika pominięty
# (zachowawczo dla I″k,max). i_LR niższe niż klatkowa (rezystancja crowbar).
_WINDA3_LV_KV = 0.69
_WINDA3_COLLECTOR_KV = 15.0  # szyna kolektorowa SN 15 kV (ENEA — 30 kV nie istnieje)
_WINDA3_TURBINE_KW = 2000.0  # 2.0 MW na turbinę (generyczny DFIG)
_WINDA3_N_TURBINES = 3
_WINDA3_ILR = 6.0  # I_LR/I_rM (FIX-SOON: crowbar→klatkowa; 6.0 dla I″k,max — nie zaniżać)
_WINDA3_POLE_PAIRS = 2
_WINDA3_COSPHI = 0.90
_WINDA3_EFF = 0.96
_WINDA3_TR_MVA = 2.5


def _sn_line_connection_field(
    field_id: str, *, un_kv: float, protection_codes: list[str]
) -> dict[str, Any]:
    """The standard SN line-connection field (pole liniowe SN do OSD): the apparatus
    stack busbar→cable (DS · CB · CT · VT · SA · głowica · uziemnik) + the cable port.
    Shared by the rotating-machine archetypes (the interface protection looks at the
    grid and lives HERE, never at the source)."""
    return _field(
        field_id,
        role="connection",
        kind="POLE LINIOWE SN (przyłącze)",
        abb_cell="CBC",
        on_bus="SN_PCC",
        source_ref="enm:Bay.bay_role=LINIA_OUT;std:IEC_62271_pole_liniowe",
        interface_protection=True,
        protection_codes=list(protection_codes),
        apparatus=[
            _app(
                f"{field_id}/ds",
                kind="DS",
                designation="Q1 (odłącznik szynowy)",
                placement="UPSTREAM",
            ),
            _app(
                f"{field_id}/cb", kind="CB", designation="Q0 (wyłącznik SN)", placement="MIDSTREAM"
            ),
            _app(
                f"{field_id}/ct",
                kind="CT",
                designation="przekładnik prądowy",
                placement="MIDSTREAM",
                source_ref="std:IEC_61869_CT",
            ),
            _app(
                f"{field_id}/vt",
                kind="VT",
                designation="przekładnik napięciowy",
                placement="OFF_PATH",
                source_ref="std:IEC_61869_VT",
            ),
            _app(
                f"{field_id}/sa",
                kind="SURGE_ARRESTER",
                designation="ogranicznik przepięć",
                placement="OFF_PATH",
            ),
            _app(
                f"{field_id}/head",
                kind="CABLE_HEAD",
                designation="głowica kablowa",
                placement="DOWNSTREAM",
            ),
            _app(f"{field_id}/es", kind="ES", designation="uziemnik", placement="GROUND_BRANCH"),
        ],
        port=_port(
            f"{field_id}/port",
            kind="sn_input",
            un_kv=un_kv,
            entry_side="BOK-L",
            occupied_by="seg/kabel-osd",
            cable="kabel SN do OSD (typ wg projektu)",
            source_ref="enm:Port.kind=sn_input;std:przylacze_SN",
        ),
    )


def build_g8_biogaz() -> dict[str, Any]:
    """G8 — Biogazownia (kogeneracja SYNCHRONICZNA) — GENERYCZNY archetyp wg norm (NC RfG / IEC
    60909), agregaty SYNCHRONICZNE (NIE IBG) przyłączone na SN (generyczna abstrakcja
    bloku agregat + podwyższenie napięcia), na szynie przyłączeniowej z polem liniowym SN do OSD.

    Zwarcie: maszyna synchroniczna = źródło za Z″_GK (IEC 60909-0:2016 §6.3) — PEŁNY
    udział maszynowy w I″k (bramka J ≠ IBG), prąd wyłączeniowy i_b z zanikiem μ (§6.6).
    Udział liczony przez compute_machine_contributions (READ-ONLY, prawdziwy solver)."""
    n_gen = _BIOGAZ_N_GENSETS
    genset_kw = _BIOGAZ_GENSET_KW
    sr_mva = (genset_kw / 1000.0) / _BIOGAZ_COSPHI  # S_rG na agregat
    p_farm_kw = n_gen * genset_kw

    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("SN_PCC", _BASE_KV)
    # Collector grid infeed = family standard _GRID_INFEED (X/R≈7), like G5/G6/G7 — audit F-1:
    # S_k″ is a connection-point property shared by all 15 kV presets, not the DER type.
    s.add_line(SR_IN, "GPZ", "SN_PCC", _GRID_INFEED_R, _GRID_INFEED_X)
    # Generacja (eksport) = ujemne obciążenie dla rozpływu; maszyna synchroniczna dla SC.
    s.add_load("SN_PCC", p_mw=-p_farm_kw / 1000.0, q_mvar=0.0)
    for _ in range(n_gen):
        s.add_synchronous_machine(
            "SN_PCC",
            sr_mva=sr_mva,
            ur_kv=_BASE_KV,
            xd_subtransient_pu=_BIOGAZ_XD_PU,
            cos_phi_r=_BIOGAZ_COSPHI,
        )
    s.finalize_pq()

    src = _pv_source(
        technology="Biogazownia — agregaty synchroniczne (kogeneracja)",
        machine_type="SYNCHRONOUS",
        nc_class="C",
        control_mode="U/Q · cosφ",
        p_zainst_kw=p_farm_kw,
        pn_ac_kw=p_farm_kw,
        p_przylacz_kw=p_farm_kw,
        p_osiagalna_kw=1900.0,
    )
    src["genset"] = {
        "source_ref": "std:IEC_60909_6_3;enm:Generator.gen_type=biogas_synchronous",
        "sn_kv": _BASE_KV,
        "n_gensets": n_gen,
        "genset_kw": genset_kw,
        "xd_subtransient_pu": _BIOGAZ_XD_PU,
        "cos_phi_r": _BIOGAZ_COSPHI,
        # Generator star-point earthing (15 kV) — the basis for stator-ground 64/59N and the
        # single-phase earth-fault current. NGR (rezystor) limits I0 of the machine.
        "neutral_earthing": "rezystor NGR (ogranicza I0 stojana)",
    }
    src["metering"] = _metering(
        source_ref="norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        ct_ipn_a=100.0,  # next-std ≥ I_load ≈ 77 A (2×1 MW @ 15 kV)
        ct_cores=2,
    )
    src["grid_earthing"] = {
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN",
        "neutral_point": "kompensowana",
        "ik_1f_ka": 0.06,
        "imd_it_nn": False,
        "note_pl": (
            "SN 15 kV: I″k1f-z z uziemienia neutralnego OSD (kompensowana), prąd resztkowy ∝ Un; "
            "agregaty synchroniczne na szynie SN — punkt gwiazdowy generatora wg karty"
        ),
    }
    # Audit #5 — FULL synchronous-generator protection, split from the NC RfG interface. The
    # machine is sustained by EXCITATION: the SC does NOT decay to the grid-only like an
    # induction machine (μ→steady-state Ik), so the dedicated generator set is mandatory.
    src["protection"] = {
        "source_ref": "norma:NC_RfG;norma:IEC_60255;std:generator_synchroniczny",
        "machine": ["87G", "40", "32", "64", "46", "21", "25", "27", "59", "81"],
        "converter": [],
    }
    genset_fields = [
        _field(
            f"g8-gen{i + 1}",
            role="source",
            kind=f"Agregat synchroniczny {i + 1} · {genset_kw / 1000:.0f} MW",
            abb_cell="SDC",
            on_bus="SN_PCC",
            source_ref=f"enm:Generator.gen_type=biogas_synchronous;std:IEC_60909_6_3_gen_{i + 1}",
            interface_protection=False,
        )
        for i in range(n_gen)
    ]
    return _oze_companion(
        "G8-BIOGAZ",
        substrate=s,
        buses=[("SN_PCC", _BASE_KV, 25.0)],
        pcc_bus="SN_PCC",
        source=src,
        fields=[
            _sn_line_connection_field(
                "g8-line", un_kv=_BASE_KV, protection_codes=_PROTECTION_BY_MACHINE["SYNCHRONOUS"]
            ),
            *genset_fields,
        ],
        boundary=_boundary("G-GPZ", on_bus="SN_PCC", metered=True),
    )


def build_g7_wind_async() -> dict[str, Any]:
    """G7 — Wiatr Typ 1 (generator ASYNCHRONICZNY, stała prędkość) — GENERYCZNY
    archetyp wg norm (NC RfG / IEC 61400 / IEC 60909). n turbin, KAŻDA z generatorem
    indukcyjnym (nN) i własnym trafem turbinowym (nN→kolektor SN), zebranych radialnie
    na szynie kolektora SN; pole liniowe SN łączy kolektor z OSD.

    Zwarcie: maszyna asynchroniczna = źródło za Z_M (IEC 60909-0:2016 §6.7) — udział
    maszynowy w I″k (bramka J ≠ IBG), prąd wyłączeniowy z zanikiem μ·q (§6.6.3); małe
    silniki mogą być pomijalne (§6.6). Udział z compute_machine_contributions."""
    n_turbines = _WINDA_N_TURBINES
    turbine_kw = _WINDA_TURBINE_KW
    p_farm_kw = n_turbines * turbine_kw

    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("SN_PCC", _WINDA_COLLECTOR_KV)
    # Collector grid infeed = family standard _GRID_INFEED (X/R≈7), like G5/G6 (audit F-1).
    s.add_line(SR_IN, "GPZ", "SN_PCC", _GRID_INFEED_R, _GRID_INFEED_X)
    for i in range(n_turbines):
        lv = f"WTG_LV_{i + 1}"
        s.add_bus(lv, _WINDA_LV_KV)
        s.add_transformer(
            f"sr/branch/wtg-tr{i + 1}",
            "SN_PCC",
            lv,
            hv_kv=_WINDA_COLLECTOR_KV,
            lv_kv=_WINDA_LV_KV,
            uk_percent=6.0,
            rated_mva=_WINDA_TR_MVA,
            x_over_r=4.5,  # F-2: physical turbine-TR R/X (κ ugruntowane, nie pk=0 X/R=∞)
        )
        s.add_load(lv, p_mw=-turbine_kw / 1000.0, q_mvar=0.0)
        s.add_asynchronous_machine(
            lv,
            pr_mw=turbine_kw / 1000.0,
            ur_kv=_WINDA_LV_KV,
            cos_phi_r=_WINDA_COSPHI,
            efficiency=_WINDA_EFF,
            i_lr_ratio=_WINDA_ILR,
            pole_pairs=_WINDA_POLE_PAIRS,
        )
    s.finalize_pq()

    src = _pv_source(
        technology="Wiatr — generatory indukcyjne (Typ 1, stała prędkość)",
        machine_type="ASYNCHRONOUS",
        nc_class="C",
        control_mode="kompensacja Q (bateria)",
        p_zainst_kw=p_farm_kw,
        pn_ac_kw=p_farm_kw,
        p_przylacz_kw=p_farm_kw,
        p_osiagalna_kw=2400.0,
    )
    src["collector"] = {
        "source_ref": "std:IEC_61400;enm:Generator.gen_type=wind_t1_collector",
        "collector_kv": _WINDA_COLLECTOR_KV,
        "n_turbines": n_turbines,
        "turbine_kw": turbine_kw,
        "turbine_transformer": f"{_WINDA_LV_KV}/{_WINDA_COLLECTOR_KV:.0f} kV · {_WINDA_TR_MVA} MVA",
        "turbine_lv_kv": _WINDA_LV_KV,
        "topology": "radial",
    }
    src["metering"] = _metering(
        source_ref="norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        ct_ipn_a=100.0,  # next-std ≥ I_load ≈ 98 A (3×0,85 MW @ 15 kV)
        ct_cores=2,
    )
    src["grid_earthing"] = {
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN",
        "neutral_point": "kompensowana",
        "ik_1f_ka": 0.06,
        "imd_it_nn": False,
        "note_pl": (
            "SN kolektor 15 kV: I″k1f-z z uziemienia neutralnego OSD (kompensowana), prąd "
            "resztkowy ∝ Un; LV turbiny za trafem Dyn — uziemienie lokalne"
        ),
    }
    # Audit #5 — MACHINE protection (split from the NC RfG interface, like G6). An induction
    # generator has no converter; 37 motoring + 32 reverse-power guard the run-as-motor / loss
    # of prime mover. (46/47 neg-seq, 49 thermal, 51 OC are the machine's own functions.)
    src["protection"] = {
        "source_ref": "norma:NC_RfG;norma:IEC_60255;std:induction_generator",
        "machine": ["46", "47", "49", "51", "37", "32"],
        "converter": [],
    }
    turbine_fields = [
        _field(
            f"g7-wtg{i + 1}",
            role="source",
            kind=f"WTG {i + 1} (async) · {turbine_kw / 1000:.2f} MW",
            abb_cell="SDC",
            on_bus="SN_PCC",
            source_ref=f"enm:Generator.gen_type=wind_t1;std:IEC_61400_wtg_{i + 1}",
            interface_protection=False,
        )
        for i in range(n_turbines)
    ]
    return _oze_companion(
        "G7-WIND-ASYNC",
        substrate=s,
        buses=[("SN_PCC", _WINDA_COLLECTOR_KV, 25.0), ("WTG_LV_1", _WINDA_LV_KV, 50.0)],
        pcc_bus="SN_PCC",
        source=src,
        fields=[
            _sn_line_connection_field(
                "g7-line",
                un_kv=_WINDA_COLLECTOR_KV,
                protection_codes=_PROTECTION_BY_MACHINE["ASYNCHRONOUS"],
            ),
            *turbine_fields,
        ],
        boundary=_boundary("G-GPZ", on_bus="SN_PCC", metered=True),
    )


def build_g6_wind_dfig() -> dict[str, Any]:
    """G6 (kanon) — Wiatr Typ 3 (DFIG, generator dwustronnie zasilany) — GENERYCZNY archetyp
    wg norm (NC RfG / IEC 61400 / IEC 60909). n turbin DFIG (stojan na sieci, wirnik
    przez przekształtnik częściowej mocy), każda z własnym trafem turbinowym (nN→kolektor
    SN), zebranych radialnie na szynie kolektora SN; pole liniowe SN łączy kolektor z OSD.

    Zwarcie: DFIG = przy zwarciu zadziałanie crowbar (rotor zwarty) → maszyna indukcyjna
    za Z_M (IEC 60909-0:2016 §6.7) — udział maszynowy w I″k (bramka J ≠ IBG), prąd
    wyłączeniowy z zanikiem μ·q (§6.6.3). Udział przekształtnika pominięty (zachowawczo
    dla I″k,max). Udział z compute_machine_contributions (założenie crowbar udokumentowane)."""
    n_turbines = _WINDA3_N_TURBINES
    turbine_kw = _WINDA3_TURBINE_KW
    p_farm_kw = n_turbines * turbine_kw

    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("SN_PCC", _WINDA3_COLLECTOR_KV)
    # Collector grid infeed: physical X/R≈7 (κ≈1.63) like Typ4 — |Z| preserved (=_SN_LINE
    # magnitude), so the collector Ik″ is UNCHANGED; only R/X → κ moves off the unphysical
    # low-X/R _SN_LINE (κ≈1.25). With x_over_r on the turbine TR (F-2) the terminal κ is
    # well-posed and the collector (grid-dominated) is the more inductive node (collector ≳ zacisk).
    s.add_line(SR_IN, "GPZ", "SN_PCC", _GRID_INFEED_R, _GRID_INFEED_X)
    for i in range(n_turbines):
        lv = f"WTG_LV_{i + 1}"
        s.add_bus(lv, _WINDA3_LV_KV)
        s.add_transformer(
            f"sr/branch/wtg-tr{i + 1}",
            "SN_PCC",
            lv,
            hv_kv=_WINDA3_COLLECTOR_KV,
            lv_kv=_WINDA3_LV_KV,
            uk_percent=6.0,
            rated_mva=_WINDA3_TR_MVA,
            x_over_r=4.5,  # F-2: physical turbine-TR R/X (κ_zacisk ugruntowane, nie pk=0 X/R=∞)
        )
        s.add_load(lv, p_mw=-turbine_kw / 1000.0, q_mvar=0.0)
        s.add_asynchronous_machine(
            lv,
            pr_mw=turbine_kw / 1000.0,
            ur_kv=_WINDA3_LV_KV,
            cos_phi_r=_WINDA3_COSPHI,
            efficiency=_WINDA3_EFF,
            i_lr_ratio=_WINDA3_ILR,
            pole_pairs=_WINDA3_POLE_PAIRS,
            wind_type_3=True,
        )
    s.finalize_pq()

    src = _pv_source(
        technology="Wiatr — generatory dwustronnie zasilane (Typ 3, DFIG)",
        machine_type="DFIG",
        nc_class="C",
        control_mode="U/Q · LVRT (crowbar)",
        p_zainst_kw=p_farm_kw,
        pn_ac_kw=p_farm_kw,
        p_przylacz_kw=p_farm_kw,
        p_osiagalna_kw=5800.0,
    )
    src["collector"] = {
        "source_ref": "std:IEC_61400;enm:Generator.gen_type=wind_t3_collector",
        "collector_kv": _WINDA3_COLLECTOR_KV,
        "n_turbines": n_turbines,
        "turbine_kw": turbine_kw,
        "turbine_transformer": f"{_WINDA3_LV_KV}/{_WINDA3_COLLECTOR_KV:.0f} kV · {_WINDA3_TR_MVA} MVA",
        "turbine_lv_kv": _WINDA3_LV_KV,
        "topology": "radial",
    }
    # Audit #5: protection split. INTERFACE (NC RfG) lives on the connection field's
    # protection_codes (the renderer derives the line-bay label from there — no hardcode).
    # 46/47 (neg-seq) are MACHINE functions, not grid-interface; the rotor-CONVERTER set is
    # named here (single truth).
    src["protection"] = {
        "source_ref": "norma:NC_RfG;norma:IEC_60255;std:DFIG_converter",
        "machine": ["46", "47", "49", "51"],
        "converter": ["RSC", "DC-chopper", "64R"],
    }
    # §5 P0 — OSD neutral-point earthing drives Ik″1f-z at the 15 kV collector (compensated;
    # ∝ Un, like Typ 4).
    src["grid_earthing"] = {
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN",
        "neutral_point": "kompensowana",
        "ik_1f_ka": 0.06,
        "imd_it_nn": False,  # brak stacyjnej szyny IT nN w farmie wiatrowej (jak Typ 4)
        "note_pl": (
            "SN kolektor 15 kV: I″k1f-z z uziemienia neutralnego OSD (kompensowana), "
            "prąd resztkowy ∝ Un; zacisk DFIG za trafem Dyn — uziemienie lokalne"
        ),
    }
    src["metering"] = _metering(
        source_ref="norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        ct_ipn_a=250.0,  # next-std ≥ I_load ≈ 230 A (3×2 MW @ 15 kV)
        ct_cores=2,
    )
    turbine_fields = [
        _field(
            f"g6-wtg{i + 1}",
            role="source",
            kind=f"WTG {i + 1} (DFIG) · {turbine_kw / 1000:.1f} MW",
            abb_cell="SDC",
            on_bus="SN_PCC",
            source_ref=f"enm:Generator.gen_type=wind_t3;std:IEC_61400_wtg_{i + 1}",
            interface_protection=False,
        )
        for i in range(n_turbines)
    ]
    return _oze_companion(
        "G6-WIND-DFIG",
        substrate=s,
        buses=[("SN_PCC", _WINDA3_COLLECTOR_KV, 25.0), ("WTG_LV_1", _WINDA3_LV_KV, 63.0)],
        pcc_bus="SN_PCC",
        source=src,
        fields=[
            _sn_line_connection_field(
                "g6-line",
                un_kv=_WINDA3_COLLECTOR_KV,
                protection_codes=_PROTECTION_BY_MACHINE["DFIG"],
            ),
            *turbine_fields,
        ],
        boundary=_boundary("G-GPZ", on_bus="SN_PCC", metered=True),
    )


def build_g9_gpo() -> dict[str, Any]:
    """G9 — GPO WIELOPOLOWE (kulminacja rodziny): RÓŻNE źródła na JEDNEJ szynie SN 15 kV — PV
    (IBG, §6.7), agregat synchroniczny (◯GS, §6.3, podtrzymanie wzbudzeniem) i maszyna
    asynchroniczna (◯G∼, §6.7, zanik μ·q). Pole liniowe (eksport→OSD) + pole pomiarowe (granica)
    + 3 pola źródłowe RÓŻNYCH typów. Zwarcie: sieć + maszyny (w Z-bus) + IBG (sprowadzony, F-1) —
    rozbicie udziału per typ (machine_type=MIXED). Wspólny _GRID_INFEED (X/R≈7), interfejs NC RfG,
    zabezpieczenia per pole."""
    pv_kva, sync_mw, async_mw = 2000.0, 2.0, 1.5
    s = _Substrate()
    s.add_slack("GPZ")
    s.add_bus("SN_PCC", _BASE_KV)
    s.add_line(SR_IN, "GPZ", "SN_PCC", _GRID_INFEED_R, _GRID_INFEED_X)
    # PV (IBG) — block transformer 0,4/15 kV; the inverter sits on the LV bus, its bounded
    # current REFERRED to 15 kV through the turns ratio (F-1) — now a PHYSICAL trafo in the path.
    s.add_bus("PV_NN", _NN_KV)
    s.add_transformer(
        "sr/branch/tr-pv", "SN_PCC", "PV_NN", hv_kv=_BASE_KV, lv_kv=_NN_KV,
        uk_percent=6.0, rated_mva=2.5, x_over_r=4.5,
    )
    s.add_inverter("PV_NN", rated_kva=pv_kva, un_kv=_NN_KV, k_sc=_IBG_K, source_type="PV")
    s.add_load("PV_NN", p_mw=-pv_kva / 1000.0, q_mvar=0.0)
    # Synchronous genset — MV machine DIRECTLY on the 15 kV busbar (no transformer, like G8).
    s.add_synchronous_machine(
        "SN_PCC", sr_mva=sync_mw / 0.8, ur_kv=_BASE_KV, xd_subtransient_pu=0.15, cos_phi_r=0.8
    )
    s.add_load("SN_PCC", p_mw=-sync_mw, q_mvar=0.0)
    # Async wind — block transformer 0,69/15 kV; the machine sits BEHIND it, so its §6.7
    # contribution at 15 kV is DAMPED by the transformer impedance (was overstated on the bus).
    s.add_bus("WIND_NN", _WINDA_LV_KV)
    s.add_transformer(
        "sr/branch/tr-wind", "SN_PCC", "WIND_NN", hv_kv=_BASE_KV, lv_kv=_WINDA_LV_KV,
        uk_percent=6.0, rated_mva=2.0, x_over_r=4.5,
    )
    s.add_asynchronous_machine(
        "WIND_NN", pr_mw=async_mw, ur_kv=_WINDA_LV_KV, cos_phi_r=0.85, efficiency=0.95,
        i_lr_ratio=6.0, pole_pairs=2,
    )
    s.add_load("WIND_NN", p_mw=-async_mw, q_mvar=0.0)
    p_export_kw = pv_kva + sync_mw * 1000.0 + async_mw * 1000.0
    s.finalize_pq()

    src = _pv_source(
        technology="GPO wielopolowe — PV (IBG) + agregat synchr. + wiatr async",
        machine_type="MIXED",
        nc_class="C",
        control_mode="U/Q · cosφ · P(f)",
        p_zainst_kw=p_export_kw,
        pn_ac_kw=p_export_kw,
        p_przylacz_kw=p_export_kw,
        p_osiagalna_kw=round(p_export_kw * 0.95, 1),
    )
    src["metering"] = _metering(
        source_ref="norma:IEC_61869-2_CT;norma:IEC_61869-3_VT",
        ct_ipn_a=250.0,  # next-std ≥ I_load ≈ 212 A (PV+synchr+async, 5,5 MW @ 15 kV)
        ct_cores=2,
    )
    src["grid_earthing"] = {
        "source_ref": "norma:PN-EN_60909_doziemienie;OSD:punkt_neutralny_SN",
        "neutral_point": "kompensowana",
        "ik_1f_ka": 0.06,
        "imd_it_nn": False,
        "note_pl": (
            "SN 15 kV: I″k1f-z z uziemienia neutralnego OSD (kompensowana); pkt neutralny "
            "agregatu synchr. przez rezystor NGR (64/59N)"
        ),
    }
    fields = [
        _sn_line_connection_field(
            "g9-line", un_kv=_BASE_KV, protection_codes=_PROTECTION_BY_MACHINE["MIXED"]
        ),
        _field(
            "g9-pv", role="source", kind="PV — falownik (IBG)", abb_cell="SDC", on_bus="PV_NN",
            source_ref="enm:Generator.gen_type=pv_inverter;std:IEC_60909_6_7",
            interface_protection=False, source_kind="IBG",
            protection_codes=["anti-islanding", "81U", "81O", "27", "59"],
        ),
        _field(
            "g9-sync", role="source", kind="Agregat synchroniczny", abb_cell="SDC", on_bus="SN_PCC",
            source_ref="enm:Generator.gen_type=synchronous;std:IEC_60909_6_3",
            interface_protection=False, source_kind="SYNCHRONOUS",
            protection_codes=["87G", "40", "32", "64", "46", "21", "25", "27", "59", "81"],
        ),
        _field(
            "g9-async", role="source", kind="Wiatr — generator async", abb_cell="SDC", on_bus="WIND_NN",
            source_ref="enm:Generator.gen_type=wind_async;std:IEC_60909_6_7",
            interface_protection=False, source_kind="ASYNCHRONOUS",
            protection_codes=["46", "47", "49", "51", "37", "32"],
        ),
    ]
    return _oze_companion(
        "G9-GPO",
        substrate=s,
        buses=[("SN_PCC", _BASE_KV, 25.0), ("PV_NN", _NN_KV, 65.0), ("WIND_NN", _WINDA_LV_KV, 50.0)],
        pcc_bus="SN_PCC",
        source=src,
        fields=fields,
        boundary=_boundary("G-GPZ", on_bus="SN_PCC", metered=True),
    )


_OZE_ARCHETYPES_2A_EXT = {
    **_OZE_ARCHETYPES_2A,
    "G4-PVTR": build_g4_pvtr,
    "G4-PVBESS-BUS": build_g4_pvbess_bus,
    "G4-PVBESS-AC": build_g4_pvbess_ac,
    "G5-BESS": build_g5_bess,
    "G5-WIND-T4": build_g5_wind_t4,
    "G8-BIOGAZ": build_g8_biogaz,
    "G7-WIND-ASYNC": build_g7_wind_async,
    "G6-WIND-DFIG": build_g6_wind_dfig,
    "G9-GPO": build_g9_gpo,
}


def build_all_oze_2a() -> dict[str, dict[str, Any]]:
    return {name: fn() for name, fn in _OZE_ARCHETYPES_2A_EXT.items()}


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


_TS_OZE_HEADER = """\
/**
 * GENERATED — DO NOT EDIT BY HAND.
 *
 * KROK 2 Runda 2a — PV OZE-source archetype companions (G1-G3). Produced by
 * running the FROZEN Newton-Raphson + IEC 60909 solvers (READ-ONLY, B-01) on
 * two-voltage OZE substrates with a REAL transformer + an IBG InverterSource
 * (IEC 60909-0:2016 §6.7 limited current). Regenerate with the module --write.
 *
 * Each carries: source meta (machine_type/technology/NC RfG class+mode/power
 * hierarchy), per-bus U + per-branch I/P/Q/S (generation = reverse export), and
 * per-bus Ik''max/min WITH the IBG limited contribution tagged (gate J: IBG is
 * NOT a synchronous machine). The renderer INTERPRETS — it never recomputes.
 */
import type { SldOzeArchetypeCompanion } from './ozeTypes';

export const OZE_ARCHETYPES_2A: Readonly<Record<string, SldOzeArchetypeCompanion>> = """


def write_oze_companions() -> str:
    out_dir = _companions_dir()
    os.makedirs(out_dir, exist_ok=True)
    body = json.dumps(build_all_oze_2a(), indent=2, sort_keys=True)
    ts = _TS_OZE_HEADER + body + ";\n"
    path = os.path.join(out_dir, "ozeArchetypes2a.ts")
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
        print(f"wrote {write_oze_companions()}")
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
