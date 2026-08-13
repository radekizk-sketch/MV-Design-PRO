"""
Zakonczony bieg czyni wyniki przypadku AKTUALNYMI na SERWERZE (K6 / H-6 R2).

DEFEKT (znaleziony biegiem e2e karty K6): `StudyCase.mark_as_fresh` istnialo
w domenie, ale nikt go nie wolal — po udanym `POST /api/execution/runs/{id}/execute`
przypadek zostawal w `result_status: NONE`. Serwerowy znacznik wynikow
(`GET /api/study-cases/project/{id}/active`) nigdy nie potwierdzal, ze wyniki
sa, wiec chrom powloki albo klamal („Wyniki: brak" mimo policzonego przebiegu),
albo musial ufac lokalnemu przypuszczeniu zamiast serwerowi.

Ten test jest bramka regresji: po biegu przypadek ma FRESH + referencje wyniku
wskazujaca REALNY bieg; bieg nieudany nie zmienia statusu.
"""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")

from tests.test_execution_api import _seed_valid_enm  # noqa: E402


def _projekt_i_przypadek(app_client) -> tuple[str, str]:
    project_resp = app_client.post("/api/projects", json={"name": "Projekt K6"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    case_resp = app_client.post(
        "/api/study-cases",
        json={"project_id": project_id, "name": "Przypadek K6", "set_active": True},
    )
    assert case_resp.status_code == 201
    return project_id, str(case_resp.json()["id"])


def test_zakonczony_bieg_ustawia_wyniki_przypadku_na_fresh(app_client, uow_factory) -> None:
    project_id, case_id = _projekt_i_przypadek(app_client)
    _seed_valid_enm(case_id)

    przed = app_client.get(f"/api/study-cases/project/{project_id}/active")
    assert przed.status_code == 200
    assert przed.json()["result_status"] == "NONE"
    assert przed.json()["results_valid"] is False

    create_resp = app_client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )
    assert create_resp.status_code == 201
    run_id = create_resp.json()["id"]

    execute_resp = app_client.post(f"/api/execution/runs/{run_id}/execute")
    assert execute_resp.status_code == 200
    assert execute_resp.json()["status"] == "DONE"

    po = app_client.get(f"/api/study-cases/project/{project_id}/active")
    assert po.status_code == 200
    payload = po.json()
    assert payload["result_status"] == "FRESH"
    assert payload["results_valid"] is True
    # Referencja wyniku wskazuje REALNY bieg (zero fabrykacji identyfikatorow).
    # Odpowiedz API nie niesie `result_refs` (kontrakt FROZEN — nie ruszamy go
    # w tej karcie), wiec czytamy zapis wprost z repozytorium przypadkow.
    from uuid import UUID

    with uow_factory() as uow:
        zapisany = uow.cases.get_study_case(UUID(case_id))
    assert zapisany is not None
    assert any(str(ref.analysis_run_id) == run_id for ref in zapisany.result_refs)
    assert all(ref.analysis_type for ref in zapisany.result_refs)


def test_bieg_nieistniejacy_nie_zmienia_statusu_przypadku(app_client) -> None:
    from uuid import uuid4

    project_id, case_id = _projekt_i_przypadek(app_client)
    _seed_valid_enm(case_id)

    brak = app_client.post(f"/api/execution/runs/{uuid4()}/execute")
    assert brak.status_code == 404

    po = app_client.get(f"/api/study-cases/project/{project_id}/active")
    assert po.status_code == 200
    assert po.json()["result_status"] == "NONE"
