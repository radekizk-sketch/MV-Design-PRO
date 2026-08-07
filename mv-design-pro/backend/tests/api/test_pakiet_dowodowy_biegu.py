"""Pakiet dowodowy PRZEBIEGU — brama `/api/analysis-runs/{run}/pakiet-dowodowy` (PACK-DOWODY).

DEFEKT ZAMYKANY: dedykowane pakiety dowodowe nie miały konsumenta, bo ich kontrakty
HTTP żądały od klienta wielkości fizycznych (Z1/Z2/Z0, U_f, operator Fortescue).
Brama przyjmuje TOŻSAMOŚĆ przebiegu i punkt zwarcia, a fizykę liczy serwer.

Testy chodzą REALNĄ ścieżką: bieg tworzony i wykonywany przez tor wykonawczy
(`/api/execution/...`), nie ręcznie wstawiany do repozytorium — dzięki temu pin
łapie także rozjazd między tym, co bieg zapisuje, a tym, czego brama szuka.

Pokrycie jako ILOCZYN CECH (nie jeden przykład):
rodzaj biegu (3F / 1F-Z / 2F / 2F+Z / rozpływ mocy) × dostępność pakietu
(dostępny / rodzaj bez pakietu) × punkt (domyślny / wskazany / spoza biegu) ×
zawartość (dowód + źródło + wykaz + odcisk) × determinizm (dwa wywołania).
"""

from __future__ import annotations

import io
import zipfile
from uuid import uuid4

import pytest
from api.main import app
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record


def _reset_backend_state() -> None:
    from api.execution_runs import get_engine
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    engine = get_engine()
    engine._runs.clear()
    engine._result_sets.clear()
    engine._study_cases.clear()
    engine._case_runs.clear()
    reset_canonical_runs()
    reset_enm_store()


@pytest.fixture()
def client() -> TestClient:
    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def _seed_enm(case_id: str) -> None:
    """Sieć SN: GPZ na szynie głównej, kabel, szyna odbiorcza (uziemienie punktu zerowego).

    Uziemienie transformatora zasilającego jest potrzebne, żeby sieć zerowa (Z0)
    istniała — bez niej pakiet zwarć niesymetrycznych nie miałby podstawy.
    """
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Pakiet dowodowy przebiegu",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000501",
                        "ref_id": "bus-main",
                        "name": "Szyna glowna",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000502",
                        "ref_id": "bus-odbior",
                        "name": "Szyna odbioru",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000503",
                        "ref_id": "branch-odbior",
                        "name": "Kabel odbiorczy",
                        "tags": [],
                        "meta": {},
                        "type": "cable",
                        "from_bus_ref": "bus-main",
                        "to_bus_ref": "bus-odbior",
                        "status": "closed",
                        "catalog_ref": "KABEL_SN_TEST",
                        "parameter_source": "CATALOG",
                        "length_km": 0.5,
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.073,
                        # Składowa zerowa gałęzi — bez niej walidator ENM (W001)
                        # odcina zwarcia 1F/2F-Z i pakiet niesymetryczny nie ma
                        # podstawy (ta sama brama, którą widzi użytkownik).
                        "r0_ohm_per_km": 0.759,
                        "x0_ohm_per_km": 0.292,
                        "b_siemens_per_km": 2.6e-07,
                        "rating": {"in_a": 270.0},
                    }
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000504",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-main",
                            voltage_kv=15.0,
                            sk3_mva=250.0,
                            rx_ratio=0.10,
                            extra={"z0_z1_ratio": 3.0},
                        ),
                    }
                ],
                "loads": [
                    {
                        # Odbiór jest potrzebny, żeby ten sam model dał się policzyć
                        # także rozpływem mocy — cecha „rodzaj biegu bez pakietu"
                        # musi być sprawdzona na TEJ SAMEJ sieci, inaczej test
                        # dowodziłby czegoś innego.
                        "id": "00000000-0000-0000-0000-000000000505",
                        "ref_id": "load-odbior",
                        "name": "Odbior",
                        "tags": [],
                        "meta": {},
                        "bus_ref": "bus-odbior",
                        "p_mw": 0.5,
                        "q_mvar": 0.15,
                    }
                ],
                "transformers": [],
                "generators": [],
                "substations": [],
                "bays": [],
                "junctions": [],
                "corridors": [],
                "measurements": [],
                "protection_assignments": [],
                "branch_points": [],
            }
        ),
    )


def _wykonaj_bieg(client: TestClient, case_id: str, analysis_type: str) -> str:
    """Realna ścieżka: utworzenie biegu + wykonanie (tor wykonawczy, nie fixture)."""
    create = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": analysis_type, "solver_input": {}},
    )
    assert create.status_code == 201, create.text
    run_id = create.json()["id"]
    execute = client.post(f"/api/execution/runs/{run_id}/execute")
    assert execute.status_code == 200, execute.text
    assert execute.json()["status"] == "DONE"
    return str(run_id)


def _wpisy_zip(content: bytes) -> set[str]:
    with zipfile.ZipFile(io.BytesIO(content)) as archiwum:
        return set(archiwum.namelist())


# ---------------------------------------------------------------------------
# Dostępność: rodzaj biegu rozstrzyga (jedno źródło prawdy)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("analysis_type", "oczekiwany_rodzaj"),
    [
        ("SC_3F", "SC3F"),
        ("SC_1F", "SC_NIESYMETRYCZNE"),
        ("SC_2F", "SC_NIESYMETRYCZNE"),
        ("SC_2F_G", "SC_NIESYMETRYCZNE"),
    ],
)
def test_dostepnosc_pakietu_dla_rodzajow_zwarciowych(
    client: TestClient, analysis_type: str, oczekiwany_rodzaj: str
) -> None:
    """Każdy rodzaj zwarcia dostaje pakiet WŁAŚCIWY dla swoich danych."""
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, analysis_type)

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["dostepny"] is True
    assert payload["rodzaj"] == oczekiwany_rodzaj
    assert payload["rodzaj_pl"]
    assert payload["powod_pl"] is None
    assert payload["punkty"], "bieg zwarciowy ma punkty do udokumentowania"
    assert all(p["target_id"] and p["nazwa"] for p in payload["punkty"])
    assert payload["zawartosc_pl"], "opis zawartości pakietu jest częścią kontraktu ekranu"


def test_dostepnosc_pakietu_rozplyw_mocy_bez_pakietu_z_powodem(client: TestClient) -> None:
    """Rozpływ mocy nie ma pakietu — brama mówi to WPROST, zamiast milczeć.

    Cecha brzegowa: rodzaj biegu spoza zamkniętej listy pakietów. Ekran ma
    dostać powód po polsku, a nie pusty przycisk.
    """
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["dostepny"] is False
    assert payload["rodzaj"] is None
    assert payload["powod_pl"]
    assert "pakiet" in payload["powod_pl"].lower()
    assert payload["punkty"] == []


def test_pakiet_niedostepny_odmawia_zamiast_zwracac_pusty_plik(client: TestClient) -> None:
    """Pobranie pakietu dla rodzaju bez pakietu = odmowa z powodem, nie pusty ZIP."""
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")

    assert response.status_code == 422, response.text
    assert response.json()["detail"]


def test_dostepnosc_dla_nieistniejacego_przebiegu_to_404(client: TestClient) -> None:
    response = client.get(f"/api/analysis-runs/{uuid4()}/pakiet-dowodowy/dostepnosc")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Zawartość pakietu × rodzaj biegu
# ---------------------------------------------------------------------------


def test_pakiet_sc3f_niesie_dowod_zrodlo_wykaz_i_odcisk(client: TestClient) -> None:
    """Pakiet SC3F = dowód + źródło LaTeX + wykaz plików + odcisk integralności.

    To jest RÓŻNICA wobec podglądu śladu w oknie dowodu: ślad pokazuje kroki,
    pakiet niesie zamknięty, policzalny artefakt z sumami kontrolnymi.
    """
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "SC_3F")

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert "attachment" in response.headers["content-disposition"]
    wpisy = _wpisy_zip(response.content)
    assert "proof_pack/proof.json" in wpisy
    assert "proof_pack/proof.tex" in wpisy
    assert "proof_pack/manifest.json" in wpisy
    assert "proof_pack/signature.json" in wpisy


def test_pakiet_zwarc_niesymetrycznych_niesie_trzy_rodzaje_zwarcia(client: TestClient) -> None:
    """Pakiet niesymetryczny = komplet 1F-Z / 2F / 2F-Z, każdy z własnym dowodem.

    Zamknięcie luki kontraktu: to wywołanie NIE podaje Z1/Z2/Z0 ani U_f ani
    operatora Fortescue — całość liczy serwer ze snapshotu biegu.
    """
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "SC_1F")

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")

    assert response.status_code == 200, response.text
    wpisy = _wpisy_zip(response.content)
    assert wpisy == {
        "pakiet_dowodowy/SC1FZ.zip",
        "pakiet_dowodowy/SC2F.zip",
        "pakiet_dowodowy/SC2FZ.zip",
    }
    with zipfile.ZipFile(io.BytesIO(response.content)) as zbiorczy:
        for nazwa in sorted(wpisy):
            with zipfile.ZipFile(io.BytesIO(zbiorczy.read(nazwa))) as pojedynczy:
                wewnetrzne = set(pojedynczy.namelist())
                assert "proof_pack/proof.json" in wewnetrzne
                assert "proof_pack/proof.tex" in wewnetrzne
                assert "proof_pack/manifest.json" in wewnetrzne


# ---------------------------------------------------------------------------
# Punkt zwarcia: domyślny / wskazany / spoza biegu
# ---------------------------------------------------------------------------


def test_wskazany_punkt_daje_inny_pakiet_niz_domyslny(client: TestClient) -> None:
    """Punkt zwarcia realnie steruje treścią pakietu (a nie tylko nazwą pliku)."""
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "SC_3F")

    punkty = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc").json()["punkty"]
    assert len(punkty) >= 2, "sieć testowa ma dwie szyny — dwa punkty zwarcia"

    domyslny = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    pierwszy = client.get(
        f"/api/analysis-runs/{run_id}/pakiet-dowodowy",
        params={"punkt": punkty[0]["target_id"]},
    )
    drugi = client.get(
        f"/api/analysis-runs/{run_id}/pakiet-dowodowy",
        params={"punkt": punkty[1]["target_id"]},
    )

    assert domyslny.status_code == pierwszy.status_code == drugi.status_code == 200
    # Domyślny punkt = pierwszy z listy (deterministycznie), nie „jakiś".
    assert domyslny.content == pierwszy.content
    assert pierwszy.content != drugi.content
    assert punkty[1]["target_id"] in drugi.headers["content-disposition"]


def test_punkt_spoza_przebiegu_odmawia_z_powodem(client: TestClient) -> None:
    """Punkt, którego bieg nie policzył, nie jest ofertą — odmowa zamiast zmyślenia."""
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "SC_3F")

    response = client.get(
        f"/api/analysis-runs/{run_id}/pakiet-dowodowy",
        params={"punkt": "wezel-ktorego-nie-ma"},
    )

    assert response.status_code == 422
    assert "wezel-ktorego-nie-ma" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Determinizm
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("analysis_type", ["SC_3F", "SC_2F_G"])
def test_pakiet_jest_deterministyczny_bajt_w_bajt(client: TestClient, analysis_type: str) -> None:
    """Ten sam przebieg i punkt → identyczny plik (reguła determinizmu).

    Pin obejmuje OBA rodzaje pakietu — znacznik czasu dowodu bierze się z biegu,
    nie z zegara serwera, więc powtórzenie nie może dać innych bajtów.
    """
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, analysis_type)

    pierwszy = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    drugi = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")

    assert pierwszy.status_code == drugi.status_code == 200
    assert pierwszy.content == drugi.content


def test_nazwa_pliku_i_manifest_bez_oznaczen_roboczych(client: TestClient) -> None:
    """Eksport nie niesie roboczych oznaczeń projektu (CLAUDE.md reguła 8).

    Deklaracja z docstringów `pakiet_biegu`/`equipment_proof` dostaje strażnika:
    ani nazwa pobieranego pliku, ani wykaz plików nie mogą zawierać oznaczeń
    roboczych typu „P12" (guard kodenamów skanuje wyłącznie interfejs).
    """
    import re

    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "SC_3F")

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert response.status_code == 200

    wzorzec = re.compile(r"\b[pP](?!0\b)\d+\b")
    assert not wzorzec.search(response.headers["content-disposition"])
    with zipfile.ZipFile(io.BytesIO(response.content)) as archiwum:
        manifest = archiwum.read("proof_pack/manifest.json").decode("utf-8")
    assert not wzorzec.search(manifest)
