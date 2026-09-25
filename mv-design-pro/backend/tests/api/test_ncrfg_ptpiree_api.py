"""Końcówki `/api/ncrfg-tests/catalog` i `/run` (karta AB-1a Pakiet C).

Iloczyn cech `/run`: ciało {komplet, pole nieznane (certyfikat, przypadek, ziarno, wersja
procedury), rodzina `Morski_PPM`, operator nieznany} × powtórzenie biegu (determinizm).
Bieg „co-jeśli" ma źródło danych ``ZADANIE_KLIENTA``: dane przyjęte bez walidacji, dowód
nigdy pełny, sposób wykazania nigdy ``CERTYFIKAT`` (sonda (6) karty repo).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from catalog.profiles.nc_rfg import list_available_operators, load_nc_rfg_profile
from fastapi.testclient import TestClient

from tests import ncrfg_fabryki as f


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "ncrfg-api.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")

    from api.main import app

    with TestClient(app) as test_client:
        yield test_client


def _cialo(**zmiany: Any) -> dict[str, Any]:
    modul = dict(f.KOMPLET)
    modul.update(zmiany)
    return {"modules": [modul]}


def test_katalog_wersja_procedury_z_profilu_i_rejestr_testow(client: TestClient) -> None:
    odpowiedz = client.get("/api/ncrfg-tests/catalog")
    assert odpowiedz.status_code == 200
    cialo = odpowiedz.json()
    oczekiwana = load_nc_rfg_profile(f.OPERATOR).wersja_warstwy("PROCEDURA_PTPIREE", None)
    assert cialo["procedure_version"] == oczekiwana.model_dump(mode="json")
    assert "source_ref" not in cialo
    assert len(cialo["tests"]) == 20
    for test in cialo["tests"]:
        assert test["zdolnosc_id"].startswith("ncrfg_ptpiree.")
        assert test["rodzaj_twierdzenia"] in {"DECLARED_CONFIGURATION", "DYNAMIC_PERFORMANCE"}
    assert [o["operator_id"] for o in cialo["operators"]] == list_available_operators()
    for operator in cialo["operators"]:
        profil = load_nc_rfg_profile(operator["operator_id"])
        assert operator["klasyfikacja_zrodlo"] == profil.klasyfikacja_zrodlo.model_dump(mode="json")
        assert operator["wersja_profilu"] == profil.wersja_profilu


def test_katalog_niesie_krzywe_lvrt_hvrt_per_operator(client: TestClient) -> None:
    """Karta FAB-J: front nie ma własnej kopii krzywych LVRT/HVRT — dostaje je stąd."""
    for operator in client.get("/api/ncrfg-tests/catalog").json()["operators"]:
        ride_through = operator["ride_through"]
        assert ride_through["lvrt"] and ride_through["hvrt"], operator["operator_id"]
        for punkt in [*ride_through["lvrt"], *ride_through["hvrt"]]:
            assert {"time_s", "voltage_pu"} <= set(punkt)


def test_run_zwraca_rekordy_i_ocene_wymagan_z_danymi_przyjetymi(client: TestClient) -> None:
    odpowiedz = client.post("/api/ncrfg-tests/run", json=_cialo())
    assert odpowiedz.status_code == 200, odpowiedz.text
    cialo = odpowiedz.json()
    assert cialo["contract"] == "NcRfgPtpireeTestResultV2"
    assert cialo["deterministic_hash"] and cialo["white_box_trace"]
    modul = cialo["modules"][0]
    assert modul["klasyfikacja"]["modul"] == "B" and modul["module_type"] == "B"
    assert modul["zrodlo_danych"] == "ZADANIE_KLIENTA"
    assert modul["dowod_certyfikatu"] is None
    for test in modul["tests"]:
        assert test["summary_pl"] == test["ocena"]["wyjasnienie"]["zdanie_pl"]
        if test["required"]:
            assert test["ocena"]["kompletnosc_dowodu"] != "PELNY"
            assert test["ocena"]["dowod"]["status_danych"]["stan"] == "UNVALIDATED_INPUT"
    [ocena] = cialo["ocena_wymagan"]
    assert ocena["zrodlo_danych"] == "ZADANIE_KLIENTA"
    for rekord in ocena["wymagania"]:
        assert rekord["sposob_wykazania"] != "CERTYFIKAT"
        if rekord["stosowalnosc"]["dotyczy"]:
            assert rekord["kompletnosc_dowodu"] != "PELNY"
    for pole in ("certificate_evidence", "reporting_status", "proof_status", "evidence_by_test"):
        assert pole not in cialo


@pytest.mark.parametrize(
    "pole, wartosc",
    [
        ("certificate_status", "ptpiree_verified"),
        ("dowod_certyfikatu", {"rekord_id": "x"}),
        ("pole_nieznane", 1),
    ],
)
def test_run_pole_nieznane_w_module_to_422(client: TestClient, pole: str, wartosc: Any) -> None:
    """Sonda (6): certyfikat w ciele żądania → 422 (pole nieznane), nie cichy certyfikat."""
    odpowiedz = client.post("/api/ncrfg-tests/run", json=_cialo(**{pole: wartosc}))
    assert odpowiedz.status_code == 422, odpowiedz.text


@pytest.mark.parametrize(
    "pole, wartosc",
    [("procedure_version", "v3.0"), ("deterministic_seed", 42), ("case_id", "x")],
)
def test_run_pole_nieznane_w_zadaniu_to_422(client: TestClient, pole: str, wartosc: Any) -> None:
    cialo = _cialo()
    cialo[pole] = wartosc
    assert client.post("/api/ncrfg-tests/run", json=cialo).status_code == 422


def test_run_przypadek_w_zapytaniu_nie_dopina_certyfikatu(client: TestClient) -> None:
    """Dawny parametr `case_id` biegu „co-jeśli" nie istnieje — nieznany parametr zapytania
    jest ignorowany przez FastAPI, więc test przypina, że odpowiedź nie niesie certyfikatu."""
    odpowiedz = client.post(
        "/api/ncrfg-tests/run",
        params={"case_id": "00000000-0000-0000-0000-000000000000"},
        json=_cialo(),
    )
    assert odpowiedz.status_code == 200
    assert odpowiedz.json()["modules"][0]["dowod_certyfikatu"] is None


def test_run_morski_ppm_to_422(client: TestClient) -> None:
    """Sonda (11): moduł morski przyłącza się do sieci przesyłowej — poza narzędziem (O-42)."""
    odpowiedz = client.post("/api/ncrfg-tests/run", json=_cialo(module_family="Morski_PPM"))
    assert odpowiedz.status_code == 422


@pytest.mark.parametrize("pole", ["der_kind", "module_family", "operator_id"])
def test_run_pola_bez_wartosci_domyslnej_sa_wymagane(client: TestClient, pole: str) -> None:
    cialo = _cialo()
    del cialo["modules"][0][pole]
    assert client.post("/api/ncrfg-tests/run", json=cialo).status_code == 422


def test_run_nieznany_operator_to_422(client: TestClient) -> None:
    odpowiedz = client.post("/api/ncrfg-tests/run", json=_cialo(operator_id="nieistnieje"))
    assert odpowiedz.status_code == 422
    assert "nieistnieje" in odpowiedz.json()["detail"]


def test_run_deterministyczny(client: TestClient) -> None:
    """Sonda (13): dwa biegi tej samej prośby → ten sam odcisk i te same rekordy."""
    pierwszy = client.post("/api/ncrfg-tests/run", json=_cialo()).json()
    drugi = client.post("/api/ncrfg-tests/run", json=_cialo()).json()
    assert pierwszy["deterministic_hash"] == drugi["deterministic_hash"]
    assert pierwszy == drugi
