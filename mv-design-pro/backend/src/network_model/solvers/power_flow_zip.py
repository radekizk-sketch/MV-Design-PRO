"""ZIP load model — voltage-dependent load polynomial for power flow.

WHITE BOX (Rule #2): pure, auditable functions. The polynomial and its
derivative are exposed so the Newton-Raphson solver can build both the
voltage-dependent injection and the Jacobian correction term.

Physical model (per ADR-011, invariant Z-ZIP-04):

    P_load(V) = P0 * [ a_p*(V/V0)^2 + b_p*(V/V0) + c_p ]    (Z + I + P)
    Q_load(V) = Q0 * [ a_q*(V/V0)^2 + b_q*(V/V0) + c_q ]

with a + b + c = 1 for each of P and Q. The default (a=b=0, c=1) is constant
power, i.e. identical to the classic PQ load — this is the reduce-to-NR
invariant that keeps the frozen solver byte-identical when no ZIP load exists.

The polynomial describes the LOAD only. A bus that also carries generation is
split into two components (defect D1, audit 2026-08-01):

    P_bus(V) = -P_load*f_ZIP(V) + P_gen        (a PQ generator is constant power)

so the specified injection of such a bus is a ZIP-scaled base plus a constant
part. ``split_zip_constant_part`` performs that split once, before the iteration,
and ``zip_effective_spec`` adds the constant part back at each recompute. With no
generation on a ZIP bus the split is empty and every code path below is the
historical one, bit for bit.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

_SUM_TOL = 1e-6


@dataclass(frozen=True)
class ZipCoeffs:
    """Voltage- and frequency-dependent load coefficients for one load.

    Voltage (ZIP): a=Z, b=I, c=P share (a+b+c=1), referenced to ``v0_pu``.
    Frequency: linear sensitivities ``k_pf``/``k_qf`` referenced to ``f0_hz``.
    """

    a_p: float
    b_p: float
    c_p: float
    a_q: float
    b_q: float
    c_q: float
    v0_pu: float = 1.0
    k_pf: float = 0.0
    k_qf: float = 0.0
    f0_hz: float = 50.0

    def is_constant_power(self) -> bool:
        """True when there is no VOLTAGE dependence (a=b=0) — i.e. no per-iteration
        recompute is needed. Frequency dependence is a one-time base scaling and is
        handled separately."""
        return self.a_p == 0.0 and self.b_p == 0.0 and self.a_q == 0.0 and self.b_q == 0.0

    def has_frequency_dependence(self) -> bool:
        return self.k_pf != 0.0 or self.k_qf != 0.0


def validate_zip_coeffs(c: ZipCoeffs) -> None:
    """Validate the ZIP polynomial (Rule: no guessing — reject malformed input)."""
    if c.v0_pu <= 0.0:
        raise ValueError(f"ZIP v0_pu must be > 0, got {c.v0_pu}")
    if c.f0_hz <= 0.0:
        raise ValueError(f"ZIP f0_hz must be > 0, got {c.f0_hz}")
    for label, a, b, k in (("P", c.a_p, c.b_p, c.c_p), ("Q", c.a_q, c.b_q, c.c_q)):
        for name, val in ((f"a_{label}", a), (f"b_{label}", b), (f"c_{label}", k)):
            if not (0.0 <= val <= 1.0):
                raise ValueError(f"ZIP {name} must be in [0, 1], got {val}")
        if abs(a + b + k - 1.0) > _SUM_TOL:
            raise ValueError(
                f"ZIP {label} coefficients must sum to 1, got {a + b + k} (a={a}, b={b}, c={k})"
            )


def zip_factor(a: float, b: float, c: float, v_pu: float, v0_pu: float) -> float:
    """Polynomial multiplier P_load(V)/P0 = a*(V/V0)^2 + b*(V/V0) + c."""
    r = v_pu / v0_pu
    return a * r * r + b * r + c


def zip_factor_derivative(a: float, b: float, v_pu: float, v0_pu: float) -> float:
    """d/dV of the multiplier = 2*a*V/V0^2 + b/V0 (used for the Jacobian term)."""
    return 2.0 * a * v_pu / (v0_pu * v0_pu) + b / v0_pu


def build_zip_table(pq_specs: object, node_index_map: dict[str, int]) -> dict[int, ZipCoeffs]:
    """Validated VOLTAGE-dependent ZIP table keyed by bus index (per-iteration
    recompute set). Frequency-only loads are excluded here — their constant factor
    is handled once by apply_zip_frequency. Empty => classic path (reduce-to-NR).
    Shared by NR/GS/FD; duck-typed on .zip_coeffs / .node_id."""
    table: dict[int, ZipCoeffs] = {}
    for spec in pq_specs:  # type: ignore[attr-defined]
        c = getattr(spec, "zip_coeffs", None)
        if c is None or c.is_constant_power():
            continue
        idx = node_index_map.get(spec.node_id)
        if idx is None:
            continue
        validate_zip_coeffs(c)
        table[idx] = c
    return table


def split_zip_constant_part(
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    pq_specs: object,
    node_index_map: dict[str, int],
    base_mva: float,
) -> tuple[np.ndarray, np.ndarray] | None:
    """Split a ZIP bus into its LOAD base and its CONSTANT part (defect D1).

    The ZIP polynomial belongs to the load alone; generation on the same bus is
    constant power. A spec that declares ``zip_base_p_mw``/``zip_base_q_mvar``
    (the load-only part, same sign convention as ``p_mw``/``q_mvar``) is rebased
    IN PLACE: ``p_spec``/``q_spec`` keep only the load base, and the remainder
    (generation) is returned as the constant part, so that

        p_eff = p_base * f_ZIP(V) + p_const     (p_base + p_const == p_spec)

    Returns None when no bus declares a non-trivial split — then p_spec/q_spec
    are untouched and every caller runs the historical single-multiplication
    path bit for bit (reduce-to-NR).

    Must run BEFORE apply_zip_frequency, so the load frequency factor scales the
    load base only. Duck-typed on ``.zip_base_p_mw``/``.zip_base_q_mvar``."""
    p_const = np.zeros_like(p_spec)
    q_const = np.zeros_like(q_spec)
    split_found = False
    for spec in pq_specs:  # type: ignore[attr-defined]
        base_p = getattr(spec, "zip_base_p_mw", None)
        base_q = getattr(spec, "zip_base_q_mvar", None)
        if base_p is None and base_q is None:
            continue
        idx = node_index_map.get(spec.node_id)
        if idx is None:
            continue
        # Same construction as build_power_spec(_v2): injection convention, pu.
        p_base_pu = -(spec.p_mw if base_p is None else float(base_p)) / base_mva
        q_base_pu = -(spec.q_mvar if base_q is None else float(base_q)) / base_mva
        p_rest = p_spec[idx] - p_base_pu
        q_rest = q_spec[idx] - q_base_pu
        if p_rest == 0.0 and q_rest == 0.0:
            # Load-only bus: base == spec, nothing to split (exact zero remainder).
            continue
        p_spec[idx] = p_base_pu
        q_spec[idx] = q_base_pu
        p_const[idx] = p_rest
        q_const[idx] = q_rest
        split_found = True
    return (p_const, q_const) if split_found else None


def zip_effective_spec(
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    v: np.ndarray,
    zip_table: dict[int, ZipCoeffs] | None,
    zip_const: tuple[np.ndarray, np.ndarray] | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Recompute the specified injection at ZIP buses from the current |v|.

    Returns (p_eff, q_eff). The base p_spec/q_spec must already carry any
    one-time frequency scaling (see apply_zip_frequency); this applies only the
    per-iteration VOLTAGE factor. ``zip_const`` (from split_zip_constant_part)
    is the constant, non-ZIP part of the bus (generation) and is added back
    after the polynomial — None => no bus carries one. With an empty/None
    zip_table the inputs are returned unchanged (reduce-to-NR). Shared by
    NR/GS/FD for a single ZIP recompute contract."""
    if not zip_table:
        return p_spec, q_spec
    p_eff = p_spec.copy()
    q_eff = q_spec.copy()
    v_mag = np.abs(v)
    for idx, c in zip_table.items():
        p_eff[idx] = p_spec[idx] * zip_factor(c.a_p, c.b_p, c.c_p, v_mag[idx], c.v0_pu)
        q_eff[idx] = q_spec[idx] * zip_factor(c.a_q, c.b_q, c.c_q, v_mag[idx], c.v0_pu)
        if zip_const is not None:
            p_eff[idx] += zip_const[0][idx]
            q_eff[idx] += zip_const[1][idx]
    return p_eff, q_eff


def frequency_factor(k: float, f_hz: float, f0_hz: float) -> float:
    """Linear frequency-dependence multiplier: 1 + k*(f-f0)/f0.

    Constant w.r.t. voltage, so it is applied once as a base scaling (it does not
    enter the per-iteration recompute or the Jacobian). k=0 or f=f0 => 1.0."""
    return 1.0 + k * (f_hz - f0_hz) / f0_hz


def apply_zip_frequency(
    p_spec: object,
    q_spec: object,
    pq_specs: object,
    node_index_map: dict[str, int],
    f_hz: float,
) -> None:
    """In-place one-time base scaling for frequency-dependent loads.

    The frequency factor is constant w.r.t. voltage, so it scales the base
    injection once before the iterative solve (shared by NR/GS/FD). At f==f0 the
    factor is 1.0 (no change). Duck-typed on ``.zip_coeffs``."""
    for spec in pq_specs:  # type: ignore[attr-defined]
        c = getattr(spec, "zip_coeffs", None)
        if c is None or not c.has_frequency_dependence():
            continue
        idx = node_index_map.get(spec.node_id)
        if idx is None:
            continue
        p_spec[idx] *= frequency_factor(c.k_pf, f_hz, c.f0_hz)  # type: ignore[index]
        q_spec[idx] *= frequency_factor(c.k_qf, f_hz, c.f0_hz)  # type: ignore[index]


def zip_coeffs_from_materialized_params(params: dict | None) -> ZipCoeffs | None:
    """Build ZipCoeffs from a Load's catalog-materialized params (Rule #10).

    Returns None when the params describe a constant-power, frequency-independent
    load (default), so the solver runs the classic path. Defaults: voltage = pure
    constant power (c=1), frequency sensitivity = 0."""
    if not params:
        return None
    coeffs = ZipCoeffs(
        a_p=float(params.get("a_p", 0.0)),
        b_p=float(params.get("b_p", 0.0)),
        c_p=float(params.get("c_p", 1.0)),
        a_q=float(params.get("a_q", 0.0)),
        b_q=float(params.get("b_q", 0.0)),
        c_q=float(params.get("c_q", 1.0)),
        v0_pu=float(params.get("v0_pu", 1.0)),
        k_pf=float(params.get("k_pf", 0.0)),
        k_qf=float(params.get("k_qf", 0.0)),
        f0_hz=float(params.get("f0_hz", 50.0)),
    )
    if coeffs.is_constant_power() and not coeffs.has_frequency_dependence():
        return None
    validate_zip_coeffs(coeffs)
    return coeffs


def aggregate_zip(
    components: list[tuple[float, float, ZipCoeffs | None]],
) -> ZipCoeffs | None:
    """Power-weighted aggregation of several loads on one bus into one ZipCoeffs.

    Each component is (p0_mw, q0_mw, coeffs|None); None means constant power.
    Aggregate share = sum(P0_i * share_i) / sum(P0_i); the polynomial of the sum
    equals the sum of the polynomials, so this is exact. v0_pu/f0_hz must agree
    across components (they reference the same system); the first non-None is used.

    A zero total (P0 or Q0 summing to 0 — e.g. a load compensated to cosφ=1)
    carries no weight, so the aggregate falls back to the DEFAULT of each
    coefficient: constant power (a=b=0, c=1) and zero frequency sensitivity. It
    must never be an all-zero polynomial (sum 0 instead of 1) — that used to make
    build_zip_table raise on a perfectly valid model (defect D1, audit 2026-08-01).
    Every aggregate is validated here, before anyone can use it.

    Returns None when the aggregate is trivial constant power."""
    p_tot = sum(p for p, _q, _c in components)
    q_tot = sum(q for _p, q, _c in components)
    if not components:
        return None
    ref = next((c for _p, _q, c in components if c is not None), None)
    if ref is None:
        return None
    v0_pu, f0_hz = ref.v0_pu, ref.f0_hz

    def _share_p(getter: Callable[[ZipCoeffs | None], float], default: float) -> float:
        if p_tot == 0.0:
            return default
        return sum(p * getter(c) for p, _q, c in components) / p_tot

    def _share_q(getter: Callable[[ZipCoeffs | None], float], default: float) -> float:
        if q_tot == 0.0:
            return default
        return sum(q * getter(c) for _p, q, c in components) / q_tot

    def gp(c: ZipCoeffs | None, attr: str, default: float) -> float:
        return getattr(c, attr) if c is not None else default

    agg = ZipCoeffs(
        a_p=_share_p(lambda c: gp(c, "a_p", 0.0), 0.0),
        b_p=_share_p(lambda c: gp(c, "b_p", 0.0), 0.0),
        c_p=_share_p(lambda c: gp(c, "c_p", 1.0), 1.0),
        a_q=_share_q(lambda c: gp(c, "a_q", 0.0), 0.0),
        b_q=_share_q(lambda c: gp(c, "b_q", 0.0), 0.0),
        c_q=_share_q(lambda c: gp(c, "c_q", 1.0), 1.0),
        v0_pu=v0_pu,
        k_pf=_share_p(lambda c: gp(c, "k_pf", 0.0), 0.0),
        k_qf=_share_q(lambda c: gp(c, "k_qf", 0.0), 0.0),
        f0_hz=f0_hz,
    )
    validate_zip_coeffs(agg)
    if agg.is_constant_power() and not agg.has_frequency_dependence():
        return None
    return agg
