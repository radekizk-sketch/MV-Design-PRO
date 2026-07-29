from __future__ import annotations

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader


def _base_enm() -> dict:
    return EnergyNetworkModel(
        header=ENMHeader(name="converter-test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")


def _station_enm() -> dict:
    enm = _base_enm()
    enm["buses"] = [
        {
            "ref_id": "bus_sn_1",
            "name": "Szyna SN 1",
            "voltage_kv": 15.0,
            "frequency_hz": 50.0,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        },
        {
            "ref_id": "bus_nn_1",
            "name": "Szyna nN 1",
            "voltage_kv": 0.4,
            "frequency_hz": 50.0,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        },
    ]
    enm["transformers"] = [
        {
            "ref_id": "tr_1",
            "name": "TR-1",
            "hv_bus_ref": "bus_sn_1",
            "lv_bus_ref": "bus_nn_1",
            "sn_mva": 1.0,
            "uhv_kv": 15.0,
            "ulv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 8.0,
            "vector_group": "Dyn11",
            "tags": [],
            "meta": {},
        }
    ]
    enm["substations"] = [
        {
            "ref_id": "st_1",
            "name": "Stacja 1",
            "station_type": "mv_lv",
            "bus_refs": ["bus_sn_1", "bus_nn_1"],
            "transformer_refs": ["tr_1"],
            "tags": [],
            "meta": {},
        }
    ]
    return enm


def _station_enm_without_nn_field_specs() -> dict:
    enm = _station_enm()
    enm["substations"][0]["meta"] = {"nn_field_specs": None}
    return enm


def _station_enm_with_bus_bound_transformer_only() -> dict:
    enm = _station_enm()
    enm["substations"][0].pop("transformer_refs", None)
    return enm


def test_add_converter_source_creates_generator_and_field_for_new_nn_field() -> None:
    result = execute_domain_operation(
        _station_enm(),
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "station_ref": "st_1",
            "bus_nn_ref": "bus_nn_1",
            "placement": "NEW_FIELD",
            "source_field": {
                "source_field_kind": "PV",
                "field_name": "Pole PV nN",
                "catalog_binding": {
                    "catalog_namespace": "APARAT_NN",
                    "catalog_item_id": "ap-nn-630",
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
            "source_name": "Blok PV",
            "quantity": 1,
            "control_mode": "STALY_COS_PHI",
            "power_setpoint_mw": 0.5,
            "q_min_mvar": -0.2,
            "q_max_mvar": 0.2,
            "catalog_binding": {
                "catalog_namespace": "CONVERTER",
                "catalog_item_id": "conv-pv-1mw",
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
            "materialized_params": {
                "catalog_item_id": "conv-pv-1mw",
                "catalog_item_version": "2024.1",
                "un_kv": 0.4,
                "pmax_mw": 0.5,
                "sn_mva": 0.5,
            },
        },
    )

    assert not result.get("error")
    snapshot = result["snapshot"]
    generator = snapshot["generators"][0]
    field_specs = snapshot["substations"][0]["meta"]["nn_field_specs"]

    assert generator["gen_type"] == "pv_inverter"
    assert generator["catalog_namespace"] == "CONVERTER"
    assert generator["connection_variant"] == "nn_side"
    assert generator["p_mw"] == 0.5
    assert generator["meta"]["field_ref"] == field_specs[0]["field_ref"]
    assert field_specs[0]["meta"]["source_field_kind"] == "PV"
    assert field_specs[0]["meta"]["apparatus_catalog_ref"] == "ap-nn-630"

    EnergyNetworkModel.model_validate(snapshot)


def test_add_converter_source_persists_reactive_regulation_on_generator_meta() -> None:
    """G-OZE-B3: cos_phi / qu_slope / P(f) statyzm+pasmo trafiają do meta generatora,
    skąd kanoniczny PF buduje sterowanie falownika (V12K-063)."""
    result = execute_domain_operation(
        _station_enm(),
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "station_ref": "st_1",
            "bus_nn_ref": "bus_nn_1",
            "placement": "NEW_FIELD",
            "source_field": {
                "source_field_kind": "PV",
                "field_name": "Pole PV nN",
                "catalog_binding": {
                    "catalog_namespace": "APARAT_NN",
                    "catalog_item_id": "ap-nn-630",
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
            "source_name": "Blok PV regulowany",
            "quantity": 1,
            "control_mode": "STALY_COS_PHI",
            "cos_phi": 0.95,
            "qu_slope_pu_per_pu": 4.0,
            "qu_deadband_low_pu": 0.95,
            "qu_deadband_high_pu": 1.05,
            "frequency_droop_percent": 5.0,
            "lfsm_deadband_hz": 0.2,
            "power_setpoint_mw": 0.5,
            "catalog_binding": {
                "catalog_namespace": "CONVERTER",
                "catalog_item_id": "conv-pv-1mw",
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
            "materialized_params": {
                "catalog_item_id": "conv-pv-1mw",
                "catalog_item_version": "2024.1",
                "un_kv": 0.4,
                "pmax_mw": 0.5,
                "sn_mva": 0.5,
            },
        },
    )

    assert not result.get("error"), result.get("error")
    meta = result["snapshot"]["generators"][0]["meta"]
    assert meta["cos_phi"] == 0.95
    assert meta["qu_slope_pu_per_pu"] == 4.0
    assert meta["qu_deadband_low_pu"] == 0.95
    assert meta["qu_deadband_high_pu"] == 1.05
    assert meta["frequency_droop_percent"] == 5.0
    assert meta["lfsm_deadband_hz"] == 0.2
    EnergyNetworkModel.model_validate(result["snapshot"])


def test_add_converter_source_accepts_station_transformer_bound_by_buses() -> None:
    result = execute_domain_operation(
        _station_enm_with_bus_bound_transformer_only(),
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "station_ref": "st_1",
            "bus_nn_ref": "bus_nn_1",
            "placement": "NEW_FIELD",
            "source_name": "PV za transformatorem stacji",
            "source_field": {
                "source_field_kind": "PV",
                "field_name": "Pole PV nN",
                "catalog_binding": {
                    "catalog_namespace": "APARAT_NN",
                    "catalog_item_id": "ap-nn-630",
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
            "catalog_binding": {
                "catalog_namespace": "CONVERTER",
                "catalog_item_id": "conv-pv-bus-bound-transformer",
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
            "materialized_params": {
                "catalog_item_id": "conv-pv-bus-bound-transformer",
                "catalog_item_version": "2024.1",
                "un_kv": 0.4,
                "rated_power_ac_kw": 500.0,
                "max_power_kw": 500.0,
                "control_mode": "STALY_COS_PHI",
                "pmax_mw": 0.5,
                "sn_mva": 0.5,
            },
        },
    )

    assert not result.get("error"), result.get("error")
    assert result["snapshot"]["generators"][0]["connection_variant"] == "nn_side"


def test_add_converter_source_returns_field_not_found_for_missing_existing_field() -> None:
    result = execute_domain_operation(
        _station_enm(),
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "station_ref": "st_1",
            "bus_nn_ref": "bus_nn_1",
            "placement": "EXISTING_FIELD",
            "existing_field_ref": "bay-existing-pv",
            "source_name": "Legacy PV",
            "power_setpoint_mw": 0.5,
            "catalog_binding": {
                "catalog_namespace": "CONVERTER",
                "catalog_item_id": "conv-pv-legacy",
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
            "materialized_params": {
                "catalog_item_id": "conv-pv-legacy",
                "catalog_item_version": "2024.1",
                "un_kv": 0.4,
                "rated_power_ac_kw": 500.0,
                "max_power_kw": 500.0,
                "control_mode": "STALY_COS_PHI",
                "pmax_mw": 0.5,
                "sn_mva": 0.5,
            },
        },
    )

    assert result["error_code"] == "converter.field_not_found"


def test_add_converter_source_rejects_catalog_voltage_mismatch_with_nn_bus() -> None:
    result = execute_domain_operation(
        _station_enm(),
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "station_ref": "st_1",
            "bus_nn_ref": "bus_nn_1",
            "placement": "NEW_FIELD",
            "source_field": {
                "source_field_kind": "PV",
                "field_name": "Pole PV nN",
                "catalog_binding": {
                    "catalog_namespace": "APARAT_NN",
                    "catalog_item_id": "ap-nn-630",
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
            "source_name": "Blok PV",
            "power_setpoint_mw": 0.5,
            "catalog_binding": {
                "catalog_namespace": "ZRODLO_NN_PV",
                "catalog_item_id": "conv-pv-15kv",
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
            "materialized_params": {
                "catalog_item_id": "conv-pv-15kv",
                "catalog_item_version": "2024.1",
                "un_kv": 15.0,
                "rated_power_ac_kw": 500.0,
                "max_power_kw": 500.0,
                "control_mode": "STALY_COS_PHI",
                "pmax_mw": 0.5,
                "sn_mva": 0.5,
            },
        },
    )

    assert result["error_code"] == "converter.voltage_mismatch"
    assert "Źródło: 15 kV, szyna: 0.4 kV" in result["error"]


@pytest.mark.parametrize(
    ("op_name", "payload", "expected_role"),
    [
        (
            "add_nn_outgoing_field",
            {
                "station_ref": "st_1",
                "bus_nn_ref": "bus_nn_1",
                "field_name": "Odplyw testowy",
            },
            "FEEDER",
        ),
        (
            "add_converter_source",
            {
                "source_technology": "PV",
                "connection_variant": "nn_side",
                "station_ref": "st_1",
                "bus_nn_ref": "bus_nn_1",
                "source_name": "PV bez listy",
                "catalog_binding": {
                    "catalog_namespace": "CONVERTER",
                    "catalog_item_id": "conv-pv-nullable-list",
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
                "materialized_params": {
                    "catalog_item_id": "conv-pv-nullable-list",
                    "catalog_item_version": "2024.1",
                    "un_kv": 0.4,
                    "rated_power_ac_kw": 500.0,
                    "max_power_kw": 500.0,
                    "control_mode": "STALY_COS_PHI",
                    "pmax_mw": 0.5,
                    "sn_mva": 0.5,
                },
            },
            "OZE",
        ),
    ],
)
def test_nn_field_operations_tolerate_missing_nn_field_specs_list(
    op_name: str,
    payload: dict,
    expected_role: str,
) -> None:
    result = execute_domain_operation(_station_enm_without_nn_field_specs(), op_name, payload)

    assert not result.get("error"), result.get("error")
    snapshot = result["snapshot"]
    nn_field_specs = snapshot["substations"][0]["meta"]["nn_field_specs"]

    assert isinstance(nn_field_specs, list)
    assert len(nn_field_specs) == 1
    assert nn_field_specs[0]["bay_role"] == expected_role
