"""Biegi czytające bazę dostają fabrykę `UnitOfWork` WOŁAJĄCEGO (CV-4.2b) — bez zapasu.

Klasa: wykonawca biegu NIE buduje własnego silnika/sesji z `DATABASE_URL`
(`_uow_factory_biezacy` skasowany). Dwa wejścia wykonania, które do tej karty
NIE podawały fabryki (`POST /api/execution/runs/{id}/execute` — ogólne, oraz
`run_*_now` z `api/enm.py`), teraz ją podają; a bieg zabezpieczeń wołany BEZ
fabryki kończy się FAILED z jawnym powodem, nie odczytem z innej bazy.

Iloczyn cech: {końcówka ogólna, wywołanie bezpośrednie bez fabryki} ×
{zabezpieczenia (konfiguracja przypadku)} — rozpływ/zwarcie z parą audytu 2
przez końcówkę ogólną pokrywa `test_solver_input_audit2_integration.py`.
"""

from __future__ import annotations

from uuid import UUID

import pytest

pytest.importorskip("fastapi")

from tests.api.test_protection_overlay_swiezosc import (  # noqa: E402
    _bieg_zabezpieczen,
    _bieg_zwarciowy,
    _projekt_i_przypadek,
)


def test_koncowka_ogolna_wykonuje_bieg_zabezpieczen_fabryka_zadania(app_client) -> None:
    """`POST /api/execution/runs/{id}/execute` dla biegu zabezpieczeń = DONE.

    Do CV-4.2b końcówka ogólna wołała `execute_run(run_id)` BEZ fabryki, więc bieg
    zabezpieczeń czytał przypadek własnym silnikiem z `DATABASE_URL` (inna baza niż
    `app.state.uow_factory` testu) — przypadek „nie istniał". Teraz fabryka żądania
    idzie w dół i konfiguracja zabezpieczeń jest widoczna.
    """
    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)

    wykonanie = app_client.post(f"/api/execution/runs/{run_id}/execute")

    assert wykonanie.status_code == 200, wykonanie.text
    assert wykonanie.json()["status"] == "DONE", wykonanie.json()


def test_bieg_zabezpieczen_bez_fabryki_odmawia_jawnie_zamiast_czytac_inna_baze(
    app_client,
) -> None:
    """`execute_run(run_id)` bez fabryki = FAILED z powodem (zero zapasu z `DATABASE_URL`)."""
    from enm.canonical_analysis import execute_run, get_run

    project_id, case_id = _projekt_i_przypadek(app_client)
    sc_run_id = _bieg_zwarciowy(app_client, case_id)
    run_id = _bieg_zabezpieczen(app_client, project_id, case_id, sc_run_id)

    wynik = execute_run(UUID(run_id))

    assert wynik.status == "FAILED"
    assert "nie dostal fabryki UnitOfWork" in (wynik.error_message or "")
    zapisany = get_run(UUID(run_id))
    assert zapisany is not None and zapisany.status == "FAILED"


def test_koncowki_enm_przekazuja_fabryke_zadania_do_biegow_natychmiastowych(
    app_client, monkeypatch
) -> None:
    """`run_short_circuit_now`/`run_power_flow_now` dostają `app.state.uow_factory`."""
    from api import enm as api_enm
    from api.main import app

    widziane: list[object] = []
    oryginal_sc = api_enm.run_short_circuit_now
    oryginal_pf = api_enm.run_power_flow_now

    def _sc(**kwargs):
        widziane.append(kwargs.get("uow_factory"))
        return oryginal_sc(**kwargs)

    def _pf(**kwargs):
        widziane.append(kwargs.get("uow_factory"))
        return oryginal_pf(**kwargs)

    monkeypatch.setattr(api_enm, "run_short_circuit_now", _sc)
    monkeypatch.setattr(api_enm, "run_power_flow_now", _pf)
    _project_id, case_id = _projekt_i_przypadek(app_client)

    zwarcie = app_client.post(f"/api/cases/{case_id}/runs/short-circuit", json={})
    rozplyw = app_client.post(f"/api/cases/{case_id}/runs/power-flow")

    assert zwarcie.status_code == 200, zwarcie.text
    assert rozplyw.status_code == 200, rozplyw.text
    assert len(widziane) == 2
    assert all(fabryka is app.state.uow_factory for fabryka in widziane)
