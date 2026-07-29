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


# ---------------------------------------------------------------------------
# Kierunek mocy i charakter mocy biernej (karta F-K5, dlug V12K-190)
# ---------------------------------------------------------------------------


def test_payload_bez_kierunkow_jest_bit_identyczny_z_dawnym(app_client) -> None:
    """Pola sa opcjonalne: brak kierunkow = odbior indukcyjny (dawne zachowanie)."""
    payload = {
        "current_a": 100.0,
        "length_km": 5.0,
        "r_ohm_per_km": 0.253,
        "x_ohm_per_km": 0.115,
        "cos_phi": 0.95,
        "line_voltage_v": 15000.0,
    }
    bez = app_client.post("/api/solver/cable-voltage-drop-preview", json=payload).json()
    jawnie = app_client.post(
        "/api/solver/cable-voltage-drop-preview",
        json={**payload, "flow_direction": "load", "reactive_character": "inductive"},
    ).json()

    assert bez["delta_u_v"] == jawnie["delta_u_v"]
    assert bez["is_voltage_rise"] is False
    assert bez["flow_direction"] == "load"
    assert bez["reactive_character"] == "inductive"


def test_generacja_daje_wzrost_napiecia_z_werdyktem(app_client) -> None:
    """Rachunek niezalezny dla TYCH parametrow: I = 100 A, L = 5 km, cos 0,95,
    R = 0,253 om/km, X = 0,115 om/km.

    R_tot = 1,2650 om; X_tot = 0,5750 om; sin fi = 0,31225.
    Odbior indukcyjny:  DU = sqrt(3)*100*(1,2650*0,95 + 0,5750*0,31225) = +239,25 V.
    OZE oddajace Q:     oba znaki ujemne => DU = -239,25 V, czyli WZROST napiecia
    o tej samej wartosci bezwzglednej. To jest ograniczenie przylaczeniowe, ktorego
    przed karta nie dalo sie w produkcie zobaczyc.
    """
    payload = {
        "current_a": 100.0,
        "length_km": 5.0,
        "r_ohm_per_km": 0.253,
        "x_ohm_per_km": 0.115,
        "cos_phi": 0.95,
        "line_voltage_v": 15000.0,
    }
    odbior = app_client.post("/api/solver/cable-voltage-drop-preview", json=payload).json()
    oze = app_client.post(
        "/api/solver/cable-voltage-drop-preview",
        json={**payload, "flow_direction": "generation", "reactive_character": "capacitive"},
    ).json()

    assert odbior["delta_u_v"] == pytest.approx(239.25, abs=0.02)
    assert oze["delta_u_v"] == pytest.approx(-239.25, abs=0.02)
    assert oze["is_voltage_rise"] is True
    assert oze["flow_direction"] == "generation"
    assert oze["reactive_character"] == "capacitive"


def test_oze_pobierajace_moc_bierna_tlumi_wzrost(app_client) -> None:
    """Regulacja Q(U): falownik oddaje P i POBIERA Q — wzrost jest MNIEJSZY.

    Rachunek niezalezny: -sqrt(3)*100*(1,2650*0,95 - 0,5750*0,31225) = -177,05 V,
    wobec -239,25 V przy oddawaniu Q. Tlumienie wzrostu o 62,20 V to wlasnie efekt,
    ktorego projektant szuka, dobierajac charakterystyke Q(U) falownika.
    """
    wynik = app_client.post(
        "/api/solver/cable-voltage-drop-preview",
        json={
            "current_a": 100.0,
            "length_km": 5.0,
            "r_ohm_per_km": 0.253,
            "x_ohm_per_km": 0.115,
            "cos_phi": 0.95,
            "line_voltage_v": 15000.0,
            "flow_direction": "generation",
            "reactive_character": "inductive",
        },
    ).json()

    assert wynik["delta_u_v"] == pytest.approx(-177.05, abs=0.02)
    assert wynik["is_voltage_rise"] is True


def test_nieznany_kierunek_jest_odrzucany(app_client) -> None:
    response = app_client.post(
        "/api/solver/cable-voltage-drop-preview",
        json={
            "current_a": 100.0,
            "length_km": 1.0,
            "r_ohm_per_km": 0.1,
            "x_ohm_per_km": 0.05,
            "cos_phi": 0.95,
            "line_voltage_v": 15000.0,
            "flow_direction": "w_obie_strony",
        },
    )

    assert response.status_code == 422
    assert "flow_direction" in response.json()["detail"]
