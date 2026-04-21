from __future__ import annotations

import json
import sys
from pathlib import Path
from uuid import UUID, uuid4

# Add backend/src to path for imports
backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.network_wizard import NetworkWizardService
from application.network_wizard.dtos import (
    BranchPayload,
    LoadPayload,
    NodePayload,
    SourcePayload,
)
from infrastructure.persistence.db import create_engine_from_url, create_session_factory, init_db
from infrastructure.persistence.unit_of_work import build_uow_factory


def _build_service() -> NetworkWizardService:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    return NetworkWizardService(build_uow_factory(session_factory))


def _create_basic_network(service: NetworkWizardService, project_id: UUID) -> tuple[dict, dict]:
    slack_node = service.add_node(
        project_id,
        NodePayload(
            name="Slack",
            node_type="SLACK",
            base_kv=15.0,
            attrs={
                "voltage_magnitude_pu": 1.0,
                "voltage_angle_rad": 0.0,
            },
        ),
    )
    pq_node = service.add_node(
        project_id,
        NodePayload(
            name="Load",
            node_type="PQ",
            base_kv=15.0,
            attrs={
                "active_power_mw": 5.0,
                "reactive_power_mvar": 2.0,
            },
        ),
    )
    service.add_branch(
        project_id,
        BranchPayload(
            name="Line-1",
            branch_type="LINE",
            from_node_id=slack_node["id"],
            to_node_id=pq_node["id"],
            params={
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.2,
                "length_km": 1.0,
            },
        ),
    )
    return slack_node, pq_node


def test_network_wizard_happy_path() -> None:
    service = _build_service()
    project = service.create_project("MV Project", "Happy path")

    slack_node, _ = _create_basic_network(service, project.id)
    service.set_connection_node(project.id, slack_node["id"])
    service.add_source(
        project.id,
        SourcePayload(
            name="Utility",
            node_id=slack_node["id"],
            source_type="GRID",
            payload={"name": "Utility", "grid_supply": True, "u_pu": 1.0},
        ),
    )
    service.add_load(
        project.id,
        LoadPayload(
            name="Load",
            node_id=slack_node["id"],
            payload={"name": "Load", "p_mw": 1.0, "q_mvar": 0.5},
        ),
    )
    operating_case = service.create_operating_case(project.id, "Normal", {"base_mva": 100.0})

    report = service.validate_network(project.id, operating_case.id)
    assert report.is_valid

    export_payload = service.export_network(project.id)
    new_project = service.create_project("Imported")
    import_report = service.import_network(new_project.id, export_payload)

    assert import_report.validation is not None
    assert import_report.validation.is_valid


def test_network_wizard_validation_errors() -> None:
    service = _build_service()
    project = service.create_project("Errors")

    node = service.add_node(
        project.id,
        NodePayload(
            name="Slack",
            node_type="SLACK",
            base_kv=-15.0,
            attrs={"voltage_magnitude_pu": 1.0, "voltage_angle_rad": 0.0},
        ),
    )
    missing_node_id = uuid4()
    service.add_branch(
        project.id,
        BranchPayload(
            name="Line",
            branch_type="LINE",
            from_node_id=node["id"],
            to_node_id=missing_node_id,
            params={
                "r_ohm_per_km": -0.1,
                "x_ohm_per_km": 0.2,
                "length_km": 1.0,
            },
        ),
    )

    report = service.validate_network(project.id)
    codes = {issue.code for issue in report.errors}
    assert "branch.to_missing" in codes
    assert "connection_node.missing" in codes
    assert "node.base_kv" in codes
    assert "branch.param_positive" in codes


def test_network_wizard_import_csv() -> None:
    service = _build_service()
    project = service.create_project("CSV")
    node_id = uuid4()

    nodes_csv = (
        "id,name,node_type,base_kv,attrs_json\n"
        f'{node_id},Slack,SLACK,15.0,{{"voltage_magnitude_pu":1.0,"voltage_angle_rad":0.0}}\n'
        ' ,Load,PQ,15.0,{"active_power_mw":5.0,"reactive_power_mvar":2.0}\n'
    )
    branches_csv = (
        "id,name,branch_type,from_node_id,to_node_id,in_service,params_json\n"
        f',Line-1,LINE,{node_id},{node_id},true,{{"r_ohm_per_km":0.1,"x_ohm_per_km":0.2,"length_km":1.0}}\n'
    )

    report = service.import_nodes_branches_from_csv(project.id, nodes_csv, branches_csv)
    assert report.created.get("nodes") == 2
    assert report.created.get("branches") == 1

    updated_nodes_csv = (
        "id,name,node_type,base_kv,attrs_json\n"
        f'{node_id},Slack-Updated,SLACK,15.0,{{"voltage_magnitude_pu":1.0,"voltage_angle_rad":0.0}}\n'
    )
    update_report = service.import_nodes_branches_from_csv(
        project.id,
        updated_nodes_csv,
        "id,name,branch_type,from_node_id,to_node_id,in_service,params_json\n",
    )
    assert update_report.updated.get("nodes") == 1


def test_network_wizard_export_determinism() -> None:
    service = _build_service()
    project = service.create_project("Determinism")
    slack_node, _ = _create_basic_network(service, project.id)
    service.set_connection_node(project.id, slack_node["id"])
    service.add_source(
        project.id,
        SourcePayload(
            name="Utility",
            node_id=slack_node["id"],
            source_type="GRID",
            payload={"name": "Utility", "grid_supply": True, "u_pu": 1.0},
        ),
    )

    payload_first = service.export_network(project.id)
    payload_second = service.export_network(project.id)

    assert json.dumps(payload_first, sort_keys=True) == json.dumps(payload_second, sort_keys=True)


def test_build_short_circuit_input_fault_spec() -> None:
    service = _build_service()
    project = service.create_project("FaultSpec")
    slack_node, _ = _create_basic_network(service, project.id)
    service.set_connection_node(project.id, slack_node["id"])
    service.add_source(
        project.id,
        SourcePayload(
            name="Utility",
            node_id=slack_node["id"],
            source_type="GRID",
            payload={"name": "Utility", "grid_supply": True, "u_pu": 1.0},
        ),
    )
    case = service.create_operating_case(project.id, "Normal", {"base_mva": 100.0})

    fault_spec = {"fault_type": "3F", "node_id": str(slack_node["id"])}
    sc_input = service.build_short_circuit_input(project.id, case.id, fault_spec)

    assert sc_input.connection_node_id == str(slack_node["id"])


def test_case_switching_state_overrides_branch() -> None:
    service = _build_service()
    project = service.create_project("Switching")
    slack_node, pq_node = _create_basic_network(service, project.id)
    service.set_connection_node(project.id, slack_node["id"])
    service.add_source(
        project.id,
        SourcePayload(
            name="Utility",
            node_id=slack_node["id"],
            source_type="GRID",
            payload={"name": "Utility", "grid_supply": True, "u_pu": 1.0},
        ),
    )
    case = service.create_operating_case(project.id, "Normal", {"base_mva": 100.0})

    branch_id = service.export_network(project.id)["branches"][0]["id"]
    service.set_case_switching(case.id, UUID(branch_id), False, element_type="branch")

    assert service.get_effective_in_service(project.id, case.id, UUID(branch_id)) is False
