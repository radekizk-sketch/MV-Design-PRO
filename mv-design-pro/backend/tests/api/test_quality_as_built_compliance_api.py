"""Testy końcówki POST /api/quality/as-built-compliance (zgodność powykonawcza) — D12.

Kontrakt: 200 dla poprawnego żądania (lista JSON i CSV w body), determinizm,
404 (brak przebiegu), 422 PL (zły rodzaj analizy, brak pomiarów, brak jawnej
tolerancji, błąd CSV z numerem wiersza).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import (
    build_bus_results,
    create_run,
    execute_run,
    get_run,
    reset_canonical_runs,
)
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

AS_BUILT = "/api/quality/as-built-compliance"


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


def _pierwszy_wezel(run_id):
    run = get_run(run_id)
    # Napięcie znamionowe pochodzi z listy szyn snapshotu (wzorzec
    # grid_strength._nominal_kv_by_bus), więc wybieramy węzeł będący szyną.
    bus_refs = {b.get("ref_id") for b in (run.snapshot or {}).get("buses") or []}
    rows = build_bus_results(run).get("rows", [])
    return next(r for r in rows if r.get("u_pu") is not None and r.get("element_id") in bus_refs)


def test_happy_path_lista_pomiarow(app_client) -> None:
    run_id = _pf_run_id()
    wezel = _pierwszy_wezel(run_id)
    model_kv = wezel["u_pu"] * wezel["un_kv"]
    resp = app_client.post(
        AS_BUILT,
        json={
            "run_id": str(run_id),
            "pomiary": [
                {
                    "element_ref": wezel["element_id"],
                    "wielkosc": "U",
                    "wartosc": model_kv,
                    "jednostka": "kV",
                }
            ],
            "tolerancje": {"napiecie_pct": 1.0},
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["analysis_id"] == str(run_id)
    assert len(data["input_hash"]) == 64
    assert data["wiersze"][0]["werdykt"] == "w tolerancji"
    assert data["podsumowanie"]["liczba_punktow"] == 1


def test_happy_path_csv(app_client) -> None:
    run_id = _pf_run_id()
    wezel = _pierwszy_wezel(run_id)
    model_kv = round(wezel["u_pu"] * wezel["un_kv"], 3)
    csv_text = (
        "element_ref;wielkosc;wartosc;jednostka\n"
        f"{wezel['element_id']};U;{str(model_kv).replace('.', ',')};kV\n"
    )
    resp = app_client.post(
        AS_BUILT,
        json={"run_id": str(run_id), "csv": csv_text, "tolerancje": {"napiecie_pct": 2.0}},
    )
    assert resp.status_code == 200
    assert resp.json()["podsumowanie"]["liczba_punktow"] == 1


def test_determinizm(app_client) -> None:
    run_id = _pf_run_id()
    wezel = _pierwszy_wezel(run_id)
    payload = {
        "run_id": str(run_id),
        "pomiary": [
            {
                "element_ref": wezel["element_id"],
                "wielkosc": "U",
                "wartosc": wezel["u_pu"] * wezel["un_kv"],
                "jednostka": "kV",
            }
        ],
        "tolerancje": {"napiecie_pct": 1.0},
    }
    first = app_client.post(AS_BUILT, json=payload).json()
    second = app_client.post(AS_BUILT, json=payload).json()
    assert first == second


def test_unknown_run_404(app_client) -> None:
    resp = app_client.post(
        AS_BUILT,
        json={
            "run_id": str(uuid4()),
            "pomiary": [{"element_ref": "x", "wielkosc": "U", "wartosc": 15.0, "jednostka": "kV"}],
            "tolerancje": {"napiecie_pct": 1.0},
        },
    )
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_zly_rodzaj_analizy_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.post(
        AS_BUILT,
        json={
            "run_id": str(run_id),
            "pomiary": [{"element_ref": "x", "wielkosc": "U", "wartosc": 15.0, "jednostka": "kV"}],
            "tolerancje": {"napiecie_pct": 1.0},
        },
    )
    assert resp.status_code == 422
    assert "rozpływu mocy" in resp.json()["detail"]


def test_brak_pomiarow_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.post(
        AS_BUILT, json={"run_id": str(run_id), "tolerancje": {"napiecie_pct": 1.0}}
    )
    assert resp.status_code == 422
    assert "Brak pomiarów" in resp.json()["detail"]


def test_brak_tolerancji_422(app_client) -> None:
    run_id = _pf_run_id()
    wezel = _pierwszy_wezel(run_id)
    resp = app_client.post(
        AS_BUILT,
        json={
            "run_id": str(run_id),
            "pomiary": [
                {
                    "element_ref": wezel["element_id"],
                    "wielkosc": "U",
                    "wartosc": 15.0,
                    "jednostka": "kV",
                }
            ],
        },
    )
    assert resp.status_code == 422
    assert "tolerancji napięcia" in resp.json()["detail"]


def test_blad_csv_numer_wiersza_422(app_client) -> None:
    run_id = _pf_run_id()
    csv_text = "element_ref;wielkosc;wartosc;jednostka\nbus_a;U;abc;kV\n"
    resp = app_client.post(
        AS_BUILT,
        json={"run_id": str(run_id), "csv": csv_text, "tolerancje": {"napiecie_pct": 1.0}},
    )
    assert resp.status_code == 422
    assert "Wiersz 2 CSV" in resp.json()["detail"]
