"""PR-9/11 — Testy 5 profili NC RfG + 12 turbin wiatrowych w katalogu."""

from __future__ import annotations

import pytest
from catalog.profiles.nc_rfg import (
    NcRfgProfile,
    klasyfikuj_modul,
    list_available_operators,
    load_nc_rfg_profile,
)
from network_model.catalog.wind_turbines import (
    WIND_TURBINE_CATALOG,
    list_wind_turbines,
)


class TestNcRfgProfilesAvailable:
    def test_5_operators_available(self) -> None:
        ops = list_available_operators()
        assert sorted(ops) == sorted(["pse", "energa", "tauron", "enea", "pge"])
        assert len(ops) == 5

    @pytest.mark.parametrize(
        "operator_id",
        ["pse", "energa", "tauron", "enea", "pge"],
    )
    def test_load_each_profile(self, operator_id: str) -> None:
        profile = load_nc_rfg_profile(operator_id)
        assert isinstance(profile, NcRfgProfile)
        assert profile.operator_id == operator_id
        assert profile.operator_name_pl  # niepuste

    def test_unknown_operator_raises(self) -> None:
        with pytest.raises(FileNotFoundError):
            load_nc_rfg_profile("unknown_operator")


class TestNcRfgProfileStructure:
    def test_pse_has_4_module_types_a_b_c_d(self) -> None:
        profile = load_nc_rfg_profile("pse")
        ids = sorted(mt.id for mt in profile.module_types)
        assert ids == ["A", "B", "C", "D"]

    def test_pse_classify_module_a_for_small_pv(self) -> None:
        # Intencja zachowana: mała instalacja PV 5 kW przyłączona do nN jest modułem typu A.
        # Zmiana kanonu (plan AB §6 pkt 2): klasyfikacja jest krajowa (WOS) i nie zależy od
        # operatora — metoda profilu `classify_module` zastąpiona jedyną funkcją
        # `klasyfikuj_modul`, która zwraca identyfikator typu zamiast obiektu klasy.
        assert klasyfikuj_modul(p_max_kw=5.0, napiecie_kv=0.4) == "A"

    def test_pse_classify_module_b_for_5mw_pv(self) -> None:
        # Intencja zachowana: farma PV 5 MW przyłączona do SN 15 kV jest modułem typu B
        # (progi WOS: 200 kW ≤ P < 10 MW) — `classify_module` → `klasyfikuj_modul`.
        assert klasyfikuj_modul(p_max_kw=5000.0, napiecie_kv=15.0) == "B"

    def test_pse_classify_module_d_for_75mw_fw(self) -> None:
        # Intencja zachowana: farma wiatrowa 75 MW jest modułem typu D — `classify_module` →
        # `klasyfikuj_modul`. Pierwotny przypadek (75 MW na 110 kV) spełniał OBIE reguły typu
        # D naraz, więc nie odróżniał reguły mocy od reguły napięciowej; dopisane przypadki
        # rozdzielają je (75 MW na 30 kV — sama moc; 100 kW na 110 kV — samo napięcie).
        assert klasyfikuj_modul(p_max_kw=75000.0, napiecie_kv=110.0) == "D"
        assert klasyfikuj_modul(p_max_kw=75000.0, napiecie_kv=30.0) == "D"
        assert klasyfikuj_modul(p_max_kw=100.0, napiecie_kv=110.0) == "D"

    def test_pse_requirement_catalog_covers_frt_and_hvrt(self) -> None:
        # Intencja zachowana: profil niesie katalog sprawdzeń zgodności, w którym są
        # wymagania FRT (LVRT) i HVRT. Zmiana kanonu (OD-26): pole `compliance_tests`
        # (18 pozycji T1–T18) jest skasowane — katalogiem jest `wymagania` (wymaganie
        # przyłączeniowe z testami kanonu PTPiREE T01–T20), więc liczba 18 i identyfikatory
        # T1/T2 zastąpione identyfikatorami wymagań i ich testami.
        profile = load_nc_rfg_profile("pse")
        assert len(profile.wymagania) == 16
        frt = profile.wymaganie("RFG_14_3")
        hvrt = profile.wymaganie("ZASTANE_HVRT")
        assert "FRT" in frt.nazwa_pl and frt.testy == ("T14",)
        assert "HVRT" in hvrt.nazwa_pl and hvrt.testy == ("T15",)

    def test_lvrt_curve_has_5_points(self) -> None:
        profile = load_nc_rfg_profile("pse")
        assert len(profile.voltage_levels.lvrt) == 5
        # Pierwszy punkt: t=0, U=0.05 (najgłębsza zapadnia)
        assert profile.voltage_levels.lvrt[0].time_s == 0.0
        assert profile.voltage_levels.lvrt[0].voltage_pu == 0.05

    def test_pse_frequency_range(self) -> None:
        profile = load_nc_rfg_profile("pse")
        fr = profile.frequency_response
        assert fr.steady_state_hz_min == 49.5
        assert fr.steady_state_hz_max == 50.5
        assert fr.transient_hz_min == 47.5
        assert fr.transient_hz_max == 51.5

    def test_pse_reactive_power_range(self) -> None:
        profile = load_nc_rfg_profile("pse")
        rp = profile.reactive_power
        assert rp.q_range_pct_pn_min == -0.33
        assert rp.q_range_pct_pn_max == 0.33
        assert "q_of_u" in rp.voltage_control_modes


class TestWindTurbineCatalog:
    def test_reference_turbines_minimum_set(self) -> None:
        # Co najmniej 12 producentów referencyjnych (PR-11 minimum) — katalog
        # rozszerzany w kolejnych iteracjach o turbiny rynkowe.
        assert len(WIND_TURBINE_CATALOG) >= 12

    def test_list_wind_turbines_deterministic(self) -> None:
        turbines = list_wind_turbines()
        ids = [t.catalog_id for t in turbines]
        assert ids == sorted(ids)  # deterministyczna kolejność

    def test_core_manufacturers_represented(self) -> None:
        # Pięciu głównych producentów PR-11 zawsze obecnych — kolejni
        # producenci (Senvion, Goldwind, MingYang) doprowadzeni produkcyjnie.
        manufacturers = {t.manufacturer for t in list_wind_turbines()}
        for must_have in (
            "Vestas",
            "Siemens Gamesa",
            "GE Renewable Energy",
            "Nordex",
            "Enercon",
        ):
            assert must_have in manufacturers

    def test_converter_types_diverse(self) -> None:
        types = {t.converter_type for t in list_wind_turbines()}
        # Powinniśmy mieć DFIG i full_converter (główne typy w komercji)
        assert "DFIG" in types
        assert "full_converter" in types

    def test_power_range_typical_for_modern_wind(self) -> None:
        powers = [t.nominal_power_kw for t in list_wind_turbines()]
        assert min(powers) >= 1500  # min 1.5 MW
        assert max(powers) <= 10000  # max 10 MW
        # Średnia w zakresie 3-6 MW
        avg = sum(powers) / len(powers)
        assert 3000 <= avg <= 6000

    def test_voltage_control_capable_for_all(self) -> None:
        for t in list_wind_turbines():
            assert t.voltage_control_capable is True
            assert t.p_f_droop_capable is True


class TestNcRfgProfileMultipleOperators:
    """Test sprawdza że wszystkie 5 operatorów ma spójną strukturę."""

    @pytest.mark.parametrize("operator_id", ["pse", "energa", "tauron", "enea", "pge"])
    def test_all_operators_have_same_requirement_catalog(self, operator_id: str) -> None:
        # Intencja zachowana: każdy operator ma ten sam, kompletny katalog sprawdzeń. Zmiana
        # kanonu (OD-26): `compliance_tests` (18 pozycji) skasowane — katalogiem jest
        # `wymagania`; wymagania pochodzą z warstw wspólnych (NC RfG, zastana, magazyny),
        # więc zbiór identyfikatorów jest identyczny u każdego operatora.
        profile = load_nc_rfg_profile(operator_id)
        referencyjny = load_nc_rfg_profile("pse")
        assert len(profile.wymagania) == 16
        assert [w.id for w in profile.wymagania] == [w.id for w in referencyjny.wymagania]

    @pytest.mark.parametrize("operator_id", ["pse", "energa", "tauron", "enea", "pge"])
    def test_all_operators_have_4_module_types(self, operator_id: str) -> None:
        profile = load_nc_rfg_profile(operator_id)
        assert len(profile.module_types) == 4

    @pytest.mark.parametrize("operator_id", ["pse", "energa", "tauron", "enea", "pge"])
    def test_all_operators_classify_5mw_as_b(self, operator_id: str) -> None:
        # Intencja zachowana: moduł 5 MW na SN 15 kV to typ B u każdego operatora. Zmiana
        # kanonu: klasyfikacja jest krajowa (`klasyfikuj_modul`, bez operatora), a zgodność
        # per operator sprawdzamy na klasach modułów jego profilu (ta sama reguła progów).
        profile = load_nc_rfg_profile(operator_id)
        assert klasyfikuj_modul(p_max_kw=5000.0, napiecie_kv=15.0) == "B"
        klasa_b = next(mt for mt in profile.module_types if mt.id == "B")
        assert klasa_b.threshold_kw_max is not None
        assert klasa_b.threshold_kw_min <= 5000.0 < klasa_b.threshold_kw_max
