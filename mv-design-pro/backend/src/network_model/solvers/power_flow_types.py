from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from network_model.solvers.power_flow_inverter import InverterControl
from network_model.solvers.power_flow_zip import ZipCoeffs

if TYPE_CHECKING:
    from network_model.core.graph import NetworkGraph


@dataclass
class PowerFlowOptions:
    tolerance: float = 1e-8
    max_iter: int = 30
    damping: float = 1.0
    flat_start: bool = True
    validate: bool = True
    # P20a: trace_level controls white-box trace detail
    # "summary" - basic info (iter, max_mismatch, norms) - default
    # "full" - complete white-box (Jacobian, per-bus mismatch, delta_state, state_next)
    trace_level: str = "summary"


@dataclass
class SlackSpec:
    node_id: str
    u_pu: float = 1.0
    angle_rad: float = 0.0


@dataclass
class PQSpec:
    node_id: str
    p_mw: float
    q_mvar: float
    # ADR-011 (Z-ZIP-04): optional voltage-dependent (ZIP) load model.
    # None => classic constant-power PQ (reduce-to-NR invariant). When set,
    # p_mw/q_mvar are treated as the load base P0/Q0 at the reference voltage.
    zip_coeffs: ZipCoeffs | None = None
    # Defect D1 (audit 2026-08-01): the ZIP polynomial describes the LOAD only.
    # On a bus that also carries generation, p_mw/q_mvar are the NET bus power,
    # so the polynomial must not be applied to them. These fields carry the
    # LOAD-only part (same sign convention as p_mw/q_mvar); the rest of the bus
    # power is constant (a PQ generator is constant power):
    #     P_bus(V) = zip_base_p_mw * f_ZIP(V) + (p_mw - zip_base_p_mw)
    # None => the whole bus power is the ZIP base (historical path, unchanged).
    zip_base_p_mw: float | None = None
    zip_base_q_mvar: float | None = None
    # ADR-011 §5b: optional inverter/converter source control (Q(U), P(f)/LFSM,
    # cosφ modes). None => constant-PQ source (reduce-to-NR).
    #
    # EXCLUSIVITY CONTRACT, resolved explicitly (defect B, review 2026-08-01).
    # The former claim "mutually exclusive with zip_coeffs on a given bus (a bus
    # is a load XOR a source)" was FALSE in both directions: `enm.canonical_analysis`
    # builds ONE PQSpec per bus and sets both, and the three solvers then silently
    # disagreed on such a bus (GS took the ZIP branch and dropped the volt-var
    # control; NR/FD overwrote the load Q with the control value). A prosumer bus
    # — a load and a controlled source on one node — is a REAL renewable network,
    # so it is LEGAL and both mechanisms compose, in NR, GS and FD alike:
    #
    #     P_bus(V) = P_load_base * f_ZIP(V) + P_const   (P_const carries P_source)
    #     Q_bus(V) = Q_load_base * f_ZIP(V) + Q_const   (Q_const carries Q_source)
    #
    # The one combination that cannot compose — a bus in the ZIP recompute set
    # whose spec does NOT declare the load/generation split, where the load
    # polynomial would scale the source injection — is REFUSED with an explicit
    # error by ``apply_inverter_setpoint``. Never a silent branch.
    inverter_control: InverterControl | None = None
    # Defect B: the SOURCE's OWN injection at this bus — the input quantity of the
    # inverter shaping. GENERATION convention (>0 = into the grid), i.e. the same
    # convention as InverterControl itself and the OPPOSITE of p_mw/q_mvar above.
    # It must never be inferred from the bus aggregate: after the ZIP split
    # p_mw/q_mvar-derived p_spec is the LOAD base, so `abs(p_spec)` was the power
    # of the LOAD, and the source's Q came out of the load's active power.
    # None => the bus power IS the source (a source-only bus, the historical
    # single-source case; byte-identical). Refused as soon as the spec carries a
    # load model too (``zip_coeffs`` or a declared ZIP split), because that proves
    # a load shares the bus and the aggregate is not the source's power.
    inverter_p_mw: float | None = None
    inverter_q_mvar: float | None = None


@dataclass
class PVSpec:
    node_id: str
    p_mw: float
    u_pu: float
    q_min_mvar: float
    q_max_mvar: float


@dataclass
class ShuntSpec:
    node_id: str
    g_pu: float = 0.0
    b_pu: float = 0.0


@dataclass
class TransformerTapSpec:
    branch_id: str
    tap_ratio: float = 1.0


@dataclass
class BusVoltageLimitSpec:
    node_id: str
    u_min_pu: float
    u_max_pu: float


@dataclass
class BranchLimitSpec:
    branch_id: str
    s_max_mva: float | None = None
    i_max_ka: float | None = None


@dataclass
class PowerFlowInput:
    graph: Any
    base_mva: float
    slack: SlackSpec
    pq: list[PQSpec]
    pv: list[PVSpec] = field(default_factory=list)
    shunts: list[ShuntSpec] = field(default_factory=list)
    taps: list[TransformerTapSpec] = field(default_factory=list)
    bus_limits: list[BusVoltageLimitSpec] = field(default_factory=list)
    branch_limits: list[BranchLimitSpec] = field(default_factory=list)
    options: PowerFlowOptions = field(default_factory=PowerFlowOptions)
    # ADR-011 (Z-ZIP-04): system frequency for this study [Hz]. Drives the
    # frequency factor of ZIP+f loads (1 + k*(f-f0)/f0). Default 50.0 => at
    # nominal the factor is 1.0 (reduce-to-NR). Input-only; Frozen Result API
    # unchanged.
    base_frequency_hz: float = 50.0
    # Phase 30: audit2 extensions — opcjonalnie czytane przez solver wrapper
    # dla per-element adjustments (tap_changer, BESS reserved, P(f) droop, Z0/Z1).
    # NIE zmienia frozen Result API (nowe pole input, output bez zmian).
    audit2_extensions: dict[str, Any] | None = None

    def typed_graph(self) -> NetworkGraph:
        return self.graph
