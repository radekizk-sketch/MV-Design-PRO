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


# ---------------------------------------------------------------------------
# Karta F-K5 / V12K-203: charakter mocy biernej falownika w API doboru toru.
# Kierunek mocy CZYNNEJ nie jest tu wyborem (tor DER oddaje moc do sieci), ale
# charakter Q jest — i decyduje o przekroju kabla.
# ---------------------------------------------------------------------------

_PAYLOAD_8KM = {
    "sum_active_power_mw": 0.998,
    "inverter_output_kv": 0.4,
    "sn_bus_voltage_kv": 15.0,
    # cos φ MUSI być podany, żeby charakter Q miał znaczenie fizyczne: przy cos φ = 1,0
    # sin φ = 0, więc człon bierny znika i wybór indukcyjny/pojemnościowy nie zmienia
    # niczego (osobny test poniżej pilnuje tej granicy).
    "cos_phi": 0.95,
    "cable_length_km": 8.0,
    "max_delta_u_pct": 1.0,
}


def test_brak_charakteru_q_zachowuje_dawne_zachowanie(app_client) -> None:
    """Pole jest opcjonalne: brak = indukcyjny (pobór Q), jak przed kartą."""
    payload = {
        "sum_active_power_mw": 0.998,
        "inverter_output_kv": 0.4,
        "sn_bus_voltage_kv": 15.0,
        "cable_length_km": 1.0,
    }
    bez = app_client.post("/api/solver/der-selection-preview", json=payload).json()
    jawnie = app_client.post(
        "/api/solver/der-selection-preview",
        json={**payload, "reactive_character": "inductive"},
    ).json()

    assert bez == jawnie
    cable = bez["cable"]
    # Tor DER oddaje moc czynną, więc ΔU jest WZROSTEM napięcia — i wynik to mówi.
    assert cable["flow_direction"] == "generation"
    assert cable["reactive_character"] == "inductive"
    assert cable["proposal"]["is_voltage_rise"] is True
    assert cable["proposal"]["delta_u_pct"] < 0.0


def test_oddawanie_q_wymusza_wiekszy_przekroj_kabla(app_client) -> None:
    """Rachunek niezależny: PV 998 kW, cos φ = 0,95, L = 8 km, |ΔU%| ≤ 1,0 %.

    ΣS = 0,998/0,95 = 1,0505 MVA ⇒ TR blokowy z katalogu 1,25 MVA,
    I_TR = 1,25 MVA/(√3·15 kV) = 48,1125 A, więc √3·I = 1,25e6/15e3 = 83,3333;
    sin φ = 0,31225.
    Żyła Cu 70 mm² (R = 0,268 Ω/km, X = 0,13 Ω/km), R_tot = 2,144 Ω, X_tot = 1,040 Ω:
      człon czynny = 83,3333 · 2,144 · 0,95 = 169,74 V
      człon bierny = 83,3333 · 1,040 · 0,31225 = 27,06 V
      pobór Q   ⇒ ΔU = −169,74 + 27,06 = −142,68 V = −0,9512 %  ⇒ MIEŚCI SIĘ
      oddanie Q ⇒ ΔU = −169,74 − 27,06 = −196,80 V = −1,3120 %  ⇒ ODRZUCONY
    Kolejny kandydat 95 mm² (R = 0,193, X = 0,122): R_tot = 1,544, X_tot = 0,976
      oddanie Q ⇒ ΔU = −(122,24 + 25,39) = −147,63 V = −0,9842 %  ⇒ propozycja.
    Sedno: charakter Q ZMIENIA dobór (70 → 95 mm²), a nie tylko opis wyniku —
    regulacja Q(U) falownika oszczędza cały stopień przekroju kabla.
    """
    z_poborem = app_client.post(
        "/api/solver/der-selection-preview",
        json={**_PAYLOAD_8KM, "reactive_character": "inductive"},
    ).json()
    z_oddawaniem = app_client.post(
        "/api/solver/der-selection-preview",
        json={**_PAYLOAD_8KM, "reactive_character": "capacitive"},
    ).json()

    assert z_poborem["cable"]["proposal"]["cross_section_mm2"] == pytest.approx(70.0)
    assert z_poborem["cable"]["proposal"]["delta_u_pct"] == pytest.approx(-0.9511, abs=0.001)
    assert z_oddawaniem["cable"]["proposal"]["cross_section_mm2"] == pytest.approx(95.0)
    assert z_oddawaniem["cable"]["proposal"]["delta_u_pct"] == pytest.approx(-0.9842, abs=0.001)
    assert z_oddawaniem["cable"]["reactive_character"] == "capacitive"
    assert z_oddawaniem["cable"]["proposal"]["is_voltage_rise"] is True
    # Oba warianty mieszczą się w limicie — różnica jest w KOSZCIE przekroju.
    assert abs(z_poborem["cable"]["proposal"]["delta_u_pct"]) <= 1.0
    assert abs(z_oddawaniem["cable"]["proposal"]["delta_u_pct"]) <= 1.0


def test_przy_cos_fi_rownym_jeden_charakter_q_nie_zmienia_niczego(app_client) -> None:
    """Granica fizyczna: cos φ = 1,0 ⇒ sin φ = 0 ⇒ człon bierny zeruje się.

    Test istnieje, żeby wybór charakteru Q nie stał się kontrolką pozorną: jeśli
    kiedyś zacznie zmieniać wynik przy cos φ = 1,0, znaczy to, że w rachunek weszła
    moc bierna, której nie ma.
    """
    payload = {**_PAYLOAD_8KM, "cos_phi": 1.0}
    ind = app_client.post(
        "/api/solver/der-selection-preview",
        json={**payload, "reactive_character": "inductive"},
    ).json()
    cap = app_client.post(
        "/api/solver/der-selection-preview",
        json={**payload, "reactive_character": "capacitive"},
    ).json()

    assert ind["cable"]["proposal"]["delta_u_v"] == pytest.approx(
        cap["cable"]["proposal"]["delta_u_v"]
    )
    assert ind["cable"]["proposal"]["cross_section_mm2"] == (
        cap["cable"]["proposal"]["cross_section_mm2"]
    )


def test_nieznany_charakter_q_jest_odrzucany(app_client) -> None:
    response = app_client.post(
        "/api/solver/der-selection-preview",
        json={**_PAYLOAD_8KM, "reactive_character": "pojemnosciowy"},
    )
    assert response.status_code == 422
    assert "reactive_character" in response.json()["detail"]
