"""
Repozytorium magazynu wygenerowanych dokumentow projektu (karta F-E8.3).

Reuzywa DOKLADNIE tego samego wzorca persystencji co kanoniczne przebiegi
(`canonical_run_repository`): samodzielny scope z cache'owana fabryka sesji
opartа o `DATABASE_URL` (SQLite domyslnie). Magazyn zyje w TYM SAMYM zrodle
danych co przebiegi — zero nowego plumbingu, zero nowych zaleznosci.

Determinizm metadanych: tozsamosc rekordu = uuid5(project_id, doc_type,
doc_format, run_ref) → upsert; SHA-256 tresci stabilny; liczba stron liczona
z realnych bajtow PDF bez nowej zaleznosci (parser obiektow /Type /Page).
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from uuid import NAMESPACE_URL, UUID, uuid5

from infrastructure.persistence.db import session_scope
from infrastructure.persistence.models import DocumentRecordORM
from infrastructure.persistence.repositories.canonical_run_repository import (
    get_canonical_run_session_factory,
)
from infrastructure.persistence.time_utils import ensure_utc
from sqlalchemy import select
from sqlalchemy.orm import Session

# Zamknieta unia typow dokumentu — zgodna z kartami huba (model.ts). RAPORT_ZGODNOSCI
# i LISTA_MATERIALOWA (BOM) dolaczone w D4 (RECENZJA_DER_SN_DOBORY_2026-07, 12+13+BOM):
# maja REALNYCH generatorow (application/analyses/raport_zgodnosci + lista_materialowa),
# co domyka jawny dlug BOM z V12K-094/096 (juz NIE phantom).
DOCUMENT_TYPES: frozenset[str] = frozenset(
    {"RAPORT", "DOWOD", "STUDIUM_OZE", "ARCHIWUM", "RAPORT_ZGODNOSCI", "LISTA_MATERIALOWA"}
)

# Regex obiektu strony PDF: /Type /Page (z granica slowa, by wykluczyc /Pages).
_PDF_PAGE_OBJECT = re.compile(rb"/Type\s*/Page(?![s])")


@dataclass(frozen=True)
class DocumentRecord:
    """Niezmienny rekord magazynu (metadane + tresc BLOB)."""

    id: UUID
    project_id: str
    doc_type: str
    doc_format: str
    filename: str
    content: bytes
    size_bytes: int
    sha256: str
    created_at: datetime
    source: str
    run_ref: str | None = None
    page_count: int | None = None


def deterministic_document_id(
    *, project_id: str, doc_type: str, doc_format: str, run_ref: str | None
) -> UUID:
    """Stabilny identyfikator rekordu z seed (jeden rekord per logiczny dokument)."""
    seed = f"mvdp-document:{project_id}:{doc_type}:{doc_format}:{run_ref or '-'}"
    return uuid5(NAMESPACE_URL, seed)


def compute_content_sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def count_pdf_pages(content: bytes) -> int | None:
    """Policz strony realnego PDF bez nowej zaleznosci; None gdy nie PDF."""
    if not content.startswith(b"%PDF"):
        return None
    matches = _PDF_PAGE_OBJECT.findall(content)
    count = len(matches)
    return count if count > 0 else None


def build_document_record(
    *,
    project_id: str,
    doc_type: str,
    doc_format: str,
    filename: str,
    content: bytes,
    source: str,
    created_at: datetime,
    run_ref: str | None = None,
) -> DocumentRecord:
    """Zbuduj rekord z REALNEJ tresci (SHA/rozmiar/strony wyliczone, nie podane)."""
    if doc_type not in DOCUMENT_TYPES:
        raise ValueError(f"Nieznany typ dokumentu: {doc_type!r}")
    return DocumentRecord(
        id=deterministic_document_id(
            project_id=project_id,
            doc_type=doc_type,
            doc_format=doc_format,
            run_ref=run_ref,
        ),
        project_id=project_id,
        doc_type=doc_type,
        doc_format=doc_format,
        filename=filename,
        content=content,
        size_bytes=len(content),
        sha256=compute_content_sha256(content),
        page_count=count_pdf_pages(content),
        run_ref=run_ref,
        source=source,
        created_at=ensure_utc(created_at),
    )


class DocumentStoreRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert(self, record: DocumentRecord) -> None:
        row = self._session.get(DocumentRecordORM, record.id)
        if row is None:
            self._session.add(self._to_orm(record))
            return
        row.project_id = record.project_id
        row.doc_type = record.doc_type
        row.doc_format = record.doc_format
        row.filename = record.filename
        row.content = record.content
        row.size_bytes = record.size_bytes
        row.sha256 = record.sha256
        row.page_count = record.page_count
        row.run_ref = record.run_ref
        row.source = record.source
        row.created_at = ensure_utc(record.created_at)

    def get(self, document_id: UUID) -> DocumentRecord | None:
        row = self._session.get(DocumentRecordORM, document_id)
        return self._to_domain(row) if row is not None else None

    def list_by_project(self, project_id: str) -> list[DocumentRecord]:
        stmt = (
            select(DocumentRecordORM)
            .where(DocumentRecordORM.project_id == project_id)
            .order_by(
                DocumentRecordORM.created_at.desc(),
                DocumentRecordORM.doc_type.asc(),
                DocumentRecordORM.doc_format.asc(),
                DocumentRecordORM.id.asc(),
            )
        )
        rows = self._session.execute(stmt).scalars().all()
        return [self._to_domain(row) for row in rows]

    def _to_orm(self, record: DocumentRecord) -> DocumentRecordORM:
        return DocumentRecordORM(
            id=record.id,
            project_id=record.project_id,
            doc_type=record.doc_type,
            doc_format=record.doc_format,
            filename=record.filename,
            content=record.content,
            size_bytes=record.size_bytes,
            sha256=record.sha256,
            page_count=record.page_count,
            run_ref=record.run_ref,
            source=record.source,
            created_at=ensure_utc(record.created_at),
        )

    def _to_domain(self, row: DocumentRecordORM) -> DocumentRecord:
        return DocumentRecord(
            id=row.id,
            project_id=row.project_id,
            doc_type=row.doc_type,
            doc_format=row.doc_format,
            filename=row.filename,
            content=bytes(row.content),
            size_bytes=row.size_bytes,
            sha256=row.sha256,
            page_count=row.page_count,
            run_ref=row.run_ref,
            source=row.source,
            created_at=ensure_utc(row.created_at),
        )


@contextmanager
def document_store_repository_scope() -> Iterator[DocumentStoreRepository]:
    session_factory = get_canonical_run_session_factory()
    with session_scope(session_factory) as session:
        yield DocumentStoreRepository(session)
