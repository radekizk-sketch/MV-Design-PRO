from api.domain_ops_policy import (
    extract_catalog_binding,
    validate_and_materialize_catalog_binding,
)
from enm.domain_ops_models import InsertStationOnSegmentSNPayload


def test_extract_catalog_binding_prefers_nested_transformer_contract_over_root_binding():
    binding = extract_catalog_binding(
        "insert_station_on_segment_sn",
        {
            "catalog_binding": {
                "catalog_namespace": "KABEL_SN",
                "catalog_item_id": "cable-tfk-yakxs-3x120",
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
            "transformer": {
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
            },
        },
    )

    assert binding is not None
    assert binding["catalog_namespace"] == "TRAFO_SN_NN"
    assert binding["catalog_item_id"] == "tr-sn-nn-15-04-630kva-dyn11"


def test_extract_catalog_binding_supports_canonical_converter_binding_for_pv():
    binding = extract_catalog_binding(
        "add_converter_source",
        {
            "source_technology": "PV",
            "catalog_binding": {
                "catalog_namespace": "CONVERTER",
                "catalog_item_id": "conv-pv-1mw-15kv",
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
        },
    )

    assert binding is not None
    assert binding["catalog_namespace"] == "CONVERTER"
    assert binding["catalog_item_id"] == "conv-pv-1mw-15kv"


def test_extract_catalog_binding_rejects_legacy_nested_converter_payload_shapes():
    pv_binding = extract_catalog_binding(
        "add_converter_source",
        {
            "source_technology": "PV",
            "pv_spec": {
                "catalog_item_id": "conv-pv-1mw-15kv",
            },
        },
    )
    bess_binding = extract_catalog_binding(
        "add_converter_source",
        {
            "source_technology": "BESS",
            "bess_spec": {
                "inverter_catalog_id": "conv-bess-1mw-2mwh-15kv",
            },
        },
    )

    assert pv_binding is None
    assert bess_binding is None


def test_extract_catalog_binding_supports_canonical_converter_source_binding():
    binding = extract_catalog_binding(
        "add_converter_source",
        {
            "source_technology": "FW",
            "catalog_binding": {
                "catalog_namespace": "CONVERTER",
                "catalog_item_id": "conv-fw-3mw-15kv",
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
        },
    )

    assert binding is not None
    assert binding["catalog_namespace"] == "CONVERTER"
    assert binding["catalog_item_id"] == "conv-fw-3mw-15kv"


def test_validate_and_materialize_catalog_binding_accepts_fw_converter_catalog():
    error, solver_fields = validate_and_materialize_catalog_binding(
        "add_converter_source",
        {
            "source_technology": "FW",
            "catalog_ref": "conv-wind-nn-2mw-0p4kv",
        },
    )

    assert error is None
    assert solver_fields["un_kv"] == 0.4
    assert solver_fields["pmax_mw"] == 2.0


def test_extract_catalog_binding_supports_add_sn_bay_catalog_binding():
    binding = extract_catalog_binding(
        "add_sn_bay",
        {
            "bus_ref": "bus-sn-1",
            "catalog_binding": {
                "catalog_namespace": "APARAT_SN",
                "catalog_item_id": "cb-24kv-1250a",
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
        },
    )

    assert binding is not None
    assert binding["catalog_namespace"] == "APARAT_SN"
    assert binding["catalog_item_id"] == "cb-24kv-1250a"


def test_validate_and_materialize_catalog_binding_accepts_segment_catalog_ref_without_explicit_binding():
    error, solver_fields = validate_and_materialize_catalog_binding(
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 200.0,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            }
        },
    )

    assert error is None
    assert solver_fields["r_ohm_per_km"] is not None
    assert solver_fields["rated_current_a"] is not None


def test_validate_and_materialize_catalog_binding_accepts_transformer_catalog_ref_without_explicit_binding():
    error, solver_fields = validate_and_materialize_catalog_binding(
        "add_transformer_sn_nn",
        {
            "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
        },
    )

    assert error is None
    assert solver_fields["rated_power_mva"] is not None
    assert solver_fields["uk_percent"] is not None


def test_validate_catalog_binding_accepts_zksn_catalog_ref_from_branch_point_catalog():
    error, solver_fields = validate_and_materialize_catalog_binding(
        "insert_zksn_on_segment_sn",
        {
            "segment_id": "seg-1",
            "catalog_ref": "ZKSN-2P-630A",
            "catalog_namespace": "mv_branch_points",
        },
    )

    assert error is None
    assert solver_fields == {}


def test_validate_catalog_binding_rejects_unknown_branch_point_catalog_ref():
    error, _ = validate_and_materialize_catalog_binding(
        "insert_branch_pole_on_segment_sn",
        {
            "segment_id": "seg-1",
            "catalog_ref": "BRAK-TAKIEGO-SLUPA",
            "catalog_namespace": "mv_branch_points",
        },
    )

    assert error is not None
    assert error.code == "catalog.materialization_failed"


def test_insert_station_payload_accepts_topological_station_type():
    payload = InsertStationOnSegmentSNPayload.model_validate(
        {
            "segment_id": "seg-1",
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "station": {
                "station_type": "branch",
                "station_role": "STACJA_SN_NN",
                "station_name": "ST-1",
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
            "sn_fields": [
                {"field_role": "LINIA_IN", "catalog_bindings": None},
                {"field_role": "LINIA_OUT", "catalog_bindings": None},
                {"field_role": "LINIA_ODG", "catalog_bindings": None},
            ],
            "transformer": {
                "create": True,
                "model_type": "DWU_UZWOJENIOWY",
                "tap_changer_present": False,
            },
            "nn_block": {
                "create_nn_bus": True,
                "main_breaker_nn": True,
                "outgoing_feeders_nn_count": 1,
                "outgoing_feeders_nn": [
                    {"feeder_role": "ODPLYW_NN", "catalog_bindings": None},
                ],
            },
            "options": {
                "create_transformer_field": True,
                "create_default_fields": True,
                "create_nn_bus": True,
            },
        }
    )

    assert payload.station.station_type == "branch"
