from __future__ import annotations

from datetime import UTC, datetime

import pytest

pytest.importorskip("sqlalchemy")

from infrastructure.persistence.repositories.document_store_repository import (  # noqa: E402
    DocumentStoreRepository,
    build_document_record,
    count_pdf_pages,
    deterministic_document_id,
)

_FIXED_TIME = datetime(2026, 7, 23, 10, 0, 0, tzinfo=UTC)


def _record(
    *,
    project_id: str = "project-1",
    doc_type: str = "RAPORT",
    doc_format: str = "PDF",
    content: bytes = b"%PDF-1.4\n/Type /Page\n",
    run_ref: str | None = "run-1",
    created_at: datetime = _FIXED_TIME,
):
    return build_document_record(
        project_id=project_id,
        doc_type=doc_type,
        doc_format=doc_format,
        filename="raport.pdf",
        content=content,
        source="test",
        run_ref=run_ref,
        created_at=created_at,
    )


def test_upsert_then_list_and_get_roundtrip(test_db_session) -> None:
    repo = DocumentStoreRepository(test_db_session)
    record = _record()
    repo.upsert(record)
    test_db_session.commit()

    listed = repo.list_by_project("project-1")
    assert len(listed) == 1
    assert listed[0].id == record.id
    assert listed[0].doc_type == "RAPORT"
    assert listed[0].sha256 == record.sha256

    fetched = repo.get(record.id)
    assert fetched is not None
    assert fetched.content == record.content
    assert fetched.size_bytes == len(record.content)
    assert fetched.page_count == 1


def test_deterministic_id_and_sha_stable_across_two_builds() -> None:
    """Determinizm 2x: identyczne wejscie → identyczna tozsamosc, SHA, rozmiar, strony."""
    a = _record(created_at=_FIXED_TIME)
    b = _record(created_at=_FIXED_TIME)
    assert a.id == b.id
    assert a.sha256 == b.sha256
    assert a.size_bytes == b.size_bytes
    assert a.page_count == b.page_count
    assert a.id == deterministic_document_id(
        project_id="project-1", doc_type="RAPORT", doc_format="PDF", run_ref="run-1"
    )


def test_upsert_is_idempotent_single_row(test_db_session) -> None:
    repo = DocumentStoreRepository(test_db_session)
    repo.upsert(_record())
    repo.upsert(_record())  # ponowna generacja tego samego dokumentu
    test_db_session.commit()

    listed = repo.list_by_project("project-1")
    assert len(listed) == 1


def test_upsert_updates_content_on_regeneration(test_db_session) -> None:
    repo = DocumentStoreRepository(test_db_session)
    repo.upsert(_record(content=b"%PDF-1.4\n/Type /Page\n"))
    test_db_session.commit()
    updated = _record(content=b"%PDF-1.4\n/Type /Page\n/Type /Page\n")
    repo.upsert(updated)
    test_db_session.commit()

    listed = repo.list_by_project("project-1")
    assert len(listed) == 1
    assert listed[0].page_count == 2
    assert listed[0].sha256 == updated.sha256


def test_per_project_isolation(test_db_session) -> None:
    repo = DocumentStoreRepository(test_db_session)
    repo.upsert(_record(project_id="project-A", run_ref="run-A"))
    repo.upsert(_record(project_id="project-B", run_ref="run-B"))
    test_db_session.commit()

    assert len(repo.list_by_project("project-A")) == 1
    assert len(repo.list_by_project("project-B")) == 1
    assert repo.list_by_project("project-A")[0].project_id == "project-A"


def test_non_pdf_has_honest_absent_page_count() -> None:
    record = _record(doc_format="JSON", content=b'{"raport": true}')
    assert record.page_count is None
    assert count_pdf_pages(b'{"raport": true}') is None


def test_unknown_doc_type_rejected() -> None:
    with pytest.raises(ValueError):
        build_document_record(
            project_id="p",
            doc_type="BOM",
            doc_format="PDF",
            filename="x.pdf",
            content=b"%PDF",
            source="test",
            created_at=_FIXED_TIME,
        )
