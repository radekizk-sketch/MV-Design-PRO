from __future__ import annotations

import sys
from pathlib import Path
from uuid import uuid4

import pytest

backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.analysis_run import AnalysisRunService
from application.network_model import MultipleNetworkModelsError
from application.network_wizard import NetworkWizardService
from application.network_wizard.dtos import BranchPayload, NodePayload, SourcePayload
from infrastructure.persistence.db import create_engine_from_url, create_session_factory, init_db
from infrastructure.persistence.unit_of_work import build_uow_factory
from network_model.core import NetworkGraph, Node, NodeType, create_network_snapshot


def _build_services() -> tuple[NetworkWizardService, AnalysisRunService]:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    uow_factory = build_uow_factory(session_factory)
    return NetworkWizardService(uow_factory), AnalysisRunService(uow_factory)


def _create_basic_network(wizard: NetworkWizardService, project_id) -> None:
    slack_node = wizard.add_node(
        project_id,
        NodePayload(
            name="Slack",
            node_type="SLACK",
            base_kv=15.0,
            attrs={"voltage_magnitude_pu": 1.0, "voltage_angle_rad": 0.0},
        ),
    )
    pq_node = wizard.add_node(
        project_id,
        NodePayload(
            name="Load",
            node_type="PQ",
            base_kv=15.0,
            attrs={"active_power_mw": 1.0, "reactive_power_mvar": 0.5},
        ),
    )
    wizard.add_branch(
        project_id,
        BranchPayload(
            name="Line-1",
            branch_type="LINE",
            from_node_id=slack_node["id"],
            to_node_id=pq_node["id"],
            params={
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.2,
                "b_us_per_km": 1.0,
                "length_km": 1.0,
                "rated_current_a": 400.0,
            },
        ),
    )
    wizard.set_connection_node(project_id, slack_node["id"])
    wizard.add_source(
        project_id,
        SourcePayload(
            name="Grid",
            node_id=slack_node["id"],
            source_type="GRID",
            payload={"grid_supply": True, "u_pu": 1.0},
        ),
    )


def test_wizard_and_analysis_share_network_model_id() -> None:
    wizard, analysis = _build_services()
    project = wizard.create_project("SingleModel")
    _create_basic_network(wizard, project.id)
    case = wizard.create_operating_case(
        project.id,
        "Base",
        {"active_snapshot_id": str(uuid4())},
    )

    wizard_graph = wizard.build_network_graph(project.id, case.id)
    analysis_graph = analysis._build_network_graph(project.id, case.id)

    assert wizard_graph.network_model_id == analysis_graph.network_model_id
    assert wizard_graph.network_model_id == str(project.id)


def test_mismatched_snapshot_model_id_raises() -> None:
    wizard, analysis = _build_services()
    project = wizard.create_project("Mismatch")
    _create_basic_network(wizard, project.id)
    case = wizard.create_operating_case(
        project.id,
        "Base",
        {"active_snapshot_id": "snap-mismatch"},
    )

    graph = NetworkGraph(network_model_id="other-model")
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
    snapshot = create_network_snapshot(
        graph,
        snapshot_id="snap-mismatch",
        network_model_id="other-model",
    )
    with wizard._uow_factory() as uow:
        uow.snapshots.add_snapshot(snapshot)

    with pytest.raises(MultipleNetworkModelsError):
        analysis.create_short_circuit_run(
            project.id,
            operating_case_id=case.id,
            fault_spec={"fault_type": "THREE_PHASE", "node_id": "node-1"},
        )
