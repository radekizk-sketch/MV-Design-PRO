"""Testy rejestru rodzin rozdzielnic SN (§11A.3).

Sprawdza:
- komplet rodzin rejestru (transza 2026-08-14: scalenie kanonu rozdzielnic —
  rodziny z modułu S1 `switchgear_families.py` wtopione tutaj),
- statusy źródeł wg polityki (`repo_verified` dla publicznych źródeł, NIGDY
  `official_catalog` bez zatwierdzonego PDF; `requires_catalog` gdy karta nie
  podaje kompletu klas — taka rodzina nie wchodzi do oferty konfiguratora),
- Każda rodzina ma source_refs wskazujące na publiczne strony produktowe.
- Filtrowanie per producent.
- Tor konfiguracji (MODULARNY / BLOK_RMU) wyprowadzony z konstrukcji.
"""

from __future__ import annotations

from typing import get_args

import pytest
from network_model.catalog.switchgear import (
    ABB__SAFEPLUS,
    ABB__SAFERING,
    ABB__UNIGEAR_ZS1,
    ABB__UNISEC,
    ELEKTROMETAL__E2ALPHA,
    SCHNEIDER__RM6,
    SCHNEIDER__RM_AIRSET,
    SCHNEIDER__SM6_24,
    SIEMENS__8DJH,
    SIEMENS__NXAIR,
    SWITCHGEAR_FAMILY_REGISTRY,
    ZPUE_WLOSZCZOWA__RELF,
    ZPUE_WLOSZCZOWA__RELF_2S,
    ZPUE_WLOSZCZOWA__ROTOBLOK,
    ZPUE_WLOSZCZOWA__ROTOBLOK_AIR,
    ZPUE_WLOSZCZOWA__ROTOBLOK_VCB,
    ZPUE_WLOSZCZOWA__RXD,
    ZPUE_WLOSZCZOWA__TPM,
    ZPUE_WLOSZCZOWA__TPM_AIR,
    ConstructionType,
    get_switchgear_family,
    list_families_for_manufacturer,
    list_offered_switchgear_families,
    list_switchgear_families,
)
from network_model.catalog.switchgear.switchgear_family import (
    TOR_KONFIGURACJI_WG_KONSTRUKCJI,
)


class TestSwitchgearFamilyRegistry:
    def test_registry_has_all_known_families(self):
        # Transza 2026-08-14 (scalenie kanonu rozdzielnic, karta
        # SCALENIE-KANONU-ROZDZIELNIC): do 7 rodzin rejestru doszło 11 rodzin
        # z wtopionego modułu S1 — ZPUE (TPM, TPM Air, Rotoblok Air, Rotoblok
        # VCB, RELF, RELF 2S, RXD), ABB (SafePlus, UniSec), Schneider (RM6,
        # RM AirSeT). Intencja testu bez zmian: rejestr zawiera DOKŁADNIE
        # znane rodziny ze źródłami — żadna nie wchodzi bocznymi drzwiami.
        assert len(SWITCHGEAR_FAMILY_REGISTRY) == 18
        refs = set(SWITCHGEAR_FAMILY_REGISTRY.keys())
        assert refs == {
            "ZPUE_WLOSZCZOWA__ROTOBLOK",
            "ZPUE_WLOSZCZOWA__ROTOBLOK_AIR",
            "ZPUE_WLOSZCZOWA__ROTOBLOK_VCB",
            "ZPUE_WLOSZCZOWA__RELF",
            "ZPUE_WLOSZCZOWA__RELF_2S",
            "ZPUE_WLOSZCZOWA__RXD",
            "ZPUE_WLOSZCZOWA__TPM",
            "ZPUE_WLOSZCZOWA__TPM_AIR",
            "ELEKTROMETAL__E2ALPHA",
            "ABB__UNIGEAR_ZS1",
            "ABB__SAFERING",
            "ABB__SAFEPLUS",
            "ABB__UNISEC",
            "SIEMENS__NXAIR",
            "SIEMENS__8DJH",
            "SCHNEIDER__SM6_24",
            "SCHNEIDER__RM6",
            "SCHNEIDER__RM_AIRSET",
        }

    def test_no_family_claims_official_catalog(self):
        """Reguła §11A.1 — `repo_verified` dla publicznych źródeł, NIE
        `official_catalog` bez zatwierdzonego PDF od producenta.

        Transza 2026-08-14 dopuściła drugi honorowy status: `requires_catalog`
        dla rodziny, której publiczna karta NIE podaje kompletu klas
        prądowych/zwarciowych (ABB UniSec). To nie jest rozluźnienie reguły —
        zapadka niżej pilnuje, że taka rodzina nie wchodzi do oferty.
        """
        for family in SWITCHGEAR_FAMILY_REGISTRY.values():
            assert family.status in {"repo_verified", "requires_catalog"}
            assert family.verified_at is None  # brak oficjalnej weryfikacji

    def test_family_requiring_catalog_is_not_offered(self):
        """Zapadka polityki danych: rodzina bez potwierdzonych klas istnieje w
        katalogu (nie niszczymy wiedzy o portfolio), ale konfigurator jej NIE
        oferuje — i deklaruje brak wprost, pustymi listami, nie zerami."""
        oferowane = {f.switchgear_family_ref for f in list_offered_switchgear_families()}
        for family in SWITCHGEAR_FAMILY_REGISTRY.values():
            if family.status == "requires_catalog":
                assert family.switchgear_family_ref not in oferowane
                assert family.rated_current_options == []
                assert family.short_time_current_options == []
            else:
                assert family.switchgear_family_ref in oferowane

    def test_offered_families_declare_complete_rating_classes(self):
        """Rodzina oferowana MUSI mieć komplet klas znamionowych — inaczej
        walidator zgodności nie ma czym odpowiadać na pytanie projektanta."""
        for family in list_offered_switchgear_families():
            assert family.voltage_levels, family.switchgear_family_ref
            assert family.rated_current_options, family.switchgear_family_ref
            assert family.short_time_current_options, family.switchgear_family_ref
            assert min(family.voltage_levels) > 0, family.switchgear_family_ref
            assert min(family.rated_current_options) > 0, family.switchgear_family_ref
            assert min(family.short_time_current_options) > 0, family.switchgear_family_ref

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
        # Intencja bez zmian: nota po polsku MUSI deklarować status źródła
        # rodziny (czytelnik widzi, na czym stoją dane). Po transzy
        # 2026-08-14 dopuszczalne statusy to `repo_verified` albo
        # `requires_catalog` — nota nazywa ten, który rodzina naprawdę ma.
        for family in SWITCHGEAR_FAMILY_REGISTRY.values():
            assert family.notes_pl is not None
            assert family.status in family.notes_pl, family.switchgear_family_ref

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

    def test_safeplus_metadata(self):
        f = ABB__SAFEPLUS
        assert f.manufacturer_ref == "ABB"
        assert f.construction_type == "RMU"
        assert f.insulation_type == "sf6"
        assert f.busbar_system == "ring_main"
        # SafePlus różni się od SafeRing rozszerzalnością: 12-24 kV, 630/1250 A.
        assert f.rated_current_options == [630, 1250]
        assert f.tor_konfiguracji == "BLOK_RMU"

    def test_unisec_declares_missing_catalog_instead_of_guessing(self):
        f = ABB__UNISEC
        assert f.manufacturer_ref == "ABB"
        assert f.status == "requires_catalog"
        assert f.insulation_type == "air"
        assert f.tor_konfiguracji == "MODULARNY"

    def test_abb_has_four_families(self):
        # Transza 2026-08-14: do UniGear ZS1 i SafeRing doszły SafePlus i UniSec.
        abb = list_families_for_manufacturer("ABB")
        assert len(abb) == 4
        names = {f.family_name for f in abb}
        assert names == {"UniGear ZS1", "SafeRing", "SafePlus", "UniSec"}


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
        # Liczby po transzy 2026-08-14 (scalenie kanonu): ZPUE 8 rodzin
        # (Rotoblok, Rotoblok Air, Rotoblok VCB, RELF, RELF 2S, RXD, TPM,
        # TPM Air), ABB 4 (UniGear ZS1, SafeRing, SafePlus, UniSec),
        # Schneider 3 (SM6-24, RM6, RM AirSeT).
        for ref, expected in [
            ("ZPUE_WLOSZCZOWA", 8),
            ("ELEKTROMETAL", 1),
            ("ABB", 4),
            ("SIEMENS", 2),
            ("SCHNEIDER_ELECTRIC", 3),
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

    def test_transza_2026_08_14_sources_point_at_the_right_vendor(self):
        """Proweniencja rodzin transzy scalenia kanonu — źródło MUSI dotyczyć
        producenta rodziny (URL z domeny producenta albo karta produktu
        branżowa opisująca jego wyrób), nie dowolnego linku."""
        for family, oczekiwane_domeny in [
            (ZPUE_WLOSZCZOWA__TPM, ("elektro.info.pl", "zpue.pl")),
            (ZPUE_WLOSZCZOWA__TPM_AIR, ("zpue.pl",)),
            (ZPUE_WLOSZCZOWA__ROTOBLOK_AIR, ("zpue.pl",)),
            (ZPUE_WLOSZCZOWA__ROTOBLOK_VCB, ("zpue.pl",)),
            (ZPUE_WLOSZCZOWA__RELF, ("zpue.pl",)),
            (ZPUE_WLOSZCZOWA__RELF_2S, ("zpue.pl",)),
            (ZPUE_WLOSZCZOWA__RXD, ("elektro.info.pl", "zpue.pl")),
            (ABB__SAFEPLUS, ("abb.com",)),
            (ABB__UNISEC, ("abb.com",)),
            (SCHNEIDER__RM6, ("se.com",)),
            (SCHNEIDER__RM_AIRSET, ("se.com",)),
        ]:
            assert family.source_refs, family.switchgear_family_ref
            assert family.source_document_refs, family.switchgear_family_ref
            for ref in family.source_refs + family.source_document_refs:
                assert any(
                    domena in ref for domena in oczekiwane_domeny
                ), f"{family.switchgear_family_ref}: obce źródło {ref}"


class TestTorKonfiguracji:
    """Tor konfiguracji (MODULARNY / BLOK_RMU) — JEDNO odwzorowanie z
    `construction_type`, bez osobnego pola „architektura" (zakaz dwóch
    ścieżek tej samej prawdy)."""

    def test_mapa_pokrywa_komplet_typow_konstrukcji_i_nic_ponadto(self):
        """Test DWUSTRONNY: żadna wartość ConstructionType nie zostaje bez
        toru (cichy domyślny tor) i żaden wpis mapy nie opisuje konstrukcji
        spoza kanonu."""
        assert set(TOR_KONFIGURACJI_WG_KONSTRUKCJI) == set(get_args(ConstructionType))

    def test_blok_rmu_dokladnie_dla_konstrukcji_rmu(self):
        """Predykat wejścia i wyjścia z jednego źródła: tor blokowy mają
        DOKŁADNIE rodziny o konstrukcji RMU — ani mniej, ani więcej."""
        blokowe = {
            konstrukcja
            for konstrukcja, tor in TOR_KONFIGURACJI_WG_KONSTRUKCJI.items()
            if tor == "BLOK_RMU"
        }
        assert blokowe == {"RMU"}
        rodziny_blokowe = {
            f.switchgear_family_ref
            for f in list_switchgear_families()
            if f.tor_konfiguracji == "BLOK_RMU"
        }
        assert rodziny_blokowe == {
            f.switchgear_family_ref
            for f in list_switchgear_families()
            if f.construction_type == "RMU"
        }

    def test_brak_deklaracji_konstrukcji_to_jawny_brak_toru(self):
        assert TOR_KONFIGURACJI_WG_KONSTRUKCJI["unknown"] is None

    def test_kazda_rodzina_rejestru_deklaruje_tor(self):
        """Zapadka danych: rodzina w rejestrze nie może mieć nieznanego toru —
        kreator musiałby zgadywać, którą ścieżką prowadzić projektanta."""
        for family in list_switchgear_families():
            assert family.tor_konfiguracji is not None, family.switchgear_family_ref

    def test_rodziny_rmu_transzy_maja_tor_blokowy(self):
        for family in (
            ZPUE_WLOSZCZOWA__TPM,
            ZPUE_WLOSZCZOWA__TPM_AIR,
            ABB__SAFERING,
            ABB__SAFEPLUS,
            SCHNEIDER__RM6,
            SCHNEIDER__RM_AIRSET,
            SIEMENS__8DJH,
        ):
            assert family.tor_konfiguracji == "BLOK_RMU", family.switchgear_family_ref

    def test_rodziny_modulowe_transzy_maja_tor_modularny(self):
        for family in (
            ZPUE_WLOSZCZOWA__ROTOBLOK,
            ZPUE_WLOSZCZOWA__ROTOBLOK_AIR,
            ZPUE_WLOSZCZOWA__ROTOBLOK_VCB,
            ZPUE_WLOSZCZOWA__RELF,
            ZPUE_WLOSZCZOWA__RELF_2S,
            ZPUE_WLOSZCZOWA__RXD,
            ABB__UNIGEAR_ZS1,
            ABB__UNISEC,
            ELEKTROMETAL__E2ALPHA,
            SIEMENS__NXAIR,
            SCHNEIDER__SM6_24,
        ):
            assert family.tor_konfiguracji == "MODULARNY", family.switchgear_family_ref

    def test_tor_jest_wyliczany_a_nie_przechowywany(self):
        """Deklaracja bez testu = fałszywa pewność: tor MUSI iść za zmianą
        konstrukcji, bo inaczej jest drugą, rozjeżdżającą się prawdą."""
        rmu = ZPUE_WLOSZCZOWA__ROTOBLOK.model_copy(update={"construction_type": "RMU"})
        assert ZPUE_WLOSZCZOWA__ROTOBLOK.tor_konfiguracji == "MODULARNY"
        assert rmu.tor_konfiguracji == "BLOK_RMU"

    def test_tor_wychodzi_w_serializacji_kontraktu(self):
        payload = ZPUE_WLOSZCZOWA__TPM_AIR.model_dump(mode="json")
        assert payload["tor_konfiguracji"] == "BLOK_RMU"
        assert payload["construction_type"] == "RMU"
