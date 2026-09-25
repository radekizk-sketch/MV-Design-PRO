"""Odpowiedzi biegu `dynamic_stability`: wiersz wyniku (echo scenariusza) i przebieg zadany.

Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): wynik biegu to ECHO scenariusza
wpisanego przez użytkownika z rekordem oceny `NIE_OCENIONO` (dawniej STABLE/UNSTABLE z
porównania wpisanych kątów z progami); atrapy biegu niosą ten kształt. Intencja
zachowana: przebieg U(t)/f(t) na żądanie z jednostkami, determinizm, addytywność
odpowiedzi, rodzaj elementu ze snapshotu bez zgadywania.
"""

import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from application.stability.dynamic_stability import (
    WERSJA_KONTRAKTU_ECHA,
    FaultClearScenario,
    FaultClearSourceState,
    echo_scenariusza_stabilnosci,
)
from application.stability.voltage_trajectory import (
    TrajectoryGenerationParams,
    generate_voltage_trajectory,
)
from enm.canonical_analysis import (
    build_dynamic_stability_results,
    build_dynamic_stability_time_series,
)

#: Nazwy elementów migawki biegu (w ścieżce API indeks z `run.snapshot`, karta #144).
_NAZWY = {"pv-01": "Farma PV 1", "bay-05": "Pole liniowe 5"}


def _scenariusz(
    scenario_id: str,
    *,
    clearing_time_ms: float = 90.0,
    during_fault_angle_deg: float = 48.0,
    post_fault_angle_deg: float = 18.0,
    post_fault_voltage_pu: float = 0.98,
    post_fault_frequency_pu: float = 0.995,
) -> FaultClearScenario:
    return FaultClearScenario(
        scenario_id=scenario_id,
        faulted_element_id="bay-05",
        clearing_time_ms=clearing_time_ms,
        cleared_by_element_ids=("breaker-05",),
        source_state=FaultClearSourceState(
            source_id="pv-01",
            pre_fault_angle_deg=8.0,
            during_fault_angle_deg=during_fault_angle_deg,
            post_fault_angle_deg=post_fault_angle_deg,
            post_fault_voltage_pu=post_fault_voltage_pu,
            post_fault_frequency_pu=post_fault_frequency_pu,
        ),
    )


def _stub_run_with_time_series() -> SimpleNamespace:
    """Bieg dynamic_stability z szeregiem czasowym w raw_result (jak z solvera)."""
    trajectory = generate_voltage_trajectory(
        TrajectoryGenerationParams(
            clearing_time_ms=120.0,
            post_fault_voltage_pu=0.97,
            post_fault_frequency_pu=0.99,
            recovery_time_constant_s=0.3,
        )
    )
    return SimpleNamespace(
        id=uuid4(),
        analysis_type="dynamic_stability",
        raw_result={
            "analysis_type": "dynamic_stability",
            "result": echo_scenariusza_stabilnosci(
                _scenariusz("dyn-przebieg"), nazwy=_NAZWY
            ).to_dict(),
            "time_series": {
                "time_unit": "s",
                "contract_version": WERSJA_KONTRAKTU_ECHA,
                "quantities": [
                    {"key": "voltage_pu", "label_pl": "Napięcie", "unit": "p.u."},
                    {"key": "frequency_pu", "label_pl": "Częstotliwość", "unit": "p.u."},
                ],
                "points": [point.to_dict() for point in trajectory],
            },
        },
    )


def test_time_series_builder_exposes_waveform_with_units() -> None:
    payload = build_dynamic_stability_time_series(_stub_run_with_time_series())

    assert payload["has_time_series"] is True
    assert payload["time_unit"] == "s"
    keys = {q["key"] for q in payload["quantities"]}
    assert keys == {"voltage_pu", "frequency_pu"}
    units = {q["key"]: q["unit"] for q in payload["quantities"]}
    assert units == {"voltage_pu": "p.u.", "frequency_pu": "p.u."}
    assert len(payload["points"]) > 0
    first = payload["points"][0]
    assert set(first.keys()) == {"t_s", "voltage_pu", "frequency_pu"}


def test_time_series_builder_deterministic() -> None:
    first = build_dynamic_stability_time_series(_stub_run_with_time_series())
    second = build_dynamic_stability_time_series(_stub_run_with_time_series())
    # Run id różni się per stub — porównujemy sam przebieg (determinizm fizyki).
    assert json.dumps(first["points"], sort_keys=True) == json.dumps(
        second["points"], sort_keys=True
    )
    assert first["quantities"] == second["quantities"]


def test_time_series_builder_empty_for_legacy_run_without_series() -> None:
    """Starszy bieg (raw_result bez `time_series`) → uczciwy stan zerowy."""
    legacy = SimpleNamespace(
        id=uuid4(),
        analysis_type="dynamic_stability",
        raw_result={
            "analysis_type": "dynamic_stability",
            "result": echo_scenariusza_stabilnosci(
                _scenariusz("dyn-bez-przebiegu"), nazwy=_NAZWY
            ).to_dict(),
        },
    )
    payload = build_dynamic_stability_time_series(legacy)
    assert payload["has_time_series"] is False
    assert payload["points"] == []
    assert payload["quantities"] == []


def test_default_results_response_is_additive_byte_for_byte() -> None:
    """Dołożenie `time_series` do raw_result NIE zmienia domyślnej odpowiedzi
    wyników (wiersz FROZEN) — payload biegu z szeregiem i bez szeregu jest
    bajt-w-bajt identyczny, a klucz `time_series` nie wycieka do wiersza."""
    run_with = _stub_run_with_time_series()
    run_without = SimpleNamespace(
        id=run_with.id,
        analysis_type="dynamic_stability",
        raw_result={k: v for k, v in run_with.raw_result.items() if k != "time_series"},
    )
    payload_with = build_dynamic_stability_results(run_with)
    payload_without = build_dynamic_stability_results(run_without)
    assert json.dumps(payload_with, sort_keys=True) == json.dumps(payload_without, sort_keys=True)
    assert "time_series" not in payload_with["rows"][0]


# ILOCZYN CECH: dane „stabilne" / „niestabilne" (dawniej STABLE i UNSTABLE z naruszonymi
# kryteriami) × wiersz odpowiedzi wyników. Żadne dane nie dają werdyktu w wierszu.
@pytest.mark.parametrize(
    "scenario",
    [
        _scenariusz("dyn-reference"),
        _scenariusz(
            "dyn-unstable",
            clearing_time_ms=220.0,
            during_fault_angle_deg=150.0,
            post_fault_angle_deg=140.0,
            post_fault_voltage_pu=0.82,
            post_fault_frequency_pu=0.95,
        ),
    ],
    ids=["dane-stabilne", "dane-niestabilne"],
)
def test_results_row_has_no_verdict_for_any_entered_values(scenario: FaultClearScenario) -> None:
    run = SimpleNamespace(
        id=uuid4(),
        analysis_type="dynamic_stability",
        raw_result={
            "analysis_type": "dynamic_stability",
            "result": echo_scenariusza_stabilnosci(scenario, nazwy=_NAZWY).to_dict(),
        },
    )
    wiersz = build_dynamic_stability_results(run)["rows"][0]
    assert wiersz["status"] == "NIE_OCENIONO"
    assert wiersz["ocena"]["status_maszynowy"] == "NIE_OCENIONO"
    for pole in ("stable", "violated_checks", "limiting_factor", "stability_index"):
        assert pole not in wiersz, pole


def test_wynik_stabilnosci_niesie_rodzaj_elementu_ze_snapshotu() -> None:
    """Karta F-K4 faza 3: bez RODZAJU elementu petla decyzji nie ma jak zaznaczyc
    elementu w modelu. Rodzaj pochodzi ze snapshotu biegu, nie ze zgadywania."""
    run = SimpleNamespace(
        id=uuid4(),
        analysis_type="dynamic_stability",
        raw_result={
            "analysis_type": "dynamic_stability",
            "result": {
                "status": "NIE_OCENIONO",
                "source_id": "gen-oze-1",
                "faulted_element_id": "szyna-sn-2",
            },
        },
        snapshot={
            "generators": [{"ref_id": "gen-oze-1"}],
            "buses": [{"ref_id": "szyna-sn-2"}],
        },
    )

    wiersz = build_dynamic_stability_results(run)["rows"][0]

    assert wiersz["source_kind"] == "generator"
    assert wiersz["faulted_element_kind"] == "szyna"


def test_identyfikator_poza_snapshotem_nie_dostaje_rodzaju() -> None:
    """Zero zgadywania: brak elementu w modelu => brak rodzaju => UI nie oferuje drogi."""
    run = SimpleNamespace(
        id=uuid4(),
        analysis_type="dynamic_stability",
        raw_result={
            "analysis_type": "dynamic_stability",
            "result": {"status": "NIE_OCENIONO", "source_id": "zrodlo-ktorego-nie-ma"},
        },
        snapshot={"buses": [{"ref_id": "szyna-1"}]},
    )

    wiersz = build_dynamic_stability_results(run)["rows"][0]

    assert wiersz["source_kind"] is None
    assert wiersz["faulted_element_kind"] is None
