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
            DEFAULT_PV_GFL,
            DEFAULT_PV_GFM,
            DEFAULT_BESS_GFL,
            DEFAULT_BESS_GFM,
            DEFAULT_WIND_TYPE_1,
            DEFAULT_WIND_TYPE_2,
            DEFAULT_WIND_TYPE_3,
            DEFAULT_WIND_TYPE_4,
        ],
    )
    def test_kazdy_profil_ma_proweniencje_typowa_normy(self, profil) -> None:
        assert profil.proweniencja.zrodlo == "profil_typowy_normy"
        assert profil.proweniencja.odniesienie

    def test_zaden_profil_nie_niesie_fabrykowanej_praktyki_producenta(self) -> None:
        """Naprawa fabrykacji SS0 p.3: dawna proweniencja cytowala SMA/Tesla/
        Vestas/GE bez zadnej karty katalogowej za tymi liczbami."""
        for profil in (
            DEFAULT_PV_GFL,
            DEFAULT_PV_GFM,
            DEFAULT_BESS_GFL,
            DEFAULT_BESS_GFM,
            DEFAULT_WIND_TYPE_1,
            DEFAULT_WIND_TYPE_2,
            DEFAULT_WIND_TYPE_3,
            DEFAULT_WIND_TYPE_4,
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

    def test_zadne_pole_liczbowe_nie_ma_default_poza_polami_trybu(self) -> None:
        """Pola opcjonalne w SCHEMACIE to WYŁĄCZNIE pola trybu sterowania (karta AB-P1):
        ich obecność wymusza walidator trybu (GFL / GFM / turbina z przekształtnikiem),
        więc „opcjonalne" znaczy „spoza trybu", nigdy „cicho domyślne"."""
        from network_model.catalog.der_dynamic.models import (
            POLA_PRZEKSZTALTNIKA_TURBINY,
            POLA_REGULACJI_GFL,
            POLA_REGULACJI_GFM,
        )

        pola_trybu_falownika = {*POLA_REGULACJI_GFL, *POLA_REGULACJI_GFM}
        for nazwa, pole in InverterDynamicProfile.model_fields.items():
            if nazwa in (
                "profile_id",
                "profile_name_pl",
                "der_kind",
                "control_mode",
                "proweniencja",
                "iq_priority_during_fault",
            ):
                continue
            if nazwa in pola_trybu_falownika:
                assert pole.default is None, f"InverterDynamicProfile.{nazwa} ma default liczbowy"
                continue
            assert pole.is_required(), f"InverterDynamicProfile.{nazwa} ma default"
        for nazwa, pole in WindTurbineDynamicProfile.model_fields.items():
            if nazwa in ("profile_id", "profile_name_pl", "iec_type", "proweniencja"):
                continue
            if nazwa in POLA_PRZEKSZTALTNIKA_TURBINY:
                assert pole.default is None, f"WindTurbineDynamicProfile.{nazwa} ma default"
                continue
            assert pole.is_required(), f"WindTurbineDynamicProfile.{nazwa} ma default"

    @pytest.mark.parametrize(
        ("profil", "pole", "wartosc"),
        [
            # Iloczyn: {GFL, GFM, turbina z przekształtnikiem, turbina bez} × {brak pola
            # trybu, pole spoza trybu} — każda komórka musi odmówić budowy profilu.
            (DEFAULT_PV_GFL, "pll_kp", None),
            (DEFAULT_PV_GFL, "gfm_control", "vsm"),
            (DEFAULT_BESS_GFL, "frt_k_factor", None),
            (DEFAULT_PV_GFM, "virtual_damping_pu", None),
            (DEFAULT_PV_GFM, "pll_ki", 500.0),
            (DEFAULT_BESS_GFM, "virtual_inertia_h_s", None),
            (DEFAULT_WIND_TYPE_3, "converter_i_max_pu", None),
            (DEFAULT_WIND_TYPE_4, "current_ki", None),
            (DEFAULT_WIND_TYPE_1, "pll_kp", 50.0),
            (DEFAULT_WIND_TYPE_2, "iq_priority_during_fault", True),
        ],
    )
    def test_pola_trybu_brak_albo_nadmiar_odmawia(self, profil, pole, wartosc) -> None:
        dane = profil.model_dump(mode="python")
        dane[pole] = wartosc
        with pytest.raises(ValidationError, match="pól"):
            type(profil)(**dane)


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


class TestMapowanieNaParametryDynamiczneKanoniczne:
    """`to_parametry_dynamiczne` — mapowanie 1:1 na kontrakt W6-1 (SS0 p.3)."""

    def test_inverter_gfl_mapuje_sie_na_przeksztaltnik_gfl(self) -> None:
        blok = DEFAULT_PV_GFL.to_parametry_dynamiczne(s_n_mva=1.0)
        assert blok.rodzina == "przeksztaltnikowa_gfl"
        assert blok.proweniencja == DEFAULT_PV_GFL.proweniencja
        assert blok.i_max_pu == DEFAULT_PV_GFL.i_max_pu
        assert blok.pll_kp == DEFAULT_PV_GFL.pll_kp
        assert blok.k_frt == DEFAULT_PV_GFL.frt_k_factor
        assert blok.s_n_mva == 1.0

    @pytest.mark.parametrize("profil", [DEFAULT_PV_GFM, DEFAULT_BESS_GFM])
    def test_inverter_gfm_mapuje_sie_na_przeksztaltnik_gfm(self, profil) -> None:
        """Karta AB-P1: profil tworzący sieć mapował się na przekształtnik NADĄŻNY (GFL) —
        inna rodzina urządzenia bez śladu. Teraz GFM -> `PrzeksztaltnikGFM` 1:1."""
        blok = profil.to_parametry_dynamiczne(s_n_mva=2.0)
        assert blok.rodzina == "przeksztaltnikowa_gfm"
        assert blok.h_wirtualne_s == profil.virtual_inertia_h_s
        assert blok.mp_pu == profil.p_f_droop_pu
        assert blok.mq_pu == profil.q_u_droop_pu
        assert blok.tryb == profil.gfm_control

    @pytest.mark.parametrize(("priorytet_iq", "skladowa"), [(True, "bierna"), (False, "czynna")])
    def test_priorytet_ogranicznika_z_deklaracji_profilu(self, priorytet_iq, skladowa) -> None:
        dane = DEFAULT_PV_GFL.model_dump(mode="python")
        dane["iq_priority_during_fault"] = priorytet_iq
        blok = InverterDynamicProfile(**dane).to_parametry_dynamiczne(s_n_mva=1.0)
        assert blok.priorytet_ogranicznika == skladowa

    @pytest.mark.parametrize("profil", [DEFAULT_WIND_TYPE_1, DEFAULT_WIND_TYPE_2])
    def test_wind_type_1_2_mapuje_sie_bez_przeksztaltnika(self, profil) -> None:
        blok = profil.to_parametry_dynamiczne(s_n_mva=3.0)
        assert blok.rodzina == f"wiatr_typ_{profil.iec_type[-1]}"
        assert blok.przeksztaltnik is None
        assert blok.tlumienie_walu_pu == profil.drive_train_damping_pu

    @pytest.mark.parametrize("profil", [DEFAULT_WIND_TYPE_3, DEFAULT_WIND_TYPE_4])
    def test_wind_type_3_4_mapuje_sie_z_przeksztaltnikiem_z_profilu(self, profil) -> None:
        """Karta AB-P1: statyzmy i regulacja przekształtnika z PROFILU, nie ze stałych
        zaszytych w mapowaniu ani z argumentów wołającego."""
        blok = profil.to_parametry_dynamiczne(s_n_mva=3.0)
        assert blok.przeksztaltnik is not None
        assert blok.przeksztaltnik.s_n_mva == 3.0
        assert blok.przeksztaltnik.i_max_pu == profil.converter_i_max_pu
        assert blok.przeksztaltnik.droop_p_f_pu == profil.p_f_droop_pu
        assert blok.przeksztaltnik.pll_ki == profil.pll_ki
        assert blok.przeksztaltnik.priorytet_ogranicznika == "bierna"


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
        assert (
            len(z_wyborem) >= 1
        ), f"Pokrycie PV spadlo ponizej zmierzonego minimum: {len(z_wyborem)}/{len(pv_inverters)}"
        for pv in z_wyborem:
            r = resolve_der_dynamic_profile(
                der_kind="PV",
                catalog_dynamic_profile_id=pv.dynamic_profile_id,
            )
            assert (
                r.profile is not None
            ), f"PV {pv.id} niesie dynamic_profile_id, ale brak w rejestrze"

    def test_pomiar_pokrycia_bess(self) -> None:
        catalog = get_default_mv_catalog()
        bess = catalog.list_bess_inverter_types()
        assert bess
        z_wyborem = [entry for entry in bess if entry.dynamic_profile_id]
        assert (
            len(z_wyborem) >= 1
        ), f"Pokrycie BESS spadlo ponizej zmierzonego minimum: {len(z_wyborem)}/{len(bess)}"
        for entry in z_wyborem:
            r = resolve_der_dynamic_profile(
                der_kind="BESS",
                catalog_dynamic_profile_id=entry.dynamic_profile_id,
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
