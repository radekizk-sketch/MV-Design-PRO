"""Bieg `dynamika_rms` (karta W6-1 SS0 p.6-7): rejestracja rodzaju biegu, odmowa
nazwana `dynamika.rdzen_niedostepny` (rdzeń W6-2 nie istnieje), kontrakt
`ResultSetDynamicV1` (metadane bez próbek + szeregi czasowe na żądanie).

Zero fizyki: żaden test tu nie zakłada, że solver istnieje ani liczy cokolwiek —
wyłącznie kontrakty, dyspozycja, persystencja i API.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from api.main import app
from fastapi.testclient import TestClient

sqlalchemy = pytest.importorskip("sqlalchemy")

from tests.catalog_test_helpers import gpz_source_record  # noqa: E402


def _reset_backend_state() -> None:
    from api.power_flow_runs import _interpretation_cache
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    _interpretation_cache.clear()
    reset_canonical_runs()
    reset_enm_store()


@pytest.fixture
def client() -> TestClient:
    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def _nowy_przypadek(client: TestClient) -> str:
    project_resp = client.post("/api/projects", json={"name": "Dynamika RMS — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek dynamiki"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _seed_minimal_enm(client: TestClient, case_id: str) -> None:
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
    set_enm(
        klucz,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Dynamika RMS — model",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000901",
                        "ref_id": "bus-1",
                        "name": "Szyna 1",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    }
                ],
                "branches": [],
                "transformers": [],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000902",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-1",
                            voltage_kv=15.0,
                            sk3_mva=250.0,
                            rx_ratio=0.10,
                        ),
                    }
                ],
                "loads": [
                    {
                        "id": "00000000-0000-0000-0000-000000000903",
                        "ref_id": "load-1",
                        "name": "Odbior 1",
                        "tags": [],
                        "meta": {},
                        "bus_ref": "bus-1",
                        "p_mw": 0.5,
                        "q_mvar": 0.1,
                        "catalog_ref": "LOAD_TEST",
                        "parameter_source": "OVERRIDE",
                    }
                ],
                "generators": [],
                "switches": [],
                "shunt_capacitors": [],
                "junctions": [],
                "corridors": [],
                "measurements": [],
                "protection_assignments": [],
                "branch_points": [],
            }
        ),
    )


# ---------------------------------------------------------------------------
# Dyspozytor: rejestracja + odmowa nazwana (rdzeń W6-2 nie istnieje)
# ---------------------------------------------------------------------------


class TestOdmowaBiegu:
    def test_utworzenie_biegu_dynamika_rms_przez_http(self, client: TestClient) -> None:
        """Rejestracja rodzaju biegu: mozna go UTWORZYC (status PENDING) —
        odmowa nastepuje dopiero przy WYKONANIU, nie przy tworzeniu (ten sam
        wzorzec co `dynamic_stability`)."""
        case_id = _nowy_przypadek(client)
        _seed_minimal_enm(client, case_id)
        created = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={"analysis_type": "DYNAMIKA_RMS", "solver_input": {}},
        )
        assert created.status_code == 201, created.text
        assert created.json()["analysis_type"] == "DYNAMIKA_RMS"
        assert created.json()["status"] == "PENDING"

    def test_wykonanie_biegu_dynamika_rms_odmawia_nazwanym_kodem(self, client: TestClient) -> None:
        case_id = _nowy_przypadek(client)
        _seed_minimal_enm(client, case_id)
        created = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={"analysis_type": "DYNAMIKA_RMS", "solver_input": {}},
        )
        run_id = created.json()["id"]

        executed = client.post(f"/api/execution/runs/{run_id}/execute")
        assert executed.status_code == 200
        payload = executed.json()
        assert payload["status"] == "FAILED"
        assert payload["error_message"] is not None
        assert "kod gotowości: dynamika.rdzen_niedostepny" in payload["error_message"]

    def test_listing_biegow_nie_wywala_sie_na_dynamika_rms(self, client: TestClient) -> None:
        """Regresja: `_execution_analysis_type_for_run` miala twardy `raise` dla
        kazdego niezmapowanego `analysis_type` — listing WSZYSTKICH biegow
        przypadku (nie tylko szczegol jednego) musi przezyc obecnosc biegu
        `dynamika_rms` w tej samej liscie co inne typy."""
        case_id = _nowy_przypadek(client)
        _seed_minimal_enm(client, case_id)
        r1 = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={"analysis_type": "DYNAMIKA_RMS", "solver_input": {}},
        )
        assert r1.status_code == 201, r1.text
        r2 = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={"analysis_type": "LOAD_FLOW", "solver_input": {}},
        )
        assert r2.status_code == 201, r2.text
        listing = client.get(f"/api/execution/study-cases/{case_id}/runs")
        assert listing.status_code == 200
        types = {row["analysis_type"] for row in listing.json()["runs"]}
        assert types == {"DYNAMIKA_RMS", "LOAD_FLOW"}

    def test_nic_nie_policzone_wynik_niedostepny(self, client: TestClient) -> None:
        case_id = _nowy_przypadek(client)
        _seed_minimal_enm(client, case_id)
        created = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={"analysis_type": "DYNAMIKA_RMS", "solver_input": {}},
        )
        run_id = created.json()["id"]
        client.post(f"/api/execution/runs/{run_id}/execute")

        wynik = client.get(f"/api/analysis-runs/{run_id}/results/dynamika")
        assert wynik.status_code == 404

        szeregi = client.get(f"/api/analysis-runs/{run_id}/results/dynamika/time-series")
        assert szeregi.status_code == 404


# ---------------------------------------------------------------------------
# `build_dynamika_results` / `build_dynamika_time_series` — kontrakty odczytu
# ---------------------------------------------------------------------------


def _domyslny_canonical_run(run_id: UUID, case_id: str, analysis_type: str, raw_result):
    from datetime import UTC, datetime

    from enm.canonical_analysis import CanonicalRun

    teraz = datetime.now(UTC)
    return CanonicalRun(
        id=run_id,
        case_id=case_id,
        project_id=None,
        analysis_type=analysis_type,
        status="FINISHED",
        created_at=teraz,
        snapshot_hash="sha256:snap",
        input_hash="sha256:input",
        snapshot={},
        validation={},
        readiness={},
        options={},
        started_at=teraz,
        finished_at=teraz,
        raw_result=raw_result,
    )


class TestBudowaWidokowOdczytu:
    def test_zly_typ_biegu_key_error(self) -> None:
        from enm.canonical_analysis import build_dynamika_results

        run = _domyslny_canonical_run(uuid4(), "case-1", "PF", {"cokolwiek": True})
        with pytest.raises(KeyError):
            build_dynamika_results(run)

    def test_brak_wyniku_key_error(self) -> None:
        from enm.canonical_analysis import build_dynamika_results

        run = _domyslny_canonical_run(uuid4(), "case-1", "dynamika_rms", None)
        with pytest.raises(KeyError):
            build_dynamika_results(run)

    def test_metadane_bez_probek_zwracaja_kontrakt(self) -> None:
        from application.contracts.resultset_dynamic_v1 import (
            ResultSetDynamicV1,
            TozsamoscBieguDynamicznegoV1,
            WlasnosciBieguV1,
            zbuduj_resultset_dynamiczny_v1,
        )
        from enm.canonical_analysis import build_dynamika_results

        run_id = uuid4()
        wynik = ResultSetDynamicV1(
            run_id=str(run_id),
            wlasnosci_biegu=WlasnosciBieguV1(
                zbiegl=True,
                kroki=10,
                kroki_odrzucone=0,
                max_residuum_f=1e-9,
                max_residuum_g=1e-9,
                czas_obliczen_s=0.1,
                integrator="trapez_niejawny",
                dt_s=0.001,
                tolerancja=1e-6,
            ),
            tozsamosc=TozsamoscBieguDynamicznegoV1(
                odcisk_migawki="a",
                odcisk_punktu_pracy="b",
                odcisk_nastaw_solvera="c",
                odcisk_harmonogramu="d",
                odcisk_implementacji="e",
                wersja_solvera="0.0.0",
            ),
        )
        raw_result = zbuduj_resultset_dynamiczny_v1(wynik, z_probkami=False)
        run = _domyslny_canonical_run(run_id, "case-1", "dynamika_rms", raw_result)

        payload = build_dynamika_results(run)
        assert payload["kontrakt"] == "resultset_dynamic_v1"
        assert payload["os_czasu_s"] == []
        assert payload["probki"] == {}

    def test_brak_szeregow_key_error(self) -> None:
        from enm.canonical_analysis import build_dynamika_time_series

        run = _domyslny_canonical_run(uuid4(), "case-1", "dynamika_rms", {"kontrakt": "x"})
        with pytest.raises(KeyError):
            build_dynamika_time_series(run)


# ---------------------------------------------------------------------------
# Persystencja szeregow czasowych (`canonical_run_time_series`) — repozytorium
# ---------------------------------------------------------------------------


class TestPersystencjaSzeregow:
    def _zapisany_bieg(self) -> UUID:
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        run_id = uuid4()
        run = _domyslny_canonical_run(run_id, "case-1", "dynamika_rms", {"kontrakt": "x"})
        with canonical_run_repository_scope() as repo:
            repo.save(run)
        return run_id

    def test_zapis_i_odczyt_szeregow(self) -> None:
        from enm.canonical_analysis import build_dynamika_time_series
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        run_id = self._zapisany_bieg()
        os_czasu_s = [0.0, 0.001, 0.002]
        probki = {"u_pu@b1": [1.0, 0.99, 0.6], "omega_pu@g1": [1.0, 1.0001, 1.0002]}
        with canonical_run_repository_scope() as repo:
            repo.zapisz_szeregi_dynamiczne(run_id, os_czasu_s, probki)

        run = _domyslny_canonical_run(run_id, "case-1", "dynamika_rms", {"kontrakt": "x"})
        wynik = build_dynamika_time_series(run)
        assert wynik["os_czasu_s"] == os_czasu_s
        assert wynik["probki"] == probki

    def test_filtr_kanalow(self) -> None:
        from enm.canonical_analysis import build_dynamika_time_series
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        run_id = self._zapisany_bieg()
        with canonical_run_repository_scope() as repo:
            repo.zapisz_szeregi_dynamiczne(run_id, [0.0, 1.0], {"a": [1.0, 2.0], "b": [3.0, 4.0]})
        run = _domyslny_canonical_run(run_id, "case-1", "dynamika_rms", {"kontrakt": "x"})
        wynik = build_dynamika_time_series(run, ["a"])
        assert set(wynik["probki"]) == {"a"}

    def test_kanal_nieznany_key_error(self) -> None:
        from enm.canonical_analysis import build_dynamika_time_series
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        run_id = self._zapisany_bieg()
        with canonical_run_repository_scope() as repo:
            repo.zapisz_szeregi_dynamiczne(run_id, [0.0], {"a": [1.0]})
        run = _domyslny_canonical_run(run_id, "case-1", "dynamika_rms", {"kontrakt": "x"})
        with pytest.raises(KeyError):
            build_dynamika_time_series(run, ["nieistniejacy"])

    def test_pelna_wymiana_usuwa_stare_kanaly(self) -> None:
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        run_id = self._zapisany_bieg()
        with canonical_run_repository_scope() as repo:
            repo.zapisz_szeregi_dynamiczne(run_id, [0.0], {"a": [1.0], "b": [2.0]})
            repo.zapisz_szeregi_dynamiczne(run_id, [0.0], {"c": [3.0]})
            wynik = repo.get_szeregi_dynamiczne(run_id)
        assert wynik is not None
        _, probki = wynik
        assert set(probki) == {"c"}

    def test_bieg_nieutrwalony_zapis_no_op(self) -> None:
        """Bieg bez wiersza nadrzednego (np. w pamieci) — zapis jest cichym no-op,
        nie wyjatkiem (ten sam wzorzec co `zapisz_rozplyw_punktu`)."""
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        with canonical_run_repository_scope() as repo:
            repo.zapisz_szeregi_dynamiczne(uuid4(), [0.0], {"a": [1.0]})  # nie rzuca

    def test_clear_all_usuwa_szeregi_czasowe(self) -> None:
        """KLASA NIE INSTANCJA: `clear_all` musi kasowac WSZYSTKIE tabele zalezne
        (nie tylko rozplyw zwarcia) — inaczej SQLite (bez PRAGMA FK) zostawia
        wiersze osierocone po `reset_canonical_runs`."""
        from infrastructure.persistence.models import CanonicalRunTimeSeriesORM
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
            get_canonical_run_session_factory,
        )
        from sqlalchemy import select

        run_id = self._zapisany_bieg()
        with canonical_run_repository_scope() as repo:
            repo.zapisz_szeregi_dynamiczne(run_id, [0.0], {"a": [1.0]})
            repo.clear_all()

        session_factory = get_canonical_run_session_factory()
        with session_factory() as session:
            pozostale = session.execute(select(CanonicalRunTimeSeriesORM)).all()
        assert pozostale == []


# ---------------------------------------------------------------------------
# HTTP: endpointy wynikow czytaja persystowane dane (bez solvera — dane
# wstawione bezposrednio, jak w innych testach persystencji tej karty)
# ---------------------------------------------------------------------------


class TestHttpEndpointyWynikow:
    def test_metadane_i_szeregi_przez_http(self, client: TestClient) -> None:
        from application.contracts.resultset_dynamic_v1 import (
            KanalDynamicznyV1,
            ResultSetDynamicV1,
            TozsamoscBieguDynamicznegoV1,
            WlasnosciBieguV1,
            zbuduj_resultset_dynamiczny_v1,
        )
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        case_id = _nowy_przypadek(client)
        run_id = uuid4()
        wynik = ResultSetDynamicV1(
            run_id=str(run_id),
            kanaly=(
                KanalDynamicznyV1(
                    klucz="u_pu@bus-1",
                    przestrzen="siec",
                    jednostka="pu",
                    element_ref="bus-1",
                    opis_pl="Napiecie szyny 1",
                ),
            ),
            wlasnosci_biegu=WlasnosciBieguV1(
                zbiegl=True,
                kroki=5,
                kroki_odrzucone=0,
                max_residuum_f=1e-9,
                max_residuum_g=1e-9,
                czas_obliczen_s=0.05,
                integrator="trapez_niejawny",
                dt_s=0.001,
                tolerancja=1e-6,
            ),
            tozsamosc=TozsamoscBieguDynamicznegoV1(
                odcisk_migawki="a",
                odcisk_punktu_pracy="b",
                odcisk_nastaw_solvera="c",
                odcisk_harmonogramu="d",
                odcisk_implementacji="e",
                wersja_solvera="0.0.0",
            ),
        )
        raw_result = zbuduj_resultset_dynamiczny_v1(wynik, z_probkami=False)
        run = _domyslny_canonical_run(run_id, case_id, "dynamika_rms", raw_result)
        with canonical_run_repository_scope() as repo:
            repo.save(run)
            repo.zapisz_szeregi_dynamiczne(run_id, [0.0, 0.001], {"u_pu@bus-1": [1.0, 0.999]})

        metadane = client.get(f"/api/analysis-runs/{run_id}/results/dynamika")
        assert metadane.status_code == 200, metadane.text
        body = metadane.json()
        assert body["kontrakt"] == "resultset_dynamic_v1"
        assert body["probki"] == {}
        assert body["kanaly"][0]["klucz"] == "u_pu@bus-1"

        szeregi = client.get(
            f"/api/analysis-runs/{run_id}/results/dynamika/time-series",
            params={"kanaly": "u_pu@bus-1"},
        )
        assert szeregi.status_code == 200, szeregi.text
        assert szeregi.json()["probki"] == {"u_pu@bus-1": [1.0, 0.999]}

        brak_kanalu = client.get(
            f"/api/analysis-runs/{run_id}/results/dynamika/time-series",
            params={"kanaly": "nieistniejacy"},
        )
        assert brak_kanalu.status_code == 404


# ---------------------------------------------------------------------------
# v125_contracts.py: reproducibility niesie rejestracje `dynamika_rms`
# ---------------------------------------------------------------------------


def test_reproducibility_niesie_solver_family_dynamika_rms() -> None:
    from api.v125_contracts import build_analysis_case_reproducibility

    run = _domyslny_canonical_run(uuid4(), "case-1", "dynamika_rms", {"kontrakt": "x"})
    repro = build_analysis_case_reproducibility(run)
    assert repro["solver_family"] == "dynamika_rms_dae"
    assert repro["formula_set_version"] == "resultset_dynamic_v1"
    assert repro["standard_basis_ref"] == "DYNAMIKA_RMS_DAE_V1"
