"""API stanu zasilenia i toru (karta K6a) — realna ścieżka: `PUT /enm` → `GET .../topologia/*`
na złotej sieci 20 stacji (`tests/enm/golden_network_fixture.py`)."""

from __future__ import annotations

import hashlib
from uuid import uuid4

import pytest
from api.enm import router as enm_router
from domain.models import Project
from domain.study_case import StudyCase
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store
from enm.topology import derive
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.enm.golden_network_fixture import build_golden_network


@pytest.fixture(autouse=True)
def _czysty_magazyn():
    reset_enm_store()
    yield
    reset_enm_store()


@pytest.fixture
def client(uow_factory):
    aplikacja = FastAPI()
    aplikacja.include_router(enm_router)
    aplikacja.state.uow_factory = uow_factory
    return TestClient(aplikacja)


def _przypadek_ze_zlota_siecia(client: TestClient) -> str:
    project_id, case_id = uuid4(), uuid4()
    with client.app.state.uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Tor zasilania"), commit=False)
        uow.cases.add_study_case(
            StudyCase(id=case_id, project_id=project_id, name="Przypadek"), commit=False
        )
        uow.commit()
    odpowiedz = client.put(
        f"/api/cases/{case_id}/enm", json=build_golden_network().model_dump(mode="json")
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    return str(case_id)


def test_zasilenie_zlotej_sieci_przez_api(client: TestClient) -> None:
    case_id = _przypadek_ze_zlota_siecia(client)
    pierwsza = client.get(f"/api/cases/{case_id}/enm/topologia/zasilenie")
    druga = client.get(f"/api/cases/{case_id}/enm/topologia/zasilenie")
    assert pierwsza.status_code == 200, pierwsza.text
    assert hashlib.sha256(pierwsza.content).hexdigest() == hashlib.sha256(druga.content).hexdigest()
    dane = pierwsza.json()
    assert dane["podstawa"] == "topologia_laczeniowa"
    assert "nie jest wynik obliczeń napięciowych" in dane["opis_podstawy"]
    assert dane["case_id"] == case_id
    # Model po zapisie (magazyn kanonizuje model — porównanie z tym, co API faktycznie trzyma).
    model = EnergyNetworkModel.model_validate(client.get(f"/api/cases/{case_id}/enm").json())
    oczekiwane = (
        len(model.buses)
        + len(model.branches)
        + len(model.transformers)
        + len(model.sources)
        + len(model.generators)
        + len(model.loads)
        + len(model.bays)
        + len(model.substations)
    )
    assert len(dane["elementy"]) == oczekiwane
    widok = derive(model)
    assert [w["szyny"] for w in dane["wyspy"]] == [list(w.szyny) for w in widok.wyspy]
    assert all(e["stan"] == "zasilany" and e["zrodla"] == ["src_grid"] for e in dane["elementy"])
    assert dane["laczniki_nieustalone"] == []


def test_tor_zlotej_sieci_przez_api(client: TestClient) -> None:
    case_id = _przypadek_ze_zlota_siecia(client)
    url = f"/api/cases/{case_id}/enm/topologia/tor"
    odpowiedz = client.get(url, params={"element_ref": "bus_s05_15"})
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()
    assert dane["element"] == {
        "ref_id": "bus_s05_15",
        "rodzaj": "szyna",
        "typ": None,
        "nazwa": dane["element"]["nazwa"],
    }
    assert dane["podstawa"] == "topologia_laczeniowa"
    # Złota sieć ma poprzeczne połączenia zamknięte — pętle bez punktu podziału, jawnie.
    assert dane["status"] == "nierozstrzygniety"
    assert "PETLA_BEZ_PUNKTU_PODZIALU" in {p["kod"] for p in dane["przyczyny"]}
    for droga in dane["drogi"]:
        assert droga["zrodlo_ref"] == "src_grid"
        assert droga["elementy"][0]["ref_id"] == "src_grid"
        assert droga["elementy"][-1]["ref_id"] == "bus_s05_15"
    assert dane["sasiedztwo"]["stacja"]["ref_id"] == "sub_s05"
    assert client.get(url, params={"element_ref": "bus_s05_15"}).content == odpowiedz.content


def test_tor_nieznanego_elementu_404(client: TestClient) -> None:
    case_id = _przypadek_ze_zlota_siecia(client)
    odpowiedz = client.get(
        f"/api/cases/{case_id}/enm/topologia/tor", params={"element_ref": "nie_ma_takiego"}
    )
    assert odpowiedz.status_code == 404
    assert "nie_ma_takiego" in odpowiedz.json()["detail"]
