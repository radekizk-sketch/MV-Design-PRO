"""
Voltage trajectory sampling for FRT validation.

Generuje U(t) trajectory dla scenariusza fault clear:
- Faza 1 (pre-fault): U = pre_fault_voltage_pu (default 1.0)
- Faza 2 (fault): U = during_fault_voltage_pu (0.0 dla zwarcia 3-fazowego u źródła)
- Faza 3 (recovery): exponential rise od during_fault → post_fault_voltage_pu
- Faza 4 (steady state): U = post_fault_voltage_pu

Sampling z dt_s (default 10ms) zgodnie z NC RfG Annex II FRT envelope.

Reference:
- NC RfG (Network Code on Requirements for Generators) Annex II.4
- IEC 61400-21 (wind turbines) — FRT requirements
- PN-EN 50549-1/2 — distributed generation requirements
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class VoltageTrajectoryPoint:
    """Single sample U(t) point."""

    t_s: float
    voltage_pu: float
    frequency_pu: float

    def to_dict(self) -> dict[str, float]:
        return {
            "t_s": round(self.t_s, 4),
            "voltage_pu": round(self.voltage_pu, 6),
            "frequency_pu": round(self.frequency_pu, 6),
        }


@dataclass(frozen=True)
class TrajectoryGenerationParams:
    """Parametry generacji trajectory."""

    pre_fault_duration_s: float = 0.1  # 100ms before fault
    clearing_time_ms: float = 150.0  # fault duration
    recovery_duration_s: float = 2.0  # post-clearing recovery sampling
    sample_dt_s: float = 0.01  # 10ms sampling
    pre_fault_voltage_pu: float = 1.0
    during_fault_voltage_pu: float = 0.0  # 3-phase fault at source = total collapse
    post_fault_voltage_pu: float = 1.0
    pre_fault_frequency_pu: float = 1.0
    during_fault_frequency_pu: float = 1.0  # frequency holds in short fault
    post_fault_frequency_pu: float = 1.0
    recovery_time_constant_s: float = 0.3  # exponential rise τ


def generate_voltage_trajectory(
    params: TrajectoryGenerationParams,
) -> tuple[VoltageTrajectoryPoint, ...]:
    """Generate U(t) trajectory samples z exponential recovery model.

    Model:
        t < 0: U = pre_fault
        0 ≤ t < clearing: U = during_fault
        clearing ≤ t: U = post_fault - (post_fault - during_fault) * exp(-(t-clearing)/τ)

    Returns:
        Trajectory points sorted by time (ascending), starting from -pre_fault_duration_s.
    """
    points: list[VoltageTrajectoryPoint] = []

    clearing_time_s = params.clearing_time_ms / 1000.0
    total_time_s = params.pre_fault_duration_s + clearing_time_s + params.recovery_duration_s
    start_time_s = -params.pre_fault_duration_s
    n_samples = int(math.ceil(total_time_s / params.sample_dt_s)) + 1

    for i in range(n_samples):
        t = start_time_s + i * params.sample_dt_s
        if t < 0.0:
            # Pre-fault steady state
            u_pu = params.pre_fault_voltage_pu
            f_pu = params.pre_fault_frequency_pu
        elif t < clearing_time_s:
            # During fault
            u_pu = params.during_fault_voltage_pu
            f_pu = params.during_fault_frequency_pu
        else:
            # Recovery: exponential rise toward post_fault
            t_recovery = t - clearing_time_s
            decay = math.exp(-t_recovery / params.recovery_time_constant_s)
            u_pu = (
                params.post_fault_voltage_pu
                - (params.post_fault_voltage_pu - params.during_fault_voltage_pu) * decay
            )
            # Frequency follows similar pattern (faster recovery typically)
            f_decay = math.exp(-t_recovery / (params.recovery_time_constant_s * 0.5))
            f_pu = (
                params.post_fault_frequency_pu
                - (params.post_fault_frequency_pu - params.during_fault_frequency_pu) * f_decay
            )
        points.append(VoltageTrajectoryPoint(t_s=t, voltage_pu=u_pu, frequency_pu=f_pu))

    return tuple(points)


@dataclass(frozen=True)
class FrtEnvelopePoint:
    """NC RfG FRT envelope point — minimum U_pu required at given t_s."""

    t_s: float
    voltage_pu_min: float  # minimum LVRT envelope
    voltage_pu_max: float = 1.30  # max HVRT envelope


# NC RfG Annex II — FRT envelope dla SN/WN (Type B/C/D generators)
# t [s], U_min [pu]
NC_RFG_LVRT_ENVELOPE: tuple[FrtEnvelopePoint, ...] = (
    FrtEnvelopePoint(t_s=0.0, voltage_pu_min=0.0, voltage_pu_max=1.30),
    FrtEnvelopePoint(t_s=0.15, voltage_pu_min=0.0, voltage_pu_max=1.30),
    FrtEnvelopePoint(t_s=0.15001, voltage_pu_min=0.30, voltage_pu_max=1.30),
    FrtEnvelopePoint(t_s=0.7, voltage_pu_min=0.70, voltage_pu_max=1.20),
    FrtEnvelopePoint(t_s=1.5, voltage_pu_min=0.85, voltage_pu_max=1.15),
    FrtEnvelopePoint(t_s=3.0, voltage_pu_min=0.90, voltage_pu_max=1.10),
    FrtEnvelopePoint(t_s=60.0, voltage_pu_min=0.90, voltage_pu_max=1.10),
)


def interpolate_envelope(
    t_s: float,
    envelope: tuple[FrtEnvelopePoint, ...] = NC_RFG_LVRT_ENVELOPE,
) -> tuple[float, float]:
    """Linear interpolation envelope (U_min, U_max) at given time.

    For t < envelope[0].t_s: returns envelope[0] limits.
    For t > envelope[-1].t_s: returns envelope[-1] limits.
    """
    if t_s <= envelope[0].t_s:
        return envelope[0].voltage_pu_min, envelope[0].voltage_pu_max
    if t_s >= envelope[-1].t_s:
        return envelope[-1].voltage_pu_min, envelope[-1].voltage_pu_max

    # Find bracketing points
    for i in range(len(envelope) - 1):
        if envelope[i].t_s <= t_s <= envelope[i + 1].t_s:
            t1, t2 = envelope[i].t_s, envelope[i + 1].t_s
            if t2 - t1 < 1e-12:
                return envelope[i].voltage_pu_min, envelope[i].voltage_pu_max
            alpha = (t_s - t1) / (t2 - t1)
            u_min = envelope[i].voltage_pu_min + alpha * (
                envelope[i + 1].voltage_pu_min - envelope[i].voltage_pu_min
            )
            u_max = envelope[i].voltage_pu_max + alpha * (
                envelope[i + 1].voltage_pu_max - envelope[i].voltage_pu_max
            )
            return u_min, u_max
    return envelope[-1].voltage_pu_min, envelope[-1].voltage_pu_max


def check_trajectory_against_envelope(
    trajectory: tuple[VoltageTrajectoryPoint, ...],
    envelope: tuple[FrtEnvelopePoint, ...] = NC_RFG_LVRT_ENVELOPE,
) -> tuple[tuple[dict[str, float | bool], ...], bool]:
    """Check każdy sample trajectory vs envelope, zwraca (per-sample violations, overall PASS).

    Returns:
        - per_sample_check: tuple of dict {t_s, voltage_pu, u_min, u_max, in_envelope}
        - overall_pass: True jeśli all samples in_envelope
    """
    results: list[dict[str, float | bool]] = []
    all_pass = True
    for point in trajectory:
        # Only check samples during/after fault (t >= 0)
        if point.t_s < 0.0:
            results.append(
                {
                    "t_s": point.t_s,
                    "voltage_pu": point.voltage_pu,
                    "u_min": 0.0,
                    "u_max": 2.0,
                    "in_envelope": True,
                }
            )
            continue
        u_min, u_max = interpolate_envelope(point.t_s, envelope)
        in_env = u_min <= point.voltage_pu <= u_max
        if not in_env:
            all_pass = False
        results.append(
            {
                "t_s": point.t_s,
                "voltage_pu": point.voltage_pu,
                "u_min": u_min,
                "u_max": u_max,
                "in_envelope": in_env,
            }
        )
    return tuple(results), all_pass
