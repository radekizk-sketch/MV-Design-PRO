"""D2 (RECENZJA_DER_SN_DOBORY_2026-07): testy API kaskadowego doboru toru DER-SN.

Endpoint czyta REALNE katalogi (TRAFO_SN_NN, kable SN, aparaty SN) i wiąże tolerancje
D1 — propozycja TR/kabla/pola z pełnym śladem. Przykład kanonu: PV 998 kW ⇒ 1000 kVA.
"""

from __future__ import annotations

import pytest


def test_der_selection_preview_998kw_cascade(app_client) -> None:
    response = app_client.post(
        "/api/solver/der-selection-preview",
        json={
            "sum_active_power_mw": 0.998,
            "inverter_output_kv": 0.4,
            "sn_bus_voltage_kv": 15.0,
            "cable_length_km": 1.0,
            "max_delta_u_pct": 2.0,
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert data["sum_apparent_power_mva"] == pytest.approx(0.998)
    tr = data["transformer"]
    assert tr["proposal"] is not None
    # Reguła doboru: najmniejsza Sn ≥ próg przy 15/0,4 kV = 1000 kVA (katalog niesie ten wpis).
    assert tr["proposal"]["sn_mva"] == pytest.approx(1.0)
    assert tr["proposal"]["primary_kv"] == pytest.approx(15.0)
    assert tr["proposal"]["secondary_kv"] == pytest.approx(0.4)
    assert tr["error_code"] is None
    assert len(tr["rejected"]) > 0  # ślad WHITE BOX: odrzuceni kandydaci z katalogu
    # D3 wym. 7: realne układy połączeń dla klasy 15/0,4 kV z katalogu (Dyn11 obecny).
    assert "Dyn11" in tr["available_vector_groups"]
    assert tr["proposal"]["vector_group"] == "Dyn11"

    # Prąd znamionowy TR (strona SN) i kaskada kabel/pole obecne.
    assert data["transformer_current_a"] == pytest.approx(1.0e6 / (3.0**0.5 * 15.0e3), rel=1e-6)
    assert data["cable"]["proposal"] is not None
    assert data["cable"]["proposal"]["rated_current_a"] >= data["cable"]["required_ampacity_a"]
    assert data["field_apparatus"]["proposal"] is not None
    assert (
        data["field_apparatus"]["proposal"]["in_a"] >= data["field_apparatus"]["required_current_a"]
    )


def test_der_selection_preview_deterministic(app_client) -> None:
    payload = {
        "sum_active_power_mw": 0.998,
        "inverter_output_kv": 0.4,
        "sn_bus_voltage_kv": 15.0,
        "cable_length_km": 1.0,
    }
    first = app_client.post("/api/solver/der-selection-preview", json=payload).json()
    second = app_client.post("/api/solver/der-selection-preview", json=payload).json()
    assert first == second


def test_der_selection_preview_no_transformer_skips_cascade(app_client) -> None:
    """ΣS ponad typoszereg TR blokowych ⇒ brak TR, kabel/pole pominięte (kaskada)."""
    response = app_client.post(
        "/api/solver/der-selection-preview",
        json={
            "sum_active_power_mw": 50.0,
            "inverter_output_kv": 0.4,
            "sn_bus_voltage_kv": 15.0,
            "cable_length_km": 1.0,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["transformer"]["proposal"] is None
    assert data["transformer"]["error_code"] == "converter.der_sn.dobor_tr_brak_kandydata"
    assert data["transformer_current_a"] is None
    assert data["cable"] is None
    assert data["field_apparatus"] is None


def test_der_selection_preview_rejects_invalid_input(app_client) -> None:
    response = app_client.post(
        "/api/solver/der-selection-preview",
        json={
            "sum_active_power_mw": -1.0,
            "inverter_output_kv": 0.4,
            "sn_bus_voltage_kv": 15.0,
            "cable_length_km": 1.0,
        },
    )
    assert response.status_code == 422
