"""Końcówka werdyktów wytrzymałości aparatury pól — REALNA ścieżka (karta KD-6).

Sieć powstaje operacjami domenowymi (jedyna produkcyjna droga budowy modelu),
a stacja jest wstawiana z JAWNIE wskazaną pozycją katalogu APARAT_SN — dokładnie
tak, jak robi to kreator. Żaden aparat nie jest tu wstrzykiwany „na skróty",
więc test dowodzi, że werdykt naprawdę bierze się z modelu.
"""

from __future__ import annotations

from typing import Any

import pytest
from api.main import app
from enm.dziennik_zmian import wyczysc_dziennik
from enm.store import reset_enm_store
from fastapi.testclient import TestClient

APARAT_POLA = "sw-cb-abb-vd4-17kv-630a"
KABEL = "cable-tfk-yakxs-3x120"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
ZRODLO = "src-gpz-15kv-250mva-rx010"
CT = "ct_400_5_5p20_15va_abb"
PRZEKAZNIK = "REF-OC-100"


@pytest.fixture()
def klient(tmp_path, monkeypatch, uow_factory) -> TestClient:
    from api.dependencies import get_uow_factory

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    app.dependency_overrides[get_uow_factory] = lambda: uow_factory
    app.state.uow_factory = uow_factory
    yield TestClient(app)
    app.dependency_overrides.pop(get_uow_factory, None)
    app.state.uow_factory = None
    reset_enm_store()
    wyczysc_dziennik()


def _nowy_przypadek(klient: TestClient) -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2) — testy tego pliku potrzebują prawdziwej pary
    projekt+przypadek zamiast dowolnego napisu.
    """
    project_resp = klient.post("/api/projects", json={"name": "Wytrzymalosc aparatury — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = klient.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _operacja(klient: TestClient, case_id: str, nazwa: str, payload: dict) -> dict:
    odp = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": nazwa, "payload": payload}},
    )
    assert odp.status_code == 200, odp.text
    dane = odp.json()
    assert not dane.get("error"), dane.get("error")
    return dane


def _stacja_z_polami(klient: TestClient, case_id: str, *, z_zabezpieczeniem: bool = False) -> str:
    _operacja(
        klient,
        case_id,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": ZRODLO,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    odp = _operacja(
        klient,
        case_id,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": KABEL}},
    )
    segmenty = odp["snapshot"]["corridors"][0]["ordered_segment_refs"]
    # Wyposażenie pola (CT + przekaźnik z NASTAWAMI) powstaje w TEJ SAMEJ
    # operacji co stacja (B-3) — to produkcyjna droga zapisu nastaw pola.
    pole_in: Any = (
        {
            "field_role": "LINIA_IN",
            "equipment": {
                "ct": {
                    "catalog_ref": CT,
                    "ratio_primary_a": 400.0,
                    "ratio_secondary_a": 5.0,
                },
                "relay": {
                    "catalog_ref": PRZEKAZNIK,
                    "relay_type": "NADPRADOWY",
                    "settings": [
                        {
                            "function_type": "overcurrent_51",
                            "threshold_a": 400.0,
                            "curve_type": "DT",
                            "time_delay_s": 0.3,
                        }
                    ],
                },
            },
        }
        if z_zabezpieczeniem
        else "IN"
    )
    odp = _operacja(
        klient,
        case_id,
        "insert_station_on_segment_sn",
        {
            "field_apparatus_catalog_ref": APARAT_POLA,
            "segment_id": segmenty[-1],
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": [pole_in, "OUT"],
            "transformer": {
                "create": True,
                "catalog_binding": {
                    "catalog_namespace": "TRAFO_SN_NN",
                    "catalog_item_id": TRAFO,
                    "catalog_item_version": "2024.1",
                },
            },
        },
    )
    stacje = [s for s in odp["snapshot"]["substations"] if "/station" in s["ref_id"]]
    assert stacje, "Operacja musi utworzyć stację"
    return str(stacje[0]["ref_id"])


def test_werdykty_powstaja_z_modelu_bez_zadnej_konfiguracji(klient: TestClient):
    """SEDNO: żadnego zapisu konfiguracji — a pola stacji dostają werdykt."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)

    odp = klient.post(
        f"/api/cases/{case_id}/enm/wytrzymalosc-aparatury",
        json={"station_ref": station_ref, "i_peak_ka": 10.0, "i_thermal_ka": 4.0},
    )
    assert odp.status_code == 200, odp.text
    widok = odp.json()

    assert widok["status"] == "OK"
    assert widok["pola"], "Stacja z aparatami w modelu musi dać wiersze werdyktu"
    assert {p["zrodlo"] for p in widok["pola"]} == {"model"}
    for pole in widok["pola"]:
        assert pole["aparat_catalog_ref"] == APARAT_POLA
        # Znamiona z pozycji katalogu — z jawnym pochodzeniem każdej liczby.
        assert pole["znamiona"]["i_th_ka"] is not None
        assert pole["znamiona"]["i_th_pochodzenie"] == "producent"
        assert pole["znamiona"]["i_dyn_pochodzenie"] == "derived_iec62271"
        # Prąd udarowy 10 kA < I_dyn ⇒ kryterium dynamiczne rozstrzygnięte.
        assert pole["werdykt"]["i_dyn_ok"] is True


def test_koncowka_jest_deterministyczna(klient: TestClient):
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)
    zapytanie = {"station_ref": station_ref, "i_peak_ka": 10.0, "i_thermal_ka": 4.0}

    sciezka = f"/api/cases/{case_id}/enm/wytrzymalosc-aparatury"
    pierwsza_odp = klient.post(sciezka, json=zapytanie)
    druga_odp = klient.post(sciezka, json=zapytanie)
    # Przypina status PRZED porownaniem cial — dwie identyczne odpowiedzi
    # bledu (np. 404 tlumaczenia case_id) rownie chetnie przeszlyby ten
    # test (test maskujacy defekt).
    assert pierwsza_odp.status_code == 200, pierwsza_odp.text
    assert druga_odp.status_code == 200, druga_odp.text

    assert pierwsza_odp.json() == druga_odp.json()


def test_stacja_spoza_modelu_nie_udaje_pustej(klient: TestClient):
    case_id = _nowy_przypadek(klient)
    _stacja_z_polami(klient, case_id)

    odp = klient.post(
        f"/api/cases/{case_id}/enm/wytrzymalosc-aparatury",
        json={"station_ref": "nie-ma-takiej", "i_peak_ka": 10.0, "i_thermal_ka": 4.0},
    )
    assert odp.status_code == 200
    widok = odp.json()
    assert widok["status"] == "brak danych"
    assert widok["kody_gotowosci"] == ["aparatura.stacja_nieznana"]


def test_brak_pradow_z_biegu_daje_jawny_kod_gotowosci(klient: TestClient):
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)

    odp = klient.post(
        f"/api/cases/{case_id}/enm/wytrzymalosc-aparatury",
        json={"station_ref": station_ref},
    )
    assert odp.status_code == 200
    widok = odp.json()
    assert widok["status"] == "brak danych"
    assert widok["kody_gotowosci"] == ["aparatura.brak_pradow_biegu"]


def test_czas_wylaczenia_pochodzi_z_nastaw_pola_i_niesie_rozbicie(klient: TestClient):
    """KD-6 poz. 3: czas kryterium cieplnego wyprowadzony z NASTAW, nie wpisany ręcznie."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)

    odp = klient.post(
        f"/api/cases/{case_id}/enm/wytrzymalosc-aparatury",
        json={
            "station_ref": station_ref,
            "i_peak_ka": 10.0,
            "i_thermal_ka": 4.0,
            "ik_ka": 8.0,
        },
    )
    assert odp.status_code == 200, odp.text
    widok = odp.json()

    z_nastaw = [p for p in widok["pola"] if p["czas_wylaczenia"]["zrodlo"] == "nastawy_pola"]
    assert z_nastaw, "Pole z nastawami musi dostać czas wyprowadzony z charakterystyki"
    czas = z_nastaw[0]["czas_wylaczenia"]
    # WHITE BOX: oba człony osobno + ślad nastawy, z której czas powstał.
    assert czas["czlon_nastawczy_s"] == 0.3
    assert czas["t_clearing_s"] == 0.3
    assert czas["czas_wlasny_wylacznika_s"] is None
    assert czas["zalozenia_pl"], "Brak czasu własnego MUSI być powiedziany wprost"
    assert czas["funkcja"] == "overcurrent_51"
    assert czas["prad_zwarciowy_a"] == 8000.0
    # Czas domyka kryterium cieplne, które bez niego zostawało nierozstrzygnięte.
    assert z_nastaw[0]["werdykt"]["i_th_ok"] is True


def test_pole_bez_nastaw_dostaje_kod_gotowosci_zamiast_czasu_z_powietrza(klient: TestClient):
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)

    odp = klient.post(
        f"/api/cases/{case_id}/enm/wytrzymalosc-aparatury",
        json={
            "station_ref": station_ref,
            "i_peak_ka": 10.0,
            "i_thermal_ka": 4.0,
            "ik_ka": 8.0,
        },
    )
    assert odp.status_code == 200, odp.text
    widok = odp.json()

    assert widok["pola"], "Stacja ma pola z aparatami — werdykt dynamiczny nadal powstaje"
    for pole in widok["pola"]:
        assert pole["czas_wylaczenia"]["t_clearing_s"] is None
        assert "aparatura.czas_wylaczenia_nieustalony" in pole["kody_gotowosci"]
        # Kryterium dynamiczne rozstrzygnięte MIMO braku czasu.
        assert pole["werdykt"]["i_dyn_ok"] is True
        assert pole["werdykt"]["i_th_ok"] is None
