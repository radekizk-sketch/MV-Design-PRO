"""
API magazynu wygenerowanych dokumentow projektu (karta F-E8.3).

Cykl zycia dokumentu przechwyconego z ISTNIEJACYCH generatorow (raport, dowod
WHITE BOX, studium OZE, archiwum ZIP). Magazyn NIE generuje — przechwytuje
REALNY wynik generatora (opt-in `zapisz_do_magazynu`) i wystawia liste +
pobranie/podglad. Zero fabrykacji: kazda dana rekordu (status, data, rozmiar,
strony, SHA) pochodzi z REALNEJ tresci; brak rekordu = uczciwy stan „Do
wygenerowania" po stronie huba.

Endpointy:
  GET /api/projects/{project_id}/documents         — lista (deterministyczna),
  GET /api/documents/{document_id}/content         — strumien (pobranie/podglad).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from infrastructure.persistence.repositories.document_store_repository import (
    DocumentRecord,
    build_document_record,
    document_store_repository_scope,
)

router = APIRouter(tags=["document-store"])

# Media type per format magazynu (spojne z generatorami).
_MEDIA_TYPES: dict[str, str] = {
    "PDF": "application/pdf",
    "DOCX": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "JSON": "application/json",
    "LATEX": "application/x-tex",
    "ZIP": "application/zip",
}

_DEFAULT_MEDIA_TYPE = "application/octet-stream"


def store_generated_document(
    *,
    project_ref: str | None,
    doc_type: str,
    doc_format: str,
    filename: str,
    content: bytes,
    source: str,
    run_ref: str | None = None,
    captured_at: datetime | None = None,
) -> DocumentRecord | None:
    """Przechwyc wynik generatora do magazynu (idempotentny upsert).

    Zwraca None gdy brak identyfikatora projektu (nie ma czego powiazac) —
    generacja i pobranie pliku dzialaja niezaleznie, magazyn jest addytywny.
    """
    if not project_ref:
        return None
    record = build_document_record(
        project_id=str(project_ref),
        doc_type=doc_type,
        doc_format=doc_format,
        filename=filename,
        content=content,
        source=source,
        run_ref=run_ref,
        created_at=captured_at or datetime.now(UTC),
    )
    with document_store_repository_scope() as repository:
        repository.upsert(record)
    return record


def store_generated_document_from_response(
    response: Response,
    *,
    project_ref: str | None,
    doc_type: str,
    doc_format: str,
    source: str,
    run_ref: str | None = None,
    captured_at: datetime | None = None,
) -> DocumentRecord | None:
    """Wariant przechwytujacy tresc z gotowej odpowiedzi generatora (`.body`)."""
    content = bytes(response.body or b"")
    filename = _filename_from_response(response) or f"dokument.{doc_format.lower()}"
    return store_generated_document(
        project_ref=project_ref,
        doc_type=doc_type,
        doc_format=doc_format,
        filename=filename,
        content=content,
        source=source,
        run_ref=run_ref,
        captured_at=captured_at,
    )


def _filename_from_response(response: Response) -> str | None:
    disposition = response.headers.get("content-disposition", "")
    marker = 'filename="'
    start = disposition.find(marker)
    if start == -1:
        return None
    start += len(marker)
    end = disposition.find('"', start)
    if end == -1:
        return None
    return disposition[start:end]


def _document_view(record: DocumentRecord) -> dict[str, Any]:
    """Widok rekordu do listy (exclude_none: strony/run_ref opcjonalne)."""
    view: dict[str, Any] = {
        "id": str(record.id),
        "project_id": record.project_id,
        "doc_type": record.doc_type,
        "doc_format": record.doc_format,
        "filename": record.filename,
        "size_bytes": record.size_bytes,
        "sha256": record.sha256,
        "source": record.source,
        "created_at": record.created_at.isoformat(),
        "content_url": f"/api/documents/{record.id}/content",
    }
    if record.page_count is not None:
        view["page_count"] = record.page_count
    if record.run_ref is not None:
        view["run_ref"] = record.run_ref
    return view


@router.get("/api/projects/{project_id}/documents")
def list_project_documents(project_id: str) -> dict[str, Any]:
    with document_store_repository_scope() as repository:
        records = repository.list_by_project(project_id)
    return {
        "project_id": project_id,
        "items": [_document_view(record) for record in records],
        "count": len(records),
    }


@router.get("/api/documents/{document_id}/content")
def get_document_content(
    document_id: UUID,
    inline: bool = Query(default=False),
) -> Response:
    with document_store_repository_scope() as repository:
        record = repository.get(document_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nie znaleziono dokumentu {document_id}",
        )
    disposition = "inline" if inline else "attachment"
    return Response(
        content=record.content,
        media_type=_MEDIA_TYPES.get(record.doc_format, _DEFAULT_MEDIA_TYPE),
        headers={
            "Content-Disposition": f'{disposition}; filename="{record.filename}"',
        },
    )
