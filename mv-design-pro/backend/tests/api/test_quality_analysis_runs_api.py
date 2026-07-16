"""Testy końcówek API jakości wyników (sanity bounds / walidacja energetyczna) — D2.

Kontrakt endpointów GET z parametrem run_id, determinizm (dwa wywołania
identyczne) oraz błędy 404 (brak przebiegu) / 422 (zły rodzaj analizy).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

SANITY_BOUNDS = "/api/quality/sanity-bounds"
ENERGY_VALIDATION = "/api/quality/energy-validation"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _sc_run_id():
    set_enm("c-sc", build_golden_enm())
    return execute_run(create_run(case_id="c-sc", analysis_type="short_circuit_sn").id).id


def _pf_run_id():
    set_enm("c-pf", build_golden_enm())
    return execute_run(create_run(case_id="c-pf", analysis_type="PF").id).id


# --------------------------------------------------------------------------
# Sanity bounds Ik''
# --------------------------------------------------------------------------


def test_sanity_bounds_endpoint_returns_view(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(SANITY_BOUNDS, params={"run_id": str(run_id)})
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data and "summary" in data
    assert data["analysis_id"] == str(run_id)
    assert len(data["items"]) >= 5
    statuses = {item["status"] for item in data["items"]}
    assert "zweryfikowany" in statuses


def test_sanity_bounds_endpoint_is_deterministic(app_client) -> None:
    run_id = _sc_run_id()
    first = app_client.get(SANITY_BOUNDS, params={"run_id": str(run_id)}).json()
    second = app_client.get(SANITY_BOUNDS, params={"run_id": str(run_id)}).json()
    assert first == second


def test_sanity_bounds_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(SANITY_BOUNDS, params={"run_id": str(uuid4())})
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_sanity_bounds_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _pf_run_id()  # rozpływ, nie zwarcie
    resp = app_client.get(SANITY_BOUNDS, params={"run_id": str(run_id)})
    assert resp.status_code == 422
    assert "przebiegu zwarciowego" in resp.json()["detail"]


# --------------------------------------------------------------------------
# Walidacja energetyczna
# --------------------------------------------------------------------------


def test_energy_validation_endpoint_returns_view(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(ENERGY_VALIDATION, params={"run_id": str(run_id)})
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data and "summary" in data and "config" in data
    check_types = {item["check_type"] for item in data["items"]}
    assert "VOLTAGE_DEVIATION" in check_types


def test_energy_validation_endpoint_is_deterministic(app_client) -> None:
    run_id = _pf_run_id()
    first = app_client.get(ENERGY_VALIDATION, params={"run_id": str(run_id)}).json()
    second = app_client.get(ENERGY_VALIDATION, params={"run_id": str(run_id)}).json()
    assert first == second


def test_energy_validation_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(ENERGY_VALIDATION, params={"run_id": str(uuid4())})
    assert resp.status_code == 404


def test_energy_validation_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _sc_run_id()  # zwarcie, nie rozpływ
    resp = app_client.get(ENERGY_VALIDATION, params={"run_id": str(run_id)})
    assert resp.status_code == 422
    assert "przebiegu rozpływu" in resp.json()["detail"]
