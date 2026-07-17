"""Testy serwisu trajektorii FRT/HVRT z obwiednią profilu operatora (D6).

Warstwa APPLICATION — bieg FROZEN solvera FRT/HVRT + obwiednia z profilu NC RfG.
Werdykty PL WYŁĄCZNIE z pól solvera (stayed_connected / margin_to_curve_pu).
"""

from __future__ import annotations

import pytest
from application.analyses.frt_trajektorie import (
    _WERDYKT_MODUL_WYPADL,
    _WERDYKT_POZA_OBWIEDNIA,
    _WERDYKT_W_OBWIEDNI,
    _verdict_pl,
    build_frt_trajectories_view,
)
from catalog.profiles.nc_rfg.loader import load_nc_rfg_profile
from network_model.catalog.types import ConverterKind, ConverterType
from network_model.solvers.frt_hvrt.contracts import FrtScenarioResult, FrtTrajectoryPoint

_PROFILE = load_nc_rfg_profile("pse")


def _converter() -> ConverterType:
    return ConverterType(
        id="conv-test-der",
        name="Test DER",
        kind=ConverterKind.PV,
        un_kv=0.4,
        sn_mva=2.5,
        pmax_mw=2.0,
        qmin_mvar=-0.6,
        qmax_mvar=0.6,
    )


def test_lvrt_view_has_non_empty_trajectory() -> None:
    view = build_frt_trajectories_view(_converter(), _PROFILE, "lvrt")
    assert view["test_kind"] == "lvrt"
    assert view["scenariusze"]
    sc = view["scenariusze"][0]
    assert sc["trajektoria"]
    assert sc["liczba_punktow_trajektorii"] == len(sc["trajektoria"])
    first_point = sc["trajektoria"][0]
    assert {"czas_s", "napiecie_pu", "iq_bierny_pu", "p_czynna_pu"} <= set(first_point)


def test_hvrt_view_has_non_empty_trajectory() -> None:
    view = build_frt_trajectories_view(_converter(), _PROFILE, "hvrt")
    assert view["test_kind"] == "hvrt"
    assert view["scenariusze"][0]["trajektoria"]


def test_envelope_matches_operator_profile_lvrt() -> None:
    view = build_frt_trajectories_view(_converter(), _PROFILE, "lvrt")
    obwiednia = view["obwiednia_profilu"]["punkty"]
    expected = [
        {"czas_s": pt.time_s, "napiecie_pu": pt.voltage_pu} for pt in _PROFILE.voltage_levels.lvrt
    ]
    assert obwiednia == expected
    assert view["obwiednia_profilu"]["rodzaj"] == "lvrt"


def test_envelope_matches_operator_profile_hvrt() -> None:
    view = build_frt_trajectories_view(_converter(), _PROFILE, "hvrt")
    obwiednia = view["obwiednia_profilu"]["punkty"]
    expected = [
        {"czas_s": pt.time_s, "napiecie_pu": pt.voltage_pu} for pt in _PROFILE.voltage_levels.hvrt
    ]
    assert obwiednia == expected


def test_lvrt_echoes_solver_input_params() -> None:
    from application.ncrfg_compliance.frt_input import (
        FRT_FAULT_DURATION_S,
        LVRT_VOLTAGE_DIP_PU,
    )

    view = build_frt_trajectories_view(_converter(), _PROFILE, "lvrt")
    echo = view["scenariusze"][0]["wejscie_solvera"]
    assert echo["test_kind"] == "lvrt"
    assert echo["voltage_dip_depth_pu"] == LVRT_VOLTAGE_DIP_PU
    assert echo["fault_duration_s"] == FRT_FAULT_DURATION_S
    assert echo["target_der_ref"] == "conv-test-der"


def test_hvrt_echoes_solver_input_params() -> None:
    from application.ncrfg_compliance.frt_input import (
        FRT_FAULT_DURATION_S,
        HVRT_VOLTAGE_SWELL_PU,
    )

    view = build_frt_trajectories_view(_converter(), _PROFILE, "hvrt")
    echo = view["scenariusze"][0]["wejscie_solvera"]
    assert echo["test_kind"] == "hvrt"
    assert echo["voltage_dip_depth_pu"] == HVRT_VOLTAGE_SWELL_PU
    assert echo["fault_duration_s"] == FRT_FAULT_DURATION_S


def test_verdict_pl_is_from_solver_fields() -> None:
    view = build_frt_trajectories_view(_converter(), _PROFILE, "lvrt")
    werdykt = view["scenariusze"][0]["werdykt_pl"]
    assert werdykt in {
        _WERDYKT_W_OBWIEDNI,
        _WERDYKT_POZA_OBWIEDNIA,
        _WERDYKT_MODUL_WYPADL,
    }


def _scenario_result(stayed_connected: bool, margin: float | None) -> FrtScenarioResult:
    return FrtScenarioResult(
        scenario_id="s",
        status="ok" if stayed_connected else "der_dropped",
        stayed_connected=stayed_connected,
        trajectory=[
            FrtTrajectoryPoint(time_s=0.0, voltage_pu=1.0, iq_reactive_pu=0.0, p_active_pu=1.0)
        ],
        margin_to_curve_pu=margin,
    )


def test_verdict_pl_module_dropped() -> None:
    assert _verdict_pl(_scenario_result(False, 0.5)) == _WERDYKT_MODUL_WYPADL


def test_verdict_pl_outside_envelope_when_margin_negative() -> None:
    assert _verdict_pl(_scenario_result(True, -0.1)) == _WERDYKT_POZA_OBWIEDNIA


def test_verdict_pl_inside_envelope_when_margin_non_negative() -> None:
    assert _verdict_pl(_scenario_result(True, 0.0)) == _WERDYKT_W_OBWIEDNI
    assert _verdict_pl(_scenario_result(True, None)) == _WERDYKT_W_OBWIEDNI


def test_invalid_test_kind_raises_valueerror() -> None:
    with pytest.raises(ValueError, match="Nieznany rodzaj testu"):
        build_frt_trajectories_view(_converter(), _PROFILE, "xyz")


def test_deterministic_two_calls_identical() -> None:
    first = build_frt_trajectories_view(_converter(), _PROFILE, "lvrt")
    second = build_frt_trajectories_view(_converter(), _PROFILE, "lvrt")
    assert first == second


def test_der_and_operator_metadata_present() -> None:
    view = build_frt_trajectories_view(_converter(), _PROFILE, "lvrt")
    assert view["modul_der"]["id"] == "conv-test-der"
    assert view["modul_der"]["pmax_mw"] == pytest.approx(2.0)
    assert view["operator"]["id"] == "pse"
    assert view["operator"]["nazwa"] == _PROFILE.operator_name_pl
