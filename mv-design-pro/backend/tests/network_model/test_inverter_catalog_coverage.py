from network_model.catalog.repository import get_default_mv_catalog


def test_nn_converter_voltages_have_matching_sn_nn_transformers() -> None:
    catalog = get_default_mv_catalog()
    transformer_types = [item.to_dict() for item in catalog.list_transformer_types()]
    converter_types = [item.to_dict() for item in catalog.list_converter_types()]

    nn_converter_voltages = sorted(
        {
            item["un_kv"]
            for item in converter_types
            if item["kind"] in {"PV", "BESS", "WIND"} and item["un_kv"] <= 6.3
        }
    )

    assert nn_converter_voltages == [0.4, 0.5, 0.69, 0.8, 1.0, 3.15, 6.0, 6.3]
    for lv_voltage_kv in nn_converter_voltages:
        for sn_voltage_kv in (15.0, 20.0):
            assert any(
                abs(item["voltage_hv_kv"] - sn_voltage_kv) < 1e-6
                and abs(item["voltage_lv_kv"] - lv_voltage_kv) < 1e-6
                for item in transformer_types
            ), f"Missing TR {sn_voltage_kv:g}/{lv_voltage_kv:g} kV"


def test_each_converter_family_has_complete_nn_voltage_range() -> None:
    catalog = get_default_mv_catalog()
    converter_types = [item.to_dict() for item in catalog.list_converter_types()]
    expected_voltages = {0.4, 0.5, 0.69, 0.8, 1.0, 3.15, 6.0, 6.3}

    for kind in ("PV", "BESS", "WIND"):
        voltages = {
            item["un_kv"]
            for item in converter_types
            if item["kind"] == kind and item["un_kv"] <= 6.3
        }
        assert expected_voltages <= voltages
