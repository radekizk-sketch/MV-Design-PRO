"""
Test Fault Scenario Run Integration - PR-24.

Integration tests for scenario -> run creation flow.
Golden fixture with SC_3F/SC_1F/SC_2F scenarios.
"""

from uuid import uuid4

import pytest
from api.main import app
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record

client: TestClient
CASE_ID: str
BASE_URL = "/api/execution"


@pytest.fixture(scope="module", autouse=True)
def _lifespan_i_przypadek():
    """Zwiąż `client`/`CASE_ID` z realnym `uow_factory` i realnym StudyCase.

    CV-1-W: `create_run_from_scenario` (`POST /fault-scenarios/{id}/runs`)
    tłumaczy `scenario.study_case_id` na klucz magazynu ENM (`klucz_twin_z_
    sciezki`), więc bez wiersza StudyCase w bazie dostaje 404 z magazynu ENM
    (inwariant I-2). Bez `with` (lifespan) `app.state.uow_factory` też nie
    byłby wiązany. `client`/`CASE_ID` zostają modułowymi globalami (styl
    pliku sprzed karty) — ta fikstura tylko wiąże je RAZ, zamiast tworzyć je
    przy imporcie modułu, poza cyklem życia testów.
    """
    global client, CASE_ID
    with TestClient(app) as test_client:
        client = test_client
        project_resp = client.post("/api/projects", json={"name": "Scenariusze zwarciowe — test"})
        assert project_resp.status_code == 201, project_resp.text
        case_resp = client.post(
            "/api/study-cases",
            json={"project_id": project_resp.json()["id"], "name": "Przypadek testu"},
        )
        assert case_resp.status_code == 201, case_resp.text
        CASE_ID = str(case_resp.json()["id"])
        yield


@pytest.fixture(autouse=True)
def _reset_services():
    """Reset legacy and canonical in-memory services between tests."""
    from api.execution_runs import get_engine
    from api.fault_scenarios import get_fault_scenario_service
    from application.twin_key import zapomnij_migracje
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    service = get_fault_scenario_service()
    service._scenarios.clear()
    service._case_scenarios.clear()
    service._scenario_runs.clear()

    engine = get_engine()
    engine._runs.clear()
    engine._result_sets.clear()
    engine._study_cases.clear()
    engine._case_runs.clear()

    reset_canonical_runs()
    reset_enm_store()
    # `CASE_ID` (i jego projekt) są modułowe — bez `zapomnij_migracje` drugi i
    # kolejny test tej klasy widziałby projekt jako JUŻ zmigrowany (pamięć
    # migracji przeżywa `reset_enm_store`, `application/twin_key.py`) i nie
    # adoptowałby świeżo zasianego wpisu `_seed_valid_enm` pod surowym kluczem.
    zapomnij_migracje()
    yield


def _seed_valid_enm(case_id: str) -> None:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Scenariusze zwarciowe",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000101",
                        "ref_id": "bus-main",
                        "name": "Szyna glowna",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000102",
                        "ref_id": "bus-1",
                        "name": "Szyna odplywu",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000103",
                        "ref_id": "branch-1",
                        "name": "Odcinek SN",
                        "tags": [],
                        "meta": {},
                        "type": "cable",
                        "from_bus_ref": "bus-main",
                        "to_bus_ref": "bus-1",
                        "status": "closed",
                        "catalog_ref": "KABEL_SN_TEST",
                        "parameter_source": "CATALOG",
                        "length_km": 0.2,
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.073,
                        "b_siemens_per_km": 2.6e-07,
                    }
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000104",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-main",
                            voltage_kv=15.0,
                            sk3_mva=250.0,
                            rx_ratio=0.10,
                        ),
                    }
                ],
                "transformers": [],
                "loads": [],
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


def _create_scenario(
    name: str = "Zwarcie testowe",
    fault_type: str = "SC_3F",
    element_ref: str = "bus-1",
) -> dict:
    response = client.post(
        f"{BASE_URL}/study-cases/{CASE_ID}/fault-scenarios",
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
    assert response.status_code == 201
    return response.json()


class TestCreateRunFromScenario:
    def test_create_run_from_scenario(self):
        """Create a run from a SC_3F scenario after seeding canonical ENM."""
        _seed_valid_enm(CASE_ID)
        scenario = _create_scenario(name="Run test 3F", fault_type="SC_3F")
        sid = scenario["scenario_id"]

        response = client.post(f"{BASE_URL}/fault-scenarios/{sid}/runs", json={})
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "PENDING"
        assert data["scenario_id"] == sid
        assert data["analysis_type"] == "SC_3F"

    def test_create_run_sc2f_blocked(self):
        """SC_2F without Z2 should be blocked by eligibility."""
        scenario = _create_scenario(name="Run test 2F", fault_type="SC_2F")
        sid = scenario["scenario_id"]

        response = client.post(f"{BASE_URL}/fault-scenarios/{sid}/runs", json={})
        assert response.status_code == 409
        assert "zablokowana" in response.json()["detail"].lower()

    def test_create_run_not_found(self):
        """Run creation for unknown scenario should fail."""
        fake_id = str(uuid4())
        response = client.post(f"{BASE_URL}/fault-scenarios/{fake_id}/runs", json={})
        assert response.status_code == 404


class TestGoldenFixture:
    """Golden fixture: minimal network with SC_3F, SC_1F, SC_2F scenarios."""

    def test_golden_sc3f_eligible(self):
        _seed_valid_enm(CASE_ID)
        scenario = _create_scenario(name="Golden 3F", fault_type="SC_3F", element_ref="bus-main")
        sid = scenario["scenario_id"]
        eligibility = client.get(f"{BASE_URL}/fault-scenarios/{sid}/eligibility").json()
        assert eligibility["status"] == "ELIGIBLE"

    def test_golden_sc2f_ineligible(self):
        _seed_valid_enm(CASE_ID)
        scenario = _create_scenario(name="Golden 2F", fault_type="SC_2F", element_ref="bus-main")
        sid = scenario["scenario_id"]
        eligibility = client.get(f"{BASE_URL}/fault-scenarios/{sid}/eligibility").json()
        assert eligibility["status"] == "INELIGIBLE"
        assert any("Z2" in blocker["message_pl"] for blocker in eligibility["blockers"])

    def test_golden_sc3f_run_creates(self):
        _seed_valid_enm(CASE_ID)
        scenario = _create_scenario(
            name="Golden run 3F", fault_type="SC_3F", element_ref="bus-main"
        )
        sid = scenario["scenario_id"]
        response = client.post(f"{BASE_URL}/fault-scenarios/{sid}/runs", json={})
        assert response.status_code == 201
        assert response.json()["analysis_type"] == "SC_3F"

    def test_golden_overlay_determinism(self):
        """Same scenario produces identical SLD overlay payload."""
        scenario = _create_scenario(name="Overlay det", fault_type="SC_3F", element_ref="bus-1")
        sid = scenario["scenario_id"]
        overlay_first = client.get(f"{BASE_URL}/fault-scenarios/{sid}/sld-overlay").json()
        overlay_second = client.get(f"{BASE_URL}/fault-scenarios/{sid}/sld-overlay").json()
        assert overlay_first == overlay_second

    def test_golden_hash_determinism(self):
        """Two scenarios with same content have same content_hash."""
        from domain.fault_scenario import (
            FaultLocation,
            FaultType,
            compute_scenario_content_hash,
            new_fault_scenario,
        )

        case_uuid = uuid4()
        first = new_fault_scenario(
            study_case_id=case_uuid,
            name="Det",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="bus-x", location_type="BUS"),
        )
        second = new_fault_scenario(
            study_case_id=case_uuid,
            name="Det",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="bus-x", location_type="BUS"),
        )
        assert compute_scenario_content_hash(first) == compute_scenario_content_hash(second)
