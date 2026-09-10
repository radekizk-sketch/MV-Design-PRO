from __future__ import annotations

import pytest
from application.protection_analysis.catalog_lookup import (
    get_protection_curve,
    get_protection_device_type,
    get_protection_template,
)

pytest.importorskip("fastapi")


def test_protection_config_update_persists_without_500(app_client) -> None:
    project_resp = app_client.post("/api/projects", json={"name": "Projekt zabezpieczeniowy"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    case_resp = app_client.post(
        "/api/study-cases",
        json={
            "project_id": project_id,
            "name": "Zakres zabezpieczeń",
        },
    )
    assert case_resp.status_code == 201
    case_id = case_resp.json()["id"]

    response = app_client.put(
        f"/api/study-cases/{case_id}/protection-config",
        json={
            "template_ref": "template_ref_oc_ef_500",
            "template_fingerprint": "template_ref_oc_ef_500:2024.1",
            "library_manifest_ref": {"catalog": "MV-DESIGN-PRO", "version": "2024.1"},
            "overrides": {"pickup_a": 400.0, "tms": 0.25},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["template_ref"] == "template_ref_oc_ef_500"
    assert payload["overrides"]["pickup_a"] == 400.0
    assert payload["bound_at"] is not None

    persisted = app_client.get(f"/api/study-cases/{case_id}/protection-config")
    assert persisted.status_code == 200
    assert persisted.json()["template_ref"] == "template_ref_oc_ef_500"
    assert persisted.json()["template_fingerprint"] == "template_ref_oc_ef_500:2024.1"


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

    config = app_client.put(
        f"/api/study-cases/{case_id}/protection-config",
        json={"template_ref": "template_ref_oc_100"},
    )
    assert config.status_code == 200, config.text

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


def test_protection_catalog_lookup_uses_default_reference_catalog() -> None:
    """CV-3.3-B: te same trzy odczyty katalogu, wydzielone z (usuniętego)
    `ProtectionAnalysisService` do wolnych funkcji dzielonych z torem
    kanonicznym (`application/protection_analysis/catalog_lookup.py`,
    użyte przez `enm.canonical_analysis._execute_protection`)."""

    class UnitOfWork:
        session = None

    uow = UnitOfWork()

    template = get_protection_template(uow, "template_ref_oc_ef_500")
    curve = get_protection_curve(uow, "curve_iec_normal_inverse")
    device = get_protection_device_type(uow, "REF-OC-EF-500")

    assert template is not None
    assert template.id == "template_ref_oc_ef_500"
    assert curve is not None
    assert curve.id == "curve_iec_normal_inverse"
    assert device is not None
    assert device.id == "REF-OC-EF-500"
