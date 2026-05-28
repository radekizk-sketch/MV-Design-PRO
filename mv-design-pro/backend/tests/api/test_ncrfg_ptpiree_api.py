from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "ncrfg-api.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")

    from api.main import app

    with TestClient(app) as test_client:
        yield test_client


def test_ncrfg_catalog_endpoint_exposes_ptpiree_test_pack(client: TestClient) -> None:
    response = client.get("/api/ncrfg-tests/catalog")

    assert response.status_code == 200
    payload = response.json()
    assert payload["procedure_version"] == "PTPiREE Procedura testowania v3.0"
    assert len(payload["tests"]) == 20
    assert any(item["operator_id"] == "enea" for item in payload["operators"])


def test_ncrfg_run_endpoint_returns_trace_and_hash(client: TestClient) -> None:
    response = client.post(
        "/api/ncrfg-tests/run",
        json={
            "modules": [
                {
                    "der_ref": "pv-1",
                    "der_name": "PV 2 MW",
                    "der_kind": "PV",
                    "operator_id": "enea",
                    "p_max_kw": 2000,
                    "p_min_kw": 100,
                    "voltage_kv": 15,
                    "certificate_status": "ptpiree_verified",
                    "has_lvrt_curve": True,
                    "has_hvrt_curve": True,
                    "has_pf_droop": True,
                    "has_qu_curve": True,
                    "has_dynamic_model": True,
                    "has_scada_communication": True,
                    "has_disturbance_recorder": True,
                    "active_power_control_enabled": True,
                    "droop_percent": 5,
                    "dead_band_hz": 0.2,
                    "ramp_rate_pct_per_min": 10,
                    "cos_phi_min": 0.95,
                    "q_range_pct_pn_min": -0.33,
                    "q_range_pct_pn_max": 0.33,
                    "reactive_current_gain": 2,
                    "p_recovery_time_s": 0.8,
                    "harmonic_thdu_percent": 3,
                }
            ]
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["contract"] == "NcRfgPtpireeTestResultV1"
    assert payload["deterministic_hash"]
    assert payload["modules"][0]["module_type"] == "B"
    assert payload["white_box_trace"]
    assert payload["report_pl"].startswith("Raport symulacyjny NC RfG / PTPiREE")
