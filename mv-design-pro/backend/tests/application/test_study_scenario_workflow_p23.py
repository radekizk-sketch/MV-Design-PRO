from __future__ import annotations

import sys
from dataclasses import FrozenInstanceError
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest

backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.study_scenario import (
    RunStatus,
    ScenarioType,
    StudyScenarioOrchestrator,
    StudyScenarioRepository,
)
from application.study_scenario.models import create_run, create_scenario, create_study
from application.study_scenario.serializer import run_to_json, scenario_to_json, study_to_json


def test_deterministic_ids_and_hashes() -> None:
    created_at = datetime(2025, 1, 5, 12, 0, tzinfo=UTC)
    study_one = create_study(
        name="Study A",
        description="Primary study",
        created_by="architect",
        assumptions=["N-1", "Load growth"],
        normative_profile_id="PN-EN",
        created_at=created_at,
    )
    study_two = create_study(
        name="Study A",
        description="Primary study",
        created_by="architect",
        assumptions=["Load growth", "N-1"],
        normative_profile_id="PN-EN",
        created_at=created_at,
    )

    assert study_one.study_id == study_two.study_id
    assert study_one.hash == study_two.hash

    scenario_one = create_scenario(
        study_id=study_one.study_id,
        name="Base",
        description="Normal operation",
        scenario_type=ScenarioType.NORMAL,
        switches_state_ref="S1",
        sources_state_ref="SRC1",
        loads_state_ref="L1",
        constraints_ref="C1",
        is_base=True,
    )
    scenario_two = create_scenario(
        study_id=study_one.study_id,
        name="Base",
        description="Normal operation",
        scenario_type=ScenarioType.NORMAL,
        switches_state_ref="S1",
        sources_state_ref="SRC1",
        loads_state_ref="L1",
        constraints_ref="C1",
        is_base=True,
    )

    assert scenario_one.scenario_id == scenario_two.scenario_id
    assert scenario_one.hash == scenario_two.hash

    run_one = create_run(
        scenario_id=scenario_one.scenario_id,
        created_at=created_at,
        input_snapshot_id=uuid4(),
        solver_versions={"pf": "1.0", "sc": "2.0"},
        proof_set_ids=["P19", "P11"],
        normative_report_id="P20-001",
        status=RunStatus.COMPLETE,
    )
    run_two = create_run(
        scenario_id=scenario_one.scenario_id,
        created_at=created_at,
        input_snapshot_id=run_one.input_snapshot_id,
        solver_versions={"sc": "2.0", "pf": "1.0"},
        proof_set_ids=["P11", "P19"],
        normative_report_id="P20-001",
        status=RunStatus.COMPLETE,
    )

    assert run_one.run_id == run_two.run_id


def test_binding_not_computed_and_immutability() -> None:
    repo = StudyScenarioRepository()
    orchestrator = StudyScenarioOrchestrator(repo)
    study = orchestrator.create_study(
        name="Study B",
        description="Scenario coverage",
        created_by="auditor",
        assumptions=["No recompute"],
        normative_profile_id=None,
    )
    scenario = orchestrator.create_scenario(
        study_id=study.study_id,
        name="Base",
        description="Normal",
        scenario_type=ScenarioType.NORMAL,
        switches_state_ref="SW",
        sources_state_ref="SRC",
        loads_state_ref="LOAD",
        constraints_ref="LIMITS",
        is_base=True,
    )

    missing_snapshot_id = uuid4()
    run_not_computed = orchestrator.attach_run(
        scenario_id=scenario.scenario_id,
        input_snapshot_id=missing_snapshot_id,
        solver_versions={"pf": "1.0"},
        proof_set_ids=["P11"],
    )

    assert scenario.study_id == study.study_id
    assert run_not_computed.scenario_id == scenario.scenario_id
    assert run_not_computed.status == RunStatus.NOT_COMPUTED

    with pytest.raises(FrozenInstanceError):
        run_not_computed.status = RunStatus.COMPLETE


def test_serialization_stability() -> None:
    created_at = datetime(2025, 1, 6, 8, 30, tzinfo=UTC)
    study = create_study(
        name="Study C",
        description="Serialization",
        created_by="qa",
        assumptions=["Stable order"],
        normative_profile_id="PN-EN",
        created_at=created_at,
    )
    scenario = create_scenario(
        study_id=study.study_id,
        name="N-1",
        description="Contingency",
        scenario_type=ScenarioType.N_1,
        switches_state_ref="SW2",
        sources_state_ref="SRC2",
        loads_state_ref="LOAD2",
        constraints_ref="LIMITS2",
        is_base=False,
    )
    run = create_run(
        scenario_id=scenario.scenario_id,
        created_at=created_at,
        input_snapshot_id=uuid4(),
        proof_set_ids=["P24", "P11"],
    )

    assert study_to_json(study) == study_to_json(study)
    assert scenario_to_json(scenario) == scenario_to_json(scenario)
    assert run_to_json(run) == run_to_json(run)
    assert '"proof_set_ids":["P11","P24"]' in run_to_json(run)
