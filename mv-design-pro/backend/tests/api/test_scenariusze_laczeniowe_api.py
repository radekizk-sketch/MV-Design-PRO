"""Tok pracy scenariuszy łączeniowych przez HTTP (karta W5-C).

Ścieżka użytkownika: projektant zapisuje scenariusz nazwany ze stanami łączników
(``POST /api/scenariusze-laczeniowe/study-cases/{case_id}``), uruchamia rozpływ ze
scenariuszem istniejącą końcówką biegów (``scenario_id``) i czyta wynik. Pary dowodowe:

* wynik biegu ze scenariuszem = wynik biegu na modelu przełączonym operacją domenową
  (ta sama fizyka — scenariusz trafia do migawki efektywnej, nie do osobnej ścieżki);
* wynik ze scenariuszem ≠ wynik na modelu bazowym, a model bazowy po biegu bez zmian;
* scenariusz odcinający wyspę jest oceniany bramą gotowości TAK SAMO jak model z tym
  stanem łącznika (E003 z nazwami szyn wyspy, ważne, nie blokujące — karta GPZ-H5), bieg
  liczy część zasilaną, a szyny wyspy są w wyniku „bez napięcia”; model bez zmiany;
* odmowy zapisu: element spoza modelu i nie-łącznik (422 z polem), pusta lista stanów
  i stan spoza słownika (422 kontraktu), nieistniejący scenariusz (404);
* wyłączenie elementu z eksploatacji (`out_of_service`, karta GPZ-H5): wynik biegu
  ze scenariuszem = wynik na modelu bez tego elementu; odmowy (element spoza kolekcji
  wyłączalnych, powtórzenie, scenariusz bez stanu i wyłączenia, łącznik wyłączony i
  przestawiany jednocześnie); rewizja bez pola zachowuje wyłączenia; lista wyłączeń
  zapisywana w kolejności `ref_id` (ten sam odcisk niezależnie od kolejności zaznaczeń).
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


def _kody_gotowosci(
    client: TestClient, case_id: str, scenario_id: str | None = None
) -> dict[str, dict[str, Any]]:
    parametry = {"scenario_id": scenario_id} if scenario_id is not None else {}
    odpowiedz = client.get(f"/api/cases/{case_id}/enm/readiness", params=parametry)
    assert odpowiedz.status_code == 200, odpowiedz.text
    return {i["code"]: i for i in odpowiedz.json()["validation"]["issues"]}


def _bez_napiecia(rozplyw: dict[str, Any]) -> list[str]:
    return sorted(
        e["element_ref"]
        for e in rozplyw["elementy"]
        if e["element_type"] == "Bus" and "BEZ_NAPIECIA" in e["values"]["flags"]
    )


def test_scenariusz_odcinajacy_wyspe_liczony_jak_model_z_wyspa_bez_napiecia(
    client: TestClient,
) -> None:
    """Karta GPZ-H5 (R7): wyspa odcięta od źródła nie blokuje biegu — część zasilana jest
    liczona, a szyny wyspy są w wyniku „bez napięcia”; odmowa biegu wyłącznie przy modelu
    bez żadnego źródła (E001). Dawna intencja testu zostaje: brama gotowości czyta MIGAWKĘ
    SCENARIUSZA tak samo jak model z tym stanem łącznika (E003 z nazwami szyn wyspy tylko
    ze scenariuszem), a bieg ze scenariuszem nie zmienia modelu bazowego."""
    siec = z_odbiorami(promieniowa())
    case_id = _przypadek_z_siecia(client, siec)
    zapis = client.post(
        _adres(case_id), json={"name": "Otwarty łącznik", "switch_states": {siec.cel: "open"}}
    )
    assert zapis.status_code == 201, zapis.text
    scenario_id = zapis.json()["scenario_id"]
    model_przed = _model(client, case_id)

    assert "E003" not in _kody_gotowosci(client, case_id)
    e003 = _kody_gotowosci(client, case_id, scenario_id)["E003"]
    assert e003["severity"] == "IMPORTANT"
    assert "Wyspa sieci odcięta od źródła zasilania" in e003["message_pl"]
    assert "bez napięcia" in e003["message_pl"]

    bazowy = _rozplyw(client, case_id)
    ze_scenariuszem = _rozplyw(client, case_id, scenario_id)
    assert _model(client, case_id) == model_przed, "bieg ze scenariuszem zmienił model bazowy"
    assert _bez_napiecia(bazowy) == []
    assert _bez_napiecia(ze_scenariuszem) == sorted(e003["element_refs"])
    for element in ze_scenariuszem["elementy"]:
        if element["element_ref"] in e003["element_refs"]:
            assert element["values"]["u_kv"] is None and element["values"]["u_pu"] is None

    # Para dowodowa: ten sam stan łącznika operacją domenową na modelu → ta sama gotowość
    # i ten sam wynik (jedna fizyka, scenariusz trafia do migawki efektywnej).
    operacja = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {
                "name": "set_normal_open_point",
                "idempotency_key": "gpz-h5-wyspa",
                "payload": {"switch_ref": siec.cel},
            },
        },
    )
    assert operacja.status_code == 200, operacja.text
    assert operacja.json().get("error") is None, operacja.json().get("error")
    assert _kody_gotowosci(client, case_id)["E003"]["element_refs"] == e003["element_refs"]
    assert _rozplyw(client, case_id) == ze_scenariuszem


def test_zapis_rewizja_lista_i_zachowanie_pozostalych_nadpisan(client: TestClient) -> None:
    siec = pierscien_z_nop()
    assert siec.poprzedni_nop is not None
    case_id = _przypadek_z_siecia(client, siec)
    klucz = _klucz(client, case_id)
    # Scenariusz z samym wyłączeniem elementu (zapis magazynem, nie końcówką) — trafia do
    # listy scenariuszy łączeniowych tak samo jak scenariusz ze stanami łączników.
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


def _odbiory(siec: SiecLacznikowa) -> list[str]:
    return sorted(o["ref_id"] for o in siec.enm.get("loads") or [])


def test_wylaczenie_odbioru_rowne_modelowi_bez_odbioru(client: TestClient) -> None:
    """Para dowodowa wyłączenia: bieg ze scenariuszem `out_of_service` = bieg na modelu, z
    którego element usunięto operacją domenową; model bazowy po biegu bez zmian."""
    siec = z_odbiorami(promieniowa())
    case_id = _przypadek_z_siecia(client, siec)
    odbior = _odbiory(siec)[0]
    zapis = client.post(_adres(case_id), json={"name": "Bez odbioru", "out_of_service": [odbior]})
    assert zapis.status_code == 201, zapis.text
    assert zapis.json()["out_of_service"] == [odbior] and zapis.json()["switch_states"] == {}
    model_przed = _model(client, case_id)
    bazowy = _rozplyw(client, case_id)
    ze_scenariuszem = _rozplyw(client, case_id, zapis.json()["scenario_id"])
    assert _model(client, case_id) == model_przed
    assert ze_scenariuszem != bazowy
    lista = client.get(_adres(case_id)).json()
    assert [w["scenario_id"] for w in lista["scenariusze"]] == [zapis.json()["scenario_id"]]

    operacja = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {
                "name": "delete_element",
                "idempotency_key": "gpz-h5-wylaczenie",
                "payload": {"element_ref": odbior},
            },
        },
    )
    assert operacja.status_code == 200, operacja.text
    assert operacja.json().get("error") is None, operacja.json().get("error")
    po = _rozplyw(client, case_id)
    wynik_bez = {e["element_ref"]: e for e in po["elementy"] if e["element_ref"] != odbior}
    wynik_sc = {
        e["element_ref"]: e for e in ze_scenariuszem["elementy"] if e["element_ref"] != odbior
    }
    assert wynik_bez == wynik_sc


def test_kolejnosc_wylaczen_nie_zmienia_odcisku_a_rewizja_je_zachowuje(
    client: TestClient,
) -> None:
    siec = z_odbiorami(promieniowa())
    case_id = _przypadek_z_siecia(client, siec)
    odbiory = _odbiory(siec)
    assert len(odbiory) >= 2
    pierwszy = client.post(
        _adres(case_id), json={"name": "A", "out_of_service": list(reversed(odbiory[:2]))}
    )
    drugi = client.post(_adres(case_id), json={"name": "A", "out_of_service": odbiory[:2]})
    assert pierwszy.status_code == drugi.status_code == 201
    assert pierwszy.json()["out_of_service"] == odbiory[:2]
    assert pierwszy.json()["hash"] == drugi.json()["hash"]
    rewizja = client.post(
        _adres(case_id),
        json={
            "scenario_id": pierwszy.json()["scenario_id"],
            "name": "A + łącznik",
            "switch_states": {siec.cel: "open"},
        },
    )
    assert rewizja.status_code == 201, rewizja.text
    assert rewizja.json()["revision"] == 2
    assert rewizja.json()["out_of_service"] == odbiory[:2], "rewizja zgubiła wyłączenia"
    czyszczenie = client.post(
        _adres(case_id),
        json={"scenario_id": pierwszy.json()["scenario_id"], "name": "A", "out_of_service": []},
    )
    assert czyszczenie.status_code == 201, czyszczenie.text
    assert czyszczenie.json()["out_of_service"] == []
    assert czyszczenie.json()["switch_states"] == {siec.cel: "open"}


@pytest.mark.parametrize(
    ("zadanie", "pole", "fraza"),
    [
        ({"out_of_service": ["brak-elementu"]}, "out_of_service.brak-elementu", "brak elementu"),
        ({"out_of_service": ["SZYNA"]}, "out_of_service.SZYNA", "brak elementu"),
        ({"out_of_service": ["ODB", "ODB"]}, "out_of_service.ODB", "więcej niż raz"),
        ({}, "switch_states", "nie zmienia stanu sieci"),
        ({"switch_states": {}, "out_of_service": []}, "switch_states", "nie zmienia stanu"),
        (
            {"switch_states": {"CEL": "open"}, "out_of_service": ["CEL"]},
            "switch_states.CEL",
            "wyłączony z eksploatacji tym samym scenariuszem",
        ),
    ],
    ids=["spoza-modelu", "szyna", "powtorzenie", "puste", "puste-jawnie", "lacznik-oba"],
)
def test_odmowy_wylaczen(
    client: TestClient, zadanie: dict[str, Any], pole: str, fraza: str
) -> None:
    siec = z_odbiorami(promieniowa())
    case_id = _przypadek_z_siecia(client, siec)
    szyna = sorted(b["ref_id"] for b in siec.enm["buses"])[0]
    podmiany = {"SZYNA": szyna, "ODB": _odbiory(siec)[0], "CEL": siec.cel}

    def _podmien(wartosc: Any) -> Any:
        if isinstance(wartosc, str):
            return podmiany.get(wartosc, wartosc)
        if isinstance(wartosc, list):
            return [_podmien(w) for w in wartosc]
        if isinstance(wartosc, dict):
            return {_podmien(k): v for k, v in wartosc.items()}
        return wartosc

    tresc = {"name": "Zły", **{k: _podmien(v) for k, v in zadanie.items()}}
    odpowiedz = client.post(_adres(case_id), json=tresc)
    assert odpowiedz.status_code == 422, odpowiedz.text
    (blad,) = odpowiedz.json()["detail"]
    oczekiwane_pole = pole
    for zastepczy, ref in podmiany.items():
        oczekiwane_pole = oczekiwane_pole.replace(zastepczy, ref)
    assert blad["pole"] == oczekiwane_pole
    assert blad["komunikat"].startswith("Scenariusz")
    assert fraza in blad["komunikat"]
    assert client.get(_adres(case_id)).json()["count"] == 0


def test_lustro_frontu_zbiorow_scenariusza() -> None:
    """Panel „Scenariusze łączeniowe” oferuje dokładnie te łączniki i kolekcje, które
    backend przyjmuje (`TYPY_LACZNIKOW_ENM`, `KOLEKCJE_WYLACZALNE`) — kontrolka spoza zbioru
    byłaby odrzucona (phantom), a brak elementu odcinałby zdolność backendu."""
    import re
    from pathlib import Path

    from enm.scenariusze import KOLEKCJE_WYLACZALNE
    from enm.topology import TYPY_LACZNIKOW_ENM

    plik = (
        Path(__file__).resolve().parents[3]
        / "frontend/src/ui2/spaces/obliczenia/scenariuszeLaczeniowe/elementyScenariusza.ts"
    )
    tresc = plik.read_text(encoding="utf-8")

    def _tablica(nazwa: str) -> list[str]:
        dopasowanie = re.search(rf"export const {nazwa} = \[(.*?)\] as const;", tresc, re.S)
        assert dopasowanie is not None, nazwa
        return re.findall(r"'([a-z_]+)'", dopasowanie.group(1))

    assert _tablica("TYPY_LACZNIKOW_SCENARIUSZA") == sorted(TYPY_LACZNIKOW_ENM)
    assert _tablica("KOLEKCJE_WYLACZALNE") == list(KOLEKCJE_WYLACZALNE)
