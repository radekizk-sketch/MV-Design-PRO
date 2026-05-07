from __future__ import annotations

import pytest


def test_grid_source_preview_api_returns_solver_values(app_client) -> None:
    response = app_client.post(
        "/api/solver/grid-source-preview",
        json={
            "voltage_kv": 15.0,
            "short_circuit_mode": "SHORT_CIRCUIT_POWER",
            "sk3_mva": 310.0,
            "rx_ratio": 0.12,
            "zero_sequence_enabled": True,
            "z0_z1_ratio": 3.2,
            "tk_s": 1.0,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["sk_mva"] == pytest.approx(310.0)
    assert data["ik3_ka"] == pytest.approx(310.0 / ((3.0**0.5) * 15.0))
    assert data["ik1_ka"] is not None
    assert data["z1_ohm"]["r_ohm"] > 0
    assert data["z1_ohm"]["x_ohm"] > 0
    assert data["z0_ohm"]["r_ohm"] == pytest.approx(data["z1_ohm"]["r_ohm"] * 3.2)
    assert data["z0_ohm"]["x_ohm"] == pytest.approx(data["z1_ohm"]["x_ohm"] * 3.2)
    assert data["formula_ref"] == "IEC 60909 / short_circuit_core"


def test_grid_source_preview_api_rejects_incomplete_input(app_client) -> None:
    response = app_client.post(
        "/api/solver/grid-source-preview",
        json={
            "voltage_kv": 15.0,
            "short_circuit_mode": "SHORT_CIRCUIT_POWER",
            "rx_ratio": 0.12,
        },
    )

    assert response.status_code == 422
    assert "sk3_mva" in response.json()["detail"]
