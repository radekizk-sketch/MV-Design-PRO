"""API linii 110 kV z geometrii słupa — katalog, podgląd, ślad linii modelu, pakiet i raport.

Realna ścieżka użytkownika przez HTTP: projekt + przypadek, model w magazynie projektu,
przypisanie przewodu operacją domenową (``/enm/domain-ops``), bieg wykonawczy, pobranie pakietu
dowodowego i raportu. Iloczyn cech:

    końcówka {katalog, podgląd, ślad linii modelu, dostępność pakietu, pakiet, raport JSON/DOCX/PDF,
              wywód JSON/PDF}
      × geometria {projekt (PEŁNY), wartość robocza (NIEPEŁNY)}
      × rodzaj biegu {SC_3F, SC_1F, LOAD_FLOW}
      × odmowa {przewód spoza katalogu, przewód odgromowy jako fazowy, geometria sprzeczna,
                przewód odgromowy spoza katalogu, gałąź nieznana, linia SN}.
"""

from __future__ import annotations

import io
import json
import zipfile
from typing import Any

import pytest
from api.main import app
from application.parametry_linii_wn import KOD_LINIA_NIEZNANA, KOD_PRZEWOD_NIEZNANY
from enm.parametry_linii_wn import (
    KOD_GEOMETRIA_BEZ_PRZEWODU_WN,
    KOD_GEOMETRIA_NIEPOPRAWNA,
    KOD_PRZEWOD_NIE_FAZOWY,
    KOD_PRZEWOD_ODGROMOWY_NIEZNANY,
)
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record
from tests.utils.biegi import wykonaj_bieg

AFL6_240 = "przewod-wn-243-al1-39-st1a"
ODGROMOWY = "przewod-wn-97-al1-56-st1a"
GEOMETRIA_PROJEKTU: dict[str, Any] = {
    "fazy": [{"x_m": -4.5, "y_m": 16.0}, {"x_m": 0.0, "y_m": 16.0}, {"x_m": 4.5, "y_m": 16.0}],
    "liczba_w_wiazce": 1,
    "odstep_wiazki_m": None,
    "odgromowe": [{"x_m": 0.0, "y_m": 22.0}],
    "przewod_odgromowy_ref": ODGROMOWY,
    "rezystywnosc_gruntu_ohm_m": 250.0,
}
SKLADOWE_ROBOCZE = ["fazy", "odgromowe", "przewod_odgromowy_ref", "rezystywnosc_gruntu_ohm_m"]


@pytest.fixture()
def client() -> TestClient:
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    reset_canonical_runs()
    reset_enm_store()
    with TestClient(app) as test_client:
        yield test_client
    reset_canonical_runs()
    reset_enm_store()


def _odmowa(odpowiedz: Any, kod: str) -> None:
    assert odpowiedz.status_code == 422, odpowiedz.text
    assert kod in odpowiedz.text, odpowiedz.text


# ---------------------------------------------------------------------------
# Katalog i podgląd przed przypisaniem
# ---------------------------------------------------------------------------


def test_katalog_przewodow_110kv_z_wartosciami_roboczymi(client: TestClient) -> None:
    odpowiedz = client.get("/api/catalog/overhead-conductor-types")
    assert odpowiedz.status_code == 200, odpowiedz.text
    tresc = odpowiedz.json()
    przewody = {p["id"]: p for p in tresc["przewody"]}
    assert {AFL6_240, ODGROMOWY} <= set(przewody)
    assert przewody[AFL6_240]["przeznaczenie"] == "FAZOWY"
    assert przewody[ODGROMOWY]["przeznaczenie"] == "ODGROMOWY"
    # Dane wyrobu, nie impedancja linii (tę liczy solver z geometrii).
    assert "x_ohm_per_km" not in przewody[AFL6_240]
    assert przewody[AFL6_240]["r20_dc_ohm_per_km"] == pytest.approx(0.1188)
    assert [w["parametr"] for w in tresc["wartosci_robocze"]] == SKLADOWE_ROBOCZE
    assert all(w["odniesienie"] and w["uzasadnienie_pl"] for w in tresc["wartosci_robocze"])


@pytest.mark.parametrize(
    ("geometria", "kompletnosc", "robocze"),
    [(GEOMETRIA_PROJEKTU, "PELNY", []), (None, "NIEPELNY", SKLADOWE_ROBOCZE)],
)
def test_podglad_parametrow_linii(
    client: TestClient, geometria: dict | None, kompletnosc: str, robocze: list[str]
) -> None:
    odpowiedz = client.post(
        f"/api/catalog/overhead-conductor-types/{AFL6_240}/parametry-linii",
        json={"geometria_slupa": geometria, "czestotliwosc_hz": 50.0},
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    tresc = odpowiedz.json()
    parametry = tresc["parametry"]
    assert parametry["kompletnosc_dowodu"] == kompletnosc
    assert [d["jakosc"] for d in parametry["dane_przyjete"]] == ["ESTIMATED"] * len(robocze)
    skladowe = tresc["dane_linii"]["skladowe"]
    assert [s["parametr"] for s in skladowe if s["wartosc_robocza"]] == robocze
    assert all(s["propozycja"] is not None for s in skladowe if s["wartosc_robocza"])
    assert all(k["wzor_latex"] and k["podstawienie_latex"] for k in parametry["slad"])
    pasma = tresc["pasma_wiarygodnosci"]
    assert len(pasma) == 6
    assert all(p["w_pasmie"] and p["wyjasnienie_pl"] and p["podstawa_pl"] for p in pasma)
    if geometria is None:
        assert parametry["x1_ohm_per_km"] == pytest.approx(0.409006, abs=1e-6)


def test_podglad_wymaga_czestotliwosci(client: TestClient) -> None:
    odpowiedz = client.post(
        f"/api/catalog/overhead-conductor-types/{AFL6_240}/parametry-linii",
        json={"geometria_slupa": None},
    )
    assert odpowiedz.status_code == 422


@pytest.mark.parametrize(
    ("przewod", "geometria", "kod"),
    [
        ("nie-ma-takiego", None, KOD_PRZEWOD_NIEZNANY),
        (ODGROMOWY, None, KOD_PRZEWOD_NIE_FAZOWY),
        (
            AFL6_240,
            {**GEOMETRIA_PROJEKTU, "fazy": [{"x_m": 0, "y_m": 16}] * 3},
            KOD_GEOMETRIA_NIEPOPRAWNA,
        ),
        (
            AFL6_240,
            {**GEOMETRIA_PROJEKTU, "przewod_odgromowy_ref": "nie-ma"},
            KOD_PRZEWOD_ODGROMOWY_NIEZNANY,
        ),
    ],
)
def test_podglad_odmowy_z_kodem(
    client: TestClient, przewod: str, geometria: dict | None, kod: str
) -> None:
    odpowiedz = client.post(
        f"/api/catalog/overhead-conductor-types/{przewod}/parametry-linii",
        json={"geometria_slupa": geometria, "czestotliwosc_hz": 50.0},
    )
    _odmowa(odpowiedz, kod)


# ---------------------------------------------------------------------------
# Model projektu: przypisanie, ślad linii, biegi, pakiet i raport
# ---------------------------------------------------------------------------


def _projekt_z_linia(client: TestClient, geometria: dict | None, *, z_kablem: bool = False) -> str:
    from enm.klucz_twin import klucz_twin_projektu
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    projekt = client.post("/api/projects", json={"name": "Linia 110 kV — test"})
    assert projekt.status_code == 201, projekt.text
    project_id = projekt.json()["id"]
    przypadek = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek linii 110 kV"}
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = przypadek.json()["id"]
    set_enm(
        klucz_twin_projektu(project_id),
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Linia 110 kV",
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z",
                    "defaults": {"frequency_hz": 50.0, "unit_system": "SI"},
                },
                "buses": [
                    {"ref_id": "A", "name": "Szyna 110 kV A", "voltage_kv": 110.0},
                    {"ref_id": "B", "name": "Szyna 110 kV B", "voltage_kv": 110.0},
                ],
                "branches": [
                    {
                        "ref_id": "L1",
                        "name": "Linia 110 kV A–B",
                        "type": "line_overhead",
                        "from_bus_ref": "A",
                        "to_bus_ref": "B",
                        "length_km": 20.0,
                        "r_ohm_per_km": 0.1,
                        "x_ohm_per_km": 0.4,
                        "geometria_slupa": geometria,
                    },
                    *(
                        [
                            {
                                "ref_id": "K1",
                                "name": "Kabel bez przewodu 110 kV",
                                "type": "cable",
                                "from_bus_ref": "A",
                                "to_bus_ref": "B",
                                "length_km": 1.0,
                                "r_ohm_per_km": 0.05,
                                "x_ohm_per_km": 0.12,
                                "status": "open",
                            }
                        ]
                        if z_kablem
                        else []
                    ),
                ],
                "loads": [
                    {"ref_id": "LD", "name": "Odbiór", "bus_ref": "B", "p_mw": 20.0, "q_mvar": 5.0}
                ],
                "sources": [
                    gpz_source_record(
                        ref_id="Q",
                        name="Sieć 110 kV",
                        bus_ref="A",
                        voltage_kv=110.0,
                        sk3_mva=3000.0,
                        rx_ratio=0.1,
                        # Z0 sieci zasilającej (Z0 ≈ Z1 = c·Un²/S″k ≈ 4,4 Ω) — zwarcia
                        # doziemne potrzebują kompletnej składowej zerowej.
                        extra={"r0_ohm": 0.44, "x0_ohm": 4.4},
                    )
                ],
            }
        ),
    )
    przypisanie = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "assign_catalog_to_element",
                "payload": {
                    "element_ref": "L1",
                    "catalog_binding": {
                        "catalog_namespace": "PRZEWOD_LINII_WN",
                        "catalog_item_id": AFL6_240,
                        "catalog_item_version": "2024.1",
                    },
                    "source_mode": "KATALOG",
                },
            }
        },
    )
    assert przypisanie.status_code == 200, przypisanie.text
    assert przypisanie.json().get("error") is None, przypisanie.json().get("error")
    return case_id


def _bieg(client: TestClient, case_id: str, rodzaj: str) -> str:
    utworz = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": rodzaj, "solver_input": {}},
    )
    assert utworz.status_code == 201, utworz.text
    run_id = utworz.json()["id"]
    wykonanie = wykonaj_bieg(client, run_id)
    assert wykonanie.status_code == 200, wykonanie.text
    assert wykonanie.json()["status"] == "DONE", wykonanie.text
    return str(run_id)


@pytest.mark.parametrize(
    ("geometria", "kompletnosc"), [(GEOMETRIA_PROJEKTU, "PELNY"), (None, "NIEPELNY")]
)
def test_slad_linii_modelu(client: TestClient, geometria: dict | None, kompletnosc: str) -> None:
    case_id = _projekt_z_linia(client, geometria)
    odpowiedz = client.get(f"/api/cases/{case_id}/enm/parametry-linii", params={"branch_ref": "L1"})
    assert odpowiedz.status_code == 200, odpowiedz.text
    tresc = odpowiedz.json()
    assert tresc["zgodny_z_modelem"] is True
    assert tresc["parametry"]["kompletnosc_dowodu"] == kompletnosc
    # Ten sam wynik co podgląd przed przypisaniem (jedna droga liczenia).
    podglad = client.post(
        f"/api/catalog/overhead-conductor-types/{AFL6_240}/parametry-linii",
        json={"geometria_slupa": geometria, "czestotliwosc_hz": 50.0},
    ).json()
    # Nazwa linii w opisie danej przyjętej różni podgląd (linii jeszcze nie ma) od śladu modelu;
    # liczby, ślad i jakość danych przyjętych są identyczne.
    for klucz in (
        "r1_ohm_per_km",
        "x1_ohm_per_km",
        "b1_s_per_km",
        "r0_ohm_per_km",
        "x0_ohm_per_km",
        "b0_s_per_km",
        "slad",
        "kompletnosc_dowodu",
    ):
        assert tresc["parametry"][klucz] == podglad["parametry"][klucz], klucz
    assert [(d["wartosc"], d["jakosc"]) for d in tresc["parametry"]["dane_przyjete"]] == [
        (d["wartosc"], d["jakosc"]) for d in podglad["parametry"]["dane_przyjete"]
    ]
    model = client.get(f"/api/cases/{case_id}/enm").json()
    linia = next(b for b in model["branches"] if b["ref_id"] == "L1")
    assert linia["x0_ohm_per_km"] == tresc["parametry"]["x0_ohm_per_km"]


@pytest.mark.parametrize(
    ("branch_ref", "kod"), [("nie-ma", KOD_LINIA_NIEZNANA), ("K1", KOD_GEOMETRIA_BEZ_PRZEWODU_WN)]
)
def test_slad_linii_modelu_odmowy(client: TestClient, branch_ref: str, kod: str) -> None:
    # Kabel bez przewodu 110 kV — model tylko do odczytu śladu (bez biegu).
    case_id = _projekt_z_linia(client, None, z_kablem=True)
    odpowiedz = client.get(
        f"/api/cases/{case_id}/enm/parametry-linii", params={"branch_ref": branch_ref}
    )
    _odmowa(odpowiedz, kod)


def _wpisy(zawartosc: bytes) -> set[str]:
    with zipfile.ZipFile(io.BytesIO(zawartosc)) as archiwum:
        return set(archiwum.namelist())


def _dowod_linii(zawartosc: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(zawartosc)) as zbiorczy:
        wewnetrzny = zbiorczy.read("pakiet_dowodowy/parametry_linii__L1.zip")
    with zipfile.ZipFile(io.BytesIO(wewnetrzny)) as linia:
        return json.loads(linia.read("proof_pack/proof.json"))


@pytest.mark.parametrize(
    ("rodzaj", "dowody_glowne"),
    [
        ("SC_3F", {"pakiet_dowodowy/zwarcie_3f.zip"}),
        (
            "SC_1F",
            {"pakiet_dowodowy/SC1FZ.zip", "pakiet_dowodowy/SC2F.zip", "pakiet_dowodowy/SC2FZ.zip"},
        ),
        ("LOAD_FLOW", None),
    ],
)
@pytest.mark.parametrize(("geometria", "niepelny"), [(GEOMETRIA_PROJEKTU, False), (None, True)])
def test_pakiet_dowodowy_biegu_niesie_dowod_parametrow_linii(
    client: TestClient,
    rodzaj: str,
    dowody_glowne: set[str] | None,
    geometria: dict | None,
    niepelny: bool,
) -> None:
    case_id = _projekt_z_linia(client, geometria)
    run_id = _bieg(client, case_id, rodzaj)
    dostepnosc = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc").json()
    assert dostepnosc["dostepny"] is True, dostepnosc
    assert any("parametry_linii__L1.zip" in w for w in dostepnosc["zawartosc_pl"])
    pakiet = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert pakiet.status_code == 200, pakiet.text
    wpisy = _wpisy(pakiet.content)
    assert "pakiet_dowodowy/parametry_linii__L1.zip" in wpisy
    if dowody_glowne is not None:
        assert wpisy == dowody_glowne | {"pakiet_dowodowy/parametry_linii__L1.zip"}
    dowod = _dowod_linii(pakiet.content)
    assert dowod["summary"]["unit_check_passed"] is True
    assert any("NIEPEŁNY" in o for o in dowod["summary"]["warnings"]) is niepelny
    # Determinizm: drugie pobranie — te same bajty.
    assert client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy").content == pakiet.content


@pytest.mark.parametrize(
    ("geometria", "kompletnosc"), [(GEOMETRIA_PROJEKTU, "PELNY"), (None, "NIEPELNY")]
)
def test_raport_i_wywod_biegu_niosa_parametry_linii(
    client: TestClient, geometria: dict | None, kompletnosc: str
) -> None:
    case_id = _projekt_z_linia(client, geometria)
    run_id = _bieg(client, case_id, "SC_3F")
    raport = client.get(
        f"/api/analysis-runs/{run_id}/export/report/json", params={"detail_level": "pelny"}
    )
    assert raport.status_code == 200, raport.text
    slady = raport.json()["trace"]["parametry_linii"]
    assert [s["branch_ref"] for s in slady] == ["L1"]
    assert slady[0]["kompletnosc_dowodu"] == kompletnosc
    assert slady[0]["zgodny_z_modelem"] is True
    assert all(k["formula_latex"] for k in slady[0]["kroki"])
    assert (len(slady[0]["dane_przyjete"]) > 0) is (kompletnosc == "NIEPELNY")
    wywod = client.get(f"/api/analysis-runs/{run_id}/export/proof/json")
    assert wywod.status_code == 200, wywod.text
    assert wywod.json()["parametry_linii"] == slady
    for format_ in ("docx", "pdf"):
        dokument = client.get(
            f"/api/analysis-runs/{run_id}/export/report/{format_}", params={"detail_level": "pelny"}
        )
        assert dokument.status_code == 200, dokument.text
        assert len(dokument.content) > 0
    pdf_wywodu = client.get(f"/api/analysis-runs/{run_id}/export/proof/pdf")
    assert pdf_wywodu.status_code == 200, pdf_wywodu.text


def test_raport_docx_zawiera_wywod_linii(client: TestClient) -> None:
    from docx import Document

    case_id = _projekt_z_linia(client, None)
    run_id = _bieg(client, case_id, "SC_3F")
    dokument = client.get(
        f"/api/analysis-runs/{run_id}/export/report/docx", params={"detail_level": "pelny"}
    )
    tekst = "\n".join(p.text for p in Document(io.BytesIO(dokument.content)).paragraphs)
    assert "Parametry linii 110 kV z geometrii słupa — Linia 110 kV A–B" in tekst
    assert "Kompletność dowodu: NIEPEŁNY (wartości robocze, jakość ESTIMATED)" in tekst
    assert "Dana przyjęta:" in tekst
