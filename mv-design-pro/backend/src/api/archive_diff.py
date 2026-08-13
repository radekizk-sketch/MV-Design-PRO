"""
API endpoints dla Archive Diff — porownanie archiwow projektu.

POST /archives/diff              — porownaj dwa archiwa (pliki ZIP)
POST /archives/diff/projects/{a}/{b} — porownaj archiwa dwoch projektow

KANON:
- NOT-A-SOLVER — zero obliczen fizycznych
- Read-only — brak mutacji
- Deterministyczny — ten sam input = ten sam output
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.project_archive.service import ProjectArchiveService
from domain.archive_diff import (
    ArchiveDiffResult,
    compare_archives,
    format_diff_report_pl,
)
from domain.project_archive import (
    ArchiveError,
)
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

router = APIRouter(prefix="/archives", tags=["archive-diff"])


# ============================================================================
# RESPONSE MODELS
# ============================================================================


class FieldChangeResponse(BaseModel):
    """Zmiana wartosci pola elementu."""

    field_name: str
    old_value: Any = None
    new_value: Any = None
    label_pl: str


class ElementDiffResponse(BaseModel):
    """Roznica na poziomie elementu."""

    element_id: str
    element_type: str
    status: str
    field_changes: list[FieldChangeResponse]


class SectionDiffResponse(BaseModel):
    """Roznica na poziomie sekcji."""

    section_name: str
    status: str
    hash_a: str
    hash_b: str
    elements_added: int
    elements_removed: int
    elements_modified: int
    element_diffs: list[ElementDiffResponse]


class DiffSummaryResponse(BaseModel):
    """Podsumowanie diff-a."""

    sections_total: int
    sections_identical: int
    sections_modified: int
    total_elements_added: int
    total_elements_removed: int
    total_elements_modified: int


class ArchiveDiffResponse(BaseModel):
    """Pelny wynik porownania archiwow."""

    archive_hash_a: str
    archive_hash_b: str
    overall_status: str
    section_diffs: list[SectionDiffResponse]
    summary: DiffSummaryResponse
    deterministic_signature: str
    report_pl: str = Field(
        default="",
        description="Czytelny raport roznic w jezyku polskim",
    )


# ============================================================================
# KONWERSJA DOMAIN -> RESPONSE
# ============================================================================


def _to_response(result: ArchiveDiffResult) -> ArchiveDiffResponse:
    """Konwertuj ArchiveDiffResult na ArchiveDiffResponse."""
    section_diffs = []
    for sd in result.section_diffs:
        element_diffs = []
        for ed in sd.element_diffs:
            field_changes = [
                FieldChangeResponse(
                    field_name=fc.field_name,
                    old_value=fc.old_value,
                    new_value=fc.new_value,
                    label_pl=fc.label_pl,
                )
                for fc in ed.field_changes
            ]
            element_diffs.append(
                ElementDiffResponse(
                    element_id=ed.element_id,
                    element_type=ed.element_type,
                    status=ed.status.value,
                    field_changes=field_changes,
                )
            )
        section_diffs.append(
            SectionDiffResponse(
                section_name=sd.section_name,
                status=sd.status.value,
                hash_a=sd.hash_a,
                hash_b=sd.hash_b,
                elements_added=sd.elements_added,
                elements_removed=sd.elements_removed,
                elements_modified=sd.elements_modified,
                element_diffs=element_diffs,
            )
        )

    summary = result.summary
    report_pl = format_diff_report_pl(result)

    return ArchiveDiffResponse(
        archive_hash_a=result.archive_hash_a,
        archive_hash_b=result.archive_hash_b,
        overall_status=result.overall_status.value,
        section_diffs=section_diffs,
        summary=DiffSummaryResponse(
            sections_total=summary.get("sections_total", 0),
            sections_identical=summary.get("sections_identical", 0),
            sections_modified=summary.get("sections_modified", 0),
            total_elements_added=summary.get("total_elements_added", 0),
            total_elements_removed=summary.get("total_elements_removed", 0),
            total_elements_modified=summary.get("total_elements_modified", 0),
        ),
        deterministic_signature=result.deterministic_signature,
        report_pl=report_pl,
    )


# ============================================================================
# ENDPOINTS
# ============================================================================


@router.post("/diff", response_model=ArchiveDiffResponse)
async def compare_archive_files(
    file_a: UploadFile = File(description="Archiwum A (ZIP) — bazowe"),
    file_b: UploadFile = File(description="Archiwum B (ZIP) — porownywane"),
    uow_factory: Any = Depends(get_uow_factory),
) -> ArchiveDiffResponse:
    """
    Porownaj dwa archiwa projektu przeslane jako pliki ZIP.

    Endpoint read-only, zero mutacji.
    Zwraca pelny diff na poziomie sekcji i elementow
    oraz czytelny raport PL.

    Args:
        file_a: Plik archiwum A (bazowe)
        file_b: Plik archiwum B (porownywane)

    Returns:
        ArchiveDiffResponse z pelnym wynikiem porownania
    """
    # Walidacja rozszerzen
    for label, f in [("A", file_a), ("B", file_b)]:
        if not f.filename or not (f.filename.endswith(".zip") or f.filename.endswith(".mvdp.zip")):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Nieprawidlowe rozszerzenie pliku {label}. " f"Oczekiwano .zip lub .mvdp.zip"
                ),
            )

    bytes_a = await file_a.read()
    bytes_b = await file_b.read()

    # WSPÓŁBIEŻNOŚĆ: końcówka zostaje `async def`, bo czyta DWA przesłane pliki
    # (`await file_*.read()`). Rozpakowanie obu archiwów i ich porównanie jest
    # blokujące — na pętli zdarzeń wstrzymywało obsługę wszystkich pozostałych
    # żądań na czas porównania.
    def _porownaj() -> ArchiveDiffResponse:
        with uow_factory() as uow:
            service = ProjectArchiveService(uow.session)

            try:
                archive_a = service.load_archive_from_bytes(bytes_a)
            except (ArchiveError, Exception) as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Blad odczytu archiwum A: {e}",
                )

            try:
                archive_b = service.load_archive_from_bytes(bytes_b)
            except (ArchiveError, Exception) as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Blad odczytu archiwum B: {e}",
                )

        result = compare_archives(archive_a, archive_b)
        return _to_response(result)

    return await run_in_threadpool(_porownaj)


@router.post(
    "/diff/projects/{project_id_a}/{project_id_b}",
    response_model=ArchiveDiffResponse,
)
def compare_project_archives(
    project_id_a: UUID,
    project_id_b: UUID,
    uow_factory: Any = Depends(get_uow_factory),
) -> ArchiveDiffResponse:
    """
    Porownaj biezace archiwa dwoch projektow.

    Pobiera aktualny stan obu projektow, tworzy archiwa
    i wykonuje porownanie.

    Args:
        project_id_a: ID projektu A (bazowy)
        project_id_b: ID projektu B (porownywany)

    Returns:
        ArchiveDiffResponse z pelnym wynikiem porownania
    """
    with uow_factory() as uow:
        service = ProjectArchiveService(uow.session)

        try:
            archive_a = service.build_archive(project_id_a)
        except ArchiveError as e:
            raise HTTPException(
                status_code=404,
                detail=f"Blad budowania archiwum projektu A: {e}",
            )

        try:
            archive_b = service.build_archive(project_id_b)
        except ArchiveError as e:
            raise HTTPException(
                status_code=404,
                detail=f"Blad budowania archiwum projektu B: {e}",
            )

    result = compare_archives(archive_a, archive_b)
    return _to_response(result)
