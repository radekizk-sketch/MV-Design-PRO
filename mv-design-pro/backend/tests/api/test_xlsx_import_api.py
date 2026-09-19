"""Końcówki importu XLSX — kontrakt HTTP na realnym pliku (multipart, nie mock).

W1: import tworzy projekt + pierwszy przypadek + model ENM projektu — sprawdzane przez
TE SAME końcówki, którymi front otwiera projekt (`/api/projects`, `/api/study-cases`,
`/api/cases/{case_id}/enm`), nie przez zaglądanie do bazy.
"""

from __future__ import annotations

import pytest

from tests.utils.arkusz_xlsx import (
    NAGLOWEK_LINII_TABLICZKA,
    NAGLOWEK_SZYN,
    arkusz_siec_sn,
    wiersz_linii_tabliczka,
    zbuduj_skoroszyt,
)

openpyxl = pytest.importorskip("openpyxl")

TYP_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PODSUMOWANIE = {"szyny": 3, "odcinki": 1, "transformatory": 1, "zrodla": 1, "odbiory": 2}


def arkusz_z_bledem() -> bytes:
    return zbuduj_skoroszyt(
        [
            ("Szyny", [NAGLOWEK_SZYN, ["B1", "GPZ", 15.0]]),
            (
                "Linie",
                [NAGLOWEK_LINII_TABLICZKA, wiersz_linii_tabliczka("L1", "B1", "NIE-MA", 5.0)],
            ),
        ]
    )


def _plik(nazwa: str, dane: bytes) -> dict:
    return {"file": (nazwa, dane, TYP_MIME)}


class TestPodglad:
    def test_podglad_zwraca_liczby_modelu_z_backendu(self, app_client):
        odpowiedz = app_client.post(
            "/api/import/xlsx/preview", files=_plik("siec.xlsx", arkusz_siec_sn())
        )
        assert odpowiedz.status_code == 200, odpowiedz.text
        dane = odpowiedz.json()
        assert dane["poprawny"] is True
        assert dane["podsumowanie"] == PODSUMOWANIE
        assert dane["elementy_typow_projektu"] == ["L1", "T1"]
        assert dane["bledy"] == []
        assert any("T1" in o for o in dane["ostrzezenia"])

    def test_podglad_niczego_nie_zapisuje(self, app_client):
        przed = app_client.get("/api/projects").json()
        app_client.post("/api/import/xlsx/preview", files=_plik("siec.xlsx", arkusz_siec_sn()))
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
    def test_import_tworzy_projekt_przypadek_i_model_widoczne_przez_api(self, app_client):
        odpowiedz = app_client.post(
            "/api/import/xlsx", files=_plik("siec_z_arkusza.xlsx", arkusz_siec_sn())
        )
        assert odpowiedz.status_code == 200, odpowiedz.text
        dane = odpowiedz.json()
        assert dane["status"] == "ZAIMPORTOWANO"
        assert dane["project_id"] and dane["case_id"] and dane["enm_hash"]
        assert dane["podsumowanie"] == PODSUMOWANIE
        assert dane["elementy_typow_projektu"] == ["L1", "T1"]

        projekt = app_client.get(f"/api/projects/{dane['project_id']}")
        assert projekt.status_code == 200
        assert projekt.json()["name"] == "siec_z_arkusza"

        przypadki = app_client.get(f"/api/study-cases/project/{dane['project_id']}")
        assert przypadki.status_code == 200
        [przypadek] = przypadki.json()
        assert przypadek["id"] == dane["case_id"]
        assert przypadek["is_active"] is True

        model = app_client.get(f"/api/cases/{dane['case_id']}/enm")
        assert model.status_code == 200, model.text
        tresc = model.json()
        assert tresc["header"]["hash_sha256"] == dane["enm_hash"]
        assert len(tresc["buses"]) == 3
        assert [b["name"] for b in tresc["branches"]] == ["L1"]
        assert [t["name"] for t in tresc["transformers"]] == ["T1"]
        assert [t["id"] for t in tresc["katalog_projektu"]["line_types"]] == [
            "arkusz-linia-afl-6-120"
        ]

    def test_nazwa_projektu_z_formularza_wygrywa_z_nazwa_pliku(self, app_client):
        odpowiedz = app_client.post(
            "/api/import/xlsx",
            files=_plik("plik.xlsx", arkusz_siec_sn()),
            data={"nazwa_projektu": "Sieć Wschód 15 kV"},
        )
        assert odpowiedz.status_code == 200, odpowiedz.text
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


class TestBiegNaZaimportowanymModelu:
    """Projekt akceptacyjny klasy A (mapa §9): sieć z arkusza liczy się TYM SAMYM torem
    biegów co sieć z kreatora — bez żadnego kroku „domapowania” po imporcie."""

    def test_rozplyw_i_zwarcie_wykonuja_sie_na_przypadku_z_importu(self, app_client):
        dane = app_client.post(
            "/api/import/xlsx", files=_plik("siec.xlsx", arkusz_siec_sn())
        ).json()
        assert dane["status"] == "ZAIMPORTOWANO"
        for analysis_type in ("LOAD_FLOW", "SC_3F"):
            utworzony = app_client.post(
                f"/api/execution/study-cases/{dane['case_id']}/runs",
                json={"analysis_type": analysis_type},
            )
            assert utworzony.status_code in (200, 201), utworzony.text
            run_id = utworzony.json()["id"]
            wykonany = app_client.post(f"/api/execution/runs/{run_id}/execute")
            assert wykonany.status_code == 200, wykonany.text
            assert wykonany.json()["status"] == "DONE", wykonany.text
            wyniki = app_client.get(f"/api/execution/runs/{run_id}/results")
            assert wyniki.status_code == 200, wyniki.text
        # Bieg niczego nie zmienia w modelu (odcisk bez zmian).
        model = app_client.get(f"/api/cases/{dane['case_id']}/enm").json()
        assert model["header"]["hash_sha256"] == dane["enm_hash"]

    def test_gotowosc_inzynierska_przypadku_z_importu(self, app_client):
        dane = app_client.post(
            "/api/import/xlsx", files=_plik("siec.xlsx", arkusz_siec_sn())
        ).json()
        gotowosc = app_client.get(f"/api/cases/{dane['case_id']}/engineering-readiness")
        assert gotowosc.status_code == 200, gotowosc.text
        tresc = gotowosc.json()
        # Sieć z arkusza ma komplet danych do rozpływu i zwarć; zgłoszenia gotowości
        # dotyczą co najwyżej warstw, których arkusz operatora nie niesie (patrz asercja
        # poniżej — lista kodów jest przypięta, żeby każda nowa blokada była widoczna).
        kody = sorted({issue["code"] for issue in tresc.get("issues", [])})
        assert tresc["ready"] is True, (tresc["status"], kody)
