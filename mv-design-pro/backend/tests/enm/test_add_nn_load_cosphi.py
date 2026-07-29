"""G-NN (V12K-050): add_nn_load wyprowadza Q z cosφ (domknięcie phantomu).

Wcześniej cosφ trafiał tylko do meta, a q_mvar liczono wyłącznie z jawnego
reactive_power_kvar → odbiór z P + cosφ miał Q=0 i rozpływ mocy ignorował cosφ.
Ten test weryfikuje wyprowadzenie mocy biernej oraz nienadpisywanie jawnego Q.
"""

from __future__ import annotations

import math

import pytest
from enm.domain_operations import execute_domain_operation


def _enm_with_feeder() -> dict:
    """Minimalny ENM ze stacją, szyną nN i odpływem nN (feeder)."""
    enm: dict = {
        "buses": [{"ref_id": "bus-nn", "name": "Szyna nN", "voltage_kv": 0.4}],
        "substations": [
            {"ref_id": "st-1", "name": "ST-1", "bus_refs": ["bus-nn"], "field_specs": []}
        ],
    }
    feeder = execute_domain_operation(
        enm, "add_nn_outgoing_field", {"station_ref": "st-1", "bus_nn_ref": "bus-nn"}
    )
    assert not feeder.get("error"), feeder
    return feeder["snapshot"], feeder["selection_hint"]["element_id"]


def _load(snapshot: dict) -> dict:
    loads = snapshot.get("loads") or []
    assert len(loads) == 1
    return loads[0]


def test_reactive_power_derived_from_cos_phi() -> None:
    snapshot, feeder_ref = _enm_with_feeder()
    result = execute_domain_operation(
        snapshot,
        "add_nn_load",
        {
            "feeder_ref": feeder_ref,
            "bus_nn_ref": "bus-nn",
            "active_power_kw": 100.0,
            "cos_phi": 0.9,
        },
    )
    assert not result.get("error"), result
    load = _load(result["snapshot"])
    expected_q_mvar = (100.0 * math.tan(math.acos(0.9))) / 1000.0
    assert load["p_mw"] == pytest.approx(0.1)
    assert load["q_mvar"] == pytest.approx(expected_q_mvar)
    assert load["q_mvar"] > 0.0  # regresja phantomu (było 0.0)


def test_explicit_reactive_power_is_not_overridden() -> None:
    snapshot, feeder_ref = _enm_with_feeder()
    result = execute_domain_operation(
        snapshot,
        "add_nn_load",
        {
            "feeder_ref": feeder_ref,
            "bus_nn_ref": "bus-nn",
            "active_power_kw": 100.0,
            "cos_phi": 0.9,
            "reactive_power_kvar": 20.0,
        },
    )
    load = _load(result["snapshot"])
    assert load["q_mvar"] == pytest.approx(0.02)


def test_no_cos_phi_no_reactive_gives_zero() -> None:
    snapshot, feeder_ref = _enm_with_feeder()
    result = execute_domain_operation(
        snapshot,
        "add_nn_load",
        {"feeder_ref": feeder_ref, "bus_nn_ref": "bus-nn", "active_power_kw": 50.0},
    )
    load = _load(result["snapshot"])
    assert load["q_mvar"] == pytest.approx(0.0)
