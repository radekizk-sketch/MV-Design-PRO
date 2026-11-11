"""Regresja publicznych granic HTTP P0/P1 norm — bez ENM i bez udawania PASS.

Uruchamia PRAWDZIWE routery FastAPI i źródłowe klasy PTPiREE, WiPWC,
Banku Nastaw, źródłowych braków i ENEA MEE. Nie mockuje backendu,
nie przejmuje istniejących endpointów solvera.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{tmp_path / 'ncrfg-real-api.db'}")
    from api.main import app
    with TestClient(app) as c:
        yield c


def test_ptpiree3_and_wipwc13_are_distinct_normative_endpoints(client: TestClient) -> None:
    scope = client.get(
        "/api/ncrfg-tests/zakres-badan-v3",
        params={"typ": "B", "rodzina": "PPM"},
    )
    assert scope.status_code == 200, scope.text
    assert scope.json()["status_formalny"] == "ZAKRES_NIE_WYKONANIE"
    q = next(x for x in scope.json()["punkty"] if x["zdolnosc"] == "REACTIVE_CAPABILITY")
    assert q["status"] == "TEST"
    cert = client.get(
        "/api/ncrfg-tests/wipwc13-reguly-certyfikatow",
        params={"typ": "B", "rodzina": "PPM"},
    )
    assert cert.status_code == 200, cert.text
    assert cert.json()["formalna_zgodnosc"] is False
    lfsm = next(x for x in cert.json()["reguly"] if x["zdolnosc"] == "LFSM_O")
    assert lfsm["status"] == "CERT_REQUIRED"
    assert not lfsm["mozna_zastapic_test"]  # bezwarunkowe zwolnienie nie istnieje
    together = client.get(
        "/api/ncrfg-tests/wipwc13-polaczone-obowiazki",
        params={"typ": "B", "rodzina": "PPM"},
    )
    assert together.status_code == 200, together.text
    assert together.json()["finalna_zgodnosc"] is False
    assert all(x["status_wykonania"] == "NIE_OCENIONO" for x in together.json()["zasady"])


def test_bank_2024_no_auto_enabling_protection_for_2025_wos(client: TestClient) -> None:
    r = client.get(
        "/api/ncrfg-tests/bank-nastaw-pl", params={"wariant": "B_SN"}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["zatwierdzenie_osd"] is False
    assert body["wersja"] == "1.1"
    assert next(x for x in body["nastawy"] if x["id"] == "U_LT")["wartosc"] == .8
    s = client.get(
        "/api/ncrfg-tests/bank-nastaw-pl-charakterystyki",
        params={"wariant": "B_SN"}
    )
    assert s.status_code == 200, s.text
    assert not s.json()["wos_2025_przejete"]
    frt = next(x for x in s.json()["charakterystyki"] if x["id"] == "FRT_PROFILE")
    assert frt["t_clear_s"] == .25


def test_operator_source_audit_blocks_formal_claims(client: TestClient) -> None:
    r = client.get("/api/ncrfg-tests/audyt-zrodel", params={"operator_id": "enea"})
    assert r.status_code == 200, r.text
    assert r.json()["gotowosc_do_formalnego_potwierdzenia_zgodnosci"] is False
    assert "WOS_2025_NIE_W_PROFILU" in {x["kod"] for x in r.json()["blokery"]}
    assert client.get(
        "/api/ncrfg-tests/audyt-zrodel", params={"operator_id": "nieznany"}
    ).status_code == 404


def test_wipwc13_certificate_metadata_never_emits_cert_approval(client: TestClient) -> None:
    r = client.post(
        "/api/ncrfg-tests/kontrola-dokumentu-certyfikatu",
        json={
            "dokument": {"zrodlo_opisu": "kopia certyfikatu C-1"},
            "typ_mwe": "B",
            "wersja_wipwc": "1.3",
            "data_oceny": "2026-11-10",
        },
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["kontrole"]) == 21
    assert "NIE_ZWERYFIKOWANO" in r.json()["status_formalny"]
    assert client.post(
        "/api/ncrfg-tests/kontrola-dokumentu-certyfikatu",
        json={
            "dokument": {},
            "typ_mwe": "B",
            "wersja_wipwc": "1.3",
            "data_oceny": "1735689600",
        }
    ).status_code == 422


def test_standalone_storage_register_rule_and_date_not_rfg(client: TestClient) -> None:
    r = client.post(
        "/api/bess/enea/ocena-rejestru",
        json={
            "dane": {
                "moc_zainstalowana_kw": 100.0,
                "w_instalacji_wytworczej_lub_odbiorczej": True,
                "oddano_do_eksploatacji": "2026-11-01",
                "identyfikator_zrodla": "Protokół SAT 001",
            },
            "na_dzien": "2026-11-10",
        },
    )
    assert r.status_code == 200, r.text
    x = r.json()
    assert x["wymagany_wpis"] == "WPIS_WYMAGANY_I5_2"
    assert x["obowiazek_informacji_posiadacza"] == "TERMIN_MINAL"
    assert x["status_kompletnosci_zgodnosci"] == "NIE_OCENIONO"
    assert client.post(
        "/api/bess/enea/ocena-rejestru",
        json={
            "dane": {"moc_zainstalowana_kw": -10.0},
            "na_dzien": "2026-11-10",
        }
    ).status_code == 422


def test_schema_rejects_mismatched_pgm_or_unknown_catalog_variant(client: TestClient) -> None:
    assert client.get("/api/ncrfg-tests/zakres-badan-v3",
        params={"typ":"E","rodzina":"PPM"}).status_code == 422
    assert client.get("/api/ncrfg-tests/bank-nastaw-pl",
        params={"wariant":"C_SN"}).status_code == 422
