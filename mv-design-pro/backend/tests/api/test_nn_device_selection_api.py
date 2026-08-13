"""Kontrakt endpointu `GET /api/cases/{case_id}/enm/nn-device-selection`
(karta P0.7, §0.5/§0.6 — dobór aparatu zabezpieczającego nN per obwód)."""

from __future__ import annotations

from uuid import uuid4


def test_nn_device_selection_wymaga_parametrow(app_client) -> None:
    """`station_ref`, `bus_ref`, `ib_a`, `iz_prime_a` są WYMAGANE — brak = 422."""
    case_id = uuid4()
    assert app_client.get(f"/api/cases/{case_id}/enm/nn-device-selection").status_code == 422
    assert (
        app_client.get(
            f"/api/cases/{case_id}/enm/nn-device-selection",
            params={"station_ref": "ST-1", "bus_ref": "nn"},
        ).status_code
        == 422
    )


def test_nn_device_selection_melduje_brak_danych_zamiast_zgadywac(app_client) -> None:
    response = app_client.get(
        f"/api/cases/{uuid4()}/enm/nn-device-selection",
        params={
            "station_ref": "ST-NIEISTNIEJACA",
            "bus_ref": "nn",
            "ib_a": 10.0,
            "iz_prime_a": 20.0,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "brak danych"
    assert payload["missing_data"] == ["station"]
    assert payload["station_ref"] == "ST-NIEISTNIEJACA"
    assert payload["bus_ref"] == "nn"


def test_nn_device_selection_ik_max_ka_opcjonalny(app_client) -> None:
    """`ik_max_ka` jest opcjonalny — jego brak nie daje 422 (kryterium iii
    staje się wtedy NIEROZSTRZYGALNE per kandydat, nie błąd żądania)."""
    response = app_client.get(
        f"/api/cases/{uuid4()}/enm/nn-device-selection",
        params={"station_ref": "ST-X", "bus_ref": "nn", "ib_a": 10.0, "iz_prime_a": 20.0},
    )
    assert response.status_code == 200
