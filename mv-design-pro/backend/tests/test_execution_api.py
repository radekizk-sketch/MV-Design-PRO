"""Tests for canonical execution runs API endpoints."""

from __future__ import annotations

from uuid import uuid4

import pytest
from api.main import app
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record


def _reset_backend_state() -> None:
    from api.execution_runs import get_engine
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    engine = get_engine()
    engine._runs.clear()
    engine._result_sets.clear()
    engine._study_cases.clear()
    engine._case_runs.clear()
    reset_canonical_runs()
    reset_enm_store()


def _klucz_modelu(case_id: str) -> str:
    """Klucz magazynu ENM przypadku — model zyje pod kluczem PROJEKTU (CV-1).

    Zasiewanie surowym `case_id` bylo poprawne tylko przy zalozeniu, ze PIERWSZE
    przetlumaczone dotkniecie przypadku nastapi PO zasiewie (migracja
    `migruj_projekt_z_legacy` adoptowala wtedy plik przypadku). Zalozenie padlo w
    CV-2-W: kazda odpowiedz API z przypadkiem (juz samo `POST /api/study-cases`)
    wylicza status wynikow, wiec tlumaczy `case_id` na klucz projektu i ZNACZY
    projekt jako zmigrowany — pozniejszy zasiew pod surowym kluczem trafial w
    prozne miejsce, a bieg dostawal model domyslny (pusty). Zasiewamy wiec tam,
    gdzie model naprawde mieszka, zamiast liczyc na kolejnosc wywolan.
    """
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku

    return klucz_twin_dla_przypadku(case_id, app.state.uow_factory)


def _seed_valid_enm(case_id: str) -> None:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(
        _klucz_modelu(case_id),
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Execution API",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000401",
                        "ref_id": "bus-main",
                        "name": "Szyna glowna",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000402",
                        "ref_id": "bus-load",
                        "name": "Szyna odbioru",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000403",
                        "ref_id": "branch-1",
                        "name": "Odcinek SN",
                        "tags": [],
                        "meta": {},
                        "type": "cable",
                        "from_bus_ref": "bus-main",
                        "to_bus_ref": "bus-load",
                        "status": "closed",
                        "catalog_ref": "KABEL_SN_TEST",
                        "parameter_source": "CATALOG",
                        "length_km": 0.4,
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.073,
                        "b_siemens_per_km": 2.6e-07,
                    },
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000404",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-main",
                            voltage_kv=15.0,
                            sk3_mva=200.0,
                            rx_ratio=0.10,
                        ),
                    },
                ],
                "loads": [
                    {
                        "id": "00000000-0000-0000-0000-000000000405",
                        "ref_id": "load-1",
                        "name": "Odbior SN",
                        "tags": [],
                        "meta": {},
                        "bus_ref": "bus-load",
                        "p_mw": 1.0,
                        "q_mvar": 0.2,
                        "catalog_ref": "LOAD_TEST",
                        "parameter_source": "OVERRIDE",
                    },
                ],
                "transformers": [],
                "generators": [],
                "substations": [],
                "bays": [],
                "junctions": [],
                "corridors": [],
                "measurements": [],
                "protection_assignments": [],
                "branch_points": [],
            }
        ),
    )


@pytest.fixture(autouse=True)
def reset_state():
    _reset_backend_state()
    yield
    _reset_backend_state()


@pytest.fixture
def client():
    """Create a fresh TestClient with clean canonical state.

    CV-1-W: `with` uruchamia lifespan aplikacji, ktory wiaze `app.state.
    uow_factory` — bez niego tlumaczenie `case_id -> klucz` (`KluczTwin`)
    zawsze konczyloby sie 404 „brak warstwy bazy danych".
    """
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def registered_case(client) -> str:
    """Utworz REALNY projekt + przypadek przez API i zasiej model ENM.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2). CV-2-W: `_seed_valid_enm` zasiewa model pod KLUCZEM PROJEKTU
    (`_klucz_modelu`), a nie pod surowym `case_id` — patrz docstring `_klucz_modelu`.
    """
    project_resp = client.post("/api/projects", json={"name": "Execution API — test"})
    assert project_resp.status_code == 201, project_resp.text
    case_resp = client.post(
        "/api/study-cases",
        json={"project_id": project_resp.json()["id"], "name": "Przypadek testu"},
    )
    assert case_resp.status_code == 201, case_resp.text
    case_id = str(case_resp.json()["id"])
    _seed_valid_enm(case_id)
    return case_id


class TestCreateRunEndpoint:
    def test_create_run_success(self, client, registered_case):
        response = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={
                "analysis_type": "SC_3F",
                "solver_input": {"buses": [], "branches": []},
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["study_case_id"] == registered_case
        assert data["analysis_type"] == "SC_3F"
        assert data["status"] == "PENDING"
        assert len(data["solver_input_hash"]) == 64

    def test_create_run_invalid_analysis_type(self, client, registered_case):
        response = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={
                "analysis_type": "INVALID_TYPE",
                "solver_input": {},
            },
        )
        assert response.status_code == 400
        assert "Nieprawid" in response.json()["detail"]

    def test_create_run_protection_redirects_to_proper_endpoint(self, client, registered_case):
        """V12K-025: PROTECTION via execution endpoint returns helpful error
        pointing user to /api/projects/{id}/protection-runs."""
        response = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={
                "analysis_type": "PROTECTION",
                "solver_input": {},
            },
        )
        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "protection-runs" in detail
        assert "sc_run_id" in detail
        assert "protection_case_id" in detail
        assert "V12K-025" in detail

    def test_create_run_without_canonical_enm_snapshot_is_rejected(self, client):
        """Przypadek ISTNIEJACY w bazie, ale BEZ zasianego modelu ENM — 409.

        Rozroznienie od 404 „przypadek nie nalezy do zadnego projektu"
        (CV-1-W, inwariant I-2) wymaga REALNEGO wiersza StudyCase: fikcyjny
        `uuid4()` bez wiersza dostawalby teraz 404 z tlumaczenia case_id,
        zanim doszloby do sprawdzenia obecnosci snapshotu.
        """
        project_resp = client.post("/api/projects", json={"name": "Execution API — test"})
        assert project_resp.status_code == 201, project_resp.text
        case_resp = client.post(
            "/api/study-cases",
            json={"project_id": project_resp.json()["id"], "name": "Przypadek bez modelu"},
        )
        assert case_resp.status_code == 201, case_resp.text
        case_id = str(case_resp.json()["id"])

        response = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={
                "analysis_type": "SC_3F",
                "solver_input": {},
            },
        )
        assert response.status_code == 409
        assert (
            "model" in response.json()["detail"].lower()
            or "analiza" in response.json()["detail"].lower()
        )

    def test_create_run_ignores_legacy_readiness_payload(self, client, registered_case):
        response = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={
                "analysis_type": "SC_3F",
                "solver_input": {},
                "readiness": {
                    "ready": False,
                    "issues": [{"severity": "BLOCKER", "message_pl": "Brak zasilania"}],
                },
            },
        )
        assert response.status_code == 201

    def test_create_run_ignores_legacy_eligibility_payload(self, client, registered_case):
        response = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={
                "analysis_type": "SC_3F",
                "solver_input": {},
                "eligibility": {
                    "eligible": False,
                    "blockers": [{"message": "No SLACK node"}],
                },
            },
        )
        assert response.status_code == 201

    def test_create_run_load_flow(self, client, registered_case):
        response = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={
                "analysis_type": "LOAD_FLOW",
                "solver_input": {"base_mva": 100},
            },
        )
        assert response.status_code == 201
        assert response.json()["analysis_type"] == "LOAD_FLOW"

    def test_create_run_invalid_uuid(self, client):
        """CV-1-W: tlumaczenie `case_id -> klucz` jest JEDYNYM miejscem
        tlumaczenia (SS0 pkt 7, `api/klucz_twin_dep.py`) — zle sformatowany
        `case_id` i nieistniejacy `case_id` dostaja TEN SAM kod (404, magazyn
        ENM), bo oba znacza „nie da sie ustalic projektu przypadku". Odrebny
        kod 400 tylko dla zlego formatu bylby DRUGIM miejscem tlumaczenia,
        ktorego kanon zakazuje.
        """
        response = client.post(
            "/api/execution/study-cases/not-a-uuid/runs",
            json={
                "analysis_type": "SC_3F",
                "solver_input": {},
            },
        )
        assert response.status_code == 404
        assert "not-a-uuid" in response.json()["detail"]


class TestListRunsEndpoint:
    def test_list_runs_empty(self, client, registered_case):
        response = client.get(f"/api/execution/study-cases/{registered_case}/runs")
        assert response.status_code == 200
        data = response.json()
        assert data["runs"] == []
        assert data["count"] == 0

    def test_list_runs_with_data(self, client, registered_case):
        first = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={"analysis_type": "SC_3F", "solver_input": {"v": 1}},
        )
        second = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={"analysis_type": "LOAD_FLOW", "solver_input": {"v": 2}},
        )
        assert first.status_code == 201
        assert second.status_code == 201

        response = client.get(f"/api/execution/study-cases/{registered_case}/runs")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 2
        assert len(data["runs"]) == 2


class TestExecuteRunEndpoint:
    def test_execute_run_success(self, client, registered_case):
        create_resp = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={"analysis_type": "SC_3F", "solver_input": {}},
        )
        run_id = create_resp.json()["id"]

        response = client.post(f"/api/execution/runs/{run_id}/execute")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "DONE"

    def test_execute_run_not_found(self, client):
        response = client.post(f"/api/execution/runs/{uuid4()}/execute")
        assert response.status_code == 404


class TestGetRunEndpoint:
    def test_get_run_success(self, client, registered_case):
        create_resp = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={"analysis_type": "SC_3F", "solver_input": {}},
        )
        run_id = create_resp.json()["id"]

        response = client.get(f"/api/execution/runs/{run_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == run_id
        assert data["analysis_type"] == "SC_3F"

    def test_get_run_not_found(self, client):
        response = client.get(f"/api/execution/runs/{uuid4()}")
        assert response.status_code == 404


class TestGetRunResultsEndpoint:
    def test_get_results_run_not_done(self, client, registered_case):
        create_resp = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={"analysis_type": "SC_3F", "solver_input": {}},
        )
        run_id = create_resp.json()["id"]

        response = client.get(f"/api/execution/runs/{run_id}/results")
        assert response.status_code == 409
        assert "CREATED" in response.json()["detail"]

    def test_get_results_run_not_found(self, client):
        response = client.get(f"/api/execution/runs/{uuid4()}/results")
        assert response.status_code == 404

    def test_get_results_success(self, client, registered_case):
        create_resp = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={"analysis_type": "SC_3F", "solver_input": {}},
        )
        run_id = create_resp.json()["id"]

        execute_resp = client.post(f"/api/execution/runs/{run_id}/execute")
        assert execute_resp.status_code == 200
        assert execute_resp.json()["status"] == "DONE"

        response = client.get(f"/api/execution/runs/{run_id}/results")
        assert response.status_code == 200
        data = response.json()
        assert data["run_id"] == run_id
        assert data["analysis_type"] == "SC_3F"
        assert len(data["element_results"]) >= 1
        assert data["deterministic_signature"] != ""


class TestDeterministicHashApi:
    def test_same_input_same_hash(self, client, registered_case):
        solver_input = {"buses": [{"ref_id": "b1"}], "branches": []}

        response_first = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={"analysis_type": "SC_3F", "solver_input": solver_input},
        )
        response_second = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={"analysis_type": "SC_3F", "solver_input": solver_input},
        )

        assert response_first.status_code == 201
        assert response_second.status_code == 201
        assert (
            response_first.json()["solver_input_hash"]
            == response_second.json()["solver_input_hash"]
        )

    def test_different_input_different_hash(self, client, registered_case):
        response_first = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={
                "analysis_type": "SC_3F",
                "solver_input": {"c_factor": 1.10},
            },
        )
        response_second = client.post(
            f"/api/execution/study-cases/{registered_case}/runs",
            json={
                "analysis_type": "SC_3F",
                "solver_input": {"c_factor": 1.05},
            },
        )

        assert response_first.status_code == 201
        assert response_second.status_code == 201
        assert (
            response_first.json()["solver_input_hash"]
            != response_second.json()["solver_input_hash"]
        )
