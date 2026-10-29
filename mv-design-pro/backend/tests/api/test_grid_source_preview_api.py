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
    # Odmowa nazywa wielkość słowami formularza źródła (moc zwarciowa Sk″), nie kluczem pola.
    assert "Sk″" in response.json()["detail"]
    assert "sk3_mva" not in response.json()["detail"]


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
    assert odp.status_code == 422 and "„Stosunek R/X (MIN)”" in odp.json()["detail"]
    assert "rx_ratio_min" not in odp.json()["detail"]


def _podglad_nn(app_client, tolerancja: str | None) -> dict:
    zadanie = {
        "voltage_kv": 0.4,
        "short_circuit_mode": "SHORT_CIRCUIT_POWER",
        "sk3_mva": 10.0,
        "rx_ratio": 0.3,
        "zero_sequence_enabled": False,
        "tk_s": 1.0,
    }
    if tolerancja is not None:
        zadanie["lv_voltage_tolerance"] = tolerancja
    odpowiedz = app_client.post("/api/solver/grid-source-preview", json=zadanie)
    assert odpowiedz.status_code == 200, odpowiedz.text
    return odpowiedz.json()


@pytest.mark.parametrize("tolerancja", ["PLUS_6", "PLUS_10", None])
def test_podglad_nn_bez_deklaracji_liczy_na_wartosci_roboczej_i_ja_nazywa(
    app_client, tolerancja: str | None
) -> None:
    """Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: U_nQ w paśmie nN bez deklaracji tolerancji nie
    jest odmową (dawny 422) — podgląd liczy z wartością roboczą +10 % i nazywa ją w
    `tolerancja_nn` (pochodzenie, powód, zdanie źródła). Z_Q = c·U²/S''_kQ, więc |Z_Q| przy
    +10 % do |Z_Q| przy +6 % = 1,10/1,05; deklaracja +10 % i wartość robocza dają te same
    liczby — różnią się wyłącznie pochodzeniem."""
    dane = _podglad_nn(app_client, tolerancja)
    tol = dane["tolerancja_nn"]
    assert tol["wartosc"] == (tolerancja or "PLUS_10")
    assert tol["wartosc_robocza"] is (tolerancja is None)
    assert tol["pochodzenie"] == ("PROPOZYCJA" if tolerancja is None else "DEKLARACJA")
    assert tol["powod_propozycji"] == ("BRAK_DEKLARACJI" if tolerancja is None else None)
    assert ("wartość robocza" in tol["opis_zrodla_pl"]) is (tolerancja is None)
    z6 = _podglad_nn(app_client, "PLUS_6")["z1_ohm"]
    z = dane["z1_ohm"]
    iloraz = {"PLUS_6": 1.0, "PLUS_10": 1.10 / 1.05, None: 1.10 / 1.05}[tolerancja]
    assert math.hypot(z["r_ohm"], z["x_ohm"]) == pytest.approx(
        iloraz * math.hypot(z6["r_ohm"], z6["x_ohm"]), rel=1e-12
    )


def test_podglad_sn_bez_tolerancji_nn(app_client) -> None:
    response = app_client.post(
        "/api/solver/grid-source-preview",
        json={
            "voltage_kv": 15.0,
            "short_circuit_mode": "SHORT_CIRCUIT_POWER",
            "sk3_mva": 310.0,
            "rx_ratio": 0.12,
            "zero_sequence_enabled": False,
            "tk_s": 1.0,
        },
    )
    assert response.status_code == 200
    assert response.json()["tolerancja_nn"] is None
