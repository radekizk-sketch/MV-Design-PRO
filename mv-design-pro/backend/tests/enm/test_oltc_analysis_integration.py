"""OLTC end-to-end at the analysis-run level (V12K-045, OLTC F4).

Proves the canonical tap changer flows through the whole chain:
    ENM Transformer.tap_changer -> mapping -> domain TapChanger
    -> canonical load-flow OLTC control loop -> run.raw_result["oltc_control"].

The regulated SN busbar is driven toward the setpoint; the regulator decision
trace, final positions and switch counts are surfaced on the run result.
"""

from __future__ import annotations

import pytest
from enm.canonical_analysis import (
    _graph_id_from_ref,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm

from tests.catalog_test_helpers import gpz_source_record


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _payload(name: str, *, with_oltc: bool, setpoint_kv: float = 15.5) -> dict:
    """110 kV slack -> 110/15 transformer -> SN busbar -> line -> load.

    The transformer + line drop depress the SN busbar; an OLTC regulated on the
    HV winding steps down to raise it toward the setpoint.
    """
    transformer = {
        "id": "00000000-0000-0000-0000-000000000010",
        "ref_id": "tr1",
        "name": "TR 110/15",
        "tags": [],
        "meta": {},
        "hv_bus_ref": "b_hv",
        "lv_bus_ref": "b_sn",
        "sn_mva": 25.0,
        "uhv_kv": 110.0,
        "ulv_kv": 15.0,
        "uk_percent": 12.0,
        "pk_kw": 120.0,
        "catalog_ref": "tr-wn-sn-110-15-25mva-yd11",
        "catalog_namespace": "TRAFO_SN_NN",
    }
    if with_oltc:
        transformer["tap_changer"] = {
            "regulation_type": "OLTC",
            "regulated_winding": "HV",
            "neutral_position": 0,
            "current_position": 0,
            "min_position": -9,
            "max_position": 9,
            "step_percent": 1.25,
            "control_mode": "AUTOMATIC",
            "voltage_setpoint_kv": setpoint_kv,
            "deadband_kv": 0.2,
            "controlled_bus_ref": "b_sn",
            "catalog_ref": "tc_oltc_110sn_19_125",
        }
    return {
        "header": {
            "name": name,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "b_hv",
                "name": "110 kV",
                "tags": [],
                "meta": {},
                "voltage_kv": 110,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "ref_id": "b_sn",
                "name": "SN",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000003",
                "ref_id": "b_load",
                "name": "Odbior",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000011",
                "ref_id": "ln-1",
                "name": "Linia SN",
                "tags": [],
                "meta": {},
                "from_bus_ref": "b_sn",
                "to_bus_ref": "b_load",
                "status": "closed",
                "type": "line_overhead",
                "length_km": 5.0,
                "r_ohm_per_km": 0.3,
                "x_ohm_per_km": 0.4,
                "catalog_ref": "LINIA_SN:reczne",
                "catalog_namespace": "LINIA_SN",
            },
        ],
        "transformers": [transformer],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000004",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="s1",
                    name="S1",
                    bus_ref="b_hv",
                    voltage_kv=110.0,
                    sk3_mva=3000.0,
                    rx_ratio=0.1,
                ),
            },
        ],
        "loads": [
            {
                "id": "00000000-0000-0000-0000-000000000020",
                "ref_id": "load-1",
                "name": "Odbior",
                "tags": [],
                "meta": {},
                "bus_ref": "b_load",
                "p_mw": 15.0,
                "q_mvar": 7.0,
                "model": "pq",
            },
        ],
        "generators": [],
        "shunt_capacitors": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def _v_kv(run, ref_id: str) -> float:
    return run.raw_result["node_voltage_kv"][_graph_id_from_ref(ref_id)]


def test_oltc_regulates_sn_bus_through_analysis():
    set_enm("oltc-off", EnergyNetworkModel.model_validate(_payload("bez OLTC", with_oltc=False)))
    set_enm("oltc-on", EnergyNetworkModel.model_validate(_payload("z OLTC", with_oltc=True)))

    run_off = execute_run(create_run(case_id="oltc-off", analysis_type="PF").id)
    run_on = execute_run(create_run(case_id="oltc-on", analysis_type="PF").id)

    assert run_off.status == "FINISHED", run_off.error_message
    assert run_on.status == "FINISHED", run_on.error_message

    # Without OLTC the SN busbar sits below the setpoint.
    v_off = _v_kv(run_off, "b_sn")
    assert v_off < 15.5 - 0.1

    # OLTC surfaced on the run and it acted.
    oltc = run_on.raw_result["oltc_control"]
    assert oltc is not None
    assert oltc["converged"] is True
    tr_key = _graph_id_from_ref("tr1")
    assert oltc["final_positions"][tr_key] < 0  # HV-regulated stepped down to raise SN
    assert oltc["switch_counts"][tr_key] == abs(oltc["final_positions"][tr_key])
    assert oltc["total_switch_count"] >= 1

    # The regulated SN busbar rose toward the setpoint.
    v_on = _v_kv(run_on, "b_sn")
    assert v_on > v_off
    assert abs(v_on - 15.5) <= 0.2 / 2 + 1e-6

    # Without OLTC there is no oltc_control key (backward compatible).
    assert "oltc_control" not in run_off.raw_result


def test_oltc_analysis_is_deterministic():
    set_enm("oltc-d1", EnergyNetworkModel.model_validate(_payload("det1", with_oltc=True)))
    set_enm("oltc-d2", EnergyNetworkModel.model_validate(_payload("det2", with_oltc=True)))
    run1 = execute_run(create_run(case_id="oltc-d1", analysis_type="PF").id)
    run2 = execute_run(create_run(case_id="oltc-d2", analysis_type="PF").id)
    assert run1.raw_result["oltc_control"]["final_positions"] == (
        run2.raw_result["oltc_control"]["final_positions"]
    )
    assert run1.raw_result["oltc_control"]["switch_counts"] == (
        run2.raw_result["oltc_control"]["switch_counts"]
    )
