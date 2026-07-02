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
"""

from __future__ import annotations

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


def zip_effective_spec(
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    v: np.ndarray,
    zip_table: dict[int, ZipCoeffs] | None,
) -> tuple[np.ndarray, np.ndarray]:
    """Recompute the specified injection at ZIP buses from the current |v|.

    Returns (p_eff, q_eff). The base p_spec/q_spec must already carry any
    one-time frequency scaling (see apply_zip_frequency); this applies only the
    per-iteration VOLTAGE factor. With an empty/None zip_table the inputs are
    returned unchanged (reduce-to-NR). Shared by NR/GS/FD for a single ZIP
    recompute contract."""
    if not zip_table:
        return p_spec, q_spec
    p_eff = p_spec.copy()
    q_eff = q_spec.copy()
    v_mag = np.abs(v)
    for idx, c in zip_table.items():
        p_eff[idx] = p_spec[idx] * zip_factor(c.a_p, c.b_p, c.c_p, v_mag[idx], c.v0_pu)
        q_eff[idx] = q_spec[idx] * zip_factor(c.a_q, c.b_q, c.c_q, v_mag[idx], c.v0_pu)
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
    Returns None when the aggregate is trivial constant power."""
    p_tot = sum(p for p, _q, _c in components)
    q_tot = sum(q for _p, q, _c in components)
    if not components:
        return None
    ref = next((c for _p, _q, c in components if c is not None), None)
    if ref is None:
        return None
    v0_pu, f0_hz = ref.v0_pu, ref.f0_hz

    def _share_p(getter) -> float:
        if p_tot == 0.0:
            return 0.0
        return sum(p * getter(c) for p, _q, c in components) / p_tot

    def _share_q(getter) -> float:
        if q_tot == 0.0:
            return 0.0
        return sum(q * getter(c) for _p, q, c in components) / q_tot

    def gp(c: ZipCoeffs | None, attr: str, default: float) -> float:
        return getattr(c, attr) if c is not None else default

    agg = ZipCoeffs(
        a_p=_share_p(lambda c: gp(c, "a_p", 0.0)),
        b_p=_share_p(lambda c: gp(c, "b_p", 0.0)),
        c_p=_share_p(lambda c: gp(c, "c_p", 1.0)),
        a_q=_share_q(lambda c: gp(c, "a_q", 0.0)),
        b_q=_share_q(lambda c: gp(c, "b_q", 0.0)),
        c_q=_share_q(lambda c: gp(c, "c_q", 1.0)),
        v0_pu=v0_pu,
        k_pf=_share_p(lambda c: gp(c, "k_pf", 0.0)),
        k_qf=_share_q(lambda c: gp(c, "k_qf", 0.0)),
        f0_hz=f0_hz,
    )
    if agg.is_constant_power() and not agg.has_frequency_dependence():
        return None
    return agg
