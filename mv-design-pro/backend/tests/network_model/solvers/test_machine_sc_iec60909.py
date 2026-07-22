"""IEC 60909 rotating-machine SC sources (synchronous §6.3, asynchronous §6.7) and
the per-machine breaking-current module (§6.6).

These validate the ADDITIVE extension: the machine impedance enters the Y-bus as a
shunt (the 7 frozen solver files are untouched), so machine-free networks stay
byte-identical (determinism), machines raise I″k by the IEC-expected amount, and the
per-machine partial currents + μ/q breaking factors match hand-calculations.

Reference network (all tests): slack (infinite) → line (0.45 + j0.90 Ω) → bus B, all
15 kV. Hand-calc baseline I″k = c·Un/(√3·|Z|) = 1.1·15000/(√3·1.006) ≈ 9467 A.
"""

import math

import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.machine import (
    AsynchronousMachineSource,
    SynchronousMachineSource,
    _asynchronous_r_over_x,
    _synchronous_r_over_x,
)
from network_model.core.node import Node, NodeType
from network_model.solvers.machine_sc_iec60909 import (
    compute_machine_contributions,
    mu_factor,
    q_factor,
)
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver


def _slack_line_bus() -> NetworkGraph:
    g = NetworkGraph()
    g.add_node(
        Node(
            id="GPZ",
            name="GPZ",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="B",
            name="B",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="L",
            name="L",
            branch_type=BranchType.LINE,
            from_node_id="GPZ",
            to_node_id="B",
            r_ohm_per_km=0.45,
            x_ohm_per_km=0.90,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=0.0,
        )
    )
    return g


def _ikss(graph: NetworkGraph, bus: str = "B", c: float = 1.1) -> float:
    return ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph, fault_node_id=bus, c_factor=c, tk_s=1.0
    ).ikss_a


def _sync(node_id: str = "B") -> SynchronousMachineSource:
    return SynchronousMachineSource(
        id="G",
        name="GEN",
        node_id=node_id,
        sr_mva=5.0,
        ur_kv=15.0,
        xd_subtransient_pu=0.15,
        cos_phi_r=0.8,
        c_max=1.1,
    )


def _async(node_id: str = "B") -> AsynchronousMachineSource:
    return AsynchronousMachineSource(
        id="M",
        name="MOT",
        node_id=node_id,
        pr_mw=2.0,
        ur_kv=15.0,
        cos_phi_r=0.85,
        efficiency=0.95,
        i_lr_ratio=5.0,
        pole_pairs=2,
    )


def _dfig(node_id: str = "B") -> AsynchronousMachineSource:
    # Same machine as _async, but flagged DFIG (wind Type 3) — crowbar → induction machine.
    return AsynchronousMachineSource(
        id="M",
        name="DFIG",
        node_id=node_id,
        pr_mw=2.0,
        ur_kv=15.0,
        cos_phi_r=0.85,
        efficiency=0.95,
        i_lr_ratio=5.0,
        pole_pairs=2,
        wind_type_3=True,
    )


# ── Determinism / additivity ────────────────────────────────────────────────
def test_machine_free_baseline_ikss():
    assert _ikss(_slack_line_bus()) == pytest.approx(9467.0, rel=0.01)


def test_no_machines_empty_result():
    res = compute_machine_contributions(_slack_line_bus(), "B", c_factor=1.1, t_min_s=0.10)
    assert res.contributions == []
    assert res.ikss_machines_a == 0.0
    assert res.ib_machines_a == 0.0
    assert res.motors_negligible is True


def test_machine_addition_does_not_change_baseline_object():
    # The same graph computed twice (machine added to a SEPARATE graph) keeps the
    # baseline identical — the machine code path is inert without machine sources.
    assert _ikss(_slack_line_bus()) == _ikss(_slack_line_bus())


# ── Synchronous machine model (§6.3) ─────────────────────────────────────────
def test_synchronous_machine_impedance():
    m = _sync()
    assert m.x_subtransient_ohm == pytest.approx(6.75, rel=1e-6)  # 0.15·15²/5
    assert m.r_over_x_ratio == 0.07  # U>1kV, S<100MVA
    assert m.k_g == pytest.approx(1.1 / (1.0 + 0.15 * 0.6), rel=1e-4)  # cosφ0.8 → sinφ0.6
    assert m.ir_a == pytest.approx(5e6 / (math.sqrt(3) * 15e3), rel=1e-4)
    z = m.z_internal_ohm
    assert z.imag == pytest.approx(m.k_g * 6.75, rel=1e-4)
    assert z.real == pytest.approx(m.k_g * 0.07 * 6.75, rel=1e-4)
    assert _synchronous_r_over_x(15.0, 150.0) == 0.05  # S≥100MVA
    assert _synchronous_r_over_x(0.4, 1.0) == 0.15  # LV


def test_synchronous_machine_raises_ikss():
    g = _slack_line_bus()
    g.add_synchronous_machine_source(_sync())
    assert _ikss(g) == pytest.approx(10769.0, rel=0.01)  # hand-calc 10.77 kA


# ── Asynchronous machine model (§6.7) ────────────────────────────────────────
def test_asynchronous_machine_impedance():
    m = _async()
    assert m.sr_mva == pytest.approx(2.0 / (0.95 * 0.85), rel=1e-4)
    assert m.z_abs_ohm == pytest.approx((1.0 / 5.0) * (15e3 / (math.sqrt(3) * m.ir_a)), rel=1e-4)
    assert m.p_per_pole_mw == pytest.approx(1.0, rel=1e-6)
    assert m.r_over_x_ratio == 0.10  # MV, P/p ≥ 1 MW
    assert abs(m.z_internal_ohm) == pytest.approx(m.z_abs_ohm, rel=1e-6)
    assert _asynchronous_r_over_x(15.0, 0.5) == 0.15  # MV, P/p < 1 MW
    assert _asynchronous_r_over_x(0.4, 0.5) == 0.42  # LV


def test_asynchronous_machine_raises_ikss():
    g = _slack_line_bus()
    g.add_asynchronous_machine_source(_async())
    assert _ikss(g) == pytest.approx(9959.0, rel=0.01)


# ── Per-machine partial currents + breaking current (§6.6) ───────────────────
def test_synchronous_partial_and_breaking():
    g = _slack_line_bus()
    g.add_synchronous_machine_source(_sync())
    res = compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=0.10)
    assert len(res.contributions) == 1
    c = res.contributions[0]
    assert c.is_synchronous_machine
    assert c.ikss_partial_a == pytest.approx(1395.0, rel=0.01)  # = c·Un/(√3·Z″)
    assert c.q == 1.0
    assert c.mu == pytest.approx(0.691, abs=0.005)
    assert c.ib_a == pytest.approx(c.mu * c.ikss_partial_a, rel=1e-9)


def test_asynchronous_partial_and_breaking():
    g = _slack_line_bus()
    g.add_asynchronous_machine_source(_async())
    res = compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=0.10)
    c = res.contributions[0]
    assert not c.is_synchronous_machine
    assert c.ikss_partial_a == pytest.approx(524.0, rel=0.02)  # = c·Un/(√3·Z_M)
    assert c.mu == pytest.approx(0.744, abs=0.005)
    assert c.q == pytest.approx(0.57, abs=0.01)
    assert c.ib_a == pytest.approx(c.mu * c.q * c.ikss_partial_a, rel=1e-9)
    assert res.motors_negligible is False


# ── DFIG (wind Type 3): crowbar → asynchronous machine (§6.7/§6.6) ────────────
def test_dfig_modeled_as_asynchronous_with_crowbar_label():
    g = _slack_line_bus()
    g.add_asynchronous_machine_source(_dfig())
    res = compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=0.10)
    c = res.contributions[0]
    assert c.machine_type == "DFIG"
    assert not c.is_synchronous_machine
    # Same μ·q math as a squirrel-cage induction machine — only the label differs.
    assert c.ikss_partial_a == pytest.approx(524.0, rel=0.02)
    assert c.q == pytest.approx(0.57, abs=0.01)
    assert c.ib_a == pytest.approx(c.mu * c.q * c.ikss_partial_a, rel=1e-9)
    assert res.white_box["n_dfig"] == 1
    assert "crowbar" in res.white_box["dfig_assumption"].lower()
    assert _dfig().white_box()["wind_type_3"] is True
    assert "DFIG" in str(_dfig().white_box()["model"])


def test_dfig_partial_identical_to_squirrel_cage():
    # The wind_type_3 flag is a documented LABEL (crowbar → induction machine); the
    # partial current + breaking current are identical to the same machine unflagged.
    g1, g2 = _slack_line_bus(), _slack_line_bus()
    g1.add_asynchronous_machine_source(_async())
    g2.add_asynchronous_machine_source(_dfig())
    c1 = compute_machine_contributions(g1, "B").contributions[0]
    c2 = compute_machine_contributions(g2, "B").contributions[0]
    assert c2.ikss_partial_a == c1.ikss_partial_a
    assert c2.ib_a == c1.ib_a
    assert c1.machine_type == "ASYNCHRONOUS"
    assert c2.machine_type == "DFIG"


# ── μ / q factor functions (§6.6.1, §6.6.3) ──────────────────────────────────
def test_mu_factor_curves():
    assert mu_factor(1.5, 0.10) == 1.0  # ratio ≤ 2 ⇒ no decay
    assert mu_factor(8.0, 0.02) == pytest.approx(0.84 + 0.26 * math.exp(-0.26 * 8), rel=1e-9)
    assert mu_factor(8.0, 0.25) == pytest.approx(0.56 + 0.94 * math.exp(-0.38 * 8), rel=1e-9)
    assert 0.0 <= mu_factor(8.0, 0.10) <= 1.0


def test_q_factor_curves():
    assert q_factor(1.0, 0.10) == pytest.approx(0.57, abs=1e-9)  # ln(1) = 0
    assert q_factor(10.0, 0.02) == 1.0  # capped at 1
    assert q_factor(0.0, 0.10) == 1.0  # guard


# ── Small-motor omission (§6.6) ──────────────────────────────────────────────
def test_small_motor_negligible():
    g = _slack_line_bus()
    g.add_asynchronous_machine_source(
        AsynchronousMachineSource(
            id="m",
            name="tiny",
            node_id="B",
            pr_mw=0.05,
            ur_kv=15.0,
            cos_phi_r=0.85,
            efficiency=0.90,
            i_lr_ratio=5.0,
            pole_pairs=1,
        )
    )
    res = compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=0.10)
    assert res.motors_negligible is True  # ≤ 5 % of total I″k


# ── Determinism of the module ────────────────────────────────────────────────
def test_module_deterministic():
    g = _slack_line_bus()
    g.add_synchronous_machine_source(_sync())
    g.add_asynchronous_machine_source(_async())
    assert (
        compute_machine_contributions(g, "B").to_dict()
        == compute_machine_contributions(g, "B").to_dict()
    )


# ── Wywod dyplomowy WHITE BOX per maszyna (zasada 2026-07-22) ─────────────────
def test_wywod_synchronous_full_derivation():
    """Kazdy krok wywodu: wzor ogolny -> podstawienie liczbowe -> wynik (KaTeX)."""
    g = _slack_line_bus()
    g.add_synchronous_machine_source(_sync())
    res = compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=0.10)
    c = res.contributions[0]
    kroki = list(c.wywod)
    assert all(set(k) == {"tekst", "latex"} for k in kroki)
    latexy = " ".join(k["latex"] for k in kroki if k["latex"])
    # Impedancja z modulem; wzor superpozycji Z-bus; podstawienie z c = 1.10.
    assert r"|Z''_m| =" in latexy
    assert r"I''_{k,m} = \frac{c\,|Z_{mk}|}{|Z_{kk}|\,|Z_m|}" in latexy
    assert r"\frac{1.10 \cdot" in latexy
    # Krotnosc z podstawieniem i mu z krzywej t_min = 0.10 s (0.62 + 0.72 e^-0.32k).
    assert rf"= {c.ratio_ik_ir:.2f}" in latexy
    assert r"\mu = 0.62 + 0.72\,e^{-0.32" in latexy
    # Ib z pelnym podstawieniem mu * q * I''k = wynik.
    assert rf"{c.mu:.3f} \cdot {c.q:.3f} \cdot {c.ikss_partial_a / 1000.0:.3f}" in latexy
    assert rf"= {c.ib_a / 1000.0:.3f}\;\mathrm{{kA}}" in latexy
    # Serializacja niesie wywod (kontrakt addytywny).
    assert res.to_dict()["contributions"][0]["wywod"] == kroki


def test_wywod_asynchronous_q_curve_and_dfig_note():
    g = _slack_line_bus()
    g.add_asynchronous_machine_source(_dfig())
    res = compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=0.10)
    c = res.contributions[0]
    latexy = " ".join(k["latex"] for k in c.wywod if k["latex"])
    teksty = " ".join(k["tekst"] for k in c.wywod)
    # Krzywa q dla t_min = 0.10 s: q = 0.57 + 0.12 ln m, z podstawieniem m.
    assert r"q = 0.57 + 0.12\,\ln" in latexy
    assert "crowbar" in teksty
    # Determinizm wywodu.
    res2 = compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=0.10)
    assert list(res2.contributions[0].wywod) == list(c.wywod)
