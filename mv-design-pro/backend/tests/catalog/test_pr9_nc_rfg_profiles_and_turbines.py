"""PR-9/11 — Testy 5 profili NC RfG + 12 turbin wiatrowych w katalogu."""

from __future__ import annotations

import pytest

from src.catalog.profiles.nc_rfg import (
    NcRfgProfile,
    list_available_operators,
    load_nc_rfg_profile,
)
from src.network_model.catalog.wind_turbines import (
    WIND_TURBINE_CATALOG,
    list_wind_turbines,
)


class TestNcRfgProfilesAvailable:
    def test_5_operators_available(self) -> None:
        ops = list_available_operators()
        assert sorted(ops) == sorted(["pse", "energa", "tauron", "enea", "pge"])
        assert len(ops) == 5

    @pytest.mark.parametrize(
        "operator_id", ["pse", "energa", "tauron", "enea", "pge"],
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
        profile = load_nc_rfg_profile("pse")
        # 5 kW PV po nN = kategoria A
        mt = profile.classify_module(p_max_kw=5.0, voltage_kv=0.4)
        assert mt is not None
        assert mt.id == "A"

    def test_pse_classify_module_b_for_5mw_pv(self) -> None:
        profile = load_nc_rfg_profile("pse")
        mt = profile.classify_module(p_max_kw=5000.0, voltage_kv=15.0)
        assert mt is not None
        assert mt.id == "B"

    def test_pse_classify_module_d_for_75mw_fw(self) -> None:
        profile = load_nc_rfg_profile("pse")
        # 75 MW FW = kategoria D
        mt = profile.classify_module(p_max_kw=75000.0, voltage_kv=110.0)
        assert mt is not None
        assert mt.id == "D"

    def test_pse_has_18_compliance_tests(self) -> None:
        profile = load_nc_rfg_profile("pse")
        assert len(profile.compliance_tests) == 18
        # Sprawdź T1=LVRT, T2=HVRT
        t1 = next((t for t in profile.compliance_tests if t.id == "T1"), None)
        t2 = next((t for t in profile.compliance_tests if t.id == "T2"), None)
        assert t1 is not None and "LVRT" in t1.name_pl
        assert t2 is not None and "HVRT" in t2.name_pl

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
    def test_12_reference_turbines(self) -> None:
        assert len(WIND_TURBINE_CATALOG) == 12

    def test_list_wind_turbines_deterministic(self) -> None:
        turbines = list_wind_turbines()
        ids = [t.catalog_id for t in turbines]
        assert ids == sorted(ids)  # deterministyczna kolejność

    def test_5_manufacturers_represented(self) -> None:
        manufacturers = {t.manufacturer for t in list_wind_turbines()}
        assert manufacturers == {
            "Vestas",
            "Siemens Gamesa",
            "GE Renewable Energy",
            "Nordex",
            "Enercon",
        }

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
    def test_all_operators_have_18_tests(self, operator_id: str) -> None:
        profile = load_nc_rfg_profile(operator_id)
        assert len(profile.compliance_tests) == 18

    @pytest.mark.parametrize("operator_id", ["pse", "energa", "tauron", "enea", "pge"])
    def test_all_operators_have_4_module_types(self, operator_id: str) -> None:
        profile = load_nc_rfg_profile(operator_id)
        assert len(profile.module_types) == 4

    @pytest.mark.parametrize("operator_id", ["pse", "energa", "tauron", "enea", "pge"])
    def test_all_operators_classify_5mw_as_b(self, operator_id: str) -> None:
        profile = load_nc_rfg_profile(operator_id)
        mt = profile.classify_module(p_max_kw=5000.0, voltage_kv=15.0)
        assert mt is not None
        assert mt.id == "B"
