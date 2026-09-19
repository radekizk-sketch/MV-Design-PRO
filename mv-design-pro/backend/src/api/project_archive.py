"""
API endpoints dla Project Archive — P31.

POST /projects/{project_id}/export - Eksport projektu do archiwum
POST /projects/import - Import projektu z archiwum
POST /projects/import/preview - Podgląd zawartości archiwum
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from api.document_store import store_generated_document
from application.project_archive.service import ProjectArchiveService
from domain.project_archive import ArchiveError
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

router = APIRouter(prefix="/projects", tags=["project-archive"])


# ============================================================================
# RESPONSE MODELS
# ============================================================================


class ExportResponse(BaseModel):
    """Odpowiedź eksportu (metadane)."""

    message: str
    project_id: str
    archive_hash: str
    filename: str


class ImportResponse(BaseModel):
    """Odpowiedź importu."""

    status: str  # SUCCESS, PARTIAL, FAILED, CATALOG_MAPPING_REQUIRED
    project_id: str | None
    warnings: list[str]
    errors: list[str]
    migrated_from_version: str | None
    # Bramka katalogowa po imporcie
    elements_without_catalog: list[str] = []
    catalog_mapping_required: bool = False


class ArchiveSummary(BaseModel):
    """Podsumowanie zawartości archiwum.

    W1-B-ARCH: model sieci żyje wyłącznie w ENM — archiwum formatu 3.0.0 nie
    niesie już sekcji `network_model`/`sld_diagrams`/`proofs` (tabele ORM,
    które je zasilały, skasował W1), więc podsumowanie liczy to, co archiwum
    NAPRAWDĘ niesie: przypadki, biegi kanoniczne, wpisy modelu ENM per
    przypadek (`enm_models_count`).
    """

    study_cases_count: int
    operating_cases_count: int
    canonical_runs_count: int
    enm_models_count: int


class PreviewResponse(BaseModel):
    """Odpowiedź podglądu archiwum."""

    valid: bool
    error: str | None = None
    format_id: str | None = None
    schema_version: str | None = None
    project_name: str | None = None
    project_description: str | None = None
    exported_at: str | None = None
    archive_hash: str | None = None
    summary: ArchiveSummary | None = None


# ============================================================================
# ENDPOINTS
# ============================================================================


@router.post("/{project_id}/export")
def export_project(
    project_id: UUID,
    zapisz_do_magazynu: bool = Query(default=False),
    uow_factory: Any = Depends(get_uow_factory),
) -> Response:
    """
    Eksportuj projekt do archiwum ZIP.

    Args:
        project_id: ID projektu do eksportu
        zapisz_do_magazynu: gdy True, przechwyc archiwum do magazynu dokumentow
            (karta F-E8.3) — cykl zycia dokumentu w hubie Dokumentacji.

    Returns:
        Plik ZIP z archiwum projektu
    """
    filename = f"projekt_{project_id}.mvdp.zip"
    with uow_factory() as uow:
        service = ProjectArchiveService(uow.session)

        try:
            archive_bytes = service.export_project(project_id)
        except ArchiveError as e:
            raise HTTPException(status_code=404, detail=str(e))

    if zapisz_do_magazynu:
        store_generated_document(
            project_ref=str(project_id),
            doc_type="ARCHIWUM",
            doc_format="ZIP",
            filename=filename,
            content=archive_bytes,
            source="project-archive",
        )

    # Zwróć jako plik do pobrania
    return Response(
        content=archive_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import", response_model=ImportResponse)
async def import_project(
    file: UploadFile = File(description="Archiwum projektu (ZIP)"),
    new_name: str | None = Form(None, description="Nowa nazwa projektu (opcjonalna)"),
    verify_integrity: bool = Form(True, description="Weryfikuj integralność"),
    uow_factory: Any = Depends(get_uow_factory),
) -> ImportResponse:
    """
    Importuj projekt z archiwum ZIP.

    Args:
        file: Plik archiwum ZIP
        new_name: Opcjonalna nowa nazwa projektu
        verify_integrity: Czy weryfikować integralność archiwum

    Returns:
        Wynik importu z informacjami o statusie
    """
    # Walidacja typu pliku
    if not file.filename or not (
        file.filename.endswith(".zip") or file.filename.endswith(".mvdp.zip")
    ):
        return ImportResponse(
            status="FAILED",
            project_id=None,
            warnings=[],
            errors=["Nieprawidłowe rozszerzenie pliku. Oczekiwano .zip lub .mvdp.zip"],
            migrated_from_version=None,
        )

    # Odczytaj zawartość pliku
    archive_bytes = await file.read()

    # WSPÓŁBIEŻNOŚĆ: końcówka zostaje `async def`, bo czyta przesłany plik
    # (`await file.read()`). Sam import — rozpakowanie ZIP, walidacja i zapisy
    # do bazy przez sync SQLAlchemy — jest blokujący i idzie do puli wątków;
    # na pętli zdarzeń wstrzymywał obsługę wszystkich pozostałych żądań.
    def _importuj() -> Any:
        with uow_factory() as uow:
            service = ProjectArchiveService(uow.session)
            return service.import_project(
                archive_bytes=archive_bytes,
                new_project_name=new_name,
                verify_integrity=verify_integrity,
            )

    result = await run_in_threadpool(_importuj)

    return ImportResponse(
        status=result.status.value,
        project_id=result.project_id,
        warnings=result.warnings,
        errors=result.errors,
        migrated_from_version=result.migrated_from_version,
        elements_without_catalog=result.elements_without_catalog,
        catalog_mapping_required=result.catalog_mapping_required,
    )


@router.post("/import/preview", response_model=PreviewResponse)
async def preview_archive(
    file: UploadFile = File(description="Archiwum projektu (ZIP)"),
    uow_factory: Any = Depends(get_uow_factory),
) -> PreviewResponse:
    """
    Podgląd zawartości archiwum bez importu.

    Args:
        file: Plik archiwum ZIP

    Returns:
        Podsumowanie zawartości archiwum
    """
    archive_bytes = await file.read()

    # WSPÓŁBIEŻNOŚĆ: jak w `import_project` — `await` na treści pliku zostaje,
    # rozpakowanie i odczyt zawartości archiwum idą do puli wątków.
    def _podejrzyj() -> Any:
        with uow_factory() as uow:
            service = ProjectArchiveService(uow.session)
            return service.preview_archive(archive_bytes)

    preview = await run_in_threadpool(_podejrzyj)

    if not preview.get("valid"):
        return PreviewResponse(
            valid=False,
            error=preview.get("error"),
        )

    summary_data = preview.get("summary", {})
    return PreviewResponse(
        valid=True,
        format_id=preview.get("format_id"),
        schema_version=preview.get("schema_version"),
        project_name=preview.get("project_name"),
        project_description=preview.get("project_description"),
        exported_at=preview.get("exported_at"),
        archive_hash=preview.get("archive_hash"),
        summary=ArchiveSummary(
            study_cases_count=summary_data.get("study_cases_count", 0),
            operating_cases_count=summary_data.get("operating_cases_count", 0),
            canonical_runs_count=summary_data.get("canonical_runs_count", 0),
            enm_models_count=summary_data.get("enm_models_count", 0),
        ),
    )
