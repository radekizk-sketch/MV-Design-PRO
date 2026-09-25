"""Bieg `dynamika_rms`: ścieżka użytkownika od żądania HTTP do wyniku (karty W6-1, W6-3B).

Co ten moduł sprawdza:

* dyspozycja i rejestracja rodzaju biegu (W6-1) — tworzenie, listing, kontrakty odczytu;
* PEŁNA ŚCIEŻKA UŻYTKOWNIKA (W6-3B): rozpływ mocy → bieg czasowy wskazujący ten
  rozpływ jako punkt pracy → `ResultSetDynamicV2` z niepustymi kanałami, zdarzeniami
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
        from application.contracts.resultset_dynamic_v2 import (
            ResultSetDynamicV2,
            TozsamoscBieguDynamicznegoV2,
            WlasnosciBieguV2,
            dziedzina_fizyki_dynamiki,
            zbuduj_resultset_dynamiczny_v2,
        )
        from enm.canonical_analysis import build_dynamika_results

        run_id = uuid4()
        wynik = ResultSetDynamicV2(
            run_id=str(run_id),
            dziedzina_fizyki=dziedzina_fizyki_dynamiki(),
            tryb_scenariusza="siec",
            wlasnosci_biegu=WlasnosciBieguV2(
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
            tozsamosc=TozsamoscBieguDynamicznegoV2(
                odcisk_migawki="a",
                odcisk_punktu_pracy="b",
                odcisk_nastaw_solvera="c",
                odcisk_harmonogramu="d",
                odcisk_implementacji="e",
                wersja_solvera="0.0.0",
            ),
        )
        raw_result = zbuduj_resultset_dynamiczny_v2(wynik, z_probkami=False)
        run = _domyslny_canonical_run(run_id, "case-1", "dynamika_rms", raw_result)

        payload = build_dynamika_results(run)
        assert payload["kontrakt"] == "resultset_dynamic_v2"
        assert payload["dziedzina_fizyki"] == ["RMS_DYNAMICS"]
        assert payload["os_czasu_s"] == []
        assert payload["strona_probki"] == []
        assert payload["probki"] == {}

    def test_zbuduj_resultset_dynamiczny_v2_deterministyczny_bit_w_bit(self) -> None:
        """Karta W6-1 SS0 p.6/DT-11: dwa zrzuty TEGO SAMEGO obiektu musza byc
        bajt w bajt rowne (funkcja czysta: model_dump + kwantyzacja, zero
        losowosci/czasu/IO). Iloczyn cech bogatszy niz test kontraktu
        wyzej: kanaly, probki z wartoscia niedostepna (z_probkami=True),
        strony probek z powtorzona chwila zdarzenia, zdarzenia_wykonane ze
        skutkami topologicznymi, metryki, stopien_dowodowy, zalozenia —
        wszystkie pola niepuste naraz, nie tylko szkielet."""
        from application.contracts.resultset_dynamic_v2 import (
            KanalDynamicznyV2,
            MetrykaDynamicznaV2,
            OdbiorOdcietyV2,
            PrzekroczenieV2,
            PrzypisanieWykonaneV2,
            ResultSetDynamicV2,
            StopienDowodowyV2,
            TozsamoscBieguDynamicznegoV2,
            WlasnosciBieguV2,
            ZdarzenieWykonaneV2,
            dziedzina_fizyki_dynamiki,
            zbuduj_resultset_dynamiczny_v2,
        )

        wynik = ResultSetDynamicV2(
            run_id=str(uuid4()),
            dziedzina_fizyki=dziedzina_fizyki_dynamiki(),
            tryb_scenariusza="siec",
            kanaly=(
                KanalDynamicznyV2(
                    klucz="u_pu@b1",
                    przestrzen="siec",
                    jednostka="pu",
                    element_ref="b1",
                    opis_pl="Napiecie wezlowe.",
                ),
            ),
            os_czasu_s=(0.0, 0.001, 0.001, 0.002),
            strona_probki=("C", "L", "P", "C"),
            probki={"u_pu@b1": (1.0, 0.999999999123456, None, 0.998)},
            zdarzenia_wykonane=(
                ZdarzenieWykonaneV2(
                    t_zaplanowany_s=0.001,
                    t_wykonany_s=0.001,
                    rodzaj="zwarcie",
                    ref="b1",
                    przyczyna="harmonogram",
                    delta_x_nieprzypisane_max=0.0,
                    delta_y_max=1e-6,
                    residuum_kcl_max=1e-9,
                    obszary_odciete=("b2",),
                    odbiory_odciete=(OdbiorOdcietyV2(ref="odb-1", p_pu=0.03, q_pu=0.008),),
                    obszary_zasilone_ponownie=(),
                    przypisania=(),
                    t_zlokalizowany_s=None,
                    szerokosc_przedzialu_s=None,
                    iteracje_lokalizacji=None,
                    g_przed=None,
                    g_po=None,
                ),
                # Akcja zdarzenia WARUNKOWEGO z przypisaniem stanu (karta AB-1b.1 P6/P8):
                # pomiar lokalizacji i przypisanie (adres, przed, po) przez ten sam zrzut.
                ZdarzenieWykonaneV2(
                    t_zaplanowany_s=0.0015234567891,
                    t_wykonany_s=0.0015234567891,
                    rodzaj="przypisanie_stanu",
                    ref="gen-1",
                    przyczyna="dozor:u-min",
                    delta_x_nieprzypisane_max=0.0,
                    delta_y_max=2e-6,
                    residuum_kcl_max=1e-10,
                    obszary_odciete=(),
                    odbiory_odciete=(),
                    obszary_zasilone_ponownie=("b2",),
                    przypisania=(
                        PrzypisanieWykonaneV2(adres="gen-1.p_zadane_pu", przed=0.3, po=0.25),
                    ),
                    t_zlokalizowany_s=0.0015234567891,
                    szerokosc_przedzialu_s=8.5e-10,
                    iteracje_lokalizacji=7,
                    g_przed=-1.25e-7,
                    g_po=3.5e-8,
                ),
            ),
            przekroczenia=(
                PrzekroczenieV2(
                    dozor="u-min",
                    wielkosc="u_pu@b1",
                    prog=0.85,
                    kierunek="w_dol",
                    t_s=0.0015234567891,
                    szerokosc_przedzialu_s=8.5e-10,
                    iteracje=7,
                ),
            ),
            wlasnosci_biegu=WlasnosciBieguV2(
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
            tozsamosc=TozsamoscBieguDynamicznegoV2(
                odcisk_migawki="a",
                odcisk_punktu_pracy="b",
                odcisk_nastaw_solvera="c",
                odcisk_harmonogramu="d",
                odcisk_implementacji="e",
                wersja_solvera="0.0.0",
            ),
            metryki=(
                MetrykaDynamicznaV2(
                    klucz="u_min_pu", wartosc=0.998, jednostka="pu", element_ref="b1"
                ),
            ),
            stopien_dowodowy=(
                StopienDowodowyV2(
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

        pierwszy = zbuduj_resultset_dynamiczny_v2(wynik, z_probkami=True)
        drugi = zbuduj_resultset_dynamiczny_v2(wynik, z_probkami=True)
        assert pierwszy == drugi
        assert json.dumps(pierwszy, sort_keys=True) == json.dumps(drugi, sort_keys=True)
        # Kwantyzacja 9 cyfr znaczacych (DT-11) dziala na probkach, a wartosc
        # niedostepna przechodzi jako `None` (nie 0.0, nie NaN).
        assert pierwszy["probki"]["u_pu@b1"][1] == pytest.approx(0.999999999, rel=0, abs=1e-9)
        assert pierwszy["probki"]["u_pu@b1"][2] is None
        assert pierwszy["strona_probki"] == ["C", "L", "P", "C"]
        # Pola karty AB-1b.1 P6-P8 przechodza przez zrzut: chwila zdarzenia warunkowego i
        # przekroczenia skwantyzowane (rozdzielczosc publikacji), przypisanie z adresem,
        # przekroczenie z kierunkiem slownika detektora, tryb scenariusza.
        warunkowe = pierwszy["zdarzenia_wykonane"][1]
        assert warunkowe["przyczyna"] == "dozor:u-min"
        assert warunkowe["t_zlokalizowany_s"] == pytest.approx(0.00152345679, rel=0, abs=1e-14)
        assert warunkowe["przypisania"] == [
            {"adres": "gen-1.p_zadane_pu", "przed": 0.3, "po": 0.25}
        ]
        assert pierwszy["zdarzenia_wykonane"][0]["t_zlokalizowany_s"] is None
        assert pierwszy["przekroczenia"][0]["kierunek"] == "w_dol"
        assert pierwszy["przekroczenia"][0]["t_s"] == warunkowe["t_zlokalizowany_s"]
        assert pierwszy["tryb_scenariusza"] == "siec"

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
        os_czasu_s = [0.0, 0.001, 0.001, 0.002]
        strony = ["C", "L", "P", "C"]
        probki = {
            "u_pu@b1": [1.0, 0.99, 0.6, 0.61],
            "f_hz@b1": [50.0, None, None, 49.9],
        }
        with canonical_run_repository_scope() as repo:
            repo.zapisz_szeregi_dynamiczne(run_id, os_czasu_s, strony, probki)

        run = _domyslny_canonical_run(run_id, "case-1", "dynamika_rms", {"kontrakt": "x"})
        wynik = build_dynamika_time_series(run)
        assert wynik["os_czasu_s"] == os_czasu_s
        assert wynik["strona_probki"] == strony
        # Wartosc niedostepna wraca jako `None` — nie 0.0 i nie NaN.
        assert wynik["probki"] == probki

    def test_strona_innej_dlugosci_niz_os_odrzucona(self) -> None:
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        run_id = self._zapisany_bieg()
        with canonical_run_repository_scope() as repo, pytest.raises(ValueError):
            repo.zapisz_szeregi_dynamiczne(run_id, [0.0, 0.1], ["C"], {"a": [1.0, 2.0]})

    def test_wiersz_bez_strony_probek_odmowa_nazwana(self) -> None:
        """Wiersz sprzed kontraktu v2 (kolumna addytywna = NULL) nie dostaje
        domyslnej strony — odczyt konczy sie nazwana odmowa (404 w API)."""
        from enm.canonical_analysis import build_dynamika_time_series
        from infrastructure.persistence.models import CanonicalRunTimeSeriesORM
        from infrastructure.persistence.repositories.canonical_run_repository import (
            get_canonical_run_session_factory,
        )

        run_id = self._zapisany_bieg()
        session_factory = get_canonical_run_session_factory()
        with session_factory() as session:
            session.add(
                CanonicalRunTimeSeriesORM(
                    run_id=run_id,
                    klucz_kanalu="u_pu@b1",
                    os_czasu_s_json=[0.0],
                    strona_probki_json=None,
                    probki_json=[1.0],
                )
            )
            session.commit()
        run = _domyslny_canonical_run(run_id, "case-1", "dynamika_rms", {"kontrakt": "x"})
        with pytest.raises(KeyError, match="resultset_dynamic_v2"):
            build_dynamika_time_series(run)

    def test_filtr_kanalow(self) -> None:
        from enm.canonical_analysis import build_dynamika_time_series
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        run_id = self._zapisany_bieg()
        with canonical_run_repository_scope() as repo:
            repo.zapisz_szeregi_dynamiczne(
                run_id, [0.0, 1.0], ["C", "C"], {"a": [1.0, 2.0], "b": [3.0, 4.0]}
            )
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
            repo.zapisz_szeregi_dynamiczne(run_id, [0.0], ["C"], {"a": [1.0]})
        run = _domyslny_canonical_run(run_id, "case-1", "dynamika_rms", {"kontrakt": "x"})
        with pytest.raises(KeyError):
            build_dynamika_time_series(run, ["nieistniejacy"])

    def test_pelna_wymiana_usuwa_stare_kanaly(self) -> None:
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        run_id = self._zapisany_bieg()
        with canonical_run_repository_scope() as repo:
            repo.zapisz_szeregi_dynamiczne(run_id, [0.0], ["C"], {"a": [1.0], "b": [2.0]})
            repo.zapisz_szeregi_dynamiczne(run_id, [0.0], ["C"], {"c": [3.0]})
            wynik = repo.get_szeregi_dynamiczne(run_id)
        assert wynik is not None
        _, _, probki = wynik
        assert set(probki) == {"c"}

    def test_bieg_nieutrwalony_zapis_no_op(self) -> None:
        """Bieg bez wiersza nadrzednego (np. w pamieci) — zapis jest cichym no-op,
        nie wyjatkiem (ten sam wzorzec co `zapisz_rozplyw_punktu`)."""
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        with canonical_run_repository_scope() as repo:
            repo.zapisz_szeregi_dynamiczne(uuid4(), [0.0], ["C"], {"a": [1.0]})  # nie rzuca

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
            repo.zapisz_szeregi_dynamiczne(run_id, [0.0], ["C"], {"a": [1.0]})
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
        from application.contracts.resultset_dynamic_v2 import (
            KanalDynamicznyV2,
            ResultSetDynamicV2,
            TozsamoscBieguDynamicznegoV2,
            WlasnosciBieguV2,
            dziedzina_fizyki_dynamiki,
            zbuduj_resultset_dynamiczny_v2,
        )
        from infrastructure.persistence.repositories.canonical_run_repository import (
            canonical_run_repository_scope,
        )

        case_id = _nowy_przypadek(client)
        run_id = uuid4()
        wynik = ResultSetDynamicV2(
            run_id=str(run_id),
            dziedzina_fizyki=dziedzina_fizyki_dynamiki(),
            tryb_scenariusza="siec",
            kanaly=(
                KanalDynamicznyV2(
                    klucz="u_pu@bus-1",
                    przestrzen="siec",
                    jednostka="pu",
                    element_ref="bus-1",
                    opis_pl="Napiecie szyny 1",
                ),
            ),
            wlasnosci_biegu=WlasnosciBieguV2(
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
            tozsamosc=TozsamoscBieguDynamicznegoV2(
                odcisk_migawki="a",
                odcisk_punktu_pracy="b",
                odcisk_nastaw_solvera="c",
                odcisk_harmonogramu="d",
                odcisk_implementacji="e",
                wersja_solvera="0.0.0",
            ),
        )
        raw_result = zbuduj_resultset_dynamiczny_v2(wynik, z_probkami=False)
        run = _domyslny_canonical_run(run_id, case_id, "dynamika_rms", raw_result)
        with canonical_run_repository_scope() as repo:
            repo.save(run)
            repo.zapisz_szeregi_dynamiczne(
                run_id, [0.0, 0.001], ["C", "C"], {"u_pu@bus-1": [1.0, 0.999]}
            )

        metadane = client.get(f"/api/analysis-runs/{run_id}/results/dynamika")
        assert metadane.status_code == 200, metadane.text
        body = metadane.json()
        assert body["kontrakt"] == "resultset_dynamic_v2"
        assert body["probki"] == {}
        assert body["kanaly"][0]["klucz"] == "u_pu@bus-1"

        szeregi = client.get(
            f"/api/analysis-runs/{run_id}/results/dynamika/time-series",
            params={"kanaly": "u_pu@bus-1"},
        )
        assert szeregi.status_code == 200, szeregi.text
        assert szeregi.json()["probki"] == {"u_pu@bus-1": [1.0, 0.999]}
        assert szeregi.json()["strona_probki"] == ["C", "C"]

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
    assert repro["formula_set_version"] == "resultset_dynamic_v2"
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
    # Klucz WYMAGANY, wartosc `None` dozwolona wylacznie dla biegu bez detektorow
    # (karta AB-1b.1 par. 0 pkt 13) — decyzja wolajacego, nie domysl adaptera.
    "tolerancja_lokalizacji_zdarzen_s": None,
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
            "sposob_usuniecia": "samoczynne",
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
        """Dowód zdolności: bieg `dynamika_rms` oddaje `ResultSetDynamicV2`.

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
        assert ladunek["kontrakt"] == "resultset_dynamic_v2"
        assert ladunek["dziedzina_fizyki"] == ["RMS_DYNAMICS"]
        assert ladunek["pf_run_id"] == pf_run_id
        assert ladunek["wlasnosci_biegu"]["zbiegl"] is True
        assert ladunek["wlasnosci_biegu"]["kroki"] > 0
        # Szeregi NIE wchodzą do wiersza biegu (lekcja wydajnościowa) — wchodzą
        # do osobnej tabeli i wracają osobnym endpointem.
        assert ladunek["os_czasu_s"] == [] and ladunek["probki"] == {}
        assert ladunek["strona_probki"] == []

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

        # Próbki obustronne przez CAŁĄ ścieżkę (solver → baza → HTTP): chwila
        # każdego zdarzenia ma parę `L`/`P`, a częstotliwość w niej jest `None`
        # z kodem jakości 3 — wartość niedostępna nie staje się liczbą po drodze.
        f_szeregi = client.get(
            f"/api/analysis-runs/{bieg['run_id']}/results/dynamika/time-series",
            params={"kanaly": "f_hz@b-sn-b,jakosc_f@b-sn-b"},
        ).json()
        strony = f_szeregi["strona_probki"]
        os_czasu = f_szeregi["os_czasu_s"]
        assert [(t, s) for t, s in zip(os_czasu, strony, strict=True) if s != "C"] == [
            (0.1, "L"),
            (0.1, "P"),
            (0.2, "L"),
            (0.2, "P"),
        ]
        for indeks, strona in enumerate(strony):
            if strona != "C":
                assert f_szeregi["probki"]["f_hz@b-sn-b"][indeks] is None
                assert f_szeregi["probki"]["jakosc_f@b-sn-b"][indeks] == 3.0

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
        assert szeregi_a["strona_probki"] == szeregi_b["strona_probki"]
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
        """Synchronizacja zrodla jest w kontrakcie danych, rdzen jej nie wykonuje.

        PRZEPISANY SWIADOMIE (karta AB-1b.1 par. 0 pkt 9): dawniej ta odmowa dotyczyla
        komendy regulacji, ktora od tej karty rdzen WYKONUJE (test ponizej); intencja —
        rodzaj spoza zbioru rdzenia konczy sie NAZWANA odmowa, nie cichym pominieciem —
        zostaje przypieta na jedynym takim rodzaju: synchronizacji.
        """
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        pf_run_id = _uruchom_rozplyw(client, case_id)
        scenariusz = {
            "horyzont_s": 0.4,
            "krok_wyjscia_s": 0.02,
            "zdarzenia": [
                {
                    "rodzaj": "synchronizacja",
                    "t_s": 0.2,
                    "ref_id": "gen-pv",
                    "bus_ref": "b-oze",
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

    def test_komenda_nieobslugiwana_przez_rodzine_konczy_bieg_odmowa_rdzenia(
        self, client: TestClient
    ) -> None:
        """Maszyna synchroniczna bez regulatora mocy biernej: komenda Q = odmowa rdzenia z
        powodem przez cala sciezke HTTP (nie cicha podmiana na inny stan)."""
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
                    "nastawa": {"q_mvar": 2.0},
                }
            ],
        }
        bieg = _uruchom_dynamike(
            client,
            case_id,
            {"pf_run_id": pf_run_id, "dynamika": scenariusz, "nastawy_solvera": NASTAWY_SOLVERA},
        )
        assert bieg["status"] == "FAILED"
        assert "dynamika.nastawa_nieobslugiwana" in bieg["error_message"]

    def test_zdarzenia_rdzenia_P6_P8_przez_cala_sciezke(self, client: TestClient) -> None:
        """Komenda regulacji, czesciowa utrata i detektor przekroczenia: solver -> baza ->
        HTTP. Wynik niesie przypisanie (adres, przed, po), przyczyne wpisu, dokladna chwile
        przekroczenia (skokowe w chwili utraty: szerokosc 0) i tryb scenariusza."""
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        pf_run_id = _uruchom_rozplyw(client, case_id)
        scenariusz = {
            "horyzont_s": 0.3,
            "krok_wyjscia_s": 0.02,
            "zdarzenia": [
                {
                    "rodzaj": "komenda_regulacji",
                    "t_s": 0.1,
                    "ref_id": "gen-synchroniczny",
                    "nastawa": {"p_mw": 4.0},
                },
                {
                    "rodzaj": "utrata_czesciowa_zrodla",
                    "t_s": 0.2,
                    "ref_id": "gen-pv",
                    "udzial_pozostaly": 0.5,
                },
            ],
            "detektory": [
                {
                    "ident": "p-pv<",
                    "wielkosc": {"rodzaj": "moc_urzadzenia", "ref_id": "gen-pv", "skladowa": "p"},
                    "prog": 0.012,
                    "kierunek": "w_dol",
                    "jednorazowy": True,
                }
            ],
        }
        bieg = _uruchom_dynamike(
            client,
            case_id,
            {
                "pf_run_id": pf_run_id,
                "dynamika": scenariusz,
                "nastawy_solvera": {**NASTAWY_SOLVERA, "tolerancja_lokalizacji_zdarzen_s": 1e-7},
            },
        )
        assert bieg["status"] == "DONE", bieg["error_message"]
        ladunek = client.get(f"/api/analysis-runs/{bieg['run_id']}/results/dynamika").json()
        assert ladunek["tryb_scenariusza"] == "siec"
        komenda, utrata = ladunek["zdarzenia_wykonane"]
        assert (komenda["rodzaj"], komenda["przyczyna"]) == ("komenda_regulacji", "harmonogram")
        (przypisanie,) = komenda["przypisania"]
        assert przypisanie["adres"] == "gen-synchroniczny.p_mechaniczna_pu"
        assert przypisanie["po"] == pytest.approx(0.04, rel=0, abs=1e-12)
        assert komenda["delta_x_nieprzypisane_max"] == 0.0
        assert (utrata["rodzaj"], utrata["t_wykonany_s"]) == ("utrata_czesciowa_zrodla", 0.2)
        assert utrata["t_zlokalizowany_s"] is None
        (przekroczenie,) = ladunek["przekroczenia"]
        assert przekroczenie == {
            "dozor": "p-pv<",
            "wielkosc": "p_pu@gen-pv",
            "prog": 0.012,
            "kierunek": "w_dol",
            "t_s": 0.2,
            "szerokosc_przedzialu_s": 0.0,
            "iteracje": 0,
        }
        zalozenia = " ".join(ladunek["zalozenia"])
        assert "Przypisanie stanu i komenda regulacji" in zalozenia
        assert "Częściowa utrata źródła" in zalozenia

    def test_stanowisko_badawcze_przez_cala_sciezke(self, client: TestClient) -> None:
        """Zrodlo testowe idealne zastepuje zrodlo sieciowe: tryb `stanowisko` w wyniku,
        napiecie szyny zrodla rowne profilowi w szeregach zwroconych przez HTTP."""
        case_id = _nowy_przypadek(client)
        _seed_siec_wzorcowa(client, case_id)
        pf_run_id = _uruchom_rozplyw(client, case_id)
        scenariusz = {
            "horyzont_s": 0.3,
            "krok_wyjscia_s": 0.02,
            "zdarzenia": [],
            "stanowisko": {
                "zrodlo_ref": "zrodlo-110",
                "impedancja": "idealna",
                "profil": [{"rodzaj": "skok_napiecia", "t_s": 0.1, "u_pu": 0.9}],
            },
        }
        bieg = _uruchom_dynamike(
            client,
            case_id,
            {"pf_run_id": pf_run_id, "dynamika": scenariusz, "nastawy_solvera": NASTAWY_SOLVERA},
        )
        assert bieg["status"] == "DONE", bieg["error_message"]
        ladunek = client.get(f"/api/analysis-runs/{bieg['run_id']}/results/dynamika").json()
        assert ladunek["tryb_scenariusza"] == "stanowisko"
        assert any(zdanie.startswith("Tryb stanowiska") for zdanie in ladunek["zalozenia"])
        szeregi = client.get(
            f"/api/analysis-runs/{bieg['run_id']}/results/dynamika/time-series",
            params={"kanaly": "u_pu@b-110"},
        ).json()
        for t, strona, u in zip(
            szeregi["os_czasu_s"],
            szeregi["strona_probki"],
            szeregi["probki"]["u_pu@b-110"],
            strict=True,
        ):
            if t > 0.1 or (t == 0.1 and strona == "P"):
                assert u == pytest.approx(0.9, abs=1e-9)
