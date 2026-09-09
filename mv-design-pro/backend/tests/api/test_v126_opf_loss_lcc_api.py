"""Kontrakt wycofania dwóch rodzajów V12.6 duplikujących kanon (karta W3-E).

DO KARTY W3-E ten plik testował bramkę 422 `transformer.loss_data_missing`,
która chroniła URUCHOMIENIE `opf_loss_lcc` przed transformatorem bez p0_kw
(solver `_opf_loss_lcc` sumuje straty jałowe wprost, FROZEN — B-01). Karta
W3-E wycofała CAŁY rodzaj `opf_loss_lcc` z powierzchni nowych biegów (410,
duplikuje `equipment_checks/transformer_losses.py` — β rzeczywisty z karty
katalogowej, nie zaszyte 0,45) razem z bliźniaczym `hosting_capacity` (lokalna
impedancja Thevenina bez sprzężenia sieci, duplikuje `application/analyses/
hosting_capacity.py` — pełny rozpływ). Bramka p0_kw stała się WIĘC zbędna
(nieosiągalna — 410 zapada wcześniej) i została zdjęta razem z rodzajem.

Plik testuje teraz KLASĘ mechanizmu wycofania, nie instancję: OBA rodzaje
(`hosting_capacity`, `opf_loss_lcc`) dzielą ten sam kod (`v126.analysis_withdrawn`)
i ten sam kontrakt. Iloczyn cech (KLASA nie instancja, CLAUDE.md):
{hosting_capacity, opf_loss_lcc} × {POST → 410, GET historyczny (results/
trace/proof/report) → 200 + pole addytywne `wycofany`}. Bieg historyczny
wstawiany BEZPOŚREDNIO do magazynu (`enm.canonical_analysis.create_run` +
`execute_run`, jak `test_v126_canonical_run_persistence.py`) — POST na te dwa
rodzaje 410-uje zawsze, więc historyczny bieg nie może dziś powstać przez API;
test dowodzi ODTWARZALNOŚCI biegów sprzed karty, nie tworzy nowego przez POST.

Kontrola dwustronna: inny rodzaj V12.6 (`insulation_coordination`) NIE 410-uje
— odmowa jest wąska, dotyczy WYŁĄCZNIE dwóch nazwanych rodzajów.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from api.main import app
from enm.canonical_analysis import create_run, execute_run
from enm.store import reset_enm_store
from fastapi.testclient import TestClient
from solver_input.v126_contracts import V126AcademicInput, V126AnalysisType

_RODZAJE_WYCOFANE = (V126AnalysisType.HOSTING_CAPACITY, V126AnalysisType.OPF_LOSS_LCC)

_ZAMIENNIK_TRAS = {
    V126AnalysisType.HOSTING_CAPACITY: "GET /api/oze-analysis/hosting-capacity",
    V126AnalysisType.OPF_LOSS_LCC: "POST /api/solver/transformer-losses",
}


def _model_minimalny() -> V126AcademicInput:
    return V126AcademicInput.model_validate(
        {
            "buses": [
                {"ref": "B1", "name": "Szyna 1", "nominal_kv": 15.0, "customer_count": 10},
                {"ref": "B2", "name": "Szyna 2", "nominal_kv": 15.0, "customer_count": 5},
            ],
            "branches": [
                {
                    "ref": "L1",
                    "from_bus_ref": "B1",
                    "to_bus_ref": "B2",
                    "kind": "cable",
                    "length_km": 1.5,
                    "ampacity_a": 245.0,
                }
            ],
            "transformers": [
                {
                    "ref": "TR1",
                    "hv_bus_ref": "B1",
                    "lv_bus_ref": "B2",
                    "sn_mva": 16.0,
                    "uhv_kv": 110.0,
                    "ulv_kv": 15.0,
                    "uk_percent": 10.5,
                    "pk_kw": 90.0,
                    "p0_kw": 12.5,
                },
            ],
            "parameters": {"hosting_monte_carlo_n": 20},
        }
    )


def _wstaw_bieg_historyczny(rodzaj: V126AnalysisType) -> Any:
    """Bieg wstawiony BEZPOŚREDNIO do rejestru kanonicznego (bez POST) — POST na
    rodzaj wycofany 410-uje zawsze, więc jedyna droga do biegu historycznego
    tego rodzaju jest ta, którą tworzy prawdziwy wykonawca (`_execute_v126`)."""
    model = _model_minimalny()
    run = create_run(
        case_id=f"case-wycofany-{rodzaj.value}",
        klucz_twin=f"klucz-wycofany-{rodzaj.value}-{uuid4()}",
        analysis_type=f"v126:{rodzaj.value}",
        options={"model": model.model_dump(mode="json")},
    )
    run = execute_run(run.id)
    assert run.status == "FINISHED", run.error_message
    return run


def _seed_case_bez_enm(client: TestClient) -> str:
    """Realny projekt + przypadek przez API (CV-1-W: `case_id` obcy bazie = 404
    na poziomie zależności `KluczTwin`, WSPÓLNEJ dla całego API — 410 tej karty
    stoi PRZED logiką TEJ trasy, nie przed uniwersalną zależnością tłumaczącą
    `case_id`). Przypadek celowo BEZ committed ENM — dowód, że 410 zapada
    wcześniej niż bramka „przypadek nie ma committed ENM"."""
    reset_enm_store()
    project_resp = client.post("/api/projects", json={"name": "V12.6 wycofanie - test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


@pytest.mark.parametrize("rodzaj", _RODZAJE_WYCOFANE, ids=lambda r: r.value)
def test_post_rodzaju_wycofanego_zwraca_410_z_zamiennikiem(rodzaj: V126AnalysisType) -> None:
    """PIN NA DECYZJĘ: POST nowego biegu rodzaju wycofanego nigdy nie liczy —
    410 zapada dla REALNEGO przypadku (zależność `KluczTwin`, wspólna dla
    całego API, i tak musi zobaczyć przypadek w bazie — patrz test niżej o
    przypadku bez committed ENM), zanim logika TEJ trasy w ogóle spojrzy na
    ENM czy parametry przypadku."""
    with TestClient(app) as client:
        case_id = _seed_case_bez_enm(client)
        resp = client.post(
            f"/api/cases/{case_id}/runs/v126/{rodzaj.value}",
            json={"parameters": {}},
        )
    assert resp.status_code == 410, resp.text
    body = resp.json()
    assert body["code"] == "v126.analysis_withdrawn"
    assert body["analysis_type"] == rodzaj.value
    assert body["powod_pl"], f"{rodzaj.value}: powód wycofania pusty"
    assert body["zamiennik"], f"{rodzaj.value}: brak zamiennika"
    trasy_zamiennika = [pozycja["trasa"] for pozycja in body["zamiennik"]]
    assert _ZAMIENNIK_TRAS[rodzaj] in trasy_zamiennika


def test_post_rodzaju_wycofanego_nie_wymaga_committed_enm() -> None:
    """410 zapada nawet dla przypadku BEZ committed ENM — dowód, że bramka tej
    karty stoi PRZED bramką „Przypadek nie ma committed ENM z węzłami" (inny
    rodzaj V12.6 dostałby tu 422, nie 410 — patrz kontrola dwustronna niżej)."""
    with TestClient(app) as client:
        case_id = _seed_case_bez_enm(client)
        resp_wycofany = client.post(
            f"/api/cases/{case_id}/runs/v126/hosting_capacity",
            json={"parameters": {}},
        )
        resp_aktywny = client.post(
            f"/api/cases/{case_id}/runs/v126/insulation_coordination",
            json={"parameters": {}},
        )
    assert resp_wycofany.status_code == 410, resp_wycofany.text
    assert resp_aktywny.status_code == 422, resp_aktywny.text
    assert "committed ENM" in resp_aktywny.text


@pytest.mark.parametrize("rodzaj", _RODZAJE_WYCOFANE, ids=lambda r: r.value)
def test_bieg_historyczny_niesie_pole_wycofany_na_czterech_koncowkach(
    rodzaj: V126AnalysisType,
) -> None:
    """Odtwarzalność: bieg SPRZED karty zostaje czytelny w komplecie (results,
    trace, proof, report), każda końcówka niesie DODATKOWO pole `wycofany` o tej
    samej treści co 410 — front pokazuje stan „analiza wycofana", nie pustkę."""
    run = _wstaw_bieg_historyczny(rodzaj)
    with TestClient(app) as client:
        wynik = client.get(f"/api/analysis-runs/{run.id}/results/v126/{rodzaj.value}")
        slad = client.get(f"/api/analysis-runs/{run.id}/results/v126/{rodzaj.value}/trace")
        dowod = client.get(f"/api/analysis-runs/{run.id}/results/v126/{rodzaj.value}/proof")
        raport = client.get(f"/api/analysis-runs/{run.id}/results/v126/{rodzaj.value}/report")

    for nazwa, odpowiedz in (
        ("results", wynik),
        ("trace", slad),
        ("proof", dowod),
        ("report", raport),
    ):
        assert odpowiedz.status_code == 200, f"{nazwa}: {odpowiedz.text}"
        cialo = odpowiedz.json()
        assert "wycofany" in cialo, f"{nazwa}: brak pola 'wycofany' na biegu historycznym"
        assert cialo["wycofany"]["code"] == "v126.analysis_withdrawn"
        assert cialo["wycofany"]["analysis_type"] == rodzaj.value

    # Kontrola dodatnia: `results`/`trace` dalej niosą PRAWDZIWY wynik solvera
    # (odtwarzalność) — `wycofany` jest DOŁOŻONY, nie zamiast reszty kontraktu.
    assert wynik.json()["result"]["analysis_type"] == rodzaj.value
    assert isinstance(slad.json()["steps"], list)


def test_inna_analiza_v126_nie_jest_wycofana() -> None:
    """Bramka jest WĄSKA: rodzaj spoza `_ANALIZY_WYCOFANE` liczy normalnie —
    wycofanie dwóch rodzajów nie może po cichu urosnąć do kolejnych."""
    model = _model_minimalny()
    run = create_run(
        case_id="case-nie-wycofany",
        klucz_twin=f"klucz-nie-wycofany-{uuid4()}",
        analysis_type="v126:insulation_coordination",
        options={"model": model.model_dump(mode="json")},
    )
    run = execute_run(run.id)
    assert run.status == "FINISHED", run.error_message
    with TestClient(app) as client:
        resp = client.get(f"/api/analysis-runs/{run.id}/results/v126/insulation_coordination")
    assert resp.status_code == 200, resp.text
    assert "wycofany" not in resp.json()
