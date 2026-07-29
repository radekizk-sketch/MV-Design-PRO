"""Testy końcówki API symulacji odpowiedzi źródła na polecenie OSD — D7.

Kontrakt GET z parametrami run_id + source_ref + command (+ parametry polecenia),
determinizm dwóch wywołań oraz błędy 404 (brak przebiegu) / 422 (zły rodzaj
analizy, nieznane źródło, nieznane polecenie, brak wymaganego parametru).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

OSD = "/api/oze-analysis/osd-response"
SOURCE = "gen_sync"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _pf_run_id():
    set_enm("c-pf", build_golden_enm())
    return execute_run(create_run(case_id="c-pf", analysis_type="PF").id).id


def _sc_run_id():
    set_enm("c-sc", build_golden_enm())
    return execute_run(create_run(case_id="c-sc", analysis_type="short_circuit_sn").id).id


def test_osd_response_returns_view(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        OSD,
        params={
            "run_id": str(run_id),
            "source_ref": SOURCE,
            "command": "ograniczenie_p",
            "p_limit_pct": 50,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["analysis"] == "osd_response"
    assert data["source"]["p_setpoint_after_mw"] == 1.0
    assert data["nodes"]
    assert {"p_before_mw", "p_after_mw", "p_delta_mw"} <= set(data["losses"])


def test_osd_response_lfsm_o(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        OSD,
        params={
            "run_id": str(run_id),
            "source_ref": SOURCE,
            "command": "lfsm_o",
            "frequency_hz": 50.5,
            "droop_pct": 5.0,
            "deadband_hz": 0.2,
        },
    )
    assert resp.status_code == 200
    src = resp.json()["source"]
    assert src["p_setpoint_after_mw"] < src["p_setpoint_before_mw"]


def test_osd_response_is_deterministic(app_client) -> None:
    run_id = _pf_run_id()
    params = {
        "run_id": str(run_id),
        "source_ref": SOURCE,
        "command": "moc_bierna",
        "q_mvar": 1.2,
    }
    first = app_client.get(OSD, params=params).json()
    second = app_client.get(OSD, params=params).json()
    assert first == second
    assert first["input_hash"] == second["input_hash"]


def test_osd_response_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(
        OSD,
        params={
            "run_id": str(uuid4()),
            "source_ref": SOURCE,
            "command": "ograniczenie_p",
            "p_limit_pct": 50,
        },
    )
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_osd_response_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(
        OSD,
        params={
            "run_id": str(run_id),
            "source_ref": SOURCE,
            "command": "ograniczenie_p",
            "p_limit_pct": 50,
        },
    )
    assert resp.status_code == 422
    assert "przebiegu rozpływu" in resp.json()["detail"]


def test_osd_response_unknown_source_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        OSD,
        params={
            "run_id": str(run_id),
            "source_ref": "brak",
            "command": "ograniczenie_p",
            "p_limit_pct": 50,
        },
    )
    assert resp.status_code == 422
    assert "źródło nie istnieje" in resp.json()["detail"]


def test_osd_response_unknown_command_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        OSD,
        params={"run_id": str(run_id), "source_ref": SOURCE, "command": "cokolwiek"},
    )
    assert resp.status_code == 422
    assert "Nieznany rodzaj polecenia" in resp.json()["detail"]


def test_osd_response_missing_source_ref_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(OSD, params={"run_id": str(run_id), "command": "ograniczenie_p"})
    # Brak wymaganego parametru source_ref → walidacja FastAPI (422).
    assert resp.status_code == 422
