"""Testy rozszerzeń modeli switchgear (§11A.2 + §11A.3).

Sprawdza:
- Manufacturer: nowe pola lifecycle_status, verified_at, catalog_policy_pl.
- SwitchgearFamily: nowe pola compartment_models, allowed_apparatus_kinds,
  allowed_interlocks, supported_lod_profiles, source_document_refs,
  source_version, verified_at, lifecycle_status, product_line_code,
  cad_footprint_ref.
- BayDeviceInstanceTemplate: model dla aparatów w szablonie pola.
- PortDefinitionTemplate: model dla portów.
- CompleteMvBayTemplate: rozszerzone pola template_name_pl, device_instances,
  port_definitions, interlock_rules, operation_rules, protection_requirements,
  measurement_requirements, readiness_requirements, lod_variants, cad_anchors,
  label_slots.
"""

from __future__ import annotations

from typing import get_args

from network_model.catalog.bay_templates import BAY_TEMPLATE_LINE_OUT
from network_model.catalog.switchgear import (
    ABB,
    ELEKTROMETAL,
    SIEMENS,
    ZPUE_WLOSZCZOWA,
    BayDeviceInstanceTemplate,
    CompleteMvBayTemplate,
    PortDefinitionTemplate,
    SwitchgearFamily,
)


class TestManufacturerExtendedFields:
    def test_lifecycle_status_present_for_starters(self):
        for manufacturer in (ZPUE_WLOSZCZOWA, ELEKTROMETAL, ABB, SIEMENS):
            assert manufacturer.lifecycle_status == "current"

    def test_verified_at_none_for_requires_catalog_starters(self):
        for manufacturer in (ZPUE_WLOSZCZOWA, ELEKTROMETAL, ABB, SIEMENS):
            assert manufacturer.verified_at is None

    def test_catalog_policy_pl_present_for_all_starters(self):
        for manufacturer in (ZPUE_WLOSZCZOWA, ELEKTROMETAL, ABB, SIEMENS):
            assert manufacturer.catalog_policy_pl is not None
            assert len(manufacturer.catalog_policy_pl) > 30
            # Polityka musi explicit wskazywać na oficjalne źródła.
            assert (
                "oficjaln" in manufacturer.catalog_policy_pl.lower()
                or "katalog" in manufacturer.catalog_policy_pl.lower()
            )


class TestSwitchgearFamilyExtendedFields:
    def test_extended_fields_default_empty(self):
        family = SwitchgearFamily(
            switchgear_family_ref="TEST__FAMILY",
            manufacturer_ref="TEST",
            family_name="Test",
        )
        assert family.compartment_models == []
        assert family.allowed_apparatus_kinds == []
        assert family.allowed_interlocks == []
        assert family.supported_lod_profiles == []
        assert family.source_document_refs == []
        assert family.source_version is None
        assert family.verified_at is None
        assert family.lifecycle_status == "unknown"
        assert family.product_line_code is None
        assert family.cad_footprint_ref is None

    def test_extended_fields_full_metadata(self):
        family = SwitchgearFamily(
            switchgear_family_ref="ABB__UNIGEAR_ZS1",
            manufacturer_ref="ABB",
            family_name="UniGear ZS1",
            series_name="ZS1",
            product_line_code="UNIGEAR_ZS1",
            voltage_levels=[12, 17.5, 24],
            rated_current_options=[1250, 2500, 4000],
            short_time_current_options=[25, 32, 50],
            insulation_type="air",
            construction_type="wysuwna",
            busbar_system="single",
            compartment_models=["cable_compartment", "busbar_compartment", "apparatus_compartment"],
            allowed_bay_kinds=["liniowe_doplywowe", "transformatorowe", "sprzeglowe_poprzeczne"],
            allowed_apparatus_kinds=["circuit_breaker", "switch_disconnector", "earthing_switch"],
            allowed_interlocks=["earthing_via_es_only_when_open", "racking_only_when_open"],
            supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3", "LOD4"],
            cad_footprint_ref="ABB__UNIGEAR_ZS1__FOOTPRINT_V1",
            source_document_refs=["catalog:abb_unigear_zs1_2024.pdf"],
            source_version="2024.1",
            verified_at=None,
            lifecycle_status="current",
            status="requires_catalog",
            source_refs=[],
        )
        assert family.product_line_code == "UNIGEAR_ZS1"
        assert "cable_compartment" in family.compartment_models
        assert "circuit_breaker" in family.allowed_apparatus_kinds
        assert "earthing_via_es_only_when_open" in family.allowed_interlocks
        assert "LOD3" in family.supported_lod_profiles
        assert family.cad_footprint_ref == "ABB__UNIGEAR_ZS1__FOOTPRINT_V1"


class TestBayDeviceInstanceTemplate:
    def test_default_circuit_breaker(self):
        # Scalenie kanonu 2026-08-14: para niezależnych flag
        # `is_required`/`is_optional` (dopuszczająca stan sprzeczny i
        # nieokreślony) ustąpiła JEDNEMU statusowi wyposażenia. Intencja testu
        # bez zmian: aparat niesie informację, czy jest fabryczny, czy opcją.
        device = BayDeviceInstanceTemplate(
            device_template_ref="LINE_OUT__CB__001",
            apparatus_kind="circuit_breaker",
            label="Q1",
            status_wyposazenia="FABRYCZNY",
        )
        assert device.apparatus_kind == "circuit_breaker"
        assert device.label == "Q1"
        assert device.electrical_side == "line_side"
        assert device.position_in_bay == 1
        assert device.status_wyposazenia == "FABRYCZNY"
        assert device.catalog_ref_required is True

    def test_optional_apparatus_carries_option_status(self):
        device = BayDeviceInstanceTemplate(
            device_template_ref="LINE_OUT__SA__001",
            apparatus_kind="surge_arrester",
            label="F2",
            status_wyposazenia="OPCJA",
        )
        assert device.status_wyposazenia == "OPCJA"

    def test_earthing_switch_with_anchor(self):
        device = BayDeviceInstanceTemplate(
            device_template_ref="LINE_OUT__ES__001",
            apparatus_kind="earthing_switch",
            label="Q9 (E)",
            position_in_bay=5,
            anchor_refs=["side_left", "ground"],
            electrical_side="earthing_branch",
            status_wyposazenia="FABRYCZNY",
            default_state="open",
            allowed_states=["open", "closed", "blocked", "unknown"],
        )
        assert device.apparatus_kind == "earthing_switch"
        assert device.electrical_side == "earthing_branch"
        assert "ground" in device.anchor_refs
        assert "blocked" in device.allowed_states


class TestPortDefinitionTemplate:
    def test_default_line_port(self):
        port = PortDefinitionTemplate(
            port_template_ref="LINE_OUT__PORT__LINE",
            port_kind="line_port",
        )
        assert port.port_kind == "line_port"
        assert port.occupancy_rules == "single"
        assert port.direction_hint == "output"
        assert port.visual_anchor == "bottom"
        # LOD widoczność domyślnie zaczyna się od LOD3.
        assert "LOD3" in port.lod_visibility

    def test_transformer_port_compatibility(self):
        port = PortDefinitionTemplate(
            port_template_ref="TR_BAY__PORT__TR_SN",
            port_kind="transformer_sn_port",
            voltage_level_ref="BUS_15KV_S1",
            visual_anchor="bottom",
            compatible_connection_kinds=["transformer_sn_nn"],
            occupancy_rules="single",
            direction_hint="output",
        )
        assert "transformer_sn_nn" in port.compatible_connection_kinds
        assert port.occupancy_rules == "single"

    def test_busbar_port_multi_occupancy(self):
        port = PortDefinitionTemplate(
            port_template_ref="BAY__PORT__BUSBAR",
            port_kind="busbar_port",
            occupancy_rules="multi",
        )
        assert port.occupancy_rules == "multi"


class TestCompleteMvBayTemplateExtendedFields:
    def test_extended_fields_with_devices_and_ports(self):
        cb = BayDeviceInstanceTemplate(
            device_template_ref="LINE_OUT__CB__001",
            apparatus_kind="circuit_breaker",
            label="Q1",
            position_in_bay=2,
            status_wyposazenia="FABRYCZNY",
        )
        es = BayDeviceInstanceTemplate(
            device_template_ref="LINE_OUT__ES__001",
            apparatus_kind="earthing_switch",
            label="Q9 (E)",
            position_in_bay=5,
            electrical_side="earthing_branch",
            status_wyposazenia="FABRYCZNY",
        )
        line_port = PortDefinitionTemplate(
            port_template_ref="LINE_OUT__PORT__LINE",
            port_kind="line_port",
            direction_hint="output",
        )
        busbar_port = PortDefinitionTemplate(
            port_template_ref="LINE_OUT__PORT__BUSBAR",
            port_kind="busbar_port",
            occupancy_rules="multi",
            direction_hint="input",
        )

        template = CompleteMvBayTemplate(
            template_ref="ABB__UNIGEAR_ZS1__LINE_OUT",
            base_template=BAY_TEMPLATE_LINE_OUT,
            manufacturer_ref="ABB",
            switchgear_family_ref="ABB__UNIGEAR_ZS1",
            bay_kind="liniowe_odplywowe",
            bay_role="OUT",
            source_status="requires_catalog",  # bez verified source — fallback
            template_name_pl="Pole liniowe odpływowe — ABB UniGear ZS1",
            template_code="ABB.UNIGEAR_ZS1.LINE_OUT",
            device_instances=[cb, es],
            port_definitions=[busbar_port, line_port],
            interlock_rules=[
                "earthing_via_es_only_when_open_cb",
                "racking_only_when_open_cb",
            ],
            operation_rules=["operate_only_when_no_blocker"],
            protection_requirements=["50/51", "50N/51N"],
            measurement_requirements=["CT_1", "CT_2", "CT_3"],
            readiness_requirements=["catalog_ref_required", "protection_assigned"],
            lod_variants=["LOD0", "LOD1", "LOD2", "LOD3", "LOD4"],
            cad_anchors={"top": "busbar_port", "bottom": "line_port"},
            label_slots=["q1_label", "q9_label", "ct_label"],
        )

        assert template.template_name_pl is not None
        assert template.template_code == "ABB.UNIGEAR_ZS1.LINE_OUT"
        assert len(template.device_instances) == 2
        assert len(template.port_definitions) == 2
        assert "earthing_via_es_only_when_open_cb" in template.interlock_rules
        assert "50/51" in template.protection_requirements
        assert "CT_1" in template.measurement_requirements
        assert "catalog_ref_required" in template.readiness_requirements
        assert "LOD4" in template.lod_variants
        assert template.cad_anchors["top"] == "busbar_port"
        assert "q1_label" in template.label_slots
        # source_status pozostaje requires_catalog mimo "ABB" w refs — bo brak source_refs.
        assert template.is_verified() is False


class TestSlownikAparatow:
    """Słownik aparatów — jedna tożsamość aparatu, zgrubienie jako projekcja.

    Do scalenia kanonu 2026-08-14 istniały DWIE ręcznie utrzymywane tablice o
    tej samej treści; teraz słownik rodzin jest WYPROWADZANY z tożsamości
    aparatu. Testy pilnują obu stron tego wyprowadzenia.
    """

    def test_kazdy_rodzaj_aparatu_szablonu_ma_tozsamosc(self):
        from network_model.catalog.bay_templates import BayDeviceTemplate
        from network_model.catalog.switchgear.apparatus_vocabulary import (
            APPARATUS_KIND_FOR_TEMPLATE_KIND,
        )

        kindy_szablonu = set(get_args(BayDeviceTemplate.model_fields["kind"].annotation))
        assert set(APPARATUS_KIND_FOR_TEMPLATE_KIND) == kindy_szablonu

    def test_tozsamosci_aparatow_naleza_do_kanonu_apparatus_kind(self):
        from network_model.catalog.switchgear.apparatus_vocabulary import (
            APPARATUS_KIND_FOR_TEMPLATE_KIND,
        )
        from network_model.catalog.switchgear.device_instance import ApparatusKind

        kanon = set(get_args(ApparatusKind))
        assert set(APPARATUS_KIND_FOR_TEMPLATE_KIND.values()) <= kanon

    def test_slownik_rodziny_jest_zgrubieniem_tozsamosci_bez_zmiany_tresci(self):
        """Pin regresyjny: wyprowadzony słownik rodzin MUSI być dokładnie tym,
        co utrzymywano wcześniej ręcznie (odłącznik szynowy i liniowy zlewają
        się w `switch_disconnector`, transformator pola leży poza celką)."""
        from network_model.catalog.switchgear.apparatus_vocabulary import (
            FAMILY_APPARATUS_FOR_TEMPLATE_KIND,
        )

        assert FAMILY_APPARATUS_FOR_TEMPLATE_KIND == {
            "CB": "circuit_breaker",
            "DS_BUS": "switch_disconnector",
            "DS_LINE": "switch_disconnector",
            "ES": "earthing_switch",
            "FUSE": "fuse_set",
            "CT": "current_transformer",
            "VT": "voltage_transformer",
            "CABLE_HEAD": "cable_head",
            "SURGE_ARRESTER": "surge_arrester",
        }

    def test_transformator_pola_lezy_poza_slownikiem_rodziny(self):
        from network_model.catalog.switchgear.apparatus_vocabulary import (
            APPARATUS_KIND_FOR_TEMPLATE_KIND,
            FAMILY_APPARATUS_FOR_TEMPLATE_KIND,
        )

        assert APPARATUS_KIND_FOR_TEMPLATE_KIND["TRANSFORMER_DEVICE"] == "transformer"
        assert "TRANSFORMER_DEVICE" not in FAMILY_APPARATUS_FOR_TEMPLATE_KIND

    def test_materializacja_wyposazenia_odwzorowuje_kanon(self):
        from network_model.catalog.switchgear.apparatus_vocabulary import (
            instancje_aparatow_z_szablonu,
        )

        instancje = instancje_aparatow_z_szablonu(BAY_TEMPLATE_LINE_OUT, "TEST__LINE_OUT")
        assert len(instancje) == len(BAY_TEMPLATE_LINE_OUT.devices)
        pierwszy = instancje[0]
        assert pierwszy.apparatus_kind == "disconnector_busbar"
        assert pierwszy.label == "Q1"
        assert pierwszy.position_in_bay == 1  # pozycje 1-based
        assert pierwszy.electrical_side == "busbar_side"
        assert pierwszy.status_wyposazenia == "FABRYCZNY"
        uziemnik = next(i for i in instancje if i.apparatus_kind == "earthing_switch")
        assert uziemnik.electrical_side == "earthing_branch"
        assert len({i.device_template_ref for i in instancje}) == len(instancje)
