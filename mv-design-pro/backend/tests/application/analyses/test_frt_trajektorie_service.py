"""Testy serwisu trajektorii FRT/HVRT z obwiednią profilu operatora (D6).

Warstwa APPLICATION — bieg FROZEN solvera FRT/HVRT + obwiednia z profilu NC RfG.

Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): dawne werdykty „w obwiedni" /
„poza obwiednią" / „moduł wypadł" z pól solvera (stayed_connected / margin_to_curve_pu)
były tautologią — napięcie trajektorii jest ZADANE profilem wejściowym, a margines to
min(v − 0,05) wobec tego profilu, nie wobec krzywej operatora. Każdy scenariusz niesie
teraz rekord ``NIE_OCENIONO`` (``ocena``), a pola solvera zostają materiałem audytowym.
Intencja zachowana: trajektoria, obwiednia, echo wejścia, wywód, determinizm, granica
``no_module`` i stopień dowodowy — bez zmian; testy werdyktu ODWRÓCONE (żadna kombinacja
pól solvera nie daje werdyktu).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from application.analyses.frt_trajektorie import (
    BRAKI_OCENY_FRT,
    KOD_GOTOWOSCI_BRAK_MODELU_DYNAMICZNEGO,
    POWOD_BRAKU_OCENY_FRT_PL,
    WERDYKT_NIE_OCENIONO_PL,
    build_frt_trajectories_view,
)
from catalog.profiles.nc_rfg.loader import load_nc_rfg_profile
from network_model.catalog.types import ConverterKind, ConverterType
from network_model.solvers.frt_hvrt.contracts import (
    FrtHvrtResult,
    FrtScenarioResult,
    FrtTrajectoryPoint,
)

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


def _scenario_result(
    scenario_id: str, stayed_connected: bool, margin: float | None
) -> FrtScenarioResult:
    return FrtScenarioResult(
        scenario_id=scenario_id,
        status="ok" if stayed_connected else "der_dropped",
        stayed_connected=stayed_connected,
        trajectory=[
            FrtTrajectoryPoint(time_s=0.0, voltage_pu=1.0, iq_reactive_pu=0.0, p_active_pu=1.0)
        ],
        margin_to_curve_pu=margin,
    )


# ILOCZYN CECH: rodzaj testu × pola solvera (utrzymanie w pracy × znak marginesu × brak
# marginesu). Dawniej każda kombinacja dawała werdykt („w obwiedni" / „poza obwiednią" /
# „moduł wypadł"); teraz ŻADNA — pola solvera zostają audytem, ocena NIE_OCENIONO.
@pytest.mark.parametrize("kind", ["lvrt", "hvrt"])
@pytest.mark.parametrize(
    ("stayed_connected", "margin"),
    [(False, 0.5), (True, -0.1), (True, 0.0), (True, None)],
)
def test_solver_fields_never_produce_a_verdict(
    kind: str, stayed_connected: bool, margin: float | None
) -> None:
    scenario_id = f"{kind}_conv-test-der"
    with patch(
        "application.analyses.frt_trajektorie.FrtHvrtSolverAdapter.run",
        return_value=FrtHvrtResult(
            status="ok" if stayed_connected else "der_dropped",
            scenario_results=[_scenario_result(scenario_id, stayed_connected, margin)],
        ),
    ):
        view = build_frt_trajectories_view(_converter(), _PROFILE, kind)
    sc = view["scenariusze"][0]
    assert sc["werdykt_pl"] == WERDYKT_NIE_OCENIONO_PL
    assert sc["ocena"]["status_maszynowy"] == "NIE_OCENIONO"
    assert sc["ocena"]["kryterium_id"] == f"frt_hvrt.{kind}.conv-test-der.{scenario_id}"
    for brak in BRAKI_OCENY_FRT:
        assert brak in sc["ocena"]["wyjasnienie"]["czego_brakuje"]
    # Pola solvera zostają (materiał audytowy), bez interpretacji.
    assert sc["stayed_connected"] is stayed_connected
    assert sc["margin_to_curve_pu"] == margin
    assert view["ocena"]["status_maszynowy"] == "NIE_OCENIONO"
    assert view["ocena"]["kryterium_id"] == f"frt_hvrt.{kind}.conv-test-der"


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


# ---------------------------------------------------------------------------
# Wywod dyplomowy per scenariusz (zasada wywodow KaTeX 2026-07-22)
# ---------------------------------------------------------------------------


def test_wywod_echo_character_and_reason_without_margin_or_verdict() -> None:
    """Intencja zachowana: wywód {tekst, latex} per scenariusz, echo wejścia solvera na
    początku. Zmiana kanonu: bez wzoru i podstawienia marginesu (tautologia wobec profilu
    wejściowego) i bez kroku „Werdykt:" — ostatni krok podaje powód braku oceny."""
    view = build_frt_trajectories_view(_converter(), _PROFILE, "lvrt")
    sc = view["scenariusze"][0]
    kroki = sc["wywod"]
    assert kroki and all(set(k) == {"tekst", "latex"} for k in kroki)
    assert all(k["latex"] is None for k in kroki)
    # K10: asercja na semantykę kroku (echo wejścia solvera), nie na nazwę kontraktu.
    # Karta #145: scenariusz nazwany parametrami próby (zapad, głębokość, czas), po polsku.
    assert kroki[0]["tekst"].startswith("Scenariusz próby: zapad napięcia (LVRT)")
    assert "parametry wejściowe próby" in kroki[0]["tekst"]
    assert any("zadane profilem wejściowym" in k["tekst"] for k in kroki)
    assert kroki[-1]["tekst"] == f"Ocena niewykonana: {POWOD_BRAKU_OCENY_FRT_PL}."
    assert not any(k["tekst"].startswith("Werdykt:") for k in kroki)
    assert not any("m_{U}" in (k["latex"] or "") for k in kroki)


def test_no_module_status_mapped_to_blocked_at_boundary() -> None:
    """Karta S-4 (W6-0): status solvera FROZEN `no_module` NIGDY nie dociera
    do FE — mapowany NA GRANICY aplikacyjnej na `blocked` z nazwanym kodem
    gotowości (`der.dynamic_profile_missing`, istniejący w rejestrze).
    Solver deklaruje `no_module` w kontrakcie `FrtHvrtStatus` mimo że dziś
    nigdy go nie zwraca — ten test wymusza gałąź granicy niezależnie od
    aktualnego zachowania silnika (bezpiecznik przyszłościowy)."""
    converter = _converter()
    with patch(
        "application.analyses.frt_trajektorie.FrtHvrtSolverAdapter.run",
        return_value=FrtHvrtResult(
            status="no_module",
            no_module_reason_pl="Brak zdefiniowanego profilu dynamicznego DER.",
        ),
    ):
        view = build_frt_trajectories_view(converter, _PROFILE, "lvrt")
    assert view["status_solvera"] == "blocked"
    assert view["kod_gotowosci"] == KOD_GOTOWOSCI_BRAK_MODELU_DYNAMICZNEGO
    assert view["missing_fields_pl"] == ["Brak zdefiniowanego profilu dynamicznego DER."]
    assert view["scenariusze"] == []
    assert "no_module" not in str(view)


def test_ocena_dowodowa_trajektorii_unvalidated_model() -> None:
    """Karta S-1 §0.9: trajektoria FRT/HVRT niesie stopień dowodowy — dziś
    UNVALIDATED_MODEL (funkcja zadana, nie rozwiązanie sieci), nieprzydatny
    jako dowód regulacyjny."""
    view = build_frt_trajectories_view(_converter(), _PROFILE, "lvrt")
    assert view["ocena_dowodowa"]["capability_id"] == "frt_hvrt.trajectory"
    assert view["ocena_dowodowa"]["tier"] == "UNVALIDATED_MODEL"
    assert view["ocena_dowodowa"]["regulatory_evidence_eligible"] is False
