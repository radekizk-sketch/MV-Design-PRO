from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID, uuid4

from application.analyses.design_synth.models import (
    DesignEvidence,
    DesignProposal,
    DesignSpec,
)
from infrastructure.persistence.unit_of_work import UnitOfWork


class DesignSynthService:
    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    def create_spec(self, case_id: UUID, base_snapshot_id: str, spec_payload: dict) -> UUID:
        spec_id = uuid4()
        now = datetime.now(UTC)
        spec = DesignSpec(
            id=spec_id,
            case_id=case_id,
            base_snapshot_id=base_snapshot_id,
            spec_json=spec_payload,
            created_at=now,
            updated_at=now,
        )
        with self._uow_factory() as uow:
            uow.design_specs.add(spec)
        return spec_id

    def get_spec(self, spec_id: UUID) -> DesignSpec:
        with self._uow_factory() as uow:
            spec = uow.design_specs.get(spec_id)
        if spec is None:
            raise ValueError(f"DesignSpec {spec_id} not found")
        return spec

    def list_specs(self, case_id: UUID) -> list[DesignSpec]:
        with self._uow_factory() as uow:
            return uow.design_specs.list_by_case(case_id)

    def create_proposal(
        self,
        case_id: UUID,
        input_snapshot_id: str,
        proposal_payload: dict,
        *,
        status: str = "DRAFT",
    ) -> UUID:
        proposal_id = uuid4()
        now = datetime.now(UTC)
        proposal = DesignProposal(
            id=proposal_id,
            case_id=case_id,
            input_snapshot_id=input_snapshot_id,
            proposal_json=proposal_payload,
            status=status,
            created_at=now,
            updated_at=now,
        )
        with self._uow_factory() as uow:
            uow.design_proposals.add(proposal)
        return proposal_id

    def get_proposal(self, proposal_id: UUID) -> DesignProposal:
        with self._uow_factory() as uow:
            proposal = uow.design_proposals.get(proposal_id)
        if proposal is None:
            raise ValueError(f"DesignProposal {proposal_id} not found")
        return proposal

    def create_evidence(
        self,
        case_id: UUID,
        snapshot_id: str,
        evidence_payload: dict,
        *,
        evidence_id: UUID | None = None,
    ) -> UUID:
        evidence_id = evidence_id or uuid4()
        now = datetime.now(UTC)
        evidence = DesignEvidence(
            id=evidence_id,
            case_id=case_id,
            snapshot_id=snapshot_id,
            evidence_json=evidence_payload,
            created_at=now,
        )
        with self._uow_factory() as uow:
            uow.design_evidence.add(evidence)
        return evidence_id

    def get_evidence(self, evidence_id: UUID) -> DesignEvidence:
        with self._uow_factory() as uow:
            evidence = uow.design_evidence.get(evidence_id)
        if evidence is None:
            raise ValueError(f"DesignEvidence {evidence_id} not found")
        return evidence
