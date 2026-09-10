"""Testy sieci demonstracyjnej DEMO-OZE-SC: N unikalnych konfiguracji OZE +
realny bieg zwarciowy zbiega na kazdej szynie SN."""

from __future__ import annotations

import uuid

from enm.assembler import _build_snapshot_graph_element_context
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

from tests.reference_networks.demo_oze_sc import build_demo_oze_sc_network


def test_demo_network_has_unique_oze_config_per_station() -> None:
    result = build_demo_oze_sc_network()

    assert result["station_count"] == 12
    assert not result["der_errors"], result["der_errors"]
    assert not result["load_errors"], result["load_errors"]

    # Kazda stacja ma INNA konfiguracje (unikalny klucz).
    keys = [c["config_key"] for c in result["station_configs"]]
    assert len(keys) == len(set(keys)) == 12

    # Wszystkie trzy technologie DER obecne (materializowane converter sources).
    assert {"pv_inverter", "bess", "wind_inverter"} <= result["der_types"]

    # Obecny co najmniej jeden tor SN z transformatorem blokowym (W2c) oraz
    # stacja odniesienia bez OZE.
    variants = {d["variant"] for c in result["station_configs"] for d in c["der"]}
    assert "nn_side" in variants
    assert "block_transformer" in variants
    assert any(not c["der"] for c in result["station_configs"])


def test_demo_network_short_circuit_converges_on_every_sn_bus() -> None:
    result = build_demo_oze_sc_network()
    enm_dict = result["enm"]
    enm = EnergyNetworkModel.model_validate(enm_dict)
    graph = map_enm_to_network_graph(enm)
    node_ctx = _build_snapshot_graph_element_context(enm_dict).get("nodes", {})

    reportable = [
        node_id
        for node_id in sorted(graph.nodes.keys())
        if not node_ctx.get(node_id, {}).get("skip_short_circuit_target", False)
    ]
    ref_by_node = {
        str(uuid.uuid5(uuid.NAMESPACE_DNS, str(bus["ref_id"]))): bus
        for bus in enm_dict.get("buses", [])
        if (bus.get("voltage_kv") or 0.0) >= 1.0 and bus.get("ref_id")
    }

    computed = 0
    for node_id in reportable:
        if node_id not in ref_by_node:
            continue
        res = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph, fault_node_id=node_id, c_factor=1.10, tk_s=1.0
        )
        ikss = float(res.to_dict()["ikss_a"])
        assert ikss == ikss, f"Ik'' NaN na {node_id}"  # noqa: PLR0133
        assert ikss > 0, f"Ik'' <= 0 na {node_id}"
        computed += 1

    assert computed >= 12, f"Za malo raportowanych szyn SN: {computed}"


def test_demo_network_is_deterministic() -> None:
    a = build_demo_oze_sc_network()
    b = build_demo_oze_sc_network()
    assert a["snapshot_hash"] == b["snapshot_hash"]
