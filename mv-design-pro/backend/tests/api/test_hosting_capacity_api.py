"""Testy końcówki API zdolności przyłączeniowej sieci (hosting capacity) — D3.

Kontrakt GET z parametrem run_id (+ opcjonalne candidate_bus_refs/step_mw/
max_steps), determinizm dwóch wywołań oraz błędy 404 (brak przebiegu) / 422
(zły rodzaj analizy, nieznany węzeł, złe parametry).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

HOSTING = "/api/oze-analysis/hosting-capacity"


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


def test_hosting_capacity_returns_view(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(HOSTING, params={"run_id": str(run_id)})
    assert resp.status_code == 200
    data = resp.json()
    assert data["analysis"] == "hosting_capacity"
    assert data["nodes"]
    assert data["parameters"]["candidate_bus_refs"] == ["bus_nn", "bus_sn_c"]
    node = data["nodes"][0]
    assert "max_hosting_capacity_mw" in node
    assert node["binding_criterion"]["kind"] in {"loading", "voltage", "none", "non_convergence"}


def test_hosting_capacity_is_deterministic(app_client) -> None:
    run_id = _pf_run_id()
    first = app_client.get(HOSTING, params={"run_id": str(run_id)}).json()
    second = app_client.get(HOSTING, params={"run_id": str(run_id)}).json()
    assert first == second
    assert first["input_hash"] == second["input_hash"]


def test_hosting_capacity_honors_candidate_param(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        HOSTING, params={"run_id": str(run_id), "candidate_bus_refs": ["bus_sn_c"]}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert [n["bus_ref"] for n in data["nodes"]] == ["bus_sn_c"]


def test_hosting_capacity_honors_step_and_max_steps(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        HOSTING,
        params={
            "run_id": str(run_id),
            "candidate_bus_refs": ["bus_sn_c"],
            "step_mw": 1.0,
            "max_steps": 6,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["parameters"]["step_mw"] == 1.0
    assert data["parameters"]["max_steps"] == 6
    assert len(data["nodes"][0]["scenarios"]) <= 7


def test_hosting_capacity_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(HOSTING, params={"run_id": str(uuid4())})
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_hosting_capacity_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(HOSTING, params={"run_id": str(run_id)})
    assert resp.status_code == 422
    assert "przebiegu rozpływu" in resp.json()["detail"]


def test_hosting_capacity_unknown_candidate_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(HOSTING, params={"run_id": str(run_id), "candidate_bus_refs": ["bus_x"]})
    assert resp.status_code == 422
    assert "nie istnieją" in resp.json()["detail"]


def test_hosting_capacity_invalid_step_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(HOSTING, params={"run_id": str(run_id), "step_mw": 0.0})
    assert resp.status_code == 422
    assert "Krok mocy" in resp.json()["detail"]


# --------------------------------------------------------------------------
# D3a: straty i skrajne napięcia scenariuszy (ADDYTYWNE) — kontrakt API
# --------------------------------------------------------------------------


def test_hosting_capacity_scenario_exposes_losses_and_voltage_fields(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        HOSTING, params={"run_id": str(run_id), "candidate_bus_refs": ["bus_sn_c"]}
    )
    assert resp.status_code == 200
    data = resp.json()
    node = data["nodes"][0]
    assert {"losses_baseline_p_mw", "losses_at_limit_p_mw"} <= set(node)
    for scenario in node["scenarios"]:
        assert {"total_losses_p_mw", "min_voltage_pu", "max_voltage_pu"} <= set(scenario)
        assert isinstance(scenario["total_losses_p_mw"], float)
        assert isinstance(scenario["min_voltage_pu"], float)
        assert isinstance(scenario["max_voltage_pu"], float)


def test_hosting_capacity_new_fields_are_deterministic(app_client) -> None:
    run_id = _pf_run_id()
    first = app_client.get(HOSTING, params={"run_id": str(run_id)}).json()
    second = app_client.get(HOSTING, params={"run_id": str(run_id)}).json()
    first_node = first["nodes"][0]
    second_node = second["nodes"][0]
    assert first_node["losses_baseline_p_mw"] == second_node["losses_baseline_p_mw"]
    assert first_node["losses_at_limit_p_mw"] == second_node["losses_at_limit_p_mw"]
    assert first_node["scenarios"] == second_node["scenarios"]
