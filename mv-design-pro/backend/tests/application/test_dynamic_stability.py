"""Tor „stabilność po wyłączeniu zwarcia" — echo scenariusza bez werdyktu progowego.

Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): dawny oceniacz
(`evaluate_fault_clear_dynamic_stability`) porównywał kąty mocy, napięcie i częstotliwość
WPISANE przez użytkownika z progami z opcji biegu (`DynamicStabilityThresholds`) i zwracał
STABLE/UNSTABLE, indeks stabilności, czynnik ograniczający i margines czasu wyłączenia —
liczba wpisana wracała jako „wynik". Oceniacz i progi skasowane; testy werdyktu
ODWRÓCONE: dane „stabilne" i „niestabilne" dają to samo `NIE_OCENIONO` z rekordem oceny.
Intencja zachowana: kanoniczne elementy wyłączające, determinizm, walidacja scenariusza.
"""

from __future__ import annotations

import application.stability.dynamic_stability as modul_stabilnosci
import pytest
from application.stability.dynamic_stability import (
    BRAKI_OCENY_STABILNOSCI,
    WERSJA_KONTRAKTU_ECHA,
    FaultClearScenario,
    FaultClearSourceState,
    echo_scenariusza_stabilnosci,
)

#: Pola dawnego werdyktu progowego — echo nie niesie żadnego z nich.
_POLA_WERDYKTU = (
    "stable",
    "checks",
    "violated_checks",
    "limiting_factor",
    "stability_index",
    "clearing_margin_ms",
    "max_clearing_time_ms",
    "angle_swing_deg",
    "criteria_version",
    "threshold_criteria",
)


def _scenario(
    *,
    scenario_id: str,
    clearing_time_ms: float,
    during_fault_angle_deg: float,
    post_fault_angle_deg: float,
    post_fault_voltage_pu: float,
    post_fault_frequency_pu: float,
) -> FaultClearScenario:
    return FaultClearScenario(
        scenario_id=scenario_id,
        faulted_element_id="line-01",
        clearing_time_ms=clearing_time_ms,
        cleared_by_element_ids=("cb-b", "cb-a", "cb-a"),
        source_state=FaultClearSourceState(
            source_id="src-main",
            pre_fault_angle_deg=10.0,
            during_fault_angle_deg=during_fault_angle_deg,
            post_fault_angle_deg=post_fault_angle_deg,
            post_fault_voltage_pu=post_fault_voltage_pu,
            post_fault_frequency_pu=post_fault_frequency_pu,
        ),
    )


#: Dawniej STABLE (indeks 0,664583) i UNSTABLE (wszystkie cztery kryteria naruszone).
_DANE_STABILNE = _scenario(
    scenario_id="dyn-001",
    clearing_time_ms=120.0,
    during_fault_angle_deg=75.0,
    post_fault_angle_deg=28.0,
    post_fault_voltage_pu=0.97,
    post_fault_frequency_pu=0.99,
)
_DANE_NIESTABILNE = _scenario(
    scenario_id="dyn-002",
    clearing_time_ms=190.0,
    during_fault_angle_deg=165.0,
    post_fault_angle_deg=150.0,
    post_fault_voltage_pu=0.90,
    post_fault_frequency_pu=0.97,
)


@pytest.mark.parametrize(
    "scenario", [_DANE_STABILNE, _DANE_NIESTABILNE], ids=["stabilne", "niestabilne"]
)
def test_echo_has_no_verdict_for_any_entered_values(scenario: FaultClearScenario) -> None:
    echo = echo_scenariusza_stabilnosci(scenario).to_dict()

    assert echo["status"] == "NIE_OCENIONO"
    assert echo["contract_version"] == WERSJA_KONTRAKTU_ECHA
    for pole in _POLA_WERDYKTU:
        assert pole not in echo, pole
    ocena = echo["ocena"]
    assert ocena["status_maszynowy"] == "NIE_OCENIONO"
    assert ocena["kryterium_id"] == f"dynamic_stability.fault_clear.{scenario.scenario_id}"
    for brak in BRAKI_OCENY_STABILNOSCI:
        assert brak in ocena["wyjasnienie"]["czego_brakuje"]
    # Wartości wpisane wracają BEZ zmian jako echo i jako dane przyjęte bez walidacji.
    zrodlo = scenario.source_state
    assert echo["clearing_time_ms"] == scenario.clearing_time_ms
    assert echo["during_fault_angle_deg"] == zrodlo.during_fault_angle_deg
    assert echo["post_fault_angle_deg"] == zrodlo.post_fault_angle_deg
    assert echo["post_fault_voltage_pu"] == zrodlo.post_fault_voltage_pu
    assert echo["post_fault_frequency_pu"] == zrodlo.post_fault_frequency_pu
    assert ocena["dowod"]["status_danych"]["stan"] == "UNVALIDATED_INPUT"
    przyjete = {
        dana["nazwa_pl"]: dana["wartosc"]["wartosc"]
        for dana in ocena["dowod"]["status_danych"]["dane_przyjete"]
    }
    assert przyjete["czas wyłączenia zwarcia"] == scenario.clearing_time_ms
    assert przyjete["kąt mocy w czasie zwarcia"] == zrodlo.during_fault_angle_deg


def test_echo_canonicalizes_clearing_elements() -> None:
    echo = echo_scenariusza_stabilnosci(_DANE_STABILNE)
    assert echo.cleared_by_element_ids == ("cb-a", "cb-b")


def test_echo_is_deterministic() -> None:
    first = echo_scenariusza_stabilnosci(_DANE_STABILNE).to_dict()
    second = echo_scenariusza_stabilnosci(_DANE_STABILNE).to_dict()
    assert first == second


def test_module_has_no_threshold_evaluator() -> None:
    """Progi i oceniacz progowy skasowane — nie ma czego „edytować", bo nie ma oceny."""
    for nazwa in (
        "DynamicStabilityThresholds",
        "evaluate_fault_clear_dynamic_stability",
        "DynamicStabilityResult",
    ):
        assert not hasattr(modul_stabilnosci, nazwa), nazwa


def test_fault_clear_requires_clearing_path() -> None:
    with pytest.raises(ValueError, match="cleared_by_element_ids"):
        FaultClearScenario(
            scenario_id="dyn-003",
            faulted_element_id="line-03",
            clearing_time_ms=100.0,
            cleared_by_element_ids=(),
            source_state=FaultClearSourceState(
                source_id="src-main",
                pre_fault_angle_deg=0.0,
                during_fault_angle_deg=10.0,
                post_fault_angle_deg=5.0,
                post_fault_voltage_pu=1.0,
                post_fault_frequency_pu=1.0,
            ),
        )
