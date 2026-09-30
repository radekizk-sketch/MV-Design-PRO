"""Testy końcówek API analiz OZE (siła sieci / adekwatność Q) — D1.

Kontrakt endpointów GET z parametrem run_id, determinizm (dwa wywołania
identyczne) oraz błędy 404 (brak przebiegu) / 422 (zły rodzaj analizy).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.models import GenLimits
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

GRID_STRENGTH = "/api/oze-analysis/grid-strength"
REACTIVE = "/api/oze-analysis/reactive-adequacy"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _augmented_enm():
    enm = build_golden_enm()
    gens = list(enm.generators)
    gens[1] = gens[1].model_copy(
        update={
            "q_mvar": 0.5,
            "limits": GenLimits(q_min_mvar=-0.9, q_max_mvar=0.9),
            "catalog_ref": "pv_inv_sma_2500",
            "materialized_params": {"sn_mva": 2.75},
        }
    )
    return enm.model_copy(update={"generators": gens})


def _sc_run_id():
    set_enm("c-sc", _augmented_enm())
    return execute_run(
        create_run(case_id="c-sc", klucz_twin="c-sc", analysis_type="short_circuit_sn").id
    ).id


def _pf_run_id():
    set_enm("c-pf", _augmented_enm())
    return execute_run(create_run(case_id="c-pf", klucz_twin="c-pf", analysis_type="PF").id).id


# --------------------------------------------------------------------------
# Siła sieci
# --------------------------------------------------------------------------


def test_grid_strength_endpoint_returns_view(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(GRID_STRENGTH, params={"run_id": str(run_id)})
    assert resp.status_code == 200
    data = resp.json()
    assert "analysis_id" in data
    assert "entries" in data and "summary" in data
    bus_nn = [e for e in data["entries"] if e["bus_ref"] == "bus_nn"]
    assert bus_nn and bus_nn[0]["scr"] is not None
    assert bus_nn[0]["white_box"]


def test_grid_strength_endpoint_is_deterministic(app_client) -> None:
    run_id = _sc_run_id()
    first = app_client.get(GRID_STRENGTH, params={"run_id": str(run_id)}).json()
    second = app_client.get(GRID_STRENGTH, params={"run_id": str(run_id)}).json()
    assert first == second


def test_grid_strength_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(GRID_STRENGTH, params={"run_id": str(uuid4())})
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_grid_strength_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _pf_run_id()  # rozpływ, nie zwarcie
    resp = app_client.get(GRID_STRENGTH, params={"run_id": str(run_id)})
    assert resp.status_code == 422
    assert "przebiegu zwarciowego" in resp.json()["detail"]


# --------------------------------------------------------------------------
# Adekwatność mocy biernej
# --------------------------------------------------------------------------


def test_reactive_adequacy_endpoint_returns_view(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(REACTIVE, params={"run_id": str(run_id)})
    assert resp.status_code == 200
    data = resp.json()
    assert "verdict" in data and "sources" in data
    assert data["provenance"]["worst_quality"] == "DATASHEET"


def test_reactive_adequacy_endpoint_is_deterministic(app_client) -> None:
    run_id = _pf_run_id()
    first = app_client.get(REACTIVE, params={"run_id": str(run_id)}).json()
    second = app_client.get(REACTIVE, params={"run_id": str(run_id)}).json()
    assert first == second


def test_reactive_adequacy_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(REACTIVE, params={"run_id": str(uuid4())})
    assert resp.status_code == 404


def test_reactive_adequacy_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _sc_run_id()  # zwarcie, nie rozpływ
    resp = app_client.get(REACTIVE, params={"run_id": str(run_id)})
    assert resp.status_code == 422
    assert "przebiegu rozpływu" in resp.json()["detail"]
