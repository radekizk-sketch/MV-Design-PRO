"""Repozytorium serii biegow (`run_batches`, R2) — karta CV-3.3-C.

Obok `CanonicalRunRepository` (`canonical_run_repository.py`): TA SAMA baza
(`DATABASE_URL`), TEN SAM mechanizm sesji (`get_canonical_run_session_factory`,
`infrastructure/persistence/db.py`) — seria zyje w TEJ SAMEJ bazie co biegi,
ktore orkiestruje, wiec `GET` serii po restarcie procesu backendu zwraca TA
SAMA serie (karta §0 C3). Osobny silnik/cache sesji dla tej jednej tabeli
powtarzalby dlug wspolbieznosci, ktory `canonical_run_repository.py` juz
zamknal (`_blokada_silnika`) — reuzycie, nie druga droga do tego samego stanu.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import TYPE_CHECKING
from uuid import UUID

from infrastructure.persistence.db import session_scope
from infrastructure.persistence.models import RunBatchORM
from infrastructure.persistence.repositories.canonical_run_repository import (
    get_canonical_run_session_factory,
)
from infrastructure.persistence.time_utils import ensure_utc
from sqlalchemy import select
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from domain.run_batch import RunBatch


@contextmanager
def run_batch_repository_scope() -> Iterator[RunBatchRepository]:
    session_factory = get_canonical_run_session_factory()
    with session_scope(session_factory) as session:
        yield RunBatchRepository(session)


class RunBatchRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, batch: RunBatch) -> None:
        self._session.add(self._to_orm(batch))

    def save(self, batch: RunBatch) -> None:
        row = self._session.get(RunBatchORM, batch.id)
        if row is None:
            self._session.add(self._to_orm(batch))
            return
        row.project_id = batch.project_id
        row.case_id = str(batch.case_id)
        row.analysis_type = batch.analysis_type.value
        row.name = batch.name
        row.status = batch.status.value
        row.created_at = ensure_utc(batch.created_at)
        row.finished_at = ensure_utc(batch.finished_at)
        row.envelope_json = batch.envelope
        row.items_json = [pozycja.to_dict() for pozycja in batch.sorted_items()]
        row.batch_input_hash = batch.batch_input_hash

    def get(self, batch_id: UUID) -> RunBatch | None:
        row = self._session.get(RunBatchORM, batch_id)
        return self._to_domain(row) if row is not None else None

    def list_by_case(self, case_id: str) -> list[RunBatch]:
        stmt = (
            select(RunBatchORM)
            .where(RunBatchORM.case_id == case_id)
            .order_by(RunBatchORM.created_at.desc(), RunBatchORM.id.desc())
        )
        return [self._to_domain(row) for row in self._session.execute(stmt).scalars().all()]

    def clear_all(self) -> None:
        self._session.execute(RunBatchORM.__table__.delete())

    def _to_domain(self, row: RunBatchORM) -> RunBatch:
        from domain.execution import ExecutionAnalysisType
        from domain.run_batch import RunBatch, RunBatchItem, RunBatchStatus

        return RunBatch(
            id=row.id,
            project_id=row.project_id,
            case_id=UUID(row.case_id),
            analysis_type=ExecutionAnalysisType(row.analysis_type),
            name=row.name,
            created_at=ensure_utc(row.created_at),
            finished_at=ensure_utc(row.finished_at),
            status=RunBatchStatus(row.status),
            envelope=row.envelope_json,
            items=tuple(RunBatchItem.from_dict(p) for p in row.items_json),
            batch_input_hash=row.batch_input_hash,
        )

    def _to_orm(self, batch: RunBatch) -> RunBatchORM:
        return RunBatchORM(
            id=batch.id,
            project_id=batch.project_id,
            case_id=str(batch.case_id),
            analysis_type=batch.analysis_type.value,
            name=batch.name,
            status=batch.status.value,
            created_at=ensure_utc(batch.created_at),
            finished_at=ensure_utc(batch.finished_at),
            envelope_json=batch.envelope,
            items_json=[pozycja.to_dict() for pozycja in batch.sorted_items()],
            batch_input_hash=batch.batch_input_hash,
        )
