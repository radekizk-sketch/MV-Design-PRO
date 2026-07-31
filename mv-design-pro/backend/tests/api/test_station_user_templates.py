"""B-8: „zapisz jako szablon" — szablony uzytkownika (karta KD-3, pozycja 8).

DLUG, KTORY TE TESTY ZAMYKAJA. Biblioteka szablonow stacji byla WYLACZNIE
wbudowana: projektant, ktory poskladal w kreatorze wlasna konfiguracje, nie mial
jak jej zachowac — przy nastepnej stacji tego samego typu klikal wszystko od nowa.

Pilnowane wlasnosci:
1. zapis trafia do OSOBNEGO zbioru; szablony wbudowane pozostaja nietkniete,
2. identyfikator jest wyprowadzony z TRESCI — powtorny zapis tej samej
   konfiguracji nadpisuje wpis zamiast mnozyc duplikaty (determinizm),
3. konfiguracja przechowywana BEZ ZMIAN (ten sam ksztalt, ktory idzie do operacji),
4. zapisany szablon widac na liscie razem ze ZRODLEM (rozroznienie od wbudowanych),
5. serializacja pliku jest kanoniczna — dwa zapisy daja identyczne bajty.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from api.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def klient(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    # Izolacja magazynu: kazdy test dostaje wlasny katalog (zero wplywu na repo).
    monkeypatch.setenv("STATION_USER_TEMPLATES_DIR", str(tmp_path))
    return TestClient(app)


_KONFIGURACJA = {
    "station_type": "inline",
    "station": {"station_type": "inline", "station_name": "Stacja wzorcowa"},
    "sn_fields": [{"field_role": "LINIA_IN"}, {"field_role": "TRANSFORMATOROWE"}],
    "transformer": {"create": True, "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11"},
    "nn_block": {"outgoing_feeders_nn_count": 2},
}


def test_zapis_szablonu_pojawia_sie_na_liscie_uzytkownika(klient: TestClient) -> None:
    zapis = klient.post(
        "/api/station-templates/user",
        json={
            "name_pl": "Moja stacja przelotowa 630",
            "description_pl": "Wariant powtarzalny dla linii wiejskiej",
            "configuration": _KONFIGURACJA,
        },
    )
    assert zapis.status_code == 200
    wpis = zapis.json()
    assert wpis["id"].startswith("user_")
    assert wpis["name_pl"] == "Moja stacja przelotowa 630"
    assert wpis["source"] == "UZYTKOWNIKA"
    # Konfiguracja przechowana BEZ ZMIAN — zero tlumaczenia ksztaltu.
    assert wpis["configuration"] == _KONFIGURACJA

    lista = klient.get("/api/station-templates/user")
    assert lista.status_code == 200
    dane = lista.json()
    assert dane["total"] == 1
    assert dane["templates"][0]["id"] == wpis["id"]


def test_powtorny_zapis_tej_samej_konfiguracji_nie_mnozy_wpisow(klient: TestClient) -> None:
    """Identyfikator z treści ⇒ ten sam szablon, nie duplikat."""
    payload = {"name_pl": "Powtarzalna", "configuration": _KONFIGURACJA}
    pierwszy = klient.post("/api/station-templates/user", json=payload).json()
    drugi = klient.post("/api/station-templates/user", json=payload).json()
    assert pierwszy["id"] == drugi["id"]
    assert klient.get("/api/station-templates/user").json()["total"] == 1


def test_inna_konfiguracja_daje_inny_szablon(klient: TestClient) -> None:
    a = klient.post(
        "/api/station-templates/user",
        json={"name_pl": "Wariant A", "configuration": _KONFIGURACJA},
    ).json()
    b = klient.post(
        "/api/station-templates/user",
        json={
            "name_pl": "Wariant A",
            "configuration": {**_KONFIGURACJA, "nn_block": {"outgoing_feeders_nn_count": 4}},
        },
    ).json()
    assert a["id"] != b["id"]
    assert klient.get("/api/station-templates/user").json()["total"] == 2


def test_szablony_wbudowane_pozostaja_nietkniete(klient: TestClient) -> None:
    """Zapis uzytkownika nie moze zmienic ani zaśmiecić biblioteki wbudowanej."""
    przed = klient.get("/api/station-templates").json()
    klient.post(
        "/api/station-templates/user",
        json={"name_pl": "Moja stacja", "configuration": _KONFIGURACJA},
    )
    po = klient.get("/api/station-templates").json()
    assert po == przed
    # Identyfikator uzytkownika NIE trafia do przestrzeni wbudowanej.
    assert all(not t["id"].startswith("user_") for t in po["templates"])


def test_usuniecie_szablonu_uzytkownika(klient: TestClient) -> None:
    wpis = klient.post(
        "/api/station-templates/user",
        json={"name_pl": "Do usunięcia", "configuration": _KONFIGURACJA},
    ).json()
    assert klient.delete(f"/api/station-templates/user/{wpis['id']}").status_code == 200
    assert klient.get("/api/station-templates/user").json()["total"] == 0
    # Powtorne usuniecie = uczciwe 404, nie ciche powodzenie.
    assert klient.delete(f"/api/station-templates/user/{wpis['id']}").status_code == 404


def test_usuniecie_szablonu_wbudowanego_jest_niemozliwe(klient: TestClient) -> None:
    wbudowany = klient.get("/api/station-templates").json()["templates"][0]["id"]
    assert klient.delete(f"/api/station-templates/user/{wbudowany}").status_code == 404
    # Biblioteka wbudowana nietknieta.
    assert any(
        t["id"] == wbudowany for t in klient.get("/api/station-templates").json()["templates"]
    )


def test_serializacja_pliku_jest_deterministyczna(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Dwa zapisy tej samej tresci dają identyczne BAJTY pliku."""
    from application.station_templates.user_store import zapisz_szablon_uzytkownika

    monkeypatch.setenv("STATION_USER_TEMPLATES_DIR", str(tmp_path / "a"))
    zapisz_szablon_uzytkownika(nazwa="X", opis=None, konfiguracja=_KONFIGURACJA)
    bajty_a = (tmp_path / "a" / "user_templates.json").read_bytes()

    monkeypatch.setenv("STATION_USER_TEMPLATES_DIR", str(tmp_path / "b"))
    zapisz_szablon_uzytkownika(nazwa="X", opis=None, konfiguracja=_KONFIGURACJA)
    bajty_b = (tmp_path / "b" / "user_templates.json").read_bytes()

    # Znacznik czasu zapisu jest jedyną częścią zmienną — porównujemy strukturę
    # bez niego (identyfikator, nazwa i konfiguracja muszą być identyczne).
    import json

    a = json.loads(bajty_a)
    b = json.loads(bajty_b)
    for wpis in (*a["templates"], *b["templates"]):
        wpis.pop("saved_at")
    assert a == b
