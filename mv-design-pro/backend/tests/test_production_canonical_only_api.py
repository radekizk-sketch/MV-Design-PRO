from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

import pytest
from api.main import app
from domain.analysis_run import AnalysisRun, new_analysis_run
from domain.models import OperatingCase, Project
from domain.project_design_mode import ProjectDesignMode
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_payload


def _reset_runtime_state() -> None:
    from api.power_flow_runs import _interpretation_cache
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    _interpretation_cache.clear()
    reset_canonical_runs()
    reset_enm_store()


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "canonical-only.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    _reset_runtime_state()
    with TestClient(app) as test_client:
        yield test_client
    _reset_runtime_state()


def _seed_project_and_case(client: TestClient) -> tuple[UUID, UUID]:
    project_id = uuid4()
    case_id = uuid4()
    with client.app.state.uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Projekt testowy"))
        uow.cases.add_operating_case(
            OperatingCase(
                id=case_id,
                project_id=project_id,
                name="Przypadek bazowy",
                case_payload={"base_mva": 100.0},
                project_design_mode=ProjectDesignMode.SN_NETWORK,
            )
        )
    return project_id, case_id


def _insert_legacy_run(
    client: TestClient,
    *,
    project_id: UUID,
    case_id: UUID,
    analysis_type: str,
) -> AnalysisRun:
    with client.app.state.uow_factory() as uow:
        run = new_analysis_run(
            project_id=project_id,
            operating_case_id=case_id,
            analysis_type=analysis_type,
            input_snapshot={"snapshot_id": "legacy-snapshot", "options": {}},
            input_hash=f"legacy-{analysis_type}-{case_id.hex}",
        )
        uow.analysis_runs.create(run)
        return uow.analysis_runs.update_status(
            run.id,
            "FINISHED",
            result_summary={"converged": True, "iterations": 2},
            trace_json={"nr_trace": []},
        )


def test_analysis_runs_router_ignores_legacy_analysis_run_rows(client: TestClient) -> None:
    project_id, case_id = _seed_project_and_case(client)
    legacy_run = _insert_legacy_run(
        client,
        project_id=project_id,
        case_id=case_id,
        analysis_type="short_circuit_sn",
    )

    list_response = client.get(f"/api/projects/{project_id}/analysis-runs")
    assert list_response.status_code == 200
    assert str(legacy_run.id) not in {item["id"] for item in list_response.json()["items"]}
    assert client.get(f"/projects/{project_id}/analysis-runs").status_code == 404

    detail_response = client.get(f"/api/analysis-runs/{legacy_run.id}")
    assert detail_response.status_code == 404
    assert detail_response.json()["detail"] == f"Nie znaleziono obliczenia {legacy_run.id}"
    assert client.get(f"/analysis-runs/{legacy_run.id}").status_code == 404


def test_power_flow_router_ignores_legacy_analysis_run_rows(client: TestClient) -> None:
    project_id, case_id = _seed_project_and_case(client)
    legacy_run = _insert_legacy_run(
        client,
        project_id=project_id,
        case_id=case_id,
        analysis_type="PF",
    )

    # Adresy MUSZA byc kanoniczne (`/api/...`, karta PREFIKSY). Gdyby zostal tu
    # stary prefiks, ponizsze asercje 404 przechodzilyby z ZLEGO POWODU — nie
    # dlatego, ze router pomija wiersz legacy, tylko dlatego, ze trasa w ogole
    # nie istnieje. Test przestalby pilnowac czegokolwiek.
    list_response = client.get(f"/api/projects/{project_id}/power-flow-runs")
    assert list_response.status_code == 200
    assert str(legacy_run.id) not in {item["id"] for item in list_response.json()["runs"]}

    assert client.get(f"/api/power-flow-runs/{legacy_run.id}").status_code == 404
    assert client.get(f"/api/power-flow-runs/{legacy_run.id}/trace").status_code == 404
    assert client.get(f"/api/power-flow-runs/{legacy_run.id}/export/json").status_code == 404
    assert client.get(f"/api/power-flow-runs/{legacy_run.id}/interpretation").status_code == 404


def test_sld_overlay_rejects_legacy_run_ids(client: TestClient) -> None:
    project_id, case_id = _seed_project_and_case(client)
    legacy_run = _insert_legacy_run(
        client,
        project_id=project_id,
        case_id=case_id,
        analysis_type="short_circuit_sn",
    )

    response = client.get(
        f"/api/projects/{project_id}/sld/{uuid4()}/overlay",
        params={"run_id": str(legacy_run.id)},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == f"Run {legacy_run.id} not found"


def test_main_app_no_longer_exposes_noncanonical_routers(client: TestClient) -> None:
    assert (
        client.post(
            "/analyses/design-synth/connection-study",
            json={"case_id": str(uuid4()), "base_snapshot_id": "snap-1", "spec_payload": {}},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/projects/{uuid4()}/protection-runs",
            json={"sc_run_id": str(uuid4()), "protection_case_id": str(uuid4())},
        ).status_code
        == 404
    )
    assert client.get(f"/api/results-workspace/{uuid4()}").status_code == 404
    assert client.get(f"/api/issues/study-cases/{uuid4()}/issues").status_code == 404
    assert (
        client.post(
            "/api/v1/domain-ops/execute",
            json={"operation": "add_grid_source_sn", "payload": {}, "meta": {}},
        ).status_code
        == 404
    )
    assert client.get("/api/protection-engine/v1/curve-types").status_code == 404
    assert (
        client.post(
            "/api/protection-engine/v1/execute",
            json={"relays": [], "test_points": []},
        ).status_code
        == 404
    )


def test_production_enm_has_single_public_write_path(client: TestClient) -> None:
    # `domain-ops` jest jedyna produkcyjna sciezka zapisu — musi wiec dzialac
    # naprawde, na REALNYM przypadku (CV-1-W: przypadek bez wiersza w bazie
    # dostaje 404 z magazynu ENM, inwariant I-2). `project_id` ponizej zostaje
    # NIEZALEZNYM, nieistniejacym identyfikatorem — te asercje pilnuja tras
    # katalogu dla tresci, ktorej NIGDY nie utworzono, nie tego przypadku.
    project_resp = client.post("/api/projects", json={"name": "Produkcyjna sciezka — test"})
    assert project_resp.status_code == 201, project_resp.text
    case_resp = client.post(
        "/api/study-cases",
        json={"project_id": project_resp.json()["id"], "name": "Przypadek testu"},
    )
    assert case_resp.status_code == 201, case_resp.text
    case_id = str(case_resp.json()["id"])
    project_id = str(uuid4())
    branch_id = str(uuid4())
    transformer_id = str(uuid4())
    switch_id = str(uuid4())

    domain_op = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "add_grid_source_sn",
                "payload": gpz_payload(voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.10),
            }
        },
    )
    assert domain_op.status_code == 200

    assert client.put(f"/api/cases/{case_id}/enm", json={}).status_code == 405
    assert client.post(
        f"/api/cases/{case_id}/enm/ops",
        json={"op": "create_node", "data": {}},
    ).status_code in {404, 405}
    assert (
        client.post(
            f"/api/cases/{case_id}/enm/ops/batch",
            json={"operations": []},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/cases/{case_id}/wizard/apply-step",
            json={"step_id": "K1", "data": {}},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/catalog/projects/{project_id}/branches/{branch_id}/type-ref",
            json={"type_id": str(uuid4())},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/catalog/projects/{project_id}/transformers/{transformer_id}/type-ref",
            json={"type_id": str(uuid4())},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/catalog/projects/{project_id}/switches/{switch_id}/equipment-type",
            json={"type_id": str(uuid4())},
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/catalog/projects/{project_id}/branches/{branch_id}/type-ref",
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/catalog/projects/{project_id}/transformers/{transformer_id}/type-ref",
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/catalog/projects/{project_id}/switches/{switch_id}/equipment-type",
        ).status_code
        == 404
    )
