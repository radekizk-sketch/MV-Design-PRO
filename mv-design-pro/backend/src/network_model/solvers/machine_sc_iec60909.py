"""
Rotating-machine short-circuit contributions — IEC 60909-0:2016 §6.6.

This module is the "full machine model" layer on top of the (UNTOUCHED, frozen)
short-circuit core. The machine impedances are already in the Y-bus (see
``ybus.AdmittanceMatrixBuilder._add_machine_shunts``), so the frozen core already
yields the correct initial symmetrical current I″k, peak ip, and thermal ith for any
network containing machines. What the frozen core does NOT do — and what this module
adds — is the PER-MACHINE breakdown and the symmetrical BREAKING current i_b, which
requires the machine-specific decay factors μ (§6.6.1) and, for asynchronous motors,
q (§6.6.3). It also applies the small-motor omission rule.

WHITE BOX: every partial current is derived from the Z-bus by superposition —
    I_partial,m = c · Z_mk / (Z_kk · Z_m)   (referred to the fault-bus current base)
— which for a machine AT the fault bus reduces exactly to the terminal value c·Un/
(√3·Z″). All intermediate values (Z_mk, Z_kk, Z_m, μ, q) are exposed and auditable.

This file is NEW (not one of the 7 frozen solver files); it CALLS the frozen
``build_zbus`` read-only and never mutates the core.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from network_model.core.graph import NetworkGraph
from network_model.core.ybus import S_BASE_MVA
from network_model.solvers.short_circuit_core import build_zbus

_SQRT3 = math.sqrt(3.0)


def mu_factor(ratio_ik_ir: float, t_min_s: float) -> float:
    """AC-component decay factor μ for the symmetrical breaking current of a
    synchronous machine / motor (IEC 60909-0:2016 §6.6.1). ``ratio_ik_ir`` =
    I″k,source / I_r,source. μ = 1 for ratio ≤ 2 (far-from-generator). The four
    curves are selected by the minimum time delay t_min (0.02 / 0.05 / 0.10 / ≥0.25 s).
    """
    if ratio_ik_ir <= 2.0:
        return 1.0
    if t_min_s <= 0.035:
        mu = 0.84 + 0.26 * math.exp(-0.26 * ratio_ik_ir)
    elif t_min_s <= 0.075:
        mu = 0.71 + 0.51 * math.exp(-0.30 * ratio_ik_ir)
    elif t_min_s <= 0.175:
        mu = 0.62 + 0.72 * math.exp(-0.32 * ratio_ik_ir)
    else:
        mu = 0.56 + 0.94 * math.exp(-0.38 * ratio_ik_ir)
    return min(1.0, max(0.0, mu))


def q_factor(p_per_pole_mw: float, t_min_s: float) -> float:
    """Additional decay factor q for asynchronous motors (IEC 60909-0:2016 §6.6.3).
    m = active power per pole pair [MW]; the curve is selected by t_min; q ≤ 1.
    """
    if p_per_pole_mw <= 0.0:
        return 1.0
    ln_m = math.log(p_per_pole_mw)
    if t_min_s <= 0.035:
        q = 1.03 + 0.12 * ln_m
    elif t_min_s <= 0.075:
        q = 0.79 + 0.12 * ln_m
    elif t_min_s <= 0.175:
        q = 0.57 + 0.12 * ln_m
    else:
        q = 0.26 + 0.10 * ln_m
    return min(1.0, max(0.0, q))


@dataclass(frozen=True)
class MachinePartialContribution:
    """One machine's partial short-circuit contribution at the fault bus."""

    source_id: str
    source_name: str
    machine_type: str  # "SYNCHRONOUS" | "ASYNCHRONOUS"
    node_id: str
    z_internal_ohm: complex
    ir_a: float
    ikss_partial_a: float  # partial I″k from this machine
    ratio_ik_ir: float
    mu: float
    q: float
    ib_a: float  # symmetrical breaking current = μ·q·I″k_partial (q = 1 for synchronous)
    is_synchronous_machine: bool

    def to_dict(self) -> dict:
        return {
            "source_id": self.source_id,
            "source_name": self.source_name,
            "machine_type": self.machine_type,
            "node_id": self.node_id,
            "z_internal_ohm": {"re": self.z_internal_ohm.real, "im": self.z_internal_ohm.imag},
            "ir_a": float(self.ir_a),
            "ikss_partial_a": float(self.ikss_partial_a),
            "ratio_ik_ir": float(self.ratio_ik_ir),
            "mu": float(self.mu),
            "q": float(self.q),
            "ib_a": float(self.ib_a),
            "is_synchronous_machine": self.is_synchronous_machine,
        }


@dataclass(frozen=True)
class MachineShortCircuitResult:
    """Per-machine SC breakdown + decayed breaking current (IEC 60909 §6.6)."""

    fault_node_id: str
    c_factor: float
    t_min_s: float
    contributions: list[MachinePartialContribution] = field(default_factory=list)
    ikss_machines_a: float = 0.0  # Σ partial I″k from all machines
    ib_machines_a: float = 0.0  # Σ partial breaking current (decayed)
    motors_negligible: bool = True  # §6.6 small-motor omission
    white_box: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "standard": "IEC 60909-0:2016 §6.6",
            "fault_node_id": self.fault_node_id,
            "c_factor": float(self.c_factor),
            "t_min_s": float(self.t_min_s),
            "contributions": [c.to_dict() for c in self.contributions],
            "ikss_machines_a": float(self.ikss_machines_a),
            "ib_machines_a": float(self.ib_machines_a),
            "motors_negligible": self.motors_negligible,
            "white_box": self.white_box,
        }


def compute_machine_contributions(
    graph: NetworkGraph,
    fault_node_id: str,
    *,
    c_factor: float = 1.1,
    t_min_s: float = 0.10,
) -> MachineShortCircuitResult:
    """Per-machine partial I″k + breaking current i_b (μ/q) for a 3-phase fault.

    Reads the frozen Z-bus (``build_zbus``) READ-ONLY. Returns an empty result (no
    machines) deterministically. Partial currents follow the superposition identity
    I_partial,m = c·Z_mk/(Z_kk·Z_m) referred to the fault-bus base.
    """
    sync = graph.get_synchronous_machine_sources()
    asyn = graph.get_asynchronous_machine_sources()
    if not sync and not asyn:
        return MachineShortCircuitResult(
            fault_node_id=fault_node_id, c_factor=c_factor, t_min_s=t_min_s,
            white_box={"note": "Brak maszyn wirujących — udział zerowy (model §6.6 nieaktywny)."},
        )

    builder, z_bus = build_zbus(graph)
    index = builder.node_id_to_index
    if fault_node_id not in index:
        raise ValueError(f"Fault node '{fault_node_id}' not in Z-bus index")
    k = index[fault_node_id]
    z_kk = z_bus[k, k]
    vn_k_kv = graph.nodes[fault_node_id].voltage_level
    i_base_k = S_BASE_MVA * 1.0e3 / (_SQRT3 * vn_k_kv)  # A — fault-bus current base
    # Total I″k from the Z-bus (machines included): I_f_pu = c / Z_kk_pu.
    ikss_total_a = (c_factor / abs(z_kk)) * i_base_k

    def partial_a(node_id: str, z_internal_ohm: complex) -> float:
        m_idx = index.get(node_id)
        if m_idx is None or abs(z_internal_ohm) == 0.0:
            return 0.0
        z_m_pu = z_internal_ohm / builder.get_zbase_ohm(node_id)
        z_mk = z_bus[m_idx, k]
        i_pu = c_factor * z_mk / (z_kk * z_m_pu)
        return abs(i_pu) * i_base_k

    contributions: list[MachinePartialContribution] = []
    for m in sync:
        ip_a = partial_a(m.node_id, m.z_internal_ohm)
        ratio = ip_a / m.ir_a if m.ir_a > 0 else 0.0
        mu = mu_factor(ratio, t_min_s)
        contributions.append(MachinePartialContribution(
            source_id=m.id, source_name=m.name, machine_type="SYNCHRONOUS", node_id=m.node_id,
            z_internal_ohm=m.z_internal_ohm, ir_a=m.ir_a, ikss_partial_a=ip_a,
            ratio_ik_ir=ratio, mu=mu, q=1.0, ib_a=mu * ip_a, is_synchronous_machine=True,
        ))
    for m in asyn:
        ip_a = partial_a(m.node_id, m.z_internal_ohm)
        ratio = ip_a / m.ir_a if m.ir_a > 0 else 0.0
        mu = mu_factor(ratio, t_min_s)
        q = q_factor(m.p_per_pole_mw, t_min_s)
        contributions.append(MachinePartialContribution(
            source_id=m.id, source_name=m.name, machine_type="ASYNCHRONOUS", node_id=m.node_id,
            z_internal_ohm=m.z_internal_ohm, ir_a=m.ir_a, ikss_partial_a=ip_a,
            ratio_ik_ir=ratio, mu=mu, q=q, ib_a=mu * q * ip_a, is_synchronous_machine=False,
        ))

    ikss_machines = sum(c.ikss_partial_a for c in contributions)
    ib_machines = sum(c.ib_a for c in contributions)
    # Small-motor omission (IEC 60909-0:2016 §6.6): asynchronous motors may be
    # neglected if their combined contribution to I″k is ≤ 5 % of the total I″k.
    async_partial = sum(c.ikss_partial_a for c in contributions if not c.is_synchronous_machine)
    motors_negligible = bool(async_partial <= 0.05 * ikss_total_a) if ikss_total_a > 0 else True

    white_box = {
        "model": "IEC 60909-0:2016 §6.6 — prądy częściowe maszyn + zanik (μ, q)",
        "fault_node_id": fault_node_id,
        "z_kk_ohm": {"re": (z_kk * builder.get_zbase_ohm(fault_node_id)).real,
                     "im": (z_kk * builder.get_zbase_ohm(fault_node_id)).imag},
        "i_base_a": i_base_k,
        "ikss_total_a": ikss_total_a,
        "partial_formula": "I_partial,m = c·Z_mk/(Z_kk·Z_m) · I_base  (przy zwarciu na zaciskach → c·Un/(√3·Z″))",
        "n_synchronous": len(sync),
        "n_asynchronous": len(asyn),
        "small_motor_rule": "silniki pomijalne gdy ΣI″k,M ≤ 0.05·I″k (§6.6)",
    }
    return MachineShortCircuitResult(
        fault_node_id=fault_node_id, c_factor=c_factor, t_min_s=t_min_s,
        contributions=contributions, ikss_machines_a=ikss_machines, ib_machines_a=ib_machines,
        motors_negligible=motors_negligible, white_box=white_box,
    )
