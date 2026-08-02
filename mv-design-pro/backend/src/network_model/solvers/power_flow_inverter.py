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

THE SOURCE COMPUTES FROM ITS OWN POWER (defect B, review 2026-08-01). The shaping
input is ``PQSpec.inverter_p_mw`` — the source's own active injection — never the
bus aggregate. Reading ``p_spec[idx]`` was wrong twice over: on a bus that also
carries a load the aggregate is not the source, and after the ZIP split (defect
D1) it is the LOAD BASE, so a cosφ source on a bus with a load derived its
reactive power from the LOAD's active power. The result is written as a COMPONENT
of the bus power (``bus = rest + source``), never as an assignment over someone
else's value: on a source-only bus ``rest`` is exactly 0.0, so the historical
single-source result stays bit-for-bit identical.

THE SOURCE AND THE LOAD COMPOSE (defect B, §2.2). A prosumer bus — ZIP load plus
a controlled source — is legal, and both mechanisms are applied together in NR,
GS and FD. See the exclusivity contract on ``PQSpec.inverter_control``.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

import numpy as np
from network_model.solvers.power_flow_zip import ZipCoeffs, declares_zip_split

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


@dataclass(frozen=True)
class InverterShaping:
    """WHITE BOX (Rule #2) record of the ONE-TIME shaping of one source (defect B).

    Every number an auditor needs to reproduce the shaping by hand, in pu on
    base_mva, injection convention:

        p_shaped_pu = p_source_pu * lfsm_factor
        q_shaped_pu = q_over_p * |p_shaped_pu|      (cosφ modes)

    ``p_source_pu``/``q_source_pu`` are the SOURCE's own injection — the input of
    the shaping — not the bus aggregate. ``q_shaped_pu`` is 0.0 for Q_U, whose Q
    is recomputed per iteration from |V| (see ``inverter_effective_spec``)."""

    mode: InverterMode
    p_source_pu: float
    q_source_pu: float
    p_shaped_pu: float
    q_shaped_pu: float
    lfsm_factor: float


def source_injection_pu(
    spec: object, p_spec: np.ndarray, q_spec: np.ndarray, idx: int, base_mva: float
) -> tuple[float, float]:
    """The SOURCE's own injection (pu, injection convention) — the shaping input.

    Reads ``inverter_p_mw``/``inverter_q_mvar``, which the mapping layer fills from
    the generator itself. Both None => the bus power IS the source (a source-only
    bus): the historical single-source case, kept so the callers that emit ONE PQSpec
    PER COMPONENT (``analysis_run``, ``network_wizard`` — a load and a source on one
    node collide on the duplicate-node_id check) and the frozen source-only networks
    stay byte-identical.

    The fallback is REFUSED as soon as the spec itself proves a LOAD shares the bus,
    i.e. carries a load model next to the source control:
      * ``declares_zip_split`` — the single source of truth for 'a load base exists
        apart from the net bus power' (shared with power_flow_zip, never a second
        predicate), or
      * ``zip_coeffs`` — a load voltage polynomial.
    On such a bus the aggregate is provably not the source, and inferring it would
    reproduce defect B (the source's reactive power computed from the LOAD's active
    power). Refusing is the explicit branch of the exclusivity contract for the one
    combination the input cannot express. Duck-typed, so the rule holds for every
    caller, not only the one named in the audit."""
    p_own = getattr(spec, "inverter_p_mw", None)
    q_own = getattr(spec, "inverter_q_mvar", None)
    if p_own is None and q_own is None:
        if declares_zip_split(spec) or getattr(spec, "zip_coeffs", None) is not None:
            raise ValueError(
                f"inverter control on bus {getattr(spec, 'node_id', '?')} without "
                "inverter_p_mw: the bus also carries a load model, so its power is "
                "not the source's power and cannot be used as the shaping input"
            )
        return float(p_spec[idx]), float(q_spec[idx])
    return (
        (0.0 if p_own is None else float(p_own)) / base_mva,
        (0.0 if q_own is None else float(q_own)) / base_mva,
    )


def apply_inverter_setpoint(
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    inv_specs: object,
    node_index_map: dict[str, int],
    f_hz: float,
    base_mva: float,
    zip_table: dict[int, ZipCoeffs] | None = None,
    zip_const: tuple[np.ndarray, np.ndarray] | None = None,
) -> dict[int, InverterShaping]:
    """ONE-TIME shaping of the SOURCE on each inverter bus (mirrors apply_zip_frequency):

    - scales the source's OWN active injection by the LFSM P(f) factor,
    - sets Q for the V-independent modes (Q_CONST keeps the source's setpoint;
      COSPHI_CONST and COSPHI_P derive Q from the scaled |P| OF THE SOURCE).

    Q SIGN CONVENTION (catalog, ``inverter_control_from_params``): ``q_over_p`` is
    +tan(φ) for an OVER-EXCITED source (``q_absorbing`` false — injects reactive
    power, Q > 0 on the injection convention) and -tan(φ) for an UNDER-EXCITED one
    (absorbs, Q < 0). Q_shaped = q_over_p * |P_shaped| therefore carries the sign
    of the excitation, independent of the sign of P.

    The result enters as a COMPONENT of the bus power, never as an assignment over
    the bus value (defect B — same class as the accumulation debt of
    ``build_power_spec_v2``, V12K-313):

        target[idx] = (target[idx] - source_before) + source_after

    On a source-only bus ``target[idx] - source_before`` is exactly 0.0, so the
    historical value is reproduced bit for bit (reduce-to-NR).

    WHERE the component lands is decided by ONE predicate — ``idx in zip_table``,
    the set whose spec is multiplied by the load polynomial every iteration and
    the only set for which any solver adds ``zip_const`` back. On such a bus the
    source belongs to the CONSTANT part (it is not voltage-dependent); everywhere
    else it belongs to the bus spec itself. A bus in the recompute set that does
    not declare a split has no constant part to hold the source, so the polynomial
    would scale the source injection — that is REFUSED explicitly rather than
    silently mis-scaled (exclusivity contract, PQSpec.inverter_control).

    Returns the per-bus WHITE BOX shaping record, keyed by bus index. The Q_U mode
    contributes 0.0 to the base here and is recomputed per iteration
    (build_inverter_table / inverter_effective_spec), seeded from
    ``q_source_pu`` via ``inverter_q_seed``. Duck-typed on ``.inverter_control`` /
    ``.node_id``."""
    zip_table = zip_table or {}
    shaping: dict[int, InverterShaping] = {}
    for spec in inv_specs:  # type: ignore[attr-defined]
        c = getattr(spec, "inverter_control", None)
        if c is None or c.is_passive():
            continue
        idx = node_index_map.get(spec.node_id)
        if idx is None:
            continue
        validate_inverter_control(c)
        p_src, q_src = source_injection_pu(spec, p_spec, q_spec, idx, base_mva)
        # LFSM scales the SOURCE's active injection (sign-preserving on the pu).
        factor = lfsm_factor(c, f_hz)
        p_shaped = p_src * factor
        p_inj = abs(p_shaped)
        if c.mode is InverterMode.COSPHI_CONST:
            q_shaped = c.q_over_p * p_inj
        elif c.mode is InverterMode.COSPHI_P:
            pmax = c.p_max_pu if c.p_max_pu > 0 else p_inj
            q_shaped = _cosphi_p_ratio(c, p_inj / pmax if pmax > 0 else 0.0) * p_inj
        elif c.mode is InverterMode.Q_U:
            # Voltage-dependent: the source contributes nothing to the base, its Q
            # is recomputed each iteration and ADDED to the composed bus power.
            q_shaped = 0.0
        else:
            q_shaped = q_src  # Q_CONST (+ LFSM): the source keeps its setpoint.
        if idx in zip_table:
            if zip_const is None or not declares_zip_split(spec):
                raise ValueError(
                    f"bus {spec.node_id} is in the ZIP recompute set and carries an "
                    "inverter control, but declares no load/generation split: the "
                    "load polynomial would scale the source injection"
                )
            target_p, target_q = zip_const
        else:
            target_p, target_q = p_spec, q_spec
        target_p[idx] = (target_p[idx] - p_src) + p_shaped
        target_q[idx] = (target_q[idx] - q_src) + q_shaped
        shaping[idx] = InverterShaping(
            mode=c.mode,
            p_source_pu=p_src,
            q_source_pu=q_src,
            p_shaped_pu=p_shaped,
            q_shaped_pu=q_shaped,
            lfsm_factor=factor,
        )
    return shaping


def inverter_q_seed(
    inv_table: dict[int, InverterControl] | None,
    shaping: dict[int, InverterShaping] | None,
) -> dict[int, float]:
    """Seed of the GS/FD Q(U) relaxation state: the SOURCE's own declared Q (pu).

    Seeding from ``q_spec[idx]`` (the bus power) was the same defect-B mistake in
    the sweep as in the shaping: on a prosumer bus it started the volt-var
    fixed-point from the LOAD's reactive power. On a source-only bus the two are
    equal, so the historical iteration path is unchanged.

    PREDICATE PAIRING (rule KLASA, NIE INSTANCJA §3): ``build_inverter_table``
    admits ``is_voltage_dependent()`` buses while ``apply_inverter_setpoint``
    shapes ``not is_passive()`` ones. The first set is contained in the second by
    construction (Q_U with a slope is never Q_CONST), and this function REFUSES
    rather than assumes it: a key of the recompute table with no shaping record
    would be a bus whose Q(U) state has no source to start from."""
    if not inv_table:
        return {}
    records = shaping or {}
    missing = sorted(idx for idx in inv_table if idx not in records)
    if missing:
        raise ValueError(
            f"Q(U) inverter buses {missing} have no shaping record: the volt-var "
            "recompute set and the shaping set have drifted apart"
        )
    return {idx: records[idx].q_source_pu for idx in inv_table}


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
    voltage-dependent, so only Q is recomputed (mirrors zip_effective_spec).

    The volt-var value is ADDED to the bus power, not assigned over it (defect B):
    ``apply_inverter_setpoint`` already removed the source's own declared Q from
    the base, so what is left there is everything else on the bus (the ZIP-scaled
    load). Assigning wiped that load's reactive demand from the model. On a
    source-only bus the base is exactly 0.0, so the historical value is
    reproduced bit for bit."""
    if not inv_table:
        return q_spec
    q_eff = q_spec.copy()
    v_mag = np.abs(v)
    for idx, c in inv_table.items():
        q_eff[idx] += qu_q(c, v_mag[idx])
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
