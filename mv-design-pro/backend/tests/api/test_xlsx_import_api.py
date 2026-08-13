"""Końcówki importu XLSX — kontrakt HTTP na realnym pliku (multipart, nie mock).

STAN PRZED (karta XLSX-IMPORT, 2026-08-07): końcówka `POST /api/import/xlsx` NIE
miała ani jednego testu kontraktu. Uruchomiona na poprawnym pliku zwracała 422
„Brak biblioteki openpyxl — zainstaluj: pip install openpyxl", bo biblioteki nie
było w zależnościach; a nawet gdyby była — wstrzykiwany `uow_factory` nie był
używany, więc import nie tworzył żadnego projektu ani migawki.
"""

from __future__ import annotations

import io

import pytest

openpyxl = pytest.importorskip("openpyxl")

TYP_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def zbuduj_skoroszyt(arkusze: list[tuple[str, list[list]]]) -> bytes:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for nazwa, wiersze in arkusze:
        ws = wb.create_sheet(nazwa)
        for wiersz in wiersze:
            ws.append(list(wiersz))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def arkusz_poprawny() -> bytes:
    return zbuduj_skoroszyt(
        [
            (
                "Szyny",
                [
                    ["id", "nazwa", "napięcie_kV"],
                    ["B1", "GPZ 15 kV", 15.0],
                    ["B2", "Stacja 1", 15.0],
                ],
            ),
            (
                "Linie",
                [
                    ["id", "szyna_pocz", "szyna_kon", "typ", "długość_km", "R_ohm_km", "X_ohm_km"],
                    ["L1", "B1", "B2", "AFL-6 120", 5.0, 0.253, 0.081],
                ],
            ),
            (
                "Źródła",
                [
                    ["id", "szyna", "typ", "Sk_MVA", "RX_ratio"],
                    ["Z1", "B1", "system", 500.0, 0.1],
                ],
            ),
        ]
    )


def arkusz_z_bledem() -> bytes:
    return zbuduj_skoroszyt(
        [
            ("Szyny", [["id", "nazwa", "napięcie_kV"], ["B1", "GPZ", 15.0]]),
            (
                "Linie",
                [
                    ["id", "szyna_pocz", "szyna_kon", "typ", "długość_km", "R_ohm_km", "X_ohm_km"],
                    ["L1", "B1", "NIE-MA", "AFL", 5.0, 0.25, 0.08],
                ],
            ),
        ]
    )


def _plik(nazwa: str, dane: bytes) -> dict:
    return {"file": (nazwa, dane, TYP_MIME)}


class TestPodglad:
    def test_podglad_zwraca_liczby_z_backendu(self, app_client):
        odpowiedz = app_client.post(
            "/api/import/xlsx/preview", files=_plik("siec.xlsx", arkusz_poprawny())
        )
        assert odpowiedz.status_code == 200
        dane = odpowiedz.json()
        assert dane["poprawny"] is True
        assert dane["podsumowanie"] == {
            "szyny": 2,
            "odcinki": 1,
            "transformatory": 0,
            "zrodla": 1,
            "odbiory": 0,
        }
        assert dane["mapowanie_katalogowe_wymagane"] is True
        assert dane["elementy_bez_katalogu"] == ["L1"]

    def test_podglad_niczego_nie_zapisuje(self, app_client):
        przed = app_client.get("/api/projects").json()
        app_client.post("/api/import/xlsx/preview", files=_plik("siec.xlsx", arkusz_poprawny()))
        po = app_client.get("/api/projects").json()
        assert po == przed

    def test_podglad_zwraca_zastrzezenia_per_wiersz(self, app_client):
        odpowiedz = app_client.post(
            "/api/import/xlsx/preview", files=_plik("zle.xlsx", arkusz_z_bledem())
        )
        assert odpowiedz.status_code == 200
        dane = odpowiedz.json()
        assert dane["poprawny"] is False
        assert dane["bledy"][0]["arkusz"] == "Linie"
        assert dane["bledy"][0]["wiersz"] == 2
        assert dane["bledy"][0]["kolumna"] == "szyna_kon"


class TestImport:
    def test_import_tworzy_projekt_widoczny_na_liscie(self, app_client):
        odpowiedz = app_client.post(
            "/api/import/xlsx", files=_plik("siec_z_arkusza.xlsx", arkusz_poprawny())
        )
        assert odpowiedz.status_code == 200
        dane = odpowiedz.json()
        assert dane["status"] == "WYMAGA_MAPOWANIA_KATALOGU"
        assert dane["project_id"]
        assert dane["snapshot_id"]
        assert dane["odcisk_migawki"]

        projekt = app_client.get(f"/api/projects/{dane['project_id']}")
        assert projekt.status_code == 200
        assert projekt.json()["name"] == "siec_z_arkusza"

    def test_nazwa_projektu_z_formularza_wygrywa_z_nazwa_pliku(self, app_client):
        odpowiedz = app_client.post(
            "/api/import/xlsx",
            files=_plik("plik.xlsx", arkusz_poprawny()),
            data={"nazwa_projektu": "Sieć Wschód 15 kV"},
        )
        assert odpowiedz.status_code == 200
        projekt = app_client.get(f"/api/projects/{odpowiedz.json()['project_id']}")
        assert projekt.json()["name"] == "Sieć Wschód 15 kV"

    def test_arkusz_z_bledem_konczy_sie_422_i_nie_tworzy_projektu(self, app_client):
        przed = len(app_client.get("/api/projects").json())
        odpowiedz = app_client.post("/api/import/xlsx", files=_plik("zle.xlsx", arkusz_z_bledem()))
        assert odpowiedz.status_code == 422
        detal = odpowiedz.json()["detail"]
        assert detal["bledy"][0]["kolumna"] == "szyna_kon"
        assert len(app_client.get("/api/projects").json()) == przed

    def test_zle_rozszerzenie_jest_odrzucone_przed_odczytem(self, app_client):
        odpowiedz = app_client.post(
            "/api/import/xlsx", files={"file": ("siec.csv", b"a,b,c", "text/csv")}
        )
        assert odpowiedz.status_code == 422
        assert "rozszerzenie" in odpowiedz.json()["detail"]

    def test_pusty_plik_jest_odrzucony(self, app_client):
        odpowiedz = app_client.post("/api/import/xlsx", files=_plik("pusty.xlsx", b""))
        assert odpowiedz.status_code == 422
        assert "pusty" in odpowiedz.json()["detail"].lower()

    def test_plik_o_rozszerzeniu_xlsx_ale_nie_arkusz(self, app_client):
        odpowiedz = app_client.post(
            "/api/import/xlsx", files=_plik("podszywacz.xlsx", b"nie-arkusz")
        )
        assert odpowiedz.status_code == 422
        assert odpowiedz.json()["detail"]["bledy"]
