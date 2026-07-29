"""MVP Solver FRT/HVRT RMS time-domain (PR-16-impl).

Symuluje voltage dip (LVRT) lub voltage swell (HVRT) → reakcję DER:
- Trajektoria V/Iq/P w time-domain
- Margin do krzywej profilu (czas pozostania w pracy)
- p_recovery_time po zakłóceniu

Każdy DER wymaga modelu dynamicznego (przyjęty z catalog/profile lub default).
"""

from __future__ import annotations

import numpy as np

from src.network_model.solvers.frt_hvrt.contracts import (
    FrtHvrtResult,
    FrtHvrtSolverInput,
    FrtScenario,
    FrtScenarioResult,
    FrtTrajectoryPoint,
)


def _simulate_scenario(
    scenario: FrtScenario,
    dt: float = 0.001,
    duration: float = 5.0,
) -> FrtScenarioResult:
    """Symulacja pojedynczego scenariusza FRT/HVRT."""
    n_steps = int(duration / dt)
    trajectory: list[FrtTrajectoryPoint] = []

    # Pre-fault state
    pre_fault_v = 1.0
    pre_fault_p = scenario.pre_fault_p_pu
    p_filt = pre_fault_p
    iq_filt = 0.0

    # Inverter response time constants (typical PV/BESS GFL)
    tp = 0.1  # P recovery time constant
    tiq = 0.02  # Iq response (fast)

    fault_start = 0.5
    fault_end = fault_start + scenario.fault_duration_s

    stayed_connected = True
    p_recovery_time = None
    p_recovered_threshold = 0.95 * pre_fault_p

    for step in range(n_steps):
        t = step * dt
        # Voltage profile during scenario
        if t < fault_start:
            v = pre_fault_v
        elif t < fault_end:
            v = scenario.voltage_dip_depth_pu
        else:
            # Linear voltage recovery in 100ms
            recovery_progress = min(1.0, (t - fault_end) / 0.1)
            v = (
                scenario.voltage_dip_depth_pu
                + (1.0 - scenario.voltage_dip_depth_pu) * recovery_progress
            )

        # Iq reactive injection (FRT requirement: K · ΔV)
        # K = 2.0 (typical for FRT mode), saturated at ±1.0 p.u.
        delta_v = 1.0 - v
        iq_target = max(min(2.0 * delta_v, 1.0), -1.0)
        iq_filt = iq_filt + dt / tiq * (iq_target - iq_filt)

        # P during fault: limited by available current; restored after fault
        if t < fault_start:
            p_target = pre_fault_p
        elif t < fault_end:
            # Active power limit during fault (Pa = V · cos · Id)
            # Approximated as V * pre_fault_p (most converters limit P proportionally)
            p_target = v * pre_fault_p * (1.0 - 0.5 * delta_v)
        else:
            p_target = pre_fault_p

        p_filt = p_filt + dt / tp * (p_target - p_filt)

        # Sample co 10ms (100 Hz output)
        if step % 10 == 0:
            trajectory.append(
                FrtTrajectoryPoint(
                    time_s=t,
                    voltage_pu=v,
                    iq_reactive_pu=iq_filt,
                    p_active_pu=p_filt,
                )
            )

        # Stayed connected check: voltage > minimum LVRT curve
        # MVP simplification: stayed_connected = True jeśli v > 0.05 throughout
        if t < fault_start + 0.15 and v < 0.05:
            stayed_connected = False

        # P recovery detection
        if t > fault_end and p_recovery_time is None and p_filt >= p_recovered_threshold:
            p_recovery_time = t - fault_end

    # Margin do krzywej profilu (uproszczone: minimum (V - LVRT_curve) w czasie)
    margin_to_curve_pu = float(
        min((p.voltage_pu - 0.05) for p in trajectory if p.time_s >= fault_start),
    )

    return FrtScenarioResult(
        scenario_id=scenario.scenario_id,
        status="ok" if stayed_connected else "der_dropped",
        stayed_connected=stayed_connected,
        trajectory=trajectory,
        margin_to_curve_s=None,
        margin_to_curve_pu=margin_to_curve_pu,
        p_recovery_time_s=p_recovery_time,
    )


def run_frt_hvrt(
    solver_input: FrtHvrtSolverInput,
) -> FrtHvrtResult:
    """Uruchom MVP solver FRT/HVRT RMS."""
    if not solver_input.scenarios:
        return FrtHvrtResult(
            status="input_invalid",
            no_module_reason_pl="Brak scenariuszy w wejściu.",
        )

    scenario_results = [
        _simulate_scenario(
            sc,
            dt=solver_input.integration_step_s,
            duration=solver_input.simulation_duration_s,
        )
        for sc in solver_input.scenarios
    ]

    # Ogólny status: ok jeśli wszystkie scenariusze stayed_connected
    overall_status = "ok"
    if any(r.status == "der_dropped" for r in scenario_results):
        overall_status = "der_dropped"

    # NumPy fast-path silencer
    _ = np

    return FrtHvrtResult(
        status=overall_status,
        scenario_results=scenario_results,
    )
