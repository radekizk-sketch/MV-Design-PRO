"""
Tests for Project Archive API — P31 / W1-B-ARCH.

Ścieżka HTTP (`POST /api/projects/{id}/export`, `POST /api/projects/import`,
`POST /api/projects/import/preview`) na REALNYM backendzie (TestClient +
UnitOfWork), nie na atrapach serwisu — zamyka pętlę „ZIP bajty → import_project"
także na warstwie API (kontrakt `ImportResponse`/`ArchiveSummary`, oba
przemodelowane w tej karcie po skasowaniu sekcji `network_model`/`sld_diagrams`/
`proofs`, W1-B-ARCH §0.1).
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest

pytest.importorskip("fastapi")


@pytest.fixture(autouse=True)
def _enm_store_tmp(tmp_path, monkeypatch):
    """Izolowany katalog flat-file store ENM na czas testu (export/import go
    dotyka), tak jak `tests/application/project_archive/test_enm_archive_section.py`."""
    from enm.store import reset_enm_store

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store(remove_persisted=False)
    yield
    reset_enm_store(remove_persisted=False)


def _utworz_projekt(app_client, name: str = "Projekt archiwum API") -> str:
    resp = app_client.post("/api/projects", json={"name": name})
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


def _utworz_przypadek(app_client, project_id: str, name: str = "Przypadek API") -> str:
    resp = app_client.post("/api/study-cases", json={"project_id": project_id, "name": name})
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


def test_export_produces_pure_300_zip_without_deleted_sections(app_client) -> None:
    """Eksport przez API zwraca ZIP formatu 3.0.0 — bez sekcji skasowanych
    razem z tabelami ORM w W1 (§0.1)."""
    project_id = _utworz_projekt(app_client)

    resp = app_client.post(f"/api/projects/{project_id}/export")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(resp.content), "r") as zf:
        assert "project.json" in zf.namelist()
        assert "manifest.json" in zf.namelist()
        data = json.loads(zf.read("project.json"))

    assert data["schema_version"] == "3.0.0"
    assert "network_model" not in data
    assert "sld_diagrams" not in data
    assert "proofs" not in data
    assert "enm" in data


def test_export_then_import_roundtrip_via_api(app_client) -> None:
    """Eksport → upload → import przez API: nowy projekt, status SUCCESS."""
    project_id = _utworz_projekt(app_client, name="Projekt do eksportu")
    _utworz_przypadek(app_client, project_id, name="Przypadek bazowy")

    export_resp = app_client.post(f"/api/projects/{project_id}/export")
    assert export_resp.status_code == 200, export_resp.text
    archive_bytes = export_resp.content

    import_resp = app_client.post(
        "/api/projects/import",
        files={"file": ("projekt.mvdp.zip", archive_bytes, "application/zip")},
        data={"new_name": "Projekt zaimportowany"},
    )
    assert import_resp.status_code == 200, import_resp.text
    payload = import_resp.json()

    assert payload["status"] in {"SUCCESS", "CATALOG_MAPPING_REQUIRED"}
    assert payload["project_id"] is not None
    assert payload["project_id"] != project_id

    # Re-eksport nowego projektu potwierdza, że przypadek faktycznie się przywrócił.
    reexport_resp = app_client.post(f"/api/projects/{payload['project_id']}/export")
    assert reexport_resp.status_code == 200
    with zipfile.ZipFile(io.BytesIO(reexport_resp.content), "r") as zf:
        reexported = json.loads(zf.read("project.json"))
    assert len(reexported["cases"]["study_cases"]) == 1
    assert reexported["cases"]["study_cases"][0]["name"] == "Przypadek bazowy"


def test_preview_summary_has_no_deleted_fields(app_client) -> None:
    """`ArchiveSummary` przez API niesie przypadki/biegi/wpisy ENM — nie
    `nodes_count`/`branches_count`/`sld_diagrams_count`/`proofs_count` (§0.1)."""
    project_id = _utworz_projekt(app_client, name="Projekt do podglądu")
    _utworz_przypadek(app_client, project_id, name="Przypadek podglądu")

    export_resp = app_client.post(f"/api/projects/{project_id}/export")
    assert export_resp.status_code == 200

    preview_resp = app_client.post(
        "/api/projects/import/preview",
        files={"file": ("projekt.mvdp.zip", export_resp.content, "application/zip")},
    )
    assert preview_resp.status_code == 200, preview_resp.text
    payload = preview_resp.json()

    assert payload["valid"] is True
    assert payload["schema_version"] == "3.0.0"
    summary = payload["summary"]
    assert summary["study_cases_count"] == 1
    assert set(summary.keys()) == {
        "study_cases_count",
        "operating_cases_count",
        "canonical_runs_count",
        "enm_models_count",
    }


def test_import_rejects_wrong_file_extension(app_client) -> None:
    resp = app_client.post(
        "/api/projects/import",
        files={"file": ("notatki.txt", b"cokolwiek", "text/plain")},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["status"] == "FAILED"
    assert payload["project_id"] is None
    assert any("rozszerzenie" in e.lower() for e in payload["errors"])


def test_import_rejects_invalid_zip_bytes(app_client) -> None:
    resp = app_client.post(
        "/api/projects/import",
        files={"file": ("projekt.mvdp.zip", b"nie jest to ZIP", "application/zip")},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["status"] == "FAILED"
    assert len(payload["errors"]) > 0


def test_export_nonexistent_project_returns_404(app_client) -> None:
    import uuid

    resp = app_client.post(f"/api/projects/{uuid.uuid4()}/export")
    assert resp.status_code == 404
