"""
SC1 Asymmetrical Quantities — wielkości zwarciowe dla zwarć asymetrycznych (WHITE BOX).

STATUS: CANONICAL & BINDING
Rejestr: V12K-118 (naprawa NOT-A-SOLVER w torze dowodowym SC1).

Fizyka przeniesiona 1:1 (VERBATIM, bit-w-bit) z
``application/proof_engine/proof_generator.py`` (``generate_sc1_proof``),
gdzie łamała regułę NOT-A-SOLVER (proof engine = czysta interpretacja).
Od tej zmiany wielkości liczy TEN moduł (warstwa solverów), a wywołujący
(pakiet dowodowy) przekazuje gotowy wynik do generatora dowodu, który
wyłącznie FORMATUJE kroki (wzór → podstawienie → wynik).

Determinizm dowodów: formuły i kolejność operacji zmiennoprzecinkowych są
identyczne z dotychczasowymi — goldeny ``tests/golden/sc_asymmetrical/**``
pozostają nietknięte (dowód niezmienności fingerprintu).

IEC 60909-0:2016:
- 1F-Z: Z_k = Z1 + Z2 + Z0;            I″k1  = √3·c·Un / |Z_k|  (eq. 29)
- 2F:   Z_k = Z1 + Z2;                 I″k2  = c·Un / |Z_k|     (eq. 23)
- 2F-Z: Z_k = Z1 + Z2·Z0/(Z2+Z0);      I″k2E = c·Un / |Z_k|
- κ = 1.02 + 0.98·e^(−3·R/X); i_p = κ·√2·I″k; I_dyn = i_p; I_th = I″k·√(m+n)
"""

from __future__ import annotations

import math
from dataclasses import dataclass

_FAULT_TYPE_MAPPING = {
    "ONE_PHASE_TO_GROUND": "SC1FZ",
    "TWO_PHASE": "SC2F",
    "TWO_PHASE_TO_GROUND": "SC2FZ",
    "SC1FZ": "SC1FZ",
    "SC2F": "SC2F",
    "SC2FZ": "SC2FZ",
}


@dataclass(frozen=True)
class SC1AsymmetricalQuantities:
    """Wielkości zwarciowe SC1 policzone w warstwie solverów (WHITE BOX).

    Wszystkie wartości pośrednie jawne (audyt numeryczny możliwy):
    impedancja zastępcza, prądy składowe i fazowe, I″k, κ, i_p, I_dyn, I_th.
    """

    fault_type: str  # znormalizowany: SC1FZ | SC2F | SC2FZ
    z_equiv_ohm: complex
    i1_ka: complex
    i2_ka: complex
    i0_ka: complex
    ia_ka: complex
    ib_ka: complex
    ic_ka: complex
    ikss_ka: float
    r_equiv_ohm: float
    x_equiv_ohm: float
    kappa: float
    ip_ka: float
    idyn_ka: float
    ith_ka: float


def normalize_sc1_fault_type(fault_type: str) -> str:
    """Normalizuje typ zwarcia asymetrycznego do postaci kanonicznej."""
    if fault_type not in _FAULT_TYPE_MAPPING:
        raise ValueError(f"Unsupported SC1 fault type: {fault_type}")
    return _FAULT_TYPE_MAPPING[fault_type]


def _compute_equiv_impedance(
    *,
    fault_type: str,
    z1: complex,
    z2: complex,
    z0: complex,
) -> complex:
    if fault_type == "SC1FZ":
        return z1 + z2 + z0
    if fault_type == "SC2F":
        return z1 + z2
    if fault_type == "SC2FZ":
        denominator = z2 + z0
        if denominator == 0:
            raise ValueError("Z2 + Z0 = 0; cannot compute 2F–Z equivalent impedance")
        return z1 + (z2 * z0) / denominator
    raise ValueError(f"Unsupported SC1 fault type: {fault_type}")


def _compute_sequence_currents(
    *,
    fault_type: str,
    u_prefault_kv: float,
    z_equiv: complex,
    z2: complex,
    z0: complex,
) -> tuple[complex, complex, complex]:
    if z_equiv == 0:
        raise ValueError("Z_k = 0; cannot compute sequence currents")
    i1 = u_prefault_kv / z_equiv
    if fault_type == "SC1FZ":
        return i1, i1, i1
    if fault_type == "SC2F":
        return i1, -i1, 0.0
    if fault_type == "SC2FZ":
        denominator = z2 + z0
        if denominator == 0:
            raise ValueError("Z2 + Z0 = 0; cannot compute 2F–Z sequence currents")
        i2 = -(z0 / denominator) * i1
        i0 = -(z2 / denominator) * i1
        return i1, i2, i0
    raise ValueError(f"Unsupported SC1 fault type: {fault_type}")


def _compute_phase_currents(
    *,
    a_operator: complex,
    i0: complex,
    i1: complex,
    i2: complex,
) -> tuple[complex, complex, complex]:
    a = a_operator
    a2 = a**2
    ia = i0 + i1 + i2
    ib = i0 + a2 * i1 + a * i2
    ic = i0 + a * i1 + a2 * i2
    return ia, ib, ic


def _compute_ikss(
    *,
    fault_type: str,
    c_factor: float,
    u_n_kv: float,
    z_equiv: complex,
) -> float:
    """
    I″k for asymmetrical faults per IEC 60909-0:2016.

    - 1F-Z: I″k1 = √3·c·Un / |Z_k|  (eq. 29)
    - 2F:   I″k2 = c·Un / |Z_k|       (eq. 23)
    - 2F-Z: I″k2E = c·Un / |Z_k|
    """
    z_abs = abs(z_equiv)
    if z_abs == 0:
        raise ValueError("Z_k = 0; cannot compute I″k")
    if fault_type == "SC1FZ":
        return math.sqrt(3.0) * c_factor * u_n_kv / z_abs
    return c_factor * u_n_kv / z_abs


def compute_sc1_asymmetrical_quantities(
    *,
    fault_type: str,
    u_n_kv: float,
    c_factor: float,
    u_prefault_kv: float,
    z1_ohm: complex,
    z2_ohm: complex,
    z0_ohm: complex,
    a_operator: complex,
    m_factor: float = 1.0,
    n_factor: float = 0.0,
) -> SC1AsymmetricalQuantities:
    """Liczy komplet wielkości zwarciowych SC1 (1F-Z / 2F / 2F-Z).

    Jedyne miejsce fizyki toru dowodowego SC1 (NOT-A-SOLVER: proof engine
    dostaje ten wynik i wyłącznie formatuje kroki dowodu).
    """
    normalized = normalize_sc1_fault_type(fault_type)

    z_equiv = _compute_equiv_impedance(
        fault_type=normalized,
        z1=z1_ohm,
        z2=z2_ohm,
        z0=z0_ohm,
    )

    i1, i2, i0 = _compute_sequence_currents(
        fault_type=normalized,
        u_prefault_kv=u_prefault_kv,
        z_equiv=z_equiv,
        z2=z2_ohm,
        z0=z0_ohm,
    )

    ia, ib, ic = _compute_phase_currents(
        a_operator=a_operator,
        i0=i0,
        i1=i1,
        i2=i2,
    )

    # Post-fault quantities (§4.1 MANDATORY: I″k, ip, I_th, I_dyn)
    ikss_ka = _compute_ikss(
        fault_type=normalized,
        c_factor=c_factor,
        u_n_kv=u_n_kv,
        z_equiv=z_equiv,
    )

    r_equiv = z_equiv.real
    x_equiv = z_equiv.imag
    rx_ratio = r_equiv / x_equiv if x_equiv != 0 else 0.0
    kappa = 1.02 + 0.98 * math.exp(-3.0 * rx_ratio)
    ip_ka = kappa * math.sqrt(2.0) * ikss_ka
    idyn_ka = ip_ka
    sqrt_mn = math.sqrt(m_factor + n_factor)
    ith_ka = ikss_ka * sqrt_mn

    return SC1AsymmetricalQuantities(
        fault_type=normalized,
        z_equiv_ohm=z_equiv,
        i1_ka=i1,
        i2_ka=i2,
        i0_ka=i0,
        ia_ka=ia,
        ib_ka=ib,
        ic_ka=ic,
        ikss_ka=ikss_ka,
        r_equiv_ohm=r_equiv,
        x_equiv_ohm=x_equiv,
        kappa=kappa,
        ip_ka=ip_ka,
        idyn_ka=idyn_ka,
        ith_ka=ith_ka,
    )
