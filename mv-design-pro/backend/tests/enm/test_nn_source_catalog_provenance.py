from __future__ import annotations

import copy

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader


def _base_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="nn-source-catalog", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    enm["buses"] = [
        {
            "ref_id": "bus/nn/1",
            "name": "Szyna nN",
            "voltage_kv": 0.4,
            "tags": [],
            "meta": {},
        }
    ]
    enm["substations"] = [
        {
            "ref_id": "sub/1",
            "name": "Stacja SN/nN 1",
            "bus_refs": ["bus/nn/1"],
            "transformer_refs": ["tr/1"],
            "tags": [],
            "meta": {},
        }
    ]
    return enm


def _base_enm_with_transformer(sn_mva: float = 0.63) -> dict:
    enm = _base_enm()
    enm["transformers"] = [
        {
            "ref_id": "tr/1",
            "name": f"Transformator SN/nN {sn_mva * 1000:.0f} kVA",
            "hv_bus_ref": "bus/sn/1",
            "lv_bus_ref": "bus/nn/1",
            "sn_mva": sn_mva,
            "uhv_kv": 15.0,
            "ulv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 1.0,
            "tags": [],
            "meta": {},
        }
    ]
    enm["buses"].insert(
        0,
        {
            "ref_id": "bus/sn/1",
            "name": "Szyna SN",
            "voltage_kv": 15.0,
            "tags": [],
            "meta": {},
        },
    )
    enm["substations"][0]["bus_refs"] = ["bus/sn/1", "bus/nn/1"]
    return enm


def _converter_payload(technology: str, overrides: dict | None = None) -> dict:
    payload = {
        "source_technology": technology,
        "connection_variant": "nn_side",
        "bus_nn_ref": "bus/nn/1",
        "station_ref": "sub/1",
    }
    if overrides:
        payload.update(overrides)
    return payload


@pytest.mark.parametrize("technology", ["PV", "BESS"])
def test_missing_catalog_binding_fails_for_canonical_converter_source(technology: str) -> None:
    result = execute_domain_operation(
        _base_enm(),
        "add_converter_source",
        _converter_payload(technology),
    )

    assert result.get("snapshot") is None
    assert result.get("error_code") == "catalog.ref_required"


@pytest.mark.parametrize(
    ("technology", "binding"),
    [
        ("PV", {"item_id": ""}),
        ("BESS", "invalid"),
    ],
)
def test_malformed_binding_fails_for_canonical_converter_source(
    technology: str,
    binding: dict | str,
) -> None:
    result = execute_domain_operation(
        _base_enm(),
        "add_converter_source",
        _converter_payload(technology, {"catalog_binding": binding}),
    )

    assert result.get("snapshot") is None
    assert result.get("error_code") == "catalog.binding_invalid"


@pytest.mark.parametrize(
    ("technology", "catalog_item_id"),
    [
        ("PV", "PV-CAT-001"),
        ("BESS", "BESS-CAT-001"),
    ],
)
def test_failed_materialization_leaves_snapshot_unchanged(
    technology: str,
    catalog_item_id: str,
) -> None:
    enm_before = _base_enm_with_transformer()
    baseline = copy.deepcopy(enm_before)

    result = execute_domain_operation(
        enm_before,
        "add_converter_source",
        _converter_payload(
            technology,
            {
                "catalog_binding": {
                    "catalog_namespace": "CONVERTER",
                    "catalog_item_id": catalog_item_id,
                    "catalog_item_version": "2024.1",
                },
            },
        ),
    )

    assert result.get("snapshot") is None
    assert result.get("error_code") == "catalog.item_not_found"
    assert enm_before == baseline


@pytest.mark.parametrize(
    ("technology", "materialized_params", "catalog_key"),
    [
        (
            "PV",
            {
                "catalog_item_id": "PV-CAT-001",
                "catalog_item_version": "2024.1",
                "rated_power_ac_kw": 50.0,
                "max_power_kw": 55.0,
                "control_mode": "STALY_COS_PHI",
                "un_kv": 0.4,
                "pmax_mw": 0.055,
                "sn_mva": 0.05,
            },
            "PV-CAT-001",
        ),
        (
            "BESS",
            {
                "catalog_item_id": "BESS-CAT-001",
                "catalog_item_version": "2024.1",
                "usable_capacity_kwh": 100.0,
                "charge_power_kw": 40.0,
                "discharge_power_kw": 40.0,
                "operation_mode": "DWUKIERUNKOWY",
                "un_kv": 0.4,
                "pmax_mw": 0.04,
                "sn_mva": 0.04,
                "e_kwh": 100.0,
            },
            "BESS-CAT-001",
        ),
    ],
)
def test_successful_create_includes_provenance_fields(
    technology: str,
    materialized_params: dict,
    catalog_key: str,
) -> None:
    result = execute_domain_operation(
        _base_enm_with_transformer(),
        "add_converter_source",
        _converter_payload(
            technology,
            {
                "catalog_binding": {
                    "catalog_namespace": "CONVERTER",
                    "catalog_item_id": catalog_key,
                    "catalog_item_version": "2024.1",
                },
                "materialized_params": materialized_params,
            },
        ),
    )

    assert not result.get("error")
    snapshot = result.get("snapshot")
    assert snapshot is not None

    created_ids = result["changes"]["created_element_ids"]
    assert len(created_ids) == 2

    created = snapshot["generators"][0]
    assert created.get("catalog_ref") == catalog_key
    assert created.get("catalog_namespace") == "CONVERTER"
    assert created.get("source_mode") == "KATALOG"
    assert isinstance(created.get("materialized_params"), dict)
    assert created.get("meta", {}).get("field_ref")


def test_pv_uses_catalog_materialization_when_payload_does_not_supply_it() -> None:
    result = execute_domain_operation(
        _base_enm_with_transformer(),
        "add_converter_source",
        _converter_payload(
            "PV",
            {
                "catalog_binding": {
                    "catalog_namespace": "CONVERTER",
                    "catalog_item_id": "conv-pv-nn-0p5mw-0p4kv",
                    "catalog_item_version": "2024.1",
                },
            },
        ),
    )

    assert not result.get("error")
    snapshot = result.get("snapshot")
    assert snapshot is not None
    created = snapshot["generators"][0]

    assert created.get("catalog_ref") == "conv-pv-nn-0p5mw-0p4kv"
    assert created.get("materialized_params", {}).get("rated_power_ac_kw") == 550.0
    assert created.get("materialized_params", {}).get("max_power_kw") == 500.0
    assert created.get("materialized_params", {}).get("control_mode") == "Q_U_DROOP"


def test_pv_uses_selected_frontend_device_catalog_ref() -> None:
    result = execute_domain_operation(
        _base_enm_with_transformer(0.4),
        "add_converter_source",
        _converter_payload(
            "PV",
            {
                "catalog_binding": {
                    "catalog_namespace": "ZRODLO_NN_PV",
                    "catalog_item_id": "pv_inv_huawei_185",
                    "catalog_item_version": "2024.1",
                },
                "power_setpoint_mw": 0.185,
            },
        ),
    )

    assert not result.get("error")
    snapshot = result.get("snapshot")
    assert snapshot is not None
    created = snapshot["generators"][0]

    assert created.get("catalog_ref") == "pv_inv_huawei_185"
    assert created.get("p_mw") == 0.185
    assert created.get("materialized_params", {}).get("catalog_item_id") == "pv_inv_huawei_185"
    assert created.get("materialized_params", {}).get("max_power_kw") == 185.0


def test_pv_rejects_source_power_above_station_transformer_capacity() -> None:
    result = execute_domain_operation(
        _base_enm_with_transformer(0.063),
        "add_converter_source",
        _converter_payload(
            "PV",
            {
                "catalog_binding": {
                    "catalog_namespace": "ZRODLO_NN_PV",
                    "catalog_item_id": "pv_inv_huawei_185",
                    "catalog_item_version": "2024.1",
                },
                "power_setpoint_mw": 0.185,
            },
        ),
    )

    assert result.get("snapshot") is None
    assert result.get("error_code") == "converter.transformer_capacity_exceeded"


def test_pv_50_kw_catalog_fits_63_kva_station_transformer() -> None:
    result = execute_domain_operation(
        _base_enm_with_transformer(0.063),
        "add_converter_source",
        _converter_payload(
            "PV",
            {
                "catalog_binding": {
                    "catalog_namespace": "ZRODLO_NN_PV",
                    "catalog_item_id": "pv_inv_catalog_50",
                    "catalog_item_version": "2024.1",
                },
                "power_setpoint_mw": 0.05,
            },
        ),
    )

    assert not result.get("error")
    snapshot = result.get("snapshot")
    assert snapshot is not None
    created = snapshot["generators"][0]
    assert created.get("catalog_ref") == "pv_inv_catalog_50"
    assert created.get("p_mw") == 0.05


def test_bess_uses_catalog_materialization_when_payload_supplies_only_operation_mode() -> None:
    result = execute_domain_operation(
        _base_enm_with_transformer(),
        "add_converter_source",
        _converter_payload(
            "BESS",
            {
                "catalog_binding": {
                    "catalog_namespace": "CONVERTER",
                    "catalog_item_id": "conv-bess-nn-0p5mw-0p4kv",
                    "catalog_item_version": "2024.1",
                },
                "bess_mode": "DWUKIERUNKOWY",
            },
        ),
    )

    assert not result.get("error")
    snapshot = result.get("snapshot")
    assert snapshot is not None
    created = snapshot["generators"][0]

    assert created.get("catalog_ref") == "conv-bess-nn-0p5mw-0p4kv"
    assert created.get("materialized_params", {}).get("usable_capacity_kwh") == 1000.0
    assert created.get("materialized_params", {}).get("charge_power_kw") == 500.0
    assert created.get("materialized_params", {}).get("discharge_power_kw") == 500.0
    assert created.get("meta", {}).get("bess_mode") == "DWUKIERUNKOWY"
