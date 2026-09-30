"""Testy końcówki API obszaru bezpiecznej pracy P–Q węzła — D5.

Kontrakt GET z parametrami run_id + bus_ref (+ opcjonalne step/max_steps),
determinizm dwóch wywołań oraz błędy 404 (brak przebiegu) / 422 (zły rodzaj
analizy, nieznany węzeł, złe parametry, brak bus_ref).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

PQ_AREA = "/api/oze-analysis/pq-area"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _pf_run_id():
    set_enm("c-pf", build_golden_enm())
    return execute_run(create_run(case_id="c-pf", klucz_twin="c-pf", analysis_type="PF").id).id


def _sc_run_id():
    set_enm("c-sc", build_golden_enm())
    return execute_run(
        create_run(case_id="c-sc", klucz_twin="c-sc", analysis_type="short_circuit_sn").id
    ).id


def test_pq_area_returns_view(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        PQ_AREA,
        params={"run_id": str(run_id), "bus_ref": "bus_sn_c", "max_steps_p": 3, "max_steps_q": 3},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["analysis"] == "pq_area"
    assert data["bus_ref"] == "bus_sn_c"
    assert data["vertices"]
    vertex = data["vertices"][0]
    assert {"p_mw", "feasible", "q_min_dop_mvar", "q_max_dop_mvar", "runs"} <= set(vertex)
    assert vertex["binding_high"]["kind"] in {"loading", "voltage", "none", "non_convergence"}


def test_pq_area_is_deterministic(app_client) -> None:
    run_id = _pf_run_id()
    params = {"run_id": str(run_id), "bus_ref": "bus_sn_c", "max_steps_p": 3, "max_steps_q": 3}
    first = app_client.get(PQ_AREA, params=params).json()
    second = app_client.get(PQ_AREA, params=params).json()
    assert first == second
    assert first["input_hash"] == second["input_hash"]


def test_pq_area_honors_step_and_max_steps(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        PQ_AREA,
        params={
            "run_id": str(run_id),
            "bus_ref": "bus_sn_c",
            "step_p_mw": 1.0,
            "step_q_mvar": 0.5,
            "max_steps_p": 4,
            "max_steps_q": 3,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["parameters"]["step_p_mw"] == 1.0
    assert data["parameters"]["step_q_mvar"] == 0.5
    assert data["parameters"]["max_steps_p"] == 4
    assert data["parameters"]["max_steps_q"] == 3
    assert len(data["vertices"]) <= 5
    assert data["total_runs"] <= data["parameters"]["max_total_runs"]


def test_pq_area_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(PQ_AREA, params={"run_id": str(uuid4()), "bus_ref": "bus_sn_c"})
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_pq_area_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(PQ_AREA, params={"run_id": str(run_id), "bus_ref": "bus_sn_c"})
    assert resp.status_code == 422
    assert "przebiegu rozpływu" in resp.json()["detail"]


def test_pq_area_unknown_bus_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(PQ_AREA, params={"run_id": str(run_id), "bus_ref": "bus_x"})
    assert resp.status_code == 422
    assert "nie istnieje" in resp.json()["detail"]


def test_pq_area_invalid_step_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        PQ_AREA, params={"run_id": str(run_id), "bus_ref": "bus_sn_c", "step_q_mvar": 0.0}
    )
    assert resp.status_code == 422
    assert "Krok mocy biernej" in resp.json()["detail"]


def test_pq_area_missing_bus_ref_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(PQ_AREA, params={"run_id": str(run_id)})
    # Brak wymaganego parametru bus_ref → walidacja FastAPI (422).
    assert resp.status_code == 422
