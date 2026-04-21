from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

# Add backend/src to path for imports
backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.wizard_runtime import WizardService
from application.wizard_runtime.service import _deterministic_snapshot_id
from domain.models import new_project
from infrastructure.persistence.db import create_engine_from_url, create_session_factory, init_db
from infrastructure.persistence.repositories import SnapshotRepository
from infrastructure.persistence.unit_of_work import build_uow_factory
from network_model.core import NetworkGraph, Node, NodeType
from network_model.core.action_envelope import ActionEnvelope
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
    db_path = tmp_path / "wizard_runtime.db"
    engine = create_engine_from_url(f"sqlite+pysqlite:///{db_path}")
    init_db(engine)
    session_factory = create_session_factory(engine)
    uow_factory = build_uow_factory(session_factory)

    project = new_project(name="Wizard Project")
    network_model_id = str(project.id)
    snapshot_one = _build_snapshot("snap-1", "2024-01-01T00:00:00+00:00", network_model_id)
    snapshot_two = _build_snapshot("snap-2", "2024-01-02T00:00:00+00:00", network_model_id)

    with uow_factory() as uow:
        uow.projects.add(project, commit=False)
        uow.snapshots.add_snapshot(snapshot_one, commit=False)
        uow.snapshots.add_snapshot(snapshot_two, commit=False)

    return WizardService(uow_factory), project, session_factory


def test_start_session_uses_latest_snapshot(tmp_path) -> None:
    service, project, _session_factory = _build_service(tmp_path)

    session = service.start_session(project.id)

    assert session.base_snapshot_id == "snap-2"
    assert session.project_id == project.id


def test_submit_action_and_commit_persists_snapshot(tmp_path) -> None:
    service, project, session_factory = _build_service(tmp_path)
    session = service.start_session(project.id)

    envelope = ActionEnvelope(
        action_id="action-1",
        parent_snapshot_id=session.base_snapshot_id,
        action_type="create_node",
        payload={
            "id": "node-2",
            "name": "Node 2",
            "node_type": "PQ",
            "voltage_level": 15.0,
            "active_power": 1.0,
            "reactive_power": 0.5,
        },
        created_at=datetime(2024, 1, 3, tzinfo=UTC).isoformat(),
    )

    result = service.submit_action(session.wizard_session_id, envelope)

    assert result.status == "accepted"
    preview = service.preview(session.wizard_session_id)
    assert "node-2" in preview.graph.nodes

    committed = service.commit(session.wizard_session_id)

    expected_snapshot_id = _deterministic_snapshot_id(
        session.base_snapshot_id,
        ["action-1"],
    )
    assert committed.meta.snapshot_id == expected_snapshot_id
    assert committed.meta.parent_snapshot_id == session.base_snapshot_id

    repo = SnapshotRepository(session_factory())
    stored = repo.get_snapshot(expected_snapshot_id)
    assert stored is not None
    assert "node-2" in stored.graph.nodes
