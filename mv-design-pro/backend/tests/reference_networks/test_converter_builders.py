from tests.reference_networks.builders import (
    build_gn04_sn_nn_oze,
    build_gn05_sn_nn_oze_ochrona,
)


def test_gn04_uses_canonical_converter_sources() -> None:
    network = build_gn04_sn_nn_oze()
    enm = network["enm"]

    generators = enm.get("generators", [])
    assert len(generators) >= 2

    converter_generators = [
        generator for generator in generators if generator.get("catalog_namespace") == "CONVERTER"
    ]
    assert len(converter_generators) >= 2
    assert {generator.get("gen_type") for generator in converter_generators} >= {
        "pv_inverter",
        "bess",
    }


def test_gn05_keeps_converter_sources_after_protection_extension() -> None:
    network = build_gn05_sn_nn_oze_ochrona()
    enm = network["enm"]

    generators = enm.get("generators", [])
    assert any(
        generator.get("catalog_namespace") == "CONVERTER"
        and generator.get("gen_type") == "pv_inverter"
        for generator in generators
    )
    assert any(
        generator.get("catalog_namespace") == "CONVERTER" and generator.get("gen_type") == "bess"
        for generator in generators
    )
