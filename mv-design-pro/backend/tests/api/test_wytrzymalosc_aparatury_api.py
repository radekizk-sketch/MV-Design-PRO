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
def klient(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    yield TestClient(app)
    reset_enm_store()
    wyczysc_dziennik()


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
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": ZRODLO},
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
    station_ref = _stacja_z_polami(klient, "c-model")

    odp = klient.post(
        "/api/cases/c-model/enm/wytrzymalosc-aparatury",
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
    station_ref = _stacja_z_polami(klient, "c-det")
    zapytanie = {"station_ref": station_ref, "i_peak_ka": 10.0, "i_thermal_ka": 4.0}

    pierwsza = klient.post("/api/cases/c-det/enm/wytrzymalosc-aparatury", json=zapytanie).json()
    druga = klient.post("/api/cases/c-det/enm/wytrzymalosc-aparatury", json=zapytanie).json()

    assert pierwsza == druga


def test_stacja_spoza_modelu_nie_udaje_pustej(klient: TestClient):
    _stacja_z_polami(klient, "c-brak")

    odp = klient.post(
        "/api/cases/c-brak/enm/wytrzymalosc-aparatury",
        json={"station_ref": "nie-ma-takiej", "i_peak_ka": 10.0, "i_thermal_ka": 4.0},
    )
    assert odp.status_code == 200
    widok = odp.json()
    assert widok["status"] == "brak danych"
    assert widok["kody_gotowosci"] == ["aparatura.stacja_nieznana"]


def test_brak_pradow_z_biegu_daje_jawny_kod_gotowosci(klient: TestClient):
    station_ref = _stacja_z_polami(klient, "c-pusty")

    odp = klient.post(
        "/api/cases/c-pusty/enm/wytrzymalosc-aparatury",
        json={"station_ref": station_ref},
    )
    assert odp.status_code == 200
    widok = odp.json()
    assert widok["status"] == "brak danych"
    assert widok["kody_gotowosci"] == ["aparatura.brak_pradow_biegu"]


def test_czas_wylaczenia_pochodzi_z_nastaw_pola_i_niesie_rozbicie(klient: TestClient):
    """KD-6 poz. 3: czas kryterium cieplnego wyprowadzony z NASTAW, nie wpisany ręcznie."""
    station_ref = _stacja_z_polami(klient, "c-nastawy", z_zabezpieczeniem=True)

    odp = klient.post(
        "/api/cases/c-nastawy/enm/wytrzymalosc-aparatury",
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
    station_ref = _stacja_z_polami(klient, "c-bez-nastaw")

    odp = klient.post(
        "/api/cases/c-bez-nastaw/enm/wytrzymalosc-aparatury",
        json={
            "station_ref": station_ref,
            "i_peak_ka": 10.0,
            "i_thermal_ka": 4.0,
            "ik_ka": 8.0,
        },
    )
    widok = odp.json()

    assert widok["pola"], "Stacja ma pola z aparatami — werdykt dynamiczny nadal powstaje"
    for pole in widok["pola"]:
        assert pole["czas_wylaczenia"]["t_clearing_s"] is None
        assert "aparatura.czas_wylaczenia_nieustalony" in pole["kody_gotowosci"]
        # Kryterium dynamiczne rozstrzygnięte MIMO braku czasu.
        assert pole["werdykt"]["i_dyn_ok"] is True
        assert pole["werdykt"]["i_th_ok"] is None
