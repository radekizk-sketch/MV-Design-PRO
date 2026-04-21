from __future__ import annotations

import sys
from pathlib import Path
from uuid import UUID, uuid5

backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.network_wizard import NetworkWizardService
from application.network_wizard.dtos import BranchPayload, NodePayload
from infrastructure.persistence.db import create_engine_from_url, create_session_factory, init_db
from infrastructure.persistence.unit_of_work import build_uow_factory


def _build_service() -> NetworkWizardService:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    return NetworkWizardService(build_uow_factory(session_factory))


def _create_basic_network(
    service: NetworkWizardService, project_id: UUID
) -> tuple[dict, dict, dict]:
    slack_node = service.add_node(
        project_id,
        NodePayload(
            name="Slack",
            node_type="SLACK",
            base_kv=15.0,
            attrs={"voltage_magnitude_pu": 1.0, "voltage_angle_rad": 0.0},
        ),
    )
    load_node = service.add_node(
        project_id,
        NodePayload(
            name="Load",
            node_type="PQ",
            base_kv=15.0,
            attrs={"active_power_mw": 2.0, "reactive_power_mvar": 1.0},
        ),
    )
    branch = service.add_branch(
        project_id,
        BranchPayload(
            name="Line",
            branch_type="LINE",
            from_node_id=slack_node["id"],
            to_node_id=load_node["id"],
            params={"r_ohm_per_km": 0.1, "x_ohm_per_km": 0.2, "length_km": 1.0},
        ),
    )
    service.set_connection_node(project_id, slack_node["id"])
    return slack_node, load_node, branch


def test_sld_binding_nodes_and_branches() -> None:
    service = _build_service()
    project = service.create_project("SLD")
    slack_node, load_node, branch = _create_basic_network(service, project.id)

    diagram_id = service.create_sld(project.id, "Main")
    payload = service.export_sld(project.id, diagram_id)

    node_ids = {str(slack_node["id"]), str(load_node["id"])}
    branch_ids = {str(branch["id"])}

    payload_node_ids = {str(item["node_id"]) for item in payload.get("nodes", [])}
    payload_branch_ids = {str(item["branch_id"]) for item in payload.get("branches", [])}

    assert payload_node_ids == node_ids
    assert payload_branch_ids == branch_ids
    # NOTE: is_connection_node was removed from SldNodeSymbol.
    # BoundaryNode – węzeł przyłączenia is interpretation, not stored data.


def test_sld_export_import_roundtrip() -> None:
    service = _build_service()
    project = service.create_project("SLD Export")
    _create_basic_network(service, project.id)

    diagram_id = service.create_sld(project.id, "Main")
    payload = service.export_sld(project.id, diagram_id)

    imported_project = service.create_project("SLD Import")
    imported_diagram_id = service.import_sld(imported_project.id, payload)
    imported_payload = service.export_sld(imported_project.id, imported_diagram_id)

    expected_payload = _payload_with_diagram_ids(payload, imported_diagram_id)
    assert imported_payload == expected_payload


def _payload_with_diagram_ids(payload: dict, diagram_id: UUID) -> dict:
    updated = dict(payload)
    nodes = []
    for node in payload.get("nodes", []):
        node_id = UUID(str(node["node_id"]))
        updated_node = dict(node)
        updated_node["id"] = str(uuid5(diagram_id, f"node:{node_id}"))
        nodes.append(updated_node)
    branches = []
    for branch in payload.get("branches", []):
        branch_id = UUID(str(branch["branch_id"]))
        updated_branch = dict(branch)
        updated_branch["id"] = str(uuid5(diagram_id, f"branch:{branch_id}"))
        branches.append(updated_branch)
    updated["nodes"] = nodes
    updated["branches"] = branches
    return updated
