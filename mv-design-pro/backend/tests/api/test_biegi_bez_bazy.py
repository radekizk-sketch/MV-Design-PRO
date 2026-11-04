"""Bieg czyta WYŁĄCZNIE migawkę modelu i opcje — wykonanie nie sięga do bazy.

Karta JEDNA-SCIEZKA-EDYCJI skasowała ostatni odczyt bazy w biegu: zapisaną konfigurację
rozszerzeń stacji obok modelu (rozpływ, zwarcie i rozpływ prądu zwarciowego punktu na
żądanie czytały ją fabryką `UnitOfWork` wołającego). Dane stacji żyją w elementach ENM,
więc fabryka przestała być potrzebna i zniknęła z sygnatur wykonania.

Iloczyn cech: {końcówka ogólna `POST /api/execution/runs/{id}/execute`, wywołanie
bezpośrednie `execute_run`} × {bieg zabezpieczeń na biegu zwarciowym źródłowym (rozpływ
prądu zwarciowego punktu liczony na żądanie)}.
"""

from __future__ import annotations

from uuid import UUID

import pytest

pytest.importorskip("fastapi")

from tests.api.test_protection_runs_swiezosc import (  # noqa: E402
    _bieg_zabezpieczen,
    _bieg_zwarciowy,
    _projekt_i_przypadek,
)
from tests.utils.biegi import wykonaj_bieg  # noqa: E402


def test_koncowka_ogolna_wykonuje_bieg_zabezpieczen(app_client) -> None:
    """`POST /api/execution/runs/{id}/execute` dla biegu zabezpieczeń = DONE."""
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)

    wykonanie = wykonaj_bieg(app_client, run_id)

    assert wykonanie.status_code == 200, wykonanie.text
    assert wykonanie.json()["status"] == "DONE", wykonanie.json()


def test_bieg_zabezpieczen_wolany_wprost_konczy_sie_bez_bazy(app_client) -> None:
    """`execute_run(run_id)` wołany wprost (bez kontekstu żądania) liczy to samo co końcówka:
    ocena zabezpieczeń bierze model z migawki, a rozpływ prądu zwarciowego punktu z wejścia
    biegu źródłowego — żadna część biegu nie potrzebuje bazy."""
    from enm.canonical_analysis import execute_run

    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)

    assert execute_run(UUID(run_id)).status == "FINISHED"
