"""Defect B (review 2026-08-01): the source computes from ITS OWN power, and the
load model and the source control COMPOSE on a prosumer bus.

Two independent defects lived in ``apply_inverter_setpoint``:

1. The shaping read ``p_spec[idx]`` — the BUS power — as the source's active
   power, and after the ZIP split (defect D1) that is the LOAD BASE. A cosφ
   source on a bus with a load therefore derived its reactive power from the
   LOAD's active power, and the LFSM P(f) droop curtailed the LOAD instead of the
   generation. The result was written by ASSIGNMENT over ``q_spec[idx]``, which
   additionally deleted the load's reactive demand from the model.
2. The contract claimed ``inverter_control`` and ``zip_coeffs`` were mutually
   exclusive per bus, while ``enm.canonical_analysis`` sets both. The three
   solvers then disagreed on such a bus: GS took the ZIP branch of an if/elif and
   dropped the volt-var control, NR/FD overwrote the load's Q with it.

The tests below are the PRODUCT OF FEATURES the defect could hide in — load type
× control mode × solver — judged against an independent Newton solved in the test
(no solver number is compared to another solver number alone).
"""

from __future__ import annotations

import math

import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_fast_decoupled import PowerFlowFastDecoupledSolver
from network_model.solvers.power_flow_gauss_seidel import PowerFlowGaussSeidelSolver
from network_model.solvers.power_flow_inverter import (
    InverterControl,
    InverterMode,
    InverterShaping,
    apply_inverter_setpoint,
    inverter_control_from_params,
    inverter_q_seed,
)
from network_model.solvers.power_flow_newton import solve_power_flow_physics
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)
from network_model.solvers.power_flow_zip import ZipCoeffs

BASE_MVA = 10.0
KV = 15.0
LEN_KM = 12.0
R_OHM_KM = 0.4
X_OHM_KM = 0.8

TAN_095 = math.tan(math.acos(0.95))
# Constant-impedance load: the polynomial that makes the ZIP branch bite.
ZIP_Z = ZipCoeffs(a_p=1.0, b_p=0.0, c_p=0.0, a_q=1.0, b_q=0.0, c_q=0.0)


def _net() -> NetworkGraph:
    g = NetworkGraph()
    g.add_node(
        Node(
            id="A",
            name="A",
            node_type=NodeType.SLACK,
            voltage_level=KV,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="B",
            name="B",
            node_type=NodeType.PQ,
            voltage_level=KV,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="L",
            name="L",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="B",
            r_ohm_per_km=R_OHM_KM,
            x_ohm_per_km=X_OHM_KM,
            b_us_per_km=0.0,
            length_km=LEN_KM,
            rated_current_a=400.0,
        )
    )
    return g


def _inp(spec: PQSpec, f_hz: float = 50.0) -> PowerFlowInput:
    return PowerFlowInput(
        graph=_net(),
        base_mva=BASE_MVA,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[spec],
        options=PowerFlowOptions(max_iter=600, tolerance=1e-11),
        base_frequency_hz=f_hz,
    )


def _solve_all(spec: PQSpec, f_hz: float = 50.0) -> dict[str, tuple[float, float, float]]:
    """(|V|, P_inj_pu, Q_inj_pu) at bus B from each of the three solvers."""
    out: dict[str, tuple[float, float, float]] = {}
    for name, sol in (
        ("NR", solve_power_flow_physics(_inp(spec, f_hz))),
        ("GS", PowerFlowGaussSeidelSolver().solve(_inp(spec, f_hz))),
        ("FD", PowerFlowFastDecoupledSolver().solve(_inp(spec, f_hz))),
    ):
        assert sol.converged, f"{name} did not converge"
        out[name] = (
            sol.node_u_mag["B"],
            sol.node_p_spec_effective_pu["B"],
            sol.node_q_spec_effective_pu["B"],
        )
    return out


def _judge(p_of_v, q_of_v) -> tuple[float, float, float]:
    """Independent Newton for slack--line--B, written from the physics alone.

    Two equations, numerical Jacobian, no shared code with the solvers under test:
    the reference cannot inherit their defect."""
    z_base = KV * KV / BASE_MVA
    y = 1.0 / complex(R_OHM_KM * LEN_KM / z_base, X_OHM_KM * LEN_KM / z_base)
    theta, mag = 0.0, 1.0

    def residual(th: float, m: float) -> tuple[float, float]:
        v = m * complex(math.cos(th), math.sin(th))
        s = v * (y * v - y).conjugate()
        return s.real - p_of_v(m), s.imag - q_of_v(m)

    for _ in range(300):
        f_p, f_q = residual(theta, mag)
        if max(abs(f_p), abs(f_q)) < 1e-14:
            break
        h = 1e-7
        jac = []
        for dth, dm in ((h, 0.0), (0.0, h)):
            g_p, g_q = residual(theta + dth, mag + dm)
            jac.append(((g_p - f_p) / h, (g_q - f_q) / h))
        det = jac[0][0] * jac[1][1] - jac[1][0] * jac[0][1]
        theta -= (f_p * jac[1][1] - f_q * jac[1][0]) / det
        mag -= (jac[0][0] * f_q - jac[0][1] * f_p) / det
    return mag, p_of_v(mag), q_of_v(mag)


# --------------------------------------------------------------------------
# (b) product of features: {no load, constant-power load, ZIP load}
#                        × {cosφ, Q setpoint + P(f)} × {NR, GS, FD}
# --------------------------------------------------------------------------

# load_kind -> (spec kwargs of the LOAD part, P_load(V) pu, Q_load(V) pu)
_LOADS = {
    "brak_odbioru": ({}, (lambda v: 0.0), (lambda v: 0.0)),
    "odbior_stalomocowy": ({}, (lambda v: -0.30), (lambda v: -0.15)),
    "odbior_zip": (
        {"zip_coeffs": ZIP_Z, "zip_base_p_mw": 3.0, "zip_base_q_mvar": 1.5},
        (lambda v: -0.30 * v * v),
        (lambda v: -0.15 * v * v),
    ),
}


def _spec_for(load_kind: str, control: InverterControl, p_src_mw: float, q_src_mvar: float):
    kwargs, p_load, q_load = _LOADS[load_kind]
    load_p_mw = 0.0 if load_kind == "brak_odbioru" else 3.0
    load_q_mvar = 0.0 if load_kind == "brak_odbioru" else 1.5
    spec = PQSpec(
        node_id="B",
        # PQSpec is LOAD convention: net bus power = load - generation.
        p_mw=load_p_mw - p_src_mw,
        q_mvar=load_q_mvar - q_src_mvar,
        inverter_control=control,
        inverter_p_mw=p_src_mw,
        inverter_q_mvar=q_src_mvar,
        **kwargs,
    )
    return spec, p_load, q_load


@pytest.mark.parametrize("load_kind", sorted(_LOADS))
def test_cosphi_source_uses_its_own_active_power_not_the_bus(load_kind: str) -> None:
    """cosφ × {no load, const-P load, ZIP load} × NR/GS/FD.

    Q_source = tan(φ) * P_SOURCE. Before the fix it was tan(φ) * |P_bus| — on a ZIP
    bus even tan(φ) * P_LOAD, and the load's own Q was overwritten out of the model.
    """
    control = inverter_control_from_params({"control_mode": "STALY_COS_PHI", "cosphi": 0.95}, 10.0)
    spec, p_load, q_load = _spec_for(load_kind, control, p_src_mw=2.0, q_src_mvar=0.0)
    v_ref, p_ref, q_ref = _judge(
        lambda v: p_load(v) + 0.20,
        lambda v: q_load(v) + TAN_095 * 0.20,
    )
    for name, (v, p, q) in _solve_all(spec).items():
        assert v == pytest.approx(v_ref, abs=1e-9), name
        assert p == pytest.approx(p_ref, abs=1e-9), name
        assert q == pytest.approx(q_ref, abs=1e-9), name


@pytest.mark.parametrize("load_kind", sorted(_LOADS))
def test_q_setpoint_source_with_pf_droop_curtails_generation_not_load(load_kind: str) -> None:
    """Q setpoint + P(f) × {no load, const-P load, ZIP load} × NR/GS/FD.

    The LFSM factor must scale the SOURCE's active power. Before the fix
    ``p_spec[idx] *= lfsm_factor`` scaled the bus — i.e. the LOAD — so an
    over-frequency event reduced consumption instead of generation.
    """
    control = inverter_control_from_params(
        {"control_mode": "Q_CONST", "lfsm_droop_pct": 5.0, "lfsm_deadband_hz": 0.2, "f0_hz": 50.0},
        10.0,
    )
    spec, p_load, q_load = _spec_for(load_kind, control, p_src_mw=2.0, q_src_mvar=0.4)
    # LFSM-O at 51 Hz: excess = (1.0 - 0.2)/50, factor = 1 - excess/0.05.
    factor = 1.0 - ((1.0 - 0.2) / 50.0) / 0.05
    assert 0.0 < factor < 1.0
    v_ref, p_ref, q_ref = _judge(
        lambda v: p_load(v) + 0.20 * factor,
        lambda v: q_load(v) + 0.04,  # Q setpoint is untouched by P(f)
    )
    for name, (v, p, q) in _solve_all(spec, f_hz=51.0).items():
        assert v == pytest.approx(v_ref, abs=1e-9), name
        assert p == pytest.approx(p_ref, abs=1e-9), name
        assert q == pytest.approx(q_ref, abs=1e-9), name


def test_q_sign_follows_the_catalog_excitation_convention() -> None:
    """§2.4: the sign of Q comes from the excitation flag, for both cosφ modes.

    Catalog convention (``inverter_control_from_params``): over-excited (default)
    INJECTS reactive power (Q > 0 on the injection convention), under-excited
    (``q_absorbing``) ABSORBS it (Q < 0). The sign belongs to the excitation, not
    to the sign of P.
    """
    for mode, extra in (
        ("COSPHI_CONST", {}),
        ("COSPHI(P)", {"cosphi_p_points": [[0.0, 0.95], [1.0, 0.95]], "pmax_mw": 2.0}),
    ):
        over = inverter_control_from_params({"control_mode": mode, "cosphi": 0.95, **extra}, 10.0)
        under = inverter_control_from_params(
            {"control_mode": mode, "cosphi": 0.95, "q_absorbing": True, **extra}, 10.0
        )
        specs = {}
        for label, ctrl in (("over", over), ("under", under)):
            spec, _p, _q = _spec_for("odbior_stalomocowy", ctrl, p_src_mw=2.0, q_src_mvar=0.0)
            specs[label] = _solve_all(spec)
        for solver in ("NR", "GS", "FD"):
            q_over = specs["over"][solver][2] - (-0.15)  # bus Q minus the load's Q
            q_under = specs["under"][solver][2] - (-0.15)
            assert q_over == pytest.approx(TAN_095 * 0.20, abs=1e-9), (mode, solver)
            assert q_under == pytest.approx(-TAN_095 * 0.20, abs=1e-9), (mode, solver)


# --------------------------------------------------------------------------
# (c) the exclusivity contract, resolved explicitly
# --------------------------------------------------------------------------


def _qu_control(slope: float) -> InverterControl:
    return inverter_control_from_params(
        {
            "control_mode": "Q_OD_U",
            "qu_deadband_low_pu": 0.98,
            "qu_deadband_high_pu": 1.005,
            "qu_slope_pu_per_pu": slope,
            "qu_q_min_mvar": -5.0,
            "qu_q_max_mvar": 5.0,
        },
        10.0,
    )


def test_prosumer_bus_composes_zip_load_and_volt_var_source_in_all_solvers() -> None:
    """A bus in BOTH recompute sets: the two contributions ADD, in NR, GS and FD.

    This is the case the old contract called impossible. It was reachable from the
    canonical run, and the three solvers silently disagreed on it: GS's if/elif
    chose the ZIP branch (volt-var dropped, and the fixed point did not even
    converge), NR/FD assigned the volt-var value over the load's Q.
    """
    slope = 0.6  # gentle enough for the GS/FD fixed point (see the parity test)
    control = _qu_control(slope)
    spec, p_load, q_load = _spec_for("odbior_zip", control, p_src_mw=2.0, q_src_mvar=0.0)

    def q_volt_var(v: float) -> float:
        if v < 0.98:
            return -slope * (v - 0.98)
        if v > 1.005:
            return -slope * (v - 1.005)
        return 0.0

    v_ref, p_ref, q_ref = _judge(lambda v: p_load(v) + 0.20, lambda v: q_load(v) + q_volt_var(v))
    assert v_ref < 0.98, "scenario must leave the deadband, else the control is a no-op"
    results = _solve_all(spec)
    for name, (v, p, q) in results.items():
        assert v == pytest.approx(v_ref, abs=1e-8), name
        assert p == pytest.approx(p_ref, abs=1e-8), name
        assert q == pytest.approx(q_ref, abs=1e-8), name
    # And the load's reactive demand is still in the model (it used to be erased):
    assert results["NR"][2] == pytest.approx(q_load(v_ref) + q_volt_var(v_ref), abs=1e-8)
    assert q_load(v_ref) < 0.0


def test_bus_with_load_model_and_control_but_no_source_power_is_refused() -> None:
    """The one combination that cannot compose is REFUSED, never silently chosen.

    A spec that carries a load model (ZIP polynomial and/or a declared split) next
    to an inverter control, but does not say what the SOURCE injects, cannot be
    shaped: the bus aggregate is provably not the source's power. Guessing it is
    exactly defect B, so the run fails with an explicit message.
    """
    control = inverter_control_from_params({"control_mode": "STALY_COS_PHI", "cosphi": 0.95}, 10.0)
    solvers = (
        lambda s: solve_power_flow_physics(_inp(s)),
        lambda s: PowerFlowGaussSeidelSolver().solve(_inp(s)),
        lambda s: PowerFlowFastDecoupledSolver().solve(_inp(s)),
    )
    for kwargs in (
        {"zip_coeffs": ZIP_Z, "zip_base_p_mw": 3.0, "zip_base_q_mvar": 1.5},
        {"zip_coeffs": ZIP_Z},
    ):
        spec = PQSpec(node_id="B", p_mw=1.0, q_mvar=1.5, inverter_control=control, **kwargs)
        for solve in solvers:
            with pytest.raises(ValueError, match="also carries a load model"):
                solve(spec)
    # A declared split without a polynomial is caught one step earlier, by the
    # split's own fuse (defect A1) — also explicit, never a silent loss.
    orphan = PQSpec(node_id="B", p_mw=1.0, q_mvar=1.5, inverter_control=control, zip_base_p_mw=3.0)
    for solve in solvers:
        with pytest.raises(ValueError, match="without zip_coeffs"):
            solve(orphan)


def test_zip_recompute_bus_without_split_is_refused_not_scaled() -> None:
    """A source on a ZIP-recompute bus needs a constant part to live in.

    Without the split the load polynomial would multiply the source injection
    every iteration. That is refused explicitly rather than mis-scaled silently.
    """
    control = inverter_control_from_params({"control_mode": "STALY_COS_PHI", "cosphi": 0.95}, 10.0)
    spec = PQSpec(
        node_id="B",
        p_mw=1.0,
        q_mvar=1.5,
        zip_coeffs=ZIP_Z,  # voltage-dependent => in the recompute set
        inverter_control=control,
        inverter_p_mw=2.0,  # source power known, but no split declared
        inverter_q_mvar=0.0,
    )
    with pytest.raises(ValueError, match="declares no load/generation split"):
        solve_power_flow_physics(_inp(spec))


def test_volt_var_seed_refuses_a_recompute_bus_without_a_shaping_record() -> None:
    """Predicate pairing (rule KLASA §3): the volt-var set ⊆ the shaped set.

    ``build_inverter_table`` and ``apply_inverter_setpoint`` use two different
    predicates that agree by construction today. The seed refuses instead of
    assuming, so a future drift fails loudly rather than starting the volt-var
    fixed point from nothing.
    """
    control = _qu_control(2.0)
    shaping = {
        0: InverterShaping(
            mode=InverterMode.Q_U,
            p_source_pu=0.2,
            q_source_pu=0.05,
            p_shaped_pu=0.2,
            q_shaped_pu=0.0,
            lfsm_factor=1.0,
        )
    }
    assert inverter_q_seed({0: control}, shaping) == {0: 0.05}
    with pytest.raises(ValueError, match="have no shaping record"):
        inverter_q_seed({0: control, 1: control}, shaping)


# --------------------------------------------------------------------------
# (e) FROZEN / determinism: a source-only bus is untouched
# --------------------------------------------------------------------------


def test_source_only_bus_is_bit_identical_to_the_historical_shaping() -> None:
    """No prosumer bus => no change. The component form ``(x - src) + shaped``
    collapses to the historical single multiplication because ``x - src`` is
    exactly 0.0 on a source-only bus."""
    control = inverter_control_from_params({"control_mode": "STALY_COS_PHI", "cosphi": 0.95}, 10.0)
    explicit = PQSpec(
        node_id="B",
        p_mw=-2.0,
        q_mvar=0.0,
        inverter_control=control,
        inverter_p_mw=2.0,
        inverter_q_mvar=0.0,
    )
    # Same bus without the explicit source power: the bus power IS the source.
    implied = PQSpec(node_id="B", p_mw=-2.0, q_mvar=0.0, inverter_control=control)
    for name in ("NR", "GS", "FD"):
        assert _solve_all(explicit)[name] == _solve_all(implied)[name]
    # The shaped values are exactly the historical ones (q = tan(φ)·|P|).
    v, p, q = _solve_all(explicit)["NR"]
    assert p == 0.2
    assert q == control.q_over_p * 0.2


def test_shaping_is_a_component_not_an_assignment() -> None:
    """The bus keeps everything that is not the source (defect B, §2.3)."""
    control = inverter_control_from_params({"control_mode": "STALY_COS_PHI", "cosphi": 0.95}, 10.0)
    import numpy as np

    p_spec = np.array([0.0, -0.10])  # net bus = load 3.0/1.5 MW minus source 2.0 MW
    q_spec = np.array([0.0, -0.15])
    spec = PQSpec(
        node_id="B",
        p_mw=1.0,
        q_mvar=1.5,
        inverter_control=control,
        inverter_p_mw=2.0,
        inverter_q_mvar=0.0,
    )
    shaping = apply_inverter_setpoint(p_spec, q_spec, [spec], {"B": 1}, 50.0, BASE_MVA)
    # P is unchanged (no LFSM), Q of the LOAD survives and the source's Q is added.
    assert p_spec[1] == pytest.approx(-0.10)
    assert q_spec[1] == pytest.approx(-0.15 + TAN_095 * 0.20)
    assert shaping[1].p_source_pu == pytest.approx(0.20)
    assert shaping[1].q_shaped_pu == pytest.approx(TAN_095 * 0.20)
