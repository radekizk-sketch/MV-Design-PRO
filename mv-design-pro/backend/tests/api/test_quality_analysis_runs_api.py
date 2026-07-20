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
FLICKER = "/api/quality/flicker"
ARC_FLASH = "/api/quality/arc-flash"


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


# --------------------------------------------------------------------------
# Arc Flash (IEEE 1584-2018) — audyt V12K-059 poz. A
# --------------------------------------------------------------------------


def test_arc_flash_endpoint_returns_view_with_complete_inputs(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.post(
        ARC_FLASH,
        json={
            "run_id": str(run_id),
            "working_distance_mm": 455.0,
            "conductor_gap_mm": 152.0,
            "arc_time_s": 0.2,
            "electrode_config": "VCB",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["analysis_id"]
    assert "results" in data and len(data["results"]) >= 5
    # Wejścia projektowe faktycznie użyte (nie zmyślone domyślne).
    for row in data["results"]:
        assert row["working_distance_mm"] == 455.0
        assert row["conductor_gap_mm"] == 152.0
        assert row["arc_time_s"] == 0.2
    # Przy kompletnych wejściach wynik nie jest „dane niekompletne (wejście)".
    statuses = {row["status"] for row in data["results"]}
    assert statuses != {"INCOMPLETE_INPUT"}


def test_arc_flash_incomplete_inputs_are_honest_not_fabricated(app_client) -> None:
    run_id = _sc_run_id()
    # Bez odległości roboczej i odstępu elektrod → builder zgłasza brak danych (nie zmyśla).
    resp = app_client.post(ARC_FLASH, json={"run_id": str(run_id), "arc_time_s": 0.2})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    for row in data["results"]:
        assert row["incident_energy_cal_cm2"] is None
        assert "working_distance_mm" in row["missing_data"]
        assert "conductor_gap_mm" in row["missing_data"]


def test_arc_flash_is_deterministic(app_client) -> None:
    run_id = _sc_run_id()
    body = {
        "run_id": str(run_id),
        "working_distance_mm": 455.0,
        "conductor_gap_mm": 152.0,
        "arc_time_s": 0.2,
    }
    first = app_client.post(ARC_FLASH, json=body).json()
    second = app_client.post(ARC_FLASH, json=body).json()
    assert first == second


def test_arc_flash_unknown_run_returns_404(app_client) -> None:
    resp = app_client.post(ARC_FLASH, json={"run_id": str(uuid4())})
    assert resp.status_code == 404


def test_arc_flash_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _pf_run_id()  # rozpływ, nie zwarcie
    resp = app_client.post(ARC_FLASH, json={"run_id": str(run_id)})
    assert resp.status_code == 422
    assert "przebiegu zwarciowego" in resp.json()["detail"]


def test_arc_flash_unknown_electrode_config_returns_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.post(ARC_FLASH, json={"run_id": str(run_id), "electrode_config": "XYZ"})
    assert resp.status_code == 422
    assert "konfiguracja elektrod" in resp.json()["detail"]


# --------------------------------------------------------------------------
# Ocena migotania (Pst/Plt) i szybkich zmian napięcia
# --------------------------------------------------------------------------


def test_flicker_endpoint_returns_view(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(FLICKER, params={"run_id": str(run_id)})
    assert resp.status_code == 200
    data = resp.json()
    assert "buses" in data and "summary" in data and "config" in data
    assert data["analysis_id"] == str(run_id)
    assert data["config"]["flicker_summation_exponent_m"] == 3
    assert data["config"]["planning_level_pst"] == 0.9
    assert len(data["input_hash"]) == 64


def test_flicker_endpoint_is_deterministic(app_client) -> None:
    run_id = _sc_run_id()
    first = app_client.get(FLICKER, params={"run_id": str(run_id)}).json()
    second = app_client.get(FLICKER, params={"run_id": str(run_id)}).json()
    assert first == second


def test_flicker_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(FLICKER, params={"run_id": str(uuid4())})
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_flicker_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _pf_run_id()  # rozpływ, nie zwarcie
    resp = app_client.get(FLICKER, params={"run_id": str(run_id)})
    assert resp.status_code == 422
    assert "przebiegu zwarciowego" in resp.json()["detail"]
