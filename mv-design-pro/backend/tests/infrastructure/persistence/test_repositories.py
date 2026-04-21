from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from domain.models import OperatingCase, Project, StudyCase, StudyRun
from infrastructure.persistence.db import (
    create_engine_from_url,
    create_session_factory,
    init_db,
)
from infrastructure.persistence.repositories import (
    CaseRepository,
    NetworkRepository,
    ProjectRepository,
    ResultRepository,
    SldRepository,
    StudyRunRepository,
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


def test_network_repository_nodes_and_branches() -> None:
    session = _setup_session()
    project = Project(id=uuid4(), name="Network")
    ProjectRepository(session).add(project)

    repo = NetworkRepository(session)
    node_id = uuid4()
    other_node_id = uuid4()
    repo.replace_nodes(
        project.id,
        [
            {
                "id": node_id,
                "name": "Bus 1",
                "node_type": "bus",
                "base_kv": 15.0,
                "attrs": {"zone": "A", "order": [2, 1]},
            },
            {
                "id": other_node_id,
                "name": "Bus 2",
                "node_type": "bus",
                "base_kv": 15.0,
                "attrs": {"zone": "B"},
            },
        ],
    )
    branch_id = uuid4()
    repo.replace_branches(
        project.id,
        [
            {
                "id": branch_id,
                "name": "Line 1",
                "branch_type": "line",
                "from_node_id": node_id,
                "to_node_id": other_node_id,
                "in_service": True,
                "params": {"r": 0.1, "x": 0.2},
            }
        ],
    )

    nodes = repo.list_nodes(project.id)
    branches = repo.list_branches(project.id)

    assert len(nodes) == 2
    assert len(branches) == 1
    assert branches[0]["params"]["r"] == 0.1
    session.close()


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


def test_study_runs_and_results() -> None:
    session = _setup_session()
    project = Project(id=uuid4(), name="Runs")
    ProjectRepository(session).add(project)
    case = StudyCase(
        id=uuid4(),
        project_id=project.id,
        name="SC",
        study_payload={"analysis": "sc"},
    )
    CaseRepository(session).add_study_case(case)

    run = StudyRun(
        id=uuid4(),
        project_id=project.id,
        case_id=case.id,
        analysis_type="short_circuit",
        input_hash="hash",
    )
    run_repo = StudyRunRepository(session)
    run_repo.add(run)

    finished = datetime.now(UTC)
    run_repo.update_status(run.id, "done", finished_at=finished)
    updated = run_repo.get(run.id)

    result_repo = ResultRepository(session)
    result_id = result_repo.add_result(
        run_id=run.id,
        project_id=project.id,
        result_type="short_circuit",
        payload={"ik": 12.3},
    )
    results = result_repo.list_results(run.id)

    assert updated is not None
    assert updated.status == "done"
    assert updated.finished_at == finished
    assert results[0]["id"] == result_id
    session.close()


def test_sld_repository() -> None:
    session = _setup_session()
    project = Project(id=uuid4(), name="SLD")
    ProjectRepository(session).add(project)

    repo = SldRepository(session)
    sld_id = repo.save(project_id=project.id, name="Main", payload={"nodes": []})
    diagrams = repo.list_by_project(project.id)

    assert diagrams[0]["id"] == sld_id
    assert diagrams[0]["payload"] == {
        "version": 1,
        "name": "Main",
        "nodes": [],
        "branches": [],
        "annotations": [],
        "dirty_flag": False,
    }

    loaded = repo.get(sld_id)
    assert loaded is not None
    assert loaded["payload"]["nodes"] == []

    repo.update_payload(
        sld_id,
        {"nodes": [], "branches": [], "annotations": [], "dirty_flag": True},
    )
    updated = repo.get(sld_id)
    assert updated is not None
    assert updated["payload"]["dirty_flag"] is True
    session.close()
