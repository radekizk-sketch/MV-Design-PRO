"""Porownania A/B na R1 przez API — dowod koncowy karty CV-3.3-B.

Trzy endpointy porownania (rozplyw P20c, zabezpieczenia P15b, ogolne P10b) po
przepieciu na R1 (`CanonicalRun`, B1) — testy end-to-end na PRAWDZIWYCH biegach
utworzonych/wykonanych przez API wykonawcze (nie fikstury domenowe wprost),
zgodnie z definicja ukonczenia karty CV-3.3-B:
  - porownanie dwoch biegow R1 tej samej sieci w dwoch scenariuszach, delty
    spojne z roznicami wyniku solvera (nie tylko wewnetrzna arytmetyka
    odpowiedzi — znak delty musi zgadzac sie z KIERUNKIEM realnej zmiany),
  - deterministyczny wynik porownania (ta sama para biegow -> ten sam hash
    i te same liczby),
  - 422 dla biegu innego rodzaju analizy / innego projektu (innej sieci).

Przed ta karta zero endpointow porownania mialo pokrycie na poziomie HTTP —
wylacznie testy domenowe na fikstywnych obiektach. To pokrycie zlapalo przy
pisaniu DWA realne defekty (naprawione w tej samej karcie, nie osobno):
  1. `_execute_protection` budowal WLASNY silnik/sesje z `DATABASE_URL`
     (`_uow_factory_biezacy`) zamiast uzyc fabryki wolajacego — kazdy
     przypadek istniejacy naprawde zglaszal sie jako nieznaleziony w kazdym
     wdrozeniu, ktorego `app.state.uow_factory` nie pochodzi z tego env var
     (kazdy test). Naprawa: `execute_run`/`_wykonaj_analize_biegu`/
     `_execute_protection` przyjmuja teraz `uow_factory` od wolajacego.
  2. `PowerFlowComparisonTraceResponse` (pydantic) niosla martwe pole
     `snapshot_id_a/b` po zmianie domeny na `snapshot_hash_a/b` — endpoint
     `/trace` konczyl sie 500 (ResponseValidationError) na KAZDYM wywolaniu.
  3. `provenance_a/b` (B1: dowod CO bylo porownywane) nie byly wystawione w
     ZADNYM z trzech modeli odpowiedzi API (tylko w domenie) — dodane tutaj.
"""

from __future__ import annotations

from typing import Any

import pytest

pytest.importorskip("fastapi")


# =============================================================================
# WSPOLNE POMOCE (ten sam wzorzec co tests/api/test_protection_overlay_swiezosc.py)
# =============================================================================


def _projekt_i_przypadek(app_client, *, nazwa: str = "Projekt porownan R1") -> tuple[str, str]:
    project = app_client.post("/api/projects", json={"name": nazwa})
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    case = app_client.post(
        "/api/study-cases",
        json={"project_id": project_id, "name": "Przypadek porownan", "set_active": True},
    )
    assert case.status_code == 201, case.text
    case_id = str(case.json()["id"])

    from tests.test_execution_api import _seed_valid_enm

    _seed_valid_enm(case_id)
    return project_id, case_id


def _utworz_bieg(
    app_client, case_id: str, analysis_type: str, solver_input: dict[str, Any] | None = None
) -> str:
    utworzenie = app_client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": analysis_type, "solver_input": solver_input or {}},
    )
    assert utworzenie.status_code == 201, utworzenie.text
    return str(utworzenie.json()["id"])


def _wykonaj(app_client, run_id: str) -> dict[str, Any]:
    wykonanie = app_client.post(f"/api/execution/runs/{run_id}/execute")
    assert wykonanie.status_code == 200, wykonanie.text
    payload = wykonanie.json()
    assert payload["status"] == "DONE", payload
    return payload


def _bieg_rozplywu(app_client, case_id: str) -> str:
    run_id = _utworz_bieg(app_client, case_id, "LOAD_FLOW")
    _wykonaj(app_client, run_id)
    return run_id


def _bieg_zwarciowy(app_client, case_id: str, analysis_type: str = "SC_3F") -> str:
    run_id = _utworz_bieg(app_client, case_id, analysis_type)
    _wykonaj(app_client, run_id)
    return run_id


def _zwieksz_obciazenie(app_client, case_id: str, p_mw: float) -> None:
    """Realna zmiana projektowa (nie podmiana pola w magazynie): wieksza moc
    odbioru na 'load-1' JEDYNA produkcyjna droga zmiany modelu
    (`POST /api/cases/{case_id}/enm/domain-ops`)."""
    zmiana = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "update_element_parameters",
                "payload": {"element_ref": "load-1", "parameters": {"p_mw": p_mw}},
            }
        },
    )
    assert zmiana.status_code == 200, zmiana.text
    assert not zmiana.json().get("error"), zmiana.text


def _skonfiguruj_zabezpieczenia(app_client, case_id: str) -> None:
    config = app_client.put(
        f"/api/study-cases/{case_id}/protection-config",
        json={"template_ref": "template_ref_oc_100"},
    )
    assert config.status_code == 200, config.text


def _bieg_zabezpieczen(app_client, project_id: str, case_id: str, sc_run_id: str) -> str:
    utworzenie = app_client.post(
        f"/api/projects/{project_id}/protection-runs",
        json={"sc_run_id": sc_run_id, "protection_case_id": case_id},
    )
    assert utworzenie.status_code == 201, utworzenie.text
    run_id = str(utworzenie.json()["id"])

    wykonanie = app_client.post(f"/api/protection-runs/{run_id}/execute")
    assert wykonanie.status_code == 200, wykonanie.text
    assert wykonanie.json()["status"] == "FINISHED", wykonanie.json()
    return run_id


def _asercja_proweniencji(wpis: dict[str, Any], oczekiwany_rodzaj: str) -> None:
    """B1: kazda odpowiedz porownania niesie dowod CO bylo porownywane —
    snapshot_hash/input_hash/status/rodzaj analizy biegu, nie tylko jego id."""
    assert wpis["run_id"]
    assert wpis["analysis_type"] == oczekiwany_rodzaj
    assert wpis["status"] == "FINISHED"
    assert wpis["snapshot_hash"]
    assert wpis["input_hash"]


# =============================================================================
# P20c — POROWNANIE ROZPLYWU MOCY
# =============================================================================


class TestPowerFlowComparisonR1Api:
    """P20c po przepieciu na R1 (B1) — definicja ukonczenia karty CV-3.3-B."""

    def test_porownanie_tej_samej_sieci_w_dwoch_scenariuszach(self, app_client) -> None:
        _project_id, case_id = _projekt_i_przypadek(app_client)
        run_a = _bieg_rozplywu(app_client, case_id)

        _zwieksz_obciazenie(app_client, case_id, p_mw=2.0)
        run_b = _bieg_rozplywu(app_client, case_id)

        odpowiedz = app_client.post(
            "/api/power-flow-comparisons",
            json={"power_flow_run_id_a": run_a, "power_flow_run_id_b": run_b},
        )
        assert odpowiedz.status_code == 201, odpowiedz.text
        wynik = odpowiedz.json()

        _asercja_proweniencji(wynik["provenance_a"], "PF")
        _asercja_proweniencji(wynik["provenance_b"], "PF")
        assert wynik["provenance_a"]["snapshot_hash"] != wynik["provenance_b"]["snapshot_hash"]

        assert wynik["bus_diffs"], "siec ma szyny — porownanie nie moze byc puste"
        szyna_odbioru = next(
            b for b in wynik["bus_diffs"] if b["delta_p_mw"] == 0.0 and b["v_pu_a"] is not None
        )
        # Wewnetrzna spojnosc: delta = B - A (ta sama odpowiedz, ale to NIE jest
        # jedyny dowod — patrz asercja znaku ponizej).
        assert szyna_odbioru["delta_v_pu"] == pytest.approx(
            szyna_odbioru["v_pu_b"] - szyna_odbioru["v_pu_a"]
        )
        # DOWOD, ZE DELTA POCHODZI Z PRAWDZIWEGO WYNIKU SOLVERA: wiekszy odbior
        # (1.0 -> 2.0 MW) MUSI obnizyc napiecie (prawo Ohma na impedancji
        # galezi), nie tylko zmienic liczbe o dowolny znak. Fabrykacja/cache
        # dalyby albo brak zmiany, albo znak nieprzewidywalny.
        assert szyna_odbioru["delta_v_pu"] < 0.0

        assert wynik["branch_diffs"], "siec ma galezie — porownanie nie moze byc puste"
        galaz = wynik["branch_diffs"][0]
        assert galaz["delta_p_from_mw"] == pytest.approx(
            galaz["p_from_mw_b"] - galaz["p_from_mw_a"]
        )
        # Wiecej mocy plynie do wiekszego odbioru na tej samej (jedynej) galezi.
        assert galaz["delta_p_from_mw"] > 0.0

    def test_porownanie_deterministyczne_ta_sama_para_ten_sam_wynik(self, app_client) -> None:
        _project_id, case_id = _projekt_i_przypadek(app_client)
        run_a = _bieg_rozplywu(app_client, case_id)
        _zwieksz_obciazenie(app_client, case_id, p_mw=1.5)
        run_b = _bieg_rozplywu(app_client, case_id)

        body = {"power_flow_run_id_a": run_a, "power_flow_run_id_b": run_b}
        pierwszy = app_client.post("/api/power-flow-comparisons", json=body)
        drugi = app_client.post("/api/power-flow-comparisons", json=body)
        assert pierwszy.status_code == 201, pierwszy.text
        assert drugi.status_code == 201, drugi.text

        w1, w2 = pierwszy.json(), drugi.json()
        assert w1["input_hash"] == w2["input_hash"]
        assert w1["comparison_id"] == w2["comparison_id"]
        assert w1["bus_diffs"] == w2["bus_diffs"]
        assert w1["branch_diffs"] == w2["branch_diffs"]
        assert w1["summary"] == w2["summary"]
        assert w1["provenance_a"] == w2["provenance_a"]
        assert w1["provenance_b"] == w2["provenance_b"]

        # Slad audytu (drugi endpoint, ta sama para) — pin regresji na defekt
        # znaleziony przy tej karcie: `/trace` konczyl sie 500 na KAZDYM wywolaniu
        # (pole odpowiedzi `snapshot_id_a/b` martwe po zmianie domeny na
        # `snapshot_hash_a/b`).
        slad = app_client.get(f"/api/power-flow-comparisons/{w1['comparison_id']}/trace")
        assert slad.status_code == 200, slad.text
        slad_json = slad.json()
        assert slad_json["snapshot_hash_a"]
        assert slad_json["snapshot_hash_b"]
        assert slad_json["steps"]

    def test_422_gdy_bieg_nie_jest_rozplywem_mocy(self, app_client) -> None:
        _project_id, case_id = _projekt_i_przypadek(app_client)
        run_a = _bieg_rozplywu(app_client, case_id)
        run_zwarciowy = _bieg_zwarciowy(app_client, case_id)

        odpowiedz = app_client.post(
            "/api/power-flow-comparisons",
            json={"power_flow_run_id_a": run_a, "power_flow_run_id_b": run_zwarciowy},
        )
        assert odpowiedz.status_code == 422, odpowiedz.text

    def test_422_gdy_biegi_z_roznych_projektow(self, app_client) -> None:
        _project_a, case_a = _projekt_i_przypadek(app_client, nazwa="Projekt PF A")
        _project_b, case_b = _projekt_i_przypadek(app_client, nazwa="Projekt PF B")
        run_a = _bieg_rozplywu(app_client, case_a)
        run_b = _bieg_rozplywu(app_client, case_b)

        odpowiedz = app_client.post(
            "/api/power-flow-comparisons",
            json={"power_flow_run_id_a": run_a, "power_flow_run_id_b": run_b},
        )
        assert odpowiedz.status_code == 422, odpowiedz.text


# =============================================================================
# P15b — POROWNANIE ZABEZPIECZEN
# =============================================================================


class TestProtectionComparisonR1Api:
    """P15b po przepieciu na R1 (B1) — definicja ukonczenia karty CV-3.3-B."""

    def test_porownanie_dwoch_biegow_o_roznym_rodzaju_zwarcia(self, app_client) -> None:
        project_id, case_id = _projekt_i_przypadek(app_client)
        _skonfiguruj_zabezpieczenia(app_client, case_id)

        sc_a = _bieg_zwarciowy(app_client, case_id, "SC_3F")
        run_a = _bieg_zabezpieczen(app_client, project_id, case_id, sc_a)

        sc_b = _bieg_zwarciowy(app_client, case_id, "SC_2F")
        run_b = _bieg_zabezpieczen(app_client, project_id, case_id, sc_b)

        odpowiedz = app_client.post(
            "/api/protection-comparisons",
            json={"protection_run_id_a": run_a, "protection_run_id_b": run_b},
        )
        assert odpowiedz.status_code == 201, odpowiedz.text
        wynik = odpowiedz.json()

        _asercja_proweniencji(wynik["provenance_a"], "protection_sn")
        _asercja_proweniencji(wynik["provenance_b"], "protection_sn")

        assert wynik["rows"], "ocena zabezpieczenia — porownanie nie moze byc puste"
        wiersz = wynik["rows"][0]
        # DOWOD, ZE DELTA I_k POCHODZI Z PRAWDZIWEGO WYNIKU SOLVERA: zwarcie 2F
        # (bez ziemi) daje INNY prad zwarciowy niz 3F na tej samej sieci — IEC
        # 60909 (nie arbitralna liczba, nie fabrykacja/cache oddajace ten sam
        # prad dla obu biegow).
        assert wiersz["i_fault_a_a"] is not None
        assert wiersz["i_fault_a_b"] is not None
        assert wiersz["i_fault_a_a"] != wiersz["i_fault_a_b"]
        assert wiersz["delta_i_fault_a"] == pytest.approx(
            wiersz["i_fault_a_b"] - wiersz["i_fault_a_a"]
        )

    def test_porownanie_deterministyczne_ta_sama_para_ten_sam_wynik(self, app_client) -> None:
        project_id, case_id = _projekt_i_przypadek(app_client)
        _skonfiguruj_zabezpieczenia(app_client, case_id)
        sc_a = _bieg_zwarciowy(app_client, case_id, "SC_3F")
        run_a = _bieg_zabezpieczen(app_client, project_id, case_id, sc_a)
        sc_b = _bieg_zwarciowy(app_client, case_id, "SC_2F")
        run_b = _bieg_zabezpieczen(app_client, project_id, case_id, sc_b)

        body = {"protection_run_id_a": run_a, "protection_run_id_b": run_b}
        pierwszy = app_client.post("/api/protection-comparisons", json=body)
        drugi = app_client.post("/api/protection-comparisons", json=body)
        assert pierwszy.status_code == 201, pierwszy.text
        assert drugi.status_code == 201, drugi.text

        w1, w2 = pierwszy.json(), drugi.json()
        assert w1["input_hash"] == w2["input_hash"]
        assert w1["rows"] == w2["rows"]
        assert w1["summary"] == w2["summary"]
        assert w1["provenance_a"] == w2["provenance_a"]
        assert w1["provenance_b"] == w2["provenance_b"]

        slad = app_client.get(f"/api/protection-comparisons/{w1['comparison_id']}/trace")
        assert slad.status_code == 200, slad.text
        assert slad.json()["steps"]

    def test_422_gdy_bieg_nie_jest_ocena_zabezpieczen(self, app_client) -> None:
        project_id, case_id = _projekt_i_przypadek(app_client)
        _skonfiguruj_zabezpieczenia(app_client, case_id)
        sc_run = _bieg_zwarciowy(app_client, case_id)
        run_a = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run)

        odpowiedz = app_client.post(
            "/api/protection-comparisons",
            json={"protection_run_id_a": run_a, "protection_run_id_b": sc_run},
        )
        assert odpowiedz.status_code == 422, odpowiedz.text

    def test_422_gdy_biegi_z_roznych_projektow(self, app_client) -> None:
        project_a, case_a = _projekt_i_przypadek(app_client, nazwa="Projekt Ochr A")
        project_b, case_b = _projekt_i_przypadek(app_client, nazwa="Projekt Ochr B")
        _skonfiguruj_zabezpieczenia(app_client, case_a)
        _skonfiguruj_zabezpieczenia(app_client, case_b)

        sc_a = _bieg_zwarciowy(app_client, case_a)
        run_a = _bieg_zabezpieczen(app_client, project_a, case_a, sc_a)
        sc_b = _bieg_zwarciowy(app_client, case_b)
        run_b = _bieg_zabezpieczen(app_client, project_b, case_b, sc_b)

        odpowiedz = app_client.post(
            "/api/protection-comparisons",
            json={"protection_run_id_a": run_a, "protection_run_id_b": run_b},
        )
        assert odpowiedz.status_code == 422, odpowiedz.text


# =============================================================================
# P10b — POROWNANIE OGOLNE
# =============================================================================


class TestGenericComparisonR1Api:
    """P10b po przepieciu na R1 (B1) — definicja ukonczenia karty CV-3.3-B."""

    def test_porownanie_tej_samej_sieci_w_dwoch_scenariuszach(self, app_client) -> None:
        _project_id, case_id = _projekt_i_przypadek(app_client)
        run_a = _bieg_rozplywu(app_client, case_id)

        _zwieksz_obciazenie(app_client, case_id, p_mw=2.0)
        run_b = _bieg_rozplywu(app_client, case_id)

        odpowiedz = app_client.post(
            "/api/comparison/runs",
            json={"run_a_id": run_a, "run_b_id": run_b},
        )
        assert odpowiedz.status_code == 200, odpowiedz.text
        wynik = odpowiedz.json()

        _asercja_proweniencji(wynik["provenance_a"], "PF")
        _asercja_proweniencji(wynik["provenance_b"], "PF")

        assert wynik["power_flow"] is not None
        assert wynik["short_circuit"] is None
        assert wynik["protection"] is None
        assert wynik["power_flow"]["total_losses_p_delta"] is not None
        # Wiekszy odbior -> wieksze straty czynne calkowite (fizyka, nie
        # arytmetyka samej odpowiedzi).
        assert wynik["power_flow"]["total_losses_p_delta"]["delta"] > 0.0

    def test_porownanie_deterministyczne_ta_sama_para_ten_sam_wynik(self, app_client) -> None:
        _project_id, case_id = _projekt_i_przypadek(app_client)
        run_a = _bieg_rozplywu(app_client, case_id)
        _zwieksz_obciazenie(app_client, case_id, p_mw=1.5)
        run_b = _bieg_rozplywu(app_client, case_id)

        body = {"run_a_id": run_a, "run_b_id": run_b}
        pierwszy = app_client.post("/api/comparison/runs", json=body)
        drugi = app_client.post("/api/comparison/runs", json=body)
        assert pierwszy.status_code == 200, pierwszy.text
        assert drugi.status_code == 200, drugi.text

        w1, w2 = pierwszy.json(), drugi.json()
        # Brak pola hash dedykowanego na tym DTO (`domain/results.py::
        # RunComparisonResult` go nie niesie) — determinizm dowodzi sie
        # rownoscia calej tresci porownania (poza `compared_at`).
        assert w1["power_flow"] == w2["power_flow"]
        assert w1["provenance_a"] == w2["provenance_a"]
        assert w1["provenance_b"] == w2["provenance_b"]

    def test_422_gdy_biegi_maja_rozne_rodzaje_analizy(self, app_client) -> None:
        _project_id, case_id = _projekt_i_przypadek(app_client)
        run_pf = _bieg_rozplywu(app_client, case_id)
        run_sc = _bieg_zwarciowy(app_client, case_id)

        odpowiedz = app_client.post(
            "/api/comparison/runs",
            json={"run_a_id": run_pf, "run_b_id": run_sc},
        )
        assert odpowiedz.status_code == 422, odpowiedz.text

    def test_422_gdy_biegi_z_roznych_projektow(self, app_client) -> None:
        _project_a, case_a = _projekt_i_przypadek(app_client, nazwa="Projekt Ogolne A")
        _project_b, case_b = _projekt_i_przypadek(app_client, nazwa="Projekt Ogolne B")
        run_a = _bieg_rozplywu(app_client, case_a)
        run_b = _bieg_rozplywu(app_client, case_b)

        odpowiedz = app_client.post(
            "/api/comparison/runs",
            json={"run_a_id": run_a, "run_b_id": run_b},
        )
        assert odpowiedz.status_code == 422, odpowiedz.text
