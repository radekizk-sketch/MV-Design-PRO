"""FAB-E: testy odtworzenia PowerFlowResult w build_power_flow_interpretation.

Brak pola WYNIKU rozpływu (v_pu/angle_deg/p_from_mw/...) w zapisanym
``result_v1`` NIE jest liczbą 0 — element bez danej wartości musi zniknąć z
odtworzonego ``PowerFlowResult`` (nie dostać sfabrykowanego zera), żeby
``PowerFlowInterpretationBuilder`` (analysis layer) go po prostu pominął
zamiast wydać fałszywą, ekstremalną obserwację (np. "napięcie 0.0 pu -
znacznie obniżone - istotny problem" dla szyny bez danych).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from api.canonical_run_views import build_power_flow_interpretation
from enm.canonical_analysis import CanonicalRun


def _run(result_v1: dict[str, Any]) -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type="PF",
        status="FINISHED",
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot={},
        validation={},
        readiness={},
        raw_result={"result_v1": result_v1},
    )


def _base_result_v1(**overrides: Any) -> dict[str, Any]:
    result_v1: dict[str, Any] = {
        "converged": True,
        "iterations_count": 4,
        "tolerance_used": 1e-6,
        "base_mva": 100.0,
        "slack_bus_id": "bus_slack",
        "bus_results": [
            {"bus_id": "bus_a", "v_pu": 1.01, "angle_deg": 0.5},
            {"bus_id": "bus_b", "v_pu": 0.98, "angle_deg": -0.3},
        ],
        "branch_results": [
            {
                "branch_id": "branch_1",
                "p_from_mw": 1.0,
                "q_from_mvar": 0.2,
                "p_to_mw": -0.95,
                "q_to_mvar": -0.18,
            },
        ],
    }
    result_v1.update(overrides)
    return result_v1


def test_complete_result_produces_all_buses_and_branches() -> None:
    """Kontrola pozytywna: komplet danych — nic nie znika."""
    run = _run(_base_result_v1())
    interpretation = build_power_flow_interpretation(run)
    bus_ids = {f["bus_id"] for f in interpretation["voltage_findings"]}
    branch_ids = {f["branch_id"] for f in interpretation["branch_findings"]}
    assert bus_ids == {"bus_a", "bus_b"}
    assert branch_ids == {"branch_1"}


def test_missing_v_pu_drops_bus_not_fabricates_zero_voltage() -> None:
    """FAB-E (E1): brak v_pu nie jest napieciem 0.0 pu.

    Szyna bez ``v_pu`` w wierszu wyniku PF musi zniknac z obserwacji
    napieciowych — przed poprawka dostawalaby fikcyjne 0.0 pu, co
    interpretacja klasyfikuje jako "znacznie obnizone napiecie" (HIGH),
    czyli falszywy, najbardziej alarmujacy werdykt dla braku danych.
    """
    result_v1 = _base_result_v1(
        bus_results=[
            {"bus_id": "bus_a", "v_pu": 1.01, "angle_deg": 0.5},
            {"bus_id": "bus_b", "angle_deg": -0.3},  # v_pu celowo brak
        ]
    )
    run = _run(result_v1)
    interpretation = build_power_flow_interpretation(run)
    bus_ids = {f["bus_id"] for f in interpretation["voltage_findings"]}
    assert bus_ids == {"bus_a"}, "bus_b bez v_pu nie moze dostac sfabrykowanego 0.0 pu"


def test_missing_branch_q_from_mvar_drops_branch_not_fabricates_zero_power() -> None:
    """FAB-E (E1): brak q_from_mvar galezi nie jest moca zerowa."""
    result_v1 = _base_result_v1(
        branch_results=[
            {
                "branch_id": "branch_1",
                "p_from_mw": 1.0,
                # q_from_mvar celowo brak
                "p_to_mw": -0.95,
                "q_to_mvar": -0.18,
            },
        ]
    )
    run = _run(result_v1)
    interpretation = build_power_flow_interpretation(run)
    branch_ids = {f["branch_id"] for f in interpretation["branch_findings"]}
    assert branch_ids == set(), "galaz bez q_from_mvar nie moze dostac sfabrykowanej mocy 0"
