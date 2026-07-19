"""G-SCM F-follow-1 (V12K-055): agregat/UPS przechodzą walidację ENM i wpinają się
w łańcuch zwarciowy.

Regresja defektu: `add_genset_nn`/`add_ups_nn` zapisywały `gen_type="GENSET"`/`"UPS"`,
których model `Generator` NIE akceptuje → agregat/UPS nie przechodziły walidacji ENM
(cały łańcuch SC maszyn wirujących zablokowany). Testy ćwiczą realną ścieżkę:
operacja domenowa → walidacja ENM → graf → źródło zwarciowe.
"""

from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel


def _base_enm() -> dict:
    return {
        "header": {"name": "Test genset/UPS"},
        "buses": [{"ref_id": "bus-nn", "name": "Szyna nN", "voltage_kv": 0.4}],
        "substations": [
            {
                "ref_id": "st-1",
                "name": "ST-1",
                "station_type": "mv_lv",
                "bus_refs": ["bus-nn"],
                "field_specs": [],
            }
        ],
    }


def _genset_payload() -> dict:
    return {
        "bus_nn_ref": "bus-nn",
        "station_ref": "st-1",
        "placement": "NEW_FIELD",
        "genset_spec": {
            "rated_power_kw": 400.0,
            "rated_voltage_kv": 0.4,
            "power_factor": 0.8,
            "operation_mode": "PRACA_AWARYJNA",
            "source_name": "Agregat awaryjny",
        },
    }


def _ups_payload() -> dict:
    return {
        "bus_nn_ref": "bus-nn",
        "station_ref": "st-1",
        "placement": "NEW_FIELD",
        "ups_spec": {
            "rated_power_kw": 120.0,
            "backup_time_min": 15.0,
            "source_name": "UPS serwerowni",
        },
    }


def test_genset_validates_and_becomes_synchronous_sc_source():
    result = execute_domain_operation(_base_enm(), "add_genset_nn", _genset_payload())
    assert not result.get("error"), result
    snapshot = result["snapshot"]

    gen = next(g for g in snapshot["generators"] if g["ref_id"].startswith("gen"))
    assert gen["gen_type"] == "synchronous"  # regresja: było "GENSET" (odrzucane)
    assert gen["meta"]["source_kind"] == "GENSET"  # tożsamość zachowana
    mp = gen["materialized_params"]
    assert mp["sn_mva"] > 0 and mp["un_kv"] == 0.4 and mp["cos_phi"] == 0.8
    # S = P/cosφ = 0.4/0.8 = 0.5 MVA
    assert mp["sn_mva"] == 0.5

    # Kluczowe: snapshot przechodzi walidację ENM (wcześniej rzucał ValidationError).
    enm = EnergyNetworkModel.model_validate(snapshot)
    graph = map_enm_to_network_graph(enm)
    machines = graph.get_synchronous_machine_sources()
    assert len(machines) == 1
    assert machines[0].sr_mva == 0.5


def test_ups_validates_and_becomes_inverter_sc_source():
    result = execute_domain_operation(_base_enm(), "add_ups_nn", _ups_payload())
    assert not result.get("error"), result
    snapshot = result["snapshot"]

    gen = next(g for g in snapshot["generators"] if g["ref_id"].startswith("ups"))
    assert gen["gen_type"] == "bess"  # regresja: było "UPS" (odrzucane)
    assert gen["meta"]["source_kind"] == "UPS"  # tożsamość zachowana
    assert gen["materialized_params"]["un_kv"] == 0.4

    enm = EnergyNetworkModel.model_validate(snapshot)
    graph = map_enm_to_network_graph(enm)
    inverters = graph.get_inverter_sources()
    assert len(inverters) == 1
