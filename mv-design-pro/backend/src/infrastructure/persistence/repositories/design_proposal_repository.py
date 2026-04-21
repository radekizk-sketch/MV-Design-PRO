from __future__ import annotations

from uuid import UUID

from application.analyses.design_synth.models import DesignProposal
from infrastructure.persistence.models import DesignProposalORM
from infrastructure.persistence.time_utils import ensure_utc
from sqlalchemy import select
from sqlalchemy.orm import Session


class DesignProposalRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, proposal: DesignProposal, *, commit: bool = True) -> None:
        self._session.add(
            DesignProposalORM(
                id=proposal.id,
                case_id=proposal.case_id,
                input_snapshot_id=proposal.input_snapshot_id,
                proposal_json=proposal.proposal_json,
                status=proposal.status,
                created_at=ensure_utc(proposal.created_at),
                updated_at=ensure_utc(proposal.updated_at),
            )
        )
        if commit:
            self._session.commit()

    def get(self, proposal_id: UUID) -> DesignProposal | None:
        stmt = select(DesignProposalORM).where(DesignProposalORM.id == proposal_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        return self._to_model(row) if row else None

    def list_by_case(self, case_id: UUID) -> list[DesignProposal]:
        stmt = (
            select(DesignProposalORM)
            .where(DesignProposalORM.case_id == case_id)
            .order_by(DesignProposalORM.created_at.desc(), DesignProposalORM.id.desc())
        )
        rows = self._session.execute(stmt).scalars().all()
        return [self._to_model(row) for row in rows]

    def _to_model(self, row: DesignProposalORM) -> DesignProposal:
        return DesignProposal(
            id=row.id,
            case_id=row.case_id,
            input_snapshot_id=row.input_snapshot_id,
            proposal_json=row.proposal_json,
            status=row.status,
            created_at=ensure_utc(row.created_at),
            updated_at=ensure_utc(row.updated_at),
        )
