"""
Tests for Study Cases API — basic creation flow.

Regression coverage:
- POST /api/projects → 201
- POST /api/study-cases → 201 (no 500 when UoW session is required)
"""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")


def test_create_study_case_after_project_creation(app_client) -> None:
    """POST /api/projects + POST /api/study-cases — brak 500 i poprawne 201."""
    project_resp = app_client.post("/api/projects", json={"name": "Projekt testowy"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    case_resp = app_client.post(
        "/api/study-cases",
        json={
            "project_id": project_id,
            "name": "Przypadek bazowy",
        },
    )
    assert case_resp.status_code == 201
    payload = case_resp.json()
    assert payload["project_id"] == project_id
    assert payload["name"] == "Przypadek bazowy"
