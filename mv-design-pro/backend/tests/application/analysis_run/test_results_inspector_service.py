from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.analysis_run import ResultsInspectorService
from domain.analysis_run import AnalysisRun
from domain.models import OperatingCase, Project
from domain.project_design_mode import ProjectDesignMode
from infrastructure.persistence.db import create_engine_from_url, create_session_factory, init_db
from infrastructure.persistence.repositories import (
    AnalysisRunRepository,
    CaseRepository,
    ProjectRepository,
)
from infrastructure.persistence.unit_of_work import build_uow_factory


def _build_results_inspector_service() -> tuple[ResultsInspectorService, UUID]:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    uow_factory = build_uow_factory(session_factory)

    session = session_factory()
    project_id = uuid4()
    ProjectRepository(session).add(Project(id=project_id, name="Inspector Project"))

    case_id = uuid4()
    CaseRepository(session).add_operating_case(
        OperatingCase(
            id=case_id,
            project_id=project_id,
            name="Base",
            case_payload={"base_mva": 100.0, "active_snapshot_id": str(uuid4())},
            project_design_mode=ProjectDesignMode.SN_NETWORK,
        )
    )

    now = datetime.now(UTC)
    element_id = "line-001"
    run_id = uuid4()
    AnalysisRunRepository(session).create(
        AnalysisRun(
            id=run_id,
            project_id=project_id,
            operating_case_id=case_id,
            analysis_type="short_circuit_sn",
            status="FINISHED",
            created_at=now,
            started_at=now,
            finished_at=now,
            input_snapshot={
                "snapshot_id": str(uuid4()),
                "branches": [
                    {
                        "ref_id": element_id,
                        "name": "Odcinek 1",
                        "catalog_ref": "cable-120",
                        "catalog_namespace": "KABEL_SN",
                        "catalog_version": "2026.04",
                        "materialized_params": {"r_ohm_per_km": 0.12},
                        "parameter_source": "OVERRIDE",
                        "overrides": [
                            {
                                "key": "length_km",
                                "value": 1.25,
                                "reason": "pomiar powykonawczy",
                            }
                        ],
                    }
                ],
            },
            input_hash="hash-trace",
            result_summary={"status": "FINISHED"},
            white_box_trace=[
                {
                    "key": "step-a",
                    "title": "Krok A",
                    "element_id": element_id,
                }
            ],
        )
    )
    session.close()

    return ResultsInspectorService(uow_factory), run_id


def test_get_extended_trace_exposes_catalog_provenance_on_steps() -> None:
    service, run_id = _build_results_inspector_service()

    trace = service.get_extended_trace(run_id).to_dict()

    assert trace["catalog_context_summary"] == {
        "element_count": 1,
        "by_type": {"ODCINEK_SN": 1},
        "by_parameter_origin": {"OVERRIDE": 1},
        "manual_override_element_count": 1,
        "manual_override_count": 1,
    }
    assert (
        trace["catalog_context_by_element"]["line-001"]["source_catalog_label"]
        == "KABEL_SN:cable-120@2026.04"
    )
    assert trace["white_box_trace"][0]["catalog_context_entry"]["element_id"] == "line-001"
    assert trace["white_box_trace"][0]["manual_override_count"] == 1
