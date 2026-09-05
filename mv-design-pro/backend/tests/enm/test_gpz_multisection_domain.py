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
    assert len(substation["bus_refs"]) == 4
    assert len(substation["transformer_refs"]) == 2
    assert substation["meta"]["gpz_section_count"] == 2
    assert substation["meta"]["wn_sn_transformer_count"] == 2
    assert len(substation["meta"]["gpz_hv_bus_refs"]) == 2
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
    assert sections[0]["line_field_refs"] == [
        field_by_section[sections[0]["section_id"]]["field_ref"]
    ]
    assert sections[1]["line_fields_count"] == 1
    assert sections[1]["line_field_refs"] == [
        field_by_section[sections[1]["section_id"]]["field_ref"]
    ]

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


def test_add_grid_source_sn_manual_hv_short_circuit_anchors_source_on_110kv_bus():
    result = execute_domain_operation(
        enm_dict=_empty_enm(),
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ WN/SN",
            "voltage_kv": 15.0,
            "hv_voltage_kv": 110.0,
            "sections_count": 2,
            "transformer_count": 2,
            "gpz_sections": [
                {"order": 0, "name": "Sekcja 1", "line_field_name": "Pole 1"},
                {"order": 1, "name": "Sekcja 2", "line_field_name": "Pole 2"},
            ],
            "manual_equivalent": {
                "sn_voltage_kv": 15.0,
                "hv_voltage_kv": 110.0,
                "short_circuit_input_side": "HV_110",
                "short_circuit_mode": "SHORT_CIRCUIT_POWER",
                "sk3_hv_mva": 3000.0,
                "rx_ratio": 0.12,
            },
            "grounding": {"type": "resistor_grounded", "r_ohm": 12.0},
            "zero_sequence": {"enabled": True, "z0_z1_ratio": 3.2},
        },
    )

    assert result.get("error") in (None, "")
    snapshot = result["snapshot"]
    source = snapshot["sources"][0]
    substation = snapshot["substations"][0]

    hv_bus_refs = substation["meta"]["gpz_hv_bus_refs"]
    assert source["bus_ref"] == hv_bus_refs[0]
    assert source["gpz_section_id"] is None
    assert source["source_side"] == "HV_110"
    assert source["voltage_hv_kv"] == 110.0
    assert source["sk3_hv_mva"] == 3000.0
    assert source["materialized_params"]["short_circuit_input_side"] == "HV_110"
    assert substation["entry_point_ref"] == hv_bus_refs[0]


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


def test_add_grid_source_sn_wiaze_rodzine_szablon_i_zabezpieczenie_pola():
    """Globalna integracja: rodzina rozdzielnicy + szablon pola + zabezpieczenie
    spływają na field_specs (widok pola / SLD / ocena zgodności / E-27).

    INTENCJA (zachowana): sprawdzić WIĄZANIE rodzina ↔ szablon pola ↔
    zabezpieczenie na polach GPZ — nie konkretną markę rozdzielnicy.

    KOREKTA DANYCH REFERENCYJNYCH: test budował pola GPZ na rodzinie SafeRing,
    czyli na rozdzielnicy PIERŚCIENIOWEJ (RMU) składanej z bloków fabrycznych.
    Jako rozdzielnica GPZ (110/SN, punkt zasilania) jest to błąd inżynierski:
    GPZ używa wyłącznie rodzin o torze MODULARNYM (rozdzielnice pierwotne).
    Rodziny blokowe mają własny kanał — `add_sn_bay_from_catalog` z
    `factory_configuration_ref` — i kanał pól GPZ odrzuca je twardym błędem
    (patrz `test_pola_v1_przez_resolver.py`). Dane poprawiono na ZPUE RELF
    (tor MODULARNY), zachowując wszystkie sprawdzane wiązania.
    """
    result = execute_domain_operation(
        enm_dict=_empty_enm(),
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ Referencyjny",
            "voltage_kv": 15.0,
            "catalog_ref": CATALOG_ZRODLO_SN,
            "sections_count": 1,
            "switchgear_family_ref": "ZPUE_WLOSZCZOWA__RELF",
            "manufacturer_ref": "ZPUE_WLOSZCZOWA",
            "gpz_sections": [
                {
                    "order": 0,
                    "name": "Sekcja A",
                    "bays": [
                        {
                            "name": "Pole odpływowe 1",
                            "bay_role": "LINIA_ODG",
                            "bay_template_ref": "ZPUE_WLOSZCZOWA__RELF__LINE_OUT",
                            "protection_ref": "prot/pole/1",
                        },
                        {
                            "name": "Pole odpływowe 2",
                            "bay_role": "LINIA_ODG",
                            "bay_template_ref": "ZPUE_WLOSZCZOWA__RELF__LINE_OUT",
                        },
                    ],
                },
            ],
            "grounding": {"type": "resistor_grounded", "r_ohm": 12.0},
        },
    )

    assert result.get("error") in (None, "")
    snapshot = result["snapshot"]
    substation = snapshot["substations"][0]
    # Rodzina/producent na stacji.
    assert substation["meta"]["switchgear_family_ref"] == "ZPUE_WLOSZCZOWA__RELF"
    assert substation["meta"]["manufacturer_ref"] == "ZPUE_WLOSZCZOWA"

    specs = substation["meta"]["field_specs"]
    assert len(specs) == 2  # bays[] wyznacza liczbę pól
    first, second = specs
    # Szablon producenta + rodzina jako klucze TOP-LEVEL field_spec (konwencja
    # kreatora stacji) — spójne źródło dla read-modelu pola i projekcji do Bay.
    assert first["bay_template_ref"] == "ZPUE_WLOSZCZOWA__RELF__LINE_OUT"
    assert first["switchgear_family_ref"] == "ZPUE_WLOSZCZOWA__RELF"
    assert first["manufacturer_ref"] == "ZPUE_WLOSZCZOWA"
    assert first["bay_role"] == "LINIA_ODG"
    # Powiązanie z zabezpieczeniem polowym.
    assert first["protection_ref"] == "prot/pole/1"
    # Domknięcie długu V1: pole z rodziny katalogowej NIESIE wyposażenie z BOM-u
    # katalogowego pola (przedtem referencja producencka dawała pustą listę).
    assert len(first["primary_devices"]) == 6
    assert all(aparat["catalog_ref"] for aparat in first["primary_devices"])
    assert second["protection_ref"] is None


def test_add_grid_source_sn_bez_rodziny_zachowuje_dotychczasowy_kontrakt():
    """Kompatybilność wsteczna: bez rodziny/szablonu field_specs nie niosą kluczy
    producenckich (exclude_none — determinizm istniejących payloadów zachowany)."""
    result = execute_domain_operation(
        enm_dict=_empty_enm(),
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ Klasyczny",
            "voltage_kv": 15.0,
            "catalog_ref": CATALOG_ZRODLO_SN,
            "sections_count": 1,
            "gpz_sections": [{"order": 0, "name": "Sekcja A", "line_fields_count": 1}],
            "grounding": {"type": "resistor_grounded", "r_ohm": 12.0},
        },
    )
    assert result.get("error") in (None, "")
    substation = result["snapshot"]["substations"][0]
    assert "switchgear_family_ref" not in substation["meta"]
    spec = substation["meta"]["field_specs"][0]
    assert "bay_template_ref" not in spec
    assert "switchgear_family_ref" not in spec


def test_add_grid_source_sn_bez_oltc_nie_niesie_tap_changer():
    """Bez żądania regulacji transformatory GPZ nie mają tap_changer (kompat.)."""
    result = execute_domain_operation(
        enm_dict=_empty_enm(),
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ Bez OLTC",
            "voltage_kv": 15.0,
            "catalog_ref": CATALOG_ZRODLO_SN,
            "sections_count": 1,
            "gpz_sections": [{"order": 0, "name": "Sekcja A", "line_fields_count": 1}],
            "grounding": {"type": "resistor_grounded", "r_ohm": 12.0},
        },
    )
    assert result.get("error") in (None, "")
    trafo = result["snapshot"]["transformers"][0]
    assert trafo.get("tap_changer") in (None, {}) or "tap_changer" not in trafo


def test_add_grid_source_sn_materializuje_oltc_na_kazdym_transformatorze():
    """OLTC z kreatora GPZ → kanoniczny tap_changer per transformator, regulujący
    własną szynę SN, mapowany na model domenowy i widoczny dla pętli OLTC."""
    result = execute_domain_operation(
        enm_dict=_empty_enm(),
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ z OLTC",
            "voltage_kv": 15.0,
            "catalog_ref": CATALOG_ZRODLO_SN,
            "sections_count": 2,
            "gpz_sections": [
                {"order": 0, "name": "Sekcja A", "line_fields_count": 1},
                {"order": 1, "name": "Sekcja B", "line_fields_count": 1},
            ],
            "grounding": {"type": "resistor_grounded", "r_ohm": 12.0},
            "transformer_count": 2,
            # OLTC z katalogu + jawne nastawy (zero fabrykacji — każde pole realne).
            "transformer_regulation_type": "OLTC",
            "transformer_tap_changer_catalog_ref": "tc_oltc_110sn_19_125",
            "transformer_control_mode": "AUTOMATIC",
            "transformer_voltage_setpoint_kv": 15.3,
            "transformer_deadband_kv": 0.2,
            "transformer_delay_seconds": 30.0,
            "transformer_ldc_enabled": True,
            "transformer_ldc_r_ohm": 0.5,
            "transformer_ldc_x_ohm": 1.2,
        },
    )
    assert result.get("error") in (None, "")
    snapshot = result["snapshot"]
    transformers = snapshot["transformers"]
    assert len(transformers) == 2

    sections = snapshot["substations"][0]["gpz_sections"]
    section_bus_by_id = {s["section_id"]: s["bus_ref"] for s in sections}

    for trafo in transformers:
        tc = trafo["tap_changer"]
        assert tc["regulation_type"] == "OLTC"
        assert tc["regulated_winding"] == "HV"
        assert tc["control_mode"] == "AUTOMATIC"
        assert tc["min_position"] == -9
        assert tc["max_position"] == 9
        assert tc["step_percent"] == 1.25
        assert tc["voltage_setpoint_kv"] == 15.3
        assert tc["deadband_kv"] == 0.2
        assert tc["delay_seconds"] == 30.0
        assert tc["line_drop_compensation"]["enabled"] is True
        assert tc["catalog_ref"] == "tc_oltc_110sn_19_125"
        # Each transformer regulates its own SN busbar (section LV bus).
        assert tc["controlled_bus_ref"] == section_bus_by_id[trafo["meta"]["gpz_section_id"]]

    # Flows end-to-end: ENM -> domain graph -> canonical TapChanger visible.
    from enm.mapping import map_enm_to_network_graph
    from enm.models import EnergyNetworkModel
    from network_model.core.branch import TransformerBranch

    graph = map_enm_to_network_graph(EnergyNetworkModel.model_validate(snapshot))
    regs = [
        b
        for b in graph.branches.values()
        if isinstance(b, TransformerBranch) and b.tap_changer is not None
    ]
    assert len(regs) == 2
    for reg in regs:
        assert reg.tap_changer.is_automatic()
        assert reg.tap_changer.controlled_bus_id is not None


def test_add_grid_source_sn_ldc_bez_r_x_zostaje_nieskonfigurowane():
    """Karta FAB-D1 (D4): transformer_ldc_enabled=True BEZ jawnych r_ohm/x_ohm nie
    fabrykuje 0 Ω (impedancja kompensacji udająca pomiar) — blok LDC zostaje
    NIESKONFIGUROWANY (nieobecny), zamiast zapisać zerową impedancję."""
    result = execute_domain_operation(
        enm_dict=_empty_enm(),
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ z OLTC bez LDC",
            "voltage_kv": 15.0,
            "catalog_ref": CATALOG_ZRODLO_SN,
            "transformer_regulation_type": "OLTC",
            "transformer_tap_changer_catalog_ref": "tc_oltc_110sn_19_125",
            "transformer_ldc_enabled": True,
            # transformer_ldc_r_ohm / transformer_ldc_x_ohm CELOWO pominięte.
        },
    )
    assert result.get("error") in (None, "")
    trafo = result["snapshot"]["transformers"][0]
    tc = trafo["tap_changer"]
    assert tc.get("line_drop_compensation") in (None, {})
