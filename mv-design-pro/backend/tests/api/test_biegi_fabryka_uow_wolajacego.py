"""Biegi czytające bazę dostają fabrykę `UnitOfWork` WOŁAJĄCEGO (CV-4.2b) — bez zapasu.

Klasa: wykonawca biegu NIE buduje własnego silnika/sesji z `DATABASE_URL`
(`_uow_factory_biezacy` skasowany). Dwa wejścia wykonania, które do tej karty
NIE podawały fabryki (`POST /api/execution/runs/{id}/execute` — ogólne, oraz
`run_*_now` wołane BEZPOŚREDNIO), teraz ją podają; a bieg zabezpieczeń wołany BEZ
fabryki kończy się FAILED z jawnym powodem, nie odczytem z innej bazy.

Iloczyn cech: {końcówka ogólna, wywołanie bezpośrednie bez fabryki} ×
{zabezpieczenia z modelu (sieć złota G08)} × {bieg SC źródłowy z opcjami audytu 2, bez nich} — rozpływ/zwarcie z parą audytu 2
przez końcówkę ogólną pokrywa `test_solver_input_audit2_integration.py`.

Karta CV-4.3-A4 (K5.1, 2026-09-06): trzeci test tego pliku (`run_short_circuit`/
`run_power_flow` w `api/enm.py` forwardują `uow_factory` do `run_*_now`) usunięty
RAZEM z trasami, które testował — obie skasowane procedurą siedmiu kroków (0
konsumentów produkcyjnych). Własność „tor wykonania forwarduje fabrykę
wołającego" dla PF/SC jest dowiedziona SILNIEJ przez `test_solver_input_
audit2_integration.py` (round-trip przez `execution/study-cases/.../runs` +
`execution/runs/{id}/execute` z rzeczywistą konfiguracją audytu 2 w bazie —
bieg bez poprawnie podanej fabryki zwróciłby FAILED albo config `None`, nie
tylko `is`-identyczność obiektu), a dla zabezpieczeń przez test pierwszy poniżej.
`run_short_circuit_now`/`run_power_flow_now` same w sobie zostają w
`enm/canonical_analysis.py` — mają innych wołających bezpośrednich (silnik,
`tests/e2e/test_nn_full_chain.py`) niezależnych od skasowanej trasy HTTP.
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


def test_koncowka_ogolna_wykonuje_bieg_zabezpieczen_fabryka_zadania(app_client) -> None:
    """`POST /api/execution/runs/{id}/execute` dla biegu zabezpieczeń = DONE.

    Do CV-4.2b końcówka ogólna wołała `execute_run(run_id)` BEZ fabryki, więc bieg
    zabezpieczeń czytał przypadek własnym silnikiem z `DATABASE_URL` (inna baza niż
    `app.state.uow_factory` testu) — przypadek „nie istniał". Teraz fabryka żądania
    idzie w dół (rozpływ zwarciowy biegu źródłowego czytany z bazy żądania).
    """
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)

    wykonanie = app_client.post(f"/api/execution/runs/{run_id}/execute")

    assert wykonanie.status_code == 200, wykonanie.text
    assert wykonanie.json()["status"] == "DONE", wykonanie.json()


def _bieg_zwarciowy_z_audytem2(app_client, case_id: str, project_id: str) -> str:
    """Bieg SC_3F z opcjami audytu 2 — rozpływ punktu na żądanie czyta konfigurację z bazy."""
    utworzenie = app_client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={
            "analysis_type": "SC_3F",
            "solver_input": {"audit2_project_id": project_id, "audit2_station_id": "stacja-bez"},
        },
    )
    assert utworzenie.status_code == 201, utworzenie.text
    run_id = utworzenie.json()["id"]
    wykonanie = app_client.post(f"/api/execution/runs/{run_id}/execute")
    assert wykonanie.status_code == 200, wykonanie.text
    assert wykonanie.json()["status"] == "DONE", wykonanie.json()
    return str(run_id)


def test_bieg_zabezpieczen_bez_fabryki_odmawia_jawnie_zamiast_czytac_inna_baze(
    app_client,
) -> None:
    """`execute_run(run_id)` bez fabryki = FAILED z powodem (zero zapasu z `DATABASE_URL`).

    Karta BIEG-ZABEZPIECZEN-Z-MODELU: bieg zabezpieczeń nie czyta już przypadku z bazy
    (urządzenia i nastawy z migawki modelu), więc bazy dotyka WYŁĄCZNIE rozpływ prądu
    zwarciowego punktu liczony na żądanie dla biegu SC z opcjami audytu 2 — i dokładnie tam
    brak fabryki wołającego musi dać jawną odmowę, nie odczyt z innej bazy."""
    from enm.canonical_analysis import execute_run, get_run

    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy_z_audytem2(app_client, case_id, project_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)

    wynik = execute_run(UUID(run_id))

    assert wynik.status == "FAILED"
    assert "nie dostał fabryki UnitOfWork" in (wynik.error_message or "")
    zapisany = get_run(UUID(run_id))
    assert zapisany is not None and zapisany.status == "FAILED"


def test_bieg_zabezpieczen_bez_audytu2_nie_dotyka_bazy(app_client) -> None:
    """Para do testu wyżej: bieg SC bez opcji audytu 2 — ocena zabezpieczeń nie potrzebuje
    bazy (model z migawki, rozpływ z wejścia biegu), więc kończy się także bez fabryki."""
    from enm.canonical_analysis import execute_run

    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)

    assert execute_run(UUID(run_id)).status == "FINISHED"
