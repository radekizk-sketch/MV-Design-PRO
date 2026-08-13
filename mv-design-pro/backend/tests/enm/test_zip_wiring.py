"""ADR-011: ENM->catalog->Node wiring for the ZIP+frequency load model.

Proves the critical aggregation seam: a Load whose catalog-materialized params
carry ZIP coefficients yields a Node.zip_coeffs (power-weighted across loads on
the bus), which canonical_analysis then passes into PQSpec.zip_coeffs. Constant
-power loads leave Node.zip_coeffs=None (unchanged classic path).
"""

from __future__ import annotations

from enm.mapping import map_enm_to_network_graph
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator, Load

_ZIP_CONST_Z = {
    "a_p": 1.0,
    "b_p": 0.0,
    "c_p": 0.0,
    "a_q": 1.0,
    "b_q": 0.0,
    "c_q": 0.0,
}


def _enm(loads: list[Load], generators: list[Generator] | None = None) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="ZIP wiring"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=15)],
        loads=loads,
        generators=generators or [],
    )


def _node(enm: EnergyNetworkModel):
    return next(iter(map_enm_to_network_graph(enm).nodes.values()))


def test_constant_power_load_leaves_node_zip_none() -> None:
    node = _node(_enm([Load(ref_id="l1", name="L1", bus_ref="b1", p_mw=1.0, q_mvar=0.3)]))
    assert node.zip_coeffs is None
    # No polynomial => no load base to carry (historical path, unchanged).
    assert node.zip_load_active_power is None
    assert node.zip_load_reactive_power is None


def test_zip_load_materialized_params_reach_node() -> None:
    load = Load(
        ref_id="l1",
        name="L1",
        bus_ref="b1",
        p_mw=2.0,
        q_mvar=0.5,
        model="zip",
        materialized_params={
            "a_p": 1.0,
            "b_p": 0.0,
            "c_p": 0.0,
            "a_q": 1.0,
            "b_q": 0.0,
            "c_q": 0.0,
        },
    )
    node = _node(_enm([load]))
    assert node.zip_coeffs is not None
    assert node.zip_coeffs.a_p == 1.0
    assert node.zip_coeffs.c_p == 0.0


def test_zip_aggregation_is_power_weighted_across_loads() -> None:
    # 2 MW const-Z + 1 MW const-P on one bus -> a_p = 2/3, c_p = 1/3
    cz = Load(
        ref_id="l1",
        name="Lz",
        bus_ref="b1",
        p_mw=2.0,
        q_mvar=0.0,
        model="zip",
        materialized_params={
            "a_p": 1.0,
            "b_p": 0.0,
            "c_p": 0.0,
            "a_q": 1.0,
            "b_q": 0.0,
            "c_q": 0.0,
        },
    )
    cp = Load(ref_id="l2", name="Lp", bus_ref="b1", p_mw=1.0, q_mvar=0.0)
    node = _node(_enm([cz, cp]))
    assert node.zip_coeffs is not None
    assert node.zip_coeffs.a_p == 1.0 * 2.0 / 3.0
    assert node.zip_coeffs.c_p == 1.0 / 3.0
    assert node.zip_coeffs.a_p + node.zip_coeffs.b_p + node.zip_coeffs.c_p == 1.0


def test_frequency_sensitivity_reaches_node() -> None:
    load = Load(
        ref_id="l1",
        name="L1",
        bus_ref="b1",
        p_mw=1.0,
        q_mvar=0.0,
        model="zip",
        materialized_params={"k_pf": 2.0, "k_qf": 1.0, "f0_hz": 50.0},
    )
    node = _node(_enm([load]))
    assert node.zip_coeffs is not None
    assert node.zip_coeffs.has_frequency_dependence()
    assert node.zip_coeffs.k_pf == 2.0


# ---------------------------------------------------------------------------
# Defect D1 (audit 2026-08-01): the polynomial is built from the LOADS, so the
# bus must also carry the load-only power — the polynomial may not be applied to
# the net (loads minus generation) power.
# ---------------------------------------------------------------------------


def test_pure_load_bus_carries_the_whole_bus_power_as_the_zip_base() -> None:
    load = Load(
        ref_id="l1",
        name="L1",
        bus_ref="b1",
        p_mw=3.0,
        q_mvar=1.5,
        model="zip",
        materialized_params=dict(_ZIP_CONST_Z),
    )
    node = _node(_enm([load]))
    assert node.zip_coeffs is not None
    # Generation convention (a load is negative), same as active_power.
    assert node.active_power == -3.0
    assert node.zip_load_active_power == -3.0
    assert node.zip_load_reactive_power == -1.5


def test_load_and_generation_on_one_bus_are_separated() -> None:
    """The bus net power is loads minus generation; the ZIP base is the load."""
    load = Load(
        ref_id="l1",
        name="L1",
        bus_ref="b1",
        p_mw=3.0,
        q_mvar=1.5,
        model="zip",
        materialized_params=dict(_ZIP_CONST_Z),
    )
    gen = Generator(
        ref_id="g1", name="G1", bus_ref="b1", gen_type="synchronous", p_mw=2.7, q_mvar=0.0
    )
    node = _node(_enm([load], [gen]))
    assert node.zip_coeffs is not None
    assert node.active_power == -3.0 + 2.7
    assert node.zip_load_active_power == -3.0
    assert node.zip_load_reactive_power == -1.5


def test_generation_only_bus_has_no_zip_polynomial() -> None:
    """No load on the bus => no ZIP polynomial => constant-power generation."""
    gen = Generator(
        ref_id="g1", name="G1", bus_ref="b1", gen_type="synchronous", p_mw=2.7, q_mvar=0.5
    )
    node = _node(_enm([], [gen]))
    assert node.zip_coeffs is None
    assert node.zip_load_active_power is None
    assert node.active_power == 2.7


def test_zip_load_compensated_to_unity_power_factor_aggregates_to_constant_q() -> None:
    """Q0 = 0 on the bus => Q polynomial is constant power (sum 1), never sum 0.

    The all-zero Q polynomial used to make the whole run fail (defect D1,
    scenario 2) — see tests/enm/test_zip_generation_split.py for the run itself.
    """
    load = Load(
        ref_id="l1",
        name="L1",
        bus_ref="b1",
        p_mw=2.0,
        q_mvar=0.0,
        model="zip",
        materialized_params=dict(_ZIP_CONST_Z),
    )
    node = _node(_enm([load]))
    assert node.zip_coeffs is not None
    assert (node.zip_coeffs.a_q, node.zip_coeffs.b_q, node.zip_coeffs.c_q) == (0.0, 0.0, 1.0)
