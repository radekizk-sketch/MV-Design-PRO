"""Brama katalogowa stacji na końcu ciągu — PARYTET z wstawieniem w odcinek (D2/KARTA A).

Defekt (audyt szczytu 2026-08-01, D2): `append_station_on_endpoint` połykał błąd
materializacji katalogu. Transformator z nieistniejącą pozycją katalogową był
zapisywany z `source_mode: KATALOG`, `materialized_params: null` i impedancją
WPROST z payloadu — a zwarcie liczyło się na tej impedancji i wracało jako wynik
raportowalny (zmierzone: Ikss 23 753,1 A zamiast 19 391,1 A, +22,5 %).

Test jedzie REALNĄ ścieżką produkcyjną projektanta: `POST /enm/domain-ops`
(jedyna produkcyjna droga zmiany modelu). Sedno: ta sama literówka w refie
katalogowym musi być odrzucona TAK SAMO, niezależnie od tego, czy stacja kończy
ciąg, czy wchodzi w środek odcinka.
"""

from __future__ import annotations

from typing import Any

import pytest
from api.main import app
from enm.dziennik_zmian import wyczysc_dziennik
from enm.store import reset_enm_store
from fastapi.testclient import TestClient

REF_TRAFO_KATALOG = "tr-sn-nn-15-04-630kva-dyn11"
REF_TRAFO_LITEROWKA = "trafo-ktorego-nie-ma"
REF_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
REF_ZRODLO = "src-gpz-15kv-250mva-rx010"
REF_KABEL = "cable-tfk-yakxs-3x120"

GPZ = {
    "operation": {
        "name": "add_grid_source_sn",
        "payload": {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": REF_ZRODLO,
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
                "catalog_ref": REF_KABEL,
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


def _zbuduj_ciag(klient: TestClient, case_id: str) -> tuple[str, str]:
    """GPZ + odcinek SN. Zwraca (ref_szyny_koncowej, ref_odcinka)."""
    odp = klient.post(f"/api/cases/{case_id}/enm/domain-ops", json=GPZ)
    assert odp.status_code == 200, odp.text
    odp = klient.post(f"/api/cases/{case_id}/enm/domain-ops", json=MAGISTRALA)
    assert odp.status_code == 200, odp.text
    migawka = odp.json()["snapshot"]
    odcinek = migawka["branches"][-1]
    return odcinek["to_bus_ref"], odcinek["ref_id"]


def _payload_stacji_koncowej(
    endpoint_bus_ref: str,
    transformer: dict[str, Any],
) -> dict[str, Any]:
    return {
        "operation": {
            "name": "append_station_on_endpoint",
            "payload": {
                "endpoint_bus_ref": endpoint_bus_ref,
                "station": {"name": "Stacja końcowa", "station_type": "terminal"},
                "field_apparatus_catalog_ref": REF_APARAT_SN,
                "transformer": transformer,
                "nn_voltage_kv": 0.4,
            },
        }
    }


def _payload_stacji_w_odcinku(
    segment_ref: str,
    transformer: dict[str, Any],
) -> dict[str, Any]:
    return {
        "operation": {
            "name": "insert_station_on_segment_sn",
            "payload": {
                "segment_ref": segment_ref,
                "position_m": 250.0,
                "station": {"name": "Stacja w odcinku", "station_type": "mv_lv"},
                "field_apparatus_catalog_ref": REF_APARAT_SN,
                "transformer": transformer,
                "nn_voltage_kv": 0.4,
            },
        }
    }


def test_ta_sama_literowka_w_obu_torach_daje_ten_sam_blad_katalogu(klient: TestClient) -> None:
    """(a) PARYTET: identyczny zły ref → 422 catalog.item_not_found w OBU operacjach."""
    endpoint_koniec, _ = _zbuduj_ciag(klient, "parytet-koniec")
    _, odcinek_srodek = _zbuduj_ciag(klient, "parytet-srodek")

    tabliczka = {
        "transformer_catalog_ref": REF_TRAFO_LITEROWKA,
        "sn_mva": 0.63,
        "uk_percent": 4.0,
        "pk_kw": 6.5,
    }

    koniec = klient.post(
        "/api/cases/parytet-koniec/enm/domain-ops",
        json=_payload_stacji_koncowej(endpoint_koniec, tabliczka),
    )
    srodek = klient.post(
        "/api/cases/parytet-srodek/enm/domain-ops",
        json=_payload_stacji_w_odcinku(odcinek_srodek, tabliczka),
    )

    assert koniec.status_code == 422, koniec.text
    assert srodek.status_code == 422, srodek.text
    assert koniec.json()["detail"]["code"] == "catalog.item_not_found"
    assert srodek.json()["detail"]["code"] == "catalog.item_not_found"
    assert REF_TRAFO_LITEROWKA in koniec.json()["detail"]["message_pl"]
    # Komunikat po polsku, wskazujący PRZYCZYNĘ (nieistniejąca pozycja), nie objaw.
    assert "Nie znaleziono rekordu katalogu" in koniec.json()["detail"]["message_pl"]


def test_zly_ref_bez_tabliczki_tez_odrzucony_zamiast_blokady_o_braku_uk(
    klient: TestClient,
) -> None:
    """(b) Wariant bez tabliczki → też 422 catalog.item_not_found, nie E006 (brak uk)."""
    endpoint, _ = _zbuduj_ciag(klient, "bez-tabliczki")

    odp = klient.post(
        "/api/cases/bez-tabliczki/enm/domain-ops",
        json=_payload_stacji_koncowej(endpoint, {"transformer_catalog_ref": REF_TRAFO_LITEROWKA}),
    )

    assert odp.status_code == 422, odp.text
    assert odp.json()["detail"]["code"] == "catalog.item_not_found"

    # Model NIE został zmieniony: żadnego transformatora ani stacji z literówką.
    migawka = klient.get("/api/cases/bez-tabliczki/enm").json()
    assert all(
        tr.get("catalog_ref") != REF_TRAFO_LITEROWKA for tr in migawka.get("transformers", [])
    )


def test_poprawny_ref_przechodzi_i_daje_fizyke_z_katalogu(klient: TestClient) -> None:
    """Kontrola: dobry ref → 200, materializacja obecna, uk% z katalogu (nie z payloadu)."""
    endpoint, _ = _zbuduj_ciag(klient, "dobry-ref")

    odp = klient.post(
        "/api/cases/dobry-ref/enm/domain-ops",
        json=_payload_stacji_koncowej(
            endpoint,
            # Tabliczka w payloadzie jest CELOWO sprzeczna z katalogiem (uk 4,0 % vs 5,0 %):
            # fizyka ma pochodzić z katalogu, payload nie może jej wstrzyknąć (§10 kanonu).
            {
                "transformer_catalog_ref": REF_TRAFO_KATALOG,
                "sn_mva": 0.63,
                "uk_percent": 4.0,
                "pk_kw": 6.5,
            },
        ),
    )

    assert odp.status_code == 200, odp.text
    assert not odp.json().get("error")
    transformatory = odp.json()["snapshot"]["transformers"]
    tr = next(t for t in transformatory if t.get("catalog_ref") == REF_TRAFO_KATALOG)
    assert tr["source_mode"] == "KATALOG"
    assert tr["materialized_params"] is not None
    assert tr["materialized_params"]["catalog_item_id"] == REF_TRAFO_KATALOG
    assert tr["uk_percent"] == pytest.approx(5.0)


def test_stacja_bez_transformatora_nie_wymaga_pozycji_katalogowej_trafo(
    klient: TestClient,
) -> None:
    """Brama nie może blokować kanonicznej stacji BEZ transformatora.

    Operacja domenowa tworzy transformator wyłącznie, gdy podano jego ref —
    bez refa nie powstaje żaden element wiązany katalogiem TRAFO_SN_NN.
    """
    endpoint, _ = _zbuduj_ciag(klient, "bez-trafo")

    odp = klient.post(
        "/api/cases/bez-trafo/enm/domain-ops",
        json=_payload_stacji_koncowej(endpoint, {}),
    )

    assert odp.status_code == 200, odp.text
    assert not odp.json().get("error")
    migawka = odp.json()["snapshot"]
    stacja = next(s for s in migawka["substations"] if s.get("name") == "Stacja końcowa")
    assert stacja["transformer_refs"] == []


def test_operacja_stacji_koncowej_jest_w_rejestrze_operacji_katalogowych() -> None:
    """Bez wpisu w rejestrze brama API nie sprawdziłaby tej operacji w ogóle."""
    from api.domain_ops_policy import CATALOG_REQUIRED_OPERATIONS

    assert "append_station_on_endpoint" in CATALOG_REQUIRED_OPERATIONS
    # Parytet rejestru: obie operacje stacyjne stoją po tej samej stronie bramy.
    assert "insert_station_on_segment_sn" in CATALOG_REQUIRED_OPERATIONS
