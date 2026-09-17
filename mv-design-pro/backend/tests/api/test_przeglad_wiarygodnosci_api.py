"""Kontrakt koncowek przegladu wiarygodnosci katalogu (karta KATALOG-NIEZMIENNIKI).

Przeglad jest ZDOLNOSCIA PRODUKTU, nie funkcja w tescie: musi byc osiagalny
trasa HTTP, niesc kod reguly, uzasadnienie i pokrycie, i NIGDY nie odmawiac.
Testy pilnuja rowniez tego, co jest latwe do zgubienia przy zielonym wyniku:
rodzina bez odstepstw musi powiedziec, ILE pozycji faktycznie policzyla, a ile
pominela i dlaczego — inaczej „zero do przegladu" jest nierozroznialne od
„niczego nie sprawdzono".
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from network_model.catalog.niezmienniki_katalogu import (
    KODY_WIARYGODNOSCI,
    RODZINY_BEZ_REGUL,
    RODZINY_PRZEGLADU,
)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "przeglad-wiarygodnosci.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")

    from api.main import app

    with TestClient(app) as test_client:
        yield test_client


def test_przeglad_calosci_niesie_komplet_rodzin(client: TestClient) -> None:
    odpowiedz = client.get("/api/catalog/przeglad-wiarygodnosci")
    assert odpowiedz.status_code == 200
    dane = odpowiedz.json()
    assert {r["rodzina"] for r in dane["rodziny"]} == set(RODZINY_PRZEGLADU)
    assert {r["rodzina"] for r in dane["rodziny_bez_regul"]} == set(RODZINY_BEZ_REGUL)
    assert all(r["powod"].strip() for r in dane["rodziny_bez_regul"])


def test_przeglad_niesie_uzasadnienie_kazdej_reguly(client: TestClient) -> None:
    """Front nie ma prawa miec wlasnej kopii uzasadnien — dostaje je z backendu."""
    dane = client.get("/api/catalog/przeglad-wiarygodnosci").json()
    assert {r["kod"] for r in dane["reguly"]} == set(KODY_WIARYGODNOSCI)
    for regula in dane["reguly"]:
        assert regula["nazwa"].strip()
        assert regula["podstawa"].strip()
        assert regula["uzasadnienie"].strip()


def test_kazda_rodzina_mowi_ile_policzyla_i_ile_pominela(client: TestClient) -> None:
    """Predykat przeciw cichemu zeru: suma policzonych i pominietych = liczba pozycji."""
    dane = client.get("/api/catalog/przeglad-wiarygodnosci").json()
    for rodzina in dane["rodziny"]:
        assert rodzina["pokrycie"], rodzina["rodzina"]
        for pokrycie in rodzina["pokrycie"]:
            assert pokrycie["policzone"] + pokrycie["pominiete"] == rodzina["liczba_pozycji"], (
                rodzina["rodzina"],
                pokrycie,
            )
            assert pokrycie["powod_pominiecia"].strip()
        assert rodzina["sprawdzone_reguly"] == [p["kod"] for p in rodzina["pokrycie"]]


def test_kazda_rodzina_niesie_niezerowa_liczbe_pozycji(client: TestClient) -> None:
    """Kontrola dodatnia: rodzina pusta znaczylaby, ze przeglad nic nie czyta."""
    dane = client.get("/api/catalog/przeglad-wiarygodnosci").json()
    for rodzina in dane["rodziny"]:
        assert rodzina["liczba_pozycji"] > 0, rodzina["rodzina"]


def test_suma_odstepstw_zgadza_sie_z_rodzinami(client: TestClient) -> None:
    dane = client.get("/api/catalog/przeglad-wiarygodnosci").json()
    assert dane["liczba_odstepstw"] == sum(r["liczba_odstepstw"] for r in dane["rodziny"])
    laczne: dict[str, int] = {}
    for rodzina in dane["rodziny"]:
        for kod, liczba in rodzina["wedlug_kodu"].items():
            laczne[kod] = laczne.get(kod, 0) + liczba
    assert dane["wedlug_kodu"] == laczne


@pytest.mark.parametrize("rodzina", sorted(RODZINY_PRZEGLADU))
def test_przeglad_jednej_rodziny(client: TestClient, rodzina: str) -> None:
    odpowiedz = client.get(f"/api/catalog/przeglad-wiarygodnosci/{rodzina}")
    assert odpowiedz.status_code == 200
    dane = odpowiedz.json()
    assert dane["rodzina"] == rodzina
    assert dane["etykieta_pl"].strip()
    assert dane["sprawdzone_reguly"] == list(RODZINY_PRZEGLADU[rodzina].kody)


def test_rodzina_spoza_przegladu_konczy_sie_404_z_lista(client: TestClient) -> None:
    odpowiedz = client.get("/api/catalog/przeglad-wiarygodnosci/nie-ma-takiej")
    assert odpowiedz.status_code == 404
    detail = odpowiedz.json()["detail"]
    assert "nie-ma-takiej" in detail
    for rodzina in RODZINY_PRZEGLADU:
        assert rodzina in detail


def test_przeglad_nigdy_nie_odmawia_i_jest_deterministyczny(client: TestClient) -> None:
    """Dwa odczyty tej samej wersji katalogu daja IDENTYCZNY wynik (determinizm)."""
    pierwszy = client.get("/api/catalog/przeglad-wiarygodnosci")
    drugi = client.get("/api/catalog/przeglad-wiarygodnosci")
    assert pierwszy.status_code == drugi.status_code == 200
    assert pierwszy.json() == drugi.json()


def test_odstepstwo_niesie_kod_regule_pozycje_i_wartosci(client: TestClient) -> None:
    """Ksztalt odstepstwa jest kontraktem NIEZALEZNYM od tego, czy dzis jakies jest.

    Na dzien karty zywy katalog nie lamie zadnej reguly wiarygodnosci (pomiar:
    521 sprawdzen, 0 odstepstw), wiec asercja „lista niepusta" byla by fikcja.
    Ksztalt sprawdzamy wiec na kazdym odstepstwie, ktore SIE POJAWI — i to jest
    asercja, ktora zadziala dokladnie w chwili, gdy pojawi sie pierwsze.
    """
    dane = client.get("/api/catalog/przeglad-wiarygodnosci").json()
    for rodzina in dane["rodziny"]:
        for odstepstwo in rodzina["odstepstwa"]:
            assert odstepstwo["kod"] in KODY_WIARYGODNOSCI
            assert odstepstwo["regula"].strip()
            assert odstepstwo["pozycja_id"].strip()
            assert odstepstwo["opis_wartosci"].strip()
