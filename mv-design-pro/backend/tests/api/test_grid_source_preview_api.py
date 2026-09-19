from __future__ import annotations

import math

import pytest

SQRT3 = math.sqrt(3.0)


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


# CV-4.3 K7: blok `min` podglądu (solver FROZEN wołany drugi raz z danymi MIN).


def test_podglad_api_blok_min(app_client) -> None:
    odp = app_client.post(
        "/api/solver/grid-source-preview",
        json={"voltage_kv": 15.0, "sk3_mva": 250.0, "rx_ratio": 0.1, "sk3_min_mva": 150.0},
    )
    assert odp.status_code == 200, odp.text
    dane = odp.json()
    assert dane["ik3_ka"] == pytest.approx(250.0 / (SQRT3 * 15.0))
    assert dane["scenariusz_min"]["ik3_ka"] == pytest.approx(150.0 / (SQRT3 * 15.0))
    assert dane["scenariusz_min"]["sk_mva"] == pytest.approx(150.0)
    assert (
        dane["scenariusz_min"]["tryb_danych"] == "MOC_ZWARCIOWA"
        and dane["scenariusz_min"]["rx_ratio_zrodlo"] == "MODEL_MAX"
    )
    assert dane["scenariusz_min"]["z1_ohm"]["x_ohm"] > dane["z1_ohm"]["x_ohm"]


def test_podglad_api_blok_min_z_pradu_i_rx_min(app_client) -> None:
    odp = app_client.post(
        "/api/solver/grid-source-preview",
        json={
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "ik3_min_ka": 5.0,
            "rx_ratio_min": 0.3,
        },
    )
    assert odp.status_code == 200, odp.text
    blok = odp.json()["scenariusz_min"]
    assert blok["ik3_ka"] == pytest.approx(5.0) and blok["tryb_danych"] == "PRAD_ZWARCIOWY"
    assert blok["rx_ratio_zrodlo"] == "MODEL_MIN"
    assert blok["z1_ohm"]["r_ohm"] / blok["z1_ohm"]["x_ohm"] == pytest.approx(0.3)


def test_podglad_api_bez_danych_min_i_odmowy(app_client) -> None:
    odp = app_client.post(
        "/api/solver/grid-source-preview",
        json={"voltage_kv": 15.0, "sk3_mva": 250.0, "rx_ratio": 0.1},
    )
    assert odp.status_code == 200 and odp.json()["scenariusz_min"] is None
    odp = app_client.post(
        "/api/solver/grid-source-preview",
        json={
            "voltage_kv": 15.0,
            "short_circuit_mode": "IMPEDANCE",
            "r_ohm": 0.09,
            "x_ohm": 0.9,
            "sk3_min_mva": 150.0,
        },
    )
    assert odp.status_code == 422 and "MIN" in odp.json()["detail"]
    odp = app_client.post(
        "/api/solver/grid-source-preview",
        json={"voltage_kv": 15.0, "sk3_mva": 250.0, "rx_ratio": 0.1, "sk3_min_mva": 300.0},
    )
    assert odp.status_code == 422 and "przekracza" in odp.json()["detail"]
    odp = app_client.post(
        "/api/solver/grid-source-preview",
        json={"voltage_kv": 15.0, "sk3_mva": 250.0, "rx_ratio": 0.1, "rx_ratio_min": 0.2},
    )
    assert odp.status_code == 422 and "rx_ratio_min" in odp.json()["detail"]
