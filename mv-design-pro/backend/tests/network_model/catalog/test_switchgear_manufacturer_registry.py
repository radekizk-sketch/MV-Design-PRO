"""Testy warstwy producentów rozdzielnic SN (goal §11A).

Kluczowy invariant: wszyscy 4 startowi producenci są `requires_catalog` —
NIE wolno fabrykować zweryfikowanych danych katalogowych.
"""

from __future__ import annotations

import pytest
from network_model.catalog.bay_templates import BAY_TEMPLATE_LINE_OUT
from network_model.catalog.switchgear import (
    ABB,
    CANONICAL_FALLBACK_REGISTRY,
    ELEKTROMETAL,
    MANUFACTURER_REGISTRY,
    SIEMENS,
    ZPUE_WLOSZCZOWA,
    CompleteMvBayTemplate,
    Manufacturer,
    SwitchgearFamily,
    get_canonical_fallback_for_bay_kind,
    get_manufacturer,
    list_canonical_fallback_for_manufacturer,
    list_canonical_fallback_templates,
    list_manufacturers,
    manufacturers_requiring_catalog,
    verified_manufacturers,
)


class TestManufacturerRegistry:
    def test_registry_has_five_starting_manufacturers(self):
        # 5. producent SCHNEIDER_ELECTRIC dodany w programie Reference Engine
        # V1 (rodzina SM6-24). Intencja testu bez zmian: rejestr zawiera
        # DOKŁADNIE znanych producentów.
        assert len(MANUFACTURER_REGISTRY) == 5
        refs = set(MANUFACTURER_REGISTRY.keys())
        assert refs == {
            "ZPUE_WLOSZCZOWA",
            "ELEKTROMETAL",
            "ABB",
            "SIEMENS",
            "SCHNEIDER_ELECTRIC",
        }

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
        # 5 producentów (Reference Engine V1) — wszyscy requires_catalog
        # do czasu zatwierdzenia oficjalnych kart PDF.
        requiring = manufacturers_requiring_catalog()
        assert len(requiring) == 5

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
            network_voltages_kv=[15.0, 20.0],
            um_classes_kv=[17.5, 24.0],
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


class TestCanonicalFallbackRegistry:
    """Rejestr 10 kanonicznych fallbacków — szablony producent-niezależne."""

    def test_registry_has_ten_canonical_templates(self):
        assert len(CANONICAL_FALLBACK_REGISTRY) == 10

    def test_all_have_canonical_fallback_status(self):
        for template in CANONICAL_FALLBACK_REGISTRY.values():
            assert template.source_status == "canonical_fallback"
            assert template.manufacturer_ref is None
            assert template.switchgear_family_ref is None
            assert template.source_refs == []
            assert template.is_verified() is False

    def test_all_have_unique_template_refs(self):
        refs = [t.template_ref for t in CANONICAL_FALLBACK_REGISTRY.values()]
        assert len(set(refs)) == len(refs)

    def test_all_have_computed_hash(self):
        for template in CANONICAL_FALLBACK_REGISTRY.values():
            assert len(template.hash) == 64  # sha256

    def test_list_canonical_fallback_templates_deterministic(self):
        first = [t.template_ref for t in list_canonical_fallback_templates()]
        assert first == sorted(first)
        for _ in range(10):
            assert [t.template_ref for t in list_canonical_fallback_templates()] == first

    def test_bay_kinds_cover_main_categories(self):
        kinds = {t.bay_kind for t in CANONICAL_FALLBACK_REGISTRY.values()}
        # Pokrycie wymaganych kategorii §11A.4.
        required_kinds = {
            "liniowe_doplywowe",
            "liniowe_odplywowe",
            "transformatorowe",
            "pomiarowe",
            "sprzeglowe_poprzeczne",
            "pv",
            "bess",
            "fw",
            "rezerwowe",
            "potrzeb_wlasnych",
        }
        assert required_kinds.issubset(kinds)

    def test_get_canonical_fallback_for_bay_kind_transformatorowe(self):
        template = get_canonical_fallback_for_bay_kind("transformatorowe")
        assert template is not None
        assert template.bay_kind == "transformatorowe"
        assert template.bay_role == "TR"
        # base_template ma kanon Q-szynowy → CB → CT → TR.
        device_kinds = [d.kind for d in template.base_template.devices]
        assert "CB" in device_kinds
        assert "TRANSFORMER_DEVICE" in device_kinds

    def test_get_canonical_fallback_for_bay_kind_pv(self):
        template = get_canonical_fallback_for_bay_kind("pv")
        assert template is not None
        assert template.bay_kind == "pv"
        assert template.bay_role == "OZE"

    def test_list_canonical_fallback_for_manufacturer_without_ref_returns_all(self):
        templates = list_canonical_fallback_for_manufacturer(None)
        assert len(templates) == 10
        for t in templates:
            assert t.manufacturer_ref is None

    def test_list_canonical_fallback_for_manufacturer_with_ref_marks_meta(self):
        """ZPUE_WLOSZCZOWA (requires_catalog) → fallback z dopisanym manufacturer_ref."""
        templates = list_canonical_fallback_for_manufacturer("ZPUE_WLOSZCZOWA")
        assert len(templates) == 10
        for t in templates:
            assert t.manufacturer_ref == "ZPUE_WLOSZCZOWA"
            # Status nadal canonical_fallback — to nie jest oficjalny katalog ZPUE.
            assert t.source_status == "canonical_fallback"
