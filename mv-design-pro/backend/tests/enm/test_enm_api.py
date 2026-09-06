"""Tests for ENM API read/validate/run/domain-ops endpoints."""

from typing import Any
from uuid import uuid4

import pytest
from api.enm import router as enm_router
from domain.models import Project
from domain.study_case import StudyCase
from enm.canonical_analysis import reset_canonical_runs
from enm.store import reset_enm_store
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_payload, gpz_source_record


def _seed_enm(client: TestClient, case_id: str, payload: dict) -> None:
    """Zasiej ENM przez REALNA koncowke `PUT /enm` (jedyna droga zapisu z API).

    CV-1-W: magazyn jest kluczowany kluczem projektu, nie surowym `case_id` —
    pisanie wprost przez `enm.store.set_enm(case_id, ...)` ladowalo dane pod
    klucz, ktorego zaden odczyt API juz nie widzi. `PUT /api/cases/{case_id}/enm`
    przechodzi przez to samo tlumaczenie `KluczTwin`, co kazdy odczyt.
    """
    resp = client.put(f"/api/cases/{case_id}/enm", json=payload)
    assert resp.status_code == 200, resp.text


def _nowy_przypadek(client: TestClient) -> str:
    """Utworz REALNY projekt + przypadek wprost przez UoW; zwroc `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2, `application/twin_key.py`). Ta aplikacja testowa montuje
    WYLACZNIE `enm_router` (bez tras projektow/przypadkow), wiec pary nie da
    sie utworzyc przez HTTP — tworzymy ja tak samo jak
    `tests/invariants/test_wlasnosc_modelu_projektu.py::_projekt_z_przypadkami`,
    wprost przez `uow_factory` zawieszony na `client.app.state`.
    """
    uow_factory = client.app.state.uow_factory
    project_id = uuid4()
    case_id = uuid4()
    with uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Test ENM API"), commit=False)
        uow.cases.add_study_case(
            StudyCase(id=case_id, project_id=project_id, name="Przypadek testu"),
            commit=False,
        )
        uow.commit()
    return str(case_id)


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


@pytest.fixture
def client(uow_factory):
    """Lightweight app with only ENM router, wired to a real uow_factory (CV-1)."""
    test_app = FastAPI()
    test_app.include_router(enm_router)
    test_app.state.uow_factory = uow_factory
    return TestClient(test_app)


def _valid_enm_payload(name: str) -> dict:
    return {
        "header": {
            "name": name,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "b1",
                "name": "B1",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            }
        ],
        "branches": [],
        "transformers": [],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="s1",
                    name="S1",
                    bus_ref="b1",
                    voltage_kv=15.0,
                    sk3_mva=200.0,
                    rx_ratio=0.10,
                ),
            }
        ],
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


def _valid_enm_payload_with_z0(name: str) -> dict:
    payload = _valid_enm_payload(name)
    payload["sources"][0].update({"r0_ohm": 0.16, "x0_ohm": 1.6})
    return payload


def _valid_enm_with_field_specs(name: str) -> dict:
    payload = _valid_enm_payload(name)
    payload["substations"] = [
        {
            "id": "00000000-0000-0000-0000-000000000003",
            "ref_id": "sub_1",
            "name": "Stacja 1",
            "tags": [],
            "meta": {
                "field_specs": [
                    {
                        "field_ref": "field_in_1",
                        "name": "Pole IN",
                        "bay_role": "IN",
                        "bus_ref": "b1",
                        "equipment_refs": [],
                        "protection_ref": None,
                        "tags": [],
                        "meta": {},
                    }
                ]
            },
            "station_type": "mv_lv",
            "bus_refs": ["b1"],
        }
    ]
    return payload


def _valid_enm_with_legacy_bay(name: str) -> dict:
    payload = _valid_enm_payload(name)
    payload["substations"] = [
        {
            "id": "00000000-0000-0000-0000-000000000003",
            "ref_id": "sub_1",
            "name": "Stacja 1",
            "tags": [],
            "meta": {},
            "station_type": "mv_lv",
            "bus_refs": ["b1"],
        }
    ]
    payload["bays"] = [
        {
            "id": "00000000-0000-0000-0000-000000000004",
            "ref_id": "bay_legacy_1",
            "name": "Pole legacy",
            "tags": [],
            "meta": {},
            "bay_role": "IN",
            "substation_ref": "sub_1",
            "bus_ref": "b1",
            "equipment_refs": [],
            "protection_ref": None,
        }
    ]
    return payload


class TestENMRead:
    def test_get_default_enm(self, client):
        case_id = _nowy_przypadek(client)
        response = client.get(f"/api/cases/{case_id}/enm")
        assert response.status_code == 200
        data = response.json()
        assert "header" in data
        assert data["header"]["enm_version"] == "1.0"
        assert data["buses"] == []

    def test_get_returns_seeded_enm(self, client):
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_payload("Updated"))
        response = client.get(f"/api/cases/{case_id}/enm")
        assert response.status_code == 200
        assert response.json()["header"]["name"] == "Updated"


class TestENMV2Projection:
    def test_v2_projection_returns_read_only_m1_contract(self, client):
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_payload("V2 Projection"))

        response = client.get(f"/api/cases/{case_id}/enm/v2-projection")

        assert response.status_code == 200
        data = response.json()
        assert data["header"]["enm_version"] == "2.0"
        assert data["header"]["source_enm_version"] == "1.0"
        assert data["header"]["name"] == "V2 Projection"
        assert data["projection_hash_sha256"]
        assert data["element_refs"][0]["ref_id"] == "b1"
        assert data["operating_variants"][0]["ref_id"] == "variant.uklad_normalny"
        assert data["switching_state_snapshots"][0]["ref_id"] == "switching.uklad_normalny.base"
        assert data["summary"]["buses"] == 1

        stored = client.get(f"/api/cases/{case_id}/enm").json()
        assert stored["header"]["enm_version"] == "1.0"

    def test_v2_projection_hash_is_deterministic(self, client):
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_payload("V2 Deterministic"))

        first = client.get(f"/api/cases/{case_id}/enm/v2-projection").json()
        second = client.get(f"/api/cases/{case_id}/enm/v2-projection").json()

        assert first["projection_hash_sha256"] == second["projection_hash_sha256"]


class TestENMValidate:
    def test_empty_enm_fails_validation(self, client):
        case_id = _nowy_przypadek(client)
        client.get(f"/api/cases/{case_id}/enm")
        response = client.get(f"/api/cases/{case_id}/enm/validate")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "FAIL"
        codes = [issue["code"] for issue in data["issues"]]
        assert "E001" in codes
        assert "E002" in codes

    def test_valid_enm_passes(self, client):
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_payload("Test"))
        response = client.get(f"/api/cases/{case_id}/enm/validate")
        data = response.json()
        assert data["status"] in ("OK", "WARN")
        assert data["analysis_available"]["short_circuit_3f"] is True


def _run_app(uow_factory) -> TestClient:
    """Aplikacja testowa z torem KANONICZNYM uruchomienia (K5.1, CV-4.3-A4).

    `POST /api/cases/{id}/runs/{short-circuit,power-flow}` (`api/enm.py`) zostały
    skasowane procedurą siedmiu kroków (0 konsumentów produkcyjnych). `TestRunDispatch`
    jedzie odtąd torem kanonicznym na TEJ SAMEJ sieci: `POST /api/execution/
    study-cases/{id}/runs` -> `POST /api/execution/runs/{id}/execute` ->
    `GET /api/analysis-runs/{run_id}/results/short-circuit` (+ `/trace` dla White Box).
    """
    from api.analysis_runs import router as analysis_runs_router
    from api.execution_runs import router as execution_runs_router

    test_app = FastAPI()
    test_app.include_router(enm_router)
    # Ścieżki obu routerów są już pełne (`/api/execution/...`, `/api/analysis-runs/...`)
    # — ten sam wzorzec montażu co `api/main.py` (bez dodatkowego prefiksu).
    test_app.include_router(execution_runs_router)
    test_app.include_router(analysis_runs_router, prefix="/api")
    test_app.state.uow_factory = uow_factory
    return TestClient(test_app)


def _create_and_execute(
    client: TestClient, case_id: str, analysis_type: str, solver_input: dict | None = None
):
    """Bieg kanoniczny: create -> execute. Zwraca (odpowiedź create, odpowiedź execute)."""
    body: dict[str, Any] = {"analysis_type": analysis_type, "solver_input": solver_input or {}}
    utworzony = client.post(f"/api/execution/study-cases/{case_id}/runs", json=body)
    if utworzony.status_code != 201:
        return utworzony, None
    run_id = utworzony.json()["id"]
    wykonany = client.post(f"/api/execution/runs/{run_id}/execute")
    return utworzony, wykonany


def _sc_rows(client: TestClient, run_id: str) -> list[dict]:
    resp = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit")
    assert resp.status_code == 200, resp.text
    return resp.json()["rows"]


def _trace_steps(client: TestClient, run_id: str) -> list[dict]:
    resp = client.get(f"/api/analysis-runs/{run_id}/trace")
    assert resp.status_code == 200, resp.text
    return resp.json()["trace"]


class TestRunDispatch:
    def test_run_fails_on_empty_enm(self, uow_factory):
        client = _run_app(uow_factory)
        case_id = _nowy_przypadek(client)
        client.get(f"/api/cases/{case_id}/enm")
        # Tor kanoniczny odmawia CONFLICT (409), nie 422: `create_run` podnosi
        # `ValueError` dla modelu bez blokerów walidacji (E001 brak źródła,
        # E002 brak szyn), a `execution_runs.py::create_run` mapuje go na 409
        # (ten sam kontrakt co `tests/test_execution_api.py` dla przypadku bez
        # zasianego ENM — 422 było WYŁĄCZNIE konwencją skasowanej trasy `enm.py`).
        utworzony, _ = _create_and_execute(client, case_id, "SC_3F")
        assert utworzony.status_code == 409, utworzony.text

    def test_run_succeeds_on_valid_enm(self, uow_factory):
        client = _run_app(uow_factory)
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_payload("SC Test"))

        utworzony, wykonany = _create_and_execute(client, case_id, "SC_3F")
        assert utworzony.status_code == 201, utworzony.text
        assert wykonany.status_code == 200, wykonany.text
        assert wykonany.json()["status"] == "DONE"

        rows = _sc_rows(client, utworzony.json()["id"])
        assert len(rows) >= 1
        assert rows[0]["ikss_ka"] > 0

    def test_run_dispatch_ignores_client_snapshot_body(self, uow_factory):
        """Ciało żądania nie może wstrzyknąć modelu innego niż committed ENM.

        Kontrakt `CreateRunRequest` (Pydantic) czyta WYŁĄCZNIE `analysis_type`/
        `solver_input` — dowolne inne klucze najwyższego poziomu są strukturalnie
        odrzucane przez walidację schematu (nie "po cichu ignorowane w kodzie
        handlera" jak w skasowanej trasie, tylko niedopuszczalne dla samego
        kształtu ciała), a ENM do biegu ZAWSZE pochodzi z `get_enm(klucz_twin)`
        wewnątrz `create_run` — ten sam fakt architektoniczny, silniejsza gwarancja.
        """
        client = _run_app(uow_factory)
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_payload("Committed ENM"))

        utworzony = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={
                "analysis_type": "SC_3F",
                "solver_input": {},
                "snapshot": {"header": {"name": "Wstrzykniety draft"}, "buses": []},
                "enm": {"buses": [], "sources": []},
                "buses": [],
            },
        )
        assert utworzony.status_code == 201, utworzony.text
        wykonany = client.post(f"/api/execution/runs/{utworzony.json()['id']}/execute")
        assert wykonany.status_code == 200, wykonany.text

        rows = _sc_rows(client, utworzony.json()["id"])
        assert len(rows) >= 1
        assert rows[0]["ikss_ka"] > 0

    def test_run_dispatch_accepts_fault_type_1f_without_accepting_enm_draft(self, uow_factory):
        client = _run_app(uow_factory)
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_payload_with_z0("Committed ENM Z0"))

        utworzony, wykonany = _create_and_execute(client, case_id, "SC_1F")
        assert utworzony.status_code == 201, utworzony.text
        assert wykonany.status_code == 200, wykonany.text
        run_id = utworzony.json()["id"]

        rows = _sc_rows(client, run_id)
        assert len(rows) >= 1
        assert rows[0]["fault_type"] == "1F"
        assert rows[0]["reporting_status"] == "reportable"
        assert rows[0]["proof_status"] == "complete"
        assert rows[0]["proof_ref"].startswith("proof:short-circuit:")

        kroki = _trace_steps(client, run_id)
        krok_ikss = next(krok for krok in kroki if krok["key"] == "Ikss")
        assert "z0_ohm" not in krok_ikss["inputs"]  # Ikss nie zależy od Z0 wprost
        krok_z0 = next((krok for krok in kroki if "z0_ohm" in krok.get("inputs", {})), None)
        assert krok_z0 is not None, "brak kroku śladu z parametrem z0_ohm dla zwarcia 1F"

    def test_run_dispatch_accepts_fault_type_2fg_with_reportable_proof(self, uow_factory):
        client = _run_app(uow_factory)
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_payload_with_z0("Committed ENM Z0"))

        # `SC_2F_G` domyślnie ustawia `fault_type="2F+Z"` (`_normalize_solver_input`)
        # — dokładnie ta wartość, którą skasowana trasa przyjmowała jawnie w ciele.
        utworzony, wykonany = _create_and_execute(client, case_id, "SC_2F_G")
        assert utworzony.status_code == 201, utworzony.text
        assert wykonany.status_code == 200, wykonany.text
        run_id = utworzony.json()["id"]

        rows = _sc_rows(client, run_id)
        assert len(rows) >= 1
        assert rows[0]["fault_type"] == "2F+G"
        assert rows[0]["reporting_status"] == "reportable"
        assert rows[0]["proof_status"] == "complete"
        assert rows[0]["proof_binding"]["z0_source"] == "ENM_COMMITTED"
        assert rows[0]["dopuszczalnosc_raportowa"] is True

    def test_run_dispatch_scenario_min_przechodzi_whitelist_opcji(self, uow_factory):
        """Pin ``scenario`` przechodzącego przez `solver_input` toru kanonicznego.

        Deklaracja bez testu = fałszywa pewność (KLASA-NIE-INSTANCJA §4):
        testy silnika wołają ``_execute_short_circuit`` bezpośrednio, więc
        zgubienie ``"scenario"`` między API a solverem zostawiłoby je zielone,
        a API po cichu gubiłoby opcję (phantom). Ten test jedzie PEŁNĄ ścieżką
        HTTP i przypina skutek obserwowalny: c_min=1,00 dla sieci SN (>1 kV,
        IEC 60909 Tab. 1) zamiast domyślnego c_max=1,10 — czytane z kroku
        White Box ``Ikss`` (jedyne miejsce, w którym `c_factor` jest publicznie
        obserwowalny na torze kanonicznym; lista wierszy zbiorczych go nie niesie).
        """
        client = _run_app(uow_factory)
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_payload("Committed ENM scenariusz"))

        utworzony_max, wykonany_max = _create_and_execute(client, case_id, "SC_3F")
        assert wykonany_max.status_code == 200, wykonany_max.text
        run_id_max = utworzony_max.json()["id"]
        c_factor_max = next(
            krok for krok in _trace_steps(client, run_id_max) if krok["key"] == "Ikss"
        )["inputs"]["c_factor"]
        ikss_max = _sc_rows(client, run_id_max)[0]["ikss_ka"]
        assert c_factor_max == 1.10

        utworzony_min, wykonany_min = _create_and_execute(
            client, case_id, "SC_3F", {"scenario": "min"}
        )
        assert wykonany_min.status_code == 200, wykonany_min.text
        run_id_min = utworzony_min.json()["id"]
        c_factor_min = next(
            krok for krok in _trace_steps(client, run_id_min) if krok["key"] == "Ikss"
        )["inputs"]["c_factor"]
        ikss_min = _sc_rows(client, run_id_min)[0]["ikss_ka"]

        assert c_factor_min == 1.00
        assert ikss_min < ikss_max

    def test_run_response_rows_without_inline_branch_flows(self, uow_factory):
        """V12K-284: lista wierszy zbiorczych niesie FLAGĘ dostępności rozpływu,
        nie sam rozpływ — treść pobiera się na żądanie (`.../rozplyw?target_id=`).

        Kształt kanoniczny (`build_short_circuit_results`, `include_rozplyw=False`
        domyślnie) niesie klucz `branch_contributions` ZAWSZE, z wartością `None`
        gdy rozpływ nie jest dołączony — inaczej niż skasowana trasa, która klucz
        w ogóle POMIJAŁA (`wiersze_swiezego_biegu_bez_rozplywu`). Ten sam fakt
        fizyczny ("rozpływ nie jest tu, pobierz go osobno"), inny odcisk kontraktu.
        """
        client = _run_app(uow_factory)
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_payload("SC slim"))

        utworzony, wykonany = _create_and_execute(client, case_id, "SC_3F")
        assert wykonany.status_code == 200, wykonany.text

        rows = _sc_rows(client, utworzony.json()["id"])
        assert len(rows) >= 1
        for wiersz in rows:
            assert wiersz["branch_contributions"] is None
            assert wiersz["branch_contributions_available"] is True
            # Wielkości zwarciowe wiersza pozostają nietknięte.
            assert wiersz["ikss_ka"] > 0

    def test_branch_flows_available_on_demand_for_fresh_run(self, uow_factory):
        """Rozpływ świeżego biegu pobierany końcówką „na żądanie" (parytet treści).

        Bramka trasy: to, czego lista wierszy już nie niesie, MUSI być osiągalne
        przez istniejącą końcówkę rozpływu dla wskazanego punktu zwarcia.
        """
        from infrastructure.persistence.repositories.canonical_run_repository import (
            KLUCZ_SLADU_ROZPLYWU,
        )

        klient = _run_app(uow_factory)
        case_id = _nowy_przypadek(klient)
        _seed_enm(klient, case_id, _valid_enm_payload("SC slim rozplyw"))

        utworzony, wykonany = _create_and_execute(klient, case_id, "SC_3F")
        assert wykonany.status_code == 200, wykonany.text
        run_id = utworzony.json()["id"]

        wiersz = _sc_rows(klient, run_id)[0]
        # KLASA, NIE INSTANCJA (2026-09-05): ślad WHITE BOX podziału prądu
        # (`branch_flow_trace`) nie wraca w wierszu zbiorczym — sam ślad dawał
        # 105 MB odpowiedzi na sieci 50 stacji. `branch_contributions` WRACA w
        # wierszu zbiorczym z wartością `None` (kontrakt kanoniczny, patrz test
        # wyżej) — to NIE jest ten sam odcisk co skasowana trasa, więc sprawdzamy
        # tu wyłącznie klucz, którego kanon nigdy nie umieszcza w wierszu zbiorczym.
        assert KLUCZ_SLADU_ROZPLYWU not in wiersz
        assert wiersz["branch_contributions_available"] is True

        rozplyw = klient.get(
            f"/api/analysis-runs/{run_id}/results/short-circuit/rozplyw",
            params={"target_id": wiersz["target_id"]},
        )
        assert rozplyw.status_code == 200
        assert rozplyw.json()["branch_contributions"] is not None
        # Ślad podziału prądu tego punktu jest osiągalny tą samą końcówką.
        assert rozplyw.json()["branch_flow_trace"], "ślad WHITE BOX podziału musi być dostępny"


class TestDomainOpsCatalogPolicy:
    def test_domain_ops_rejects_missing_catalog_binding_and_keeps_snapshot(self, client):
        case_id = _nowy_przypadek(client)

        add_source = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "add_grid_source_sn",
                    "payload": gpz_payload(voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.10),
                },
            },
        )
        assert add_source.status_code == 200

        before = client.get(f"/api/cases/{case_id}/enm").json()
        before_hash = before["header"]["hash_sha256"]

        malformed = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "snapshot_base_hash": before_hash,
                "operation": {
                    "name": "continue_trunk_segment_sn",
                    "payload": {
                        "from_terminal": {"type": "source"},
                        "segment": {"rodzaj": "KABEL", "dlugosc_m": 200.0},
                    },
                },
            },
        )
        assert malformed.status_code == 422
        body = malformed.json()
        assert body["detail"]["code"] == "catalog.ref_required"

        after = client.get(f"/api/cases/{case_id}/enm").json()
        assert after["header"]["hash_sha256"] == before_hash
        assert after["branches"] == before["branches"]

    def test_domain_ops_add_ct_persists_measurement_for_field_spec(self, client):
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_with_field_specs("Field Adapter"))

        response = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "add_ct",
                    "payload": {
                        "field_ref": "field_in_1",
                        "ratio_primary_a": 400.0,
                        "ratio_secondary_a": 5.0,
                        "catalog_binding": {
                            "catalog_namespace": "CT",
                            "catalog_item_id": "ct_400_5_5p20_15va_abb",
                            "catalog_item_version": "2024.1",
                        },
                    },
                }
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body.get("error") is None
        assert "changes" in body
        assert body["changes"]["created_element_ids"]

        after = client.get(f"/api/cases/{case_id}/enm").json()
        assert len(after["measurements"]) == 1
        measurement = after["measurements"][0]
        assert measurement["measurement_type"] == "CT"
        assert measurement["bay_ref"] == "field_in_1"
        assert measurement["bus_ref"] == "b1"
        assert measurement["catalog_ref"] == "ct_400_5_5p20_15va_abb"
        assert measurement["catalog_namespace"] == "CT"
        assert measurement["source_mode"] == "KATALOG"

    def test_domain_ops_add_relay_persists_protection_for_field_spec(self, client):
        case_id = _nowy_przypadek(client)
        payload = _valid_enm_with_field_specs("Relay Adapter")
        payload["buses"].append(
            {
                "id": "00000000-0000-0000-0000-000000000004",
                "ref_id": "b2",
                "name": "B2",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            }
        )
        payload["branches"].append(
            {
                "id": "00000000-0000-0000-0000-000000000005",
                "ref_id": "brk_1",
                "name": "Wyłącznik pola",
                "tags": [],
                "meta": {},
                "from_bus_ref": "b1",
                "to_bus_ref": "b2",
                "status": "closed",
                "type": "breaker",
            }
        )
        payload["substations"][0]["meta"]["field_specs"][0]["equipment_refs"] = ["brk_1"]
        _seed_enm(client, case_id, payload)

        add_ct = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "add_ct",
                    "payload": {
                        "field_ref": "field_in_1",
                        "ratio_primary_a": 400.0,
                        "ratio_secondary_a": 5.0,
                        "catalog_binding": {
                            "catalog_namespace": "CT",
                            "catalog_item_id": "ct_400_5_5p20_15va_abb",
                            "catalog_item_version": "2024.1",
                        },
                    },
                }
            },
        )
        assert add_ct.status_code == 200

        response = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "add_relay",
                    "payload": {
                        "field_ref": "field_in_1",
                        "breaker_ref": "brk_1",
                        "relay_type": "NADPRADOWY",
                        "protection": {"catalog_item_id": "REF-OC-EF-500"},
                    },
                }
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body.get("error") is None

        after = client.get(f"/api/cases/{case_id}/enm").json()
        assert len(after["protection_assignments"]) == 1
        assignment = after["protection_assignments"][0]
        assert assignment["breaker_ref"] == "brk_1"
        assert assignment["ct_ref"] == after["measurements"][0]["ref_id"]
        assert assignment["catalog_ref"] == "REF-OC-EF-500"
        assert assignment["catalog_namespace"] == "ZABEZPIECZENIE"
        field_spec = after["substations"][0]["meta"]["field_specs"][0]
        assert field_spec["protection_ref"] == assignment["ref_id"]

    def test_domain_ops_rejects_legacy_bay_parameter_update_without_persisting(self, client):
        case_id = _nowy_przypadek(client)
        _seed_enm(client, case_id, _valid_enm_with_legacy_bay("Legacy Bay"))

        before = client.get(f"/api/cases/{case_id}/enm").json()

        response = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "update_element_parameters",
                    "payload": {
                        "element_ref": "bay_legacy_1",
                        "parameters": {"name": "Pole po zmianie"},
                    },
                }
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["error_code"] == "field.legacy_write_disabled"

        after = client.get(f"/api/cases/{case_id}/enm").json()
        assert after == before

    def test_domain_ops_rejects_malformed_catalog_binding_and_keeps_snapshot(self, client):
        case_id = _nowy_przypadek(client)

        add_source = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "operation": {
                    "name": "add_grid_source_sn",
                    "payload": gpz_payload(voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.10),
                },
            },
        )
        assert add_source.status_code == 200

        before = client.get(f"/api/cases/{case_id}/enm").json()
        before_hash = before["header"]["hash_sha256"]

        malformed = client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "snapshot_base_hash": before_hash,
                "operation": {
                    "name": "continue_trunk_segment_sn",
                    "payload": {
                        "from_terminal": {"type": "source"},
                        "segment": {
                            "rodzaj": "KABEL",
                            "dlugosc_m": 200.0,
                            "catalog_binding": {"namespace": "KABEL_SN"},
                        },
                    },
                },
            },
        )
        assert malformed.status_code == 422
        body = malformed.json()
        assert body["detail"]["code"] == "catalog.ref_required"

        after = client.get(f"/api/cases/{case_id}/enm").json()
        assert after["header"]["hash_sha256"] == before_hash
        assert after["branches"] == before["branches"]
