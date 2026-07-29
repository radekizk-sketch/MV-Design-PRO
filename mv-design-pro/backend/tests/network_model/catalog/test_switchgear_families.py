"""Testy rejestru rodzin rozdzielnic SN (§11A.3).

Sprawdza:
- 6 startowych rodzin (ZPUE Rotoblok / Elektrometal e²ALPHA / ABB UniGear ZS1
  + SafeRing / Siemens NXAIR + 8DJH),
- Wszystkie mają status `repo_verified` (NIE `official_catalog` — to wymaga
  oficjalnego PDF od producenta).
- Każda rodzina ma source_refs wskazujące na publiczne strony produktowe.
- Filtrowanie per producent.
"""

from __future__ import annotations

import pytest
from network_model.catalog.switchgear import (
    ABB__SAFERING,
    ABB__UNIGEAR_ZS1,
    ELEKTROMETAL__E2ALPHA,
    SIEMENS__8DJH,
    SIEMENS__NXAIR,
    SWITCHGEAR_FAMILY_REGISTRY,
    ZPUE_WLOSZCZOWA__ROTOBLOK,
    get_switchgear_family,
    list_families_for_manufacturer,
    list_switchgear_families,
)


class TestSwitchgearFamilyRegistry:
    def test_registry_has_seven_starting_families(self):
        # 7. rodzina SCHNEIDER__SM6_24 dodana w programie Reference Engine V1
        # (REFERENCE_ENGINE_SPEC_V1.md — pakiet schneider_sm6, repo_verified,
        # publiczna strona produktowa se.com). Intencja testu bez zmian:
        # rejestr zawiera DOKŁADNIE znane rodziny ze źródłami.
        assert len(SWITCHGEAR_FAMILY_REGISTRY) == 7
        refs = set(SWITCHGEAR_FAMILY_REGISTRY.keys())
        assert refs == {
            "ZPUE_WLOSZCZOWA__ROTOBLOK",
            "ELEKTROMETAL__E2ALPHA",
            "ABB__UNIGEAR_ZS1",
            "ABB__SAFERING",
            "SIEMENS__NXAIR",
            "SIEMENS__8DJH",
            "SCHNEIDER__SM6_24",
        }

    def test_all_families_repo_verified_not_official(self):
        """Reguła §11A.1 — `repo_verified` dla publicznych źródeł, NIE
        `official_catalog` bez zatwierdzonego PDF od producenta."""
        for family in SWITCHGEAR_FAMILY_REGISTRY.values():
            assert family.status == "repo_verified"
            assert family.verified_at is None  # brak oficjalnej weryfikacji

    def test_all_families_have_source_refs(self):
        for family in SWITCHGEAR_FAMILY_REGISTRY.values():
            assert len(family.source_refs) > 0, f"{family.switchgear_family_ref} brak source_refs"
            # Każdy source_ref musi być URL-em publicznym.
            for ref in family.source_refs:
                assert ref.startswith("https://"), f"{ref} nie jest URL"

    def test_all_families_have_source_document_refs(self):
        for family in SWITCHGEAR_FAMILY_REGISTRY.values():
            assert (
                len(family.source_document_refs) > 0
            ), f"{family.switchgear_family_ref} brak source_document_refs"

    def test_polish_notes_present_for_all(self):
        for family in SWITCHGEAR_FAMILY_REGISTRY.values():
            assert family.notes_pl is not None
            assert "repo_verified" in family.notes_pl

    def test_list_deterministic(self):
        first = [f.switchgear_family_ref for f in list_switchgear_families()]
        for _ in range(10):
            assert [f.switchgear_family_ref for f in list_switchgear_families()] == first
        assert first == sorted(first)

    def test_get_unknown_raises(self):
        with pytest.raises(KeyError):
            get_switchgear_family("UNKNOWN")


class TestZpueRotoblok:
    def test_basic_metadata(self):
        f = ZPUE_WLOSZCZOWA__ROTOBLOK
        assert f.manufacturer_ref == "ZPUE_WLOSZCZOWA"
        assert f.family_name == "Rotoblok"
        assert f.voltage_levels == [15.0, 20.0]
        assert f.rated_current_options == [630, 1250]
        assert 16 in f.short_time_current_options
        assert f.insulation_type == "air"
        assert f.busbar_system == "single"

    def test_supports_required_bay_kinds(self):
        f = ZPUE_WLOSZCZOWA__ROTOBLOK
        required = {
            "liniowe_doplywowe",
            "liniowe_odplywowe",
            "transformatorowe",
            "pomiarowe",
            "sprzeglowe_poprzeczne",
            "odgromnikowe",
            "potrzeb_wlasnych",
        }
        assert required.issubset(set(f.allowed_bay_kinds))


class TestElektrometalE2Alpha:
    def test_basic_metadata(self):
        f = ELEKTROMETAL__E2ALPHA
        assert f.manufacturer_ref == "ELEKTROMETAL"
        assert f.voltage_levels == [12.0, 17.5, 24.0]
        assert 31 in f.short_time_current_options
        assert f.insulation_type == "air"
        assert "lv_control_compartment" in f.compartment_models


class TestAbbFamilies:
    def test_unigear_zs1_metadata(self):
        f = ABB__UNIGEAR_ZS1
        assert f.manufacturer_ref == "ABB"
        assert 4000 in f.rated_current_options
        assert 63 in f.short_time_current_options
        assert f.construction_type == "wysuwna"
        assert f.insulation_type == "air"

    def test_safering_metadata(self):
        f = ABB__SAFERING
        assert f.manufacturer_ref == "ABB"
        assert f.construction_type == "RMU"
        assert f.insulation_type == "sf6"
        assert f.busbar_system == "ring_main"
        assert f.rated_current_options == [630]

    def test_abb_has_two_families(self):
        abb = list_families_for_manufacturer("ABB")
        assert len(abb) == 2
        names = {f.family_name for f in abb}
        assert names == {"UniGear ZS1", "SafeRing"}


class TestSiemensFamilies:
    def test_nxair_metadata(self):
        f = SIEMENS__NXAIR
        assert f.manufacturer_ref == "SIEMENS"
        assert 4000 in f.rated_current_options
        assert f.construction_type == "wysuwna"
        assert f.insulation_type == "air"

    def test_8djh_metadata(self):
        f = SIEMENS__8DJH
        assert f.manufacturer_ref == "SIEMENS"
        assert f.construction_type == "RMU"
        assert f.insulation_type == "sf6"
        assert f.rated_current_options == [630]

    def test_siemens_has_two_families(self):
        siemens = list_families_for_manufacturer("SIEMENS")
        assert len(siemens) == 2


class TestFilterByManufacturer:
    def test_filter_returns_only_manufacturer_families(self):
        for ref, expected in [
            ("ZPUE_WLOSZCZOWA", 1),
            ("ELEKTROMETAL", 1),
            ("ABB", 2),
            ("SIEMENS", 2),
        ]:
            families = list_families_for_manufacturer(ref)
            assert len(families) == expected, f"{ref}: got {len(families)}, expected {expected}"
            for f in families:
                assert f.manufacturer_ref == ref

    def test_filter_unknown_returns_empty(self):
        assert list_families_for_manufacturer("UNKNOWN") == []


class TestSourceTraceability:
    """Reguła §11A.1: każda pozycja katalogowa MUSI być traceable do źródła."""

    def test_zpue_source_is_official_product_page(self):
        assert any("zpue.pl" in ref for ref in ZPUE_WLOSZCZOWA__ROTOBLOK.source_refs)

    def test_elektrometal_source_is_official_page(self):
        assert any("elektrometal" in ref.lower() for ref in ELEKTROMETAL__E2ALPHA.source_refs)

    def test_abb_unigear_source_is_official_page(self):
        assert any("abb.com" in ref for ref in ABB__UNIGEAR_ZS1.source_refs)

    def test_abb_safering_source_is_official_page(self):
        assert any("abb.com" in ref for ref in ABB__SAFERING.source_refs)

    def test_siemens_nxair_source_is_official_page(self):
        assert any("siemens.com" in ref for ref in SIEMENS__NXAIR.source_refs)

    def test_siemens_8djh_source_is_official_page(self):
        assert any("siemens.com" in ref for ref in SIEMENS__8DJH.source_refs)
