"""Końcówki kopii zapasowych archiwum (`api/cloud_backup.py`) — zero połykania wyjątków.

DEFEKT, KTÓRY TEN PLIK PRZYPINA (karta ARCHIWUM PROJEKTU, 2026-09-24). Tworzenie kopii
i przywracanie z kopii łapały każdy wyjątek ogólny i zamieniały go na 500 z samym
komunikatem — błąd programu (np. awaria zapisu w bazie) wyglądał jak kontrolowana
odmowa, a ślad ginął. Teraz nazwane błędy archiwum mają nazwaną odpowiedź (404 dla
nieistniejącego projektu, 422 dla uszkodzonej kopii), a każdy inny wyjątek wybucha.

ŚCIEŻKA. Router `cloud_backup` jest ŚWIADOMIE ODSTAWIONY (`router_mount_guard.py`:
decyzja właściciela o powierzeniu danych zewnętrznemu dostawcy), więc test montuje
TEN SAM obiekt `router` we własnej aplikacji z lokalnym dostawcą w katalogu testu.

ILOCZYN CECH: końcówka {kopia, przywrócenie} × zdarzenie {nazwany błąd archiwum,
wyjątek spoza archiwum, powodzenie}.
"""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

pytest.importorskip("fastapi")

from application.project_archive.service import ProjectArchiveService  # noqa: E402
from enm.store import reset_enm_store  # noqa: E402
from infrastructure.cloud_backup import (  # noqa: E402
    CloudBackendType,
    CloudBackupConfig,
    compute_file_hash,
    create_backup_provider,
)


@pytest.fixture(autouse=True)
def _enm_store_tmp(tmp_path, monkeypatch):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store(remove_persisted=False)
    yield
    reset_enm_store(remove_persisted=False)


@pytest.fixture()
def dostawca(tmp_path: Path):
    return create_backup_provider(
        CloudBackupConfig(
            backend=CloudBackendType.LOCAL,
            bucket_name=str(tmp_path / "kopie"),
            prefix="backups",
        )
    )


@pytest.fixture()
def klient(uow_factory, dostawca):
    from api.cloud_backup import router
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.state.uow_factory = uow_factory
    app.state.cloud_backup_provider = dostawca
    with TestClient(app) as client:
        yield client


def _projekt(app_client) -> str:
    odp = app_client.post("/api/projects", json={"name": "Projekt kopii"})
    assert odp.status_code == 201, odp.text
    return str(odp.json()["id"])


def _zapisz_kopie(dostawca, project_id: str, bajty: bytes) -> str:
    wynik = dostawca.upload(
        archive_bytes=bajty,
        project_id=project_id,
        archive_hash=compute_file_hash(bajty),
        metadata={},
    )
    assert wynik.success
    return dostawca.list_backups(project_id)[0].backup_id


def test_kopia_nieistniejacego_projektu_404(klient) -> None:
    odp = klient.post(f"/api/projects/{uuid4()}/backup")
    assert odp.status_code == 404
    assert "nie istnieje" in odp.json()["detail"]


def test_kopia_wyjatek_spoza_archiwum_wybucha(klient, monkeypatch) -> None:
    def _awaria(*_a: object, **_k: object) -> bytes:
        raise RuntimeError("awaria zapisu spoza archiwum")

    monkeypatch.setattr(ProjectArchiveService, "export_project", _awaria)
    with pytest.raises(RuntimeError, match="awaria zapisu spoza archiwum"):
        klient.post(f"/api/projects/{uuid4()}/backup")


def test_kopia_i_przywrocenie_projektu(klient, app_client) -> None:
    project_id = _projekt(app_client)
    kopia = klient.post(f"/api/projects/{project_id}/backup")
    assert kopia.status_code == 200, kopia.text
    backup_id = klient.get(f"/api/projects/{project_id}/backups").json()["backups"][0]["backup_id"]

    przywrocenie = klient.post(f"/api/projects/{project_id}/restore/{backup_id}")

    assert przywrocenie.status_code == 200, przywrocenie.text
    assert przywrocenie.json()["success"] is True


def test_przywrocenie_uszkodzonej_kopii_422_z_nazwanym_bledem(klient, dostawca) -> None:
    project_id = str(uuid4())
    backup_id = _zapisz_kopie(dostawca, project_id, b"to nie jest archiwum ZIP")

    odp = klient.post(f"/api/projects/{project_id}/restore/{backup_id}")

    assert odp.status_code == 422, odp.text
    assert "Nieprawidłowy format archiwum ZIP" in odp.json()["detail"]


def test_przywrocenie_wyjatek_spoza_archiwum_wybucha(klient, dostawca, monkeypatch) -> None:
    project_id = str(uuid4())
    backup_id = _zapisz_kopie(dostawca, project_id, b"dowolne bajty")

    def _awaria(*_a: object, **_k: object) -> object:
        raise RuntimeError("awaria importu spoza archiwum")

    monkeypatch.setattr(ProjectArchiveService, "import_project", _awaria)
    with pytest.raises(RuntimeError, match="awaria importu spoza archiwum"):
        klient.post(f"/api/projects/{project_id}/restore/{backup_id}")
