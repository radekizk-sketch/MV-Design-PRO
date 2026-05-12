"""Testy warstwy producentów rozdzielnic SN (goal §11A).

Kluczowy invariant: wszyscy 4 startowi producenci są `requires_catalog` —
NIE wolno fabrykować zweryfikowanych danych katalogowych.
"""

from __future__ import annotations

import pytest
from network_model.catalog.bay_templates import BAY_TEMPLATE_LINE_OUT
from network_model.catalog.switchgear import (
    ABB,
    ELEKTROMETAL,
    MANUFACTURER_REGISTRY,
    SIEMENS,
    ZPUE_WLOSZCZOWA,
    CompleteMvBayTemplate,
    Manufacturer,
    SwitchgearFamily,
    get_manufacturer,
    list_manufacturers,
    manufacturers_requiring_catalog,
    verified_manufacturers,
)


class TestManufacturerRegistry:
    def test_registry_has_four_starting_manufacturers(self):
        assert len(MANUFACTURER_REGISTRY) == 4
        refs = set(MANUFACTURER_REGISTRY.keys())
        assert refs == {"ZPUE_WLOSZCZOWA", "ELEKTROMETAL", "ABB", "SIEMENS"}

    def test_all_starters_require_catalog(self):
        """NIE fabrykuj — wszyscy producenci na start mają status requires_catalog."""
        for manufacturer in (ZPUE_WLOSZCZOWA, ELEKTROMETAL, ABB, SIEMENS):
            assert manufacturer.status == "requires_catalog"
            assert manufacturer.source_refs == []
            assert manufacturer.is_verified() is False
            assert manufacturer.is_blocked_for_use() is True

    def test_polish_notes_present_for_all(self):
        for manufacturer in list_manufacturers():
            assert manufacturer.notes_pl is not None
            assert len(manufacturer.notes_pl) > 0

    def test_list_manufacturers_deterministic(self):
        first = [m.manufacturer_ref for m in list_manufacturers()]
        for _ in range(10):
            assert [m.manufacturer_ref for m in list_manufacturers()] == first
        assert first == sorted(first)

    def test_get_manufacturer_returns_correct(self):
        assert get_manufacturer("ZPUE_WLOSZCZOWA").name == "ZPUE S.A. (Włoszczowa)"
        assert get_manufacturer("ABB").country == "CH"
        assert get_manufacturer("SIEMENS").country == "DE"
        assert get_manufacturer("ELEKTROMETAL").country == "PL"

    def test_get_manufacturer_unknown_raises(self):
        with pytest.raises(KeyError):
            get_manufacturer("NIEZNANY_PRODUCENT")

    def test_manufacturers_requiring_catalog_lists_all_starters(self):
        requiring = manufacturers_requiring_catalog()
        assert len(requiring) == 4

    def test_verified_manufacturers_empty_on_start(self):
        assert verified_manufacturers() == []

    def test_user_defined_manufacturer_is_not_verified(self):
        custom = Manufacturer(
            manufacturer_ref="CUSTOM_CO",
            name="Custom & Co.",
            normalized_code="CUSTOM",
            status="user_defined",
            source_refs=["doc:internal_2026_04"],
        )
        # `user_defined` ze źródłem nie jest formalnie verified (verified =
        # tylko oficjalny katalog producenta).
        assert custom.is_verified() is False
        assert custom.is_blocked_for_use() is False

    def test_verified_requires_both_status_and_source_refs(self):
        without_sources = Manufacturer(
            manufacturer_ref="VENDOR_X",
            name="Vendor X",
            normalized_code="VX",
            status="verified",
            source_refs=[],
        )
        assert without_sources.is_verified() is False

        with_sources = Manufacturer(
            manufacturer_ref="VENDOR_Y",
            name="Vendor Y",
            normalized_code="VY",
            status="verified",
            source_refs=["catalog:VY_2026.pdf"],
        )
        assert with_sources.is_verified() is True


class TestSwitchgearFamily:
    def test_default_status_requires_catalog(self):
        family = SwitchgearFamily(
            switchgear_family_ref="ZPUE_WLOSZCZOWA__SAMPLE",
            manufacturer_ref="ZPUE_WLOSZCZOWA",
            family_name="Sample",
        )
        assert family.status == "requires_catalog"
        assert family.source_refs == []
        assert family.insulation_type == "unknown"
        assert family.construction_type == "unknown"
        assert family.busbar_system == "unknown"

    def test_family_with_full_metadata(self):
        family = SwitchgearFamily(
            switchgear_family_ref="DEMO__FAMILY",
            manufacturer_ref="DEMO",
            family_name="Demo Family",
            series_name="D1",
            voltage_levels=[15.0, 20.0],
            rated_current_options=[630, 1250],
            short_time_current_options=[20, 25],
            insulation_type="sf6",
            construction_type="RMU",
            busbar_system="single",
            allowed_bay_kinds=["liniowe_doplywowe", "transformatorowe"],
            status="user_defined",
            source_refs=["doc:internal_demo"],
        )
        assert family.insulation_type == "sf6"
        assert family.construction_type == "RMU"
        assert "liniowe_doplywowe" in family.allowed_bay_kinds


class TestCompleteMvBayTemplate:
    def test_composition_keeps_base_template(self):
        complete = CompleteMvBayTemplate(
            template_ref="ZPUE__BAY_LINE_OUT_DEMO",
            base_template=BAY_TEMPLATE_LINE_OUT,
            manufacturer_ref="ZPUE_WLOSZCZOWA",
            switchgear_family_ref=None,
            bay_kind="liniowe_odplywowe",
            bay_role="OUT",
        )
        # Kompozycja: base_template zachowuje pełen kanon BayTemplate.
        assert complete.base_template.template_id == BAY_TEMPLATE_LINE_OUT.template_id
        assert complete.base_template.bay_role == "OUT"
        assert len(complete.base_template.devices) == len(BAY_TEMPLATE_LINE_OUT.devices)

    def test_default_status_requires_catalog(self):
        complete = CompleteMvBayTemplate(
            template_ref="ANY_REF",
            base_template=BAY_TEMPLATE_LINE_OUT,
        )
        assert complete.source_status == "requires_catalog"
        assert complete.is_verified() is False

    def test_canonical_fallback_status_supported(self):
        complete = CompleteMvBayTemplate(
            template_ref="CANONICAL_FALLBACK_LINE_OUT",
            base_template=BAY_TEMPLATE_LINE_OUT,
            source_status="canonical_fallback",
        )
        assert complete.source_status == "canonical_fallback"
        # Canonical fallback nie jest "oficjalnym katalogiem producenta" —
        # is_verified zwraca False.
        assert complete.is_verified() is False

    def test_verified_requires_source_refs(self):
        without = CompleteMvBayTemplate(
            template_ref="X",
            base_template=BAY_TEMPLATE_LINE_OUT,
            source_status="official_catalog",
            source_refs=[],
        )
        assert without.is_verified() is False

        with_sources = CompleteMvBayTemplate(
            template_ref="Y",
            base_template=BAY_TEMPLATE_LINE_OUT,
            source_status="official_catalog",
            source_refs=["catalog:ZPUE_2026_v1.pdf"],
        )
        assert with_sources.is_verified() is True

    def test_compute_hash_deterministic(self):
        a = CompleteMvBayTemplate(
            template_ref="X",
            base_template=BAY_TEMPLATE_LINE_OUT,
            manufacturer_ref="ZPUE_WLOSZCZOWA",
            bay_kind="liniowe_odplywowe",
            bay_role="OUT",
        )
        b = CompleteMvBayTemplate(
            template_ref="X",
            base_template=BAY_TEMPLATE_LINE_OUT,
            manufacturer_ref="ZPUE_WLOSZCZOWA",
            bay_kind="liniowe_odplywowe",
            bay_role="OUT",
        )
        assert a.compute_hash() == b.compute_hash()
        assert len(a.compute_hash()) == 64

    def test_compute_hash_differs_for_different_manufacturer(self):
        a = CompleteMvBayTemplate(
            template_ref="X",
            base_template=BAY_TEMPLATE_LINE_OUT,
            manufacturer_ref="ZPUE_WLOSZCZOWA",
        )
        b = CompleteMvBayTemplate(
            template_ref="X",
            base_template=BAY_TEMPLATE_LINE_OUT,
            manufacturer_ref="ABB",
        )
        assert a.compute_hash() != b.compute_hash()

    def test_compute_hash_invariant_to_source_refs(self):
        """source_refs zmienia się niezależnie (nie powinno invalidować wyników)."""
        a = CompleteMvBayTemplate(
            template_ref="X",
            base_template=BAY_TEMPLATE_LINE_OUT,
            source_refs=[],
        )
        b = CompleteMvBayTemplate(
            template_ref="X",
            base_template=BAY_TEMPLATE_LINE_OUT,
            source_refs=["catalog:test"],
        )
        assert a.compute_hash() == b.compute_hash()
