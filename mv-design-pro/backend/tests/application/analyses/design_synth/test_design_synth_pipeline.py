from __future__ import annotations

import sys
from pathlib import Path
from uuid import UUID

# Add backend/src to path for imports
backend_src = Path(__file__).parents[4] / "src"
sys.path.insert(0, str(backend_src))

from application.analyses.design_synth.canonical import canonicalize_json
from application.analyses.design_synth.pipeline import run_connection_study
from application.analyses.design_synth.reporting import BoundaryNode_SECTION_TITLE
from application.analyses.design_synth.service import DesignSynthService
from application.network_wizard import NetworkWizardService
from infrastructure.persistence.db import create_engine_from_url, create_session_factory, init_db
from infrastructure.persistence.unit_of_work import build_uow_factory


def _build_uow_factory() -> tuple[callable, NetworkWizardService, DesignSynthService]:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    uow_factory = build_uow_factory(session_factory)
    return uow_factory, NetworkWizardService(uow_factory), DesignSynthService(uow_factory)


def _create_case(wizard: NetworkWizardService) -> UUID:
    project = wizard.create_project("DesignSynth")
    case = wizard.create_operating_case(project.id, "Case", {"base_mva": 100.0})
    return case.id


def test_design_synth_pipeline_end_to_end() -> None:
    uow_factory, wizard, service = _build_uow_factory()
    case_id = _create_case(wizard)

    spec_payload = {
        "connection_node": {"id": "BoundaryNode-1", "voltage_kv": 15.0, "grid_supply": True},
        "constraints": {"voltage_drop_max_pct": 3.0},
        "assumptions": {"ambient_temp_c": 25},
    }

    result = run_connection_study(
        case_id,
        "snap-1",
        spec_payload,
        uow_factory=uow_factory,
    )

    assert service.get_spec(result.design_spec_id).case_id == case_id
    assert service.get_proposal(result.design_proposal_id).case_id == case_id
    assert service.get_evidence(result.design_evidence_id).case_id == case_id

    report = result.report_json
    assert BoundaryNode_SECTION_TITLE in report
    assert report[BoundaryNode_SECTION_TITLE]["id"] == "BoundaryNode-1"

    second_result = run_connection_study(
        case_id,
        "snap-1",
        spec_payload,
        uow_factory=uow_factory,
    )

    assert report["fingerprint"] == second_result.report_json["fingerprint"]
    assert canonicalize_json(report) == canonicalize_json(second_result.report_json)
