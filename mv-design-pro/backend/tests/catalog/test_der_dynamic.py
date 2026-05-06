"""Testy dynamicznych profili DER + resolvera (PR-15/16 production end-to-end).

Każdy DER (PV/BESS/FW) musi mieć rozwiązywalny model dynamiczny przez
resolver — żaden nie zostaje bez modelu (brief 2 §15/§16).
"""

from __future__ import annotations

import pytest

from src.network_model.catalog.der_dynamic import (
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
from src.network_model.catalog.repository import get_default_mv_catalog


class TestDefaultProfilesPresent:
    """Wszystkie 8 default profili są zarejestrowane i kompletne."""

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
        # BESS GFM ma większą inercję wirtualną niż PV GFM (briefa 2 §15 + IEEE 2800)
        assert DEFAULT_BESS_GFM.virtual_inertia_h_s is not None
        assert DEFAULT_PV_GFM.virtual_inertia_h_s is not None
        assert DEFAULT_BESS_GFM.virtual_inertia_h_s > DEFAULT_PV_GFM.virtual_inertia_h_s

    def test_wind_types_distinct(self) -> None:
        assert DEFAULT_WIND_TYPE_1.iec_type == "type_1"
        assert DEFAULT_WIND_TYPE_2.iec_type == "type_2"
        assert DEFAULT_WIND_TYPE_3.iec_type == "type_3"
        assert DEFAULT_WIND_TYPE_4.iec_type == "type_4"

    def test_wind_type_1_has_lower_iq_than_type_3(self) -> None:
        # SCIG (type 1) ma ograniczone Iq vs DFIG (type 3)
        assert (
            DEFAULT_WIND_TYPE_1.iq_max_during_fault_pu
            < DEFAULT_WIND_TYPE_3.iq_max_during_fault_pu
        )


class TestResolverChain:
    """Łańcuch katalog → profil → default."""

    def test_pv_default_gfl(self) -> None:
        r = resolve_der_dynamic_profile(der_kind="PV")
        assert r.profile_id == "default_pv_gfl"
        assert r.source == "default_per_kind"
        assert isinstance(r.profile, InverterDynamicProfile)

    def test_pv_default_gfm(self) -> None:
        r = resolve_der_dynamic_profile(der_kind="PV", control_mode="grid_forming")
        assert r.profile_id == "default_pv_gfm"

    def test_bess_default_gfl(self) -> None:
        r = resolve_der_dynamic_profile(der_kind="BESS")
        assert r.profile_id == "default_bess_gfl"

    def test_bess_default_gfm(self) -> None:
        r = resolve_der_dynamic_profile(der_kind="BESS", control_mode="grid_forming")
        assert r.profile_id == "default_bess_gfm"

    def test_wind_scig_resolves_type_1(self) -> None:
        r = resolve_der_dynamic_profile(der_kind="FW", converter_type="SCIG")
        assert r.profile_id == "default_wind_type_1"
        assert r.source == "default_per_converter_type"
        assert isinstance(r.profile, WindTurbineDynamicProfile)

    def test_wind_dfig_resolves_type_3(self) -> None:
        r = resolve_der_dynamic_profile(der_kind="FW", converter_type="DFIG")
        assert r.profile_id == "default_wind_type_3"

    def test_wind_full_converter_resolves_type_4(self) -> None:
        r = resolve_der_dynamic_profile(
            der_kind="FW", converter_type="full_converter"
        )
        assert r.profile_id == "default_wind_type_4"

    def test_wind_unknown_converter_falls_back_to_type_4(self) -> None:
        r = resolve_der_dynamic_profile(der_kind="FW", converter_type=None)
        assert r.profile_id == "default_wind_type_4"

    def test_explicit_profile_id_wins_over_default(self) -> None:
        r = resolve_der_dynamic_profile(
            der_kind="PV", explicit_profile_id="default_pv_gfm"
        )
        assert r.profile_id == "default_pv_gfm"
        assert r.source == "explicit_profile_id"

    def test_catalog_dynamic_profile_id_wins_over_default(self) -> None:
        r = resolve_der_dynamic_profile(
            der_kind="BESS", catalog_dynamic_profile_id="default_bess_gfm"
        )
        assert r.profile_id == "default_bess_gfm"
        assert r.source == "catalog_entry_dynamic_profile_id"

    def test_explicit_unknown_falls_back_to_default(self) -> None:
        r = resolve_der_dynamic_profile(
            der_kind="PV", explicit_profile_id="nonexistent_profile"
        )
        assert r.profile_id == "default_pv_gfl"
        assert r.source == "default_per_kind"


class TestSolverParametersIntegration:
    """Profil produkuje parametry zgodne z kontraktem solverów."""

    def test_pv_to_stability_parameters_keys(self) -> None:
        params = DEFAULT_PV_GFL.to_stability_parameters()
        # Klucze konsumowane przez stability_rms.engine
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
        # ms → s konwersja
        assert (
            params["frt_response_time_s"]
            == DEFAULT_PV_GFL.frt_response_time_ms / 1000.0
        )

    def test_wind_type_3_to_stability_parameters(self) -> None:
        params = DEFAULT_WIND_TYPE_3.to_stability_parameters()
        assert "Tp" in params
        assert "Tq" in params
        assert "H" in params
        assert params["H"] == DEFAULT_WIND_TYPE_3.h_total_s

    def test_wind_type_1_uses_legacy_state(self) -> None:
        # Type 1 (SCIG) używa stanu omega_rotor (1 state size w engine)
        params = DEFAULT_WIND_TYPE_1.to_stability_parameters()
        assert "Tw" in params
        assert "omega_ref_pu" in params

    def test_stability_model_kind_mapping(self) -> None:
        assert DEFAULT_PV_GFL.stability_model_kind == "pv_inverter_grid_following"
        assert DEFAULT_PV_GFM.stability_model_kind == "pv_inverter_grid_forming"
        assert DEFAULT_BESS_GFL.stability_model_kind == "bess_pcs_grid_following"
        assert DEFAULT_BESS_GFM.stability_model_kind == "bess_pcs_grid_forming"
        assert DEFAULT_WIND_TYPE_3.stability_model_kind == "wind_type_3"


class TestCatalogEndToEndCoverage:
    """Każdy wpis katalogu PV/BESS musi mieć rozwiązywalny model dynamiczny."""

    def test_every_pv_inverter_resolves_to_dynamic_profile(self) -> None:
        catalog = get_default_mv_catalog()
        pv_inverters = catalog.list_pv_inverter_types()
        assert pv_inverters, "Katalog PV pusty — niespodziewane"

        unresolved: list[str] = []
        for pv in pv_inverters:
            r = resolve_der_dynamic_profile(
                der_kind="PV",
                catalog_dynamic_profile_id=pv.dynamic_profile_id,
                control_mode="grid_following",
            )
            if r.profile is None:  # type: ignore[unreachable]
                unresolved.append(pv.id)
        assert (
            unresolved == []
        ), f"PV bez modelu dynamicznego: {unresolved} — leftover production gap"

    def test_every_bess_inverter_resolves_to_dynamic_profile(self) -> None:
        catalog = get_default_mv_catalog()
        bess = catalog.list_bess_inverter_types()
        assert bess

        unresolved: list[str] = []
        for entry in bess:
            r = resolve_der_dynamic_profile(
                der_kind="BESS",
                catalog_dynamic_profile_id=entry.dynamic_profile_id,
            )
            if r.profile is None:  # type: ignore[unreachable]
                unresolved.append(entry.id)
        assert unresolved == []

    def test_every_wind_turbine_has_default_dynamic_profile(self) -> None:
        from src.network_model.catalog.wind_turbines.catalog import (
            list_wind_turbines,
        )

        turbines = list_wind_turbines()
        assert turbines, "Katalog turbin wiatrowych pusty"

        for t in turbines:
            r = resolve_der_dynamic_profile(
                der_kind="FW",
                catalog_dynamic_profile_id=t.dynamic_profile_id,
                converter_type=t.converter_type,
            )
            assert r.profile is not None  # type: ignore[unreachable]
            # Mapowanie converter_type → IEC type:
            expected_iec = {
                "SCIG": "type_1",
                "WRIG": "type_2",
                "hydraulic": "type_2",
                "DFIG": "type_3",
                "full_converter": "type_4",
            }[t.converter_type]
            # tylko gdy nie jest podany explicit dynamic_profile_id
            if t.dynamic_profile_id is None:
                assert (
                    r.profile.iec_type  # type: ignore[union-attr]
                    == expected_iec
                ), f"Turbina {t.catalog_id} ({t.converter_type}) → {r.profile_id} (expected {expected_iec})"


class TestProfileDirectAccess:
    """API get_profile + list_all_profile_ids."""

    def test_list_returns_all_profiles(self) -> None:
        ids = list_all_profile_ids()
        assert len(ids) == 8
        # Deterministyczna kolejność
        assert ids == sorted(ids)

    def test_get_profile_by_id(self) -> None:
        p = get_profile("default_pv_gfl")
        assert isinstance(p, InverterDynamicProfile)
        assert p.profile_id == "default_pv_gfl"

    def test_get_unknown_profile_raises(self) -> None:
        with pytest.raises(KeyError):
            get_profile("unknown_profile_id")
