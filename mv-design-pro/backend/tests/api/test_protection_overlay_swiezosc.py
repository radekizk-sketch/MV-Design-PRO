"""Swiezosc nakladek wynikowych — status z POROWNANIA ODCISKOW MODELU (K-S).

DEFEKT ZAMKNIETY. `api/protection_runs.py` meldowal `result_status = "FRESH"`
LITERALEM (komentarz w kodzie: „For now, assume FRESH if run is FINISHED"), a
nakladka biegu kanonicznego oddawala `run.result_status`, czyli pole o wartosci
domyslnej `"VALID"`, ktorej nikt w repo nigdy nie zmienial — w slowniku, ktorego
konsument nie zna. Wynik policzony przed edycja modelu prezentowal sie wiec jak
wynik aktualny w KAZDEJ nakladce.

TESTY SA ILOCZYNEM CECH, nie przykladem z karty:
  {bieg zakonczony z wynikiem, bieg bez wyniku} x {model niezmieniony, model
  zmieniony po biegu} — 4 kombinacje, kazda z asercja statusu,
  + bieg zapisany BEZ odcisku (dane sprzed K-S) — nie wolno mu udawac aktualnego,
  + kotwica wejscia (bieg zwarciowy) rozbiezna przy zgodnej kotwicy przypadku,
  + ta sama para {niezmieniony, zmieniony} dla nakladki biegu kanonicznego
    (dwie koncowki: `/analysis-runs/{id}/overlay` i `/projects/../sld/../overlay`).

SCIEZKA NATYWNA. Model zmieniamy JEDYNA produkcyjna droga zmiany modelu —
`POST /api/cases/{case_id}/enm/domain-ops` — a nie podmiana pola w magazynie:
inaczej test przeszedlby tez wtedy, gdyby realna operacja projektanta nie
przelozyla sie na odcisk modelu.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

pytest.importorskip("fastapi")

from application.result_freshness import (  # noqa: E402
    REASON_TEXTS_PL,
    FreshnessReason,
    ResultFreshness,
    evaluate_result_freshness,
)

from tests.test_execution_api import _seed_valid_enm  # noqa: E402

SZABLON_NASTAW = "template_ref_oc_100"

# Operacja kanoniczna zmieniajaca model PO policzeniu wyniku (droga projektanta).
DOLOZENIE_ODCINKA = {
    "operation": {
        "name": "continue_trunk_segment_sn",
        "payload": {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 500,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            }
        },
    }
}


def _projekt_i_przypadek(app_client) -> tuple[str, str]:
    project = app_client.post("/api/projects", json={"name": "Projekt nakladki zabezpieczen"})
    assert project.status_code == 201
    project_id = project.json()["id"]

    case = app_client.post(
        "/api/study-cases",
        json={"project_id": project_id, "name": "Przypadek nakladki", "set_active": True},
    )
    assert case.status_code == 201
    case_id = str(case.json()["id"])

    _seed_valid_enm(case_id)

    config = app_client.put(
        f"/api/study-cases/{case_id}/protection-config",
        json={"template_ref": SZABLON_NASTAW},
    )
    assert config.status_code == 200, config.text
    return project_id, case_id


def _bieg_zwarciowy(app_client, case_id: str) -> str:
    utworzenie = app_client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )
    assert utworzenie.status_code == 201, utworzenie.text
    run_id = utworzenie.json()["id"]

    wykonanie = app_client.post(f"/api/execution/runs/{run_id}/execute")
    assert wykonanie.status_code == 200, wykonanie.text
    assert wykonanie.json()["status"] == "DONE"
    return str(run_id)


def _bieg_zabezpieczen(app_client, project_id: str, case_id: str, sc_run_id: str) -> str:
    utworzenie = app_client.post(
        f"/api/projects/{project_id}/protection-runs",
        json={"sc_run_id": sc_run_id, "protection_case_id": case_id},
    )
    assert utworzenie.status_code == 201, utworzenie.text
    return str(utworzenie.json()["id"])


def _wykonaj_bieg_zabezpieczen(app_client, run_id: str) -> dict[str, Any]:
    wykonanie = app_client.post(f"/api/protection-runs/{run_id}/execute")
    assert wykonanie.status_code == 200, wykonanie.text
    payload = wykonanie.json()
    assert payload["status"] == "FINISHED", payload
    return payload


def _nakladka_zabezpieczen(app_client, project_id: str, run_id: str) -> dict[str, Any]:
    odpowiedz = app_client.get(
        f"/api/projects/{project_id}/sld/{uuid4()}/protection-overlay",
        params={"run_id": run_id},
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    return odpowiedz.json()


def _zmien_model(app_client, case_id: str) -> None:
    zmiana = app_client.post(f"/api/cases/{case_id}/enm/domain-ops", json=DOLOZENIE_ODCINKA)
    assert zmiana.status_code == 200, zmiana.text
    assert not zmiana.json().get("error"), zmiana.text


# =============================================================================
# ILOCZYN CECH: {bieg zakonczony, bieg bez wyniku} x {model niezmieniony, zmieniony}
# =============================================================================


def test_bieg_zakonczony_model_niezmieniony_daje_fresh(app_client) -> None:
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)
    _wykonaj_bieg_zabezpieczen(app_client, run_id)

    nakladka = _nakladka_zabezpieczen(app_client, project_id, run_id)

    assert nakladka["result_status"] == "FRESH"
    assert nakladka["result_status_reason"] == FreshnessReason.MODEL_NIEZMIENIONY.value
    assert nakladka["result_status_reason_pl"]
    assert nakladka["elements"], "zakonczony bieg musi oddac elementy nakladki"


def test_bieg_zakonczony_model_zmieniony_daje_outdated(app_client) -> None:
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)
    _wykonaj_bieg_zabezpieczen(app_client, run_id)
    assert _nakladka_zabezpieczen(app_client, project_id, run_id)["result_status"] == "FRESH"

    _zmien_model(app_client, case_id)

    nakladka = _nakladka_zabezpieczen(app_client, project_id, run_id)
    assert nakladka["result_status"] == "OUTDATED"
    assert nakladka["result_status_reason"] == FreshnessReason.MODEL_ZMIENIONY.value
    # Elementy zostaja — nakladka ma czym narysowac STARY stan, a status mowi,
    # ze to stan sprzed zmiany (ukrycie danych bylo by druga decyzja produktowa).
    assert nakladka["elements"]


def test_bieg_bez_wyniku_model_niezmieniony_daje_none(app_client) -> None:
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)

    nakladka = _nakladka_zabezpieczen(app_client, project_id, run_id)

    assert nakladka["result_status"] == "NONE"
    assert nakladka["result_status_reason"] == FreshnessReason.BRAK_WYNIKU.value
    assert nakladka["elements"] == []


def test_bieg_bez_wyniku_model_zmieniony_dalej_daje_none(app_client) -> None:
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)

    _zmien_model(app_client, case_id)

    nakladka = _nakladka_zabezpieczen(app_client, project_id, run_id)
    assert nakladka["result_status"] == "NONE"
    assert nakladka["result_status_reason"] == FreshnessReason.BRAK_WYNIKU.value
    assert nakladka["elements"] == []


# =============================================================================
# DANE SPRZED NAPRAWY I NIEZGODNOSC PROJEKTU
# =============================================================================


# CV-3.3-B: `test_stary_bieg_bez_odcisku_nie_udaje_aktualnego` usunięty —
# testował ROĘCZNĄ mutację zapisu R3 `study_results` (usuwał klucze kotwic z
# payloadu wynikowego), symulując bieg zapisany PRZED wprowadzeniem odcisku.
# Bieg zabezpieczeń jest odtąd `CanonicalRun` (R1): `create_run` BUDUJE kopertę
# BEZWARUNKOWO dla KAŻDEGO biegu (patrz `enm.canonical_analysis.create_run`),
# więc `envelope=None` (jedyny sposób na `BRAK_ODCISKU_W_BIEGU` w
# `evaluate_envelope_freshness`) nie jest już produkowalny przez żywe API —
# tylko przez bieg zapisany, zanim ten mechanizm istniał w bazie (dane
# historyczne, nie coś, co da się zainscenizować przez wywołanie endpointu).
# Gwarancja "kotwica nieznana = OUTDATED/BRAK_ODCISKU_W_BIEGU, nigdy fałszywe
# FRESH" ma NIEZALEŻNE pokrycie funkcją czystą, niżej w tym samym pliku:
# `test_kotwica_nieznana_jest_pomijana_a_nie_liczona_jako_zgodna`.


def test_nakladka_odrzuca_bieg_z_innego_projektu(app_client) -> None:
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)

    odpowiedz = app_client.get(
        f"/api/projects/{uuid4()}/sld/{uuid4()}/protection-overlay",
        params={"run_id": run_id},
    )
    assert odpowiedz.status_code == 400


# =============================================================================
# ILOCZYN CECH (CV-3.3-B): WLASNA koperta x koperta BIEGU ZRODLOWEGO (SC)
# =============================================================================


def test_bieg_wlasny_swiezy_ale_zrodlo_zwarciowe_nieaktualne_daje_outdated(app_client) -> None:
    """`biegi_zrodlowe` (`application/result_freshness.py`): bieg zabezpieczen
    utworzony PO zmianie modelu ma WLASNA koperte swieza, ale odwoluje sie do
    biegu zwarciowego policzonego PRZED ta zmiana — jego koperta juz
    nieaktualna. Ocena interpretuje prad zwarciowy sprzed zmiany modelu, wiec
    werdykt MUSI byc OUTDATED mimo swiezej wlasnej koperty (pierwszenstwo
    FRESH-wlasny nie wystarcza — to jest dokladnie przypadek, dla ktorego
    `biegi_zrodlowe` powstalo)."""
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)

    _zmien_model(app_client, case_id)

    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)
    _wykonaj_bieg_zabezpieczen(app_client, run_id)

    nakladka = _nakladka_zabezpieczen(app_client, project_id, run_id)
    assert nakladka["result_status"] == "OUTDATED"
    assert nakladka["result_status_reason"] == FreshnessReason.ZRODLO_NIEAKTUALNE.value
    assert nakladka["result_status_reason_pl"]
    # Elementy zostaja — nakladka ma czym narysowac ocene, status mowi, ze
    # zrodlowy prad zwarciowy jest sprzed zmiany.
    assert nakladka["elements"]


def test_bieg_wlasny_i_zrodlo_oba_swieze_daje_fresh(app_client) -> None:
    """Regresja pary: brak zmiany modelu miedzy zwarciem a zabezpieczeniami ->
    obie koperty swieze -> FRESH (nie kazde `biegi_zrodlowe` daje OUTDATED)."""
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)
    _wykonaj_bieg_zabezpieczen(app_client, run_id)

    nakladka = _nakladka_zabezpieczen(app_client, project_id, run_id)
    assert nakladka["result_status"] == "FRESH"
    assert nakladka["result_status_reason"] == FreshnessReason.MODEL_NIEZMIENIONY.value


# =============================================================================
# WALIDACJA PRZY TWORZENIU: ZRODLO Z INNEGO PROJEKTU (naprawione przy okazji)
# =============================================================================


def test_tworzenie_biegu_zabezpieczen_odrzuca_zrodlo_z_innego_projektu(app_client) -> None:
    """FAB-E naprawiony przy okazji (`_validate_protection_sc_reference`,
    `enm/canonical_analysis.py`): (usuniety) `ProtectionAnalysisService`
    sprawdzal WYLACZNIE `case.project_id == project_id` z URL — bieg
    zwarciowy INNEGO projektu przechodzil jako zrodlo oceny. Walidacja PRZY
    TWORZENIU (nie dopiero przy wykonaniu) porownuje projekt biegu
    zrodlowego z projektem zadania."""
    project_a, case_a = _projekt_i_przypadek(app_client)
    project_b, case_b = _projekt_i_przypadek(app_client)

    sc_run_obcy = _bieg_zwarciowy(app_client, case_b)

    utworzenie = app_client.post(
        f"/api/projects/{project_a}/protection-runs",
        json={"sc_run_id": sc_run_obcy, "protection_case_id": case_a},
    )
    assert utworzenie.status_code == 400, utworzenie.text
    assert "innego projektu" in utworzenie.json()["detail"]


# =============================================================================
# NAKLADKA BIEGU KANONICZNEGO — TA SAMA KLASA, DWIE KONCOWKI
# =============================================================================


def _diagram(uow_factory, project_id: str) -> str:
    with uow_factory() as uow:
        diagram_id = uow.sld.save(
            project_id=UUID(project_id),
            name="Schemat testowy",
            payload={"nodes": [], "branches": []},
        )
    return str(diagram_id)


def test_nakladka_biegu_kanonicznego_ma_status_z_porownania(app_client, uow_factory) -> None:
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    diagram_id = _diagram(uow_factory, project_id)

    przed = app_client.get(f"/api/analysis-runs/{sc_run_id}/overlay?diagram_id={diagram_id}")
    assert przed.status_code == 200, przed.text
    assert przed.json()["result_status"] == "FRESH"
    assert przed.json()["result_status_reason"] == FreshnessReason.MODEL_NIEZMIENIONY.value

    sld_przed = app_client.get(
        f"/api/projects/{project_id}/sld/{diagram_id}/overlay",
        params={"run_id": sc_run_id},
    )
    assert sld_przed.status_code == 200, sld_przed.text
    assert sld_przed.json()["result_status"] == "FRESH"

    _zmien_model(app_client, case_id)

    po = app_client.get(f"/api/analysis-runs/{sc_run_id}/overlay?diagram_id={diagram_id}")
    assert po.status_code == 200
    assert po.json()["result_status"] == "OUTDATED"
    assert po.json()["result_status_reason"] == FreshnessReason.MODEL_ZMIENIONY.value

    sld_po = app_client.get(
        f"/api/projects/{project_id}/sld/{diagram_id}/overlay",
        params={"run_id": sc_run_id},
    )
    assert sld_po.status_code == 200
    assert sld_po.json()["result_status"] == "OUTDATED"


# =============================================================================
# REGULA SWIEZOSCI — FUNKCJA CZYSTA (pelna tabela prawdy)
# =============================================================================


def test_brak_wyniku_dominuje_nad_stanem_modelu() -> None:
    for kotwice, biezacy in (
        ((None,), None),
        (("a",), "a"),
        (("a",), "b"),
    ):
        werdykt = evaluate_result_freshness(
            has_result=False, run_model_hashes=kotwice, current_hash=biezacy
        )
        assert werdykt.status is ResultFreshness.NONE
        assert werdykt.reason is FreshnessReason.BRAK_WYNIKU


def test_brak_modelu_biezacego_nie_daje_aktualnosci() -> None:
    werdykt = evaluate_result_freshness(has_result=True, run_model_hashes=("a",), current_hash=None)
    assert werdykt.status is ResultFreshness.OUTDATED
    assert werdykt.reason is FreshnessReason.BRAK_MODELU_BIEZACEGO


def test_kotwica_wejscia_rozbiezna_przy_zgodnej_kotwicy_przypadku() -> None:
    """Bieg utworzony PO zmianie modelu: przypadek zgodny, wejscie zwarciowe stare.

    Ta kombinacja jest powodem, dla ktorego kotwica jest ZBIOREM, a nie jedna
    wartoscia — pojedyncza kotwica przypadku zameldowalaby tu aktualnosc, mimo
    ze wynik zabezpieczen interpretuje zwarcia policzone na starym modelu.
    """
    werdykt = evaluate_result_freshness(
        has_result=True,
        run_model_hashes=("biezacy", "stary"),
        current_hash="biezacy",
    )
    assert werdykt.status is ResultFreshness.OUTDATED
    assert werdykt.reason is FreshnessReason.MODEL_ZMIENIONY


def test_kotwica_nieznana_jest_pomijana_a_nie_liczona_jako_zgodna() -> None:
    zgodna = evaluate_result_freshness(
        has_result=True, run_model_hashes=("biezacy", None), current_hash="biezacy"
    )
    assert zgodna.status is ResultFreshness.FRESH

    bez_kotwic = evaluate_result_freshness(
        has_result=True, run_model_hashes=(None, None), current_hash="biezacy"
    )
    assert bez_kotwic.status is ResultFreshness.OUTDATED
    assert bez_kotwic.reason is FreshnessReason.BRAK_ODCISKU_W_BIEGU


def test_kazdy_kod_przyczyny_ma_zdanie_pl() -> None:
    """Deklaracja bez testu = falszywa pewnosc: kazdy kod ma tekst dla czlowieka."""
    for kod in FreshnessReason:
        assert REASON_TEXTS_PL[kod].strip()
