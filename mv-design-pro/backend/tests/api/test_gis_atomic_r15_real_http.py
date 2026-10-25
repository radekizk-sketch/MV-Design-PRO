"""R15: test HTTP na REALNYCH operacjach domenowych i magazynie ENM.

Nie używa mocka solvera ani mocka dispatcherów ENM. Oddzielne uow_factory
i ENM_STORE_DIR są izolowane przez testową infrastrukturę repo.
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from api.enm import production_router as enm_router
from api.gis_atomic_r14 import router as gis_router
from domain.models import Project
from domain.study_case import StudyCase
from enm.store import reset_enm_store
from fastapi import FastAPI
from fastapi.testclient import TestClient
from tests.catalog_test_helpers import gpz_payload

LAB_TOKEN = "R15-SYNTHETIC-TEST-TOKEN-EXPLICIT-42"


@pytest.fixture(autouse=True)
def isolated_enm():
    reset_enm_store()
    yield
    reset_enm_store()


@pytest.fixture
def environment(uow_factory, monkeypatch):
    import api.gis_atomic_r14 as gis_api

    monkeypatch.setenv("MV_DESIGN_ENV", "testing")
    monkeypatch.setenv("MV_GIS_R14_ATOMIC_ENABLED", "1")
    monkeypatch.setenv("MV_GIS_R14_LAB_TOKEN", LAB_TOKEN)
    # TestClient ma hostname "testclient" zamiast gniazda loopback.
    # W TEŚCIE HTTP legalizujemy wyłącznie sztuczne połączenie do klienta
    # testowego; rzeczywista autoryzacja ma oddzielne testy R14/R15.
    monkeypatch.setattr(gis_api, "_allowed_environment", lambda _request: True)

    app = FastAPI()
    app.include_router(enm_router)
    app.include_router(gis_router)
    app.state.uow_factory = uow_factory
    client = TestClient(app)

    project_id, case_id = uuid4(), uuid4()
    with uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Laboratorium R15"), commit=False)
        uow.cases.add_study_case(
            StudyCase(id=case_id, project_id=project_id, name="Główna sieć SN"),
            commit=False,
        )
        uow.commit()
    return client, str(case_id)


def initial(client: TestClient, case_id: str) -> dict:
    response = client.get(f"/api/cases/{case_id}/enm")
    assert response.status_code == 200, response.text
    return response.json()


def request_model(hash_before: str, *, operations: list[dict]) -> dict:
    return {
        "schema_name": "MV-DIGPRO-R14-ATOMIC",
        "base_enm_hash": hash_before,
        "source_sha256": "a" * 64,
        "engineer_approved": True,
        "staged_geojson_verified": True,
        "confirmed_ports": True,
        "operations": operations,
    }


def grid_source_step() -> dict:
    return {
        "step_id": "SYN-01",
        "source_id": "DIGPRO-SOURCE-SYN",
        "name": "add_grid_source_sn",
        "idempotency_key": "r15-gpz-synthetic-0001",
        "payload": gpz_payload(voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.10),
    }


def post(client: TestClient, case_id: str, body: dict):
    return client.post(
        f"/api/gis-lab/r14/cases/{case_id}/atomic-import",
        json=body, headers={"X-GIS-R14-Lab-Token": LAB_TOKEN},
    )


def test_real_catalog_and_one_enm_revision(environment):
    client, case_id = environment
    before = initial(client, case_id)
    response = post(client, case_id, request_model(
        before["header"]["hash_sha256"], operations=[grid_source_step()],
    ))
    assert response.status_code == 200, response.text
    result = response.json()
    after = initial(client, case_id)
    assert result["committed_steps"] == 1
    assert result["revision"] == before["header"]["revision"] + 1
    assert result["hash_sha256"] == after["header"]["hash_sha256"]
    assert result["revision"] == after["header"]["revision"]
    assert len(after["sources"]) > len(before["sources"])
    assert result["created_refs"]
    assert result["production_approved"] is False


def test_second_invalid_step_cannot_commit_first(environment):
    client, case_id = environment
    before = initial(client, case_id)
    bad_second = {
        "step_id": "SYN-02", "source_id": "DIGPRO-CABLE-SYN",
        "name": "continue_trunk_segment_sn",
        "idempotency_key": "r15-bad-cable-0002",
        # Brak katalogu, identyfikatora magistrali i segment_spec.
        "payload": {"unknown_parameter": 123},
    }
    response = post(client, case_id, request_model(
        before["header"]["hash_sha256"], operations=[grid_source_step(), bad_second],
    ))
    assert response.status_code == 422, response.text
    after = initial(client, case_id)
    assert after["header"]["hash_sha256"] == before["header"]["hash_sha256"]
    assert after["header"]["revision"] == before["header"]["revision"]
    assert after["sources"] == before["sources"]


def test_stale_revision_fails_before_catalog_or_write(environment):
    client, case_id = environment
    before = initial(client, case_id)
    response = post(client, case_id, request_model(
        "f" * 64, operations=[grid_source_step()],
    ))
    assert response.status_code == 409, response.text
    assert initial(client, case_id)["header"]["hash_sha256"] == before["header"]["hash_sha256"]


def test_valid_import_then_identical_repeat_does_not_write_again(environment):
    client, case_id = environment
    before = initial(client, case_id)
    body = request_model(before["header"]["hash_sha256"], operations=[grid_source_step()])
    first = post(client, case_id, body)
    assert first.status_code == 200, first.text
    second = post(client, case_id, body)
    assert second.status_code == 409, second.text
    after = initial(client, case_id)
    assert after["header"]["revision"] == before["header"]["revision"] + 1
