from __future__ import annotations

import sys
from pathlib import Path
from uuid import UUID, uuid4

import pytest

backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.network_wizard import NetworkWizardService
from application.network_wizard.dtos import BranchPayload, NodePayload, SourcePayload
from infrastructure.persistence.db import create_engine_from_url, create_session_factory, init_db
from infrastructure.persistence.unit_of_work import build_uow_factory


def _build_service() -> NetworkWizardService:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    return NetworkWizardService(build_uow_factory(session_factory))


def _build_inverter_network(service: NetworkWizardService, project_id: UUID) -> tuple[dict, dict]:
    slack = service.add_node(
        project_id,
        NodePayload(
            name="Slack",
            node_type="SLACK",
            base_kv=15.0,
            attrs={"voltage_magnitude_pu": 1.0, "voltage_angle_rad": 0.0},
        ),
    )
    inverter_node = service.add_node(
        project_id,
        NodePayload(
            name="INV",
            node_type="PQ",
            base_kv=15.0,
            attrs={"active_power_mw": 0.0, "reactive_power_mvar": 0.0},
        ),
    )
    service.add_branch(
        project_id,
        BranchPayload(
            name="Line-1",
            branch_type="LINE",
            from_node_id=slack["id"],
            to_node_id=inverter_node["id"],
            params={
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.2,
                "length_km": 1.0,
                "rated_current_a": 400.0,
            },
        ),
    )
    service.set_connection_node(project_id, slack["id"])
    service.add_source(
        project_id,
        SourcePayload(
            name="Grid",
            node_id=slack["id"],
            source_type="GRID",
            payload={"name": "Grid", "grid_supply": True, "u_pu": 1.0},
        ),
    )
    return slack, inverter_node


def _build_converter_network(service: NetworkWizardService, project_id: UUID) -> tuple[dict, dict]:
    return _build_inverter_network(service, project_id)


def test_inverter_setpoints_stored_on_case_only() -> None:
    service = _build_service()
    project = service.create_project("InvCase")
    _, inverter_node = _build_inverter_network(service, project.id)
    source = service.add_source(
        project.id,
        SourcePayload(
            name="INV-1",
            node_id=inverter_node["id"],
            source_type="INVERTER",
            payload={"name": "INV-1"},
            type_ref=uuid4(),
        ),
    )
    case = service.create_operating_case(project.id, "Case", {"base_mva": 100.0})

    updated_case = service.set_inverter_setpoints(case.id, source["id"], p_mw=2.0, q_mvar=0.5)

    assert updated_case.case_payload["inverter_setpoints"][str(source["id"])]["p_mw"] == 2.0
    sources = service.get_sources(project.id)
    assert "p_mw" not in sources[0].payload
    assert "q_mvar" not in sources[0].payload


def test_inverter_setpoints_validation() -> None:
    service = _build_service()
    project = service.create_project("InvValidation")
    _, inverter_node = _build_inverter_network(service, project.id)
    source = service.add_source(
        project.id,
        SourcePayload(
            name="INV-1",
            node_id=inverter_node["id"],
            source_type="INVERTER",
            payload={"name": "INV-1"},
            type_ref=uuid4(),
        ),
    )
    case = service.create_operating_case(project.id, "Case", {"base_mva": 100.0})

    with pytest.raises(ValueError):
        service.set_inverter_setpoints(case.id, source["id"], p_mw=1.0)

    with pytest.raises(ValueError):
        service.set_inverter_setpoints(case.id, source["id"], p_mw=1.0, q_mvar=0.2, cosphi=0.95)


def test_converter_setpoints_stored_on_case_only() -> None:
    service = _build_service()
    project = service.create_project("ConvCase")
    _, converter_node = _build_converter_network(service, project.id)
    source = service.add_source(
        project.id,
        SourcePayload(
            name="CONV-1",
            node_id=converter_node["id"],
            source_type="CONVERTER",
            payload={"name": "CONV-1", "converter_kind": "PV"},
            type_ref=uuid4(),
        ),
    )
    case = service.create_operating_case(project.id, "Case", {"base_mva": 100.0})

    updated_case = service.set_converter_setpoints(case.id, source["id"], p_mw=2.0, q_mvar=0.5)

    assert updated_case.case_payload["converter_setpoints"][str(source["id"])]["p_mw"] == 2.0
    sources = service.get_sources(project.id)
    assert "p_mw" not in sources[0].payload
    assert "q_mvar" not in sources[0].payload


def test_converter_setpoints_validation() -> None:
    service = _build_service()
    project = service.create_project("ConvValidation")
    _, converter_node = _build_converter_network(service, project.id)
    source = service.add_source(
        project.id,
        SourcePayload(
            name="CONV-1",
            node_id=converter_node["id"],
            source_type="CONVERTER",
            payload={"name": "CONV-1", "converter_kind": "WIND"},
            type_ref=uuid4(),
        ),
    )
    case = service.create_operating_case(project.id, "Case", {"base_mva": 100.0})

    with pytest.raises(ValueError):
        service.set_converter_setpoints(case.id, source["id"], p_mw=1.0)

    with pytest.raises(ValueError):
        service.set_converter_setpoints(case.id, source["id"], p_mw=1.0, q_mvar=0.2, cosphi=0.95)
