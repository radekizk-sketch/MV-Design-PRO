from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

# Add backend/src to path for imports
backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.wizard_actions import WizardActionService
from domain.models import OperatingCase, Project
from infrastructure.persistence.db import create_engine_from_url, create_session_factory, init_db
from infrastructure.persistence.repositories import (
    CaseRepository,
    ProjectRepository,
    SnapshotRepository,
)
from infrastructure.persistence.unit_of_work import build_uow_factory
from network_model.core import NetworkGraph, Node, NodeType
from network_model.core.snapshot import NetworkSnapshot, SnapshotMeta


def _build_snapshot(snapshot_id: str, created_at: str, network_model_id: str) -> NetworkSnapshot:
    graph = NetworkGraph(network_model_id=network_model_id)
    graph.add_node(
        Node(
            id="node-1",
            name="Node 1",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    meta = SnapshotMeta.create(
        snapshot_id=snapshot_id,
        created_at=created_at,
        schema_version="1.0",
        network_model_id=network_model_id,
    )
    return NetworkSnapshot(meta=meta, graph=graph)


def _build_service(tmp_path):
    db_path = tmp_path / "wizard_actions.db"
    engine = create_engine_from_url(f"sqlite+pysqlite:///{db_path}")
    init_db(engine)
    session_factory = create_session_factory(engine)
    uow_factory = build_uow_factory(session_factory)

    project = Project(id=uuid4(), name="Wizard Project")
    network_model_id = str(project.id)
    snapshot = _build_snapshot("snap-1", "2024-01-01T00:00:00+00:00", network_model_id)
    case = OperatingCase(
        id=uuid4(),
        project_id=project.id,
        name="Base",
        case_payload={"active_snapshot_id": snapshot.meta.snapshot_id},
    )

    session = session_factory()
    ProjectRepository(session).add(project)
    SnapshotRepository(session).add_snapshot(snapshot)
    CaseRepository(session).add_operating_case(case)
    session.close()

    return WizardActionService(uow_factory), case, session_factory


def test_build_action_is_deterministic_for_same_payload(tmp_path) -> None:
    service, case, _session_factory = _build_service(tmp_path)
    payload = {
        "action_id": "action-1",
        "action_type": "create_node",
        "payload": {
            "node_id": "node-2",
            "name": "Node 2",
            "node_type": "PQ",
            "voltage_level": 15.0,
            "active_power": 1.0,
            "reactive_power": 0.5,
        },
        "created_at": datetime(2024, 1, 3, tzinfo=UTC).isoformat(),
    }

    first = service.build_action(case.id, payload)
    second = service.build_action(case.id, payload)

    assert first == second
    assert first.parent_snapshot_id == case.case_payload["active_snapshot_id"]


def test_submit_batch_persists_snapshot_and_updates_case(tmp_path) -> None:
    service, case, session_factory = _build_service(tmp_path)
    payload = {
        "action_id": "action-1",
        "action_type": "create_node",
        "payload": {
            "node_id": "node-2",
            "name": "Node 2",
            "node_type": "PQ",
            "voltage_level": 15.0,
            "active_power": 1.0,
            "reactive_power": 0.5,
        },
        "created_at": datetime(2024, 1, 3, tzinfo=UTC).isoformat(),
    }

    result = service.submit_batch(case.id, [payload])

    assert result.status == "accepted"
    assert result.new_snapshot_id is not None

    case_session = session_factory()
    case_repo = CaseRepository(case_session)
    updated_case = case_repo.get_operating_case(case.id)
    case_session.close()
    assert updated_case is not None
    assert updated_case.case_payload["active_snapshot_id"] == result.new_snapshot_id

    snapshot_session = session_factory()
    snapshot_repo = SnapshotRepository(snapshot_session)
    stored = snapshot_repo.get_snapshot(result.new_snapshot_id)
    snapshot_session.close()
    assert stored is not None
    assert "node-2" in stored.graph.nodes
