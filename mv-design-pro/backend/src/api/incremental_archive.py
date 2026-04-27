"""
API endpoints dla Incremental Archive Export — eksport przyrostowy.

POST /projects/{project_id}/export/incremental — eksport delty od ostatniego pełnego eksportu
POST /projects/{project_id}/import/incremental — import i nałożenie delty
GET  /projects/{project_id}/export/history     — historia eksportów (timestamps + hashe)
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from domain.incremental_archive import (
    BaseHashMismatchError,
    IncrementalArchiveError,
    IncrementalStructureError,
    SectionChangeStatus,
    apply_incremental_archive,
    build_incremental_archive,
    compute_export_result,
    deserialize_incremental,
    serialize_incremental,
)
from domain.project_archive import (
    ArchiveError,
    ArchiveFingerprints,
    ProjectArchive,
    archive_to_dict,
)
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel

router = APIRouter(prefix="/projects", tags=["incremental-archive"])


# ============================================================================
# IN-MEMORY STORE dla lokalnego adaptera eksportu przyrostowego
# ============================================================================

# Przechowywanie historii eksportów per projekt.
# W produkcji: tabela w PostgreSQL / MongoDB.
_export_history: dict[str, list[ExportHistoryEntry]] = {}  # type: ignore[name-defined]
_last_fingerprints: dict[str, ArchiveFingerprints] = {}
_last_full_archive: dict[str, ProjectArchive] = {}


# ============================================================================
# RESPONSE / REQUEST MODELS
# ============================================================================


class SectionDeltaResponse(BaseModel):
    """Informacja o zmianie pojedynczej sekcji."""

    section_name: str
    status: str
    old_hash: str | None
    new_hash: str | None


class IncrementalExportResponse(BaseModel):
    """Odpowiedź eksportu przyrostowego (metadane)."""

    message: str
    project_id: str
    export_type: str
    base_archive_hash: str
    new_archive_hash: str
    sections_changed: int
    sections_unchanged: int
    size_full_bytes: int
    size_delta_bytes: int
    savings_percent: float
    deltas: list[SectionDeltaResponse]


class IncrementalImportResponse(BaseModel):
    """Odpowiedź importu przyrostowego."""

    status: str
    message: str
    project_id: str
    archive_hash: str
    sections_applied: int


class ExportHistoryEntryResponse(BaseModel):
    """Pojedynczy wpis w historii eksportów."""

    timestamp: str
    archive_hash: str
    export_type: str
    sections_changed: int


class ExportHistoryResponse(BaseModel):
    """Historia eksportów projektu."""

    project_id: str
    entries: list[ExportHistoryEntryResponse]
    total: int


# Forward-reference fix: zdefiniuj ExportHistoryEntry po modelach Pydantic
class ExportHistoryEntry:
    """Wewnętrzny wpis historii eksportu."""

    __slots__ = ("timestamp", "archive_hash", "export_type", "sections_changed")

    def __init__(
        self,
        timestamp: str,
        archive_hash: str,
        export_type: str,
        sections_changed: int,
    ) -> None:
        self.timestamp = timestamp
        self.archive_hash = archive_hash
        self.export_type = export_type
        self.sections_changed = sections_changed


# ============================================================================
# HELPERS
# ============================================================================


def _get_project_archive_via_service(project_id: UUID, uow_factory: Any) -> ProjectArchive:
    """
    Pobierz pełne archiwum projektu za pomocą ProjectArchiveService.

    Raises:
        HTTPException(404) jeśli projekt nie istnieje.
    """
    from application.project_archive.service import ProjectArchiveService

    with uow_factory() as uow:
        service = ProjectArchiveService(uow.session)
        try:
            archive_bytes = service.export_project(project_id)
        except ArchiveError as e:
            raise HTTPException(
                status_code=404,
                detail=f"Nie znaleziono projektu: {e}",
            )

    # Deserializuj pełne archiwum
    import io
    import json
    import zipfile

    buf = io.BytesIO(archive_bytes)
    with zipfile.ZipFile(buf, "r") as zf:
        # Szukaj pliku JSON w archiwum
        json_files = [n for n in zf.namelist() if n.endswith(".json")]
        if not json_files:
            raise HTTPException(
                status_code=500,
                detail="Nieprawidłowa struktura archiwum projektu",
            )
        content = zf.read(json_files[0]).decode("utf-8")

    from domain.project_archive import dict_to_archive

    data = json.loads(content)
    return dict_to_archive(data)


def _record_export(
    project_id: str,
    archive_hash: str,
    export_type: str,
    sections_changed: int,
) -> None:
    """Zapisz wpis w historii eksportów."""
    if project_id not in _export_history:
        _export_history[project_id] = []

    entry = ExportHistoryEntry(
        timestamp=datetime.now(UTC).isoformat(),
        archive_hash=archive_hash,
        export_type=export_type,
        sections_changed=sections_changed,
    )
    _export_history[project_id].append(entry)


# ============================================================================
# ENDPOINTS
# ============================================================================


@router.post(
    "/{project_id}/export/incremental",
    response_model=IncrementalExportResponse,
)
def export_incremental(
    project_id: UUID,
    uow_factory: Any = Depends(get_uow_factory),
) -> Response:
    """
    Eksportuj przyrostowe archiwum projektu (delta od ostatniego eksportu).

    Jeśli brak poprzedniego eksportu — eksportuje pełne archiwum jako bazę
    i zwraca pustą deltę (wszystkie sekcje UNCHANGED, bo to pierwszy eksport).

    Args:
        project_id: ID projektu.

    Returns:
        Plik ZIP z archiwum przyrostowym + metadane w nagłówkach.
    """
    pid = str(project_id)

    current_archive = _get_project_archive_via_service(project_id, uow_factory)

    # Pobierz fingerprints z ostatniego eksportu
    base_fp = _last_fingerprints.get(pid)

    if base_fp is None:
        # Pierwszy eksport — ustaw bazę i zwróć pustą deltę
        base_fp = current_archive.fingerprints

    # Zbuduj archiwum przyrostowe
    now_ts = datetime.now(UTC).isoformat()
    incremental = build_incremental_archive(base_fp, current_archive, base_timestamp=now_ts)

    # Serializuj
    delta_bytes = serialize_incremental(incremental)

    # Serializuj pełne archiwum dla porównania rozmiaru
    import io
    import json
    import zipfile

    full_json = json.dumps(archive_to_dict(current_archive), sort_keys=True, indent=2)
    full_buf = io.BytesIO()
    with zipfile.ZipFile(full_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("archive.json", full_json)
    full_bytes = full_buf.getvalue()

    export_result = compute_export_result(current_archive, incremental, full_bytes, delta_bytes)

    # Aktualizuj stan
    _last_fingerprints[pid] = current_archive.fingerprints
    _last_full_archive[pid] = current_archive

    # Zapisz historię
    _record_export(
        pid,
        current_archive.fingerprints.archive_hash,
        incremental.export_type.value,
        export_result.sections_changed,
    )

    # Zwróć plik ZIP
    return Response(
        content=delta_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": (f'attachment; filename="delta_{project_id}.mvdp-delta.zip"'),
            "X-Export-Type": incremental.export_type.value,
            "X-Sections-Changed": str(export_result.sections_changed),
            "X-Sections-Unchanged": str(export_result.sections_unchanged),
            "X-Size-Full": str(export_result.size_full_bytes),
            "X-Size-Delta": str(export_result.size_delta_bytes),
            "X-Savings-Percent": str(export_result.savings_percent),
        },
    )


@router.post(
    "/{project_id}/import/incremental",
    response_model=IncrementalImportResponse,
)
async def import_incremental(
    project_id: UUID,
    file: UploadFile = File(description="Archiwum przyrostowe (ZIP z delta)"),
    uow_factory: Any = Depends(get_uow_factory),
) -> IncrementalImportResponse:
    """
    Importuj i nałóż archiwum przyrostowe (deltę) na bazowe archiwum projektu.

    Args:
        project_id: ID projektu bazowego.
        file: Plik ZIP z archiwum przyrostowym.

    Returns:
        Status importu z informacjami o nałożonych zmianach.
    """
    pid = str(project_id)

    # Walidacja typu pliku
    if not file.filename or not (
        file.filename.endswith(".zip") or file.filename.endswith(".mvdp-delta.zip")
    ):
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowe rozszerzenie pliku. " "Oczekiwano .zip lub .mvdp-delta.zip",
        )

    # Odczytaj zawartość
    delta_bytes = await file.read()

    # Deserializuj deltę
    try:
        incremental = deserialize_incremental(delta_bytes)
    except IncrementalStructureError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Nieprawidłowa struktura archiwum przyrostowego: {e}",
        )
    except IncrementalArchiveError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Błąd archiwum przyrostowego: {e}",
        )

    # Pobierz bazowe archiwum
    base_archive = _last_full_archive.get(pid)
    if base_archive is None:
        base_archive = _get_project_archive_via_service(project_id, uow_factory)

    # Nałóż deltę
    try:
        result_archive = apply_incremental_archive(base_archive, incremental)
    except BaseHashMismatchError as e:
        raise HTTPException(
            status_code=409,
            detail=f"Niezgodność hash bazowego archiwum: {e}",
        )

    # Aktualizuj stan
    _last_fingerprints[pid] = result_archive.fingerprints
    _last_full_archive[pid] = result_archive

    sections_applied = sum(
        1 for d in incremental.deltas if d.status != SectionChangeStatus.UNCHANGED
    )

    return IncrementalImportResponse(
        status="SUCCESS",
        message=f"Nałożono {sections_applied} zmienionych sekcji",
        project_id=pid,
        archive_hash=result_archive.fingerprints.archive_hash,
        sections_applied=sections_applied,
    )


@router.get(
    "/{project_id}/export/history",
    response_model=ExportHistoryResponse,
)
def get_export_history(
    project_id: UUID,
) -> ExportHistoryResponse:
    """
    Pobierz historię eksportów projektu.

    Args:
        project_id: ID projektu.

    Returns:
        Lista wpisów historii eksportów z timestamps i hashami.
    """
    pid = str(project_id)
    entries = _export_history.get(pid, [])

    return ExportHistoryResponse(
        project_id=pid,
        entries=[
            ExportHistoryEntryResponse(
                timestamp=e.timestamp,
                archive_hash=e.archive_hash,
                export_type=e.export_type,
                sections_changed=e.sections_changed,
            )
            for e in entries
        ],
        total=len(entries),
    )
