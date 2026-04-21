from __future__ import annotations

from uuid import UUID

from application.analyses.design_synth.models import DesignEvidence
from infrastructure.persistence.models import DesignEvidenceORM
from infrastructure.persistence.time_utils import ensure_utc
from sqlalchemy import select
from sqlalchemy.orm import Session


class DesignEvidenceRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, evidence: DesignEvidence, *, commit: bool = True) -> None:
        self._session.add(
            DesignEvidenceORM(
                id=evidence.id,
                case_id=evidence.case_id,
                snapshot_id=evidence.snapshot_id,
                evidence_json=evidence.evidence_json,
                created_at=ensure_utc(evidence.created_at),
            )
        )
        if commit:
            self._session.commit()

    def get(self, evidence_id: UUID) -> DesignEvidence | None:
        stmt = select(DesignEvidenceORM).where(DesignEvidenceORM.id == evidence_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        return self._to_model(row) if row else None

    def list_by_case(self, case_id: UUID) -> list[DesignEvidence]:
        stmt = (
            select(DesignEvidenceORM)
            .where(DesignEvidenceORM.case_id == case_id)
            .order_by(DesignEvidenceORM.created_at.desc(), DesignEvidenceORM.id.desc())
        )
        rows = self._session.execute(stmt).scalars().all()
        return [self._to_model(row) for row in rows]

    def _to_model(self, row: DesignEvidenceORM) -> DesignEvidence:
        return DesignEvidence(
            id=row.id,
            case_id=row.case_id,
            snapshot_id=row.snapshot_id,
            evidence_json=row.evidence_json,
            created_at=ensure_utc(row.created_at),
        )
