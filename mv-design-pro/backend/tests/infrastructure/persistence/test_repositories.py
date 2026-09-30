from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from domain.models import OperatingCase, Project, StudyCase
from infrastructure.persistence.db import (
    create_engine_from_url,
    create_session_factory,
    init_db,
)
from infrastructure.persistence.repositories import (
    CaseRepository,
    ProjectRepository,
)
from sqlalchemy.orm import Session


def _setup_session() -> Session:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    return session_factory()


def test_project_repository_roundtrip() -> None:
    session = _setup_session()
    repo = ProjectRepository(session)
    project = Project(id=uuid4(), name="MV Project", description="Test", schema_version="1.0")

    repo.add(project)
    loaded = repo.get(project.id)

    assert loaded is not None
    assert loaded.name == "MV Project"

    updated = Project(
        id=project.id,
        name="MV Project Updated",
        description="Updated",
        schema_version="1.1",
        created_at=project.created_at,
        updated_at=datetime.now(UTC),
    )
    repo.update(updated)
    reloaded = repo.get(project.id)

    assert reloaded is not None
    assert reloaded.name == "MV Project Updated"
    session.close()


# W1 (2026-09-09): `test_network_repository_nodes_and_branches` i `test_sld_repository`
# usunięte razem z `NetworkRepository`/`SldRepository` i tabelami `network_*`/`sld_*`
# (legacy persystencja sieci; jedyna prawda sieci to ENM w magazynie projektu —
# `enm/store.py`, roundtrip pokryty w `tests/enm/`).


def test_case_repository_operating_and_study_cases() -> None:
    session = _setup_session()
    project = Project(id=uuid4(), name="Cases")
    ProjectRepository(session).add(project)

    repo = CaseRepository(session)
    operating_case = OperatingCase(
        id=uuid4(),
        project_id=project.id,
        name="Normal",
        case_payload={"load": 1.0, "flags": ["a", "b"]},
    )
    study_case = StudyCase(
        id=uuid4(),
        project_id=project.id,
        name="Study",
        study_payload={"mode": "pf"},
    )

    repo.add_operating_case(operating_case)
    repo.add_study_case(study_case)

    loaded_op = repo.get_operating_case(operating_case.id)
    loaded_study = repo.get_study_case(study_case.id)

    assert loaded_op is not None
    assert loaded_op.case_payload["load"] == 1.0
    assert loaded_study is not None
    assert loaded_study.study_payload["mode"] == "pf"
    session.close()


# CV-3.3-B: `test_study_runs_and_results` (roundtrip `StudyRunRepository` +
# `ResultRepository`) usunięty razem z obiema klasami — R3 `study_runs`/
# `study_results`, zero konsumentów produkcyjnych po przepięciu porównań i
# biegów zabezpieczeń na R1 (`canonical_runs`). Analogiczny roundtrip biegu
# kanonicznego jest pokryty w `tests/enm/` (`canonical_run_repository`).
