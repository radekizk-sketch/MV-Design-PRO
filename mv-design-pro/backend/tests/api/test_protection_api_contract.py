from __future__ import annotations

from dataclasses import replace
from uuid import uuid4

import pytest
from application.protection_analysis.service import ProtectionAnalysisService
from domain.protection_analysis import ProtectionRunStatus, new_protection_analysis_run

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


def test_protection_and_unified_run_routes_are_registered(app_client) -> None:
    route_paths = {route.path for route in app_client.app.routes}

    assert "/api/projects/{project_id}/protection-runs" in route_paths
    assert "/api/protection-runs/{run_id}/execute" in route_paths
    assert "/api/runs/short-circuit" in route_paths
    assert "/api/runs/power-flow" in route_paths
    assert "/api/runs/protection" in route_paths


def test_protection_run_read_uses_latest_status_entry() -> None:
    run = new_protection_analysis_run(
        project_id=uuid4(),
        sc_run_id=str(uuid4()),
        protection_case_id=uuid4(),
        input_snapshot={"scope": "protection"},
        input_hash="abc",
    )
    finished = replace(run, status=ProtectionRunStatus.FINISHED, result_summary={"total": 1})

    class Results:
        def list_results(self, run_id):
            assert run_id == run.id
            return [
                {"result_type": "protection_analysis_run", "payload": run.to_dict()},
                {"result_type": "protection_analysis_run", "payload": finished.to_dict()},
            ]

    class UnitOfWork:
        results = Results()

    service = ProtectionAnalysisService(lambda: None)

    assert service._get_run(UnitOfWork(), run.id).status == ProtectionRunStatus.FINISHED


def test_protection_catalog_lookup_uses_default_reference_catalog() -> None:
    class UnitOfWork:
        session = None

    service = ProtectionAnalysisService(lambda: None)

    template = service._get_template(UnitOfWork(), "template_ref_oc_ef_500")
    curve = service._get_curve(UnitOfWork(), "curve_iec_normal_inverse")
    device = service._get_device_type(UnitOfWork(), "REF-OC-EF-500")

    assert template is not None
    assert template.id == "template_ref_oc_ef_500"
    assert curve is not None
    assert curve.id == "curve_iec_normal_inverse"
    assert device is not None
    assert device.id == "REF-OC-EF-500"
