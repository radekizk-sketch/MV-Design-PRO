from __future__ import annotations

import math
from dataclasses import dataclass

from network_model.solvers.short_circuit_core import (
    ShortCircuitType,
    compute_ikss,
    compute_post_fault_quantities,
)


@dataclass(frozen=True)
class GridSourcePreviewInput:
    voltage_kv: float
    short_circuit_mode: str
    sk3_mva: float | None = None
    rx_ratio: float | None = None
    r_ohm: float | None = None
    x_ohm: float | None = None
    zero_sequence_enabled: bool = False
    r0_ohm: float | None = None
    x0_ohm: float | None = None
    z0_z1_ratio: float | None = None
    tk_s: float = 1.0
    tb_s: float = 0.1


@dataclass(frozen=True)
class GridSourcePreviewResult:
    sk_mva: float
    ik3_ka: float
    ik1_ka: float | None
    ip_ka: float
    ith_ka: float
    kappa: float
    z1_ohm: complex
    z0_ohm: complex | None
    formula_ref: str = "IEC 60909 / short_circuit_core"


def compute_grid_source_preview(data: GridSourcePreviewInput) -> GridSourcePreviewResult:
    """Compute a GPZ short-circuit source preview with the same core formulas as IEC 60909."""

    z1 = _build_positive_sequence_impedance(data)
    un_v = data.voltage_kv * 1000.0
    ik3_a = compute_ikss(
        un_v=un_v,
        c_factor=1.0,
        short_circuit_type=ShortCircuitType.THREE_PHASE,
        z_equiv=z1,
    )
    post = compute_post_fault_quantities(
        ikss=ik3_a,
        un_v=un_v,
        z_equiv=z1,
        tk_s=data.tk_s,
        tb_s=data.tb_s,
    )
    z0 = _build_zero_sequence_impedance(data, z1)
    ik1_a = (
        compute_ikss(
            un_v=un_v,
            c_factor=1.0,
            short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
            z_equiv=z1 + z1 + z0,
        )
        if z0 is not None
        else None
    )

    return GridSourcePreviewResult(
        sk_mva=post.sk_mva,
        ik3_ka=ik3_a / 1000.0,
        ik1_ka=ik1_a / 1000.0 if ik1_a is not None else None,
        ip_ka=post.ip_a / 1000.0,
        ith_ka=post.ith_a / 1000.0,
        kappa=post.kappa,
        z1_ohm=z1,
        z0_ohm=z0,
    )


def _build_positive_sequence_impedance(data: GridSourcePreviewInput) -> complex:
    if data.voltage_kv <= 0:
        raise ValueError("voltage_kv must be positive")

    mode = data.short_circuit_mode.upper().strip()
    if mode == "IMPEDANCE":
        if data.r_ohm is None or data.r_ohm < 0:
            raise ValueError("r_ohm must be non-negative in impedance mode")
        if data.x_ohm is None or data.x_ohm <= 0:
            raise ValueError("x_ohm must be positive in impedance mode")
        return complex(data.r_ohm, data.x_ohm)

    if data.sk3_mva is None or data.sk3_mva <= 0:
        raise ValueError("sk3_mva must be positive in short-circuit-power mode")
    if data.rx_ratio is None or data.rx_ratio < 0:
        raise ValueError("rx_ratio must be non-negative in short-circuit-power mode")

    z_magnitude_ohm = (data.voltage_kv**2) / data.sk3_mva
    x_ohm = z_magnitude_ohm / math.sqrt(1.0 + data.rx_ratio**2)
    r_ohm = data.rx_ratio * x_ohm
    return complex(r_ohm, x_ohm)


def _build_zero_sequence_impedance(
    data: GridSourcePreviewInput,
    z1_ohm: complex,
) -> complex | None:
    if not data.zero_sequence_enabled:
        return None

    if data.r0_ohm is not None or data.x0_ohm is not None:
        if data.r0_ohm is None or data.r0_ohm < 0:
            raise ValueError("r0_ohm must be non-negative when zero-sequence impedance is set")
        if data.x0_ohm is None or data.x0_ohm <= 0:
            raise ValueError("x0_ohm must be positive when zero-sequence impedance is set")
        return complex(data.r0_ohm, data.x0_ohm)

    if data.z0_z1_ratio is not None:
        if data.z0_z1_ratio <= 0:
            raise ValueError("z0_z1_ratio must be positive")
        return z1_ohm * data.z0_z1_ratio

    return None
