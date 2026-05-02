from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"


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

    source = snapshot["sources"][0]
    substation = snapshot["substations"][0]
    sections = substation["gpz_sections"]

    assert source["substation_ref"] == substation["ref_id"]
    assert len(sections) == 2
    assert len(substation["bus_refs"]) == 2
    assert substation["meta"]["gpz_section_count"] == 2
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
            assert field["bay_role"] == "FEEDER"
            assert field["bus_ref"] == section["bus_ref"]
            assert field["tags"] == ["gpz_line_field"]
            assert field["meta"]["source_field_kind"] == "FEEDER"
            assert field["meta"]["field_status"] == "READY_FOR_TRUNK"
            assert field["meta"]["gpz_line_field_index"] == field_index
            assert field["meta"]["gpz_line_fields_count"] == 12
