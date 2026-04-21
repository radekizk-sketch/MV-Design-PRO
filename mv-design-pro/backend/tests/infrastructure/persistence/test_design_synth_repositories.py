from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from application.analyses.design_synth.models import (
    DesignEvidence,
    DesignProposal,
    DesignSpec,
)
from domain.models import OperatingCase, Project
from infrastructure.persistence.db import (
    create_engine_from_url,
    create_session_factory,
    init_db,
)
from infrastructure.persistence.models import _canonicalize
from infrastructure.persistence.repositories import (
    CaseRepository,
    DesignEvidenceRepository,
    DesignProposalRepository,
    DesignSpecRepository,
    ProjectRepository,
)
from sqlalchemy import text
from sqlalchemy.orm import Session


def _setup_session() -> Session:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    return session_factory()


def _seed_project_and_case(session: Session) -> OperatingCase:
    project = Project(id=uuid4(), name="DesignSynth")
    ProjectRepository(session).add(project)
    case = OperatingCase(
        id=uuid4(),
        project_id=project.id,
        name="Case",
        case_payload={"base_mva": 100.0},
    )
    CaseRepository(session).add_operating_case(case)
    return case


def test_design_spec_repository_roundtrip_and_list() -> None:
    session = _setup_session()
    case = _seed_project_and_case(session)

    repo = DesignSpecRepository(session)
    now = datetime.now(UTC)
    spec = DesignSpec(
        id=uuid4(),
        case_id=case.id,
        base_snapshot_id="snap-1",
        spec_json={"scope": "connection"},
        created_at=now,
        updated_at=now,
    )
    repo.add(spec)

    loaded = repo.get(spec.id)
    assert loaded is not None
    assert loaded.base_snapshot_id == "snap-1"

    items = repo.list_by_case(case.id)
    assert len(items) == 1
    assert items[0].id == spec.id
    session.close()


def test_design_proposal_repository_roundtrip_and_list() -> None:
    session = _setup_session()
    case = _seed_project_and_case(session)

    repo = DesignProposalRepository(session)
    now = datetime.now(UTC)
    proposal = DesignProposal(
        id=uuid4(),
        case_id=case.id,
        input_snapshot_id="snap-2",
        proposal_json={"items": ["cable"]},
        status="DRAFT",
        created_at=now,
        updated_at=now,
    )
    repo.add(proposal)

    loaded = repo.get(proposal.id)
    assert loaded is not None
    assert loaded.status == "DRAFT"

    items = repo.list_by_case(case.id)
    assert len(items) == 1
    assert items[0].id == proposal.id
    session.close()


def test_design_evidence_repository_roundtrip_and_list() -> None:
    session = _setup_session()
    case = _seed_project_and_case(session)

    repo = DesignEvidenceRepository(session)
    evidence = DesignEvidence(
        id=uuid4(),
        case_id=case.id,
        snapshot_id="snap-3",
        evidence_json={"runs": ["run-1"]},
        created_at=datetime.now(UTC),
    )
    repo.add(evidence)

    loaded = repo.get(evidence.id)
    assert loaded is not None
    assert loaded.snapshot_id == "snap-3"

    items = repo.list_by_case(case.id)
    assert len(items) == 1
    assert items[0].id == evidence.id
    session.close()


def test_design_spec_canonical_json_determinism() -> None:
    session = _setup_session()
    case = _seed_project_and_case(session)

    repo = DesignSpecRepository(session)
    payload = {"b": 1, "a": {"d": 2, "c": 3}}
    spec = DesignSpec(
        id=uuid4(),
        case_id=case.id,
        base_snapshot_id="snap-4",
        spec_json=payload,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    repo.add(spec)

    raw = session.execute(
        text("select spec_json from design_specs where id = :id"),
        {"id": str(spec.id)},
    ).scalar_one()
    expected = json.dumps(_canonicalize(payload), sort_keys=True, separators=(",", ":"))

    assert raw == expected
    session.close()
