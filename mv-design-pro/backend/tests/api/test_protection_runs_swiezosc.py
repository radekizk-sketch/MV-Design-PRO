"""Świeżość wyniku oceny zabezpieczeń — status z PORÓWNANIA ODCISKÓW (K-S, karta
BIEG-ZABEZPIECZEN-Z-MODELU).

DEFEKT ZAMKNIĘTY (K-S). `api/protection_runs.py` meldował `result_status = "FRESH"` LITERAŁEM.
Nakładka SLD zabezpieczeń (`/projects/../sld/../protection-overlay`) skasowana w karcie
BIEG-ZABEZPIECZEN-Z-MODELU (bez konsumenta) — status świeżości niesie odczyt wyniku
`GET /protection-runs/{id}/results`, który czyta ekran oceny zabezpieczeń (E-28).

DWIE KOTWICE, DWA PREDYKATY (reguła par): koperta biegu oceny wobec PEŁNEGO modelu (nastawy
wchodzą do oceny) i bieg źródłowy wobec SIECI bez zabezpieczeń — tym samym odciskiem, którym
tworzenie biegu sprawdza, czy ocena może czytać rozpływ biegu zwarciowego.

ILOCZYN CECH: {bieg oceny przed zmianą, po zmianie} × {zmiana: brak, nastawy zabezpieczenia,
sieć (odcinek magistrali)} × {bieg bez wyniku}. Sieć = sieć złota G08 (dwa zabezpieczenia
z nastawami zapisanymi operacjami domenowymi) pod kluczem modelu przypadku.

ŚCIEŻKA NATYWNA. Model zmieniamy JEDYNĄ produkcyjną drogą zmiany modelu —
`POST /api/cases/{case_id}/enm/domain-ops` — a nie podmianą pola w magazynie.
"""

from __future__ import annotations

from typing import Any

import pytest

pytest.importorskip("fastapi")

from application.result_freshness import (  # noqa: E402
    REASON_TEXTS_PL,
    FreshnessReason,
    ResultFreshness,
    evaluate_result_freshness,
)
from enm.store import get_enm, set_enm  # noqa: E402

from tests.golden.enm_builders.zabezpieczenia_magistrali import (  # noqa: E402
    NASTAWY_Q2,
    build_zabezpieczenia_magistrali_enm,
)
from tests.test_execution_api import _klucz_modelu  # noqa: E402


def _projekt_i_przypadek(app_client) -> tuple[str, str]:
    project = app_client.post("/api/projects", json={"name": "Projekt oceny zabezpieczeń"})
    assert project.status_code == 201
    project_id = project.json()["id"]
    case = app_client.post(
        "/api/study-cases",
        json={"project_id": project_id, "name": "Przypadek oceny", "set_active": True},
    )
    assert case.status_code == 201
    case_id = str(case.json()["id"])
    set_enm(_klucz_modelu(case_id), build_zabezpieczenia_magistrali_enm())
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


def _wykonaj(app_client, run_id: str) -> None:
    wykonanie = app_client.post(f"/api/protection-runs/{run_id}/execute")
    assert wykonanie.status_code == 200, wykonanie.text
    assert wykonanie.json()["status"] == "FINISHED", wykonanie.json()


def _wynik(app_client, run_id: str) -> dict[str, Any]:
    odpowiedz = app_client.get(f"/api/protection-runs/{run_id}/results")
    assert odpowiedz.status_code == 200, odpowiedz.text
    return odpowiedz.json()


def _operacja(app_client, case_id: str, nazwa: str, payload: dict[str, Any]) -> None:
    zmiana = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": nazwa, "payload": payload}},
    )
    assert zmiana.status_code == 200, zmiana.text
    assert not zmiana.json().get("error"), zmiana.text


def _zmien_nastawy(app_client, case_id: str) -> None:
    """TMS stopnia I> zabezpieczenia Q2 0,1 → 0,2 (w zakresie katalogu) — zmiana NASTAW."""
    model = get_enm(_klucz_modelu(case_id))
    q2 = next(p for p in model.protection_assignments if p.name == "Zabezpieczenie odejścia S01")
    nastawy = [dict(n) for n in NASTAWY_Q2]
    nastawy[0]["time_multiplier"] = 0.2
    _operacja(
        app_client,
        case_id,
        "update_protection_settings",
        {"protection_ref": q2.ref_id, "settings": nastawy},
    )


def _zmien_siec(app_client, case_id: str) -> None:
    """Dłuższy odcinek magistrali (parametr gałęzi) — zmiana SIECI liczonej przez solver."""
    model = get_enm(_klucz_modelu(case_id))
    kabel = next(g.ref_id for g in model.branches if g.type == "cable")
    _operacja(
        app_client,
        case_id,
        "update_element_parameters",
        {"element_ref": kabel, "parameters": {"length_km": 4.0, "parameter_source": "CATALOG"}},
    )


# =============================================================================
# ILOCZYN CECH: {przed zmianą, po zmianie} x {brak, nastawy, sieć}
# =============================================================================


def test_bez_zmiany_wynik_aktualny_z_ocenami(app_client) -> None:
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)
    _wykonaj(app_client, run_id)

    wynik = _wynik(app_client, run_id)
    assert wynik["result_status"] == "FRESH"
    assert wynik["result_status_reason"] == FreshnessReason.MODEL_NIEZMIENIONY.value
    assert wynik["result_status_reason_pl"]
    assert wynik["evaluations"], "ocena urządzeń modelu musi dać wiersze"


@pytest.mark.parametrize("zmiana", [_zmien_nastawy, _zmien_siec], ids=["nastawy", "siec"])
def test_zmiana_po_biegu_oceny_daje_outdated(app_client, zmiana) -> None:
    """Wynik oceny sprzed zmiany (nastaw ALBO sieci) jest nieaktualny — nastawy wchodzą do
    oceny, więc ich zmiana unieważnia wynik tak samo jak zmiana sieci."""
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)
    _wykonaj(app_client, run_id)
    assert _wynik(app_client, run_id)["result_status"] == "FRESH"

    zmiana(app_client, case_id)

    wynik = _wynik(app_client, run_id)
    assert wynik["result_status"] == "OUTDATED"
    assert wynik["result_status_reason"] == FreshnessReason.MODEL_ZMIENIONY.value
    assert wynik["evaluations"]


def test_nowy_bieg_oceny_po_zmianie_nastaw_na_starym_zwarciu_jest_aktualny(app_client) -> None:
    """Zmiana nastaw nie zmienia sieci: nowa ocena na TYM SAMYM biegu zwarciowym jest aktualna
    (bieg źródłowy sprawdzany odciskiem sieci bez zabezpieczeń — ten sam predykat co tworzenie
    biegu). Dawniej pełny odcisk modelu robił z biegu zwarciowego „źródło nieaktualne"."""
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    _zmien_nastawy(app_client, case_id)

    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)
    _wykonaj(app_client, run_id)
    wynik = _wynik(app_client, run_id)
    assert wynik["result_status"] == "FRESH", wynik["result_status_reason_pl"]


def test_nowy_bieg_oceny_po_zmianie_sieci_na_starym_zwarciu_odmowiony(app_client) -> None:
    """Zmiana sieci: bieg zwarciowy opisuje inną sieć — utworzenie oceny na nim jest odmową
    (bramka sieci), nie wynikiem z ostrzeżeniem."""
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    _zmien_siec(app_client, case_id)

    utworzenie = app_client.post(
        f"/api/projects/{project_id}/protection-runs",
        json={"sc_run_id": sc_run_id, "protection_case_id": case_id},
    )
    assert utworzenie.status_code == 400, utworzenie.text
    assert "innej sieci" in utworzenie.json()["detail"]


def test_bieg_bez_wyniku_nie_ma_odczytu_wyniku(app_client) -> None:
    """Bieg utworzony, niewykonany: odczyt wyniku to nazwana odmowa, nie status zastępczy."""
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)
    odpowiedz = app_client.get(f"/api/protection-runs/{run_id}/results")
    assert odpowiedz.status_code == 400
    assert "nie jest zakończony" in odpowiedz.json()["detail"]


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
