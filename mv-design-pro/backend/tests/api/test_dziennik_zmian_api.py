"""Koncowka dziennika zmian — REALNA sciezka produkcyjna (V12K-264).

Test jedzie tam, gdzie jezdzi projektant: `POST /enm/domain-ops` (jedyna
produkcyjna droga zmiany modelu — `/enm/ops`, `/enm/ops/batch`, `PUT /enm` i
`wizard/apply-step` sa wylaczone w produkcji), a potem `GET /enm/dziennik-zmian`.

Sedno: wynik policzony na rewizji N musi dostac ODPOWIEDZ, ktora zmiana go
uniewaznila — z opisem operacji i lista dotknietych elementow, a nie stalym
napisem „model zmieniony".
"""

from __future__ import annotations

import pytest
from api.main import app
from enm.dziennik_zmian import wyczysc_dziennik
from enm.store import reset_enm_store
from fastapi.testclient import TestClient

GPZ = {
    "operation": {
        "name": "add_grid_source_sn",
        "payload": {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": "src-gpz-15kv-250mva-rx010",
        },
    }
}

MAGISTRALA = {
    "operation": {
        "name": "continue_trunk_segment_sn",
        "payload": {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 500,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            }
        },
    }
}


@pytest.fixture()
def klient(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    yield TestClient(app)
    reset_enm_store()
    wyczysc_dziennik()


def test_dziennik_pustego_przypadku_nie_klamie(klient: TestClient):
    odp = klient.get("/api/cases/pusty/enm/dziennik-zmian?od_rewizji=0")
    assert odp.status_code == 200
    dane = odp.json()
    assert dane["wpisy"] == []
    assert dane["rewizja_biezaca"] >= 1


def test_operacja_domenowa_zostawia_przyczyne_w_dzienniku(klient: TestClient):
    utworzenie = klient.post("/api/cases/c1/enm/domain-ops", json=GPZ)
    assert utworzenie.status_code == 200
    assert not utworzenie.json().get("error")
    rewizja_wyniku = utworzenie.json()["snapshot"]["header"]["revision"]

    # Projektant zmienia model PO policzeniu wyniku.
    zmiana = klient.post("/api/cases/c1/enm/domain-ops", json=MAGISTRALA)
    assert zmiana.status_code == 200
    assert not zmiana.json().get("error")

    dane = klient.get(f"/api/cases/c1/enm/dziennik-zmian?od_rewizji={rewizja_wyniku}").json()

    assert dane["aktualny"] is False
    assert len(dane["wpisy"]) == 1
    wpis = dane["wpisy"][0]
    assert wpis["operacja"] == "continue_trunk_segment_sn"
    # Opis z kanonu operacji, nie z identyfikatora.
    assert "magistrali" in wpis["opis_pl"].lower()
    # Elementy pochodza z `changes` operacji — sa realne, nie policzone tutaj.
    assert wpis["liczba_elementow"] > 0
    zmiany = zmiana.json()["changes"]
    assert wpis["utworzone"] == zmiany["created_element_ids"]


def test_wynik_na_biezacej_rewizji_nie_ma_czym_byc_uniewazniony(klient: TestClient):
    klient.post("/api/cases/c1/enm/domain-ops", json=GPZ)
    biezaca = klient.get("/api/cases/c1/enm").json()["header"]["revision"]

    dane = klient.get(f"/api/cases/c1/enm/dziennik-zmian?od_rewizji={biezaca}").json()
    assert dane["aktualny"] is True
    assert dane["wpisy"] == []


def test_kolejne_zmiany_daja_UPORZADKOWANA_liste_przyczyn(klient: TestClient):
    klient.post("/api/cases/c1/enm/domain-ops", json=GPZ)
    rewizja_wyniku = klient.get("/api/cases/c1/enm").json()["header"]["revision"]
    klient.post("/api/cases/c1/enm/domain-ops", json=MAGISTRALA)
    klient.post("/api/cases/c1/enm/domain-ops", json=MAGISTRALA)

    wpisy = klient.get(f"/api/cases/c1/enm/dziennik-zmian?od_rewizji={rewizja_wyniku}").json()[
        "wpisy"
    ]

    assert len(wpisy) == 2
    # Kolejnosc rosnaca po rewizji — projektant czyta historie od najstarszej zmiany.
    assert [w["rewizja"] for w in wpisy] == sorted(w["rewizja"] for w in wpisy)
    assert all(w["operacja"] == "continue_trunk_segment_sn" for w in wpisy)
