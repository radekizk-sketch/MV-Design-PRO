"""ADR-011: ENM->catalog->Node wiring for the ZIP+frequency load model.

Proves the critical aggregation seam: a Load whose catalog-materialized params
carry ZIP coefficients yields a Node.zip_coeffs (power-weighted across loads on
the bus), which canonical_analysis then passes into PQSpec.zip_coeffs. Constant
-power loads leave Node.zip_coeffs=None (unchanged classic path).
"""

from __future__ import annotations

from enm.mapping import map_enm_to_network_graph
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Load


def _enm(loads: list[Load]) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="ZIP wiring"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=15)],
        loads=loads,
    )


def _node(enm: EnergyNetworkModel):
    return next(iter(map_enm_to_network_graph(enm).nodes.values()))


def test_constant_power_load_leaves_node_zip_none() -> None:
    node = _node(_enm([Load(ref_id="l1", name="L1", bus_ref="b1", p_mw=1.0, q_mvar=0.3)]))
    assert node.zip_coeffs is None


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
