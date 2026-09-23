"""Bieg `dynamika_rms`: ścieżka użytkownika od żądania HTTP do wyniku (karty W6-1, W6-3B).

Co ten moduł sprawdza:

* dyspozycja i rejestracja rodzaju biegu (W6-1) — tworzenie, listing, kontrakty odczytu;
* PEŁNA ŚCIEŻKA UŻYTKOWNIKA (W6-3B): rozpływ mocy → bieg czasowy wskazujący ten
  rozpływ jako punkt pracy → `ResultSetDynamicV1` z niepustymi kanałami, zdarzeniami
  i metrykami → szeregi czasowe na żądanie osobnym endpointem;
* NAZWANE odmowy na tej samej ścieżce (brak punktu pracy, brak nastaw, brak
  scenariusza) — status FAILED z kodem, nigdy pusty wynik;
* determinizm biegu przez HTTP: dwa biegi o tej samej piątce odcisków dają ten sam
  ładunek wyniku i te same szeregi.

Zero fizyki w testach: wartości liczbowe nie są tu porównywane z wyroczniami (te
żyją w `tests/network_model/dynamika/`), sprawdzana jest ŚCIEŻKA i KONTRAKT.
"""

from __future__ import annotations

import json
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

    def test_wykonanie_bez_punktu_pracy_odmawia_nazwanym_kodem(self, client: TestClient) -> None:
        """Bieg bez wskazanego rozpływu NIE startuje od napięć znamionowych.

        Start od 1,0 p.u. byłby wynikiem policzonym z danych, których nikt nie
        wyznaczył — odmowa jest jedynym uczciwym zachowaniem."""
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
        assert "kod gotowości: dynamika.punkt_pracy_brak" in payload["error_message"]

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

    def test_zbuduj_resultset_dynamiczny_v1_deterministyczny_bit_w_bit(self) -> None:
        """Karta W6-1 SS0 p.6/DT-11: dwa zrzuty TEGO SAMEGO obiektu musza byc
        bajt w bajt rowne (funkcja czysta: model_dump + kwantyzacja, zero
        losowosci/czasu/IO). Iloczyn cech bogatszy niz test kontraktu
        wyzej: kanaly, probki (z_probkami=True), zdarzenia_wykonane,
        metryki, stopien_dowodowy, zalozenia — wszystkie pola niepuste
        naraz, nie tylko szkielet."""
        from application.contracts.resultset_dynamic_v1 import (
            KanalDynamicznyV1,
            MetrykaDynamicznaV1,
            ResultSetDynamicV1,
            StopienDowodowyV1,
            TozsamoscBieguDynamicznegoV1,
            WlasnosciBieguV1,
            ZdarzenieWykonaneV1,
            zbuduj_resultset_dynamiczny_v1,
        )

        wynik = ResultSetDynamicV1(
            run_id=str(uuid4()),
            kanaly=(
                KanalDynamicznyV1(
                    klucz="u_pu@b1",
                    przestrzen="siec",
                    jednostka="pu",
                    element_ref="b1",
                    opis_pl="Napiecie wezlowe.",
                ),
            ),
            os_czasu_s=(0.0, 0.001, 0.002),
            probki={"u_pu@b1": (1.0, 0.999999999123456, 0.998)},
            zdarzenia_wykonane=(
                ZdarzenieWykonaneV1(
                    t_zaplanowany_s=0.001,
                    t_wykonany_s=0.001,
                    rodzaj="zwarcie",
                    ref="b1",
                    delta_x_max=1e-6,
                    delta_y_max=1e-6,
                    residuum_kcl_max=1e-9,
                ),
            ),
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
            metryki=(
                MetrykaDynamicznaV1(
                    klucz="u_min_pu", wartosc=0.998, jednostka="pu", element_ref="b1"
                ),
            ),
            stopien_dowodowy=(
                StopienDowodowyV1(
                    capability_id="dynamika_rms",
                    tier="UNVALIDATED_MODEL",
                    tier_pl="Model niezwalidowany",
                    claim_kind="MODEL_OUTPUT",
                    claim_kind_pl="Wynik modelu",
                    regulatory_evidence_eligible=False,
                    rationale_pl="Rdzen W6-2 nie istnieje.",
                    audit_ref="W6-1",
                ),
            ),
            zalozenia=("Zero calkowania w W6-1.",),
        )

        pierwszy = zbuduj_resultset_dynamiczny_v1(wynik, z_probkami=True)
        drugi = zbuduj_resultset_dynamiczny_v1(wynik, z_probkami=True)
        assert pierwszy == drugi
        assert json.dumps(pierwszy, sort_keys=True) == json.dumps(drugi, sort_keys=True)
        # Kwantyzacja 9 cyfr znaczacych (DT-11) dziala na probkach.
        assert pierwszy["probki"]["u_pu@b1"][1] == pytest.approx(0.999999999, rel=0, abs=1e-9)

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


# ---------------------------------------------------------------------------
# Ścieżka użytkownika (karta W6-3B): rozpływ → bieg czasowy → wynik → szeregi
# ---------------------------------------------------------------------------


#: Nastawy numeryczne biegu — komplet pól kontraktu solvera (zero domyślek).
NASTAWY_SOLVERA = {
    "dt_s": 0.002,
    "dt_min_s": 0.002,
    "dt_max_s": 0.002,
    "tolerancja": 1.0e-10,
    "tolerancja_kroku": 1.0e-6,
    "eps_init": 1.0e-6,
    "max_iteracji_newtona": 40,
    "max_nawrotow": 30,
    "integrator": "trapez_niejawny",
}

#: Scenariusz czasowy: zwarcie 3F na sekcji B z wyłączeniem po 100 ms.
SCENARIUSZ_CZASOWY = {
    "horyzont_s": 0.4,
    "krok_wyjscia_s": 0.02,
    "zdarzenia": [
        {
            "rodzaj": "zwarcie",
            "t_s": 0.1,
            "bus_ref": "b-sn-b",
            "typ": "3F",
            "r_f_ohm": 0.0,
            "x_f_ohm": 1.0,
            "t_usuniecia_s": 0.2,
        }
    ],
}


def _seed_siec_wzorcowa(client: TestClient, case_id: str) -> None:
    """Sieć wzorcowa G16 (rejestr `tests/golden/registry.py`) jako model przypadku."""
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    from tests.golden.enm_builders.dynamika_rms import build_dynamika_rms_enm

    klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
    set_enm(klucz, EnergyNetworkModel.model_validate(build_dynamika_rms_enm()))


def _uruchom_rozplyw(client: TestClient, case_id: str) -> str:
    created = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "LOAD_FLOW", "solver_input": {}},
    )
    assert created.status_code == 201, created.text
    run_id = created.json()["id"]
    executed = client.post(f"/api/execution/runs/{run_id}/execute")
    assert executed.status_code == 200, executed.text
    assert executed.json()["status"] == "DONE", executed.json()["error_message"]
    return str(run_id)


def _uruchom_dynamike(client: TestClient, case_id: str, solver_input: dict) -> dict:
    created = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "DYNAMIKA_RMS", "solver_input": solver_input},
    )
    assert created.status_code == 201, created.text
    run_id = created.json()["id"]
    executed = client.post(f"/api/execution/runs/{run_id}/execute")
    assert executed.status_code == 200, executed.text
    return {"run_id": str(run_id), **executed.json()}


class TestSciezkaUzytkownika:
    def test_bieg_konczy_sie_wynikiem_a_nie_odmowa(self, client: TestClient) -> None:
        """Dowód zdolności: bieg `dynamika_rms` oddaje `ResultSetDynamicV1`.

        To jest dokładnie to, czego przed kartą W6-3B nie było: rdzeń DAE i
        biblioteka urządzeń istniały, a jedyny punkt wejścia odmawiał zawsze.
        """
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        pf_run_id = _uruchom_rozplyw(client, case_id)

        bieg = _uruchom_dynamike(
            client,
            case_id,
            {
                "pf_run_id": pf_run_id,
                "dynamika": SCENARIUSZ_CZASOWY,
                "nastawy_solvera": NASTAWY_SOLVERA,
            },
        )
        assert bieg["status"] == "DONE", bieg["error_message"]

        wynik = client.get(f"/api/analysis-runs/{bieg['run_id']}/results/dynamika")
        assert wynik.status_code == 200, wynik.text
        ladunek = wynik.json()
        assert ladunek["kontrakt"] == "resultset_dynamic_v1"
        assert ladunek["pf_run_id"] == pf_run_id
        assert ladunek["wlasnosci_biegu"]["zbiegl"] is True
        assert ladunek["wlasnosci_biegu"]["kroki"] > 0
        # Szeregi NIE wchodzą do wiersza biegu (lekcja wydajnościowa) — wchodzą
        # do osobnej tabeli i wracają osobnym endpointem.
        assert ladunek["os_czasu_s"] == [] and ladunek["probki"] == {}

        klucze = {kanal["klucz"] for kanal in ladunek["kanaly"]}
        assert {"u_pu@b-sn-b", "omega_pu@gen-synchroniczny", "p_pu@gen-pv"} <= klucze
        assert [(z["rodzaj"], z["ref"]) for z in ladunek["zdarzenia_wykonane"]] == [
            ("zwarcie", "b-sn-b"),
            ("zdjecie_zwarcia", "b-sn-b"),
        ]
        assert {m["klucz"] for m in ladunek["metryki"]} >= {"u_min_pu", "t_u_min_s"}
        # Stopień dowodowy pochodzi z rejestru proweniencji, nie z solvera.
        (stopien,) = ladunek["stopien_dowodowy"]
        assert stopien["capability_id"] == "dynamika_rms.przebieg_czasowy"
        assert stopien["regulatory_evidence_eligible"] is False
        # Proweniencja parametrów KAŻDEGO wytwórcy jest w założeniach wyniku.
        zalozenia = " ".join(ladunek["zalozenia"])
        assert "gen-synchroniczny" in zalozenia and "karta_producenta" in zalozenia
        assert "gen-pv" in zalozenia and "profil_typowy_normy" in zalozenia

        szeregi = client.get(
            f"/api/analysis-runs/{bieg['run_id']}/results/dynamika/time-series",
            params={"kanaly": "u_pu@b-sn-b"},
        )
        assert szeregi.status_code == 200, szeregi.text
        probki = szeregi.json()["probki"]["u_pu@b-sn-b"]
        assert len(probki) == len(szeregi.json()["os_czasu_s"]) > 1
        assert min(probki) < 0.9 * probki[0], "zwarcie musi obniżyć napięcie szyny"

    def test_determinizm_dwa_biegi_ten_sam_wynik(self, client: TestClient) -> None:
        """Ta sama piątka odcisków ⇒ ten sam ładunek i te same szeregi.

        `czas_obliczen_s` jest pomiarem zegara, nie wielkością fizyczną — jedyne
        pole wyłączone z porównania.
        """
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        pf_run_id = _uruchom_rozplyw(client, case_id)
        solver_input = {
            "pf_run_id": pf_run_id,
            "dynamika": SCENARIUSZ_CZASOWY,
            "nastawy_solvera": NASTAWY_SOLVERA,
        }
        pierwszy = _uruchom_dynamike(client, case_id, solver_input)
        drugi = _uruchom_dynamike(client, case_id, solver_input)
        assert pierwszy["status"] == "DONE" and drugi["status"] == "DONE"

        a = client.get(f"/api/analysis-runs/{pierwszy['run_id']}/results/dynamika").json()
        b = client.get(f"/api/analysis-runs/{drugi['run_id']}/results/dynamika").json()
        assert a["tozsamosc"] == b["tozsamosc"], "ta sama piątka odcisków musi się zgadzać"
        # Poza porównaniem zostają WYŁĄCZNIE pola, które z definicji różnią się
        # między dwoma biegami i nie są wynikiem fizyki: tożsamość biegu
        # (`run_id`, `pf_run_id`), kontekst przypadku budowany przez warstwę API
        # z identyfikatorów i znaczników czasu (`analysis_case_context`) oraz
        # pomiar zegara (`czas_obliczen_s`). Każde inne pole MUSI być identyczne.
        POZA_POROWNANIEM = {"run_id", "pf_run_id", "analysis_case_context"}
        for ladunek in (a, b):
            for klucz in POZA_POROWNANIEM:
                ladunek.pop(klucz, None)
            ladunek["wlasnosci_biegu"].pop("czas_obliczen_s")
        assert set(a) == set(b)
        assert {"kanaly", "zdarzenia_wykonane", "metryki", "tozsamosc", "zalozenia"} <= set(a)
        assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)

        szeregi_a = client.get(
            f"/api/analysis-runs/{pierwszy['run_id']}/results/dynamika/time-series"
        ).json()
        szeregi_b = client.get(
            f"/api/analysis-runs/{drugi['run_id']}/results/dynamika/time-series"
        ).json()
        assert szeregi_a["os_czasu_s"] == szeregi_b["os_czasu_s"]
        assert szeregi_a["probki"] == szeregi_b["probki"]

    def test_odmowa_bez_nastaw_numerycznych(self, client: TestClient) -> None:
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        pf_run_id = _uruchom_rozplyw(client, case_id)
        bieg = _uruchom_dynamike(
            client, case_id, {"pf_run_id": pf_run_id, "dynamika": SCENARIUSZ_CZASOWY}
        )
        assert bieg["status"] == "FAILED"
        assert "dynamika.nastawy_solvera_brak" in bieg["error_message"]

    def test_odmowa_bez_scenariusza_czasowego(self, client: TestClient) -> None:
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        pf_run_id = _uruchom_rozplyw(client, case_id)
        bieg = _uruchom_dynamike(
            client, case_id, {"pf_run_id": pf_run_id, "nastawy_solvera": NASTAWY_SOLVERA}
        )
        assert bieg["status"] == "FAILED"
        assert "dynamika.scenariusz_dynamiczny_brak" in bieg["error_message"]

    def test_odmowa_gdy_punkt_pracy_z_innego_biegu_niz_rozplyw(self, client: TestClient) -> None:
        """Bieg wskazany jako punkt pracy MUSI być rozpływem — nie dowolnym biegiem."""
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        obcy = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={"analysis_type": "SC_3F", "solver_input": {}},
        )
        assert obcy.status_code == 201, obcy.text
        bieg = _uruchom_dynamike(
            client,
            case_id,
            {
                "pf_run_id": obcy.json()["id"],
                "dynamika": SCENARIUSZ_CZASOWY,
                "nastawy_solvera": NASTAWY_SOLVERA,
            },
        )
        assert bieg["status"] == "FAILED"
        assert "dynamika.punkt_pracy_nie_jest_rozplywem" in bieg["error_message"]

    def test_odmowa_gdy_rodzaj_zdarzenia_spoza_zbioru_rdzenia(self, client: TestClient) -> None:
        """Komenda regulacji jest w kontrakcie danych, rdzeń jej nie wykonuje."""
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        pf_run_id = _uruchom_rozplyw(client, case_id)
        scenariusz = {
            "horyzont_s": 0.4,
            "krok_wyjscia_s": 0.02,
            "zdarzenia": [
                {
                    "rodzaj": "komenda_regulacji",
                    "t_s": 0.2,
                    "ref_id": "gen-synchroniczny",
                    "nastawa": {"p_mw": 4.0},
                }
            ],
        }
        bieg = _uruchom_dynamike(
            client,
            case_id,
            {
                "pf_run_id": pf_run_id,
                "dynamika": scenariusz,
                "nastawy_solvera": NASTAWY_SOLVERA,
            },
        )
        assert bieg["status"] == "FAILED"
        assert "dynamika.rodzaj_zdarzenia_nieobslugiwany" in bieg["error_message"]


# ---------------------------------------------------------------------------
# Karta AB-1a D4: rodzaj badania biegu i badanie zgodnosci na zaciskach — sciezka HTTP
# ---------------------------------------------------------------------------

#: Badanie zgodnosci (skok czestotliwosci) — tresc zgodna z kontraktem
#: `enm/badanie_zgodnosci.py::BadanieZgodnosci`; liczby sa danymi TESTU.
BADANIE_ZGODNOSCI = {
    "urzadzenie_ref": "gen-pv",
    "bodziec": {
        "rodzaj": "skok_czestotliwosci",
        "t_s": 0.2,
        "f_przed_hz": 50.0,
        "f_do_hz": 49.0,
        "pasmo_waznosci_modelu_hz": {
            "f_min_hz": 47.0,
            "f_max_hz": 52.0,
            "proweniencja": {"zrodlo": "karta_producenta", "odniesienie": "karta-testowa-1"},
        },
    },
    "impedancja_zastepcza_sieci": {
        "jednostka": "ohm",
        "r": 0.05,
        "x": 0.5,
        "u_bazowe_kv": 15.0,
        "s_bazowa_mva": None,
        "proweniencja": {"zrodlo": "karta_producenta", "odniesienie": "karta-testowa-1"},
    },
    "horyzont_s": 1.0,
    "krok_wyjscia_s": 0.02,
}


class TestRodzajBadania:
    def test_oba_rodzaje_naraz_to_422_nazwany(self, client: TestClient) -> None:
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        odpowiedz = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={
                "analysis_type": "DYNAMIKA_RMS",
                "solver_input": {
                    "dynamika": SCENARIUSZ_CZASOWY,
                    "badanie_zgodnosci": BADANIE_ZGODNOSCI,
                    "nastawy_solvera": NASTAWY_SOLVERA,
                },
            },
        )
        assert odpowiedz.status_code == 422, odpowiedz.text
        szczegol = odpowiedz.json()["detail"]
        assert szczegol["kod"] == "dynamika.rodzaj_badania_sprzeczny"
        assert "jednoczesnie" in szczegol["komunikat"]

    def test_badanie_spoza_kontraktu_to_422_nazwany(self, client: TestClient) -> None:
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        zle = json.loads(json.dumps(BADANIE_ZGODNOSCI))
        del zle["impedancja_zastepcza_sieci"]
        odpowiedz = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={
                "analysis_type": "DYNAMIKA_RMS",
                "solver_input": {"rodzaj_badania": "badanie_zgodnosci", "badanie_zgodnosci": zle},
            },
        )
        assert odpowiedz.status_code == 422, odpowiedz.text
        assert odpowiedz.json()["detail"]["kod"] == "dynamika.badanie_zgodnosci_niepoprawne"
        assert "impedancja_zastepcza_sieci" in odpowiedz.json()["detail"]["komunikat"]

    def test_badanie_zgodnosci_konczy_sie_odmowa_bodziec_rdzen_nieobslugiwany(
        self, client: TestClient
    ) -> None:
        """Bieg z badaniem zgodnosci jest TWORZONY (kontrakt poprawny), ale wykonanie
        konczy sie odmowa nazwana — nigdy wynikiem policzonym jak scenariusz sieciowy."""
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        pf_run_id = _uruchom_rozplyw(client, case_id)
        bieg = _uruchom_dynamike(
            client,
            case_id,
            {
                "pf_run_id": pf_run_id,
                "rodzaj_badania": "badanie_zgodnosci",
                "badanie_zgodnosci": BADANIE_ZGODNOSCI,
                "nastawy_solvera": NASTAWY_SOLVERA,
            },
        )
        assert bieg["status"] == "FAILED"
        assert "bodziec.rdzen_nieobslugiwany" in bieg["error_message"]
        assert "gen-pv" in bieg["error_message"]
        wynik = client.get(f"/api/analysis-runs/{bieg['run_id']}/results/dynamika")
        assert wynik.status_code == 404, wynik.text

    def test_scenariusz_sieciowy_niesie_rodzaj_badania_i_domene_w_kopercie(
        self, client: TestClient
    ) -> None:
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        pf_run_id = _uruchom_rozplyw(client, case_id)
        solver_input = {
            "pf_run_id": pf_run_id,
            "dynamika": SCENARIUSZ_CZASOWY,
            "nastawy_solvera": NASTAWY_SOLVERA,
        }
        bieg = _uruchom_dynamike(client, case_id, solver_input)
        assert bieg["status"] == "DONE", bieg["error_message"]
        ladunek = client.get(f"/api/analysis-runs/{bieg['run_id']}/results/dynamika").json()
        # Brak pola w opcjach = scenariusz sieciowy (odczyt, nie zapis domyslki).
        assert ladunek["rodzaj_badania"] == "scenariusz_sieciowy"
        szczegol = client.get(f"/api/analysis-runs/{bieg['run_id']}").json()
        assert "rodzaj_badania" not in szczegol["input_metadata"]["options"]
        assert szczegol["physics_domain"] == "RMS_DYNAMICS"
        assert szczegol["physics_domain_pl"] == "dynamika RMS (przebiegi czasowe)"
