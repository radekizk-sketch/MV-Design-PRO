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


# ===========================================================================
# Karta F-K7 (znalezisko Z6, V12K-207): warunki UŁOŻENIA kabla przez API
# ===========================================================================


def test_lista_warunkow_ulozenia_pochodzi_z_backendu(app_client) -> None:
    """Kreator nie może mieć własnej listy współczynników — to dane doborowe."""
    response = app_client.get("/api/solver/cable-laying-conditions")
    assert response.status_code == 200
    data = response.json()

    nazwy = [item["name"] for item in data["sets"]]
    assert nazwy == sorted(nazwy), "lista musi być deterministycznie posortowana"
    assert "warunki_katalogowe" in nazwy
    assert "ziemia_3_kable_warstwa_200mm" in nazwy
    assert data["default_name"] == "warunki_katalogowe"
    assert data["custom_name"] == "wlasne"
    # POWÓD krótkiej listy musi jechać z danymi, żeby nie wyglądała na tablicę norm.
    assert "nie interpoluje" in data["limitation_pl"]

    ziemia = next(item for item in data["sets"] if item["name"] == "ziemia_3_kable_warstwa_200mm")
    assert ziemia["total"] == pytest.approx(0.74538, abs=1e-9)
    assert ziemia["basis"].strip(), "zestaw bez podstawy dokumentowej nie może trafić do UI"


def test_brak_warunkow_ulozenia_zachowuje_dawne_zachowanie(app_client) -> None:
    """Pominięcie sekcji = warunki katalogowe: ten sam wynik + JAWNE założenie."""
    payload = {
        "sum_active_power_mw": 0.998,
        "inverter_output_kv": 0.4,
        "sn_bus_voltage_kv": 15.0,
        "cable_length_km": 1.0,
        "max_delta_u_pct": 2.0,
    }
    bez = app_client.post("/api/solver/der-selection-preview", json=payload).json()
    jawnie = app_client.post(
        "/api/solver/der-selection-preview",
        json={**payload, "laying_conditions": {"set_name": "warunki_katalogowe"}},
    ).json()
    assert bez == jawnie

    cable = bez["cable"]
    assert cable["derating_set"] == "warunki_katalogowe"
    assert cable["derating_total"] == pytest.approx(1.0)
    assert "WARUNKOW KATALOGOWYCH" in cable["derating_assumption_pl"]
    # Obciążalność skorygowana = katalogowa; obie liczby w odpowiedzi (bez mnożenia w UI).
    assert cable["proposal"]["effective_ampacity_a"] == pytest.approx(
        cable["proposal"]["rated_current_a"]
    )
    assert cable["proposal"]["derating_total"] == pytest.approx(1.0)


def test_warunki_ziemne_podnosza_przekroj_na_realnym_katalogu(app_client) -> None:
    """DOWÓD LICZBOWY na REALNYM katalogu, że warunki ułożenia zmieniają dobór.

    ΣP = 2,4 MW ⇒ TR 2,5 MVA ⇒ I_SN = 96,2 A; rezerwa kabla 0,3 ⇒ próg 125,1 A.
      warunki katalogowe: najmniejszy kabel 50 mm² (Iz 160 A ≥ 125,1 A) ⇒ 50 mm²
      ziemia/3 kable:     160 × 0,74538 = 119,3 A < 125,1 A ⇒ 50 mm² ODRZUCONY ⇒ 70 mm²
    """
    payload = {
        "sum_active_power_mw": 2.4,
        "inverter_output_kv": 0.4,
        "sn_bus_voltage_kv": 15.0,
        "cable_length_km": 1.0,
        "cable_reserve_pu": 0.3,
        "max_delta_u_pct": 2.0,
    }
    katalogowe = app_client.post("/api/solver/der-selection-preview", json=payload).json()
    w_ziemi = app_client.post(
        "/api/solver/der-selection-preview",
        json={**payload, "laying_conditions": {"set_name": "ziemia_3_kable_warstwa_200mm"}},
    ).json()

    assert katalogowe["cable"]["required_ampacity_a"] == pytest.approx(125.1, abs=0.1)
    assert katalogowe["cable"]["proposal"]["cross_section_mm2"] == pytest.approx(50.0)
    assert w_ziemi["cable"]["proposal"]["cross_section_mm2"] == pytest.approx(70.0)
    # Próg prądowy się NIE zmienił — zmieniła się obciążalność kandydatów.
    assert w_ziemi["cable"]["required_ampacity_a"] == pytest.approx(
        katalogowe["cable"]["required_ampacity_a"]
    )
    assert w_ziemi["cable"]["derating_total"] == pytest.approx(0.74538, abs=1e-9)
    propozycja = w_ziemi["cable"]["proposal"]
    assert propozycja["effective_ampacity_a"] == pytest.approx(
        propozycja["rated_current_a"] * 0.74538, abs=1e-6
    )
    # Ślad odrzucenia niesie rozbicie korekty (katalogowa × iloczyn).
    powody = " ".join(item["reason_pl"] for item in w_ziemi["cable"]["rejected"])
    assert "skorygowana" in powody
    assert "0.7454" in powody


def test_wlasne_wspolczynniki_bez_opisu_sa_odrzucane(app_client) -> None:
    """Fail-closed: bez opisu warunków wynik doboru nie dałby się obronić w projekcie."""
    payload = {
        "sum_active_power_mw": 0.998,
        "inverter_output_kv": 0.4,
        "sn_bus_voltage_kv": 15.0,
        "cable_length_km": 1.0,
        "laying_conditions": {
            "set_name": "wlasne",
            "f_grunt": 0.85,
            "f_wiazka": 1.0,
            "f_grupa": 0.8,
        },
    }
    response = app_client.post("/api/solver/der-selection-preview", json=payload)
    assert response.status_code == 422
    assert "opisu" in response.json()["detail"]


def test_nieznany_zestaw_warunkow_jest_odrzucany_przez_api(app_client) -> None:
    """Literówka w nazwie zestawu nie może cicho wrócić jako warunki katalogowe."""
    response = app_client.post(
        "/api/solver/der-selection-preview",
        json={
            "sum_active_power_mw": 0.998,
            "inverter_output_kv": 0.4,
            "sn_bus_voltage_kv": 15.0,
            "cable_length_km": 1.0,
            "laying_conditions": {"set_name": "ziemia_5_kabli"},
        },
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "Nieznany zestaw warunkow ulozenia" in detail
    assert "warunki_katalogowe" in detail


def test_wlasne_wspolczynniki_z_opisem_wchodza_do_doboru(app_client) -> None:
    """Warunki spoza listy podaje projektant WPROST — z opisem, który jedzie do śladu."""
    response = app_client.post(
        "/api/solver/der-selection-preview",
        json={
            "sum_active_power_mw": 2.4,
            "inverter_output_kv": 0.4,
            "sn_bus_voltage_kv": 15.0,
            "cable_length_km": 1.0,
            "cable_reserve_pu": 0.3,
            "laying_conditions": {
                "set_name": "wlasne",
                "f_grunt": 0.85,
                "f_wiazka": 1.0,
                "f_grupa": 0.9,
                "opis_pl": "Ziemia, 2 obwody w rurach oslonowych, odstep 300 mm",
            },
        },
    )
    assert response.status_code == 200
    cable = response.json()["cable"]
    assert cable["derating_set"] == "wlasne"
    assert cable["derating_total"] == pytest.approx(0.765, abs=1e-9)
    assert "rurach oslonowych" in cable["derating_assumption_pl"]
    # 160 × 0,765 = 122,4 A < 125,1 A ⇒ 50 mm² nie przechodzi także tu.
    assert cable["proposal"]["cross_section_mm2"] == pytest.approx(70.0)


def test_wspolczynniki_przy_nazwanym_zestawie_sa_odrzucane(app_client) -> None:
    """Współczynniki obok nazwanego zestawu nie mogą zostać cicho zignorowane.

    Nazwany zestaw ma swoje wartości — przyjęcie żądania i policzenie czegoś innego niż
    nadawca chciał byłoby cichą zmianą jego doboru.
    """
    response = app_client.post(
        "/api/solver/der-selection-preview",
        json={
            "sum_active_power_mw": 0.998,
            "inverter_output_kv": 0.4,
            "sn_bus_voltage_kv": 15.0,
            "cable_length_km": 1.0,
            "laying_conditions": {
                "set_name": "ziemia_3_kable_warstwa_200mm",
                "f_grunt": 0.5,
            },
        },
    )
    assert response.status_code == 422
    assert "f_grunt" in response.text


# ===========================================================================
# Karta F-K7: koncowka korekty obciazalnosci (rachunek przeniesiony z frontu)
# ===========================================================================


def test_korekta_obciazalnosci_liczy_backend_z_werdyktem(app_client) -> None:
    """Excel MT880: 285 A × 0,74538 = 212,43 A; I_obl = 162,06 A ⇒ kryterium spełnione."""
    response = app_client.post(
        "/api/solver/cable-ampacity-derating-preview",
        json={
            "rated_ampacity_a": 285.0,
            "design_current_a": 162.06,
            "laying_conditions": {"set_name": "ziemia_3_kable_warstwa_200mm"},
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["effective_ampacity_a"] == pytest.approx(212.4333, abs=1e-3)
    assert data["derating_total"] == pytest.approx(0.74538, abs=1e-9)
    assert data["ok"] is True
    assert data["utilization_pct"] == pytest.approx(162.06 / 212.4333 * 100.0, abs=1e-3)
    assert "ziemia" in data["assumption_pl"].lower()


def test_korekta_obciazalnosci_bez_warunkow_daje_wartosc_katalogowa(app_client) -> None:
    """Brak warunków = obciążalność katalogowa, ale z JAWNYM założeniem w odpowiedzi."""
    data = app_client.post(
        "/api/solver/cable-ampacity-derating-preview",
        json={"rated_ampacity_a": 285.0, "design_current_a": 250.0},
    ).json()
    assert data["effective_ampacity_a"] == pytest.approx(285.0)
    assert data["derating_total"] == pytest.approx(1.0)
    assert data["derating_set"] == "warunki_katalogowe"
    assert data["ok"] is True
    assert "WARUNKOW KATALOGOWYCH" in data["assumption_pl"]


def test_korekta_obciazalnosci_zglasza_przekroczenie(app_client) -> None:
    """I_obl 250 A > I′z 212,4 A ⇒ kryterium NIESPEŁNIONE, wykorzystanie > 100 %."""
    data = app_client.post(
        "/api/solver/cable-ampacity-derating-preview",
        json={
            "rated_ampacity_a": 285.0,
            "design_current_a": 250.0,
            "laying_conditions": {"set_name": "ziemia_3_kable_warstwa_200mm"},
        },
    ).json()
    assert data["ok"] is False
    assert data["utilization_pct"] > 100.0
