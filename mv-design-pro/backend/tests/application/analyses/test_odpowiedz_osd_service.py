"""Testy serwisu symulacji odpowiedzi źródła na polecenie OSD — D7.

Zakres: dwa biegi rozpływu (bazowy + z poleceniem) na golden network; polecenia
ograniczenia P, zadanej Q, cosφ oraz LFSM-O/U; porównanie bieg-vs-bieg (wartości
z solvera, bez liczenia wzorem w teście), determinizm, hash oraz błędy
rodzaju/statusu/źródła/polecenia.

ZERO nowej fizyki: rozpływ liczy istniejący solver przez istniejącą ścieżkę
(``_execute_power_flow``); nastaw P dla LFSM wylicza solverowy ``lfsm_factor``
(reużycie, nie autorstwo). Modyfikacja WYŁĄCZNIE w kopii snapshotu w pamięci.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analyses.odpowiedz_osd import build_osd_response_view
from enm.canonical_analysis import (
    CanonicalRun,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

SOURCE = "gen_sync"  # golden: generator synchroniczny na bus_sn_c (P=2.0, Q=0.6)


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _golden_pf_run() -> CanonicalRun:
    set_enm("c-pf", build_golden_enm())
    return execute_run(create_run(case_id="c-pf", analysis_type="PF").id)


def _synthetic_run(
    enm: EnergyNetworkModel, *, status: str = "FINISHED", analysis_type: str = "PF"
) -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
    )


# --------------------------------------------------------------------------
# Struktura
# --------------------------------------------------------------------------


def test_view_structure() -> None:
    run = _golden_pf_run()
    assert run.status == "FINISHED", run.error_message
    view = build_osd_response_view(run, source_ref=SOURCE, command="ograniczenie_p", p_limit_pct=50)
    assert view["analysis"] == "osd_response"
    assert view["context"]["run_id"] == str(run.id)
    assert {"parameters", "input_hash", "source", "nodes", "losses", "whitebox"} <= set(view)
    assert view["source"]["ref_id"] == SOURCE
    assert view["source"]["bus_ref"] == "bus_sn_c"
    assert view["nodes"], "oczekiwano napięć węzłowych"
    node = view["nodes"][0]
    assert {"bus_ref", "bus_name", "v_before_pu", "v_after_pu", "v_delta_pu"} <= set(node)
    assert {"p_before_mw", "p_after_mw", "p_delta_mw"} <= set(view["losses"])
    assert {"baseline_run", "commanded_run", "overridden"} <= set(view["whitebox"])


# --------------------------------------------------------------------------
# Polecenie: ograniczenie mocy czynnej
# --------------------------------------------------------------------------


def test_p_limit_reduces_setpoint() -> None:
    run = _golden_pf_run()
    view = build_osd_response_view(run, source_ref=SOURCE, command="ograniczenie_p", p_limit_pct=50)
    src = view["source"]
    assert src["p_setpoint_before_mw"] == 2.0
    assert src["p_setpoint_after_mw"] == 1.0  # 50% z 2.0 MW
    assert src["q_setpoint_after_mvar"] == src["q_setpoint_before_mvar"]
    assert view["parameters"]["overridden"] == {"p_limit_pct": 50.0}


def test_p_limit_network_responds_from_solver() -> None:
    """Porównanie bieg-vs-bieg: obcięcie generacji zmniejsza wstrzyknięcie szyny
    źródła policzone przez solver (nie liczymy wzorem)."""
    run = _golden_pf_run()
    view = build_osd_response_view(run, source_ref=SOURCE, command="ograniczenie_p", p_limit_pct=50)
    src = view["source"]
    assert src["bus_p_injected_after_mw"] < src["bus_p_injected_before_mw"]
    assert view["whitebox"]["baseline_run"]["converged"] is True
    assert view["whitebox"]["commanded_run"]["converged"] is True


# --------------------------------------------------------------------------
# Polecenie: zadana Q / cosφ
# --------------------------------------------------------------------------


def test_moc_bierna_sets_q() -> None:
    run = _golden_pf_run()
    view = build_osd_response_view(run, source_ref=SOURCE, command="moc_bierna", q_mvar=1.5)
    src = view["source"]
    assert src["q_setpoint_after_mvar"] == 1.5
    assert src["p_setpoint_after_mw"] == src["p_setpoint_before_mw"]
    # Solver widzi zmienione wstrzyknięcie Q na szynie źródła.
    assert src["bus_q_injected_after_mvar"] > src["bus_q_injected_before_mvar"]


def test_cosfi_overexcited_positive_q() -> None:
    run = _golden_pf_run()
    view = build_osd_response_view(
        run, source_ref=SOURCE, command="cosfi", cos_phi=0.95, q_charakter="nadwzbudny"
    )
    src = view["source"]
    assert src["q_setpoint_after_mvar"] > 0.0
    assert src["p_setpoint_after_mw"] == src["p_setpoint_before_mw"]


def test_cosfi_underexcited_negative_q() -> None:
    run = _golden_pf_run()
    view = build_osd_response_view(
        run, source_ref=SOURCE, command="cosfi", cos_phi=0.95, q_charakter="podwzbudny"
    )
    assert view["source"]["q_setpoint_after_mvar"] < 0.0


# --------------------------------------------------------------------------
# Polecenie: LFSM-O / LFSM-U
# --------------------------------------------------------------------------


def test_lfsm_o_reduces_p_above_deadband() -> None:
    """f > f0 + deadband → P spada wg statyzmu. Porównanie bieg-vs-bieg: nastaw i
    wstrzyknięcie po są mniejsze niż przed (wartości z solvera)."""
    run = _golden_pf_run()
    view = build_osd_response_view(
        run,
        source_ref=SOURCE,
        command="lfsm_o",
        frequency_hz=50.5,
        droop_pct=5.0,
        deadband_hz=0.2,
    )
    src = view["source"]
    assert src["p_setpoint_after_mw"] < src["p_setpoint_before_mw"]
    assert src["bus_p_injected_after_mw"] < src["bus_p_injected_before_mw"]
    assert 0.0 < view["parameters"]["overridden"]["lfsm_factor"] < 1.0


def test_lfsm_o_inside_deadband_no_change() -> None:
    run = _golden_pf_run()
    view = build_osd_response_view(
        run,
        source_ref=SOURCE,
        command="lfsm_o",
        frequency_hz=50.1,
        droop_pct=5.0,
        deadband_hz=0.2,
    )
    src = view["source"]
    assert src["p_setpoint_after_mw"] == src["p_setpoint_before_mw"]
    assert view["parameters"]["overridden"]["lfsm_factor"] == 1.0


def test_lfsm_u_raises_p_below_deadband() -> None:
    run = _golden_pf_run()
    view = build_osd_response_view(
        run,
        source_ref=SOURCE,
        command="lfsm_u",
        frequency_hz=49.5,
        droop_pct=5.0,
        deadband_hz=0.2,
    )
    src = view["source"]
    assert src["p_setpoint_after_mw"] > src["p_setpoint_before_mw"]
    assert view["parameters"]["overridden"]["lfsm_factor"] > 1.0


# --------------------------------------------------------------------------
# Determinizm i hash
# --------------------------------------------------------------------------


def test_deterministic_two_calls() -> None:
    run = _golden_pf_run()
    first = build_osd_response_view(
        run, source_ref=SOURCE, command="ograniczenie_p", p_limit_pct=60
    )
    second = build_osd_response_view(
        run, source_ref=SOURCE, command="ograniczenie_p", p_limit_pct=60
    )
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_input_hash_changes_with_command() -> None:
    run = _golden_pf_run()
    a = build_osd_response_view(run, source_ref=SOURCE, command="ograniczenie_p", p_limit_pct=50)
    b = build_osd_response_view(run, source_ref=SOURCE, command="ograniczenie_p", p_limit_pct=70)
    assert a["input_hash"] != b["input_hash"]


def test_json_serializable() -> None:
    run = _golden_pf_run()
    view = build_osd_response_view(run, source_ref=SOURCE, command="moc_bierna", q_mvar=0.8)
    assert len(json.dumps(view, sort_keys=True)) > 100


# --------------------------------------------------------------------------
# Błędy (komunikaty PL)
# --------------------------------------------------------------------------


def test_unknown_source_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="źródło nie istnieje"):
        build_osd_response_view(run, source_ref="brak", command="ograniczenie_p", p_limit_pct=50)


def test_unknown_command_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="Nieznany rodzaj polecenia"):
        build_osd_response_view(run, source_ref=SOURCE, command="cokolwiek")


def test_p_limit_missing_pct_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="p_limit_pct"):
        build_osd_response_view(run, source_ref=SOURCE, command="ograniczenie_p")


def test_moc_bierna_missing_q_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="q_mvar"):
        build_osd_response_view(run, source_ref=SOURCE, command="moc_bierna")


def test_cosfi_missing_charakter_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="q_charakter"):
        build_osd_response_view(run, source_ref=SOURCE, command="cosfi", cos_phi=0.95)


def test_lfsm_missing_frequency_raises() -> None:
    run = _golden_pf_run()
    with pytest.raises(ValueError, match="frequency_hz"):
        build_osd_response_view(run, source_ref=SOURCE, command="lfsm_o", droop_pct=5.0)


def test_rejects_non_pf_run() -> None:
    run = _synthetic_run(build_golden_enm(), analysis_type="short_circuit_sn")
    with pytest.raises(ValueError, match="przebiegu rozpływu"):
        build_osd_response_view(run, source_ref=SOURCE, command="ograniczenie_p", p_limit_pct=50)


def test_rejects_unfinished_run() -> None:
    run = _synthetic_run(build_golden_enm(), status="RUNNING")
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_osd_response_view(run, source_ref=SOURCE, command="ograniczenie_p", p_limit_pct=50)
