"""Bieg oceny zabezpieczeń niesie ocenę ziemnozwarciową i uziemienia stacji — ścieżka HTTP
projektanta (karta EWALUATORY-ZIEMNOZWARCIOWE).

ŁAŃCUCH. Model sceny zwarć doziemnych zbudowany operacjami domenowymi → bieg zwarciowy
``SC_3F`` → bieg oceny zabezpieczeń ``POST /api/projects/{p}/protection-runs`` → odczyt
``GET /api/protection-runs/{id}/results`` (pole ``ziemnozwarciowe``) i śladu
``GET /api/protection-runs/{id}/trace`` (kroki sieci zerowej, solvera i uziemień).

ILOCZYN CECH: sposób pracy punktu neutralnego {izolowany, kompensowany, kompensowany z AWSC,
rezystor} × odczyt {wynik, ślad}. Wszystkie liczby pochodzą z solvera doziemień — test
sprawdza, że bieg je przenosi bez zmian (równość z bezpośrednim wywołaniem ewaluatora na tej
samej migawce) i że każdy rekord ma wyjaśnienie (werdykt wyjaśnialny).
"""

from __future__ import annotations

from typing import Any

import pytest

pytest.importorskip("fastapi")

from enm.models import EnergyNetworkModel  # noqa: E402
from enm.store import set_enm  # noqa: E402

from tests.reference_networks.scena_doziemienia import (  # noqa: E402
    SPOSOBY_PRACY,
    SposobPracy,
    scena_z_nastawami,
)
from tests.test_execution_api import _klucz_modelu  # noqa: E402
from tests.utils.biegi import wykonaj_bieg, wykonaj_bieg_zabezpieczen  # noqa: E402


def _bieg(
    app_client: Any, sposob: SposobPracy, wymagania_eaz: dict[str, float] | None = None
) -> tuple[str, EnergyNetworkModel]:
    projekt = app_client.post("/api/projects", json={"name": f"Doziemienie {sposob}"})
    assert projekt.status_code == 201
    project_id = projekt.json()["id"]
    przypadek = app_client.post(
        "/api/study-cases",
        json={"project_id": project_id, "name": "Przypadek doziemienia", "set_active": True},
    )
    assert przypadek.status_code == 201
    case_id = str(przypadek.json()["id"])
    if wymagania_eaz is not None:
        # Ścieżka projektanta (edytor wymagań ekranu E-28): PATCH tylko pola wymagań.
        zmiana = app_client.patch(
            f"/api/study-cases/{case_id}", json={"config": {"wymagania_eaz": wymagania_eaz}}
        )
        assert zmiana.status_code == 200, zmiana.text
        assert zmiana.json()["config"] == {
            **przypadek.json()["config"],
            "wymagania_eaz": wymagania_eaz,
        }
    model = EnergyNetworkModel.model_validate(scena_z_nastawami(sposob))
    set_enm(_klucz_modelu(case_id), model)
    sc = app_client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )
    assert sc.status_code == 201, sc.text
    wykonanie = wykonaj_bieg(app_client, sc.json()["id"])
    assert wykonanie.json()["status"] == "DONE", wykonanie.text
    ochrona = app_client.post(
        f"/api/projects/{project_id}/protection-runs",
        json={"sc_run_id": str(sc.json()["id"]), "protection_case_id": case_id},
    )
    assert ochrona.status_code == 201, ochrona.text
    run_id = str(ochrona.json()["id"])
    wykonanie = wykonaj_bieg_zabezpieczen(app_client, run_id)
    assert wykonanie.json()["status"] == "FINISHED", wykonanie.json()
    return run_id, model


@pytest.mark.parametrize("sposob", SPOSOBY_PRACY)
def test_bieg_niesie_ocene_ziemnozwarciowa_i_uziemienia(app_client: Any, sposob: SposobPracy):
    from application.analyses.protection.ocena_ziemnozwarciowa import (
        ocen_zabezpieczenia_ziemnozwarciowe,
    )
    from enm.mapping import map_enm_to_network_graph

    run_id, model = _bieg(app_client, sposob)
    wynik = app_client.get(f"/api/protection-runs/{run_id}/results")
    assert wynik.status_code == 200, wynik.text
    ziemne = wynik.json()["ziemnozwarciowe"]
    assert ziemne is not None

    # Ten sam wynik co bezpośrednie wywołanie ewaluatora na tej samej migawce (jedna ścieżka).
    oczekiwane = ocen_zabezpieczenia_ziemnozwarciowe(
        model, map_enm_to_network_graph(model), odniesienie="—"
    ).to_dict()
    assert ziemne["doziemienie"]["punkty"] == oczekiwane["doziemienie"]["punkty"]
    assert ziemne["wyniki_uziemien"] == oczekiwane["wyniki_uziemien"]

    def klucz(r: dict[str, Any]) -> tuple[Any, ...]:
        return (r["urzadzenie_ref"], r["kod"], r["kryterium"], r.get("punkt_ref"))

    assert sorted(map(klucz, ziemne["oceny"])) == sorted(map(klucz, oczekiwane["oceny"]))

    kody = {r["kod"] for r in ziemne["oceny"]}
    assert {"51N", "67N"} <= kody
    # Każdy rekord niesie wyjaśnienie (werdykt wyjaśnialny), nigdy goły status.
    for rekord in [*ziemne["oceny"], *ziemne["odmowy"], *ziemne["uziemienia"]]:
        assert rekord["status"]
        assert rekord["zdanie_pl"].strip()
        assert rekord["ocena"]["wyjasnienie"]["zdanie_pl"].strip()
    # Uziemienie GPZ: prąd uziomowy z solvera, limit U_Tp bez podstawy w repo → BRAK_PODSTAWY.
    # Napięcie krokowe i napięcie dotykowe spodziewane U_T (≠ napięcie uziomowe U_E) wymagają
    # geometrii uziomu — NIE_OCENIONO bez liczby (karta EKRANY-EAZ-ZIEMNOZWARCIOWE, korekta 6).
    bez_geometrii = {"NAPIECIE_KROKOWE", "NAPIECIE_DOTYKOWE"}
    uziemienia = [r for r in ziemne["uziemienia"] if r["kryterium"] not in bez_geometrii]
    assert uziemienia
    assert {r["status"] for r in uziemienia} == {"BRAK_PODSTAWY"}
    assert all(r["prad_uziomowy_a"] > 0 for r in uziemienia)
    krokowe = [r for r in ziemne["uziemienia"] if r["kryterium"] == "NAPIECIE_KROKOWE"]
    assert krokowe and {r["status"] for r in krokowe} == {"NIE_OCENIONO"}
    dotykowe = [r for r in ziemne["uziemienia"] if r["kryterium"] == "NAPIECIE_DOTYKOWE"]
    assert dotykowe and {r["status"] for r in dotykowe} == {"NIE_OCENIONO"}
    assert all(r["ocena"]["wynik"] is None for r in dotykowe)

    slad = app_client.get(f"/api/protection-runs/{run_id}/trace")
    assert slad.status_code == 200, slad.text
    kroki = [k["step"] for k in slad.json()["steps"]]
    assert "siec_zerowa_z_modelu" in kroki
    assert "zwarcie_doziemne_c_min" in kroki and "zwarcie_doziemne_c_max" in kroki
    assert "uziemienie_stacji" in kroki


@pytest.mark.parametrize("wymagania", [None, {"k_b": 1.5, "k_c": 2.5}])
def test_wymagania_przypadku_trafiaja_do_biegu_jako_wartosc_projektanta(
    app_client: Any, wymagania: dict[str, float] | None
):
    """Wymagania EAZ z konfiguracji przypadku × {brak, k_b i k_c projektanta}: bieg oceny niesie
    je w wierszach ze stanem „wartość projektanta”; bez nich — wartości i stany tabeli źródeł.
    Tabela źródeł wyniku bez zmian w obu wariantach (nadpisanie nie udaje ENEA)."""
    run_id, _ = _bieg(app_client, "IZOLOWANY", wymagania)
    ziemne = app_client.get(f"/api/protection-runs/{run_id}/results").json()["ziemnozwarciowe"]
    wiersze = [w for w in ziemne["wiersze"] if w["kod"] in ("51N", "67N")]
    assert wiersze
    for w in wiersze:
        k_b, k_c = w["wymagania"]["k_b"], w["wymagania"]["k_c"]
        if wymagania is None:
            assert (k_b["wartosc"], k_b["stan"]) == (1.2, "ZALOZENIE_INZYNIERSKIE")
            assert (k_c["wartosc"], k_c["stan"]) == (1.5, "ENEA_ZWERYFIKOWANE")
        else:
            assert (k_b["wartosc"], k_b["stan"]) == (1.5, "WARTOSC_PROJEKTANTA")
            assert (k_c["wartosc"], k_c["stan"]) == (2.5, "WARTOSC_PROJEKTANTA")
            assert "ENEA" not in k_c["zrodlo_pl"]
        # k_c,opor nie nadpisane — zostaje ENEA (ppkt 2).
        assert w["wymagania"]["k_c_opor"]["stan"] == "ENEA_ZWERYFIKOWANE"
    stany = {z["klucz"]: z["stan"] for z in ziemne["zrodla_wymagan"]}
    assert stany["k_b"] == "ZALOZENIE_INZYNIERSKIE" and stany["k_c.zerowopradowe"] == (
        "ENEA_ZWERYFIKOWANE"
    )


def test_wymaganie_spoza_listy_odrzucone(app_client: Any):
    projekt = app_client.post("/api/projects", json={"name": "Wymagania błędne"}).json()
    przypadek = app_client.post(
        "/api/study-cases", json={"project_id": projekt["id"], "name": "P", "set_active": True}
    ).json()
    for zle in ({"k_x": 1.5}, {"k_b": -1.0}, {"k_c": 0}):
        odp = app_client.patch(
            f"/api/study-cases/{przypadek['id']}",
            json={"config": {**przypadek["config"], "wymagania_eaz": zle}},
        )
        assert odp.status_code in (400, 422), (zle, odp.status_code, odp.text)
    # Odmowa nie zostawia skutku: konfiguracja przypadku bez zmian.
    stan = app_client.get(f"/api/study-cases/{przypadek['id']}").json()
    assert stan["config"] == przypadek["config"]


def test_patch_konfiguracji_zachowuje_pominiete_pola(app_client: Any):
    """PATCH części konfiguracji × {pole proste, wymagania EAZ, ponowne wyczyszczenie}: pola
    pominięte zostają (dawniej wracały do wartości domyślnych)."""
    projekt = app_client.post("/api/projects", json={"name": "PATCH częściowy"}).json()
    przypadek = app_client.post(
        "/api/study-cases",
        json={
            "project_id": projekt["id"],
            "name": "P",
            "config": {"base_mva": 50.0, "sc_simplified_sk_mva": 250.0},
        },
    ).json()
    oczekiwana = dict(przypadek["config"])
    for zmiana in ({"max_iterations": 77}, {"wymagania_eaz": {"k_c": 1.8}}, {"wymagania_eaz": {}}):
        odp = app_client.patch(f"/api/study-cases/{przypadek['id']}", json={"config": zmiana})
        assert odp.status_code == 200, odp.text
        oczekiwana.update(zmiana)
        assert odp.json()["config"] == oczekiwana
    assert oczekiwana["base_mva"] == 50.0 and oczekiwana["sc_simplified_sk_mva"] == 250.0
