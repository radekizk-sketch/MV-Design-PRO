"""Bieg NC RfG/PTPiREE niesie DOWÓD certyfikacji urządzenia (karta P2).

PO CO. Raport zgodności NC RfG jest załącznikiem wniosku przyłączeniowego, więc
musi dać się z niego odczytać, NA CO powołuje się deklaracja zgodności urządzenia:
numer dokumentu, data akceptacji, wersja WOŚ/WiPWC, zakres PPM i źródło wpisu.
Do tej karty pola dowodowe kończyły bieg w parametrach DER i na ekranie kreatora,
a warstwa zgodności ich nie cytowała.

SKĄD DANE (zero fabrykacji). Wyłącznie z tabliczki urządzenia w modelu
(`Generator.materialized_params`), którą kreator DER zapisał z rekordu
katalogowego. API niczego nie wylicza i niczego nie dopowiada — brak danej to
``None``, nigdy wartość domyślna. Dowód jest DODATKIEM: wszystkie dotychczasowe
pola wyniku biegu zachowują nazwy, typy i wartości.

ILOCZYN CECH: obecność przypadku × obecność urządzenia w modelu × komplet danych
w tabliczce. Każdy wariant musi kończyć się DZIAŁAJĄCYM biegiem — dowód, którego
nie ma, nie może zatrzymać testów zgodności.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

import pytest
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient

#: Wartości WPROST z rekordu wykazu PTPiREE (`mv_ptpiree_catalog.py`) — test
#: cytuje je tak samo, jak ma je cytować odpowiedź.
TABLICZKA_Z_CERTYFIKATEM: dict[str, Any] = {
    "catalog_item_id": "conv-pv-nn-2mw-0p4kv",
    "ptpiree_certificate_ref": "ptpiree-pv-1",
    "ptpiree_document_number": "WOS/2024/PV-900",
    "ptpiree_document_acceptance_date": "2024-11-04",
    "ptpiree_wos_version": "WOS 2021",
    "ptpiree_wipwc_version": "1.3",
    "ptpiree_ppm_scope": "PPM typu B",
    "ptpiree_source_url": "https://ptpiree.pl/wykaz/pv-900",
    # Warunek ważności certyfikatu: bez niego certyfikat NIE obowiązuje, więc
    # dowód musi go cytować tak samo jak numer dokumentu (karta dowodu
    # w dokumentach formalnych — sekcja „Dowód certyfikacji PTPiREE").
    "ptpiree_certificate_condition": "Tylko z modułem sterowania SG-CTRL.",
}

MODUL_BIEGU: dict[str, Any] = {
    "der_ref": "gen_pv_ptpiree",
    "der_name": "PV 2 MW",
    "der_kind": "PV",
    "operator_id": "enea",
    "p_max_kw": 2000,
    "voltage_kv": 15,
    "certificate_status": "ptpiree_verified",
}


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "ncrfg-dowod.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")

    from api.main import app

    reset_enm_store()
    with TestClient(app) as test_client:
        yield test_client
    reset_enm_store()


def _przypadek_z_der(tabliczka: dict[str, Any] | None) -> str:
    """Przypadek z jednym źródłem DER o zadanej tabliczce. Zwraca `case_id`."""
    case_id = str(uuid.uuid4())
    model = EnergyNetworkModel(
        header=ENMHeader(name="Dowod certyfikatu PTPiREE"),
        buses=[Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15.0)],
        generators=[
            Generator(
                ref_id="gen_pv_ptpiree",
                name="PV 2 MW",
                bus_ref="bus_sn",
                p_mw=2.0,
                gen_type="pv_inverter",
                materialized_params=tabliczka,
            )
        ],
    )
    set_enm(case_id, model)
    return case_id


def _bieg(client: TestClient, *, case_id: str | None) -> dict[str, Any]:
    sciezka = "/api/ncrfg-tests/run"
    if case_id is not None:
        sciezka = f"{sciezka}?case_id={case_id}"
    odpowiedz = client.post(sciezka, json={"modules": [MODUL_BIEGU]})
    assert odpowiedz.status_code == 200, odpowiedz.text
    return odpowiedz.json()


def test_dowod_certyfikatu_cytuje_tabliczke_urzadzenia(client: TestClient) -> None:
    """Komplet pól dowodowych trafia do wyniku biegu WPROST z modelu."""
    case_id = _przypadek_z_der(TABLICZKA_Z_CERTYFIKATEM)
    wynik = _bieg(client, case_id=case_id)

    dowody = wynik["certificate_evidence"]
    assert len(dowody) == 1, "dowod ma powstac per TESTOWANE urzadzenie"
    dowod = dowody[0]
    assert dowod == {
        "der_ref": "gen_pv_ptpiree",
        "document_number": "WOS/2024/PV-900",
        "acceptance_date": "2024-11-04",
        "wos_version": "WOS 2021",
        "wipwc_version": "1.3",
        "ppm_scope": "PPM typu B",
        "source_url": "https://ptpiree.pl/wykaz/pv-900",
        "certificate_condition": "Tylko z modułem sterowania SG-CTRL.",
    }


def test_urzadzenie_bez_danych_certyfikatu_daje_pola_none_a_bieg_dziala(
    client: TestClient,
) -> None:
    """Uczciwy stan zerowy: brak danej to None, nie wartość wzięta znikąd."""
    case_id = _przypadek_z_der(None)
    wynik = _bieg(client, case_id=case_id)

    dowod = wynik["certificate_evidence"][0]
    assert dowod["der_ref"] == "gen_pv_ptpiree"
    assert all(
        dowod[pole] is None
        for pole in (
            "document_number",
            "acceptance_date",
            "wos_version",
            "wipwc_version",
            "ppm_scope",
            "source_url",
            "certificate_condition",
        )
    ), f"pole dowodowe wypelnione mimo braku danych: {dowod}"
    # Bieg NIE zostaje wstrzymany brakiem dowodu.
    assert wynik["modules"][0]["module_type"] == "B"
    assert wynik["white_box_trace"]


def test_tabliczka_niepelna_niesie_tylko_to_co_jest(client: TestClient) -> None:
    """Częściowe dane — dzisiejszy stan zapisu kreatora — nie są uzupełniane."""
    case_id = _przypadek_z_der(
        {
            "ptpiree_document_number": "WOS/2024/PV-900",
            "ptpiree_wos_version": "WOS 2021",
            "ptpiree_source_url": "https://ptpiree.pl/wykaz/pv-900",
        }
    )
    dowod = _bieg(client, case_id=case_id)["certificate_evidence"][0]

    assert dowod["document_number"] == "WOS/2024/PV-900"
    assert dowod["wos_version"] == "WOS 2021"
    assert dowod["source_url"] == "https://ptpiree.pl/wykaz/pv-900"
    assert dowod["acceptance_date"] is None
    assert dowod["wipwc_version"] is None
    assert dowod["ppm_scope"] is None
    assert dowod["certificate_condition"] is None


def test_bieg_bez_wskazanego_przypadku_dziala_i_nie_zmysla_dowodu(
    client: TestClient,
) -> None:
    """Bieg bez modelu (np. dane wpisane ręcznie) zostaje biegiem, nie błędem."""
    wynik = _bieg(client, case_id=None)

    dowod = wynik["certificate_evidence"][0]
    assert dowod["der_ref"] == "gen_pv_ptpiree"
    assert dowod["document_number"] is None
    assert wynik["modules"][0]["module_type"] == "B"


def test_urzadzenie_spoza_modelu_nie_dostaje_cudzego_dowodu(client: TestClient) -> None:
    """Dopasowanie po referencji — nie „pierwszy lepszy DER w modelu"."""
    case_id = _przypadek_z_der(TABLICZKA_Z_CERTYFIKATEM)
    odpowiedz = client.post(
        f"/api/ncrfg-tests/run?case_id={case_id}",
        json={"modules": [{**MODUL_BIEGU, "der_ref": "gen_innego_projektu"}]},
    )
    assert odpowiedz.status_code == 200, odpowiedz.text

    dowod = odpowiedz.json()["certificate_evidence"][0]
    assert dowod["der_ref"] == "gen_innego_projektu"
    assert dowod["document_number"] is None, "dowod przykleil sie do niewlasciwego urzadzenia"


def test_kontrakt_dotychczasowych_pol_wyniku_jest_nietkniety(client: TestClient) -> None:
    """Dodatek jest DODATKIEM: konsument sprzed karty czyta to samo, co czytał.

    Porównanie idzie polem po polu z biegiem BEZ przypadku — dowód certyfikatu
    jest jedyną różnicą, w szczególności odcisk deterministyczny się nie rusza.
    """
    case_id = _przypadek_z_der(TABLICZKA_Z_CERTYFIKATEM)
    z_dowodem = _bieg(client, case_id=case_id)
    bez_przypadku = _bieg(client, case_id=None)

    assert set(z_dowodem) - set(bez_przypadku) == set()
    for pole in (
        "contract",
        "procedure_version",
        "solver_version",
        "input_hash",
        "deterministic_hash",
        "modules",
        "test_catalog",
        "white_box_trace",
        "report_pl",
    ):
        assert z_dowodem[pole] == bez_przypadku[pole], f"dodatek ruszyl istniejace pole '{pole}'"
