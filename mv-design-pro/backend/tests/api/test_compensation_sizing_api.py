"""Testy końcówki API doboru kompensacji mocy biernej z katalogu — D8.

Kontrakt GET z parametrami run_id + bus_ref + cos_phi_min (+ uwzglednij_noc);
determinizm dwóch wywołań oraz błędy 404 (brak przebiegu) / 422 (zły rodzaj
analizy, cosφ poza zakresem, nieznana szyna, brak wymaganego parametru).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

ENDPOINT = "/api/oze-analysis/compensation-sizing"


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


def test_compensation_sizing_returns_view(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        ENDPOINT,
        params={"run_id": str(run_id), "bus_ref": "bus_sn_c", "cos_phi_min": 0.95},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["analysis"] == "compensation_sizing"
    assert data["parameters"]["bus_ref"] == "bus_sn_c"
    assert isinstance(data["candidates"], list)
    assert {"dobor", "powod_braku", "baseline"} <= set(data)


def test_compensation_sizing_with_night(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        ENDPOINT,
        params={
            "run_id": str(run_id),
            "bus_ref": "bus_sn_c",
            "cos_phi_min": 0.95,
            "uwzglednij_noc": True,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["parameters"]["uwzglednij_noc"] is True
    assert data["baseline"]["cos_phi_night"] is not None


def test_compensation_sizing_is_deterministic(app_client) -> None:
    run_id = _pf_run_id()
    params = {"run_id": str(run_id), "bus_ref": "bus_sn_c", "cos_phi_min": 0.9}
    first = app_client.get(ENDPOINT, params=params).json()
    second = app_client.get(ENDPOINT, params=params).json()
    assert first == second
    assert first["input_hash"] == second["input_hash"]


def test_compensation_sizing_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(
        ENDPOINT,
        params={"run_id": str(uuid4()), "bus_ref": "bus_sn_c", "cos_phi_min": 0.95},
    )
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_compensation_sizing_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(
        ENDPOINT,
        params={"run_id": str(run_id), "bus_ref": "bus_sn_c", "cos_phi_min": 0.95},
    )
    assert resp.status_code == 422
    assert "przebiegu rozpływu" in resp.json()["detail"]


def test_compensation_sizing_cos_phi_out_of_range_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        ENDPOINT,
        params={"run_id": str(run_id), "bus_ref": "bus_sn_c", "cos_phi_min": 1.5},
    )
    assert resp.status_code == 422
    assert "cos_phi_min" in resp.json()["detail"]


def test_compensation_sizing_unknown_bus_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(
        ENDPOINT,
        params={"run_id": str(run_id), "bus_ref": "brak", "cos_phi_min": 0.95},
    )
    assert resp.status_code == 422
    assert "nie istnieje" in resp.json()["detail"]


def test_compensation_sizing_missing_bus_ref_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(ENDPOINT, params={"run_id": str(run_id), "cos_phi_min": 0.95})
    # Brak wymaganego parametru bus_ref → walidacja FastAPI (422).
    assert resp.status_code == 422
