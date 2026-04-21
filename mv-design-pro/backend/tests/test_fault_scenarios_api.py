"""
Test Fault Scenarios API — PR-24

API contract tests using FastAPI TestClient.
All assertions use Polish error messages where applicable.
"""

from uuid import uuid4

import pytest
from api.main import app
from fastapi.testclient import TestClient

client = TestClient(app)

CASE_ID = str(uuid4())
BASE_URL = "/api/execution"


@pytest.fixture(autouse=True)
def _reset_service():
    """Reset the fault scenario service between tests."""
    from api.fault_scenarios import get_fault_scenario_service

    service = get_fault_scenario_service()
    service._scenarios.clear()
    service._case_scenarios.clear()
    service._scenario_runs.clear()
    yield


def _create_scenario(
    case_id: str = CASE_ID,
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
        data = _create_scenario(name="Mój scenariusz")
        assert data["name"] == "Mój scenariusz"
        assert data["fault_type"] == "SC_3F"
        assert data["analysis_type"] == "SC_3F"
        assert data["fault_impedance_type"] == "METALLIC"
        assert data["content_hash"] != ""
        assert data["created_at"] != ""
        assert data["updated_at"] != ""

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
        _create_scenario(name="Scenariusz A", element_ref="bus-a")
        _create_scenario(name="Scenariusz B", element_ref="bus-b")
        resp = client.get(f"{BASE_URL}/study-cases/{CASE_ID}/fault-scenarios")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 2
        assert len(data["scenarios"]) == 2

    def test_list_empty(self):
        new_case = str(uuid4())
        resp = client.get(f"{BASE_URL}/study-cases/{new_case}/fault-scenarios")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0


class TestGetScenario:
    def test_get_scenario(self):
        created = _create_scenario()
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
        created = _create_scenario(name="Oryginalny")
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

    def test_update_scenario_not_found(self):
        fake_id = str(uuid4())
        resp = client.put(
            f"{BASE_URL}/fault-scenarios/{fake_id}",
            json={"name": "Nowa nazwa"},
        )
        assert resp.status_code == 404


class TestDeleteScenario:
    def test_delete_scenario(self):
        created = _create_scenario()
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
        created = _create_scenario(name="Overlay test")
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
    def test_get_eligibility_sc3f(self):
        created = _create_scenario(fault_type="SC_3F")
        sid = created["scenario_id"]
        resp = client.get(f"{BASE_URL}/fault-scenarios/{sid}/eligibility")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ELIGIBLE"
        assert data["blockers"] == []

    def test_get_eligibility_sc2f_ineligible(self):
        created = _create_scenario(fault_type="SC_2F")
        sid = created["scenario_id"]
        resp = client.get(f"{BASE_URL}/fault-scenarios/{sid}/eligibility")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "INELIGIBLE"
        assert len(data["blockers"]) >= 1
        assert any("Z2" in b["message_pl"] for b in data["blockers"])
