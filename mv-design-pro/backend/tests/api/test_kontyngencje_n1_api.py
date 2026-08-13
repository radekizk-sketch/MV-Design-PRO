"""Testy końcówki API enumeracji kontyngencji N-1 (karta N-1-BACKEND, D8).

Kontrakt ``GET /api/insights/n-1-contingency?run_id=[&element_refs=]``:
odpowiedź widoku 1:1 z serwisu, determinizm dwóch wywołań oraz błędy 404 (brak
przebiegu) / 422 (zły rodzaj przebiegu, nieznany element). Bieg przez klienta
ASGI (TestClient) — bez żywego serwera i bez portów.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

N1 = "/api/insights/n-1-contingency"


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


def test_zwraca_macierz_kontyngencji(app_client) -> None:
    resp = app_client.get(N1, params={"run_id": str(_pf_run_id())})
    assert resp.status_code == 200
    data = resp.json()
    assert data["analysis"] == "kontyngencje_n1"
    # Golden: dwa odcinki SN (kabel + linia) i dwa transformatory.
    assert [k["element_ref"] for k in data["kontyngencje"]] == [
        "cab_main_b",
        "line_b_c",
        "tr_hv_sn",
        "tr_sn_nn",
    ]
    assert data["podsumowanie"]["kontyngencji"] == 4
    assert data["przypadek_bazowy"]["status"] == "zbiegl"
    assert all(k["status"] in {"zbiegl", "niezbiegl", "wykluczony"} for k in data["kontyngencje"])
    assert [r["pozycja"] for r in data["ranking"]] == list(range(1, len(data["ranking"]) + 1))


def test_wynik_jest_deterministyczny(app_client) -> None:
    run_id = _pf_run_id()
    pierwszy = app_client.get(N1, params={"run_id": str(run_id)}).json()
    drugi = app_client.get(N1, params={"run_id": str(run_id)}).json()
    assert pierwszy == drugi
    assert pierwszy["input_hash"] == drugi["input_hash"]


def test_zawezenie_przez_element_refs(app_client) -> None:
    resp = app_client.get(
        N1, params={"run_id": str(_pf_run_id()), "element_refs": ["tr_sn_nn", "line_b_c"]}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert [k["element_ref"] for k in data["kontyngencje"]] == ["line_b_c", "tr_sn_nn"]
    assert data["parameters"]["element_refs"] == ["line_b_c", "tr_sn_nn"]


def test_brak_przebiegu_daje_404(app_client) -> None:
    resp = app_client.get(N1, params={"run_id": str(uuid4())})
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_zly_rodzaj_przebiegu_daje_422(app_client) -> None:
    resp = app_client.get(N1, params={"run_id": str(_sc_run_id())})
    assert resp.status_code == 422
    assert "rozpływu" in resp.json()["detail"]


def test_nieznany_element_daje_422(app_client) -> None:
    resp = app_client.get(
        N1, params={"run_id": str(_pf_run_id()), "element_refs": ["nie_ma_takiego"]}
    )
    assert resp.status_code == 422
    assert "nie_ma_takiego" in resp.json()["detail"]
