"""Testy dynamicznych profili DER + resolvera (karta W6-1 SS0 p.3, kasacja "ZAWSZE
zwraca profil").

Resolver zwraca profil WYŁĄCZNIE po jawnym wyborze (parametr wywołania) albo wpisie
katalogu przekształtnika niosącym `dynamic_profile_id` — bez żadnego z nich
`source="brak"`, `profile=None` (zero fabrykacji, dopełnienie precedensu k_sc
DEFAULT_FORBIDDEN — S-2). Test `TestPokrycieKatalogu` MIERZY (nie fabrykuje) ile
wpisów katalogu PV/BESS/wiatr ma dziś jawne wskazanie — pomiar jest DOWODEM stanu,
nie asercją "wszystko działa".
"""

from __future__ import annotations

import pytest
from network_model.catalog.der_dynamic import (
    DEFAULT_BESS_GFL,
    DEFAULT_BESS_GFM,
    DEFAULT_PV_GFL,
    DEFAULT_PV_GFM,
    DEFAULT_WIND_TYPE_1,
    DEFAULT_WIND_TYPE_2,
    DEFAULT_WIND_TYPE_3,
    DEFAULT_WIND_TYPE_4,
    INVERTER_DYNAMIC_PROFILES,
    WIND_DYNAMIC_PROFILES,
    InverterDynamicProfile,
    WindTurbineDynamicProfile,
    get_profile,
    list_all_profile_ids,
    resolve_der_dynamic_profile,
)
from network_model.catalog.repository import get_default_mv_catalog
from pydantic import ValidationError


class TestDefaultProfilesPresent:
    """Wszystkie 8 profili typowych normy są zarejestrowane i kompletne."""

    def test_inverter_profiles_count(self) -> None:
        assert len(INVERTER_DYNAMIC_PROFILES) == 4
        assert set(INVERTER_DYNAMIC_PROFILES.keys()) == {
            "default_pv_gfl",
            "default_pv_gfm",
            "default_bess_gfl",
            "default_bess_gfm",
        }

    def test_wind_profiles_count(self) -> None:
        assert len(WIND_DYNAMIC_PROFILES) == 4
        assert set(WIND_DYNAMIC_PROFILES.keys()) == {
            "default_wind_type_1",
            "default_wind_type_2",
            "default_wind_type_3",
            "default_wind_type_4",
        }

    def test_pv_gfl_has_no_virtual_inertia(self) -> None:
        assert DEFAULT_PV_GFL.virtual_inertia_h_s is None
        assert DEFAULT_PV_GFL.control_mode == "grid_following"

    def test_pv_gfm_has_virtual_inertia(self) -> None:
        assert DEFAULT_PV_GFM.virtual_inertia_h_s is not None
        assert DEFAULT_PV_GFM.virtual_inertia_h_s > 0.0
        assert DEFAULT_PV_GFM.control_mode == "grid_forming"

    def test_bess_gfm_has_higher_inertia_than_pv_gfm(self) -> None:
        assert DEFAULT_BESS_GFM.virtual_inertia_h_s is not None
        assert DEFAULT_PV_GFM.virtual_inertia_h_s is not None
        assert DEFAULT_BESS_GFM.virtual_inertia_h_s > DEFAULT_PV_GFM.virtual_inertia_h_s

    def test_wind_types_distinct(self) -> None:
        assert DEFAULT_WIND_TYPE_1.iec_type == "type_1"
        assert DEFAULT_WIND_TYPE_2.iec_type == "type_2"
        assert DEFAULT_WIND_TYPE_3.iec_type == "type_3"
        assert DEFAULT_WIND_TYPE_4.iec_type == "type_4"

    def test_wind_type_1_has_lower_iq_than_type_3(self) -> None:
        assert (
            DEFAULT_WIND_TYPE_1.iq_max_during_fault_pu < DEFAULT_WIND_TYPE_3.iq_max_during_fault_pu
        )

    @pytest.mark.parametrize(
        "profil",
        [
            DEFAULT_PV_GFL, DEFAULT_PV_GFM, DEFAULT_BESS_GFL, DEFAULT_BESS_GFM,
            DEFAULT_WIND_TYPE_1, DEFAULT_WIND_TYPE_2, DEFAULT_WIND_TYPE_3, DEFAULT_WIND_TYPE_4,
        ],
    )
    def test_kazdy_profil_ma_proweniencje_typowa_normy(self, profil) -> None:
        assert profil.proweniencja.zrodlo == "profil_typowy_normy"
        assert profil.proweniencja.odniesienie

    def test_zaden_profil_nie_niesie_fabrykowanej_praktyki_producenta(self) -> None:
        """Naprawa fabrykacji SS0 p.3: dawna proweniencja cytowala SMA/Tesla/
        Vestas/GE bez zadnej karty katalogowej za tymi liczbami."""
        for profil in (
            DEFAULT_PV_GFL, DEFAULT_PV_GFM, DEFAULT_BESS_GFL, DEFAULT_BESS_GFM,
            DEFAULT_WIND_TYPE_1, DEFAULT_WIND_TYPE_2, DEFAULT_WIND_TYPE_3, DEFAULT_WIND_TYPE_4,
        ):
            for producent in ("SMA", "Tesla", "Vestas", "GE 5.0"):
                assert producent not in profil.proweniencja.odniesienie


class TestBrakNumerycznychDomyslek:
    """Kazde pole fizyczne jest WYMAGANE — konstrukcja bez niego odmawia (SS0 p.3)."""

    def test_inverter_profile_brak_pola_odmawia(self) -> None:
        pelne = DEFAULT_PV_GFL.model_dump(mode="python")
        del pelne["i_max_pu"]
        with pytest.raises(ValidationError):
            InverterDynamicProfile(**pelne)

    def test_wind_profile_brak_pola_odmawia(self) -> None:
        pelne = DEFAULT_WIND_TYPE_3.model_dump(mode="python")
        del pelne["h_total_s"]
        with pytest.raises(ValidationError):
            WindTurbineDynamicProfile(**pelne)

    def test_zadne_pole_liczbowe_nie_ma_default_poza_virtual_inertia(self) -> None:
        """`virtual_inertia_h_s` jest JEDYNYM legalnie opcjonalnym polem liczbowym
        (None dla GFL — brak inercji wirtualnej jest FAKTEM fizycznym, nie
        brakiem danej)."""
        for nazwa, pole in InverterDynamicProfile.model_fields.items():
            if nazwa in ("virtual_inertia_h_s", "profile_id", "profile_name_pl",
                          "der_kind", "control_mode", "proweniencja",
                          "iq_priority_during_fault"):
                continue
            assert pole.is_required(), f"InverterDynamicProfile.{nazwa} ma default"
        for nazwa, pole in WindTurbineDynamicProfile.model_fields.items():
            if nazwa in ("profile_id", "profile_name_pl", "iec_type", "proweniencja"):
                continue
            assert pole.is_required(), f"WindTurbineDynamicProfile.{nazwa} ma default"


class TestResolverBrakBezJawnegoWyboru:
    """Kasacja "ZAWSZE zwraca profil": bez jawnego wyboru -> source='brak'."""

    def test_pv_bez_wyboru_zwraca_brak(self) -> None:
        r = resolve_der_dynamic_profile(der_kind="PV")
        assert r.source == "brak"
        assert r.profile is None
        assert r.profile_id is None

    def test_bess_bez_wyboru_zwraca_brak(self) -> None:
        r = resolve_der_dynamic_profile(der_kind="BESS", control_mode="grid_forming")
        assert r.source == "brak"
        assert r.profile is None

    def test_wind_bez_wyboru_zwraca_brak(self) -> None:
        r = resolve_der_dynamic_profile(der_kind="FW", converter_type="SCIG")
        assert r.source == "brak"
        assert r.profile is None

    def test_wind_converter_type_none_zwraca_brak_nie_type_4(self) -> None:
        """Regresja kluczowa: dawny kod MAPOWAL nieznany converter_type na
        type_4 po cichu — teraz brak wyboru jest brakiem, nie zgadywaniem."""
        r = resolve_der_dynamic_profile(der_kind="FW", converter_type=None)
        assert r.source == "brak"
        assert r.profile is None

    def test_explicit_profile_id_wins(self) -> None:
        r = resolve_der_dynamic_profile(der_kind="PV", explicit_profile_id="default_pv_gfm")
        assert r.profile_id == "default_pv_gfm"
        assert r.source == "explicit_profile_id"

    def test_catalog_dynamic_profile_id_wins(self) -> None:
        r = resolve_der_dynamic_profile(
            der_kind="BESS", catalog_dynamic_profile_id="default_bess_gfm"
        )
        assert r.profile_id == "default_bess_gfm"
        assert r.source == "catalog_entry_dynamic_profile_id"

    def test_explicit_wygrywa_nad_katalogowym(self) -> None:
        r = resolve_der_dynamic_profile(
            der_kind="PV",
            explicit_profile_id="default_pv_gfl",
            catalog_dynamic_profile_id="default_pv_gfm",
        )
        assert r.profile_id == "default_pv_gfl"
        assert r.source == "explicit_profile_id"

    def test_explicit_nieznany_zwraca_brak_nie_fallback(self) -> None:
        """Regresja kluczowa: dawny kod PODSTAWIAL default_pv_gfl dla nieznanego
        explicit_profile_id — teraz zle wskazanie jest brakiem, nie cichym
        podstawieniem innej wartosci."""
        r = resolve_der_dynamic_profile(der_kind="PV", explicit_profile_id="nonexistent_profile")
        assert r.source == "brak"
        assert r.profile is None


class TestSolverParametersIntegration:
    """Profil produkuje parametry zgodne z kontraktem solverów LEGACY (do OD-20)."""

    def test_pv_to_stability_parameters_keys(self) -> None:
        params = DEFAULT_PV_GFL.to_stability_parameters()
        assert "Tp" in params
        assert "Tq" in params
        assert "Q_droop" in params
        assert "V_ref" in params
        assert all(isinstance(v, float) for v in params.values())

    def test_pv_to_frt_parameters_keys(self) -> None:
        params = DEFAULT_PV_GFL.to_frt_parameters()
        assert "iq_max_during_fault_pu" in params
        assert "frt_response_time_s" in params
        assert "p_recovery_rate_pu_per_s" in params
        assert params["frt_response_time_s"] == DEFAULT_PV_GFL.frt_response_time_ms / 1000.0

    def test_wind_type_3_to_stability_parameters(self) -> None:
        params = DEFAULT_WIND_TYPE_3.to_stability_parameters()
        assert "Tp" in params
        assert "Tq" in params
        assert "H" in params
        assert params["H"] == DEFAULT_WIND_TYPE_3.h_total_s

    def test_wind_type_1_uses_legacy_state(self) -> None:
        params = DEFAULT_WIND_TYPE_1.to_stability_parameters()
        assert "Tw" in params
        assert "omega_ref_pu" in params

    def test_stability_model_kind_mapping(self) -> None:
        assert DEFAULT_PV_GFL.stability_model_kind == "pv_inverter_grid_following"
        assert DEFAULT_PV_GFM.stability_model_kind == "pv_inverter_grid_forming"
        assert DEFAULT_BESS_GFL.stability_model_kind == "bess_pcs_grid_following"
        assert DEFAULT_BESS_GFM.stability_model_kind == "bess_pcs_grid_forming"
        assert DEFAULT_WIND_TYPE_3.stability_model_kind == "wind_type_3"


class TestMapowanieNaParametryDynamiczneKanoniczne:
    """`to_parametry_dynamiczne` — mapowanie 1:1 na kontrakt W6-1 (SS0 p.3)."""

    def test_inverter_gfl_mapuje_sie_na_przeksztaltnik_gfl(self) -> None:
        blok = DEFAULT_PV_GFL.to_parametry_dynamiczne(
            priorytet_ogranicznika="bierna", s_n_mva=1.0,
            pll_kp=50.0, pll_ki=500.0, reg_pradu_kp=1.0, reg_pradu_ki=100.0, k_frt=2.0,
        )
        assert blok.rodzina == "przeksztaltnikowa_gfl"
        assert blok.proweniencja == DEFAULT_PV_GFL.proweniencja
        assert blok.i_max_pu == DEFAULT_PV_GFL.i_max_pu

    def test_wind_type1_mapuje_sie_bez_przeksztaltnika(self) -> None:
        blok = DEFAULT_WIND_TYPE_1.to_parametry_dynamiczne()
        assert blok.rodzina == "wiatr_typ_1"
        assert blok.przeksztaltnik is None

    def test_wind_type3_wymaga_argumentow_przeksztaltnika(self) -> None:
        with pytest.raises(ValueError, match="brak argumentow przeksztaltnika"):
            DEFAULT_WIND_TYPE_3.to_parametry_dynamiczne()

    def test_wind_type3_z_argumentami_mapuje_sie_z_przeksztaltnikiem(self) -> None:
        blok = DEFAULT_WIND_TYPE_3.to_parametry_dynamiczne(
            i_max_pu=1.2, priorytet_ogranicznika="czynna", s_n_mva=2.0,
            pll_kp=40.0, pll_ki=400.0, reg_pradu_kp=1.0, reg_pradu_ki=80.0, k_frt=1.5,
        )
        assert blok.przeksztaltnik is not None
        assert blok.przeksztaltnik.priorytet_ogranicznika == "czynna"


class TestPokrycieKatalogu:
    """POMIAR (nie fabrykacja): ile wpisow katalogu PV/BESS/wiatr ma dzis jawne
    wskazanie `dynamic_profile_id`. Kasacja "ZAWSZE zwraca profil" oznacza, ze
    wiekszosc wpisow katalogu bez jawnego wskazania dzis NIE rozwiazuje sie -
    to UCZCIWY stan (OD-22 precedens), nie regresja tej karty."""

    def test_pomiar_pokrycia_pv(self) -> None:
        catalog = get_default_mv_catalog()
        pv_inverters = catalog.list_pv_inverter_types()
        assert pv_inverters, "Katalog PV pusty — niespodziewane"
        z_wyborem = [pv for pv in pv_inverters if pv.dynamic_profile_id]
        # Pomiar zapisany jawnie — spada tylko, gdy ktos USUNIE wskazanie (nie
        # rosnie sam z siebie): przypieta DOLNA granica, zeby ewentualny wzrost
        # pokrycia katalogu nie psul testu.
        assert len(z_wyborem) >= 1, (
            f"Pokrycie PV spadlo ponizej zmierzonego minimum: {len(z_wyborem)}/{len(pv_inverters)}"
        )
        for pv in z_wyborem:
            r = resolve_der_dynamic_profile(
                der_kind="PV", catalog_dynamic_profile_id=pv.dynamic_profile_id,
            )
            assert r.profile is not None, f"PV {pv.id} niesie dynamic_profile_id, ale brak w rejestrze"

    def test_pomiar_pokrycia_bess(self) -> None:
        catalog = get_default_mv_catalog()
        bess = catalog.list_bess_inverter_types()
        assert bess
        z_wyborem = [entry for entry in bess if entry.dynamic_profile_id]
        assert len(z_wyborem) >= 1, (
            f"Pokrycie BESS spadlo ponizej zmierzonego minimum: {len(z_wyborem)}/{len(bess)}"
        )
        for entry in z_wyborem:
            r = resolve_der_dynamic_profile(
                der_kind="BESS", catalog_dynamic_profile_id=entry.dynamic_profile_id,
            )
            assert r.profile is not None

    def test_pomiar_pokrycia_wiatr(self) -> None:
        """Pomiar 2026-09-16: 0 wpisow katalogu turbin ma jawne dynamic_profile_id
        (pole istnieje w kontrakcie, zaden wpis go nie uzupelnia) — zapisane
        jawnie jako znany brak (nie ta karta go domyka: wypelnienie kazdego
        wpisu wymaga osobnej decyzji inzynierskiej ktory profil pasuje do
        ktorej turbiny, poza zakresem kontraktow tej karty)."""
        from network_model.catalog.wind_turbines.catalog import list_wind_turbines

        turbines = list_wind_turbines()
        assert turbines, "Katalog turbin wiatrowych pusty"
        z_wyborem = [t for t in turbines if t.dynamic_profile_id]
        assert len(z_wyborem) == 0, (
            "Pokrycie katalogu wiatru zmienilo sie od pomiaru 2026-09-16 "
            f"({len(z_wyborem)}/{len(turbines)}) — zaktualizuj komentarz testu "
            "albo (jesli to Twoja karta) dopisz test miarodajnosci nowych wpisow."
        )
        for t in turbines:
            r = resolve_der_dynamic_profile(
                der_kind="FW",
                catalog_dynamic_profile_id=t.dynamic_profile_id,
                converter_type=t.converter_type,
            )
            assert r.source == "brak"
            assert r.profile is None


class TestProfileDirectAccess:
    """API get_profile + list_all_profile_ids."""

    def test_list_returns_all_profiles(self) -> None:
        ids = list_all_profile_ids()
        assert len(ids) == 8
        assert ids == sorted(ids)

    def test_get_profile_by_id(self) -> None:
        p = get_profile("default_pv_gfl")
        assert isinstance(p, InverterDynamicProfile)
        assert p.profile_id == "default_pv_gfl"

    def test_get_unknown_profile_raises(self) -> None:
        with pytest.raises(KeyError):
            get_profile("unknown_profile_id")
