"""Testy serii przebiegów (wsadu) — karta CV-3.3-C (trwały rejestr `run_batches`).

Kontrakt HTTP + determinizm + iloczyn cech:
- końcówka × stan pusty/pełny × determinizm (odcisk serii),
- wykonanie realnym torem kanonicznym (bieg FINISHED, wyniki dostępne
  istniejącą końcówką `GET /api/execution/runs/{id}/results`),
- predykaty parami: odcisk treści scenariusza przypięty przy tworzeniu serii
  i weryfikowany przy wykonaniu (zmiana/usunięcie scenariusza po utworzeniu
  serii = uczciwa odmowa TEJ pozycji, reszta próbowana niezależnie),
- ta sama brama uprawnień, co pojedynczy bieg (SC_2F bez Z2 → FAILED),
- jedno źródło wejścia solvera (`solver_input_for_scenario`) dla ścieżki
  pojedynczego biegu i serii, z naprawą klasy: konfiguracja scenariusza
  (`c_factor`, `thermal_time_seconds`) na WIERZCHU opcji biegu,
- TRWAŁOŚĆ: seria przetrwa symulowany restart procesu backendu (rejestr
  `run_batches`, R2 — nie ginie z procesem, jak dawne trzy słowniki w pamięci),
- WYKONANIE CIĄGŁE: awaria jednej pozycji NIE zatrzymuje pozostałych (status
  PARTIAL — nigdy cicho FINISHED),
- ŚWIEŻOŚĆ PER POZYCJA: `items[].result_freshness` liczona NA ŻYWO z koperty
  biegu, nie „zielona na zawsze".

INWARIANTY POD TESTEM:
- ZERO losowości w odcisku serii (porządek podania scenariuszy bez znaczenia),
- wykonanie sekwencyjne w porządku posortowanych identyfikatorów,
- KAŻDA pozycja jest próbowana — zero przerwania serii na pierwszej awarii
  (karta §0 C2; poprzednia wersja zatrzymywała się na pierwszej awarii),
- wyniki WYŁĄCZNIE z solvera (zero fabrykacji — stary serwis PR-20 kończył
  biegi wynikami z żądania klienta; ta klasa defektu ma tu pin).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from api.main import app
from domain.execution import ExecutionAnalysisType
from domain.run_batch import compute_batch_input_hash, new_run_batch
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record

client: TestClient
BASE_URL = "/api/execution"


@pytest.fixture(scope="module", autouse=True)
def _lifespan():
    """Zwiąż modułowy `client` z realnym `uow_factory` (CV-1-W).

    `POST /study-cases/{case_id}/batches` tłumaczy `case_id` na klucz magazynu
    ENM (`api/batch_execution.py`, `klucz_twin_z_sciezki`) — bez `with`
    (lifespan) `app.state.uow_factory` nie byłby wiązany i tłumaczenie
    kończyłoby się 404 „brak warstwy bazy danych" niezależnie od przypadku.
    """
    global client
    with TestClient(app) as test_client:
        client = test_client
        yield


def _nowy_przypadek() -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2) — testy tego pliku potrzebują prawdziwej pary
    projekt+przypadek zamiast dowolnego UUID-a.
    """
    project_resp = client.post("/api/projects", json={"name": "Batch execution — test"})
    assert project_resp.status_code == 201, project_resp.text
    case_resp = client.post(
        "/api/study-cases",
        json={"project_id": project_resp.json()["id"], "name": "Przypadek testu"},
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _dwa_przypadki_w_jednym_projekcie() -> tuple[str, str]:
    """Dwa przypadki JEDNEGO projektu — magazyn scenariuszy jest kluczowany
    projektem (Canonical Project Twin), więc oba przypadki dzielą klucz."""
    project_resp = client.post("/api/projects", json={"name": "Batch execution — cross-case"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]

    def _przypadek(nazwa: str) -> str:
        resp = client.post(
            "/api/study-cases",
            json={"project_id": project_id, "name": nazwa},
        )
        assert resp.status_code == 201, resp.text
        return str(resp.json()["id"])

    return _przypadek("Przypadek A"), _przypadek("Przypadek B")


@pytest.fixture(autouse=True)
def _reset_services():
    """Izolacja stanu serwisów pamięciowych, rejestru serii i biegów kanonicznych.

    Scenariusze zwarciowe żyją w magazynie na dysku (karta C6-PERSIST,
    `enm/scenariusze.py`) — `reset_enm_store()` czyści JE RÓWNIEŻ. Rejestr
    serii (`run_batches`, karta CV-3.3-C) żyje w TEJ SAMEJ bazie SQL co biegi
    kanoniczne — `reset_run_batches()` czyści go analogicznie do
    `reset_canonical_runs()`.
    """
    from application.batch_execution_service import reset_run_batches
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    def _wyczysc() -> None:
        reset_run_batches()
        reset_canonical_runs()
        reset_enm_store()

    _wyczysc()
    yield
    _wyczysc()


def _seed_valid_enm(case_id: str) -> None:
    """Minimalna, poprawna sieć SN (GPZ + kabel + szyna odpływu).

    CV-2-W: zasiew idzie pod KLUCZ PROJEKTU (`_klucz_modelu`), bo tam mieszka
    model. Wcześniejszy zasiew surowym `case_id` działał tylko dopóki żadna
    wcześniejsza odpowiedź API nie przetłumaczyła przypadku na klucz projektu —
    a odkąd każda odpowiedź z przypadkiem wylicza status wyników, tłumaczenie
    następuje już przy `POST /api/study-cases`.
    """
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    from tests.test_execution_api import _klucz_modelu

    set_enm(
        _klucz_modelu(case_id),
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Seria przebiegów — sieć testowa",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000101",
                        "ref_id": "bus-main",
                        "name": "Szyna glowna",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000102",
                        "ref_id": "bus-1",
                        "name": "Szyna odplywu",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000103",
                        "ref_id": "branch-1",
                        "name": "Odcinek SN",
                        "tags": [],
                        "meta": {},
                        "type": "cable",
                        "from_bus_ref": "bus-main",
                        "to_bus_ref": "bus-1",
                        "status": "closed",
                        "catalog_ref": "KABEL_SN_TEST",
                        "parameter_source": "CATALOG",
                        "length_km": 0.2,
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.073,
                        "b_siemens_per_km": 2.6e-07,
                    }
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000104",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-main",
                            voltage_kv=15.0,
                            sk3_mva=250.0,
                            rx_ratio=0.10,
                        ),
                    }
                ],
                "transformers": [],
                "loads": [],
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


def _create_scenario(
    case_id: str,
    name: str = "Zwarcie testowe",
    fault_type: str = "SC_3F",
    element_ref: str = "bus-1",
    c_factor: float = 1.1,
) -> dict:
    response = client.post(
        f"{BASE_URL}/study-cases/{case_id}/fault-scenarios",
        json={
            "name": name,
            "fault_type": fault_type,
            "location": {
                "element_ref": element_ref,
                "location_type": "BUS",
                "position": None,
            },
            "config": {
                "c_factor": c_factor,
                "thermal_time_seconds": 1.0,
                "include_branch_contributions": False,
            },
        },
    )
    assert response.status_code == 201
    return response.json()


# =============================================================================
# Tworzenie serii
# =============================================================================


class TestCreateBatch:
    def test_tworzy_serie_created_z_posortowanymi_scenariuszami(self):
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, name="A", element_ref="bus-main")
        s2 = _create_scenario(case_id, name="B", element_ref="bus-1")

        response = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s2["scenario_id"], s1["scenario_id"]]},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "CREATED"
        assert data["study_case_id"] == case_id
        assert data["analysis_type"] == "SC_3F"
        assert data["scenario_ids"] == sorted([s1["scenario_id"], s2["scenario_id"]])
        assert data["run_ids"] == []
        assert data["result_set_ids"] == []
        assert data["errors"] == []
        assert data["finished_at"] is None
        assert data["name"] is None
        assert len(data["batch_input_hash"]) == 64

        # Pola addytywne karty CV-3.3-C: koperta + pozycje (karta §0 C1/C3).
        assert data["envelope"] is not None
        assert data["envelope"]["wersja"] == 1
        assert data["envelope"]["options_hash"] == data["batch_input_hash"]
        assert len(data["items"]) == 2
        for pozycja, scenario_id in zip(data["items"], data["scenario_ids"], strict=True):
            assert pozycja["scenario_id"] == scenario_id
            assert pozycja["analysis_type"] == "SC_3F"
            assert pozycja["canonical_run_id"] is None
            assert pozycja["status"] == "CREATED"
            assert pozycja["error_message"] is None
            assert pozycja["result_freshness"] == "NONE"
        assert [p["position"] for p in data["items"]] == [0, 1]

    def test_nazwa_serii_z_zadania_do_rekordu_i_listy_a_pusta_to_brak(self):
        """Karta C1: nazwa serii ma pelny lancuch POST -> rekord -> GET lista/szczegol;
        pusty napis (same biale znaki) to BRAK nazwy, nie nazwa ''."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, name="A", element_ref="bus-main")

        nazwana = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={
                "scenario_ids": [s1["scenario_id"]],
                "name": "  Zwarcia — wariant letni  ",
            },
        )
        assert nazwana.status_code == 201
        assert nazwana.json()["name"] == "Zwarcia — wariant letni"

        pusta = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]], "name": "   "},
        )
        assert pusta.status_code == 201
        assert pusta.json()["name"] is None

        lista = client.get(f"{BASE_URL}/study-cases/{case_id}/batches")
        assert lista.status_code == 200
        nazwy = {b["batch_id"]: b["name"] for b in lista.json()["batches"]}
        assert nazwy[nazwana.json()["batch_id"]] == "Zwarcia — wariant letni"
        assert nazwy[pusta.json()["batch_id"]] is None

        szczegol = client.get(f"{BASE_URL}/batches/{nazwana.json()['batch_id']}")
        assert szczegol.status_code == 200
        assert szczegol.json()["name"] == "Zwarcia — wariant letni"

        za_dluga = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]], "name": "x" * 201},
        )
        assert za_dluga.status_code == 422

    def test_pusta_lista_scenariuszy_400(self):
        response = client.post(
            f"{BASE_URL}/study-cases/{uuid4()}/batches",
            json={"scenario_ids": []},
        )
        assert response.status_code == 400
        assert "co najmniej jednego scenariusza" in response.json()["detail"]

    def test_duplikaty_scenariuszy_400(self):
        case_id = _nowy_przypadek()
        s1 = _create_scenario(case_id)
        response = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"], s1["scenario_id"]]},
        )
        assert response.status_code == 400
        assert "duplikaty" in response.json()["detail"]

    def test_nieznany_scenariusz_404(self):
        response = client.post(
            f"{BASE_URL}/study-cases/{uuid4()}/batches",
            json={"scenario_ids": [str(uuid4())]},
        )
        assert response.status_code == 404

    def test_scenariusz_spoza_przypadku_400(self):
        """Scenariusz istnieje (RZECZYWISTY projekt), ale należy do INNEGO
        przypadku TEGO SAMEGO projektu — magazyn scenariuszy jest kluczowany
        projektem (karta C6-PERSIST), więc „spoza przypadku" wymaga dwóch
        przypadków WSPÓLNEGO projektu, nie dwóch dowolnych UUID-ów."""
        case_a, case_b = _dwa_przypadki_w_jednym_projekcie()
        s_obcy = _create_scenario(case_a)
        response = client.post(
            f"{BASE_URL}/study-cases/{case_b}/batches",
            json={"scenario_ids": [s_obcy["scenario_id"]]},
        )
        assert response.status_code == 400
        assert "nie należy do przypadku" in response.json()["detail"]

    def test_mieszane_typy_analizy_400(self):
        case_id = _nowy_przypadek()
        s3f = _create_scenario(case_id, name="3F", fault_type="SC_3F")
        s2f = _create_scenario(case_id, name="2F", fault_type="SC_2F")
        response = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s3f["scenario_id"], s2f["scenario_id"]]},
        )
        assert response.status_code == 400
        assert "ten sam typ analizy" in response.json()["detail"]

    def test_niepoprawny_uuid_400(self):
        response = client.post(
            f"{BASE_URL}/study-cases/nie-uuid/batches",
            json={"scenario_ids": [str(uuid4())]},
        )
        assert response.status_code == 400
        assert "UUID" in response.json()["detail"]


# =============================================================================
# Determinizm odcisku serii
# =============================================================================


class TestBatchHashDeterminism:
    def test_ten_sam_zbior_scenariuszy_ten_sam_odcisk(self):
        """Dwie serie nad tym samym zbiorem → identyczny batch_input_hash."""
        case_id = _nowy_przypadek()
        s1 = _create_scenario(case_id, name="A", element_ref="bus-main")
        s2 = _create_scenario(case_id, name="B", element_ref="bus-1")

        first = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"], s2["scenario_id"]]},
        ).json()
        second = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s2["scenario_id"], s1["scenario_id"]]},
        ).json()

        assert first["batch_input_hash"] == second["batch_input_hash"]
        assert first["batch_id"] != second["batch_id"]

    def test_domenowy_odcisk_niezalezny_od_porzadku(self):
        """Domena: porządek podania scenariuszy nie zmienia odcisku."""
        ids = [uuid4(), uuid4(), uuid4()]
        hashes = ["h1", "h2", "h3"]
        job_a = new_run_batch(
            project_id=None,
            case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=ids,
            scenario_content_hashes=hashes,
            envelope=None,
        )
        pary = dict(zip(ids, hashes, strict=True))
        odwrocone = list(reversed(ids))
        job_b = new_run_batch(
            project_id=None,
            case_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            scenario_ids=odwrocone,
            scenario_content_hashes=[pary[i] for i in odwrocone],
            envelope=None,
        )
        assert job_a.batch_input_hash == job_b.batch_input_hash

    def test_domenowy_odcisk_zalezy_od_tresci(self):
        ids = (uuid4(),)
        assert compute_batch_input_hash(
            ExecutionAnalysisType.SC_3F, ids, ("hash-a",)
        ) != compute_batch_input_hash(ExecutionAnalysisType.SC_3F, ids, ("hash-b",))


# =============================================================================
# Wykonanie serii — realny tor kanoniczny
# =============================================================================


class TestExecuteBatch:
    def test_wykonanie_konczy_serie_finished_a_biegi_maja_wyniki(self):
        """Iloczyn: wykonanie × realny solver × wyniki dostępne końcówką biegów."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, name="A", element_ref="bus-main")
        s2 = _create_scenario(case_id, name="B", element_ref="bus-1")

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"], s2["scenario_id"]]},
        ).json()

        response = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute")
        assert response.status_code == 200
        done = response.json()
        assert done["status"] == "FINISHED"
        assert done["finished_at"] is not None
        assert len(done["run_ids"]) == 2
        assert done["errors"] == []
        for pozycja in done["items"]:
            assert pozycja["status"] == "FINISHED"
            assert pozycja["canonical_run_id"] is not None
            assert pozycja["result_freshness"] == "FRESH"

        # Biegi serii to ZWYKŁE biegi kanoniczne — widoczne na liście biegów
        # przypadku i z wynikami pod istniejącą końcówką (zero fabrykacji:
        # wielkości pochodzą z solvera IEC 60909, nie z żądania).
        runs = client.get(f"{BASE_URL}/study-cases/{case_id}/runs").json()
        assert {r["id"] for r in runs["runs"]} >= set(done["run_ids"])
        for run_id in done["run_ids"]:
            run = client.get(f"{BASE_URL}/runs/{run_id}").json()
            assert run["status"] == "DONE"
            results = client.get(f"{BASE_URL}/runs/{run_id}/results")
            assert results.status_code == 200
            payload = results.json()
            assert payload["element_results"], "solver nie oddał wyników elementów"
            assert payload["deterministic_signature"]

    def test_wykonanie_sekwencyjne_w_porzadku_posortowanym(self):
        """Porządek biegów = porządek posortowanych identyfikatorów scenariuszy."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, name="A", element_ref="bus-main")
        s2 = _create_scenario(case_id, name="B", element_ref="bus-1")
        posortowane = sorted([s1["scenario_id"], s2["scenario_id"]])
        scenariusz_elementu = {
            s1["scenario_id"]: "bus-main",
            s2["scenario_id"]: "bus-1",
        }

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s2["scenario_id"], s1["scenario_id"]]},
        ).json()
        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()

        assert done["scenario_ids"] == posortowane
        assert [p["position"] for p in done["items"]] == [0, 1]
        assert [p["scenario_id"] for p in done["items"]] == posortowane
        # run_ids idą w tym samym porządku, co scenario_ids: bieg i-ty niesie
        # w opcjach identyfikator scenariusza i-tego (weryfikacja przez artefakt).
        from uuid import UUID as _UUID

        from enm.canonical_analysis import get_run

        for scenario_id, run_id in zip(posortowane, done["run_ids"], strict=True):
            run = get_run(_UUID(run_id))
            assert run is not None
            assert run.options["scenario_id"] == scenario_id
            assert run.options["location"]["element_ref"] == scenariusz_elementu[scenario_id]

    def test_brama_uprawnien_jak_pojedynczy_bieg(self):
        """SC_2F bez danych Z2 → seria FAILED (jedyna pozycja) z polskim
        komunikatem blokady."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s2f = _create_scenario(case_id, name="2F", fault_type="SC_2F")

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s2f["scenario_id"]]},
        ).json()
        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()

        assert done["status"] == "FAILED"
        assert done["run_ids"] == []
        assert any("zablokowana" in e.lower() for e in done["errors"])
        assert done["items"][0]["status"] == "FAILED"
        assert done["items"][0]["canonical_run_id"] is None
        assert done["items"][0]["result_freshness"] == "NONE"

    def test_scenariusz_usuniety_po_utworzeniu_serii_failed(self):
        """Predykaty parami: usunięcie scenariusza unieważnia TĘ pozycję przy
        wykonaniu (jedyna pozycja → seria FAILED w całości)."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id)

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]]},
        ).json()
        delete = client.delete(f"{BASE_URL}/fault-scenarios/{s1['scenario_id']}")
        assert delete.status_code == 204

        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()
        assert done["status"] == "FAILED"
        assert any("usunięty po utworzeniu serii" in e for e in done["errors"])

    def test_scenariusz_zmieniony_po_utworzeniu_serii_failed(self):
        """Predykaty parami: zmiana treści scenariusza unieważnia TĘ pozycję
        (odcisk przypięty przy tworzeniu i weryfikowany przy wykonaniu z
        JEDNEGO źródła — `compute_scenario_content_hash`)."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id)

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]]},
        ).json()
        update = client.put(
            f"{BASE_URL}/fault-scenarios/{s1['scenario_id']}",
            json={"name": "Zmieniona nazwa scenariusza"},
        )
        assert update.status_code == 200

        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()
        assert done["status"] == "FAILED"
        assert any("zmieniony po utworzeniu serii" in e for e in done["errors"])

    def test_awaria_jednej_pozycji_nie_zatrzymuje_pozostalych_partial(self):
        """Karta §0 C2 (WYKONANIE CIĄGŁE) — iloczyn: awaria × pozycja w serii ×
        reszta próbowana niezależnie. Poprzednia wersja zatrzymywała się na
        pierwszej awarii (status FAILED, druga pozycja NIGDY nie próbowana);
        odtąd DRUGA pozycja jest wykonana mimo awarii pierwszej — status
        PARTIAL, nie FAILED (część pozycji powiodła się)."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, name="A", element_ref="bus-main")
        s2 = _create_scenario(case_id, name="B", element_ref="bus-1")
        posortowane = sorted([s1["scenario_id"], s2["scenario_id"]])
        drugi = posortowane[1]

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"], s2["scenario_id"]]},
        ).json()
        # Usuwamy DRUGI w porządku wykonania.
        assert client.delete(f"{BASE_URL}/fault-scenarios/{drugi}").status_code == 204

        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()
        assert done["status"] == "PARTIAL"
        assert len(done["run_ids"]) == 1
        assert len(done["errors"]) == 1
        assert len(done["items"]) == 2
        pierwsza_pozycja, druga_pozycja = done["items"]
        assert pierwsza_pozycja["scenario_id"] == posortowane[0]
        assert pierwsza_pozycja["status"] == "FINISHED"
        assert pierwsza_pozycja["canonical_run_id"] is not None
        assert druga_pozycja["scenario_id"] == drugi
        assert druga_pozycja["status"] == "FAILED"
        assert druga_pozycja["canonical_run_id"] is None
        assert "usunięty po utworzeniu serii" in (druga_pozycja["error_message"] or "")

        run = client.get(f"{BASE_URL}/runs/{done['run_ids'][0]}").json()
        assert run["status"] == "DONE"

    def test_wszystkie_pozycje_failed_status_failed_nie_partial(self):
        """Iloczyn: N>1 pozycji × WSZYSTKIE zawodzą → FAILED (nie PARTIAL —
        PARTIAL wymaga MIESZANKI, nie samych awarii; odróżnia od poprzedniego
        testu, gdzie jedna pozycja się powiodła)."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, name="A", fault_type="SC_2F", element_ref="bus-main")
        s2 = _create_scenario(case_id, name="B", fault_type="SC_2F", element_ref="bus-1")

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"], s2["scenario_id"]]},
        ).json()
        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()

        assert done["status"] == "FAILED"
        assert done["run_ids"] == []
        assert len(done["errors"]) == 2
        assert all(p["status"] == "FAILED" for p in done["items"])

    def test_wykonanie_nie_created_409(self):
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, element_ref="bus-main")
        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]]},
        ).json()
        first = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute")
        assert first.status_code == 200
        second = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute")
        assert second.status_code == 409
        assert "wymagany CREATED" in second.json()["detail"]

    def test_wykonanie_nieznanej_serii_404(self):
        response = client.post(f"{BASE_URL}/batches/{uuid4()}/execute")
        assert response.status_code == 404


# =============================================================================
# Lista i szczegóły serii
# =============================================================================


class TestListAndGetBatch:
    def test_pusta_lista_uczciwe_zero(self):
        response = client.get(f"{BASE_URL}/study-cases/{uuid4()}/batches")
        assert response.status_code == 200
        assert response.json() == {"batches": [], "count": 0}

    def test_lista_najnowsze_pierwsze(self):
        case_id = _nowy_przypadek()
        s1 = _create_scenario(case_id, name="A", element_ref="bus-main")
        pierwsza = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]]},
        ).json()
        druga = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]]},
        ).json()

        listing = client.get(f"{BASE_URL}/study-cases/{case_id}/batches").json()
        assert listing["count"] == 2
        assert [b["batch_id"] for b in listing["batches"]] == [
            druga["batch_id"],
            pierwsza["batch_id"],
        ]

    def test_szczegoly_serii(self):
        case_id = _nowy_przypadek()
        s1 = _create_scenario(case_id)
        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]]},
        ).json()
        detail = client.get(f"{BASE_URL}/batches/{batch['batch_id']}")
        assert detail.status_code == 200
        assert detail.json() == batch

    def test_szczegoly_nieznanej_serii_404(self):
        response = client.get(f"{BASE_URL}/batches/{uuid4()}")
        assert response.status_code == 404

    def test_szczegoly_niepoprawny_uuid_400(self):
        response = client.get(f"{BASE_URL}/batches/nie-uuid")
        assert response.status_code == 400


# =============================================================================
# Karta CV-3.3-C — trwałość rejestru serii (R2, `run_batches`)
# =============================================================================


class TestTrwaloscPoRestarcie:
    def test_seria_przetrwa_symulowany_restart_procesu(self, tmp_path, monkeypatch):
        """Iloczyn: seria WYKONANA × restart procesu backendu × `GET` identyczny.

        Rejestr `run_batches` żyje w TEJ SAMEJ bazie SQL co `canonical_runs`
        (`run_batch_repository.py` reużywa `get_canonical_run_session_factory`).
        Baza domyślna testów jest W PAMIĘCI (autouse `_izolowana_baza_
        przebiegow`) — znika z ostatnim połączeniem, więc symulacja restartu
        wymaga bazy NA DYSKU (nadpisujemy `DATABASE_URL` własnym
        `monkeypatch`, zgodnie z konwencją `conftest.py`): zniszczenie i
        odtworzenie silnika SQLAlchemy (symulacja nowego procesu backendu) NIE
        usuwa pliku, więc dane MUSZĄ przetrwać, jeśli rejestr jest naprawdę
        trwały."""
        db_path = tmp_path / "run_batches_restart.db"
        monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")

        from infrastructure.persistence.repositories import (
            canonical_run_repository as repo_modul,
        )

        def _wymus_nowy_silnik() -> None:
            if repo_modul._cached_engine is not None:
                repo_modul._cached_engine.dispose()
            repo_modul._cached_engine = None
            repo_modul._cached_session_factory = None
            repo_modul._cached_database_url = None

        _wymus_nowy_silnik()

        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, element_ref="bus-main")
        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]]},
        ).json()
        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()
        assert done["status"] == "FINISHED"

        # Symuluj restart procesu: zniszcz silnik (zamyka WSZYSTKIE połączenia
        # do pliku) i wyczyść cache — NASTĘPNY dostęp buduje NOWY silnik od
        # zera, dokładnie jak przy starcie nowego procesu backendu. Plik na
        # dysku (w odróżnieniu od bazy w pamięci) przetrwa zniszczenie silnika.
        _wymus_nowy_silnik()

        po_restarcie = client.get(f"{BASE_URL}/batches/{batch['batch_id']}")
        assert po_restarcie.status_code == 200
        po_restarcie_json = po_restarcie.json()
        assert po_restarcie_json["batch_id"] == done["batch_id"]
        assert po_restarcie_json["status"] == "FINISHED"
        assert po_restarcie_json["run_ids"] == done["run_ids"]
        assert po_restarcie_json["items"][0]["canonical_run_id"] == (
            done["items"][0]["canonical_run_id"]
        )

        lista_po_restarcie = client.get(f"{BASE_URL}/study-cases/{case_id}/batches").json()
        assert lista_po_restarcie["count"] == 1
        assert lista_po_restarcie["batches"][0]["batch_id"] == done["batch_id"]

        # Bieg pozycji (R1) jest TEŻ dostępny po restarcie — to na nim opiera
        # się cała trwałość serii (karta §0 C1: "pozycja NIE ma własnego wyniku").
        wynik_biegu = client.get(f"{BASE_URL}/runs/{done['run_ids'][0]}/results")
        assert wynik_biegu.status_code == 200

        _wymus_nowy_silnik()


# =============================================================================
# Karta CV-3.3-C — koperta wspólna (§0 C1/C2/C5)
# =============================================================================


class TestKopertaWspolna:
    def test_koperta_serii_odzwierciedla_model_z_chwili_utworzenia(self):
        """Koperta serii jest budowana RAZ, przy tworzeniu — TA SAMA dla
        wszystkich pozycji (§0 C2: "JEDNĄ kopertą"), niezależnie od tego, ile
        pozycji ma seria."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, name="A", element_ref="bus-main")
        s2 = _create_scenario(case_id, name="B", element_ref="bus-1")

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"], s2["scenario_id"]]},
        ).json()

        koperta = batch["envelope"]
        assert koperta is not None
        assert koperta["wersja"] == 1  # brak JEDNEGO scenariusza na poziomie serii
        assert koperta["model_revision"] == 1
        assert koperta["options_hash"] == batch["batch_input_hash"]
        assert "semantic_fingerprint" in koperta
        assert "scenario_ref" not in koperta

        # Koperta NIE zmienia się po wykonaniu — jest zapisem z CHWILI
        # UTWORZENIA (§0 C5: seria nie kopiuje migawki do pozycji, każda
        # pozycja czyta model na własny rachunek przy wykonaniu).
        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()
        assert done["envelope"] == koperta


# =============================================================================
# Karta CV-3.3-C — świeżość per pozycja (§0 C3)
# =============================================================================


class TestSwiezoscPerPozycja:
    def test_pozycja_outdated_po_zmianie_modelu_nie_zielona_na_zawsze(self):
        """Iloczyn: bieg pozycji FINISHED (FRESH) × edycja modelu PO
        wykonaniu × kolejny odczyt serii → OUTDATED. Dowód, że świeżość jest
        liczona NA ŻYWO (§0 C3: "nie zielone na zawsze"), nie zapisywana raz
        przy wykonaniu."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, element_ref="bus-main")

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]]},
        ).json()
        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()
        assert done["items"][0]["result_freshness"] == "FRESH"

        # Edytuj model PO wykonaniu serii (dodaj odbiór) — operacja na SUROWYM
        # słowniku (`model_dump` → mutacja słownika → `model_validate`), żeby
        # uniknąć mieszania obiektów pydantic z surowym dict w polu listowym.
        from enm.models import EnergyNetworkModel
        from enm.store import get_enm, set_enm

        from tests.test_execution_api import _klucz_modelu

        klucz = _klucz_modelu(case_id)
        zrzut = get_enm(klucz).model_dump(mode="json")
        zrzut["loads"].append(
            {
                "id": "00000000-0000-0000-0000-000000000201",
                "ref_id": "load-nowy",
                "name": "Nowy odbior (test swiezosci)",
                "tags": [],
                "meta": {},
                "bus_ref": "bus-1",
                "p_mw": 0.1,
                "q_mvar": 0.03,
            }
        )
        set_enm(klucz, EnergyNetworkModel.model_validate(zrzut))

        po_edycji = client.get(f"{BASE_URL}/batches/{batch['batch_id']}").json()
        assert po_edycji["items"][0]["result_freshness"] == "OUTDATED"
        assert po_edycji["items"][0]["result_freshness_reason"] == "model-zmieniony"
        # Status WYKONANIA pozycji (FINISHED) jest niezależny od świeżości
        # WYNIKU — bieg SIĘ wykonał, tylko opisuje już nieaktualny model.
        assert po_edycji["items"][0]["status"] == "FINISHED"
        assert po_edycji["status"] == "FINISHED"


# =============================================================================
# Jedno źródło wejścia solvera (KLASA, NIE INSTANCJA)
# =============================================================================


class TestSolverInputJednoZrodlo:
    def test_konfiguracja_scenariusza_na_wierzchu_opcji(self):
        """Naprawa klasy: `c_factor`/`thermal_time_seconds` scenariusza muszą
        trafiać na WIERZCH opcji biegu (wykonawca kanoniczny czyta z wierzchu;
        dotąd wartości zagnieżdżone pod `config` były cicho ignorowane)."""
        from application.fault_scenario_service import solver_input_for_scenario
        from domain.fault_scenario import (
            FaultLocation,
            FaultType,
            ShortCircuitConfig,
            new_fault_scenario,
        )

        scenario = new_fault_scenario(
            study_case_id=uuid4(),
            name="Pin konfiguracji",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="bus-x", location_type="BUS"),
            config=ShortCircuitConfig(c_factor=1.05, thermal_time_seconds=0.5),
        )
        options = solver_input_for_scenario(scenario)
        assert options["c_factor"] == 1.05
        assert options["thermal_time_seconds"] == 0.5
        assert options["config"]["c_factor"] == 1.05
        assert options["fault_type"] == "SC_3F"
        assert options["location"]["element_ref"] == "bus-x"

    def test_pojedynczy_bieg_i_seria_maja_ten_sam_odcisk_wejscia(self):
        """Pojedynczy bieg ze scenariusza i bieg tej samej treści w serii mają
        IDENTYCZNY `solver_input_hash` — dowód jednego źródła wejścia."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, element_ref="bus-main")

        pojedynczy = client.post(f"{BASE_URL}/fault-scenarios/{s1['scenario_id']}/runs", json={})
        assert pojedynczy.status_code == 201

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]]},
        ).json()
        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()
        assert done["status"] == "FINISHED"

        bieg_serii = client.get(f"{BASE_URL}/runs/{done['run_ids'][0]}").json()
        assert bieg_serii["solver_input_hash"] == pojedynczy.json()["solver_input_hash"]


# =============================================================================
# Karta C6-PERSIST — „ma powiązane biegi" wyprowadzone z koperty DLA OBU
# ścieżek (pojedynczy bieg I seria — reguła KLASA, NIE INSTANCJA: naprawa
# tylko ścieżki pojedynczego biegu zostawiałaby serię jako drugą, niewidoczną
# dla `has_associated_runs`, drogę do tego samego stanu).
# =============================================================================


class TestBiegSeriiMaKoperteZeScenariuszem:
    def test_bieg_serii_ma_koperte_wersji_2_ze_scenario_ref(self):
        from uuid import UUID as _UUID

        from enm.canonical_analysis import get_run

        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, name="A", element_ref="bus-main")

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]]},
        ).json()
        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()
        assert done["status"] == "FINISHED"

        run = get_run(_UUID(done["run_ids"][0]))
        assert run is not None
        koperta = run.koperta
        assert koperta is not None
        assert koperta.wersja == 2
        assert koperta.scenario_ref == (s1["scenario_id"], 1)

    def test_usuniecie_scenariusza_zablokowane_po_biegu_serii(self):
        """Bieg utworzony PRZEZ SERIĘ blokuje usunięcie scenariusza dokładnie
        tak samo, jak bieg utworzony pojedynczo — jedno źródło prawdy
        (koperta), nie dwa niezależne mechanizmy rejestracji."""
        case_id = _nowy_przypadek()
        _seed_valid_enm(case_id)
        s1 = _create_scenario(case_id, name="A", element_ref="bus-main")

        batch = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s1["scenario_id"]]},
        ).json()
        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()
        assert done["status"] == "FINISHED"

        delete_resp = client.delete(f"{BASE_URL}/fault-scenarios/{s1['scenario_id']}")
        assert delete_resp.status_code == 409
        assert "powiązanymi przebiegami" in delete_resp.json()["detail"]


# =============================================================================
# CV-4.2b: seria podaje biegom pozycji fabryke `UnitOfWork` ZADANIA (bez zapasu)
# =============================================================================


def test_seria_przekazuje_fabryke_uow_zadania_do_kazdego_biegu_pozycji(monkeypatch):
    """`execute_batch(..., uow_factory=)` -> `execute_run(run.id, uow_factory=TA SAMA)`.

    Do CV-4.2b serwis wolal `execute_run(run.id)` bez fabryki, wiec bieg pozycji ze
    scenariuszem wskazujacym konfiguracje audytu 2 stacji czytalby ja WLASNYM
    silnikiem z `DATABASE_URL` (inna baza niz `app.state.uow_factory`).
    """
    from api import batch_execution as api_batch
    from application.batch_execution_service import BatchExecutionService
    from enm.canonical_analysis import execute_run

    widziane: list[object] = []

    def _wykonaj(run_id, **kwargs):
        widziane.append(kwargs.get("uow_factory"))
        return execute_run(run_id, **kwargs)

    monkeypatch.setattr(
        api_batch,
        "_batch_service",
        BatchExecutionService(
            api_batch.get_fault_scenario_service(), execute_canonical_run=_wykonaj
        ),
    )
    case_id = _nowy_przypadek()
    _seed_valid_enm(case_id)
    s1 = _create_scenario(case_id, name="A", element_ref="bus-main")
    s2 = _create_scenario(case_id, name="B", element_ref="bus-1")
    batch = client.post(
        f"{BASE_URL}/study-cases/{case_id}/batches",
        json={"scenario_ids": [s1["scenario_id"], s2["scenario_id"]]},
    ).json()

    done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()

    assert done["status"] == "FINISHED", done
    assert len(widziane) == 2
    assert all(fabryka is app.state.uow_factory for fabryka in widziane)
