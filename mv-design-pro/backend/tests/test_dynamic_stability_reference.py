import json
from types import SimpleNamespace
from uuid import uuid4

from application.stability.dynamic_stability import (
    FaultClearScenario,
    FaultClearSourceState,
    evaluate_fault_clear_dynamic_stability,
)
from application.stability.voltage_trajectory import (
    TrajectoryGenerationParams,
    generate_voltage_trajectory,
)
from enm.canonical_analysis import (
    build_dynamic_stability_results,
    build_dynamic_stability_time_series,
)


def _stub_run_with_time_series() -> SimpleNamespace:
    """Bieg dynamic_stability z szeregiem czasowym w raw_result (jak z solvera)."""
    trajectory = generate_voltage_trajectory(
        TrajectoryGenerationParams(
            clearing_time_ms=120.0,
            post_fault_voltage_pu=0.97,
            post_fault_frequency_pu=0.99,
        )
    )
    return SimpleNamespace(
        id=uuid4(),
        analysis_type="dynamic_stability",
        raw_result={
            "analysis_type": "dynamic_stability",
            "result": {"status": "STABLE", "stability_index": 0.5},
            "time_series": {
                "time_unit": "s",
                "criteria_version": "dynamic_stability_fault_clear_v1",
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
        raw_result={"analysis_type": "dynamic_stability", "result": {"status": "STABLE"}},
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


def test_fault_clear_stability_reportable() -> None:
    scenario = FaultClearScenario(
        scenario_id="dyn-reference",
        faulted_element_id="bay-05",
        clearing_time_ms=90.0,
        cleared_by_element_ids=("breaker-05",),
        source_state=FaultClearSourceState(
            source_id="pv-01",
            pre_fault_angle_deg=8.0,
            during_fault_angle_deg=48.0,
            post_fault_angle_deg=18.0,
            post_fault_voltage_pu=0.98,
            post_fault_frequency_pu=0.995,
        ),
    )

    result = evaluate_fault_clear_dynamic_stability(scenario).to_dict()

    assert result["stable"] is True
    assert result["status"] == "STABLE"
    assert result["limiting_factor"] in {
        "clearing_time",
        "angle_swing",
        "voltage_recovery",
        "frequency_recovery",
    }
    assert result["violated_checks"] == []
    assert result["stability_index"] > 0.0


def test_fault_clear_stability_detects_instability() -> None:
    scenario = FaultClearScenario(
        scenario_id="dyn-unstable",
        faulted_element_id="bay-05",
        clearing_time_ms=220.0,
        cleared_by_element_ids=("breaker-05",),
        source_state=FaultClearSourceState(
            source_id="fw-01",
            pre_fault_angle_deg=5.0,
            during_fault_angle_deg=150.0,
            post_fault_angle_deg=140.0,
            post_fault_voltage_pu=0.82,
            post_fault_frequency_pu=0.95,
        ),
    )

    result = evaluate_fault_clear_dynamic_stability(scenario).to_dict()

    assert result["stable"] is False
    assert result["status"] == "UNSTABLE"
    assert "clearing_time" in result["violated_checks"]
    assert "angle_swing" in result["violated_checks"]
