"""Testy końcówek API widoków interpretacji (karta ROUTERY-4A).

Iloczyn cech: zdolność (wrażliwość / pokrycie / granica) × droga wejścia
(run_id / case_id) × stan (pełny przebieg PF / brak biegu / zły rodzaj biegu /
nieistniejący przebieg / pusty model) × determinizm (dwa wywołania identyczne).
Testy idą realną ścieżką produkcyjną: golden ENM → create_run/execute_run →
HTTP przez TestClient (bez syntetycznych obejść).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

SENSITIVITY = "/api/insights/sensitivity"
COVERAGE = "/api/insights/analysis-coverage"
BOUNDARY = "/api/insights/network-boundary"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _nowy_przypadek(client) -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2) — testy „granicy sieci" (`?case_id=`, nie `?run_id=`)
    potrzebują prawdziwej pary projekt+przypadek.
    """
    project_resp = client.post("/api/projects", json={"name": "Insights — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _klucz(client, case_id: str) -> str:
    """Klucz magazynu ENM dla `case_id` — TO SAMO tłumaczenie co warstwa API (CV-1)."""
    from application.twin_key import klucz_twin_dla_przypadku

    return klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)


def _pf_run_id(case_id: str = "c-pf"):
    set_enm(case_id, build_golden_enm())
    return execute_run(create_run(case_id=case_id, klucz_twin=case_id, analysis_type="PF").id).id


def _sc_run_id(case_id: str = "c-sc"):
    set_enm(case_id, build_golden_enm())
    return execute_run(
        create_run(case_id=case_id, klucz_twin=case_id, analysis_type="short_circuit_sn").id
    ).id


# --------------------------------------------------------------------------
# Wrażliwość (LF + ogólna) — run_id
# --------------------------------------------------------------------------


def test_sensitivity_returns_lf_and_general_views(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(SENSITIVITY, params={"run_id": str(run_id)})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert set(data) >= {"analysis_id", "context", "lf", "ogolna", "wezly"}
    # LF: wpisy per węzeł profilu + ranking czynników.
    assert len(data["lf"]["entries"]) >= 5
    assert len(data["lf"]["top_drivers"]) >= 1
    # Ogólna: wpisy marginesów napięciowych z profilu napięć.
    assert len(data["ogolna"]["entries"]) >= 5
    # Mapa węzłów tłumaczy identyfikatory grafu na nazwy szyn.
    driver = data["lf"]["top_drivers"][0]
    assert driver["bus_id"] in data["wezly"]


def test_sensitivity_why_pl_is_polish_without_codenames(app_client) -> None:
    """Reguła „No Codenames in UI": why_pl trafia wprost do interfejsu."""
    run_id = _pf_run_id()
    data = app_client.get(SENSITIVITY, params={"run_id": str(run_id)}).json()
    for entry in data["lf"]["entries"]:
        for driver in entry["drivers"]:
            why = driver["why_pl"]
            assert "P32" not in why and "P24" not in why, why
            assert "warning" not in why and "fail" not in why, why


def test_sensitivity_is_deterministic(app_client) -> None:
    run_id = _pf_run_id()
    first = app_client.get(SENSITIVITY, params={"run_id": str(run_id)}).json()
    second = app_client.get(SENSITIVITY, params={"run_id": str(run_id)}).json()
    assert first == second


def test_sensitivity_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(SENSITIVITY, params={"run_id": str(uuid4())})
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_sensitivity_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _sc_run_id()  # zwarcie, nie rozpływ
    resp = app_client.get(SENSITIVITY, params={"run_id": str(run_id)})
    assert resp.status_code == 422
    assert "rozpływu" in resp.json()["detail"]


def test_sensitivity_declares_omitted_sources_honestly(app_client) -> None:
    """Uczciwe braki: sekcje niewykonalne z biegu PF są zadeklarowane wprost."""
    run_id = _pf_run_id()
    data = app_client.get(SENSITIVITY, params={"run_id": str(run_id)}).json()
    deklaracja = " ".join(data["pominiete_zrodla_pl"])
    assert "zabezpiecze" in deklaracja
    assert "normatywny" in deklaracja


# --------------------------------------------------------------------------
# Pokrycie analizami — case_id
# --------------------------------------------------------------------------


def test_coverage_with_pf_run_lists_missing_items_in_polish(app_client) -> None:
    run_id = _pf_run_id("c-cov")
    resp = app_client.get(COVERAGE, params={"case_id": "c-cov"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["run_id"] == str(run_id)
    widok = data["pokrycie"]
    assert 0.0 <= widok["total_score"] <= 100.0
    # Braki po polsku, bez kodenamów projektowych (No Codenames in UI).
    for pozycja in widok["missing_items"] + widok["critical_gaps"]:
        assert "P1" not in pozycja and "P2" not in pozycja, pozycja
    # Dowody zwarciowe uczciwie brakujące (bieg PF ich nie daje).
    assert any("SC3F" in pozycja for pozycja in widok["missing_items"])


def test_coverage_without_any_run_reports_honest_zero_state(app_client) -> None:
    set_enm("c-pusty", build_golden_enm())
    resp = app_client.get(COVERAGE, params={"case_id": "c-pusty"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["run_id"] is None
    widok = data["pokrycie"]
    # Bez biegów brakuje wszystkiego, co widok potrafi policzyć.
    assert widok["total_score"] < 20.0
    assert any("profilu napięć" in pozycja for pozycja in widok["missing_items"])
    assert any("wrażliwości" in pozycja for pozycja in widok["missing_items"])


def test_coverage_score_rises_with_pf_run(app_client) -> None:
    """Bieg rozpływu FAKTYCZNIE podnosi pokrycie (test klasy, nie instancji)."""
    set_enm("c-a", build_golden_enm())
    bez_biegu = app_client.get(COVERAGE, params={"case_id": "c-a"}).json()
    _pf_run_id("c-b")
    z_biegiem = app_client.get(COVERAGE, params={"case_id": "c-b"}).json()
    assert z_biegiem["pokrycie"]["total_score"] > bez_biegu["pokrycie"]["total_score"]


def test_coverage_is_deterministic(app_client) -> None:
    _pf_run_id("c-det")
    first = app_client.get(COVERAGE, params={"case_id": "c-det"}).json()
    second = app_client.get(COVERAGE, params={"case_id": "c-det"}).json()
    assert first == second


# --------------------------------------------------------------------------
# Granica sieci — case_id (interpretacja bieżącego MODELU, nie biegu)
# --------------------------------------------------------------------------


def test_boundary_identifies_external_grid_node(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    set_enm(_klucz(app_client, case_id), build_golden_enm())
    resp = app_client.get(BOUNDARY, params={"case_id": case_id})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["znaleziono"] is True
    assert data["wezel_przylaczenia"] == {
        "ref_id": "bus_hv",
        "name": "GPZ 110kV",
        "voltage_kv": 110.0,
    }
    assert data["metoda"] == "external_grid"
    assert data["metoda_pl"] == "źródło zasilania z sieci zewnętrznej"
    assert data["ufnosc"] == pytest.approx(0.95)
    assert data["diagnostyka"] == []


def test_boundary_works_without_any_run(app_client) -> None:
    """Granica = interpretacja modelu: działa bez ani jednego przebiegu."""
    case_id = _nowy_przypadek(app_client)
    set_enm(_klucz(app_client, case_id), build_golden_enm())
    resp = app_client.get(BOUNDARY, params={"case_id": case_id})
    assert resp.status_code == 200
    assert resp.json()["znaleziono"] is True


def test_boundary_empty_model_reports_honest_diagnostics(app_client) -> None:
    """Świeży przypadek (model domyślny bez węzłów) → uczciwa diagnostyka PL."""
    case_id = _nowy_przypadek(app_client)
    resp = app_client.get(BOUNDARY, params={"case_id": case_id})
    assert resp.status_code == 200
    data = resp.json()
    assert data["znaleziono"] is False
    assert data["wezel_przylaczenia"] is None
    kody = [wpis["kod"] for wpis in data["diagnostyka"]]
    assert "snapshot.empty" in kody
    opisy = " ".join(wpis["opis_pl"] for wpis in data["diagnostyka"])
    assert "węzłów" in opisy


def test_boundary_is_deterministic(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    set_enm(_klucz(app_client, case_id), build_golden_enm())
    resp1 = app_client.get(BOUNDARY, params={"case_id": case_id})
    resp2 = app_client.get(BOUNDARY, params={"case_id": case_id})
    # Asercja statusu ZANIM porówna treść — bez niej dwie identyczne odpowiedzi
    # błędu (np. 404 przy nieprzetłumaczalnym `case_id`) „zdałyby" ten test z
    # niewłaściwego powodu (test maskujący defekt).
    assert resp1.status_code == 200, resp1.text
    assert resp1.json() == resp2.json()
