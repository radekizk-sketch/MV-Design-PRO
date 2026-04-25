from __future__ import annotations

import json
import sys
from pathlib import Path
from uuid import UUID, uuid4

import pytest

# Add backend/src to path for imports
backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.analysis_run import AnalysisRunService
from application.network_wizard import NetworkWizardService
from application.network_wizard.dtos import (
    BranchPayload,
    LoadPayload,
    NodePayload,
    SourcePayload,
)
from domain.project_design_mode import ProjectDesignMode
from infrastructure.persistence.db import create_engine_from_url, create_session_factory, init_db
from infrastructure.persistence.unit_of_work import build_uow_factory
from network_model.validation import (
    ValidationIssue as ModelValidationIssue,
)
from network_model.validation import (
    ValidationReport as ModelValidationReport,
)


def _build_services() -> tuple[NetworkWizardService, AnalysisRunService]:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    uow_factory = build_uow_factory(session_factory)
    return NetworkWizardService(uow_factory), AnalysisRunService(uow_factory)


def _create_basic_network(wizard: NetworkWizardService, project_id: UUID) -> tuple[dict, dict]:
    slack_node = wizard.add_node(
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
    pq_node = wizard.add_node(
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
            },
        ),
    )
    return slack_node, pq_node


def _add_grid_source(wizard: NetworkWizardService, project_id: UUID, node_id: UUID) -> None:
    wizard.add_source(
        project_id,
        SourcePayload(
            name="Grid",
            node_id=node_id,
            source_type="GRID",
            payload={"name": "Grid", "grid_supply": True, "u_pu": 1.0},
        ),
    )


def test_analysis_run_lifecycle_pf() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("PF")
    slack_node, pq_node = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    wizard.add_load(
        project.id,
        LoadPayload(
            name="Load",
            node_id=pq_node["id"],
            payload={"name": "Load", "p_mw": 1.0, "q_mvar": 0.5},
        ),
    )
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    run = service.create_power_flow_run(project.id, case.id)
    executed = service.execute_run(run.id)

    assert executed.status == "FINISHED"
    assert executed.result_status == "VALID"
    assert executed.completeness_status == "complete"
    assert executed.proof_pack_ref is not None
    assert executed.analysis_case_context["case_ref"] == str(case.id)
    assert executed.reproducibility["results_contract_version"] == "V12.5"
    assert executed.reproducibility["case_ref"] == str(case.id)
    assert executed.reproducibility["enm_hash"] == run.input_snapshot["snapshot_id"]
    assert executed.reproducibility["snapshot_ref"] == run.input_snapshot["snapshot_id"]
    assert executed.reproducibility["variant_ref"] == "variant.uklad_normalny"
    assert executed.reproducibility["switching_snapshot_ref"] == "switching.uklad_normalny.base"
    assert executed.reproducibility["catalog_materialization_status"] == "placeholder"
    assert executed.reproducibility["catalog_materialization_ref"].endswith(
        run.input_snapshot["snapshot_id"]
    )
    assert (
        executed.reproducibility["catalog_materialization_contract_version"]
        == "catalog_materialization_v1"
    )
    assert executed.reproducibility["report_contract_version"] == "analysis_report_v2"
    assert executed.reproducibility["result_rules_version"] == "result_rules_v12_5"
    assert executed.started_at is not None
    assert executed.finished_at is not None

    persisted = service.get_run(run.id)
    assert persisted.analysis_case_context["proof_pack_ref"] == executed.proof_pack_ref
    assert persisted.reproducibility["input_hash"] == executed.input_hash
    assert persisted.export_artifacts == []

    repeat = service.create_power_flow_run(project.id, case.id)
    assert repeat.id != run.id


def test_analysis_run_lifecycle_sc() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("SC")
    slack_node, _ = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    _add_grid_source(wizard, project.id, slack_node["id"])
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    fault_spec = {"fault_type": "3F", "node_id": str(slack_node["id"])}
    run = service.create_short_circuit_run(project.id, case.id, fault_spec)
    executed = service.execute_run(run.id)

    results = service.get_results(run.id)
    payload = results[0]["payload"]

    assert executed.status == "FINISHED"
    assert executed.result_status == "VALID"
    assert executed.completeness_status == "complete"
    assert executed.analysis_case_context["rodzaj_przypadku"] == "ZWARCIOWY_MAKS"
    assert executed.proof_pack_ref is not None
    assert executed.result_summary
    assert results
    assert run.input_snapshot["snapshot_id"] == case.case_payload["active_snapshot_id"]
    assert "white_box_trace" in payload
    assert payload["white_box_trace"]


def test_result_invalidation_on_network_change() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("Invalidate")
    slack_node, pq_node = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    wizard.add_load(
        project.id,
        LoadPayload(
            name="Load",
            node_id=pq_node["id"],
            payload={"name": "Load", "p_mw": 1.0, "q_mvar": 0.5},
        ),
    )
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    run = service.create_power_flow_run(project.id, case.id)
    executed = service.execute_run(run.id)
    assert executed.result_status == "VALID"

    wizard.add_node(
        project.id,
        NodePayload(
            name="New",
            node_type="PQ",
            base_kv=15.0,
            attrs={"active_power_mw": 0.5, "reactive_power_mvar": 0.2},
        ),
    )

    updated = service.get_run(run.id)
    assert updated.result_status == "OUTDATED"


def test_result_status_after_recalculate_and_case_change() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("Recalculate")
    slack_node, pq_node = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    wizard.add_load(
        project.id,
        LoadPayload(
            name="Load",
            node_id=pq_node["id"],
            payload={"name": "Load", "p_mw": 1.0, "q_mvar": 0.5},
        ),
    )
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    run = service.create_power_flow_run(project.id, case.id)
    executed = service.execute_run(run.id)
    assert executed.result_status == "VALID"

    wizard.update_operating_case(
        project.id,
        case.id,
        {
            "case_payload": {
                "base_mva": 110.0,
                "active_snapshot_id": case.case_payload["active_snapshot_id"],
            }
        },
    )
    unchanged = service.get_run(run.id)
    assert unchanged.result_status == "VALID"

    wizard.set_in_service(project.id, pq_node["id"], False)
    outdated = service.get_run(run.id)
    assert outdated.result_status == "OUTDATED"

    follow_up = service.create_power_flow_run(project.id, case.id)
    follow_executed = service.execute_run(follow_up.id)
    assert follow_executed.result_status == "VALID"


def test_network_validator_blocks_invalid_model() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("Invalid Network")
    wizard.add_node(
        project.id,
        NodePayload(
            name="PQ",
            node_type="PQ",
            base_kv=15.0,
            attrs={"active_power_mw": 1.0, "reactive_power_mvar": 0.5},
        ),
    )
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    run = service.create_power_flow_run(project.id, case.id)
    executed = service.execute_run(run.id)

    assert executed.status == "FAILED"
    payload = json.loads(executed.error_message or "{}")
    error_codes = {item["code"] for item in payload.get("errors", [])}
    assert "network.no_slack" in error_codes
    assert "network.validation_blocked" in error_codes


def test_network_validator_warning_allows_solver(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    wizard, service = _build_services()
    project = wizard.create_project("Warning Network")
    slack_node, pq_node = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    _add_grid_source(wizard, project.id, slack_node["id"])
    wizard.add_load(
        project.id,
        LoadPayload(
            name="Load",
            node_id=pq_node["id"],
            payload={"name": "Load", "p_mw": 1.0, "q_mvar": 0.5},
        ),
    )
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    warning_report = ModelValidationReport().with_warning(
        ModelValidationIssue(
            code="network.warning",
            message="Test warning",
        )
    )

    def _warning_only(self, graph):
        return warning_report

    monkeypatch.setattr(
        "network_model.validation.validator.NetworkValidator.validate",
        _warning_only,
        raising=True,
    )

    run = service.create_power_flow_run(project.id, case.id)
    executed = service.execute_run(run.id)

    assert executed.status == "FINISHED"


def test_validation_missing_slack() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("Missing Slack")
    wizard.add_node(
        project.id,
        NodePayload(
            name="PQ",
            node_type="PQ",
            base_kv=15.0,
            attrs={"active_power_mw": 1.0, "reactive_power_mvar": 0.5},
        ),
    )
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    run = service.create_power_flow_run(project.id, case.id)
    executed = service.execute_run(run.id)

    assert executed.status == "FAILED"
    assert executed.error_message


def test_validation_missing_connection_node() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("Missing BoundaryNode")
    slack_node, _ = _create_basic_network(wizard, project.id)
    _add_grid_source(wizard, project.id, slack_node["id"])
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    fault_spec = {"fault_type": "3F", "node_id": str(slack_node["id"])}
    run = service.create_short_circuit_run(project.id, case.id, fault_spec)
    executed = service.execute_run(run.id)

    assert executed.status == "FAILED"
    assert executed.error_message


def test_failed_run_sets_status(monkeypatch: pytest.MonkeyPatch) -> None:
    wizard, service = _build_services()
    project = wizard.create_project("Solver Failure")
    slack_node, pq_node = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    wizard.add_load(
        project.id,
        LoadPayload(
            name="Load",
            node_id=pq_node["id"],
            payload={"name": "Load", "p_mw": 1.0, "q_mvar": 0.5},
        ),
    )
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    run = service.create_power_flow_run(project.id, case.id)

    def _boom(self, pf_input):
        raise RuntimeError("boom")

    monkeypatch.setattr("analysis.power_flow.solver.PowerFlowSolver.solve", _boom, raising=True)

    executed = service.execute_run(run.id)

    assert executed.status == "FAILED"
    assert executed.finished_at is not None
    assert "boom" in (executed.error_message or "")


def test_short_circuit_blocked_in_nn_mode() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("Gate NN")
    slack_node, _ = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    _add_grid_source(wizard, project.id, slack_node["id"])
    case = wizard.create_operating_case(
        project.id,
        "NN Case",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.NN_NETWORK.value,
        },
    )

    fault_spec = {"fault_type": "3F", "node_id": str(slack_node["id"])}
    run = service.create_short_circuit_run(project.id, case.id, fault_spec)
    executed = service.execute_run(run.id)

    assert executed.status == "FAILED"
    payload = json.loads(executed.error_message or "{}")
    assert payload["errors"][0]["code"] == "project_design_mode.forbidden"


def test_short_circuit_requires_grid_supply_flag() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("SC Grid Supply")
    slack_node, _ = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    wizard.add_source(
        project.id,
        SourcePayload(
            name="Grid",
            node_id=slack_node["id"],
            source_type="GRID",
            payload={"name": "Grid"},
        ),
    )
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    fault_spec = {"fault_type": "3F", "node_id": str(slack_node["id"])}
    run = service.create_short_circuit_run(project.id, case.id, fault_spec)
    executed = service.execute_run(run.id)

    assert executed.status == "FAILED"
    payload = json.loads(executed.error_message or "{}")
    assert payload["errors"][0]["code"] == "source.grid_supply_missing"


def test_fault_loop_blocked_in_sn_mode() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("Gate SN")
    slack_node, _ = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    _add_grid_source(wizard, project.id, slack_node["id"])
    case = wizard.create_operating_case(
        project.id,
        "SN Case",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    run = service.create_fault_loop_run(project.id, case.id)
    executed = service.execute_run(run.id)

    assert executed.status == "FAILED"
    payload = json.loads(executed.error_message or "{}")
    assert payload["errors"][0]["code"] == "WRONG_DESIGN_MODE"


def test_fault_loop_missing_nn_inputs_fails() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("NN Missing Inputs")
    _create_basic_network(wizard, project.id)
    case = wizard.create_operating_case(
        project.id,
        "NN Case",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.NN_NETWORK.value,
        },
    )

    run = service.create_fault_loop_run(project.id, case.id)
    executed = service.execute_run(run.id)

    assert executed.status == "FAILED"
    payload = json.loads(executed.error_message or "{}")
    assert payload["errors"][0]["code"] == "NN_INPUT_MISSING"


def test_fault_loop_nn_solver_stubbed() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("NN Stub")
    _create_basic_network(wizard, project.id)
    case = wizard.create_operating_case(
        project.id,
        "NN Case",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.NN_NETWORK.value,
            "nn_inputs": {
                "network_type": "TN",
                "protection_arrangement": "PE",
                "protective_devices": [{"id": "device-1"}],
            },
        },
    )

    run = service.create_fault_loop_run(project.id, case.id)
    executed = service.execute_run(run.id)

    assert executed.status == "FAILED"
    payload = json.loads(executed.error_message or "{}")
    assert payload["errors"][0]["code"] == "NN_SOLVER_NOT_IMPLEMENTED"


def test_fault_loop_nn_deterministic_error_payload() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("NN Determinism")
    _create_basic_network(wizard, project.id)
    case = wizard.create_operating_case(
        project.id,
        "NN Case",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.NN_NETWORK.value,
            "nn_inputs": {
                "network_type": "TT",
                "protection_arrangement": "PEN",
                "protective_devices": [{"id": "device-1"}],
            },
        },
    )

    run = service.create_fault_loop_run(project.id, case.id)
    first = service.execute_run(run.id)
    second = service.execute_run(run.id)

    assert first.status == "FAILED"
    assert second.status == "FAILED"
    assert json.loads(first.error_message or "{}") == json.loads(second.error_message or "{}")


def test_missing_project_design_mode_fails() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("Missing Mode")
    slack_node, _ = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    _add_grid_source(wizard, project.id, slack_node["id"])
    case = wizard.create_operating_case(
        project.id,
        "Missing Mode Case",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
        },
    )

    fault_spec = {"fault_type": "3F", "node_id": str(slack_node["id"])}
    run = service.create_short_circuit_run(project.id, case.id, fault_spec)
    executed = service.execute_run(run.id)

    assert executed.status == "FAILED"
    payload = json.loads(executed.error_message or "{}")
    assert payload["errors"][0]["code"] == "project_design_mode.missing"


def test_short_circuit_results_are_deterministic() -> None:
    wizard, service = _build_services()
    project = wizard.create_project("Determinism")
    slack_node, _ = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    _add_grid_source(wizard, project.id, slack_node["id"])
    case = wizard.create_operating_case(
        project.id,
        "Determinism Case",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )

    fault_spec = {"fault_type": "3F", "node_id": str(slack_node["id"])}
    run = service.create_short_circuit_run(project.id, case.id, fault_spec)
    first = service.execute_run(run.id)
    first_results = service.get_results(run.id)
    second = service.execute_run(run.id)
    second_results = service.get_results(run.id)

    assert first.status == "FINISHED"
    assert second.status == "FINISHED"
    assert first_results == second_results
