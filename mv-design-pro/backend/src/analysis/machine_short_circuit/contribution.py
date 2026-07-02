"""
Per-machine short-circuit contribution — ANALYSIS / INTERPRETATION layer.

This module INTERPRETS the rotating-machine breakdown that the solver layer produces
(``network_model.solvers.machine_sc_iec60909.compute_machine_contributions`` →
``MachineShortCircuitResult``). It contains NO physics: it reads an already-computed
result and classifies it (near-/far-from-generator decay, small-motor omission, a
Polish summary) for ANY network that contains machines — not only the OZE archetypes.

Layer contract (mirrors ``analysis.power_flow_interpretation`` /
``analysis.sanity_bounds``):
  - READ-ONLY: does not mutate the solver result or the network model.
  - NO PHYSICS: interpretation only; the μ/q decay and partial currents come from
    the solver. This function takes the SOLVER RESULT, never the graph.
  - DETERMINISTIC: same ``MachineShortCircuitResult`` → identical interpretation.
  - POLISH: human-readable descriptions in Polish.
  - FROZEN-API SAFE: a standalone artifact; nothing is added to ShortCircuitResult.
"""

from __future__ import annotations

from dataclasses import dataclass

from network_model.solvers.machine_sc_iec60909 import (
    MachinePartialContribution,
    MachineShortCircuitResult,
)


def _machine_label_pl(machine_type: str) -> str:
    if machine_type == "SYNCHRONOUS":
        return "maszyna synchroniczna"
    if machine_type == "DFIG":
        return "DFIG (Typ 3, crowbar → maszyna asynchroniczna)"
    return "maszyna asynchroniczna"


def _why_pl(c: MachinePartialContribution) -> str:
    """Polish interpretation of one machine's decay behaviour (§6.6)."""
    label = _machine_label_pl(c.machine_type)
    if c.mu < 1.0:
        place = (
            f"blisko generatora (I″k/I_r={c.ratio_ik_ir:.2f} > 2): składowa AC zanika, μ={c.mu:.3f}"
        )
    else:
        place = "z dala od generatora (I″k/I_r ≤ 2): brak zaniku składowej AC, μ=1"
    if c.is_synchronous_machine:
        return f"{label} {place}; prąd wyłączeniowy i_b=μ·I″k={c.ib_a / 1000.0:.3f} kA."
    return (
        f"{label} {place}; dodatkowy zanik silnikowy q={c.q:.3f}, "
        f"prąd wyłączeniowy i_b=μ·q·I″k={c.ib_a / 1000.0:.3f} kA."
    )


@dataclass(frozen=True)
class MachineContributionFinding:
    """Interpreted SC contribution of ONE rotating machine (no physics)."""

    source_id: str
    source_name: str
    machine_type: str  # SYNCHRONOUS | ASYNCHRONOUS | DFIG
    node_id: str
    ikss_partial_ka: float
    ib_partial_ka: float
    mu: float
    q: float
    ir_ka: float
    near_generator: bool  # μ < 1 ⇒ AC component decays (near-generator)
    is_synchronous_machine: bool
    why_pl: str

    def to_dict(self) -> dict[str, object]:
        return {
            "source_id": self.source_id,
            "source_name": self.source_name,
            "machine_type": self.machine_type,
            "node_id": self.node_id,
            "ikss_partial_ka": float(self.ikss_partial_ka),
            "ib_partial_ka": float(self.ib_partial_ka),
            "mu": float(self.mu),
            "q": float(self.q),
            "ir_ka": float(self.ir_ka),
            "near_generator": self.near_generator,
            "is_synchronous_machine": self.is_synchronous_machine,
            "why_pl": self.why_pl,
        }


@dataclass(frozen=True)
class MachineContributionInterpretation:
    """Per-machine SC contribution breakdown for ANY network (IEC 60909 §6.6).

    READ-ONLY, deterministic interpretation of a ``MachineShortCircuitResult``.
    """

    fault_node_id: str
    c_factor: float
    t_min_s: float
    has_machines: bool
    machine_count: int
    ikss_machines_ka: float  # Σ partial I″k from all machines
    ib_machines_ka: float  # Σ partial breaking current (decayed μ·q)
    motors_negligible: bool  # §6.6 small-motor omission
    near_generator_count: int  # machines with μ < 1
    findings: tuple[MachineContributionFinding, ...]
    summary_pl: str

    def to_dict(self) -> dict[str, object]:
        return {
            "standard": "IEC 60909-0:2016 §6.6 (interpretacja)",
            "fault_node_id": self.fault_node_id,
            "c_factor": float(self.c_factor),
            "t_min_s": float(self.t_min_s),
            "has_machines": self.has_machines,
            "machine_count": self.machine_count,
            "ikss_machines_ka": float(self.ikss_machines_ka),
            "ib_machines_ka": float(self.ib_machines_ka),
            "motors_negligible": self.motors_negligible,
            "near_generator_count": self.near_generator_count,
            "findings": [f.to_dict() for f in self.findings],
            "summary_pl": self.summary_pl,
        }


def interpret_machine_contributions(
    machine_result: MachineShortCircuitResult,
) -> MachineContributionInterpretation:
    """Interpret a per-machine SC breakdown (READ-ONLY, no physics, deterministic).

    Takes the SOLVER result (already computed for any network) and classifies each
    machine's decay (near-/far-from-generator) plus a Polish summary. The findings
    preserve the solver's deterministic ordering (by machine id).
    """
    findings = tuple(
        MachineContributionFinding(
            source_id=c.source_id,
            source_name=c.source_name,
            machine_type=c.machine_type,
            node_id=c.node_id,
            ikss_partial_ka=c.ikss_partial_a / 1000.0,
            ib_partial_ka=c.ib_a / 1000.0,
            mu=c.mu,
            q=c.q,
            ir_ka=c.ir_a / 1000.0,
            near_generator=c.mu < 1.0,
            is_synchronous_machine=c.is_synchronous_machine,
            why_pl=_why_pl(c),
        )
        for c in machine_result.contributions
    )
    count = len(findings)
    near = sum(1 for f in findings if f.near_generator)
    ikss_machines_ka = machine_result.ikss_machines_a / 1000.0
    ib_machines_ka = machine_result.ib_machines_a / 1000.0
    if count == 0:
        summary = (
            "Brak maszyn wirujących przy tym zwarciu — udział maszynowy zerowy (§6.6 nieaktywny)."
        )
    else:
        omission = (
            " Silniki asynchroniczne pomijalne (ΣI″k,M ≤ 5 % I″k, §6.6)."
            if machine_result.motors_negligible
            else ""
        )
        summary = (
            f"{count} maszyn wirujących: ΣI″k={ikss_machines_ka:.3f} kA, "
            f"Σi_b={ib_machines_ka:.3f} kA (zanik μ·q, §6.6); "
            f"{near} blisko generatora (μ<1).{omission}"
        )
    return MachineContributionInterpretation(
        fault_node_id=machine_result.fault_node_id,
        c_factor=machine_result.c_factor,
        t_min_s=machine_result.t_min_s,
        has_machines=count > 0,
        machine_count=count,
        ikss_machines_ka=ikss_machines_ka,
        ib_machines_ka=ib_machines_ka,
        motors_negligible=machine_result.motors_negligible,
        near_generator_count=near,
        findings=findings,
        summary_pl=summary,
    )
