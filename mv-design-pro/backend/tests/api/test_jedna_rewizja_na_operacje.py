"""Jedna operacja domenowa = dokładnie jedna nowa rewizja modelu.

DEFEKT (karta JEDNA-SCIEZKA-EDYCJI cz. 4). Operacja pola nN zapisywała model, którego
odczyt nie był punktem stałym przygotowania modelu (`enm.store.przygotuj_model_po_odczycie`
— promocja pól nN do aparatów i szyn odpływów, migracje formatu, uzupełnienia katalogowe).
Zapis (`set_enm`) wykonywał z tej sekwencji wyłącznie uzupełnienia katalogowe, więc
NASTĘPNY odczyt modelu promował nowe pole nN i zapisywał DRUGĄ rewizję — bez operacji
w dzienniku zmian („rewizja migracji"). Projektant widział dwie rewizje na jeden klik,
a wynik policzony na rewizji operacji był od razu nieaktualny.

NAPRAWA u źródła: `set_enm` przygotowuje model TĄ SAMĄ funkcją, którą stosuje odczyt
(jedno źródło prawdy dla wejścia i wyjścia magazynu), więc zapisany model jest punktem
stałym odczytu — każda operacja (wspólny punkt zapisu `POST …/enm/domain-ops`) podnosi
rewizję dokładnie raz.

Test jedzie realną ścieżką projektanta: `POST /enm/domain-ops`, potem `GET /enm`
i `GET /enm/dziennik-zmian`. Cechy iloczynu: operacja (każda operacja pola nN
osiągalna na stacji SN/nN: odpływ, odbiór, źródło przekształtnikowe nN, agregat, UPS,
plus operacje SN budujące substrat) × liczba rewizji po operacji (+1 w odpowiedzi,
+0 przy kolejnym odczycie) × wpis dziennika (dokładnie jeden, z nazwą operacji).
"""

from __future__ import annotations

from typing import Any

import pytest
from api.main import app
from enm.dziennik_zmian import wyczysc_dziennik
from enm.store import przygotuj_model_po_odczycie, reset_enm_store
from fastapi.testclient import TestClient


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
    projekt = klient.post("/api/projects", json={"name": "Jedna rewizja na operację"})
    assert projekt.status_code == 201, projekt.text
    przypadek = klient.post(
        "/api/study-cases",
        json={"project_id": projekt.json()["id"], "name": "Przypadek rewizji"},
    )
    assert przypadek.status_code == 201, przypadek.text
    return str(przypadek.json()["id"])


def _rewizja(klient: TestClient, case_id: str) -> int:
    odp = klient.get(f"/api/cases/{case_id}/enm")
    assert odp.status_code == 200, odp.text
    return int(odp.json()["header"]["revision"])


def _operacja(
    klient: TestClient, case_id: str, nazwa: str, payload: dict[str, Any]
) -> dict[str, Any]:
    """Operacja + trzy asercje własności: +1 w odpowiedzi, +0 przy odczycie, jeden wpis."""
    przed = _rewizja(klient, case_id)
    odp = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {"name": nazwa, "idempotency_key": "", "payload": payload},
        },
    )
    assert odp.status_code == 200, f"{nazwa}: {odp.text[:400]}"
    cialo = odp.json()
    assert not cialo.get("error"), f"{nazwa}: {cialo.get('error')} ({cialo.get('error_code')})"
    migawka = cialo["snapshot"]
    assert migawka["header"]["revision"] == przed + 1, f"{nazwa}: odpowiedź nie niesie rewizji +1"
    # Kolejny odczyt (każdy ekran, każda następna operacja) nie może dopisać rewizji.
    assert _rewizja(klient, case_id) == przed + 1, f"{nazwa}: odczyt dopisał rewizję migracji"
    wpisy = klient.get(f"/api/cases/{case_id}/enm/dziennik-zmian?od_rewizji={przed}").json()[
        "wpisy"
    ]
    assert [w["operacja"] for w in wpisy] == [nazwa], f"{nazwa}: dziennik {wpisy}"
    return migawka


def _substrat(klient: TestClient, case_id: str) -> dict[str, Any]:
    _operacja(
        klient,
        case_id,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": "src-gpz-15kv-250mva-rx010"},
    )
    magistrala = _operacja(
        klient,
        case_id,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500, "catalog_ref": "cable-tfk-yakxs-3x120"}},
    )
    segmenty = magistrala["corridors"][0]["ordered_segment_refs"]
    return _operacja(
        klient,
        case_id,
        "insert_station_on_segment_sn",
        {
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "segment_id": segmenty[-1],
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
                "station_auxiliary": {"active_power_kw": 10.0, "cos_phi": 0.95},
                "nn_earthing": {"lv_system": "TN-S", "lv_voltage_tolerance": "PLUS_10"},
            },
            "sn_fields": ["IN", "OUT", "FEEDER", "TR"],
            "transformer": {
                "create": True,
                "catalog_binding": {
                    "catalog_namespace": "TRAFO_SN_NN",
                    "catalog_item_id": "tr-sn-nn-15-04-630kva-dyn11",
                    "catalog_item_version": "2024.1",
                },
            },
        },
    )


def _stacja_i_szyna_nn(migawka: dict[str, Any]) -> tuple[str, str]:
    stacja = next(
        s for s in migawka["substations"] if s.get("station_type") != "gpz" and s.get("bus_refs")
    )
    napiecia = {b["ref_id"]: b["voltage_kv"] for b in migawka["buses"]}
    szyna_nn = next(r for r in stacja["bus_refs"] if napiecia.get(r, 99.0) < 1.0)
    return stacja["ref_id"], szyna_nn


def test_kazda_operacja_pola_nn_podnosi_rewizje_dokladnie_raz(klient: TestClient) -> None:
    case_id = _nowy_przypadek(klient)
    stacja_ref, szyna_nn = _stacja_i_szyna_nn(_substrat(klient, case_id))

    po_polu = _operacja(
        klient,
        case_id,
        "add_nn_outgoing_field",
        {
            "station_ref": stacja_ref,
            "bus_nn_ref": szyna_nn,
            "field_name": "Odpływ testu rewizji",
            "catalog_ref": "cb_nn_630a",
        },
    )
    pole = next(b for b in po_polu["bays"] if b.get("name") == "Odpływ testu rewizji")
    _operacja(
        klient,
        case_id,
        "add_nn_load",
        {
            "feeder_ref": pole["ref_id"],
            "active_power_kw": 20.0,
            "cos_phi": 0.9,
            "load_name": "Odbiór testu rewizji",
            "catalog_ref": "load_przem_75kw",
        },
    )
    _operacja(
        klient,
        case_id,
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "station_ref": stacja_ref,
            "bus_nn_ref": szyna_nn,
            "source_name": "PV testu rewizji",
            "power_setpoint_mw": 0.05,
            "catalog_binding": {
                "catalog_namespace": "ZRODLO_NN_PV",
                "catalog_item_id": "conv-pv-nn-0p5mw-0p4kv",
                "catalog_item_version": "2024.1",
            },
            "source_field": {"field_name": "Pole PV testu rewizji", "source_field_kind": "PV"},
        },
    )
    _operacja(
        klient,
        case_id,
        "add_genset_nn",
        {
            "bus_nn_ref": szyna_nn,
            "station_ref": stacja_ref,
            "placement": "NEW_FIELD",
            "genset_spec": {
                "rated_power_kw": 400.0,
                "rated_voltage_kv": 0.4,
                "power_factor": 0.8,
                "operation_mode": "PRACA_AWARYJNA",
                "source_name": "Agregat testu rewizji",
            },
        },
    )
    _operacja(
        klient,
        case_id,
        "add_ups_nn",
        {
            "bus_nn_ref": szyna_nn,
            "station_ref": stacja_ref,
            "placement": "NEW_FIELD",
            "ups_spec": {
                "rated_power_kw": 120.0,
                "backup_time_min": 15.0,
                "source_name": "UPS testu rewizji",
            },
        },
    )


def test_model_zapisany_jest_punktem_stalym_odczytu(klient: TestClient) -> None:
    """Własność wspólnego punktu zapisu: przygotowanie odczytu nie zmienia zapisanego modelu."""
    from enm.models import EnergyNetworkModel

    case_id = _nowy_przypadek(klient)
    _substrat(klient, case_id)
    migawka = klient.get(f"/api/cases/{case_id}/enm").json()
    model = EnergyNetworkModel.model_validate(migawka)
    _, zmieniony = przygotuj_model_po_odczycie(model)
    assert zmieniony is False
