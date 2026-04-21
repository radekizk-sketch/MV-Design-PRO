from __future__ import annotations

from uuid import UUID

from application.analyses.design_synth.models import DesignSpec
from infrastructure.persistence.models import DesignSpecORM
from infrastructure.persistence.time_utils import ensure_utc
from sqlalchemy import select
from sqlalchemy.orm import Session


class DesignSpecRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, spec: DesignSpec, *, commit: bool = True) -> None:
        self._session.add(
            DesignSpecORM(
                id=spec.id,
                case_id=spec.case_id,
                base_snapshot_id=spec.base_snapshot_id,
                spec_json=spec.spec_json,
                created_at=ensure_utc(spec.created_at),
                updated_at=ensure_utc(spec.updated_at),
            )
        )
        if commit:
            self._session.commit()

    def get(self, spec_id: UUID) -> DesignSpec | None:
        stmt = select(DesignSpecORM).where(DesignSpecORM.id == spec_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        return self._to_model(row) if row else None

    def list_by_case(self, case_id: UUID) -> list[DesignSpec]:
        stmt = (
            select(DesignSpecORM)
            .where(DesignSpecORM.case_id == case_id)
            .order_by(DesignSpecORM.created_at.desc(), DesignSpecORM.id.desc())
        )
        rows = self._session.execute(stmt).scalars().all()
        return [self._to_model(row) for row in rows]

    def _to_model(self, row: DesignSpecORM) -> DesignSpec:
        return DesignSpec(
            id=row.id,
            case_id=row.case_id,
            base_snapshot_id=row.base_snapshot_id,
            spec_json=row.spec_json,
            created_at=ensure_utc(row.created_at),
            updated_at=ensure_utc(row.updated_at),
        )
