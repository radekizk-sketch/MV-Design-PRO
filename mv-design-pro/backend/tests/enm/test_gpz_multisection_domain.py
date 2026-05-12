from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"
CATALOG_APARAT_SN = "sw-cb-abb-vd4-24kv-630a"


def _empty_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="test_gpz_multisection", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def test_add_grid_source_sn_persists_multisection_gpz_contract():
    result = execute_domain_operation(
        enm_dict=_empty_enm(),
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ Konarzewo",
            "voltage_kv": 15.0,
            "catalog_ref": CATALOG_ZRODLO_SN,
            "sections_count": 2,
            "gpz_sections": [
                {"order": 0, "name": "Sekcja A", "line_field_name": "Pole liniowe A"},
                {"order": 1, "name": "Sekcja B", "line_field_name": "Pole liniowe B"},
            ],
            "grounding": {"type": "resistor_grounded", "r_ohm": 12.0},
            "zero_sequence": {"enabled": True, "r0_ohm": 0.4, "x0_ohm": 1.8, "z0_z1_ratio": 1.3},
        },
    )

    assert result.get("error") in (None, "")
    snapshot = result.get("snapshot")
    assert snapshot is not None

    assert len(snapshot["sources"]) == 1
    assert len(snapshot["substations"]) == 1
    assert snapshot["bays"] == []
    assert len(snapshot["transformers"]) == 2

    source = snapshot["sources"][0]
    substation = snapshot["substations"][0]
    sections = substation["gpz_sections"]

    assert source["substation_ref"] == substation["ref_id"]
    assert len(sections) == 2
    assert len(substation["bus_refs"]) == 2
    assert len(substation["transformer_refs"]) == 2
    assert substation["meta"]["gpz_section_count"] == 2
    assert substation["meta"]["wn_sn_transformer_count"] == 2
    assert substation["meta"]["grounding"]["type"] == "resistor_grounded"
    assert substation["meta"]["zero_sequence"]["enabled"] is True
    assert substation["meta"]["short_circuit_mode"] == "SHORT_CIRCUIT_POWER"

    assert sections[0]["name"] == "Sekcja A"
    assert sections[1]["name"] == "Sekcja B"
    assert sections[0]["incoming_source_ref"] == source["ref_id"]
    assert sections[1]["incoming_source_ref"] is None
    assert sections[0]["right_coupler_ref"] is not None
    assert sections[1]["left_coupler_ref"] == sections[0]["right_coupler_ref"]

    assert source["bus_ref"] == sections[0]["bus_ref"]
    assert source["gpz_section_id"] == sections[0]["section_id"]
    assert source["model"] == "short_circuit_power"
    assert source["r0_ohm"] == 0.4
    assert source["x0_ohm"] == 1.8
    assert source["z0_z1_ratio"] == 1.3

    transformers = {transformer["ref_id"]: transformer for transformer in snapshot["transformers"]}
    for index, transformer_ref in enumerate(substation["transformer_refs"]):
        transformer = transformers[transformer_ref]
        assert transformer["name"].startswith(f"TR{index + 1} 110/15")
        assert transformer["uhv_kv"] == 110.0
        assert transformer["ulv_kv"] == 15.0
        assert transformer["sn_mva"] == 25.0
        assert transformer["uk_percent"] == 11.0
        assert transformer["vector_group"] == "Yd11"
        assert transformer["catalog_ref"] == "tr-wn-sn-110-15-25mva-yd11"
        assert transformer["source_mode"] == "KATALOG"
        assert transformer["materialized_params"]["catalog_item_id"] == (
            "tr-wn-sn-110-15-25mva-yd11"
        )
        assert transformer["lv_bus_ref"] == sections[index]["bus_ref"]
        assert transformer["meta"]["gpz_section_id"] == sections[index]["section_id"]
        assert transformer["meta"]["catalog_role"] == "TRANSFORMATOR_WN_SN"

    buses = {bus["ref_id"]: bus for bus in snapshot["buses"]}
    assert buses[sections[0]["bus_ref"]]["grounding"]["type"] == "resistor_grounded"
    assert buses[sections[1]["bus_ref"]]["grounding"]["type"] == "resistor_grounded"

    field_specs = substation["meta"]["field_specs"]
    field_by_section = {field["gpz_section_id"]: field for field in field_specs}
    assert field_by_section[sections[0]["section_id"]]["name"] == "Pole liniowe A"
    assert field_by_section[sections[1]["section_id"]]["name"] == "Pole liniowe B"
    assert sections[0]["line_fields_count"] == 1
    assert sections[0]["line_field_refs"] == [field_by_section[sections[0]["section_id"]]["field_ref"]]
    assert sections[1]["line_fields_count"] == 1
    assert sections[1]["line_field_refs"] == [field_by_section[sections[1]["section_id"]]["field_ref"]]

    couplers = [branch for branch in snapshot["branches"] if branch.get("type") == "bus_coupler"]
    assert len(couplers) == 1
    assert couplers[0]["ref_id"] == sections[0]["right_coupler_ref"]
    assert couplers[0]["from_bus_ref"] == sections[0]["bus_ref"]
    assert couplers[0]["to_bus_ref"] == sections[1]["bus_ref"]


def test_add_grid_source_sn_creates_real_line_fields_for_each_gpz_section():
    result = execute_domain_operation(
        enm_dict=_empty_enm(),
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ Wielopolowy",
            "voltage_kv": 15.0,
            "catalog_ref": CATALOG_ZRODLO_SN,
            "sections_count": 2,
            "line_fields_per_section": 12,
            "gpz_sections": [
                {"order": 0, "name": "Sekcja 1", "line_field_name": "Pole sekcji 1"},
                {"order": 1, "name": "Sekcja 2", "line_field_name": "Pole sekcji 2"},
            ],
            "grounding": {"type": "resistor_grounded", "r_ohm": 12.0},
            "zero_sequence": {"enabled": True, "z0_z1_ratio": 3.2},
            "gpz_line_field_apparatus": {
                "apparatus_kind": "BREAKER",
                "catalog_binding": {
                    "catalog_namespace": "APARAT_SN",
                    "catalog_item_id": CATALOG_APARAT_SN,
                    "catalog_item_version": "2024.1",
                },
            },
        },
    )

    assert result.get("error") in (None, "")
    snapshot = result["snapshot"]
    substation = snapshot["substations"][0]
    sections = substation["gpz_sections"]
    field_specs = substation["meta"]["field_specs"]

    assert len(sections) == 2
    assert len(field_specs) == 24
    assert len({field["field_ref"] for field in field_specs}) == 24

    for section_index, section in enumerate(sections):
        section_fields = [
            field for field in field_specs if field["gpz_section_id"] == section["section_id"]
        ]
        assert section["line_fields_count"] == 12
        assert len(section["line_field_names"]) == 12
        assert len(section["line_field_refs"]) == 12
        assert [field["field_ref"] for field in section_fields] == section["line_field_refs"]
        assert [field["name"] for field in section_fields] == section["line_field_names"]
        assert section_fields[0]["name"] == f"Pole sekcji {section_index + 1} 1"
        assert section_fields[-1]["name"] == f"Pole sekcji {section_index + 1} 12"

        for field_index, field in enumerate(section_fields):
            assert field["bay_role"] == "OUT"
            assert field["bus_ref"] == section["bus_ref"]
            assert field["tags"] == ["gpz_line_field"]
            assert len(field["equipment_refs"]) == 1
            assert field["meta"]["apparatus_kind"] == "BREAKER"
            assert field["meta"]["catalog_binding"]["catalog_item_id"] == CATALOG_APARAT_SN
            assert field["meta"]["source_field_kind"] == "FEEDER"
            assert field["meta"]["field_status"] == "CONFIGURED_FOR_TRUNK"
            assert field["meta"]["gpz_line_field_index"] == field_index
            assert field["meta"]["gpz_line_fields_count"] == 12


def test_add_sn_bay_updates_existing_gpz_field_instead_of_appending_new_field():
    created = execute_domain_operation(
        enm_dict=_empty_enm(),
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ Edycja",
            "voltage_kv": 15.0,
            "catalog_ref": CATALOG_ZRODLO_SN,
            "sections_count": 1,
            "gpz_sections": [{"order": 0, "name": "Sekcja 1", "line_field_name": "Pole 1"}],
            "grounding": {"type": "resistor_grounded", "r_ohm": 12.0},
            "zero_sequence": {"enabled": True, "z0_z1_ratio": 3.2},
        },
    )
    snapshot = created["snapshot"]
    substation = snapshot["substations"][0]
    field_ref = substation["meta"]["field_specs"][0]["field_ref"]
    bus_ref = substation["meta"]["field_specs"][0]["bus_ref"]

    result = execute_domain_operation(
        enm_dict=snapshot,
        op_name="add_sn_bay",
        payload={
            "existing_field_ref": field_ref,
            "station_ref": substation["ref_id"],
            "bus_ref": bus_ref,
            "bay_role": "OUT",
            "field_name": "Pole odpływowe 1",
            "apparatus_kind": "BREAKER",
            "catalog_binding": {
                "catalog_namespace": "APARAT_SN",
                "catalog_item_id": CATALOG_APARAT_SN,
                "catalog_item_version": "2024.1",
            },
        },
    )

    assert result.get("error") in (None, "")
    updated = result["snapshot"]
    fields = updated["substations"][0]["meta"]["field_specs"]
    assert len(fields) == 1
    assert fields[0]["field_ref"] == field_ref
    assert fields[0]["name"] == "Pole odpływowe 1"
    assert fields[0]["bay_role"] == "OUT"
    assert len(fields[0]["equipment_refs"]) == 1
    assert fields[0]["meta"]["field_status"] == "CONFIGURED_FOR_TRUNK"
    assert len(updated["branches"]) == 1
    assert updated["branches"][0]["meta"]["field_ref"] == field_ref
