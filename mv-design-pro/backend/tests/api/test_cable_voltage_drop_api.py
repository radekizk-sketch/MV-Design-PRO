from __future__ import annotations

import math

import pytest


def test_cable_voltage_drop_api_returns_solver_values(app_client) -> None:
    response = app_client.post(
        "/api/solver/cable-voltage-drop-preview",
        json={
            "current_a": 162.06,
            "length_km": 0.520,
            "r_ohm_per_km": 0.253,
            "x_ohm_per_km": 0.115,
            "cos_phi": 0.95,
            "line_voltage_v": 15000.0,
        },
    )

    assert response.status_code == 200
    data = response.json()
    sin_phi = math.sqrt(1.0 - 0.95**2)
    r_total = 0.253 * 0.520
    x_total = 0.115 * 0.520
    expected_v = math.sqrt(3.0) * 162.06 * (r_total * 0.95 + x_total * sin_phi)
    assert data["delta_u_v"] == pytest.approx(expected_v, abs=1e-6)
    assert data["delta_u_pct"] == pytest.approx(expected_v / 15000.0 * 100.0, abs=1e-6)
    assert data["r_total_ohm"] == pytest.approx(r_total, abs=1e-9)
    assert data["assumptions"]


def test_cable_voltage_drop_api_rejects_invalid_cos_phi(app_client) -> None:
    response = app_client.post(
        "/api/solver/cable-voltage-drop-preview",
        json={
            "current_a": 100.0,
            "length_km": 1.0,
            "r_ohm_per_km": 0.1,
            "x_ohm_per_km": 0.05,
            "cos_phi": 1.5,
            "line_voltage_v": 15000.0,
        },
    )

    assert response.status_code == 422
    assert "cos" in response.json()["detail"]


def test_cable_rated_current_api_returns_solver_values(app_client) -> None:
    response = app_client.post(
        "/api/solver/cable-rated-current-preview",
        json={"active_power_kw": 4000.0, "cos_phi": 0.95, "line_voltage_v": 15000.0},
    )

    assert response.status_code == 200
    data = response.json()
    expected = (4000.0 * 1000.0 / 0.95) / (math.sqrt(3.0) * 15000.0)
    assert data["rated_current_a"] == pytest.approx(expected, abs=1e-6)


def test_cable_rated_current_api_rejects_zero_power(app_client) -> None:
    response = app_client.post(
        "/api/solver/cable-rated-current-preview",
        json={"active_power_kw": 0.0, "cos_phi": 0.95, "line_voltage_v": 15000.0},
    )

    assert response.status_code == 422
    assert "Moc" in response.json()["detail"]
