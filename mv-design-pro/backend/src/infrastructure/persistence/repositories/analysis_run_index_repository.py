from __future__ import annotations

from application.analyses.run_index import AnalysisRunIndexEntry
from infrastructure.persistence.models import AnalysisRunIndexORM
from infrastructure.persistence.time_utils import ensure_utc
from sqlalchemy import select
from sqlalchemy.orm import Session


class AnalysisRunIndexRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, run: AnalysisRunIndexEntry) -> None:
        self._session.add(
            AnalysisRunIndexORM(
                run_id=run.run_id,
                analysis_type=run.analysis_type,
                case_id=run.case_id,
                base_snapshot_id=run.base_snapshot_id,
                primary_artifact_type=run.primary_artifact_type,
                primary_artifact_id=run.primary_artifact_id,
                fingerprint=run.fingerprint,
                created_at_utc=ensure_utc(run.created_at_utc),
                status=run.status,
                meta_json=run.meta_json,
            )
        )

    def get(self, run_id: str) -> AnalysisRunIndexEntry | None:
        stmt = select(AnalysisRunIndexORM).where(AnalysisRunIndexORM.run_id == run_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        return self._to_domain(row) if row else None

    def list(
        self,
        *,
        case_id: str | None = None,
        analysis_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AnalysisRunIndexEntry]:
        stmt = select(AnalysisRunIndexORM)
        if case_id:
            stmt = stmt.where(AnalysisRunIndexORM.case_id == case_id)
        if analysis_type:
            stmt = stmt.where(AnalysisRunIndexORM.analysis_type == analysis_type)
        stmt = (
            stmt.order_by(
                AnalysisRunIndexORM.created_at_utc.desc(),
                AnalysisRunIndexORM.run_id.desc(),
            )
            .limit(limit)
            .offset(offset)
        )
        rows = self._session.execute(stmt).scalars().all()
        return [self._to_domain(row) for row in rows]

    def _to_domain(self, row: AnalysisRunIndexORM) -> AnalysisRunIndexEntry:
        return AnalysisRunIndexEntry(
            run_id=row.run_id,
            analysis_type=row.analysis_type,
            case_id=row.case_id,
            base_snapshot_id=row.base_snapshot_id,
            primary_artifact_type=row.primary_artifact_type,
            primary_artifact_id=row.primary_artifact_id,
            fingerprint=row.fingerprint,
            created_at_utc=ensure_utc(row.created_at_utc),
            status=row.status,
            meta_json=row.meta_json,
        )
