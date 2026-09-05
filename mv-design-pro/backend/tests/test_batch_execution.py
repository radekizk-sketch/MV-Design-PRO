"""Testy serii przebiegów (wsadu) — karta BATCH-ROUTER.

Kontrakt HTTP + determinizm + iloczyn cech:
- końcówka × stan pusty/pełny × determinizm (odcisk serii),
- wykonanie realnym torem kanonicznym (bieg FINISHED, wyniki dostępne
  istniejącą końcówką `GET /api/execution/runs/{id}/results`),
- predykaty parami: odcisk treści scenariusza przypięty przy tworzeniu serii
  i weryfikowany przy wykonaniu (zmiana/usunięcie scenariusza po utworzeniu
  serii = uczciwa odmowa),
- ta sama brama uprawnień, co pojedynczy bieg (SC_2F bez Z2 → FAILED),
- jedno źródło wejścia solvera (`solver_input_for_scenario`) dla ścieżki
  pojedynczego biegu i serii, z naprawą klasy: konfiguracja scenariusza
  (`c_factor`, `thermal_time_seconds`) na WIERZCHU opcji biegu.

INWARIANTY POD TESTEM:
- ZERO losowości w odcisku serii (porządek podania scenariuszy bez znaczenia),
- wykonanie sekwencyjne w porządku posortowanych identyfikatorów,
- zero częściowego sukcesu (pierwsza awaria → FAILED, biegi wcześniejsze
  pozostają biegami kanonicznymi),
- wyniki WYŁĄCZNIE z solvera (zero fabrykacji — stary serwis PR-20 kończył
  biegi wynikami z żądania klienta; ta klasa defektu ma tu pin).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from api.main import app
from domain.batch_job import compute_batch_input_hash, new_batch_job
from domain.execution import ExecutionAnalysisType
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


@pytest.fixture(autouse=True)
def _reset_services():
    """Izolacja stanu serwisów pamięciowych i biegów kanonicznych."""
    from api.batch_execution import get_batch_service
    from api.fault_scenarios import get_fault_scenario_service
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    def _wyczysc() -> None:
        scenario_service = get_fault_scenario_service()
        scenario_service._scenarios.clear()
        scenario_service._case_scenarios.clear()
        scenario_service._scenario_runs.clear()
        get_batch_service().reset()
        reset_canonical_runs()
        reset_enm_store()

    _wyczysc()
    yield
    _wyczysc()


def _seed_valid_enm(case_id: str) -> None:
    """Minimalna, poprawna sieć SN (GPZ + kabel + szyna odpływu)."""
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(
        case_id,
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
    def test_tworzy_serie_pending_z_posortowanymi_scenariuszami(self):
        case_id = _nowy_przypadek()
        s1 = _create_scenario(case_id, name="A", element_ref="bus-main")
        s2 = _create_scenario(case_id, name="B", element_ref="bus-1")

        response = client.post(
            f"{BASE_URL}/study-cases/{case_id}/batches",
            json={"scenario_ids": [s2["scenario_id"], s1["scenario_id"]]},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "PENDING"
        assert data["study_case_id"] == case_id
        assert data["analysis_type"] == "SC_3F"
        assert data["scenario_ids"] == sorted([s1["scenario_id"], s2["scenario_id"]])
        assert data["run_ids"] == []
        assert data["errors"] == []
        assert len(data["batch_input_hash"]) == 64

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
        case_a = str(uuid4())
        case_b = str(uuid4())
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
        job_a = new_batch_job(uuid4(), ExecutionAnalysisType.SC_3F, ids, hashes)
        pary = dict(zip(ids, hashes, strict=True))
        odwrocone = list(reversed(ids))
        job_b = new_batch_job(
            uuid4(),
            ExecutionAnalysisType.SC_3F,
            odwrocone,
            [pary[i] for i in odwrocone],
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
    def test_wykonanie_konczy_serie_done_a_biegi_maja_wyniki(self):
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
        assert done["status"] == "DONE"
        assert len(done["run_ids"]) == 2
        assert done["errors"] == []

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
        """SC_2F bez danych Z2 → seria FAILED z polskim komunikatem blokady."""
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

    def test_scenariusz_usuniety_po_utworzeniu_serii_failed(self):
        """Predykaty parami: usunięcie scenariusza unieważnia serię przy wykonaniu."""
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
        """Predykaty parami: zmiana treści scenariusza unieważnia serię (odcisk
        przypięty przy tworzeniu i weryfikowany przy wykonaniu z JEDNEGO źródła
        — `compute_scenario_content_hash`)."""
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

    def test_awaria_w_srodku_serii_zachowuje_wczesniejsze_biegi(self):
        """Iloczyn: awaria × pozycja w serii — biegi sprzed awarii pozostają."""
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
        # Usuwamy DRUGI w porządku wykonania — pierwszy bieg zdąży się policzyć.
        assert client.delete(f"{BASE_URL}/fault-scenarios/{drugi}").status_code == 204

        done = client.post(f"{BASE_URL}/batches/{batch['batch_id']}/execute").json()
        assert done["status"] == "FAILED"
        assert len(done["run_ids"]) == 1
        run = client.get(f"{BASE_URL}/runs/{done['run_ids'][0]}").json()
        assert run["status"] == "DONE"

    def test_wykonanie_nie_pending_409(self):
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
        assert "wymagany PENDING" in second.json()["detail"]

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
        assert done["status"] == "DONE"

        bieg_serii = client.get(f"{BASE_URL}/runs/{done['run_ids'][0]}").json()
        assert bieg_serii["solver_input_hash"] == pojedynczy.json()["solver_input_hash"]
