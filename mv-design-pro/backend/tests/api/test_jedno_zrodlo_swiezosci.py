"""Jedno źródło świeżości dla nagłówka ekranu analizy i znacznika powłoki (karta
EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN).

Nagłówek ekranu analizy czyta werdykt JEDNEGO biegu (`GET /api/analysis-runs/{id}`), znacznik
powłoki — werdykt przypadku (`GET /api/study-cases/{id}`). Oba pochodzą z tej samej funkcji
(`swiezosc_biegu_kanonicznego`) i niosą ten sam odcisk wejść (`odcisk_wejsc_swiezosci`: model,
katalog, wybór zabezpieczeń przypadku, scenariusze nazwane). Dawne `results_valid` biegu było
stałą prawdą (`result_status == "VALID"`), a nagłówek porównywał wyłącznie rewizję modelu —
zmiana grupy nastaw albo nadpisania nastaw przypadku (rewizja modelu bez zmian) zostawiała
nagłówek „aktualny" przy powłoce „nieaktualne".

Iloczyn cech: zmiana {model, grupa nastaw przypadku, nadpisanie nastaw przypadku, scenariusz
nazwany biegu} × wskaźnik {nagłówek (bieg), powłoka (przypadek), lista biegów przypadku (panel
dolny, pasek stanu, wybór biegu)} × chwila {przed, po zmianie}.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.api import test_przypadek_zabezpieczen_scenariusz_api as _scen
from tests.api.test_przypadek_zabezpieczen_scenariusz_api import (
    _bieg_ze_scenariuszem,
    _model,
    _nastawy_51,
    _sterownik_z_nastawami,
    _zapisz_scenariusz,
    stacja_z_grupa_2,  # noqa: F401 — fikstura
)
from tests.api.test_wybor_zabezpieczen_przypadku_api import _bieg_sc, _zapisz_wybor
from tests.api.test_wytrzymalosc_aparatury_api import _operacja

#: Fikstura klienta API ze wspólnym magazynem i bazą sesji testu wytrzymałości aparatury.
klient = _scen.klient


def _naglowek(klient: TestClient, run_id: str) -> dict[str, Any]:
    odp = klient.get(f"/api/analysis-runs/{run_id}")
    assert odp.status_code == 200, odp.text
    return odp.json()


def _powloka(klient: TestClient, case_id: str) -> dict[str, Any]:
    odp = klient.get(f"/api/study-cases/{case_id}")
    assert odp.status_code == 200, odp.text
    return odp.json()


def _lista_biegow(klient: TestClient, case_id: str, run_id: str) -> dict[str, Any]:
    odp = klient.get(f"/api/execution/study-cases/{case_id}/runs")
    assert odp.status_code == 200, odp.text
    (wpis,) = (w for w in odp.json()["runs"] if w["id"] == run_id)
    return wpis


def _zmien_model(klient: TestClient, s: dict[str, Any]) -> None:
    sterownik, funkcja_ref = _sterownik_z_nastawami(_model(klient, s["case_id"]))
    nastawy = _nastawy_51(sterownik, funkcja_ref)
    _operacja(
        klient,
        s["case_id"],
        "update_protection_settings",
        {
            "protection_ref": sterownik["ref_id"],
            "grupa": sterownik["aktywna_grupa"],
            "nastawy": {funkcja_ref: {**nastawy, "zwloka_s": 0.35}},
        },
    )


def _zmien_grupe(klient: TestClient, s: dict[str, Any]) -> None:
    assert _zapisz_wybor(klient, s["case_id"], protection_groups={s["ref"]: 2}).status_code == 200


def _zmien_nadpisanie(klient: TestClient, s: dict[str, Any]) -> None:
    nadpisanie = {s["ref"]: {s["funkcja_ref"]: {"zwloka_s": 0.7}}}
    odp = _zapisz_wybor(klient, s["case_id"], protection_overrides=nadpisanie)
    assert odp.status_code == 200, odp.text


@pytest.mark.parametrize("zmiana", ["model", "grupa", "nadpisanie", "scenariusz_nazwany"])
def test_naglowek_i_powloka_z_jednego_zrodla_po_kazdej_zmianie(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
    zmiana: str,
) -> None:
    s = stacja_z_grupa_2
    case_id = s["case_id"]
    scenario_id: str | None = None
    if zmiana == "scenariusz_nazwany":
        odp = _zapisz_scenariusz(klient, case_id, protection_groups={s["ref"]: 2})
        assert odp.status_code == 201, odp.text
        scenario_id = str(odp.json()["scenario_id"])
        run_id = _bieg_ze_scenariuszem(klient, case_id, scenario_id)
    else:
        run_id = _bieg_sc(klient, case_id)

    przed_bieg, przed_przypadek = _naglowek(klient, run_id), _powloka(klient, case_id)
    assert przed_bieg["result_freshness"] == przed_przypadek["result_status"] == "FRESH"
    assert przed_bieg["results_valid"] is przed_przypadek["results_valid"] is True
    assert przed_bieg["odcisk_wejsc_swiezosci"] == przed_przypadek["odcisk_wejsc_swiezosci"]
    assert przed_przypadek["odcisk_wejsc_swiezosci"]
    przed_lista = _lista_biegow(klient, case_id, run_id)
    assert przed_lista["result_freshness"] == "FRESH"
    assert przed_lista["odcisk_wejsc_swiezosci"] == przed_przypadek["odcisk_wejsc_swiezosci"]

    if zmiana == "model":
        _zmien_model(klient, s)
    elif zmiana == "grupa":
        _zmien_grupe(klient, s)
    elif zmiana == "nadpisanie":
        _zmien_nadpisanie(klient, s)
    else:
        odp = _zapisz_scenariusz(
            klient,
            case_id,
            scenario_id=scenario_id,
            protection_overrides={s["ref"]: {s["funkcja_ref"]: {"zwloka_s": 0.8}}},
        )
        # Końcówka scenariuszy nazwanych odpowiada 201 także dla nowej rewizji.
        assert odp.status_code == 201, odp.text
        assert odp.json()["revision"] == 2

    po_bieg, po_przypadek = _naglowek(klient, run_id), _powloka(klient, case_id)
    # Odcisk wejść zmienia się przy KAŻDEJ zmianie — także gdy rewizja modelu stoi w miejscu.
    assert po_przypadek["odcisk_wejsc_swiezosci"] != przed_przypadek["odcisk_wejsc_swiezosci"]
    assert po_bieg["odcisk_wejsc_swiezosci"] == po_przypadek["odcisk_wejsc_swiezosci"]
    # Ten sam werdykt i ta sama przyczyna w nagłówku i w powłoce.
    assert po_bieg["result_freshness"] == po_przypadek["result_status"] == "OUTDATED"
    assert po_bieg["results_valid"] is po_przypadek["results_valid"] is False
    assert po_bieg["result_freshness_reason"] == po_przypadek["result_status_reason"]
    assert po_bieg["result_freshness_reason_pl"] == po_przypadek["result_status_reason_pl"]
    po_lista = _lista_biegow(klient, case_id, run_id)
    assert po_lista["result_freshness"] == "OUTDATED"
    assert po_lista["result_freshness_reason"] == po_przypadek["result_status_reason"]
    assert po_lista["result_freshness_reason_pl"] == po_przypadek["result_status_reason_pl"]
    assert po_lista["odcisk_wejsc_swiezosci"] == po_przypadek["odcisk_wejsc_swiezosci"]
    if zmiana != "model":
        assert po_przypadek["rewizja_biezaca"] == przed_przypadek["rewizja_biezaca"]


def test_lista_biegow_projektu_niesie_ten_sam_werdykt_co_bieg(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
) -> None:
    s = stacja_z_grupa_2
    run_id = _bieg_sc(klient, s["case_id"])
    _zmien_grupe(klient, s)
    projekt = _powloka(klient, s["case_id"])["project_id"]
    odp = klient.get(f"/api/projects/{projekt}/analysis-runs")
    assert odp.status_code == 200, odp.text
    (wpis,) = (w for w in odp.json()["items"] if w["id"] == run_id)
    bieg = _naglowek(klient, run_id)
    for pole in (
        "result_freshness",
        "result_freshness_reason",
        "result_freshness_reason_pl",
        "results_valid",
        "odcisk_wejsc_swiezosci",
    ):
        assert wpis[pole] == bieg[pole], pole
    assert wpis["result_freshness"] == "OUTDATED"
