from __future__ import annotations

import pytest

pytest.importorskip("fastapi")


def test_konfiguracja_zabezpieczen_przypadku_skasowana(app_client) -> None:
    """Karta BIEG-ZABEZPIECZEN-Z-MODELU (D-21): przypadek NIE przechowuje nastaw ani szablonu
    zabezpieczeń — trasy `GET/PUT /api/study-cases/{id}/protection-config` usunięte na amen
    (bez warstwy zgodności), a nakładka SLD zabezpieczeń liczona z szablonu przypadku razem z
    nimi. Urządzenia i nastawy żyją w modelu (`protection_assignments`)."""
    sciezki = {route.path for route in app_client.app.routes}
    assert "/api/study-cases/{case_id}/protection-config" not in sciezki
    assert "/api/projects/{project_id}/sld/{diagram_id}/protection-overlay" not in sciezki
    assert not any(s.endswith("/protection-overlay") for s in sciezki)
    assert not any(s.endswith("/protection-config") for s in sciezki)


def test_protection_run_list_endpoint_reads_r1_with_snapshot_hash(app_client) -> None:
    """B5 (karta CV-3.3-B): `GET /projects/{id}/protection-runs` — brakujący
    endpoint listy (pre-existing luka: sprawdzone na `git show 1fdeec44` —
    ANI stara, ANI nowa wersja `protection_runs.py` go nie miała), przez co
    `fetchProtectionRuns` frontendu ZAWSZE dostawał 404 i cicho zwracał
    pustą listę — martwy pickers biegów w porównaniu zabezpieczeń. Lista
    MUSI czytać R1 (zero R2/R3) i nieść `snapshot_hash`/`model_revision`
    (dowód KTÓRY stan modelu opisuje bieg — B5 wymaga tego w etykiecie)."""
    from tests.test_execution_api import _seed_valid_enm

    project = app_client.post("/api/projects", json={"name": "Projekt listy zabezpieczen"})
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    case = app_client.post(
        "/api/study-cases",
        json={"project_id": project_id, "name": "Przypadek listy", "set_active": True},
    )
    assert case.status_code == 201, case.text
    case_id = str(case.json()["id"])
    _seed_valid_enm(case_id)

    # Zero biegow -> lista pusta, nie 404 (odroznienie "brak endpointu" od
    # "endpoint jest, po prostu nic tu jeszcze nie ma").
    pusta = app_client.get(f"/api/projects/{project_id}/protection-runs")
    assert pusta.status_code == 200, pusta.text
    assert pusta.json() == {"runs": [], "total": 0}

    utworzenie_sc = app_client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )
    assert utworzenie_sc.status_code == 201, utworzenie_sc.text
    sc_run_id = utworzenie_sc.json()["id"]
    wykonanie_sc = app_client.post(f"/api/execution/runs/{sc_run_id}/execute")
    assert wykonanie_sc.status_code == 200, wykonanie_sc.text

    utworzenie = app_client.post(
        f"/api/projects/{project_id}/protection-runs",
        json={"sc_run_id": sc_run_id, "protection_case_id": case_id},
    )
    assert utworzenie.status_code == 201, utworzenie.text
    run_id = utworzenie.json()["id"]
    wykonanie = app_client.post(f"/api/protection-runs/{run_id}/execute")
    assert wykonanie.status_code == 200, wykonanie.text
    assert wykonanie.json()["status"] == "FINISHED"

    lista = app_client.get(f"/api/projects/{project_id}/protection-runs")
    assert lista.status_code == 200, lista.text
    dane = lista.json()
    assert dane["total"] == 1
    wpis = dane["runs"][0]
    assert wpis["id"] == run_id
    assert wpis["analysis_type"] == "protection_sn"
    assert wpis["status"] == "FINISHED"
    assert wpis["snapshot_hash"]
    assert wpis["model_revision"] is not None

    # Filtr statusu: FAILED nie istnieje w tej fiksturze -> pusta lista, bez bledu.
    filtr = app_client.get(
        f"/api/projects/{project_id}/protection-runs", params={"status": "FAILED"}
    )
    assert filtr.status_code == 200, filtr.text
    assert filtr.json()["total"] == 0


def test_protection_run_routes_are_registered(app_client) -> None:
    """Byla `test_protection_and_unified_run_routes_are_registered`: trasy
    `/api/runs/{short-circuit,power-flow,protection}` (`api/unified_runs.py`,
    E2-widmo) skasowane kartą CV-3.3-A (2026-09-05) — zero konsumenta
    frontendu, zweryfikowane grepem. Tor kanoniczny biegow zabezpieczen
    (`/api/projects/{project_id}/protection-runs`) zostaje, wiec ta czesc
    asercji zostaje jako pin."""
    route_paths = {route.path for route in app_client.app.routes}

    assert "/api/projects/{project_id}/protection-runs" in route_paths
    assert "/api/protection-runs/{run_id}/execute" in route_paths


# CV-3.3-B: `test_protection_run_read_uses_latest_status_entry` usunięty —
# testował `ProtectionAnalysisService._get_run` (odczyt "najnowszego" zapisu
# R3 `study_results` po `result_type="protection_analysis_run"`, wiele
# wpisów per bieg). Tor kanoniczny (R1 `CanonicalRun`) nie ma tego problemu
# strukturalnie: `CanonicalRun.status` to JEDNO pole na biegu, nie lista
# zapisów do przeszukania w poszukiwaniu "najnowszego" — `enm.canonical_
# analysis.get_run` zwraca stan wprost, bez odpowiednika tej metody.
