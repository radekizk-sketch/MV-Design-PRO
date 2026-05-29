from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

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
