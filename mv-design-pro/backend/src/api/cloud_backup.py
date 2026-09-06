"""
API endpoints dla Cloud Backup — kopie zapasowe archiwów w chmurze.

POST   /projects/{project_id}/backup           — Utwórz kopię zapasową
GET    /projects/{project_id}/backups           — Lista kopii zapasowych
POST   /projects/{project_id}/restore/{backup_id} — Przywróć z kopii
DELETE /projects/{project_id}/backups/{backup_id}  — Usuń kopię zapasową

KANON:
- Infrastructure layer — zero logiki biznesowej / zero fizyki
- NOT-A-SOLVER
- 100% PL messages w odpowiedziach
"""

from __future__ import annotations

import logging
import os
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from infrastructure.cloud_backup import (
    CloudBackendType,
    CloudBackupConfig,
    CloudBackupConfigError,
    CloudBackupError,
    CloudBackupNotFoundError,
    CloudBackupPermissionError,
    compute_file_hash,
    create_backup_provider,
)
from pydantic import BaseModel

logger = logging.getLogger("mv_design_pro.api.cloud_backup")

router = APIRouter(prefix="/projects", tags=["cloud-backup"])


# ============================================================================
# KONFIGURACJA Z ENV
# ============================================================================


def _get_cloud_config() -> CloudBackupConfig:
    """
    Utwórz konfigurację z zmiennych środowiskowych.

    Zmienne:
        CLOUD_BACKUP_BACKEND: S3 | GCS | LOCAL (domyślnie LOCAL)
        CLOUD_BACKUP_BUCKET: nazwa bucket'a
        CLOUD_BACKUP_PREFIX: prefix klucza (domyślnie 'backups')
        CLOUD_BACKUP_CREDENTIALS: ścieżka do pliku poświadczeń
        CLOUD_BACKUP_REGION: region (wymagany dla S3)
        CLOUD_BACKUP_ENDPOINT_URL: endpoint URL (dla S3-compatible)
    """
    backend_str = os.getenv("CLOUD_BACKUP_BACKEND", "LOCAL")
    try:
        backend = CloudBackendType(backend_str.upper())
    except ValueError:
        raise CloudBackupConfigError(
            f"Nieobsługiwany backend: {backend_str}. " f"Dozwolone: S3, GCS, LOCAL"
        )

    bucket = os.getenv("CLOUD_BACKUP_BUCKET", "/tmp/mv-design-pro-backups")
    prefix = os.getenv("CLOUD_BACKUP_PREFIX", "backups")
    credentials = os.getenv("CLOUD_BACKUP_CREDENTIALS")
    region = os.getenv("CLOUD_BACKUP_REGION")
    endpoint_url = os.getenv("CLOUD_BACKUP_ENDPOINT_URL")

    return CloudBackupConfig(
        backend=backend,
        bucket_name=bucket,
        prefix=prefix,
        credentials_path=credentials,
        region=region,
        endpoint_url=endpoint_url,
    )


# ============================================================================
# MODELE ODPOWIEDZI
# ============================================================================


class BackupResponse(BaseModel):
    """Odpowiedź operacji kopii zapasowej."""

    success: bool
    message_pl: str
    url: str | None = None
    archive_hash: str | None = None
    timestamp: str | None = None
    size_bytes: int | None = None


class BackupEntryResponse(BaseModel):
    """Wpis kopii zapasowej.

    FAB-E (E1): size_bytes to `| None` — rozmiar nieznany (GCS bez metadanych)
    daje None, nigdy fabrykowane 0 B.
    """

    backup_id: str
    project_id: str
    archive_hash: str
    timestamp: str
    size_bytes: int | None
    url: str


class BackupListResponse(BaseModel):
    """Lista kopii zapasowych."""

    project_id: str
    backups: list[BackupEntryResponse]
    total_count: int


class RestoreResponse(BaseModel):
    """Odpowiedź przywracania z kopii zapasowej."""

    success: bool
    message_pl: str
    archive_hash: str | None = None
    size_bytes: int | None = None


class DeleteBackupResponse(BaseModel):
    """Odpowiedź usunięcia kopii zapasowej."""

    success: bool
    message_pl: str


# ============================================================================
# ZALEŻNOŚCI
# ============================================================================


def _get_backup_provider(request: Request) -> Any:
    """
    Pobierz dostawcę kopii zapasowych.

    Jeśli dostawca jest skonfigurowany w app.state, użyj go.
    W przeciwnym razie utwórz z konfiguracji env.
    """
    provider = getattr(request.app.state, "cloud_backup_provider", None)
    if provider is not None:
        return provider

    config = _get_cloud_config()
    return create_backup_provider(config)


def _get_archive_service(request: Request) -> Any:
    """
    Pobierz serwis archiwum projektu.

    Wymaga skonfigurowanego UoW factory.
    """
    from api.dependencies import get_uow_factory

    uow_factory = get_uow_factory(request)
    return uow_factory


# ============================================================================
# ENDPOINTY
# ============================================================================


@router.post(
    "/{project_id}/backup",
    response_model=BackupResponse,
)
def backup_project(
    project_id: UUID,
    request: Request,
) -> BackupResponse:
    """
    Utwórz kopię zapasową projektu w chmurze.

    1. Eksportuj projekt do archiwum ZIP
    2. Oblicz hash archiwum
    3. Prześlij do skonfigurowanego backendu chmurowego
    4. Zweryfikuj hash po przesłaniu

    Args:
        project_id: ID projektu do archiwizacji
    """
    # Pobierz serwis archiwum
    from application.project_archive.service import ProjectArchiveService
    from domain.project_archive import ArchiveError

    uow_factory = _get_archive_service(request)
    provider = _get_backup_provider(request)

    try:
        with uow_factory() as uow:
            service = ProjectArchiveService(uow.session)
            archive_bytes = service.export_project(project_id)
    except ArchiveError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Błąd eksportu projektu: {exc}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Błąd wewnętrzny eksportu: {exc}",
        )

    # Oblicz hash
    archive_hash = compute_file_hash(archive_bytes)

    # Prześlij do chmury
    try:
        result = provider.upload(
            archive_bytes=archive_bytes,
            project_id=str(project_id),
            archive_hash=archive_hash,
            metadata={
                "project_id": str(project_id),
                "source": "api-backup",
            },
        )
    except CloudBackupPermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        )
    except CloudBackupNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )
    except CloudBackupError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )

    if not result.success:
        raise HTTPException(
            status_code=500,
            detail=result.error_pl or "Błąd przesyłania kopii zapasowej.",
        )

    logger.info(
        "Kopia zapasowa utworzona: project=%s, hash=%s",
        project_id,
        archive_hash[:12],
    )

    return BackupResponse(
        success=True,
        message_pl="Kopia zapasowa utworzona pomyślnie.",
        url=result.url,
        archive_hash=result.hash,
        timestamp=result.timestamp,
        size_bytes=result.size_bytes,
    )


@router.get(
    "/{project_id}/backups",
    response_model=BackupListResponse,
)
def list_project_backups(
    project_id: UUID,
    request: Request,
) -> BackupListResponse:
    """
    Lista kopii zapasowych projektu.

    Zwraca listę posortowaną wg czasu (najnowsze pierwsze).

    Args:
        project_id: ID projektu
    """
    provider = _get_backup_provider(request)

    try:
        entries = provider.list_backups(str(project_id))
    except CloudBackupError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )

    return BackupListResponse(
        project_id=str(project_id),
        backups=[
            BackupEntryResponse(
                backup_id=e.backup_id,
                project_id=e.project_id,
                archive_hash=e.archive_hash,
                timestamp=e.timestamp,
                size_bytes=e.size_bytes,
                url=e.url,
            )
            for e in entries
        ],
        total_count=len(entries),
    )


@router.post(
    "/{project_id}/restore/{backup_id}",
    response_model=RestoreResponse,
)
def restore_from_backup(
    project_id: UUID,
    backup_id: str,
    request: Request,
) -> RestoreResponse:
    """
    Przywróć projekt z kopii zapasowej.

    1. Pobierz archiwum z chmury
    2. Zaimportuj archiwum (tworzony jest nowy projekt)

    Args:
        project_id: ID projektu (oryginału)
        backup_id: ID kopii zapasowej
    """
    from application.project_archive.service import ProjectArchiveService

    provider = _get_backup_provider(request)
    uow_factory = _get_archive_service(request)

    # Pobierz archiwum z chmury
    try:
        archive_bytes = provider.download(
            backup_id=backup_id,
            project_id=str(project_id),
        )
    except CloudBackupNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )
    except CloudBackupPermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        )
    except CloudBackupError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Błąd pobierania kopii zapasowej: {exc}",
        )

    archive_hash = compute_file_hash(archive_bytes)

    # Importuj archiwum
    try:
        with uow_factory() as uow:
            service = ProjectArchiveService(uow.session)
            result = service.import_project(
                archive_bytes=archive_bytes,
                verify_integrity=True,
            )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Błąd importu archiwum z kopii zapasowej: {exc}",
        )

    if result.status.value == "FAILED":
        raise HTTPException(
            status_code=422,
            detail=("Import z kopii zapasowej nie powiódł się: " + "; ".join(result.errors)),
        )

    logger.info(
        "Przywrócono z kopii: project=%s, backup=%s, hash=%s",
        project_id,
        backup_id,
        archive_hash[:12],
    )

    return RestoreResponse(
        success=True,
        message_pl="Projekt przywrócony z kopii zapasowej pomyślnie.",
        archive_hash=archive_hash,
        size_bytes=len(archive_bytes),
    )


@router.delete(
    "/{project_id}/backups/{backup_id}",
    response_model=DeleteBackupResponse,
)
def delete_project_backup(
    project_id: UUID,
    backup_id: str,
    request: Request,
) -> DeleteBackupResponse:
    """
    Usuń kopię zapasową projektu.

    Args:
        project_id: ID projektu
        backup_id: ID kopii zapasowej
    """
    provider = _get_backup_provider(request)

    try:
        result = provider.delete_backup(
            backup_id=backup_id,
            project_id=str(project_id),
        )
    except CloudBackupNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )
    except CloudBackupPermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        )
    except CloudBackupError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )

    if not result.success:
        raise HTTPException(
            status_code=500,
            detail=result.error_pl or "Błąd usuwania kopii zapasowej.",
        )

    logger.info(
        "Kopia zapasowa usunięta: project=%s, backup=%s",
        project_id,
        backup_id,
    )

    return DeleteBackupResponse(
        success=True,
        message_pl="Kopia zapasowa usunięta pomyślnie.",
    )
