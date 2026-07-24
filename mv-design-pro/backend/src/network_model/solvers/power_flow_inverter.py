"""Inverter/converter source control model for power flow (ADR-011 §5b).

Voltage/frequency-dependent GENERATION, the source-side counterpart of the ZIP
load model. An inverter (PV/BESS/wind) is a U/f-dependent node too — it must be
modelled in the same power flow, not exempted as "generation".

Control modes (NC RfG, canon §8.7), all expressed on the solver's injection
convention (positive = into the grid) in per-unit on base_mva:

    Q_CONST     : Q = q_set                       (classic constant PQ — the off case)
    COSPHI_CONST: Q = q_over_p * |P|              (fixed power factor; sign = over/under-excited)
    COSPHI_P    : Q = ratio(P) * |P|              (power factor varies with P, piecewise)
    Q_U         : Q = volt-var droop of |V|        (the only VOLTAGE-dependent mode)

P(f) / LFSM-O/U is a one-time frequency scaling of the active injection (system
frequency is a fixed study input, exactly like ZIP P(f)).

Reduce-to-NR invariant: Q_CONST with no LFSM at f=f0 leaves p_spec/q_spec
untouched, so a network with no active characteristic is byte-identical to the
classic constant-PQ solve. The Q(U) droop uses the same deadband_low/high +
slope_pu_per_pu representation as the Q(U) proof pack (single source of truth).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

import numpy as np

_TOL = 1e-9


class InverterMode(StrEnum):
    Q_CONST = "Q_CONST"
    COSPHI_CONST = "COSPHI_CONST"
    COSPHI_P = "COSPHI_P"
    Q_U = "Q_U"


@dataclass(frozen=True)
class InverterControl:
    """Per-source control characteristic, in per-unit on base_mva (injection sign).

    All powers are injection-convention pu (P>0 generation). Built from the
    catalog via ``inverter_control_from_params`` (physical units -> pu)."""

    mode: InverterMode = InverterMode.Q_CONST
    # cosphi modes: signed Q/|P| ratio (>0 injects Q / over-excited, <0 absorbs).
    q_over_p: float = 0.0
    # COSPHI_P: ascending points (p_frac_of_pmax, q_over_p_ratio); piecewise-linear.
    cosphi_p_points: tuple[tuple[float, float], ...] = ()
    p_max_pu: float = 0.0  # rated P (pu on base_mva) for the COSPHI_P fraction; 0 => use |P|
    # Q(U) volt-var droop (matches the Q(U) proof-pack representation):
    qu_deadband_low_pu: float = 1.0
    qu_deadband_high_pu: float = 1.0
    qu_slope_pu_per_pu: float = 0.0
    qu_q_min_pu: float = 0.0  # most absorbing (<=0)
    qu_q_max_pu: float = 0.0  # most injecting (>=0)
    # P(f) / LFSM (one-time frequency scaling), applied on top of any mode:
    lfsm_droop_pct: float = 0.0  # %Pn per %f; 0 = off
    lfsm_deadband_hz: float = 0.0
    lfsm_allow_increase: bool = False  # LFSM-U (storage) may raise P below f0
    f0_hz: float = 50.0

    def is_voltage_dependent(self) -> bool:
        """True only when Q follows |V| (Q_U with a real slope) — the per-iteration set."""
        return self.mode is InverterMode.Q_U and self.qu_slope_pu_per_pu != 0.0

    def has_frequency_dependence(self) -> bool:
        return self.lfsm_droop_pct != 0.0

    def is_passive(self) -> bool:
        """Constant-PQ at nominal frequency => no recompute (reduce-to-NR)."""
        return self.mode is InverterMode.Q_CONST and not self.has_frequency_dependence()


def lfsm_factor(c: InverterControl, f_hz: float) -> float:
    """One-time P(f) multiplier (LFSM-O reduces P above f0+deadband; LFSM-U may
    raise P below f0-deadband if allowed). 1.0 inside the deadband or when off."""
    if c.lfsm_droop_pct == 0.0:
        return 1.0
    df = f_hz - c.f0_hz
    if df > c.lfsm_deadband_hz:
        excess = (df - c.lfsm_deadband_hz) / c.f0_hz
        return max(0.0, 1.0 - excess / (c.lfsm_droop_pct / 100.0))
    if df < -c.lfsm_deadband_hz and c.lfsm_allow_increase:
        excess = (-df - c.lfsm_deadband_hz) / c.f0_hz
        return 1.0 + excess / (c.lfsm_droop_pct / 100.0)
    return 1.0


def qu_q(c: InverterControl, v_pu: float) -> float:
    """Volt-var Q injection (pu) at terminal |V|: zero in the deadband, then
    -slope*(V-band) outside it, clamped to [q_min, q_max]. High V => absorb."""
    if v_pu > c.qu_deadband_high_pu:
        q = -c.qu_slope_pu_per_pu * (v_pu - c.qu_deadband_high_pu)
    elif v_pu < c.qu_deadband_low_pu:
        q = -c.qu_slope_pu_per_pu * (v_pu - c.qu_deadband_low_pu)
    else:
        return 0.0
    return float(min(c.qu_q_max_pu, max(c.qu_q_min_pu, q)))


def qu_dq_dv(c: InverterControl, v_pu: float) -> float:
    """d(Q_inject)/dV of the volt-var curve: -slope in the active region, 0 in the
    deadband or where clamped (used for the Jacobian, mirrors ZIP ∂Q/∂V)."""
    if c.qu_deadband_low_pu <= v_pu <= c.qu_deadband_high_pu:
        return 0.0
    if v_pu > c.qu_deadband_high_pu:
        q_unclamped = -c.qu_slope_pu_per_pu * (v_pu - c.qu_deadband_high_pu)
    else:
        q_unclamped = -c.qu_slope_pu_per_pu * (v_pu - c.qu_deadband_low_pu)
    if q_unclamped >= c.qu_q_max_pu - _TOL or q_unclamped <= c.qu_q_min_pu + _TOL:
        return 0.0
    return -c.qu_slope_pu_per_pu


def _cosphi_p_ratio(c: InverterControl, p_frac: float) -> float:
    """Piecewise-linear Q/|P| ratio at the given P fraction (of pmax)."""
    pts = c.cosphi_p_points
    if not pts:
        return c.q_over_p
    if p_frac <= pts[0][0]:
        return pts[0][1]
    if p_frac >= pts[-1][0]:
        return pts[-1][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:], strict=False):
        if x0 <= p_frac <= x1:
            t = (p_frac - x0) / (x1 - x0) if x1 > x0 else 0.0
            return y0 + t * (y1 - y0)
    return pts[-1][1]


def validate_inverter_control(c: InverterControl) -> None:
    """Reject malformed control (no guessing — Rule: physics rejects bad input)."""
    if c.f0_hz <= 0.0:
        raise ValueError(f"inverter f0_hz must be > 0, got {c.f0_hz}")
    if c.lfsm_droop_pct < 0.0:
        raise ValueError(f"inverter lfsm_droop_pct must be >= 0, got {c.lfsm_droop_pct}")
    if c.mode is InverterMode.Q_U:
        if c.qu_deadband_low_pu > c.qu_deadband_high_pu:
            raise ValueError("Q(U) deadband_low must be <= deadband_high")
        if c.qu_slope_pu_per_pu < 0.0:
            raise ValueError("Q(U) slope must be >= 0 (sign is applied by the curve)")
        if c.qu_q_min_pu > c.qu_q_max_pu:
            raise ValueError("Q(U) q_min must be <= q_max")
    if c.mode is InverterMode.COSPHI_P:
        xs = [x for x, _ in c.cosphi_p_points]
        if xs != sorted(xs):
            raise ValueError("COSPHI_P points must be ascending in p_frac")


def apply_inverter_setpoint(
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    inv_specs: object,
    node_index_map: dict[str, int],
    f_hz: float,
) -> None:
    """ONE-TIME base shaping of inverter buses (mirrors apply_zip_frequency):

    - scales the active injection by the LFSM P(f) factor,
    - sets Q for the V-independent modes (Q_CONST keeps the setpoint; COSPHI_CONST
      and COSPHI_P set Q from the scaled |P|).

    The Q_U mode is left for the per-iteration recompute (build_inverter_table /
    inverter_effective_spec). Duck-typed on ``.inverter_control`` / ``.node_id``."""
    for spec in inv_specs:  # type: ignore[attr-defined]
        c = getattr(spec, "inverter_control", None)
        if c is None or c.is_passive():
            continue
        idx = node_index_map.get(spec.node_id)
        if idx is None:
            continue
        validate_inverter_control(c)
        # LFSM scales the active injection (sign-preserving on the injection pu).
        p_spec[idx] *= lfsm_factor(c, f_hz)
        p_inj = abs(p_spec[idx])
        if c.mode is InverterMode.COSPHI_CONST:
            q_spec[idx] = c.q_over_p * p_inj
        elif c.mode is InverterMode.COSPHI_P:
            pmax = c.p_max_pu if c.p_max_pu > 0 else p_inj
            ratio = _cosphi_p_ratio(c, p_inj / pmax if pmax > 0 else 0.0)
            q_spec[idx] = ratio * p_inj
        # Q_CONST: q_spec already holds the setpoint. Q_U: handled per iteration.


def build_inverter_table(
    inv_specs: object, node_index_map: dict[str, int]
) -> dict[int, InverterControl]:
    """Voltage-dependent inverter buses (Q_U) keyed by bus index — the per-iteration
    recompute set. Empty => classic path (reduce-to-NR). Mirrors build_zip_table."""
    table: dict[int, InverterControl] = {}
    for spec in inv_specs:  # type: ignore[attr-defined]
        c = getattr(spec, "inverter_control", None)
        if c is None or not c.is_voltage_dependent():
            continue
        idx = node_index_map.get(spec.node_id)
        if idx is None:
            continue
        validate_inverter_control(c)
        table[idx] = c
    return table


def inverter_effective_spec(
    q_spec: np.ndarray,
    v: np.ndarray,
    inv_table: dict[int, InverterControl] | None,
) -> np.ndarray:
    """Recompute Q at Q_U inverter buses from the current |v| (per iteration).
    Returns q_spec unchanged when the table is empty (reduce-to-NR). P is not
    voltage-dependent, so only Q is recomputed (mirrors zip_effective_spec)."""
    if not inv_table:
        return q_spec
    q_eff = q_spec.copy()
    v_mag = np.abs(v)
    for idx, c in inv_table.items():
        q_eff[idx] = qu_q(c, v_mag[idx])
    return q_eff


def inverter_relax_alpha(c: InverterControl) -> float:
    """Under-relaxation factor for the GS/FD Q(U) fixed-point recompute, scaled
    inversely with the volt-var slope so the fixed-point gain stays < 1 at steep
    slopes (where GS/FD lack NR's volt-var Jacobian feedback). 1.0 for gentle
    slopes (no damping). NR does not use this — it has the ∂Q/∂V Jacobian term."""
    return min(1.0, 1.0 / max(1.0, c.qu_slope_pu_per_pu))


def inverter_relax_q(
    q_state: dict[int, float],
    v: np.ndarray,
    inv_table: dict[int, InverterControl] | None,
) -> None:
    """In-place under-relaxed update of the per-bus Q(U) state toward qu_q(|v|),
    for GS/FD convergence at steep slopes (a documented white-box convergence aid,
    like GS's SOR). Seed q_state[idx] from the base q_spec before the iteration
    loop. The converged value equals qu_q(v*), so parity with NR and reduce-to-NR
    are preserved — only the iteration path is damped."""
    if not inv_table:
        return
    v_mag = np.abs(v)
    for idx, c in inv_table.items():
        alpha = inverter_relax_alpha(c)
        q_state[idx] = (1.0 - alpha) * q_state[idx] + alpha * qu_q(c, v_mag[idx])


def inverter_control_from_params(
    params: dict | None, base_mva: float, sn_mva: float | None = None
) -> InverterControl | None:
    """Build an InverterControl (pu on base_mva) from a source's catalog-materialized
    params (Rule #10). Returns None for a passive constant-PQ source. Q limits are
    given in Mvar; cosphi -> signed Q/|P| ratio; Q(U) slope is already pu/pu."""
    if not params:
        return None
    mode_raw = str(params.get("control_mode") or "Q_CONST").upper().replace("Φ", "PHI")
    mode_map = {
        "Q_CONST": InverterMode.Q_CONST,
        "COSPHI_CONST": InverterMode.COSPHI_CONST,
        "COSPHI(P)": InverterMode.COSPHI_P,
        "COSPHI_P": InverterMode.COSPHI_P,
        "Q(U)": InverterMode.Q_U,
        "Q_U": InverterMode.Q_U,
        # V12K-051 (G-OZE-PF): most języka — kanoniczny enum domeny/katalogu jest
        # POLSKI (network_model/core/generator.ControlMode). Bez tego mapowania
        # STALY_COS_PHI/Q_OD_U wpadały w default Q_CONST (pasywne) → wybór trybu
        # regulacji OZE nie wpływał na rozpływ mocy (forward-phantom).
        "STALY_COS_PHI": InverterMode.COSPHI_CONST,
        "Q_OD_U": InverterMode.Q_U,
        # P_OD_U = P(U): redukcja mocy czynnej przy przepięciu. W ustalonym punkcie
        # pracy (V≈1 pu) krzywa nieaktywna → w steady-state PF traktowane jak pasywne
        # (brak wpływu na Q). Pełny model P(U)-curtailment = osobna faza.
        "P_OD_U": InverterMode.Q_CONST,
        "WYLACZONE": InverterMode.Q_CONST,
    }
    mode = mode_map.get(mode_raw, InverterMode.Q_CONST)

    def _q_over_p(cosphi: float, absorbing: bool) -> float:
        cosphi = max(-1.0, min(1.0, cosphi))
        tan_phi = (max(0.0, 1.0 - cosphi * cosphi)) ** 0.5 / cosphi if cosphi != 0 else 0.0
        return -abs(tan_phi) if absorbing else abs(tan_phi)

    absorbing = bool(params.get("q_absorbing", False))
    q_over_p = _q_over_p(float(params.get("cosphi", 1.0)), absorbing)
    raw_pts = params.get("cosphi_p_points") or ()
    cosphi_p_points = tuple((float(x), _q_over_p(float(cp), absorbing)) for x, cp in raw_pts)
    qmin = float(params.get("qu_q_min_mvar", params.get("qmin_mvar", 0.0))) / base_mva
    qmax = float(params.get("qu_q_max_mvar", params.get("qmax_mvar", 0.0))) / base_mva

    control = InverterControl(
        mode=mode,
        q_over_p=q_over_p,
        cosphi_p_points=cosphi_p_points,
        p_max_pu=float(params.get("pmax_mw", 0.0)) / base_mva,
        qu_deadband_low_pu=float(params.get("qu_deadband_low_pu", 1.0)),
        qu_deadband_high_pu=float(params.get("qu_deadband_high_pu", 1.0)),
        qu_slope_pu_per_pu=float(params.get("qu_slope_pu_per_pu", 0.0)),
        qu_q_min_pu=qmin,
        qu_q_max_pu=qmax,
        lfsm_droop_pct=float(params.get("lfsm_droop_pct", 0.0)),
        lfsm_deadband_hz=float(params.get("lfsm_deadband_hz", 0.0)),
        lfsm_allow_increase=bool(params.get("lfsm_allow_increase", False)),
        f0_hz=float(params.get("f0_hz", 50.0)),
    )
    if control.is_passive():
        return None
    # V12K-051 (G-OZE-PF): tryb nazwany, ale bez MATERIALNEGO efektu = pasywny → None.
    # Konieczne przy moście języka: STALY_COS_PHI@unity / Q_OD_U bez nachylenia dają
    # zerowe Q; zwrócenie None (zamiast control wymuszającego Q=0) zachowuje wynik
    # PF bajt-w-bajt jak przed dodaniem aliasów (determinizm dla źródeł domyślnych).
    _cosphi_zero = (
        control.mode in (InverterMode.COSPHI_CONST, InverterMode.COSPHI_P)
        and abs(control.q_over_p) < 1e-12
        and not control.cosphi_p_points
    )
    _qu_zero = (
        control.mode is InverterMode.Q_U
        and abs(control.qu_slope_pu_per_pu) < 1e-12
        and abs(control.qu_q_min_pu) < 1e-12
        and abs(control.qu_q_max_pu) < 1e-12
    )
    if (_cosphi_zero or _qu_zero) and not control.has_frequency_dependence():
        return None
    validate_inverter_control(control)
    return control
