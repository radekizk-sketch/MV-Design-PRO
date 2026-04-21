from __future__ import annotations

import sys
from pathlib import Path
from uuid import UUID

# Add backend/src to path for imports
backend_src = Path(__file__).parents[4] / "src"
sys.path.insert(0, str(backend_src))

from application.analyses.design_synth.pipeline import run_connection_study
from application.analyses.design_synth.service import DesignSynthService
from application.network_wizard.service import NetworkWizardService

from tests.utils.determinism import assert_deterministic


def _create_case(wizard: NetworkWizardService) -> UUID:
    project = wizard.create_project("DesignSynth")
    case = wizard.create_operating_case(project.id, "Case", {"base_mva": 100.0})
    return case.id


def test_design_synth_m3_evidence_trace_deterministic(uow_factory) -> None:
    wizard = NetworkWizardService(uow_factory)
    service = DesignSynthService(uow_factory)
    case_id = _create_case(wizard)

    spec_payload = {
        "connection_node": {"id": "BoundaryNode-1", "voltage_kv": 15.0, "grid_supply": True},
        "constraints": {"voltage_drop_max_pct": 3.0},
        "assumptions": {"ambient_temp_c": 25},
    }

    first = run_connection_study(
        case_id,
        "snap-1",
        spec_payload,
        uow_factory=uow_factory,
    )
    second = run_connection_study(
        case_id,
        "snap-1",
        spec_payload,
        uow_factory=uow_factory,
    )

    first_evidence = service.get_evidence(first.design_evidence_id).evidence_json
    second_evidence = service.get_evidence(second.design_evidence_id).evidence_json

    for evidence_json in (first_evidence, second_evidence):
        assert set(evidence_json.keys()) == {
            "inputs",
            "transformations",
            "outputs",
            "refs",
            "meta",
        }
        assert evidence_json["inputs"]["connection_node"]["id"] == "BoundaryNode-1"
        assert evidence_json["meta"]["schema_version"] == "M3"
        assert evidence_json["outputs"]["report_fingerprint"]

    assert (
        first_evidence["outputs"]["report_fingerprint"]
        == second_evidence["outputs"]["report_fingerprint"]
    )

    expected_step_names = [
        "normalize_spec",
        "generate_proposal",
        "build_report",
        "persist_artifacts",
    ]
    assert [step["name"] for step in first_evidence["transformations"]] == expected_step_names

    assert_deterministic(
        first_evidence,
        second_evidence,
        scrub_keys=(),
        scrub_paths=(
            "meta.created_at_utc",
            "outputs.design_spec_id",
            "outputs.design_proposal_id",
            "refs.artifact_refs.*.id",
        ),
    )
