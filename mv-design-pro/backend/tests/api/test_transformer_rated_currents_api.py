from __future__ import annotations

import math

import pytest


def test_transformer_rated_currents_api_returns_solver_values(app_client) -> None:
    response = app_client.post(
        "/api/solver/transformer-rated-currents-preview",
        json={
            "rated_power_kva": 630.0,
            "primary_voltage_kv": 15.0,
            "secondary_voltage_kv": 0.4,
        },
    )

    assert response.status_code == 200
    data = response.json()
    expected_i1 = (630.0 * 1000.0) / (math.sqrt(3.0) * 15.0 * 1000.0)
    expected_i2 = (630.0 * 1000.0) / (math.sqrt(3.0) * 0.4 * 1000.0)
    assert data["primary_current_a"] == pytest.approx(expected_i1, abs=1e-6)
    assert data["secondary_current_a"] == pytest.approx(expected_i2, abs=1e-6)
    assert data["assumptions"]


def test_transformer_rated_currents_api_rejects_zero_power(app_client) -> None:
    response = app_client.post(
        "/api/solver/transformer-rated-currents-preview",
        json={
            "rated_power_kva": 0.0,
            "primary_voltage_kv": 15.0,
            "secondary_voltage_kv": 0.4,
        },
    )

    assert response.status_code == 422
    assert "Moc" in response.json()["detail"]
