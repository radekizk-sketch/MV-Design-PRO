from __future__ import annotations

import json
from typing import Any

from application.study_scenario.models import Run, Scenario, Snapshot, Study


def _stable_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def study_to_dict(study: Study) -> dict[str, Any]:
    return {
        "study_id": str(study.study_id),
        "name": study.name,
        "description": study.description,
        "created_at": study.created_at.isoformat(),
        "created_by": study.created_by,
        "assumptions": sorted(study.assumptions),
        "normative_profile_id": study.normative_profile_id,
        "hash": study.hash,
    }


def scenario_to_dict(scenario: Scenario) -> dict[str, Any]:
    return {
        "scenario_id": str(scenario.scenario_id),
        "study_id": str(scenario.study_id),
        "name": scenario.name,
        "description": scenario.description,
        "scenario_type": scenario.scenario_type.value,
        "switches_state_ref": scenario.switches_state_ref,
        "sources_state_ref": scenario.sources_state_ref,
        "loads_state_ref": scenario.loads_state_ref,
        "constraints_ref": scenario.constraints_ref,
        "is_base": scenario.is_base,
        "hash": scenario.hash,
    }


def run_to_dict(run: Run) -> dict[str, Any]:
    return {
        "run_id": str(run.run_id),
        "scenario_id": str(run.scenario_id),
        "created_at": run.created_at.isoformat(),
        "input_snapshot_id": str(run.input_snapshot_id) if run.input_snapshot_id else None,
        "solver_versions": dict(sorted(run.solver_versions.items())),
        "proof_set_ids": sorted(run.proof_set_ids),
        "normative_report_id": run.normative_report_id,
        "voltage_profile_view_id": run.voltage_profile_view_id,
        "protection_insight_view_id": run.protection_insight_view_id,
        "protection_curves_it_view_id": run.protection_curves_it_view_id,
        "report_p24_plus_id": run.report_p24_plus_id,
        "status": run.status.value,
    }


def snapshot_to_dict(snapshot: Snapshot) -> dict[str, Any]:
    return {
        "snapshot_id": str(snapshot.snapshot_id),
        "hash": snapshot.hash,
        "description": snapshot.description,
        "created_at": snapshot.created_at.isoformat(),
    }


def study_to_json(study: Study) -> str:
    return _stable_json(study_to_dict(study))


def scenario_to_json(scenario: Scenario) -> str:
    return _stable_json(scenario_to_dict(scenario))


def run_to_json(run: Run) -> str:
    return _stable_json(run_to_dict(run))


def snapshot_to_json(snapshot: Snapshot) -> str:
    return _stable_json(snapshot_to_dict(snapshot))
