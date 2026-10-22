"""Tok pracy scenariuszy łączeniowych przez HTTP (karta W5-C).

Ścieżka użytkownika: projektant zapisuje scenariusz nazwany ze stanami łączników
(``POST /api/scenariusze-laczeniowe/study-cases/{case_id}``), uruchamia rozpływ ze
scenariuszem istniejącą końcówką biegów (``scenario_id``) i czyta wynik. Pary dowodowe:

* wynik biegu ze scenariuszem = wynik biegu na modelu przełączonym operacją domenową
  (ta sama fizyka — scenariusz trafia do migawki efektywnej, nie do osobnej ścieżki);
* wynik ze scenariuszem ≠ wynik na modelu bazowym, a model bazowy po biegu bez zmian;
* scenariusz odcinający wyspę jest odrzucany bramą gotowości TAK SAMO jak model z tym
  stanem łącznika (409 z nazwą szyn), bez zmiany modelu;
* odmowy zapisu: element spoza modelu i nie-łącznik (422 z polem), pusta lista stanów
  i stan spoza słownika (422 kontraktu), nieistniejący scenariusz (404).
"""

from __future__ import annotations

from typing import Any

import pytest
from api.main import app
from enm.scenariusze import OperatingScenario, RodzajScenariusza, zapisz_scenariusz
from fastapi.testclient import TestClient

pytest.importorskip("sqlalchemy")

from tests.enm.siec_lacznikowa import (  # noqa: E402
    SiecLacznikowa,
    galaz,
    pierscien_z_nop,
    promieniowa,
    z_odbiorami,
)
from tests.test_dynamika_rms_run import _nowy_przypadek, _reset_backend_state  # noqa: E402
from tests.utils.biegi import wykonaj_bieg  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def _klucz(client: TestClient, case_id: str) -> str:
    from application.twin_key import klucz_twin_dla_przypadku

    return klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)


def _przypadek_z_siecia(client: TestClient, siec: SiecLacznikowa) -> str:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    case_id = _nowy_przypadek(client)
    set_enm(_klucz(client, case_id), EnergyNetworkModel.model_validate(siec.enm))
    return case_id


def _model(client: TestClient, case_id: str) -> dict[str, Any]:
    odpowiedz = client.get(f"/api/cases/{case_id}/enm")
    assert odpowiedz.status_code == 200, odpowiedz.text
    return odpowiedz.json()


def _rozplyw(client: TestClient, case_id: str, scenario_id: str | None = None) -> dict[str, Any]:
    zadanie: dict[str, Any] = {"analysis_type": "LOAD_FLOW", "solver_input": {}}
    if scenario_id is not None:
        zadanie["scenario_id"] = scenario_id
    utworzony = client.post(f"/api/execution/study-cases/{case_id}/runs", json=zadanie)
    assert utworzony.status_code == 201, utworzony.text
    run_id = utworzony.json()["id"]
    wykonany = wykonaj_bieg(client, run_id)
    assert wykonany.json()["status"] == "DONE", wykonany.json().get("error_message")
    wyniki = client.get(f"/api/execution/runs/{run_id}/results")
    assert wyniki.status_code == 200, wyniki.text
    tresc = wyniki.json()
    # Tożsamość biegu (id, sygnatura wejścia, `proof_ref` — odcisk pakietu dowodowego TEGO
    # biegu) nie jest fizyką — porównujemy wyniki.
    globalne = {k: v for k, v in tresc["global_results"].items() if k != "proof_ref"}
    return {"elementy": tresc["element_results"], "globalne": globalne}


def _adres(case_id: str) -> str:
    return f"/api/scenariusze-laczeniowe/study-cases/{case_id}"


def test_scenariusz_przeniesienia_punktu_podzialu_rowny_operacji_na_modelu(
    client: TestClient,
) -> None:
    siec = z_odbiorami(pierscien_z_nop())
    assert siec.poprzedni_nop is not None
    case_id = _przypadek_z_siecia(client, siec)
    stany = {siec.cel: "open", siec.poprzedni_nop: "closed"}

    zapis = client.post(_adres(case_id), json={"name": "NOP na łączniku B", "switch_states": stany})
    assert zapis.status_code == 201, zapis.text
    wpis = zapis.json()
    assert wpis["revision"] == 1 and wpis["switch_states"] == dict(sorted(stany.items()))

    model_przed = _model(client, case_id)
    bazowy = _rozplyw(client, case_id)
    ze_scenariuszem = _rozplyw(client, case_id, wpis["scenario_id"])
    assert _model(client, case_id) == model_przed, "bieg ze scenariuszem zmienił model bazowy"
    assert ze_scenariuszem != bazowy

    operacja = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {
                "name": "set_normal_open_point",
                "idempotency_key": "w5c-nop",
                "payload": {"switch_ref": siec.cel},
            },
        },
    )
    assert operacja.status_code == 200, operacja.text
    assert operacja.json().get("error") is None, operacja.json().get("error")
    po_operacji = _model(client, case_id)
    assert galaz(po_operacji, siec.cel)["status"] == "open"
    assert galaz(po_operacji, siec.poprzedni_nop)["status"] == "closed"
    assert _rozplyw(client, case_id) == ze_scenariuszem


def test_scenariusz_odcinajacy_wyspe_odrzucony_jak_model(client: TestClient) -> None:
    siec = z_odbiorami(promieniowa())
    case_id = _przypadek_z_siecia(client, siec)
    zapis = client.post(
        _adres(case_id), json={"name": "Otwarty łącznik", "switch_states": {siec.cel: "open"}}
    )
    assert zapis.status_code == 201, zapis.text
    model_przed = _model(client, case_id)

    bieg = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={
            "analysis_type": "LOAD_FLOW",
            "solver_input": {},
            "scenario_id": zapis.json()["scenario_id"],
        },
    )
    assert bieg.status_code == 409, bieg.text
    assert "Wyspa sieci odcięta od źródła zasilania" in bieg.json()["detail"]
    assert _model(client, case_id) == model_przed


def test_zapis_rewizja_lista_i_zachowanie_pozostalych_nadpisan(client: TestClient) -> None:
    siec = pierscien_z_nop()
    assert siec.poprzedni_nop is not None
    case_id = _przypadek_z_siecia(client, siec)
    klucz = _klucz(client, case_id)
    # Scenariusz BEZ stanów łączników (inny rodzaj nadpisań) — nie trafia do listy.
    zapisz_scenariusz(
        klucz,
        OperatingScenario(
            scenario_id="scen-wylaczenie",
            name="Wyłączenie odbioru",
            kind=RodzajScenariusza.CUSTOM,
            gen_scaling={},
            out_of_service=(siec.cel,),
        ),
    )

    pierwszy = client.post(
        _adres(case_id), json={"name": "Wariant A", "switch_states": {siec.cel: "open"}}
    )
    assert pierwszy.status_code == 201, pierwszy.text
    drugi = client.post(
        _adres(case_id),
        json={
            "scenario_id": "scen-wylaczenie",
            "name": "Wyłączenie + stan",
            "switch_states": {siec.poprzedni_nop: "closed"},
        },
    )
    assert drugi.status_code == 201, drugi.text
    assert drugi.json()["revision"] == 2

    from enm.scenariusze import wczytaj_scenariusz

    zapisany = wczytaj_scenariusz(klucz, "scen-wylaczenie")
    assert zapisany.out_of_service == (siec.cel,), "rewizja zgubiła pozostałe nadpisania"
    assert zapisany.switch_states == {siec.poprzedni_nop: "closed"}

    lista = client.get(_adres(case_id)).json()
    assert lista["count"] == 2
    assert {s["scenario_id"] for s in lista["scenariusze"]} == {
        pierwszy.json()["scenario_id"],
        "scen-wylaczenie",
    }
    # Ten sam zapis drugi raz nie tworzy rewizji (brak zmiany nie jest zmianą).
    ponownie = client.post(
        _adres(case_id),
        json={
            "scenario_id": "scen-wylaczenie",
            "name": "Wyłączenie + stan",
            "switch_states": {siec.poprzedni_nop: "closed"},
        },
    )
    assert ponownie.status_code == 201 and ponownie.json()["revision"] == 2


@pytest.mark.parametrize(
    ("element", "fraza"),
    [("brak-elementu", "nie istnieje"), ("KABEL", "nie jest łącznikiem")],
)
def test_odmowa_stanu_elementu_spoza_lacznikow(
    client: TestClient, element: str, fraza: str
) -> None:
    siec = promieniowa()
    case_id = _przypadek_z_siecia(client, siec)
    ref = (
        next(b["ref_id"] for b in siec.enm["branches"] if b["type"] == "cable")
        if element == "KABEL"
        else element
    )
    odpowiedz = client.post(_adres(case_id), json={"name": "Zły", "switch_states": {ref: "open"}})
    assert odpowiedz.status_code == 422, odpowiedz.text
    (blad,) = odpowiedz.json()["detail"]
    assert blad["pole"] == f"switch_states.{ref}"
    assert blad["komunikat"].startswith("Scenariusz nie przystaje do modelu")
    assert fraza in blad["komunikat"]
    assert client.get(_adres(case_id)).json()["count"] == 0


@pytest.mark.parametrize(
    "stany", [{}, {"x": "OPEN"}, {"x": "nieznany"}], ids=["pusta", "wielkie", "spoza"]
)
def test_odmowa_kontraktu_stanow(client: TestClient, stany: dict[str, str]) -> None:
    case_id = _przypadek_z_siecia(client, promieniowa())
    odpowiedz = client.post(_adres(case_id), json={"name": "Zły", "switch_states": stany})
    assert odpowiedz.status_code == 422, odpowiedz.text


def test_nieistniejacy_scenariusz_404(client: TestClient) -> None:
    siec = promieniowa()
    case_id = _przypadek_z_siecia(client, siec)
    odpowiedz = client.post(
        _adres(case_id),
        json={"scenario_id": "brak-takiego", "name": "x", "switch_states": {siec.cel: "open"}},
    )
    assert odpowiedz.status_code == 404, odpowiedz.text
