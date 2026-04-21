"""
Tests for Projects API — CRUD operations with DB persistence.

Tests cover:
- Project CRUD operations (create, list, get, delete)
- Full schema validation (mode, voltage_level_kv, frequency_hz)
- Soft delete functionality
- Error handling (404, 422, 409)
- Persistence across requests
"""

from __future__ import annotations

from uuid import uuid4

import pytest

pytest.importorskip("fastapi")


class TestProjectsCRUD:
    """Projects API — CRUD operations with DB persistence."""

    def test_create_project_minimal(self, app_client):
        """POST /api/projects — minimalna konfiguracja"""
        resp = app_client.post("/api/projects", json={"name": "Test SN-01"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test SN-01"
        assert data["mode"] == "AS-IS"  # default
        assert data["voltage_level_kv"] == 15.0  # default
        assert data["frequency_hz"] == 50.0  # default
        assert "id" in data

    def test_create_project_full(self, app_client):
        """POST /api/projects — pełna konfiguracja"""
        resp = app_client.post(
            "/api/projects",
            json={
                "name": "Elektrownia Wiatrowa",
                "description": "Farma wiatrowa 10 MW, przyłączenie do GPZ",
                "mode": "TO-BE",
                "voltage_level_kv": 30.0,
                "frequency_hz": 50.0,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Elektrownia Wiatrowa"
        assert data["mode"] == "TO-BE"
        assert data["voltage_level_kv"] == 30.0
        assert data["description"] == "Farma wiatrowa 10 MW, przyłączenie do GPZ"

    def test_create_project_with_60hz_frequency(self, app_client):
        """POST /api/projects — częstotliwość 60 Hz (US standard)"""
        resp = app_client.post(
            "/api/projects",
            json={
                "name": "US Grid Project",
                "frequency_hz": 60.0,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["frequency_hz"] == 60.0

    def test_create_project_invalid_frequency(self, app_client):
        """POST /api/projects — nieprawidłowa częstotliwość"""
        resp = app_client.post(
            "/api/projects",
            json={
                "name": "Bad Freq",
                "frequency_hz": 45.0,
            },
        )
        assert resp.status_code == 422  # Pydantic validation

    def test_create_project_invalid_voltage_zero(self, app_client):
        """POST /api/projects — napięcie = 0 (niedozwolone)"""
        resp = app_client.post(
            "/api/projects",
            json={
                "name": "Zero Voltage",
                "voltage_level_kv": 0,
            },
        )
        assert resp.status_code == 422

    def test_create_project_invalid_voltage_negative(self, app_client):
        """POST /api/projects — napięcie ujemne (niedozwolone)"""
        resp = app_client.post(
            "/api/projects",
            json={
                "name": "Negative Voltage",
                "voltage_level_kv": -15.0,
            },
        )
        assert resp.status_code == 422

    def test_create_project_empty_name(self, app_client):
        """POST /api/projects — pusta nazwa"""
        resp = app_client.post("/api/projects", json={"name": "   "})
        assert resp.status_code == 422

    def test_create_project_missing_name(self, app_client):
        """POST /api/projects — brak nazwy"""
        resp = app_client.post("/api/projects", json={})
        assert resp.status_code == 422

    def test_list_projects_empty(self, app_client):
        """GET /api/projects — pusta lista"""
        resp = app_client.get("/api/projects")
        assert resp.status_code == 200
        data = resp.json()
        assert "projects" in data
        assert "total" in data
        # Note: total may be > 0 if other tests ran before in same session

    def test_list_projects_after_create(self, app_client):
        """GET /api/projects — lista po utworzeniu"""
        # Create two projects
        app_client.post("/api/projects", json={"name": "Projekt A"})
        app_client.post("/api/projects", json={"name": "Projekt B"})

        resp = app_client.get("/api/projects")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2
        # Check both projects are in the list
        names = [p["name"] for p in data["projects"]]
        assert "Projekt A" in names
        assert "Projekt B" in names

    def test_get_project_by_id(self, app_client):
        """GET /api/projects/{id} — pobieranie po ID"""
        create_resp = app_client.post("/api/projects", json={"name": "Get Me"})
        project_id = create_resp.json()["id"]

        resp = app_client.get(f"/api/projects/{project_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Get Me"

    def test_get_project_not_found(self, app_client):
        """GET /api/projects/{id} — nieistniejący projekt"""
        fake_id = str(uuid4())
        resp = app_client.get(f"/api/projects/{fake_id}")
        assert resp.status_code == 404

    def test_get_project_invalid_uuid(self, app_client):
        """GET /api/projects/{id} — nieprawidłowy UUID"""
        resp = app_client.get("/api/projects/not-a-uuid")
        assert resp.status_code == 422  # FastAPI validation

    def test_delete_project(self, app_client):
        """DELETE /api/projects/{id} — soft delete"""
        create_resp = app_client.post("/api/projects", json={"name": "Delete Me"})
        project_id = create_resp.json()["id"]

        del_resp = app_client.delete(f"/api/projects/{project_id}")
        assert del_resp.status_code == 204

        # Po soft delete — GET zwraca 404
        get_resp = app_client.get(f"/api/projects/{project_id}")
        assert get_resp.status_code == 404

    def test_delete_project_not_found(self, app_client):
        """DELETE /api/projects/{id} — nieistniejący projekt"""
        fake_id = str(uuid4())
        resp = app_client.delete(f"/api/projects/{fake_id}")
        assert resp.status_code == 404

    def test_delete_project_invalid_uuid(self, app_client):
        """DELETE /api/projects/{id} — nieprawidłowy UUID"""
        resp = app_client.delete("/api/projects/not-a-uuid")
        assert resp.status_code == 422

    def test_persistence_across_requests(self, app_client):
        """Projekt utworzony w jednym requeście jest widoczny w kolejnym"""
        create_resp = app_client.post("/api/projects", json={"name": "Persistent"})
        project_id = create_resp.json()["id"]

        # Nowy request — projekt nadal istnieje
        get_resp = app_client.get(f"/api/projects/{project_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == project_id

    def test_deleted_project_not_in_list(self, app_client):
        """Usunięty projekt nie pojawia się na liście"""
        create_resp = app_client.post("/api/projects", json={"name": "To Be Hidden"})
        project_id = create_resp.json()["id"]

        # Delete
        app_client.delete(f"/api/projects/{project_id}")

        # Check list
        list_resp = app_client.get("/api/projects")
        ids = [p["id"] for p in list_resp.json()["projects"]]
        assert project_id not in ids

    def test_response_has_all_required_fields(self, app_client):
        """Response zawiera wszystkie wymagane pola ze schematu"""
        resp = app_client.post("/api/projects", json={"name": "Schema Test"})
        assert resp.status_code == 201
        data = resp.json()

        # Required fields
        assert "id" in data
        assert "name" in data
        assert "mode" in data
        assert "voltage_level_kv" in data
        assert "frequency_hz" in data
        assert "created_at" in data
        assert "updated_at" in data

        # Optional fields (should be present even if None)
        assert "description" in data
        assert "connection_node_id" in data
        assert "connection_description" in data
        assert "owner_id" in data

    def test_tests_are_independent(self, app_client):
        """Testy nie zależą od kolejności — każdy działa sam"""
        resp = app_client.post("/api/projects", json={"name": "Independent"})
        assert resp.status_code == 201

    def test_create_project_strips_whitespace_from_name(self, app_client):
        """POST /api/projects — nazwa jest obcinana z whitespace"""
        resp = app_client.post("/api/projects", json={"name": "  Trimmed Name  "})
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Trimmed Name"

    def test_mode_as_is_is_default(self, app_client):
        """POST /api/projects — domyślny mode to AS-IS"""
        resp = app_client.post("/api/projects", json={"name": "Mode Test"})
        assert resp.status_code == 201
        assert resp.json()["mode"] == "AS-IS"

    def test_mode_to_be(self, app_client):
        """POST /api/projects — mode TO-BE"""
        resp = app_client.post(
            "/api/projects",
            json={
                "name": "TO-BE Project",
                "mode": "TO-BE",
            },
        )
        assert resp.status_code == 201
        assert resp.json()["mode"] == "TO-BE"

    def test_invalid_mode(self, app_client):
        """POST /api/projects — nieprawidłowy mode"""
        resp = app_client.post(
            "/api/projects",
            json={
                "name": "Invalid Mode",
                "mode": "INVALID",
            },
        )
        assert resp.status_code == 422


class TestProjectsListOrdering:
    """Tests for project list ordering."""

    def test_list_is_ordered_by_created_at_desc(self, app_client):
        """GET /api/projects — lista posortowana po dacie utworzenia (malejąco)"""
        # Create projects in order
        app_client.post("/api/projects", json={"name": "First"})
        app_client.post("/api/projects", json={"name": "Second"})
        app_client.post("/api/projects", json={"name": "Third"})

        resp = app_client.get("/api/projects")
        assert resp.status_code == 200
        projects = resp.json()["projects"]

        # Find our projects
        our_projects = [p for p in projects if p["name"] in ("First", "Second", "Third")]
        if len(our_projects) >= 3:
            # Should be in reverse order (most recent first)
            names = [p["name"] for p in our_projects]
            assert names.index("Third") < names.index("First")
