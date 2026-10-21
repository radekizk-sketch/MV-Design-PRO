"""
Test Fault Scenarios API — PR-24 + C6-PERSIST

API contract tests using FastAPI TestClient.
All assertions use Polish error messages where applicable.

Karta C6-PERSIST: scenariusze żyją w magazynie per PROJEKT (klucz Canonical
Project Twin), więc `study-cases/{case_id}/...` wymaga RZECZYWISTEGO przypadku
w bazie — `CASE_ID = str(uuid4())` swobodny (sprzed tej karty) przestał być
reprezentatywny. `client` wchodzi w `with` (lifespan), bo bez niego
`app.state.uow_factory` nie jest związany i tłumaczenie `case_id -> klucz`
kończy się 404 niezależnie od treści żądania (wzorzec `_lifespan_i_przypadek`
z `test_fault_scenarios_run_integration.py`).
"""

from uuid import uuid4

import pytest
from api.main import app
from fastapi.testclient import TestClient

client: TestClient
CASE_ID: str
BASE_URL = "/api/execution"


@pytest.fixture(scope="module", autouse=True)
def _lifespan_i_przypadek():
    """Zwiąż `client`/`CASE_ID` z realnym `uow_factory` i realnym StudyCase."""
    global client, CASE_ID
    with TestClient(app) as test_client:
        client = test_client
        project_resp = client.post("/api/projects", json={"name": "Fault Scenarios API — test"})
        assert project_resp.status_code == 201, project_resp.text
        case_resp = client.post(
            "/api/study-cases",
            json={"project_id": project_resp.json()["id"], "name": "Przypadek testu"},
        )
        assert case_resp.status_code == 201, case_resp.text
        CASE_ID = str(case_resp.json()["id"])
        yield


@pytest.fixture(autouse=True)
def _reset_enm():
    """Reset magazynu ENM między testami (scenariusze żyją tam — CV-3.1;
    `usun_wszystkie_scenariusze` jest wołane wewnątrz `reset_enm_store`)."""
    from enm.store import reset_enm_store

    reset_enm_store()
    yield


def _create_scenario(
    case_id: str,
    name: str = "Zwarcie testowe",
    fault_type: str = "SC_3F",
    element_ref: str = "bus-1",
) -> dict:
    """Helper to create a scenario via API."""
    resp = client.post(
        f"{BASE_URL}/study-cases/{case_id}/fault-scenarios",
        json={
            "name": name,
            "fault_type": fault_type,
            "location": {
                "element_ref": element_ref,
                "location_type": "BUS",
                "position": None,
            },
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestCreateScenario:
    def test_create_scenario(self):
        data = _create_scenario(case_id=CASE_ID, name="Mój scenariusz")
        assert data["name"] == "Mój scenariusz"
        assert data["fault_type"] == "SC_3F"
        assert data["analysis_type"] == "SC_3F"
        assert data["fault_mode"] == "METALLIC"
        # Partia 10: dawne pole `fault_impedance_type` (zawsze METALLIC) skasowane — tryb
        # zwarcia niesie WYŁĄCZNIE `fault_mode` (jedna prawda o trybie).
        assert "fault_impedance_type" not in data
        assert data["content_hash"] != ""
        assert data["created_at"] != ""
        assert data["updated_at"] != ""
        assert data["revision"] == 1

    def test_create_scenario_missing_name(self):
        resp = client.post(
            f"{BASE_URL}/study-cases/{CASE_ID}/fault-scenarios",
            json={
                "fault_type": "SC_3F",
                "location": {
                    "element_ref": "bus-1",
                    "location_type": "BUS",
                },
            },
        )
        assert resp.status_code == 422  # Pydantic validation (name required)


class TestListScenarios:
    def test_list_scenarios(self):
        _create_scenario(case_id=CASE_ID, name="Scenariusz A", element_ref="bus-a")
        _create_scenario(case_id=CASE_ID, name="Scenariusz B", element_ref="bus-b")
        resp = client.get(f"{BASE_URL}/study-cases/{CASE_ID}/fault-scenarios")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 2
        assert len(data["scenarios"]) == 2

    def test_list_empty(self):
        resp = client.get(f"{BASE_URL}/study-cases/{CASE_ID}/fault-scenarios")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0


class TestGetScenario:
    def test_get_scenario(self):
        created = _create_scenario(case_id=CASE_ID)
        sid = created["scenario_id"]
        resp = client.get(f"{BASE_URL}/fault-scenarios/{sid}")
        assert resp.status_code == 200
        assert resp.json()["scenario_id"] == sid

    def test_get_scenario_not_found(self):
        fake_id = str(uuid4())
        resp = client.get(f"{BASE_URL}/fault-scenarios/{fake_id}")
        assert resp.status_code == 404


class TestUpdateScenario:
    def test_update_scenario_name(self):
        created = _create_scenario(case_id=CASE_ID, name="Oryginalny")
        sid = created["scenario_id"]
        old_hash = created["content_hash"]

        resp = client.put(
            f"{BASE_URL}/fault-scenarios/{sid}",
            json={"name": "Zaktualizowany"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Zaktualizowany"
        assert data["content_hash"] != old_hash
        assert data["revision"] == 2

    def test_update_scenario_not_found(self):
        fake_id = str(uuid4())
        resp = client.put(
            f"{BASE_URL}/fault-scenarios/{fake_id}",
            json={"name": "Nowa nazwa"},
        )
        assert resp.status_code == 404


class TestDeleteScenario:
    def test_delete_scenario(self):
        created = _create_scenario(case_id=CASE_ID)
        sid = created["scenario_id"]
        resp = client.delete(f"{BASE_URL}/fault-scenarios/{sid}")
        assert resp.status_code == 204

        # Verify deleted
        resp = client.get(f"{BASE_URL}/fault-scenarios/{sid}")
        assert resp.status_code == 404

    def test_delete_scenario_not_found(self):
        fake_id = str(uuid4())
        resp = client.delete(f"{BASE_URL}/fault-scenarios/{fake_id}")
        assert resp.status_code == 404


class TestSldOverlay:
    def test_get_sld_overlay(self):
        created = _create_scenario(case_id=CASE_ID, name="Overlay test")
        sid = created["scenario_id"]
        resp = client.get(f"{BASE_URL}/fault-scenarios/{sid}/sld-overlay")
        assert resp.status_code == 200
        data = resp.json()
        assert data["overlay_type"] == "fault_scenario"
        assert len(data["elements"]) == 1
        assert data["elements"][0]["element_ref"] == "bus-1"
        assert data["elements"][0]["visual_state"] == "WARNING"
        assert data["elements"][0]["color_token"] == "warning"
        assert len(data["legend"]) == 1
        assert "Zwarcie" in data["legend"][0]["label"]
        assert "Zwarcie" in data["label"]


class TestEligibility:
    @pytest.mark.parametrize("fault_type", ["SC_3F", "SC_2F", "SC_1F"])
    def test_get_eligibility_pusty_model_blokada_walidacji(self, fault_type):
        """Pusty model (bez źródła) — blokady walidacji ENM, te same dla KAŻDEGO typu zwarcia.

        Partia integracji 10: kwalifikowalność czyta tę samą ocenę modelu co `create_run`
        (`enm.canonical_analysis.ocen_model_biegu`). Dawniej SC_3F na pustym modelu dostawał
        „kwalifikuje się", a bieg był odrzucany; SC_2F dostawał blokadę „brak Z2" z fantomowego
        `z0_bus_data`, którego żaden bieg nie czytał.
        """
        from enm.canonical_analysis import KOD_MODEL_NIE_PRZESZEDL_WALIDACJI

        created = _create_scenario(case_id=CASE_ID, fault_type=fault_type)
        sid = created["scenario_id"]
        resp = client.get(f"{BASE_URL}/fault-scenarios/{sid}/eligibility")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "INELIGIBLE"
        assert data["blockers"]
        assert {b["code"] for b in data["blockers"]} == {KOD_MODEL_NIE_PRZESZEDL_WALIDACJI}
        assert not any("Z2" in b["message_pl"] for b in data["blockers"])

    def test_get_eligibility_branch_point_blocked(self):
        """(e) Lokalizacja BRANCH_POINT — BLOCKER z kodem kanonu (karta C6-PERSIST)."""
        resp = client.post(
            f"{BASE_URL}/study-cases/{CASE_ID}/fault-scenarios",
            json={
                "name": "Zwarcie na gałęzi",
                "fault_type": "SC_3F",
                "location": {
                    "element_ref": "branch-1",
                    "location_type": "BRANCH_POINT",
                    "position": 0.5,
                },
            },
        )
        assert resp.status_code == 201, resp.text
        sid = resp.json()["scenario_id"]

        eligibility = client.get(f"{BASE_URL}/fault-scenarios/{sid}/eligibility")
        assert eligibility.status_code == 200
        data = eligibility.json()
        assert data["status"] == "INELIGIBLE"
        codes = [b["code"] for b in data["blockers"]]
        assert "fault.location_on_branch_requires_assembler" in codes
