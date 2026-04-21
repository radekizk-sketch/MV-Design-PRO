from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import TYPE_CHECKING
from uuid import UUID

from infrastructure.persistence.db import (
    create_engine_from_url,
    create_session_factory,
    init_db,
    session_scope,
)
from infrastructure.persistence.models import CanonicalRunORM
from infrastructure.persistence.time_utils import ensure_utc
from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session, sessionmaker

if TYPE_CHECKING:
    from enm.canonical_analysis import CanonicalRun


_DEFAULT_DATABASE_URL = "sqlite+pysqlite:///./mv_design_pro.db"
_cached_database_url: str | None = None
_cached_engine: Engine | None = None
_cached_session_factory: sessionmaker[Session] | None = None


def _resolve_database_url() -> str:
    return os.getenv("DATABASE_URL", _DEFAULT_DATABASE_URL)


def get_canonical_run_session_factory() -> sessionmaker[Session]:
    global _cached_database_url, _cached_engine, _cached_session_factory

    database_url = _resolve_database_url()
    if _cached_session_factory is not None and _cached_database_url == database_url:
        return _cached_session_factory

    if _cached_engine is not None:
        _cached_engine.dispose()

    engine = create_engine_from_url(database_url)
    init_db(engine)
    _cached_database_url = database_url
    _cached_engine = engine
    _cached_session_factory = create_session_factory(engine)
    return _cached_session_factory


@contextmanager
def canonical_run_repository_scope() -> Iterator[CanonicalRunRepository]:
    session_factory = get_canonical_run_session_factory()
    with session_scope(session_factory) as session:
        yield CanonicalRunRepository(session)


class CanonicalRunRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, run: CanonicalRun) -> None:
        self._session.add(self._to_orm(run))

    def save(self, run: CanonicalRun) -> None:
        row = self._session.get(CanonicalRunORM, run.id)
        if row is None:
            self._session.add(self._to_orm(run))
            return

        row.case_id = run.case_id
        row.project_id = run.project_id
        row.analysis_type = run.analysis_type
        row.status = run.status
        row.result_status = run.result_status
        row.created_at = ensure_utc(run.created_at)
        row.started_at = ensure_utc(run.started_at)
        row.finished_at = ensure_utc(run.finished_at)
        row.snapshot_hash = run.snapshot_hash
        row.input_hash = run.input_hash
        row.snapshot_json = run.snapshot
        row.validation_json = run.validation
        row.readiness_json = run.readiness
        row.options_json = run.options
        row.error_message = run.error_message
        row.raw_result_json = run.raw_result
        row.white_box_trace_json = run.white_box_trace
        row.power_flow_trace_json = run.power_flow_trace

    def exists(self, run_id: UUID) -> bool:
        stmt = select(CanonicalRunORM.id).where(CanonicalRunORM.id == run_id)
        return self._session.execute(stmt).scalar_one_or_none() is not None

    def get(self, run_id: UUID) -> CanonicalRun | None:
        row = self._session.get(CanonicalRunORM, run_id)
        return self._to_domain(row) if row is not None else None

    def list_by_case(self, case_id: str) -> list[CanonicalRun]:
        stmt = (
            select(CanonicalRunORM)
            .where(CanonicalRunORM.case_id == case_id)
            .order_by(CanonicalRunORM.created_at.desc(), CanonicalRunORM.id.desc())
        )
        rows = self._session.execute(stmt).scalars().all()
        return [self._to_domain(row) for row in rows]

    def list_by_project(
        self,
        project_id: str,
        *,
        analysis_type: str | None = None,
    ) -> list[CanonicalRun]:
        stmt = (
            select(CanonicalRunORM)
            .where(CanonicalRunORM.project_id == project_id)
            .order_by(CanonicalRunORM.created_at.desc(), CanonicalRunORM.id.desc())
        )
        if analysis_type is not None:
            stmt = stmt.where(CanonicalRunORM.analysis_type == analysis_type)
        rows = self._session.execute(stmt).scalars().all()
        return [self._to_domain(row) for row in rows]

    def clear_all(self) -> None:
        self._session.execute(delete(CanonicalRunORM))

    def _to_domain(self, row: CanonicalRunORM) -> CanonicalRun:
        from enm.canonical_analysis import CanonicalRun

        return CanonicalRun(
            id=row.id,
            case_id=row.case_id,
            project_id=row.project_id,
            analysis_type=row.analysis_type,
            status=row.status,
            created_at=ensure_utc(row.created_at),
            snapshot_hash=row.snapshot_hash,
            input_hash=row.input_hash,
            snapshot=row.snapshot_json or {},
            validation=row.validation_json or {},
            readiness=row.readiness_json or {},
            options=row.options_json or {},
            started_at=ensure_utc(row.started_at),
            finished_at=ensure_utc(row.finished_at),
            error_message=row.error_message,
            result_status=row.result_status,
            raw_result=row.raw_result_json,
            white_box_trace=list(row.white_box_trace_json or []),
            power_flow_trace=row.power_flow_trace_json,
        )

    def _to_orm(self, run: CanonicalRun) -> CanonicalRunORM:
        return CanonicalRunORM(
            id=run.id,
            case_id=run.case_id,
            project_id=run.project_id,
            analysis_type=run.analysis_type,
            status=run.status,
            result_status=run.result_status,
            created_at=ensure_utc(run.created_at),
            started_at=ensure_utc(run.started_at),
            finished_at=ensure_utc(run.finished_at),
            snapshot_hash=run.snapshot_hash,
            input_hash=run.input_hash,
            snapshot_json=run.snapshot,
            validation_json=run.validation,
            readiness_json=run.readiness,
            options_json=run.options,
            error_message=run.error_message,
            raw_result_json=run.raw_result,
            white_box_trace_json=run.white_box_trace,
            power_flow_trace_json=run.power_flow_trace,
        )
